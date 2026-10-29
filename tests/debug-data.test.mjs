import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['frontend/debug-data.ts'], bundle: true, write: false, format: 'esm' });
const data = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

test('library picker includes visible Steam games and excludes software and shortcuts', () => {
  const app = (appid, display_name, extra = {}) => ({ appid, display_name, app_type: 1, visible_in_game_list: true, ...extra });
  assert.deepEqual(data.readDebugGames({ allApps: [
    app(20, 'Zulu'), app(10, 'Alpha'), app(30, 'Hidden', { visible_in_game_list: false }),
    app(40, 'Tool', { app_type: 2 }), app(3000000000, 'Shortcut'),
  ] }), [{ appid: 10, name: 'Alpha' }, { appid: 20, name: 'Zulu' }]);
  assert.deepEqual(data.readDebugGames({}), []);
});

test('library app IDs are numeric even when Steam provides strings', () => {
  const app = appid => ({ appid, display_name: 'Game', app_type: 1, visible_in_game_list: true });
  assert.deepEqual(data.readDebugGames({ allApps: [app('2651280'), app('bad'), app('1.5'), app('3000000000')] }), [{ appid: 2651280, name: 'Game' }]);
});

test('achievement requests are shared and cache real Steam metadata', async () => {
  let calls = 0;
  const original = { strID: 'id', strName: 'Real achievement', strImage: 'icon-url', strDescription: 'Description', bAchieved: false };
  globalThis.window = { SteamClient: { Apps: { GetMyAchievementsForApp: async id => {
    calls++;
    assert.equal(id, '100');
    return { result: 1, data: { rgAchievements: [original] } };
  } } } };
  const first = data.loadDebugAchievements(100);
  const second = data.loadDebugAchievements(100);
  assert.equal(first, second);
  assert.deepEqual(await first, [{ strID: 'id', strName: 'Real achievement', strImage: 'icon-url', description: 'Description', bAchieved: false }]);
  await data.loadDebugAchievements(100);
  assert.equal(calls, 1);
  assert.equal(original.bAchieved, false);
});

test('failed achievement requests can be retried instead of poisoning the cache', async () => {
  let calls = 0;
  globalThis.window = { SteamClient: { Apps: { GetMyAchievementsForApp: async () => {
    calls++;
    return calls === 1 ? { result: 2 } : { result: 1, data: { rgAchievements: [] } };
  } } } };
  await assert.rejects(data.loadDebugAchievements(200), /code 2/);
  assert.deepEqual(await data.loadDebugAchievements(200), []);
  assert.equal(calls, 2);
  await assert.rejects(data.loadDebugAchievements(0), /Choose a Steam game/);
});
