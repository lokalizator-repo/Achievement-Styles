import { steamBundle } from './steam-bundle.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
import { applySteamPatches } from '../scripts/steam-patches.mjs';

const compiled = await build({ stdin: { contents: "export { updatePresentation } from './frontend/presentation'; export * from './frontend/desktop-layout'; export * from './frontend/monitor-scale';", resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm' });
const layout = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const monitor = { m_usable: { m_nLeft: 0, m_nTop: 0, m_nWidth: 1920, m_nHeight: 1080 }, m_flDPI: 1.5 };
const sample = { data: { className: 'trophy-styles-test-toast' } };

test('all corners respect usable monitor bounds and bottom stacks grow upward', () => {
  const screen = { m_usable: { m_nLeft: -1920, m_nTop: -100, m_nWidth: 1920, m_nHeight: 1080 } };
  const first = { data: { className: 'trophy-styles-test-toast' } };
  const second = { data: { className: 'trophy-styles-test-toast' } };
  const records = [{ toast: { m_notification: first, m_nToastHeight: 136 }, flPercentDone: 1 }];
  try {
    for (const [corner, left, top] of [['top-right', -704, -76], ['top-left', -1896, -76], ['bottom-right', -704, 820], ['bottom-left', -1896, 820]]) {
      layout.updatePresentation('popupCorner', corner);
      assert.deepEqual(layout.desktopPosition(first, screen, 1, records), { left, top });
      assert.deepEqual(layout.desktopPosition(second, screen, 1, records), { left, top: top + (corner.startsWith('bottom') ? -144 : 144) });
    }
  } finally { layout.updatePresentation('popupCorner', 'top-right'); }
});

test('overlay resolution is compensated against desktop logical height, with native monitor DPI retained', () => {
  layout.setDesktopHeight(1440 / 1.25);
  for (const [height, dpi] of [[1440, 1.25], [1080, 1], [720, 1]]) {
    const screen = { m_usable: { m_nLeft: 0, m_nTop: 0, m_nWidth: 2560 * height / 1440 / dpi, m_nHeight: height / dpi }, m_full: { m_nHeight: height / dpi } };
    layout.setOverlayMonitor(42, screen);
    const toast = { data: { className: 'trophy-styles-test-toast', contentClassName: `scale-${height}` } };
    const size = layout.desktopSize(toast, 42);
    const scale = layout.popupScale(`scale-${height}`);
    assert.ok(Math.abs(656 * scale * dpi * 1440 / height - 656 * 1.25) < 0.001);
    assert.equal(size.width, Math.ceil(680 * scale));
    assert.equal(size.height, Math.ceil(136 * scale));
    const position = layout.desktopPosition(toast, screen, 1, []);
    assert.equal(position.top, Math.round(24 * scale));
    assert.equal(position.left, Math.round(screen.m_usable.m_nWidth - size.width - 24 * scale));
  }
  assert.equal(layout.desktopSize(sample, 0).width, 680);
});

test('PS5 popups reserve enough window space and stack at the top right', () => {
  assert.deepEqual(layout.desktopSize(sample), { width: 680, height: 136 });
  const second = { data: { className: 'trophy-styles-test-toast' } };
  const records = [{ toast: { m_notification: sample, m_nToastHeight: 136 }, flPercentDone: 1 }];
  assert.deepEqual(layout.desktopPosition(sample, monitor, 1, records), { left: 1216, top: 24 });
  assert.deepEqual(layout.desktopPosition(second, monitor, 1, records), { left: 1216, top: 168 });
});

test('native popup stays fixed throughout entry and exit', () => {
  const otherMonitor = { m_usable: { m_nLeft: -1920, m_nTop: -100, m_nWidth: 1920, m_nHeight: 1080 } };
  assert.deepEqual(layout.desktopPosition(sample, otherMonitor, 0, []), { left: -704, top: -76 });
  assert.deepEqual(layout.desktopPosition(sample, otherMonitor, 1, []), { left: -704, top: -76 });
});

test('ordinary notifications, achievement progress and disabled styling retain native layout', () => {
  const earned = { data: { achieved: () => true } };
  layout.setStyleEnabled(false);
  assert.equal(layout.desktopSize(earned), undefined);
  layout.setStyleEnabled(true);
  assert.equal(layout.desktopSize(earned).width, 680);
  assert.equal(layout.desktopSize({ data: { achieved: () => false } }), undefined);
  assert.equal(layout.desktopSize({ data: { name: 'Friend message' } }), undefined);
  layout.setStyleEnabled(false);
});

const steamFile = steamBundle;
test('actual Steam window creator and movement loop use PS5 bounds only for matching notifications', { skip: !existsSync(steamFile) }, async () => {
  const source = await readFile(steamFile, 'utf8');
  const backend = await readFile('backend/main.lua', 'utf8');
  const patched = applySteamPatches(source, backend).source;
  const brokenBackend = backend.replace('\\3 const trophyPosition', '\\3const trophyPosition');
  assert.notEqual(brokenBackend, backend);
  assert.throws(() => new vm.Script(applySteamPatches(source, brokenBackend).source), SyntaxError);
  new vm.Script(patched);
  const creatorPattern = /function (\w+)\(\w+\)\{let\{appid:\w+,notification:\w+,onDismiss:\w+,registerPopup:[\s\S]*?:null\}/;
  const creator = patched.match(creatorPattern);
  assert.ok(creator);
  const created = [];
  const context = {
    __trophyStyles: { notification: layout },
    a: { useCallback: fn => fn }, h: { $2: () => ({ params: {} }) },
    w: { xW: () => 66 }, M: { W: { EBrowserType_DirectHWND_Borderless: 4 } },
    Y: { yq: () => 0, Dr: { Notification: 1 }, Wf: { Composited: 256, Hidden: 2, ApplyBrowserScaleToDimensions: 4096 } },
    H: { OJ: (name, options) => { created.push(options); return { popup: null, element: null }; } },
    A: () => ({ DesktopToastContainer: 'native-container' }), ae: 283,
  };
  vm.runInNewContext(`${creator[0]};globalThis.createToast=${creator[1]}`.replace(/\b(v|L|m|R|h|Ae)\b/g, name => ({ v: 'h', L: 'M', m: 'w', R: 'Y', h: 'A', Ae: 'ae' })[name]), context);
  context.createToast({ notification: sample });
  context.createToast({ notification: { data: {} } });
  assert.equal(created[0].dimensions.width, 680);
  assert.equal(created[0].dimensions.height, 136);
  assert.match(created[0].body_class, /trophy-styles-notification-window/);
  assert.equal(created[1].dimensions.width, 283);
  assert.equal(created[1].dimensions.height, 66);
  assert.equal(created[1].body_class, 'native-container');

  const stack = patched.match(/function (\w+)\(\w+\)\{let\{appid:\w+,notifications:\w+,onDismiss:\w+\}[\s\S]*?registerPopup:\w+\},\w+\.notificationID\)\)\}\)\}/);
  assert.ok(stack);
  layout.setDesktopHeight(1440);
  const overlayMonitor = { m_usable: { m_nLeft: 0, m_nTop: 0, m_nWidth: 1920, m_nHeight: 1080 }, m_full: { m_nHeight: 1080 } };
  const stackContext = {
    __trophyStyles: { notification: { ...layout, setOverlayMonitor: layout.setOverlayMonitor } },
    a: { useRef: value => ({ current: value }), useEffect() {} },
    h: { $2: () => ({ NotificationPosition: {} }) }, c: { q3: fn => fn() }, V: () => [[], () => {}],
    B: { hi: () => overlayMonitor, OU() {}, a5() {}, W_() {}, Ad: { IsDebugEnabled: () => false } },
    e: { jsx: (_type, props) => props, Fragment: 'fragment' },
  };
  vm.runInNewContext(`${stack[0]};globalThis.renderStack=${stack[1]}`.replace(/\b(v|d|ie)\b/g, name => ({ v: 'h', d: 'c', ie: 'V' })[name]), stackContext);
  stackContext.renderStack({ appid: 42, notifications: [], onDismiss() {} });
  const gameToast = { data: { className: 'trophy-styles-test-toast', contentClassName: 'scaled-native' } };
  context.createToast({ notification: gameToast, appid: 42 });
  assert.equal(created[2].dimensions.width, 510);
  assert.equal(created[2].dimensions.height, 102);
  assert.equal(layout.desktopSize(gameToast).height, 102);

  const movementPattern = /function ([\w$]+)\(\w+,\w+,\w+\)\{let \w+=\(0,\w+\.Pr\)\(\),[\s\S]*?PlayNotificationSound\(\w+\.m_notification\)\}/;
  const nativeMovement = source.match(movementPattern);
  const ps5Movement = patched.match(movementPattern);
  assert.ok(nativeMovement && ps5Movement);
  function move(code) {
    const positions = [];
    const notifications = [sample, { data: {} }];
    const records = notifications.map((notification, index) => ({
      m_notification: { ...notification, nToastDurationMS: 5000 },
      m_nToastHeight: index === 0 ? 136 : 66,
      m_eState: 2, m_flLastEventTime: 0,
      m_popup: { SteamClient: { Window: { MoveTo: (...args) => { positions[index] = args; } } } },
    }));
    const sandbox = {
      __trophyStyles: { notification: layout },
      performance: { now: () => 100 }, v: { Pr: () => false },
      B: { Tj() {} }, J: { wT: (condition, message) => assert.ok(condition, message) },
      y: { WU6: { k_EPositionTopLeft: 0, k_EPositionTopRight: 1, k_EPositionBottomLeft: 2, k_EPositionBottomRight: 3 } },
      R: 300, Z: 300, he: 0, ae: 283,
    };
    vm.runInNewContext(`${code[0]};globalThis.moveToasts=${code[1]}`.replace(/\b(O|ee|p|G|k|_|Ae|c)\b/g, name => ({ O: 'v', ee: 'J', p: 'y', G: 'Z', k: 'R', _: 'he', Ae: 'ae', c: 'u' })[name]), sandbox);
    sandbox.moveToasts(records, monitor, { position: 3, horizontalInset: 8, verticalInset: 8 });
    return positions;
  }
  const original = move(nativeMovement);
  const changed = move(ps5Movement);
  assert.deepEqual(changed[0], [1216, 24, 1.5]);
  assert.deepEqual(changed[1], original[1]);
});

