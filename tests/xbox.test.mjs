import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
import { buildXboxPreview } from '../scripts/build-xbox-preview.mjs';

const compiled = await build({ stdin: { contents: `export * from './frontend/xbox-catalog'; export * from './frontend/xbox-animation'; export * from './frontend/xbox-colors'; export { xboxIconScale, xboxTrophyPose } from './frontend/xbox-icons';`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm' });
const xbox = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const entry = (id, name, description = '', pack = 'base') => ({ id, name, description, pack, gamerscore: 30, category: 'Rare', percent: 9.47 });
const catalog = { version: 1, appid: 123, titleId: '456', name: 'Example', fetchedAt: Date.now(), achievements: [entry('1', 'First'), entry('2', 'Last'), entry('3', 'DLC', '', 'dlc')], matches: { FIRST: '1', LAST: '2', DLC: '3' } };

test('Xbox parses global rarity without substituting a community percentage or treating missing as zero', () => {
  const parsed = xbox.parseXboxAchievements(JSON.stringify({ achievements: [{ id: '1', name: 'Example', description: '', gamerscore: 0, rarityPct: '0.00', rarityCategory: 'Rare', packKind: 'base', xctPct: 88 }] }));
  assert.equal(parsed[0].percent, 0);
  assert.equal(parsed[0].category, 'Rare');
  assert.deepEqual(xbox.parseXboxAchievements({ achievements: [{ id: '1', name: 'Example', description: '', gamerscore: 0, rarityPct: '0.00', rarityCategory: 'Rare', packKind: 'base', xctPct: 88 }] }), parsed);
  for (const value of [null, '', ' ', 'NaN', '101', '-1']) {
    const items = xbox.parseXboxAchievements(JSON.stringify({ achievements: [{ id: '1', name: 'Example', description: '', gamerscore: 0, rarityPct: value, packKind: 'base' }] }));
    assert.equal(items[0].percent, undefined);
  }
  assert.throws(() => xbox.parseXboxAchievements('{"achievements":[]}'));
});

test('Xbox matching handles spelling differences with corroborating descriptions and rejects ambiguity', () => {
  const steam = [{ id: 'piano', name: 'Rachmaninoff', description: 'Hit the piano against the walls 5 times' }, { id: 'hand', name: 'John of Damascus', description: "Cut off Ilya's hand" }];
  const achievements = [entry('4', 'Rahmaninoff', 'Hit the piano against the wall 5 times'), entry('10', 'John Damascus', "Cut off Ilya's hand")];
  assert.deepEqual(xbox.matchXboxAchievements(steam, achievements), { piano: '4', hand: '10' });
  assert.deepEqual(xbox.matchXboxAchievements([{ id: 'a', name: 'Same', description: '' }], [entry('1', 'Same'), entry('2', 'Same')]), {});
  assert.deepEqual(xbox.matchXboxAchievements([{ id: 'a', name: 'Same', description: '' }, { id: 'b', name: 'Same', description: '' }], [entry('1', 'Same')]), {});
  assert.deepEqual(xbox.matchXboxAchievements([{ id: 'a', name: 'Rachmaninoff', description: 'A different objective completely' }], achievements), {});
});

test('Xbox game search accepts exact game titles despite store flags and excludes add-ons and other games', () => {
  const item = { title: 'Hades', productKind: 'Game', hasAchievements: true, xboxTitleId: '123' };
  const products = [item, item, { ...item, isBundle: true, xboxTitleId: '456' }, { ...item, productKind: 'Durable', xboxTitleId: '789' }, { ...item, title: 'Hades II', xboxTitleId: '999' }];
  const expected = [{ titleId: '123', name: 'Hades' }, { titleId: '456', name: 'Hades' }];
  assert.deepEqual(xbox.parseXboxCandidates(JSON.stringify({ products }), 'Hades'), expected);
  assert.deepEqual(xbox.parseXboxCandidates({ products }, 'Hades'), expected);
  const resynced = { ...item, title: "Assassin's Creed Black Flag Resynced", isBundle: true, hasAchievements: false, xboxTitleId: '1661962317' };
  assert.deepEqual(xbox.parseXboxCandidates({ products: [resynced, { ...resynced, title: 'Assassin’s Creed IV Black Flag' }, { ...resynced, productKind: 'Durable' }] }, resynced.title),
    [{ titleId: '1661962317', name: resynced.title }]);
});

test('Mythic uses a fully mapped base set and falls back to every Steam achievement', () => {
  const list = [{ strID: 'FIRST', bAchieved: true }, { strID: 'LAST', bAchieved: false }, { strID: 'DLC', bAchieved: false }];
  const mythic = xbox.xboxCompletion(catalog, list, new Set(['LAST']));
  assert.equal(mythic.xboxVariant, 'mythic');
  assert.equal(mythic.completionBaseGame, true);
  assert.equal(mythic.completionCount, 2);
  assert.equal(xbox.xboxCompletion(undefined, list, new Set(['LAST'])), undefined);
  assert.equal(xbox.xboxCompletion({ ...catalog, matches: { FIRST: '1' } }, list, new Set(['LAST'])), undefined);
  const fallback = xbox.xboxCompletion(undefined, list, new Set(['LAST', 'DLC']));
  assert.equal(fallback.completionBaseGame, false);
  assert.equal(fallback.completionCount, 3);
  assert.equal(xbox.xboxCompletion(catalog, [], new Set()), undefined);
  assert.equal(xbox.xboxCompletion(undefined, [{ bAchieved: true }], new Set()), undefined);
});

test('unmatched Xbox achievements remain ordinary without false Xbox percentages or Gamerscore', () => {
  assert.deepEqual(xbox.xboxMetadata(catalog, 'unknown'), { xboxVariant: 'normal' });
  assert.deepEqual(xbox.xboxMetadata(catalog, 'FIRST'), { xboxVariant: 'rare', xboxPercent: 9.47, xboxGamerscore: 30, xboxAchievementId: '1' });
});

test('Xbox retries failed requests immediately and a broken edition or cache does not block a valid match', async () => {
  const bundle = await build({ entryPoints: ['frontend/xbox-catalog.ts'], bundle: true, write: false, format: 'iife', globalName: 'XboxCatalog' });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
  const page = await browser.newPage();
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(async () => {
  const appid = 812345, queries = [
    { queryKey: ['achievements', appid, 'schema'], state: { data: { groups: [{ achievements: [{ api_name: 'FIRST', name: 'First', description: 'A unique objective' }] }] } } },
    { queryKey: ['StoreItem', `app_${appid}`], state: { data: { id: appid, name: 'Example' } } },
  ];
  let searches = 0;
  window.backend = {
    readPublicXboxCache() { throw new Error('Cache unavailable'); },
    writePublicXboxCache() { throw new Error('Cache unavailable'); },
    getPublicSteamAchievements: async () => '<script id="valve-ssr-data" type="application/json">' + JSON.stringify({ renderContext: { queryData: JSON.stringify({ queries }) } }) + '</script>',
    searchPublicXboxGames: async () => {
      if (++searches === 1) throw new Error('xct.live returned HTTP 503');
      return { products: ['111', '222'].map(xboxTitleId => ({ title: 'Example', productKind: 'Game', isBundle: true, hasAchievements: false, xboxTitleId })) };
    },
    getPublicXboxAchievements: async id => {
      if (id === '111') throw new Error('xct.live returned HTTP 404');
      return { achievements: [{ id: '1', name: 'First', description: 'A unique objective', gamerscore: 50, rarityPct: 7.58, packKind: 'base' }] };
    },
  };
  let error;
  try { await window.XboxCatalog.loadXboxCatalog(appid); } catch (reason) { error = reason.message; }
  const loaded = await window.XboxCatalog.loadXboxCatalog(appid);
  await window.XboxCatalog.loadXboxCatalog(appid);
  const cachedSearches = searches;
  await window.XboxCatalog.loadXboxCatalog(appid, true);
  return { error, loaded, cachedSearches, searches };
  });
  assert.match(result.error, /Xbox search: xct.live returned HTTP 503/);
  assert.equal(result.loaded.titleId, '222');
  assert.equal(result.loaded.matches.FIRST, '1');
  assert.equal(result.cachedSearches, 2);
  assert.equal(result.searches, 3);
  } finally { await browser.close(); }
});

test('Xbox colors default to green and reject malformed saved values', () => {
  assert.equal(xbox.defaultXboxColor, '#107c10');
  for (const value of [undefined, null, '', 'orange', '#abc', '#1234567', 'url(example)']) assert.equal(xbox.normalizeXboxColor(value), '#107c10');
  assert.equal(xbox.normalizeXboxColor('#ABCDEF'), '#abcdef');
  assert.equal(xbox.xboxTheme('#ffffff').foreground, '#111111');
  assert.equal(xbox.xboxTheme('#107c10').foreground, '#ffffff');
  assert.equal(xbox.xboxTheme('#107c10').hue, 120);
  assert.equal(new Set(xbox.xboxPalette.map(item => item.color)).size, xbox.xboxPalette.length);
});

test('Xbox vector icons hold their scale through old flipbook transitions and exit continuously', () => {
  for (const hideAt of [6.2, 6.8]) {
    for (const time of [1.333, 2.499, 2.5, 2.6, 2.7, hideAt, hideAt + 0.767]) assert.equal(xbox.xboxIconScale(time, hideAt), 1);
    for (const time of [0.7, 1.067, 1.333, hideAt, hideAt + 0.767, hideAt + 1.367]) {
      assert.ok(Math.abs(xbox.xboxIconScale(time - 0.00001, hideAt) - xbox.xboxIconScale(time + 0.00001, hideAt)) < 0.001);
    }
    assert.equal(xbox.xboxIconScale(0, hideAt), 0);
    assert.equal(xbox.xboxIconScale(hideAt + 1.4, hideAt), 0);
  }
});

test('normal Xbox logo turns into a sideways trophy, spins and settles before the pill finishes opening', () => {
  assert.deepEqual(xbox.xboxTrophyPose(1), { closing: 0, morph: 0, angle: -Math.PI * 1.5 });
  assert.equal(xbox.xboxTrophyPose(1.47).closing, 1);
  assert.equal(xbox.xboxTrophyPose(1.47).morph, 0);
  assert.ok(Math.abs(xbox.xboxTrophyPose(1.51).morph - 0.5) < 0.00001);
  assert.equal(xbox.xboxTrophyPose(1.54).morph, 1);
  assert.ok(Math.abs(Math.cos(xbox.xboxTrophyPose(1.54).angle)) < 0.00001);
  assert.ok(Math.abs(Math.cos(xbox.xboxTrophyPose(1.54 + 0.34 / 3).angle) + 1) < 0.00001);
  assert.equal(xbox.xboxTrophyPose(1.9).angle, 0);
  assert.equal(xbox.xboxFrameState('normal', 1.9, 400)('ToastBackground', 'sx'), 1);
  assert.equal(xbox.xboxFrameState('normal', 1.9, 400)('TextGrid', 'op'), 1);
  assert.equal(xbox.xboxTrophyPose(6.2, 6.2).morph, 1);
  assert.equal(xbox.xboxTrophyPose(6.4, 6.2).morph, 0);
  assert.equal(xbox.xboxTrophyPose(6.6, 6.2).closing, 0);
});

test('Xbox console frames retain extracted hashes and Mythic keeps its original ambient loop', async () => {
  const manifest = JSON.parse(await readFile('resources/xbox/sources.json', 'utf8'));
  for (const file of manifest.files) assert.equal(createHash('sha256').update(await readFile(`resources/xbox/${file.name}`)).digest('hex'), file.sha256);
  const intro = xbox.xboxFlipbook('rare', 'IconIntroSequence');
  assert.equal(intro.FrameWidth, '120');
  assert.equal(intro.DesiredFrameRate, '50');
  assert.equal(xbox.spriteFrame(intro, 0.8), 40);
  const consoleSources = JSON.parse(await readFile('resources/xbox/console-sources.json', 'utf8'));
  for (const asset of Object.values(consoleSources.assets)) {
    assert.equal(createHash('sha256').update(await readFile(`resources/xbox/${asset.file}`)).digest('hex'), asset.sha256);
  }
  assert.ok(xbox.spriteFrame(intro, 2) > 1);
  const idle = xbox.xboxFlipbook('mythic', 'IconAmbientBase');
  assert.equal(xbox.spriteFrame(idle, 0.5), xbox.spriteFrame(idle, 2.5));
  const opening = xbox.xboxFrameState('normal', 0, 400);
  assert.equal(opening('ToastBackground', 'sx'), 0);
  const expanded = xbox.xboxFrameState('normal', 3, 400);
  assert.equal(expanded('ToastBackground', 'sx'), 1);
  assert.equal(expanded('ImageGrid', 'tx'), -215);
  assert.equal(xbox.xboxFrameState('normal', 8, 400)('ToastBackground', 'vis'), 0);
});

test('Xbox runtime shares catalog requests and pins metadata, duration and placement for a live popup', async () => {
  const runtime = await build({ stdin: { contents: `export * from './frontend/xbox-catalog'; export * from './frontend/live-trophies'; export * from './frontend/presentation'; export * from './frontend/desktop-layout';`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', globalName: 'XboxRuntime' });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: runtime.outputFiles[0].text });
    const result = await page.evaluate(async () => {
      const calls = [], api = window.XboxRuntime;
      const queries = [
        { queryKey: ['achievements', 777, 'schema'], state: { data: { groups: [{ achievements: [{ api_name: 'FIRST', name: 'First', description: 'A unique objective' }] }] } } },
        { queryKey: ['StoreItem', 'app_777'], state: { data: { id: 777, name: 'Example' } } },
      ];
      const schema = '<script id="valve-ssr-data" type="application/json">' + JSON.stringify({ renderContext: { queryData: JSON.stringify({ queries }) } }) + '</script>';
      window.backend = {
        readPublicXboxCache: async () => '',
        writePublicXboxCache: async (_id, data) => { window.xboxCache = data; return true; },
        getPublicSteamAchievements: async () => { calls.push('steam'); return schema; },
        searchPublicXboxGames: async () => { calls.push('search'); return JSON.stringify({ products: [{ title: 'Example', productKind: 'Game', isBundle: false, hasAchievements: true, xboxTitleId: '456' }] }); },
        getPublicXboxAchievements: async () => { calls.push('xbox'); return JSON.stringify({ achievements: [{ id: '1', name: 'First', description: 'A unique objective', gamerscore: 50, rarityPct: '7.58', rarityCategory: 'Rare', packKind: 'base' }] }); },
      };
      api.updatePresentation('notificationStyle', 'xbox');
      api.setStyleEnabled(true);
      const oldData = { appid: () => 777, achievement_id: () => 'FIRST', achieved: () => true };
      const initial = api.liveXbox(oldData);
      const first = api.loadXboxCatalog(777), shared = first === api.loadXboxCatalog(777);
      await first;
      const fresh = { data: { ...oldData } };
      const metadata = api.liveXbox(fresh.data);
      const size = api.desktopSize(fresh, 777);
      api.beginNotification(fresh);
      const position = api.desktopPosition(fresh, { m_usable: { m_nLeft: 0, m_nTop: 0, m_nWidth: 1920, m_nHeight: 1080 } }, 1, []);
      api.updatePresentation('notificationStyle', 'ps5');
      const pinnedSize = api.desktopSize(fresh, 777);
      return { initial, frozen: api.liveXbox(oldData), metadata, size, pinnedSize, position, duration: fresh.nToastDurationMS, calls, shared, cached: JSON.parse(window.xboxCache) };
    });
    assert.equal(result.shared, true);
    assert.deepEqual(result.initial, { xboxVariant: 'normal' });
    assert.deepEqual(result.frozen, { xboxVariant: 'normal' });
    assert.equal(result.metadata.xboxVariant, 'rare');
    assert.equal(result.metadata.xboxPercent, 7.58);
    assert.equal(result.metadata.xboxGamerscore, 50);
    assert.deepEqual(result.size, { width: 672, height: 294 });
    assert.deepEqual(result.pinnedSize, result.size);
    assert.deepEqual(result.position, { left: 624, top: 762 });
    assert.equal(result.duration, 9000);
    assert.deepEqual(result.calls, ['steam', 'search', 'xbox']);
    assert.equal(result.cached.matches.FIRST, '1');
  } finally { await browser.close(); }
});

test('Xbox canvas renders all three variants offline with reduced motion and local preview output', async () => {
  const html = await buildXboxPreview();
  // Readback can switch Chromium's rasterizer during pixel comparisons.
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-accelerated-2d-canvas'] });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 960 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.setContent(html);
    await page.waitForFunction(() => document.querySelectorAll('canvas[data-xbox-time="3.400"]').length === 3);
    const iconBundle = await build({ entryPoints: ['frontend/xbox-icons.ts'], bundle: true, write: false, format: 'iife', globalName: 'XboxIcons' });
    await page.addScriptTag({ content: iconBundle.outputFiles[0].text });
    const stages = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 200; canvas.height = 200;
      const context = canvas.getContext('2d'); context.scale(2, 2);
      return [1.1, 1.47, 1.54, 1.54 + 0.34 / 3, 1.54 + 0.34 * 2 / 3, 1.88, 6.8].map(time => {
        context.clearRect(0, 0, 100, 100);
        window.XboxIcons.drawXboxNormalIcon(context, time, 6.2);
        const pixels = context.getImageData(0, 0, 200, 200).data;
        let white = 0;
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 245 && pixels[i + 1] > 245 && pixels[i + 2] > 245 && pixels[i + 3] > 245) white++;
        return white;
      });
    });
    assert.ok(stages[1] > stages[0] * 1.2, JSON.stringify(stages));
    assert.ok(stages[3] > stages[2] + 100, JSON.stringify(stages));
    assert.equal(stages[2], stages[4]);
    assert.equal(stages[3], stages[5]);
    assert.ok(Math.abs(stages[0] - stages[6]) < stages[0] * 0.005, JSON.stringify(stages));
    const images = await page.locator('canvas').evaluateAll(nodes => nodes.map(node => {
      const data = node.getContext('2d').getImageData(0, 0, node.width, node.height).data;
      let pixels = 0; for (let i = 3; i < data.length; i += 4) if (data[i] > 0) pixels++;
      return pixels;
    }));
    assert.ok(images.every(count => count > 12000), images.join(','));
    assert.deepEqual(await page.locator('canvas').evaluateAll(nodes => nodes.map(node => ({ width: node.clientWidth, height: node.clientHeight }))),
      Array.from({ length: 3 }, () => ({ width: 672, height: 294 })));
    assert.ok(await page.locator('canvas').evaluateAll(nodes => nodes.every(node => node.width >= node.clientWidth * 2)));
    assert.deepEqual(errors, []);
    const textAndGlow = await page.evaluate(() => {
      const canvas = document.querySelector('[data-xbox-variant="mythic"] canvas');
      const context = canvas.getContext('2d'), ratio = canvas.width / canvas.clientWidth;
      const title = "Assassin's Creed Black Flag Resynced: a very long achievement name with its final words visible";
      const description = 'Complete every challenge across all regions and discover every hidden treasure before returning to the starting island for the final reward.';
      const drawn = [];
      const fillText = context.fillText.bind(context);
      context.fillText = (text, ...args) => { drawn.push(text); fillText(text, ...args); };
      window.XboxPreview.drawXboxCard(context, 'mythic', 4.9, ['Мифическое достижение получено', title, description], 8.6);
      const titleRows = drawn.slice(1);
      drawn.length = 0;
      window.XboxPreview.drawXboxCard(context, 'mythic', 8.2, ['Мифическое достижение получено', title, description], 8.6);
      context.fillText = fillText;
      const borders = [context.getImageData(0, 0, canvas.width, 1), context.getImageData(0, canvas.height - 1, canvas.width, 1),
        context.getImageData(0, 0, 1, canvas.height), context.getImageData(canvas.width - 1, 0, 1, canvas.height)];
      const edgeAlpha = Math.max(...borders.flatMap(border => Array.from(border.data).filter((_, index) => index % 4 === 3)));
      const capture = time => {
        window.XboxPreview.drawXboxCard(context, 'mythic', time, ['Мифическое достижение получено', title, description], 8.6);
        return context.getImageData(235 * ratio, 142 * ratio, 300 * ratio, 40 * ratio).data;
      };
      const start = capture(2.3), end = capture(4.9);
      return { titleRows, descriptionRows: drawn, edgeAlpha, changed: start.some((value, index) => value !== end[index]) };
    });
    assert.ok(textAndGlow.titleRows.join(' ').includes('final words visible'));
    assert.ok(textAndGlow.descriptionRows.join(' ').includes('final reward.'));
    assert.ok(textAndGlow.titleRows.every(row => !row.includes('…')));
    assert.ok(textAndGlow.changed, 'Long titles scroll to their final rows');
    assert.ok(textAndGlow.edgeAlpha <= 2, `Glow must fade before the window edge: ${textAndGlow.edgeAlpha}`);
    await page.evaluate(() => window.renderAt('mythic', 3.4));
    const whiteTrophyPixels = await page.locator('[data-xbox-variant="normal"] canvas').evaluate(canvas => {
      const ratio = canvas.width / canvas.clientWidth;
      const pixels = canvas.getContext('2d').getImageData(70 * ratio, 112 * ratio, 190 * ratio, 70 * ratio).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 245 && pixels[i + 1] > 245 && pixels[i + 2] > 245 && pixels[i + 3] > 245) count++;
      return count;
    });
    assert.ok(whiteTrophyPixels > 100, `White trophy pixels: ${whiteTrophyPixels}`);
    await page.screenshot({ path: 'dist/xbox-preview.png', fullPage: true });
    const defaultColors = await page.locator('canvas').evaluateAll(nodes => nodes.map(node => {
      const ratio = node.width / node.clientWidth;
      return Array.from(node.getContext('2d').getImageData(420 * ratio, 118 * ratio, 1, 1).data);
    }));
    assert.ok(defaultColors.every(([red, green, blue, alpha]) => green > red * 2 && green > blue * 2 && alpha > 240));
    await page.evaluate(() => window.setXboxColor('#0037da'));
    await page.waitForFunction(() => [...document.querySelectorAll('canvas')].every(node => {
      const ratio = node.width / node.clientWidth;
      const [red, green, blue] = node.getContext('2d').getImageData(420 * ratio, 118 * ratio, 1, 1).data;
      return blue > red * 2 && blue > green * 2;
    }));
    assert.equal(await page.locator('canvas[data-xbox-time="3.400"]').count(), 3);
    await page.locator('.trophy-styles-xbox-card').evaluateAll(nodes => {
      nodes.forEach(node => { node.style.zoom = '2.5'; }); window.dispatchEvent(new Event('resize'));
    });
    await page.waitForFunction(() => [...document.querySelectorAll('canvas')].every(node => node.width >= node.getBoundingClientRect().width * devicePixelRatio));
    await page.locator('.trophy-styles-xbox-card').evaluateAll(nodes => {
      nodes.forEach(node => { node.style.zoom = '1'; }); window.dispatchEvent(new Event('resize'));
    });
    await page.waitForFunction(() => [...document.querySelectorAll('canvas')].every(node => node.width === 1344));
    const continuity = await page.evaluate(() => {
      const capture = (kind, time) => {
        window.renderAt(kind, time);
        const canvas = document.querySelector(`[data-xbox-variant="${kind}"] canvas`), ratio = canvas.width / canvas.clientWidth;
        return canvas.getContext('2d').getImageData(70 * ratio, 112 * ratio, 190 * ratio, 70 * ratio).data;
      };
      const difference = (a, b) => a.reduce((sum, channel, index) => sum + Math.abs(channel - b[index]), 0);
      const normal = capture('normal', 2.49);
      return {
        trophy: [2.5, 2.6, 2.7, 3.4].map(time => difference(normal, capture('normal', time))),
        diamond: [2.5, 2.6, 2.64, 2.7, 3.3, 5.28].map(time => difference(capture('rare', time - 0.00001), capture('rare', time + 0.00001))),
      };
    });
    assert.ok(continuity.trophy.every(value => value === 0), JSON.stringify(continuity));
    assert.ok(continuity.diamond.every(value => value < 3000), JSON.stringify(continuity));
    const phases = await page.evaluate(() => ['normal', 'rare', 'mythic'].map(kind => [0, 0.9, 2, 3.4, 5, 7, 11].map(time => {
      window.renderAt(kind, time);
      const canvas = document.querySelector(`[data-xbox-variant="${kind}"] canvas`);
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) count++;
      return count;
    })));
    for (const counts of phases) {
      assert.equal(counts[0], 0);
      assert.ok(counts[3] > 12000);
      assert.equal(counts[6], 0);
    }
  } finally { await browser.close(); }
});
