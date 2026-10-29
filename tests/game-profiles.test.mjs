import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const compiled = await build({ stdin: { contents: "export * from './frontend/presentation'; export * from './frontend/game-profiles'; export * from './frontend/desktop-layout'; export * from './frontend/sound';", resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm' });
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

test('per-game overrides inherit global settings field by field and reset cleanly', () => {
  api.updatePresentation('notificationStyle', 'ps5');
  api.updatePresentation('popupDuration', 7);
  api.updatePresentation('showProgress', false);
  api.updatePresentation('gameProfiles', JSON.stringify({ 42: { notificationStyle: 'xbox', soundVolume: 0, showProgress: true } }));
  assert.equal(api.getNotificationStyle(42), 'xbox');
  assert.equal(api.getNotificationStyle(43), 'ps5');
  assert.equal(api.getPopupDuration(false, 42), 7000);
  assert.equal(api.getGamePresentation(42).showProgress, true);
  api.updatePresentation('popupDuration', 15);
  assert.equal(api.getPopupDuration(false, 42), 15000);
  api.updatePresentation('gameProfiles', '{}');
  assert.equal(api.getNotificationStyle(42), 'ps5');
  assert.equal(api.getGamePresentation(42).showProgress, false);
  assert.deepEqual(api.parseProfiles('{bad'), {});
  assert.deepEqual(api.parseProfiles({ 0: { notificationStyle: 'xbox' }, 42: { notificationStyle: 'bad', popupDuration: 1, showProgress: 'true', soundVolume: -5 } }), { 42: { soundVolume: 0 } });
});

test('real and replayed notifications use the game style, duration and independent sound volume', async () => {
  const originalAudio = globalThis.Audio;
  const played = [];
  globalThis.Audio = class {
    constructor(uri) { this.uri = uri; }
    load() {}
    pause() {}
    removeAttribute() {}
    addEventListener() {}
    play() { played.push({ uri: this.uri, volume: this.volume }); return Promise.resolve(); }
  };
  try {
    api.configureSound('data:audio/wav;base64,eGJveA==', 'xbox-normal');
    api.setStyleEnabled(true);
    api.updatePresentation('popupDuration', 'auto');
    api.updatePresentation('gameProfiles', { 42: { notificationStyle: 'xbox', popupDuration: 15, soundVolume: 25 } });
    api.setSoundVolume(0);
    const notice = { data: { achieved: () => true, appid: () => 42, achievement_id: () => 'A' } };
    api.beginNotification(notice);
    assert.equal(api.notificationStyleFor(notice), 'xbox');
    assert.equal(notice.nToastDurationMS, 15000);
    assert.equal(api.playNotificationSound(notice, () => assert.fail('Native sound should not run')), true);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(played.at(-1).volume, .25);
    api.rememberNotificationApp('replay-42', 42);
    const replay = { data: { className: 'trophy-styles-test-toast', contentClassName: 'replay-42' } };
    api.beginNotification(replay);
    assert.equal(api.notificationStyleFor(replay), 'xbox');
    assert.equal(replay.nToastDurationMS, 15000);
    api.updatePresentation('gameProfiles', { 42: { notificationStyle: 'xbox', soundVolume: 0 } });
    api.setSoundVolume(100);
    assert.equal(api.playNotificationSound({ ...notice }, () => assert.fail()), true);
    assert.equal(played.length, 1);
  } finally {
    api.stopSounds(); globalThis.Audio = originalAudio;
    api.updatePresentation('gameProfiles', '{}'); api.setStyleEnabled(false);
  }
});
