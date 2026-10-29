import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const result = await build({
  stdin: { contents: "export { notification } from './frontend/index.tsx'; export * from './frontend/test-popup.tsx'; export { updatePresentation } from './frontend/presentation'; export { TrophyCard } from './frontend/card'; export { trophyImages } from './frontend/ps5-assets';", resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, format: 'esm', jsx: 'automatic',
  plugins: [{
    name: 'steam-test-host',
    setup(builder) {
      builder.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true }));
      builder.onResolve({ filter: /^millennium$/ }, () => ({ path: 'millennium', namespace: 'host' }));
      builder.onLoad({ filter: /.*/, namespace: 'host' }, () => ({ contents: `
        import { createElement } from 'react';
        export const usePluginConfig = () => [globalThis.trophyTestEnabled, async () => {}];
        export const definePlugin = fn => fn;
        export const pluginConfig = { get: async () => true };
        export const subscribePluginConfig = () => () => {};
        export const Focusable = ({children}) => createElement('div', null, children);
        export const DialogButton = Focusable;
        export const Field = Focusable, ToggleField = Focusable, SliderField = Focusable;
        export const Dropdown = Focusable, TextField = Focusable;
        export const toaster = { toast(data) {
          globalThis.trophyTestToasts.push(data);
          return { dismiss() { globalThis.trophyTestDismissals++; } };
        } };
      ` }));
    },
  }],
});
const { notification, showTestPopup, showTestQueue, dismissTestPopup, TrophyCard, trophyImages, updatePresentation } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

updatePresentation('language', 'en');

test('matched trophies show their own grade icon beside the Steam title, including platinum', () => {
  for (const grade of ['bronze', 'silver', 'gold', 'platinum']) {
    const html = renderToStaticMarkup(createElement(TrophyCard, { achievement: { strName: 'Хоум-ран!', bAchieved: true, grade, ps5TrophyId: 'ps5:31' } }));
    const icon = html.match(/class="trophy-styles-grade-icon"[^>]*data-trophy-grade="([^"]+)"[^>]*><img src="([^"]+)"/);
    assert.ok(icon);
    assert.equal(icon[1], grade);
    assert.equal(icon[2], trophyImages[grade]);
    assert.ok(html.indexOf('trophy-styles-grade-icon') < html.indexOf('title="Хоум-ран!"'));
  }
});

function render({ enabled = true, achieved = true, location = 2, dismiss = true, name = 'A New Beginning' } = {}) {
  globalThis.trophyTestEnabled = enabled;
  updatePresentation('enabled', enabled);
  return renderToStaticMarkup(createElement(notification.AchievementToast, {
    location,
    onDismiss: dismiss ? () => {} : undefined,
    group: { notifications: [{ data: { achieved: () => achieved, name: () => name, image_url: () => '', appid: () => 480, achievement_id: () => "sample" } }] },
    nativeToast: () => createElement('span', null, 'Native achievement'),
  }));
}

test('earned desktop and gamepad toasts receive the PS5 card', () => {
  for (const location of [1, 2]) assert.match(render({ location }), /Trophy earned!/);
});

test('progress, tray items and non-dismissable views keep the native renderer', () => {
  for (const options of [{ achieved: false }, { location: 3 }, { location: 4 }, { dismiss: false }]) {
    assert.equal(render(options), '<span>Native achievement</span>');
  }
});

test('disabled or not-yet-loaded configuration preserves the native notification', () => {
  assert.equal(render({ enabled: false }), '<span>Native achievement</span>');
  globalThis.trophyTestEnabled = undefined;
  const markup = renderToStaticMarkup(createElement(notification.AchievementToast, {
    location: 2, group: { notifications: [] }, nativeToast: () => createElement('span', null, 'Native achievement'),
  }));
  assert.equal(markup, '<span>Native achievement</span>');
});

test('achievement names remain escaped text', () => {
  const markup = render({ name: '<script>alert(1)</script>' });
  assert.ok(!markup.includes('<script>'));
  assert.match(markup, /&lt;script&gt;/);
});