test('PS4 has its own edge anchor, screen-relative size and immutable popup style', () => {
  layout.updatePresentation('notificationStyle', 'ps4');
  layout.updatePresentation('popupCorner', 'bottom-right');
  layout.setDesktopHeight(1080);
  const toast = { data: { className: 'trophy-styles-test-toast', contentClassName: 'ps4-layout' } };
  const screen = {
    m_usable: { m_nLeft: 48, m_nTop: 40, m_nWidth: 1872, m_nHeight: 1040 },
    m_full: { m_nLeft: 0, m_nTop: 0, m_nWidth: 1920, m_nHeight: 1080 },
  };
  try {
    assert.deepEqual(layout.desktopSize(toast), { width: 554, height: 100 });
    assert.deepEqual(layout.desktopPosition(toast, screen, 0, []), { left: 0, top: 134 });
    assert.deepEqual(layout.desktopPosition(toast, screen, 1, []), { left: 0, top: 134 });
    layout.beginNotification(toast);
    assert.equal(toast.nToastDurationMS, 5500);
    layout.updatePresentation('notificationStyle', 'ps5');
    assert.deepEqual(layout.desktopSize(toast), { width: 554, height: 100 });
    assert.deepEqual(layout.desktopSize({ data: { className: 'trophy-styles-test-toast' } }), { width: 680, height: 136 });
  } finally {
    layout.updatePresentation('notificationStyle', 'ps5');
    layout.updatePresentation('popupCorner', 'top-right');
    layout.setDesktopHeight(1080);
  }
});

