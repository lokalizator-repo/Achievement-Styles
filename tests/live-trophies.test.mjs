import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const catalogs = new Map();
const calls = [];
const waits = new Map();
globalThis.liveCatalogHost = { catalogs, calls, waits };
const compiled = await build({
  stdin: { contents: "export * from './frontend/live-trophies'; export * from './frontend/sound'; export { setStyleEnabled } from './frontend/desktop-layout'; export { updatePresentation } from './frontend/presentation';", resolveDir: process.cwd() },
  bundle: true, write: false, format: 'esm',
  plugins: [{ name: 'catalog-host', setup(builder) {
    builder.onResolve({ filter: /^\.\/public-catalog$/ }, () => ({ path: 'catalog', namespace: 'host' }));
    builder.onLoad({ filter: /.*/, namespace: 'host' }, () => ({ contents: `
      const host=globalThis.liveCatalogHost;
      export const cachedGameCatalog=id=>host.catalogs.get(id);
      export const loadGameCatalog=async id=>{host.calls.push(id);await host.waits.get(id);return host.catalogs.get(id)};
      export const loadPsnRarities=loadGameCatalog;
      export const resolveCatalogTrophy=(catalog,id)=>catalog?.trophies.find(t=>t.strID===catalog.matches[id]);
      export const getSteamSchema=async()=>{throw new Error('Unexpected Xbox schema request in a PlayStation test')};
      export const normalizeTitle=value=>value.toLowerCase().replace(/[^a-z0-9]/g,'');
    ` }));
  } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const data = (appid, id) => ({ appid: () => appid, achievement_id: () => id, achieved: () => true });
const catalog = grade => ({ matches: { earned: 'ps5:2' }, trophies: [{ strID: 'ps5:2', grade }] });

test('real achievements use exact catalog grades and unmatched games have no invented rank', () => {
  api.setLiveMatching(true);
  for (const [appid, grade] of [[1, 'bronze'], [2, 'silver'], [3, 'gold'], [4, 'platinum']]) {
    catalogs.set(appid, catalog(grade));
    assert.deepEqual(api.liveTrophy(data(appid, 'earned')), { grade, ps5TrophyId: 'ps5:2' });
    assert.deepEqual(api.liveTrophy(data(appid, 'dlc-exclusive')), { grade: 'bronze', hideGrade: true });
  }
  catalogs.set(5, { matches: {}, trophies: [], kind: 'missing' });
  assert.deepEqual(api.liveTrophy(data(5, 'earned')), { grade: 'bronze', hideGrade: true });
  api.setLiveMatching(false);
  assert.deepEqual(api.liveTrophy(data(5, 'earned')), { grade: 'bronze', hideGrade: true });
});

test('late catalog loading cannot change the grade or sound of an already visible notification', async () => {
  api.setLiveMatching(true);
  let release;
  waits.set(6, new Promise(resolve => { release = resolve; }));
  const earned = data(6, 'earned');
  assert.deepEqual(api.liveTrophy(earned), { grade: 'bronze', hideGrade: true });
  const pending = api.warmGameTrophies(6);
  assert.equal(calls.filter(id => id === 6).length, 1);
  catalogs.set(6, catalog('gold'));
  release();
  await pending;
  assert.deepEqual(api.liveTrophy(earned), { grade: 'bronze', hideGrade: true });
  assert.equal(api.liveTrophy(data(6, 'earned')).grade, 'gold');
});

test('launch callbacks warm catalogs, including an already running game, and unregister on unload', async () => {
  let launch, removed = 0;
  globalThis.window = {
    appStore: { allApps: [{ appid: 7, local_per_client_data: { display_status: 4 } }, { appid: 8, local_per_client_data: { display_status: 11 } }] },
    SteamClient: { GameSessions: {
      RegisterForAppLifetimeNotifications(callback) { launch = callback; return { unregister() { removed++; } }; },
    } },
  };
  const stop = api.startLiveTrophies();
  launch({ unAppID: 9, bRunning: true });
  launch({ unAppID: 10, bRunning: false });
  launch({ unAppID: 9, bRunning: true });
  assert.equal(calls.filter(id => id === 9).length, 1);
  assert.ok(calls.includes(7));
  assert.ok(!calls.includes(8));
  assert.ok(!calls.includes(10));
  stop();
  assert.equal(removed, 1);
});

test('PSN percentages warm even when PlayStation grade matching is disabled', async () => {
  api.setLiveMatching(false);
  api.updatePresentation('raritySource', 'psn');
  await api.warmGameTrophies(800);
  assert.ok(calls.includes(800));
  api.updatePresentation('raritySource', 'steam');
  api.setLiveMatching(true);
});

test('real platinum uses the platinum sound while an unmatched game uses the standard sound', () => {
  api.setLiveMatching(true);
  api.setStyleEnabled(true);
  const played = [];
  globalThis.Audio = class {
    constructor(uri) { this.uri = uri; }
    load() {}
    pause() {}
    removeAttribute() {}
    addEventListener() {}
    play() { played.push(this.uri); return Promise.resolve(); }
  };
  const standard = 'data:audio/wav;base64,c3Rk';
  const platinum = 'data:audio/wav;base64,cGxhdA==';
  api.configureSound(standard);
  api.configureSound(platinum, 'platinum');
  assert.equal(api.playNotificationSound({ data: data(4, 'earned') }, () => assert.fail('Native sound')), true);
  assert.equal(played.at(-1), platinum);
  assert.equal(api.playNotificationSound({ data: data(5, 'earned') }, () => assert.fail('Native sound')), true);
  assert.equal(played.at(-1), standard);
  api.stopSounds();
});
