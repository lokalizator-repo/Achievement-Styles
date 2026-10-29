import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const compiled = await build({
  stdin: { contents: "export * from './frontend/desktop-layout'; export * from './frontend/popup-layout'; export * from './frontend/presentation'; export * from './frontend/sound';", resolveDir: process.cwd() },
  bundle: true, write: false, format: 'esm',
});
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

test('random style is drawn once per notification and pins dimensions, position and timing', () => {
  const random = Math.random;
  const monitor = { m_usable: { m_nLeft: 0, m_nTop: 0, m_nWidth: 1920, m_nHeight: 1080 } };
  let draws = 0;
  const originalAudio = globalThis.Audio;
  const played = [];
  try {
    globalThis.Audio = class {
      constructor(uri) { this.uri = uri; }
      load() {}
      pause() {}
      removeAttribute() {}
      addEventListener() {}
      play() { played.push(this.uri); return Promise.resolve(); }
    };
    for (const [style, variant] of [['ps5', 'standard'], ['ps4', 'ps4'], ['xbox', 'xbox-normal']]) {
      api.configureSound(`data:audio/wav;base64,${Buffer.from(style).toString('base64')}`, variant);
    }
    api.updatePresentation('notificationStyle', 'random');
    assert.equal(api.getNotificationStyleSelection(), 'random');
    for (const [index, style] of ['ps5', 'ps4', 'xbox'].entries()) {
      Math.random = () => { draws++; return (index + 0.5) / 3; };
      const key = `random-style-${index}`;
      const notice = { nToastDurationMS: 5000, data: { className: 'trophy-styles-test-toast', contentClassName: key } };
      api.beginNotification(notice);
      const layout = api.popupLayouts[style];
      assert.equal(api.popupStyle(key), style);
      assert.deepEqual(api.desktopSize(notice), { width: layout.width, height: layout.height });
      Math.random = () => { throw new Error('An active notification must retain its style'); };
      api.updatePresentation('notificationStyle', 'ps5');
      api.beginNotification(notice);
      assert.equal(api.notificationStyleFor(notice), style);
      assert.equal(api.playNotificationSound(notice, () => assert.fail('Unexpected native sound')), true);
      assert.equal(played.at(-1), `data:audio/wav;base64,${Buffer.from(style).toString('base64')}`);
      assert.deepEqual(api.desktopPosition(notice, monitor, 1, []), style === 'ps4'
        ? { left: 0, top: 134 } : style === 'xbox' ? { left: 624, top: 762 } : { left: 1216, top: 24 });
      assert.equal(notice.nToastDurationMS, style === 'xbox' ? 8400 : style === 'ps4' ? 5500 : 5000);
      api.updatePresentation('notificationStyle', 'random');
    }
    assert.equal(draws, 3);
  } finally {
    api.stopSounds();
    globalThis.Audio = originalAudio;
    Math.random = random;
    api.updatePresentation('notificationStyle', 'ps5');
  }
});

test('replaying the same achievement draws again and consecutive styles may repeat', () => {
  const random = Math.random;
  let draws = 0;
  try {
    api.setStyleEnabled(true);
    api.updatePresentation('notificationStyle', 'random');
    Math.random = () => { draws++; return draws < 3 ? 0.5 : 0.99; };
    const notice = () => ({ data: { achieved: () => true, appid: () => 42, achievement_id: () => 'same' } });
    for (const style of ['ps4', 'ps4', 'xbox']) {
      const next = notice();
      api.desktopSize(next);
      assert.equal(api.notificationStyleFor(next), style);
      assert.equal(api.popupStyle('42:same'), style);
    }
    assert.equal(draws, 3);
    assert.equal(api.desktopSize({ data: { achieved: () => false } }), undefined);
    assert.equal(draws, 3);
  } finally {
    Math.random = random;
    api.setStyleEnabled(false);
    api.updatePresentation('notificationStyle', 'ps5');
  }
});