test('PS4 scales to native monitor height including DPI, lower game resolutions and negative monitor origins', () => {
  layout.updatePresentation('notificationStyle', 'ps4');
  try {
    for (const [height, dpi] of [[1080, 1], [1440, 1.25], [2160, 1.5], [720, 1]]) {
      const logicalHeight = height / dpi;
      const screen = {
        m_usable: { m_nLeft: -2560, m_nTop: -200, m_nWidth: 2560, m_nHeight: logicalHeight - 40 },
        m_full: { m_nLeft: -2560, m_nTop: -200, m_nWidth: 2560, m_nHeight: logicalHeight },
      };
      layout.setOverlayMonitor(77, screen);
      const toast = { data: { className: 'trophy-styles-test-toast', contentClassName: `ps4-${height}` } };
      const size = layout.desktopSize(toast, 77);
      const scale = layout.popupScale(`ps4-${height}`);
      assert.equal(size.width, Math.ceil(554 * logicalHeight / 1080));
      assert.equal(size.height, Math.ceil(100 * logicalHeight / 1080));
      assert.ok(Math.abs(554 * scale * dpi / height - 554 / 1080) < 0.00001);
      assert.deepEqual(layout.desktopPosition(toast, screen, 1, []), { left: -2560, top: Math.round(-200 + logicalHeight * 134 / 1080) });
    }
  } finally { layout.updatePresentation('notificationStyle', 'ps5'); }
});
