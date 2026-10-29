import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['frontend/completion.ts'], bundle: true, write: false, format: 'esm' });
const { completionPlatinum, createCompletionMonitor } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const platinum = { strID: 'ps5:1', strName: 'Trophy Triumph', grade: 'platinum', description: 'Obtain all other trophies', bAchieved: false };
const catalog = { kind: 'ready', trophies: [platinum], matches: { first: 'ps5:2', last: 'ps5:3' } };
const event = (id = 'last', appid = 990080) => ({ unAppID: appid, achievement: { strID: id, bAchieved: true } });
const list = (first = true, last = false) => [{ strID: 'first', strName: 'First', bAchieved: first }, { strID: 'last', strName: 'Last', bAchieved: last }];

function host(overrides = {}) {
  const shown = [], errors = [], awards = new Set();
  let user = '76561198000000001';
  let checks = 0;
  const deps = {
    currentUser: () => user,
    achievements: async () => { checks++; return list(); },
    catalog: async () => catalog,
    awarded: async (user, appid) => awards.has(`${user}:${appid}`),
    claim: async (user, appid) => { const key = `${user}:${appid}`; if (awards.has(key)) return false; awards.add(key); return true; },
    release: async (user, appid) => awards.delete(`${user}:${appid}`),
    show: achievement => shown.push(achievement), wait: async milliseconds => assert.equal(milliseconds, 5500), report: error => errors.push(error),
    ...overrides,
  };
  const monitor = createCompletionMonitor(deps);
  monitor.setEnabled(true);
  return { monitor, deps, shown, errors, awards, checks: () => checks, user: value => { user = value; } };
}

test('completion trophy exists only when PS5 has one extra platinum and Steam has achievements', () => {
  assert.equal(completionPlatinum(catalog, list()).strName, 'Trophy Triumph');
  assert.equal(completionPlatinum(catalog, []), undefined);
});

test('native Steam platinum, ambiguous PS5 lists and unavailable catalogs are excluded', () => {
  assert.equal(completionPlatinum({ ...catalog, matches: { last: 'ps5:1' } }, list()), undefined);
  assert.equal(completionPlatinum({ ...catalog, trophies: [] }, list()), undefined);
  assert.equal(completionPlatinum({ ...catalog, trophies: [platinum, { ...platinum, strID: 'other' }] }, list()), undefined);
  assert.equal(completionPlatinum({ ...catalog, kind: 'choose' }, list()), undefined);
  assert.equal(completionPlatinum(undefined, list()), undefined);
});

test('last Steam unlock includes the event before its API cache updates and awards once', async () => {
  const h = host();
  await Promise.all([h.monitor.notify(event()), h.monitor.notify(event())]);
  await h.monitor.notify(event());
  assert.equal(h.shown.length, 1);
  assert.equal(h.shown[0].grade, 'platinum');
  assert.equal(h.shown[0].ps5TrophyId, 'ps5:1');
  assert.equal(h.checks(), 1);
  assert.deepEqual(h.errors, []);
  const reloaded = createCompletionMonitor(h.deps);
  reloaded.setEnabled(true);
  await reloaded.notify(event());
  assert.equal(h.shown.length, 1);
});

test('locked or unidentified achievements and progress events never award platinum', async () => {
  const h = host({ achievements: async () => list(false, false) });
  await h.monitor.notify(event());
  await h.monitor.notify({ ...event(), achievement: { strID: 'first', bAchieved: false } });
  assert.equal(h.shown.length, 0);
  const malformed = host({ achievements: async () => [{ bAchieved: true }] });
  await malformed.monitor.notify(event());
  assert.equal(malformed.shown.length, 0);
  const empty = host({ achievements: async () => [] });
  await empty.monitor.notify(event());
  assert.equal(empty.shown.length, 0);
});

test('account changes, disabling and unloading cancel pending completion popups', async () => {
  for (const action of ['account', 'disable', 'stop']) {
    let finish;
    const h = host({ wait: () => new Promise(resolve => { finish = resolve; }) });
    const job = h.monitor.notify(event());
    while (!finish) await new Promise(resolve => setImmediate(resolve));
    if (action === 'account') h.user('76561198000000002');
    if (action === 'disable') { h.monitor.setEnabled(false); h.monitor.setEnabled(true); }
    if (action === 'stop') h.monitor.stop();
    finish(); await job;
    assert.equal(h.shown.length, 0);
    assert.equal(h.awards.size, 0);
  }
});

test('awards are separate for each account and game', async () => {
  const h = host();
  await h.monitor.notify(event());
  h.user('76561198000000002');
  await h.monitor.notify(event());
  await h.monitor.notify(event('last', 12345));
  assert.equal(h.shown.length, 3);
  assert.equal(h.awards.size, 3);
});

test('failed popup creation releases the award so a later event can retry', async () => {
  let failures = 1;
  const h = host({ show: () => { if (failures--) throw new Error('Notifications unavailable'); } });
  await h.monitor.notify(event());
  assert.equal(h.awards.size, 0);
  assert.equal(h.errors.length, 1);
  await h.monitor.notify(event());
  assert.equal(h.awards.size, 1);
});

test('temporary public catalog failures retry before abandoning the final unlock', async () => {
  let attempts = 0;
  const delays = [];
  const h = host({ catalog: async () => { if (++attempts < 3) throw new Error('Network unavailable'); return catalog; }, wait: async ms => { delays.push(ms); } });
  await h.monitor.notify(event());
  assert.equal(h.shown.length, 1);
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [2000, 4000, 5500]);
});

test('a mapped completion set can finish before DLC without repeating the award', async () => {
  const h = host({
    achievements: async () => [...list(), { strID: 'dlc', bAchieved: false }],
    resolve: async (_appid, achievements, unlocks) => {
      assert.equal(achievements[2].bAchieved, false);
      return achievements[0].bAchieved && unlocks.has('last') ? { strName: 'Mythic', bAchieved: true, xboxVariant: 'mythic' } : undefined;
    },
    delay: 10000,
    wait: async milliseconds => assert.equal(milliseconds, 10000),
  });
  await h.monitor.notify(event());
  await h.monitor.notify(event('dlc'));
  assert.equal(h.shown.length, 1);
  assert.equal(h.shown[0].xboxVariant, 'mythic');
  assert.deepEqual(h.errors, []);
});