test('cards show the selected platform percentage, localize it and hide unavailable statistics', () => {
  const achievement = { strName: 'A real achievement', bAchieved: true, grade: 'bronze', steamPercent: 12.3, psnPercent: 0 };
  const render = value => renderToStaticMarkup(createElement(TrophyCard, { achievement: value }));
  updatePresentation('language', 'en');
  updatePresentation('raritySource', 'steam');
  assert.match(render(achievement), /Steam · 12\.3%/);
  updatePresentation('raritySource', 'psn');
  assert.match(render(achievement), /PSN · 0\.0%/);
  const fallback = render({ ...achievement, psnPercent: undefined });
  assert.match(fallback, /data-rarity-source="steam"/);
  assert.match(fallback, /Steam · 12\.3%/);
  updatePresentation('raritySource', 'off');
  assert.doesNotMatch(render(achievement), /trophy-styles-rarity/);
  updatePresentation('raritySource', 'psn');
  updatePresentation('language', 'ru');
  assert.match(render({ ...achievement, psnPercent: 8.1 }), /PSN · 8,1%/);
  updatePresentation('raritySource', 'steam');
  updatePresentation('language', 'en');
});

test('test button requests an expiring Steam popup with the shared card', () => {
  globalThis.window = { NotificationStore: { ProcessNotification() {} } };
  globalThis.trophyTestToasts = [];
  globalThis.trophyTestDismissals = 0;
  showTestPopup();
  const [toast] = globalThis.trophyTestToasts;
  assert.equal(toast.duration, 5000);
  assert.equal(toast.expiration, 6000);
  assert.equal(toast.showToast, true);
  assert.equal(toast.showNewIndicator, false);
  assert.equal(toast.eType, undefined);
  const markup = renderToStaticMarkup(toast.body);
  assert.match(markup, /First achievement/);
  assert.match(markup, /Your adventure begins\./);
  showTestPopup();
  assert.equal(globalThis.trophyTestDismissals, 1);
  globalThis.trophyTestToasts[1].onClick();
  assert.equal(globalThis.trophyTestDismissals, 2);
  dismissTestPopup();
  assert.equal(globalThis.trophyTestDismissals, 2);
});

test('test popup reports unavailable Steam notifications', () => {
  globalThis.window = {};
  globalThis.trophyTestToasts = [];
  assert.throws(showTestPopup, /Steam notifications are not ready/);
  assert.equal(globalThis.trophyTestToasts.length, 0);
});

test('platinum test carries its own sound grade and a longer animation lifetime', () => {
  globalThis.window = { NotificationStore: { ProcessNotification() {} } };
  globalThis.trophyTestToasts = [];
  showTestPopup('platinum');
  const [toast] = globalThis.trophyTestToasts;
  assert.equal(toast.body.props.achievement.grade, 'platinum');
  assert.equal(toast.duration, 7000);
  assert.equal(toast.expiration, 8000);
  assert.ok(toast.className.split(' ').includes('trophy-styles-grade-platinum'));
  const markup = renderToStaticMarkup(toast.body);
  assert.ok(markup.includes('class="trophy-styles-platinum-figure"'));
  dismissTestPopup();
});

test('a selected Steam achievement supplies its title and image without changing unlock state', () => {
  globalThis.window = { NotificationStore: { ProcessNotification() {} } };
  globalThis.trophyTestToasts = [];
  const selected = { strID: 'test-id', strName: 'Selected achievement', strImage: 'https://example.com/achievement.jpg', bAchieved: false };
  showTestPopup('silver', selected);
  const achievement = globalThis.trophyTestToasts[0].body.props.achievement;
  assert.equal(achievement.strName, selected.strName);
  assert.equal(achievement.strImage, selected.strImage);
  assert.equal(achievement.strID, selected.strID);
  assert.equal(achievement.grade, 'silver');
  assert.equal(achievement.bAchieved, true);
  assert.equal(selected.bAchieved, false);
  dismissTestPopup();
});


test('queue test enqueues three distinct previews without replacing earlier requests', () => {
  globalThis.window = { NotificationStore: { ProcessNotification() {} } };
  globalThis.trophyTestToasts = [];
  globalThis.trophyTestDismissals = 0;
  showTestQueue({ strName: 'Selected achievement', description: 'A real Steam objective', bAchieved: false });
  assert.equal(globalThis.trophyTestToasts.length, 3);
  const previews = globalThis.trophyTestToasts.map(toast => toast.body.props.achievement);
  assert.deepEqual(previews.map(item => item.strName), ['Selected achievement · 1/3', 'Selected achievement · 2/3', 'Selected achievement · 3/3']);
  assert.equal(new Set(previews.map(item => item.motionKey)).size, 3);
  assert.equal(globalThis.trophyTestDismissals, 0);
  dismissTestPopup();
  assert.equal(globalThis.trophyTestDismissals, 3);
});
