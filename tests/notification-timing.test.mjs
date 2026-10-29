import { steamBundle } from './steam-bundle.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
import { applySteamPatches } from '../scripts/steam-patches.mjs';

const compiled = await build({ stdin: { contents: "export * from './frontend/notification-timing'; export { updatePresentation } from './frontend/presentation'; export * from './frontend/desktop-layout';", resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm' });
const timing = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const notification = id => ({ eType: 1, nToastDurationMS: 5000, data: { achieved: () => true, appid: () => 480, achievement_id: () => id } });

test('manual duration stays fixed across repeated measurements and preserves platinum animation', () => {
  timing.clearNotificationTiming();
  try {
    timing.updatePresentation('popupDuration', 5);
    const toast = notification('manual');
    timing.trackNotification(toast);
    timing.reportDuration('480:manual', 'Long', 4000, 450, false);
    timing.trackNotification(toast);
    assert.equal(toast.nToastDurationMS, 5000);
    assert.equal(timing.readingDuration(4000, 450), 5000);
    timing.reportDuration('480:manual', 'Platinum', 4000, 450, true);
    assert.equal(toast.nToastDurationMS, 7000);
    timing.updatePresentation('popupDuration', 10);
    timing.trackNotification(toast);
    assert.equal(toast.nToastDurationMS, 10000);
    timing.updatePresentation('popupDuration', 'invalid');
    assert.equal(timing.readingDuration(4000, 450), 10000);
  } finally {
    timing.updatePresentation('popupDuration', 'auto');
    timing.clearNotificationTiming();
  }
});

test('reading duration covers the final visible text and keeps short/platinum minimums', () => {
  assert.equal(timing.readingDuration(200, 450), 5000);
  assert.equal(timing.readingDuration(200, 450, true), 7000);
  const duration = timing.readingDuration(1650, 450);
  assert.ok(duration >= 900 + 1200 / timing.subtitleScrollSpeed(1650, 450) * 1000 + 1800);
  assert.equal(duration, 15000);
  for (const width of [NaN, Infinity, -10]) assert.equal(timing.readingDuration(width, 450), 5000);
});

test('measured descriptions extend the actual native notification and late changes get remaining reading time', async () => {
  timing.clearNotificationTiming();
  const toast = notification('late');
  timing.trackNotification(toast);
  timing.reportDuration('480:late', 'Short', 100, 450, false);
  assert.ok(toast.nToastDurationMS >= 5000);
  await new Promise(resolve => setTimeout(resolve, 25));
  timing.reportDuration('480:late', 'Long description', 900, 450, false);
  const value = toast.nToastDurationMS;
  assert.ok(value > timing.readingDuration(900, 450) + 15);
  timing.reportDuration('480:late', 'Long description', 900, 450, false);
  assert.equal(toast.nToastDurationMS, value);
  timing.forgetTiming('480:late');
  timing.reportDuration('480:late', 'Another description', 2500, 450, false);
  assert.equal(toast.nToastDurationMS, value);
  timing.clearNotificationTiming();
});

test('classification of queued notifications does not start their reading clock', async () => {
  timing.clearNotificationTiming();
  timing.setStyleEnabled(true);
  const toast = notification('queued');
  assert.equal(timing.displayAlone(toast), true);
  timing.reportDuration('480:queued', 'Description', 1650, 450, false);
  assert.equal(toast.nToastDurationMS, 5000);
  await new Promise(resolve => setTimeout(resolve, 25));
  timing.beginNotification(toast);
  assert.ok(toast.nToastDurationMS >= timing.readingDuration(1650, 450));
  assert.ok(toast.nToastDurationMS < timing.readingDuration(1650, 450) + 15);
  timing.clearNotificationTiming();
  timing.setStyleEnabled(false);
});

test('patched Steam admission loop displays and sounds achievements one at a time until dismissal', async () => {
  const source = await readFile(steamBundle, 'utf8');
  const backend = await readFile('backend/main.lua', 'utf8');
  const patched = applySteamPatches(source, backend).source;
  const predicate = patched.match(/function (\w+)\((\w+)\)\{return globalThis\.__trophyStyles\?\.notification\?\.displayAlone[\s\S]*?displayToastAlone===!0\)\}/);
  assert.ok(predicate);
  const start = patched.indexOf('BAnyToastDisplayAlone(');
  const methods = patched.slice(start, patched.indexOf('ClearAllToastNotifications()', start));
  const call = patched.indexOf('.PopNextToastNotification(');
  const admissionStart = patched.lastIndexOf('function ', call);
  const admission = patched.slice(admissionStart, patched.indexOf('function ', call));
  const name = admission.match(/^function (\w+)/)[1];
  const sound = source.match(/function (\w+)\((\w+)\)\{\w+\.useEffect\(\(\)=>\{\2&&\w+\.Tu\.PlayNotificationSound\(\2\)\},\[\2\]\)\}/);
  assert.ok(sound);
  let active = [];
  const played = [];
  const sandbox = {
    __trophyStyles: { notification: timing }, Ue: { 1: { displayToastAlone: false }, 2: { displayToastAlone: true } },
    a: { useState: () => [active, fn => { active = fn(active); }], useEffect: fn => fn(), useCallback: fn => fn },
    Q: { u6: () => false }, Ht: () => false, steamQuery: () => false,
    u: { PU: () => false, lf: () => null, $S: () => 0 },
    B: { a5() {}, OU: () => 0, W_: x => x, $v: x => x },
    s: { il: (items, item) => items.filter(value => value !== item) }, J: { wT: value => assert.ok(value) },
  };
  vm.runInNewContext(`${predicate[0]};globalThis.store=new(class {${methods}DispatchNextToast(){}SetContextRenderingToast(){}ClearAllToastNotifications(){}});${admission};${sound[0]};globalThis.admit=${name};globalThis.play=${sound[1]}`.replace(/\b(V|Re|st|c|ee|lt)\b/g, name => ({ V: 'Q', Re: 'Ht', st: 'steamQuery', c: 'u', ee: 'J', lt: 'Ue' })[name]), sandbox);
  const store = sandbox.store;
  store.m_mapAppOverlayToasts = new Map();
  store.PlayNotificationSound = toast => played.push(toast.data.achievement_id());
  sandbox.u.Tu = store;
  timing.setStyleEnabled(true);
  store.m_rgNotificationToasts = ['first', 'second', 'third'].map(notification);
  const mounted = new Set();
  const admit = () => {
    const result = sandbox.admit(0, true, false, 3);
    for (const toast of active) if (!mounted.has(toast)) { mounted.add(toast); sandbox.play(toast); }
    return result;
  };
  for (let index = 0; index < 3; index++) {
    const result = admit();
    assert.equal(active.length, 1);
    assert.equal(played.length, index + 1);
    admit();
    assert.equal(played.length, index + 1);
    result[1](active[0]);
  }
  admit();
  assert.equal(active.length, 0);
  assert.deepEqual(played, ['first', 'second', 'third']);
  active = [];
  store.m_rgNotificationToasts = [{ eType: 1, data: {} }, { eType: 1, data: {} }];
  sandbox.admit(0, true, false, 3);
  assert.equal(active.length, 2);
  assert.equal(timing.displayAlone({ data: { achieved: () => false } }), undefined);
  timing.setStyleEnabled(false);
  assert.equal(timing.displayAlone(notification('disabled')), undefined);
  timing.clearNotificationTiming();
});


test('duration updates never accumulate beyond the popup time limit', () => {
  timing.clearNotificationTiming();
  const toast = notification('bounded');
  timing.trackNotification(toast);
  for (let width = 1000; width < 100000; width += 1000) {
    timing.reportDuration('480:bounded', `Changed font metrics ${width}`, width, 450, false);
    assert.ok(toast.nToastDurationMS <= timing.maximumPopupDuration);
  }
  timing.clearNotificationTiming();
});

test('native entry normalizes SDK notification IDs while preserving existing IDs', async () => {
  const source = await readFile(steamBundle, 'utf8');
  const backend = await readFile('backend/main.lua', 'utf8');
  const patch = applySteamPatches(source, backend).changes.find(change => change.before.startsWith('ProcessNotification('));
  assert.ok(patch);
  const header = patch.after.match(/^ProcessNotification\((\w+),(\w+),(\w+)\)\{[\s\S]*?prepareNotification\?\.\(\2\);/)[0];
  const store = vm.runInNewContext(`({${header}}})`, { __trophyStyles: { notification: timing } });
  const events = [100, 101, 102].map(nNotificationID => ({ nNotificationID, data: { className: 'trophy-styles-test-toast' } }));
  for (const event of events) store.ProcessNotification({}, event, 0);
  assert.deepEqual(events.map(event => event.notificationID), [100, 101, 102]);
  const existing = { notificationID: 55, nNotificationID: 100, data: { className: 'trophy-styles-test-toast' } };
  store.ProcessNotification({}, existing, 0);
  assert.equal(existing.notificationID, 55);
});

test('native achievement replay serializes the selected title, ID, icon and description', async () => {
  const source = await readFile(steamBundle, 'utf8');
  const backend = await readFile('backend/main.lua', 'utf8');
  const patch = applySteamPatches(source, backend).changes.find(change => change.before.startsWith('async TestAchievement('));
  assert.ok(patch);
  const ctor = patch.after.match(/testTrophy=(\w+)\.(\w+)\.fromObject/);
  const type = patch.after.match(/m_nNextTestNotificationID\+\+,(\w+)\.(\w+)\.(\w+),testTrophy/);
  const calls = [];
  const sandbox = { [ctor[1]]: { [ctor[2]]: { fromObject: payload => ({ serializeBinary: () => payload }) } } };
  sandbox[type[1]] ??= {};
  sandbox[type[1]][type[2]] = { [type[3]]: 17 };
  const store = vm.runInNewContext(`({${patch.after}})`.replace(/\b(V|Re|st|c|ee|lt)\b/g, name => ({ V: 'Q', Re: 'Ht', st: 'steamQuery', c: 'u', ee: 'J', lt: 'Ue' })[name]), sandbox);
  store.m_nNextTestNotificationID = 500;
  store.OnNotification = (...args) => calls.push(args);
  const selected = { appid: 990080, achievement_id: 'CHALLENGE_ACCEPTED', name: 'Вызов принят', description: 'Пройти все уровни испытания', image_url: 'selected-icon', achieved: true };
  await store.TestAchievement(990080, false, selected);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 500);
  assert.deepEqual(calls[0][2], selected);
});


test('native fullscreen query refreshes between queued achievements without changing window focus', async () => {
  const source = await readFile(steamBundle, 'utf8');
  const backend = await readFile('backend/main.lua', 'utf8');
  const patched = applySteamPatches(source, backend).source;
  async function scenario(legacy, fullscreen = false) {
    let active = [];
    let clock = 0;
    let updatedAt = 0;
    let enabledBefore = false;
    let fullscreenResult = false;
    let requests = 0;
    const queryEnabled = [];
    const predicate = patched.match(/function (\w+)\((\w+)\)\{return globalThis\.__trophyStyles\?\.notification\?\.displayAlone[\s\S]*?displayToastAlone===!0\)\}/)[0];
    const start = patched.indexOf('BAnyToastDisplayAlone(');
    const methods = patched.slice(start, patched.indexOf('ClearAllToastNotifications()', start));
    const call = patched.indexOf('.PopNextToastNotification(');
    const admissionStart = patched.lastIndexOf('function ', call);
    let admission = patched.slice(admissionStart, patched.indexOf('function ', call));
    if (legacy) admission = admission.replace(/&&!globalThis\.__trophyStyles\?\.notification\?\.queueBlocked\?\.\(\w+\)/, '');
    const name = admission.match(/^function (\w+)/)[1];
    const queryStart = patched.lastIndexOf('function ', patched.indexOf('DefaultMonitorHasFullscreenWindow', call));
    const query = patched.slice(queryStart, patched.indexOf('function ', queryStart + 9));
    const sandbox = {
      __trophyStyles: { notification: timing }, Ue: { 1: { displayToastAlone: false } },
      a: { useState: () => [active, fn => { active = fn(active); }], useEffect: fn => fn(), useCallback: fn => fn },
      Q: { u6: () => false }, Ht: () => false,
      u: { PU: () => false, lf: () => sandbox.store.m_rgNotificationToasts[0], $S: () => 0 },
      B: { a5() {}, OU: () => 0, W_: x => x, $v: x => x },
      s: { il: (items, item) => items.filter(value => value !== item) }, J: { wT: value => assert.ok(value) },
      SteamClient: { Window: { DefaultMonitorHasFullscreenWindow: async () => { requests++; return fullscreen; } } },
      ze: { I: options => {
        queryEnabled.push(options.enabled);
        const stale = clock - updatedAt >= 5000;
        if (options.enabled && !enabledBefore && stale) {
          void options.queryFn().then(result => { fullscreenResult = result; updatedAt = clock; });
        }
        enabledBefore = options.enabled;
        return { data: fullscreenResult, isStale: stale };
      } },
    };
    vm.runInNewContext(`${predicate};globalThis.store=new(class {${methods}DispatchNextToast(){}SetContextRenderingToast(){}ClearAllToastNotifications(){this.m_rgNotificationToasts=[]}});${admission};${query};globalThis.admit=${name}`.replace(/\b(V|Re|st|c|ee|lt)\b/g, name => ({ V: 'Q', Re: 'Ht', st: 'steamQuery', c: 'u', ee: 'J', lt: 'Ue' })[name]), sandbox);
    sandbox.u.Tu = sandbox.store;
    sandbox.store.m_mapAppOverlayToasts = new Map();
    sandbox.store.m_rgNotificationToasts = ['one', 'two', 'three'].map(notification);
    timing.setStyleEnabled(true);
    const shown = [];
    for (let index = 0; index < 3; index++) {
      sandbox.admit(0, true, true, 3);
      if (!active.length) break;
      shown.push(active[0].data.achievement_id());
      sandbox.admit(0, true, true, 3);
      clock += 6000;
      const state = sandbox.admit(0, true, true, 3);
      state[1](active[0]);
      sandbox.admit(0, true, true, 3);
      await new Promise(resolve => setImmediate(resolve));
    }
    timing.setStyleEnabled(false);
    timing.clearNotificationTiming();
    return { shown, requests, queryEnabled };
  }
  const previous = await scenario(true);
  assert.deepEqual(previous.shown, ['one']);
  assert.equal(previous.requests, 0);
  const fixed = await scenario(false);
  assert.deepEqual(fixed.shown, ['one', 'two', 'three']);
  assert.equal(fixed.requests, 2);
  assert.ok(fixed.queryEnabled.includes(false));
  const suppressed = await scenario(false, true);
  assert.deepEqual(suppressed.shown, ['one']);
  assert.equal(suppressed.requests, 1);
});
