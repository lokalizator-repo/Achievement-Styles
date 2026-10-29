import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['frontend/steam-rarity.ts'], bundle: true, write: false, format: 'esm' });
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const response = achievements => ({ achievementpercentages: { achievements } });

test('global Steam statistics accept numeric strings from the live API and preserve confirmed zero', () => {
  const parsed = api.parseSteamPercentages(JSON.stringify(response([
    { name: 'ACH_RETURNER', percent: '35.2' }, { name: 'new', percent: '0' },
    { name: 'all', percent: 100 }, { name: 'tiny', percent: '0.01' },
    ...[null, '', ' ', false, 'bad', -1, 101].map((percent, index) => ({ name: `bad${index}`, percent })),
  ])));
  assert.deepEqual([...parsed], [['ACH_RETURNER', 35.2], ['new', 0], ['all', 100], ['tiny', 0.01]]);
  assert.throws(() => api.parseSteamPercentages({ response: {} }), /unexpected/);
  assert.throws(() => api.parseSteamPercentages(response([{ name: 'duplicate', percent: 1 }, { name: 'duplicate', percent: 2 }])), /duplicate/);
});

test('a game shares one request, matches exact Steam IDs and caches successful global statistics', async () => {
  let calls = 0;
  globalThis.backend = { getGlobalSteamAchievementPercentages: async appid => {
    calls++;
    assert.equal(appid, 362680);
    return response([{ name: 'ACH_RETURNER', percent: '35.2' }, { name: 'new', percent: '0' }]);
  } };
  assert.equal(api.cachedSteamPercent(362680, 'ACH_RETURNER'), undefined);
  const first = api.loadSteamPercentages(362680);
  assert.equal(first, api.loadSteamPercentages(362680));
  const percentages = await first;
  assert.equal(percentages.get('ACH_RETURNER'), 35.2);
  assert.equal(api.cachedSteamPercent(362680, 'ACH_RETURNER'), 35.2);
  assert.equal(api.cachedSteamPercent(362680, 'new'), 0);
  assert.equal(api.cachedSteamPercent(362680, 'unknown'), undefined);
  await api.loadSteamPercentages(362680);
  assert.equal(calls, 1);
});

test('failed global statistics retry without poisoning the cache or fabricating zero', async () => {
  let calls = 0;
  globalThis.backend = { getGlobalSteamAchievementPercentages: async () => {
    if (++calls === 1) throw new Error('HTTP 503');
    return response([{ name: 'earned', percent: 26.4 }]);
  } };
  await assert.rejects(api.loadSteamPercentages(480), /503/);
  assert.equal(api.cachedSteamPercent(480, 'earned'), undefined);
  assert.equal((await api.loadSteamPercentages(480)).get('earned'), 26.4);
  assert.equal(calls, 2);
  await assert.rejects(api.loadSteamPercentages(0), /Invalid Steam game/);
});
