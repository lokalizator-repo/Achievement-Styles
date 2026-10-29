import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

test('packed frontend opens settings without router components and ignores the removed manual grade setting', async () => {
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const compiler = resolve(`node_modules/@steambrew/starlight/binaries/starlight-${process.platform}-${process.arch}${suffix}`);
  const source = execFileSync(compiler, ['-i', 'dist/trophy-styles.star', '-q', 'frontend:bundle.js'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const panel = ({ label, children }) => React.createElement('div', null, label, children);
  const messages = [];
  const reads = [];
  const subscriptions = new Map();
  const config = new Map(Object.entries({ showProgress: false, gameProfiles: '{}', enabled: true, notificationStyle: 'ps4', xboxColor: '#107c10', matchPlayStation: false, trophyGrade: 'gold', completionPlatinum: true, language: 'en', subtitleMode: 'description', raritySource: 'steam', popupCorner: 'top-right', popupDuration: 'auto', soundVolume: 100 }));
  const played = [];
  class Audio {
    constructor(uri) { this.uri = uri; }
    load() {}
    pause() {}
    removeAttribute() {}
    addEventListener() {}
    play() { played.push(this.uri); return Promise.resolve(); }
  }

  const window = {
    MILLENNIUM_API: {
      definePlugin: factory => factory,
      ffi: (_id, key) => async () => `data:audio/wav;base64,${key === 'getPs4TrophySoundUri' ? 'cHM0' : key === 'getPlatinumSoundUri' ? 'cGxhdA==' : 'c3Rk'}`,
      usePluginConfig: (_id, key) => [config.get(key), async value => config.set(key, value)],
      pluginConfig: { get: async (...args) => { reads.push(args); return config.get(args[1]); } },
      subscribePluginConfig: (id, callback) => { subscriptions.set(id, callback); return () => subscriptions.delete(id); },
      Field: panel,
      ToggleField: panel,
      DialogButton: ({ children }) => React.createElement('button', null, children),
      Focusable: panel,
      Dropdown: ({ selectedOption, rgOptions }) => React.createElement('select', { defaultValue: selectedOption },
        rgOptions.map(option => React.createElement('option', { key: option.data, value: option.data }, option.label))),
      TextField: panel,
      SliderField: panel,
    },
    SP_REACT: React,
    SP_JSX_FACTORY: jsxRuntime,
  };
  for (const name of ['Tabs', 'PanelSection', 'DialogButtonPrimary']) {
    Object.defineProperty(window.MILLENNIUM_API, name, { get() { throw new Error(`Settings must not depend on ${name}`); } });
  }
  vm.runInNewContext(source, { window, AbortController, Audio, performance, setInterval, clearInterval, MILLENNIUM_BACKEND_IPC: { postMessage: (...args) => messages.push(args) } }, { filename: 'packed-trophy-styles.js', timeout: 1000 });
  await new Promise(resolve => setImmediate(resolve));

  const settings = window.MILLENNIUM_SIDEBAR_NAVIGATION_PANELS['local.trophy-styles'];
  assert.ok(settings, 'The actual .star frontend must register its settings panel');
  assert.equal(typeof window.PLUGIN_LIST['local.trophy-styles'].notification.AchievementToast, 'function');
  assert.match(renderToStaticMarkup(settings.content), /Test sound/);
  assert.match(renderToStaticMarkup(settings.content), /Settings.*Preview/);
  assert.doesNotMatch(renderToStaticMarkup(settings.content), /value="diagnostics"/);
  assert.doesNotMatch(renderToStaticMarkup(settings.content), /Trophy icon|Manual grade|Show test popup|Check sources/);
  assert.equal(messages.length, 1);
  assert.ok(reads.length >= 5);
  for (const args of reads) {
    assert.equal(args.length, 2, 'Starlight already injects the plugin ID into config calls');
    assert.equal(args[0], 'local.trophy-styles');
    assert.ok(config.has(args[1]));
  }
  const changed = subscriptions.get('local.trophy-styles');
  assert.equal(typeof changed, 'function');
  const api = window.PLUGIN_LIST['local.trophy-styles'].notification;
  window.MILLENNIUM_API.usePluginConfig = () => { throw new Error('A newly mounted toast must use initialized settings'); };
  const renderEarned = () => renderToStaticMarkup(React.createElement(api.AchievementToast, {
    location: 1, onDismiss() {},
    group: { notifications: [{ data: {
      achieved: () => true, appid: () => 362680, achievement_id: () => 'real-id',
      name: () => 'Real achievement', description: () => 'Real objective', image_url: () => '',
    } }] },
    nativeToast: () => React.createElement('span', null, 'Native achievement'),
  }));
  assert.doesNotMatch(renderEarned(), /data-trophy-grade=/);
  assert.doesNotMatch(renderEarned(), /Native achievement/);
  assert.match(renderEarned(), /data-notification-style="ps4"/);
  assert.match(renderEarned(), /trophy-styles-ps4-heading/);
  assert.match(renderEarned(), /Real objective/);
  assert.equal(api.playNotificationSound({ data: { achieved: () => true } }, () => assert.fail('PS4 audio must be available from the packed backend')), true);
  assert.ok(played.at(-1).endsWith('cHM0'));
  changed('notificationStyle', 'ps5');
  assert.match(renderEarned(), /data-notification-style="ps5"/);
  assert.doesNotMatch(renderEarned(), /class="trophy-styles-earned"/);
  changed('notificationStyle', 'invalid');
  assert.match(renderEarned(), /data-notification-style="ps5"/);
  const earned = { data: { achieved: () => true, appid: () => 362680, achievement_id: () => 'real-id' } };
  assert.equal(api.desktopSize(earned)?.width, 680, 'Real earned achievements must enable the same layout as custom tests');
  assert.equal(api.displayAlone(earned), true);
  let nativeSounds = 0;
  assert.equal(api.playNotificationSound(earned, () => nativeSounds++), true);
  assert.equal(played.length, 2);
  assert.equal(nativeSounds, 0);
  changed('trophyGrade', 'platinum');
  assert.doesNotMatch(renderEarned(), /class="trophy-styles-card trophy-styles-platinum"|data-trophy-grade=/);
  assert.equal(api.playNotificationSound({ data: { achieved: () => true } }, () => nativeSounds++), true);
  assert.ok(played.at(-1).endsWith('c3Rk'));
  changed('enabled', false);
  assert.equal(renderEarned(), '<span>Native achievement</span>');
  assert.equal(api.desktopSize(earned), undefined);
  changed('enabled', true);
  assert.equal(api.desktopSize(earned)?.width, 680);
  settings.onDismount();

});
