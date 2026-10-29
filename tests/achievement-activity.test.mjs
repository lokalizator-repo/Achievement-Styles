import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['frontend/achievement-activity.ts'], bundle: true, write: false, format: 'esm' });
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const account = '76561198000000001';
const event = (id = 'FIRST', achieved = true) => ({ unAppID: 42, achievement: { strID: id, strName: `Achievement ${id}`, strDescription: 'Real description', strImage: 'steam-icon', bAchieved: achieved } });
const entry = (id, earnedAt = 1) => ({ appid: 42, earnedAt, game: 'Real game', achievement: { strID: id, strName: id, bAchieved: true } });
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };

function host(storage = {}) {
  let callback;
  let unregisters = 0;
  const writes = [];
  globalThis.window = {
    App: { m_CurrentUser: { strSteamID: account } },
    appStore: { GetAppOverviewByAppID: () => ({ display_name: 'Real game' }) },
    SteamClient: {
      Apps: { GetMyAchievementsForApp: async () => ({ result: 1, data: { rgAchievements: ['FIRST', 'SECOND', 'THIRD'].map(strID => ({ strID, bAchieved: false })) } }) },
      GameSessions: { RegisterForAchievementNotification: fn => { callback = fn; return { unregister() { unregisters++; } }; } },
    },
  };
  const stop = api.startAchievementActivity({
    read: storage.read ?? (async () => ''),
    write: storage.write ?? (async (key, content) => { writes.push([key, JSON.parse(content)]); }),
  });
  return { notify: value => callback(value), writes, stop, unregisters: () => unregisters };
}

test('history restores only valid unique records and retains the newest 500', () => {
  const rows = Array.from({ length: 510 }, (_, i) => entry(`ID_${i}`, i + 1));
  assert.equal(api.parseHistory(JSON.stringify(rows)).length, 500);
  assert.equal(api.parseHistory(rows)[0].achievement.strID, 'ID_509');
  assert.deepEqual(api.parseHistory([entry('FIRST'), entry('FIRST'), { ...entry('BAD'), appid: 0 }, null]), [entry('FIRST')]);
  assert.deepEqual(api.parseHistory('{bad'), []);
});

test('progress counts confirmed unlock events before Steam refreshes its cached flags', () => {
  const rows = [{ strID: 'A', bAchieved: true }, { strID: 'B', bAchieved: false }, { strID: 'B', bAchieved: false }, { strID: 'C', bAchieved: false }];
  assert.deepEqual(api.achievementProgress(rows, new Set(['B', 'UNKNOWN'])), { earned: 2, total: 3 });
  assert.equal(api.achievementProgress([], new Set(['B'])), undefined);
});

test('simultaneous unlocks survive delayed history loading, exclude progress events and deduplicate callbacks', async () => {
  let finish;
  const h = host({ read: () => new Promise(resolve => { finish = resolve; }) });
  try {
    h.notify(event('FIRST'));
    h.notify(event('SECOND'));
    h.notify(event('SECOND'));
    h.notify(event('THIRD', false));
    finish(JSON.stringify([entry('OLDER')]));
    await flush();
    const snapshot = api.getAchievementActivity();
    assert.deepEqual(snapshot.history.map(item => item.achievement.strID).sort(), ['FIRST', 'OLDER', 'SECOND']);
    assert.equal(snapshot.history[0].achievement.description, 'Real description');
    assert.deepEqual(snapshot.progress[42], { earned: 2, total: 3 });
    assert.equal(h.writes.length, 2);
    assert.equal(h.writes.at(-1)[0], `achievementHistory_${account}`);
    assert.equal(h.writes.at(-1)[1].length, 3);
    await api.clearAchievementHistory();
    assert.deepEqual(h.writes.at(-1)[1], []);
  } finally { h.stop(); }
  assert.equal(h.unregisters(), 1);
});

test('account switches discard old pending reads and keep persistence scoped to the new account', async () => {
  const reads = new Map();
  const h = host({ read: key => new Promise(resolve => reads.set(key, resolve)) });
  try {
    h.notify(event('FIRST'));
    window.App.m_CurrentUser.strSteamID = '76561198000000002';
    h.notify(event('SECOND'));
    reads.get(`achievementHistory_${account}`)(JSON.stringify([entry('OLD_ACCOUNT')]));
    reads.get('achievementHistory_76561198000000002')('[]');
    await flush();
    assert.deepEqual(api.getAchievementActivity().history.map(item => item.achievement.strID), ['SECOND']);
    assert.equal(h.writes.length, 1);
    assert.equal(h.writes[0][0], 'achievementHistory_76561198000000002');
  } finally { h.stop(); }
});

test('failed history reads and unloading cannot overwrite saved records', async () => {
  const h = host({ read: async () => { throw new Error('Storage unavailable'); } });
  try {
    h.notify(event());
    await flush();
    assert.equal(h.writes.length, 0);
    assert.match(api.getAchievementActivity().error, /Storage unavailable/);
  } finally { h.stop(); }
  let finish;
  const delayed = host({ read: () => new Promise(resolve => { finish = resolve; }) });
  delayed.notify(event());
  delayed.stop();
  finish('[]');
  await flush();
  assert.equal(delayed.writes.length, 0);
});
