import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const result = await build({
  stdin: { contents: `import {showTestPopup} from './frontend/test-popup'; window.previewSelectedAchievement=()=>showTestPopup(window.previewAchievement.grade,window.previewAchievement); import * as catalog from './frontend/public-catalog'; import plugin, {notification} from './frontend/index'; import * as presentation from './frontend/presentation'; import * as timing from './frontend/notification-timing'; import * as monitorScale from './frontend/monitor-scale'; import {setStyleEnabled} from './frontend/desktop-layout'; import {createRoot} from 'react-dom/client'; import React from 'react'; import {ScrollingSubtitle} from './frontend/scrolling-subtitle'; window.mountSubtitle=(text,active=true)=>{window.subtitleRoot??=createRoot(document.getElementById('root'));window.subtitleRoot.render(React.createElement(ScrollingSubtitle,{text,active}))}; window.monitorScale=monitorScale;window.notification=notification;window.timing=timing;window.catalog=catalog;window.presentation=presentation;window.mountNative=(appid,id,description,location=1,image='')=>{setStyleEnabled(true);window.nativeNotification={nToastDurationMS:5000,data:{appid:()=>appid,achievement_id:()=>id,achieved:()=>true,global_achieved_pct:()=>window.nativePercent,name:()=>'<Real Steam title>',description:description===undefined?undefined:()=>description,image_url:()=>image}};timing.trackNotification(window.nativeNotification);if(location===2)notification.desktopSize(window.nativeNotification,appid);createRoot(document.getElementById('root')).render(React.createElement(notification.AchievementToast,{location,onDismiss(){},group:{notifications:[window.nativeNotification]},nativeToast:()=>null}))}; window.mount=async()=>{const p=await plugin();createRoot(document.getElementById('root')).render(p.content)};`, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, format: 'esm', jsx: 'automatic',
  plugins: [{ name: 'sdk', setup(builder) {
    builder.onLoad({ filter: /card-preview\.tsx$/ }, async args => ({
      contents: (await readFile(args.path, 'utf8')).replace('  const { notificationStyle }', '  window.previewAchievement = achievement; const { notificationStyle }'),
      loader: 'tsx',
    }));
    builder.onResolve({ filter: /^millennium$/ }, () => ({ path: 'sdk', namespace: 'host' }));
    builder.onLoad({ filter: /.*/, namespace: 'host' }, () => ({ resolveDir: process.cwd(), contents: `
      import React,{useState} from 'react';
      export const definePlugin=fn=>fn;
      export const pluginConfig={get:async key=>window.activityConfig?.[key]??(key==='enabled'||key==='completionPlatinum'?true:'silver'),set:async(key,value)=>{window.activityConfig??={};window.activityConfig[key]=value;}};
      export const subscribePluginConfig=()=>()=>{};
      export const usePluginConfig=key=>{const[value,setValue]=useState(window.activityConfig?.[key]??(key==='enabled'||key==='completionPlatinum'?true:'silver'));return[value,async next=>{setValue(next);window.configWrites.push([key,next]);}];};
      export const Field=({label,description,children})=>React.createElement('div',null,label,description,children);
      export const SliderField=({label,value,min,max,step,onChange})=>React.createElement('input',{type:'range','aria-label':label,value,min,max,step,onChange:e=>onChange(Number(e.target.value))});
      export const Focusable=({children})=>React.createElement('div',null,children);
      export const ToggleField=({label,checked,onChange})=>React.createElement('label',null,label,React.createElement('input',{type:'checkbox',checked,onChange:e=>onChange(e.target.checked)}));
      export const DialogButton=({children,...props})=>React.createElement('button',props,children);
      export const TextField=({label,...props})=>React.createElement('input',{'aria-label':label,...props});
      export function Dropdown({rgOptions,selectedOption,strDefaultLabel,disabled,onChange}){const[open,setOpen]=useState(false);return React.createElement('div',{className:'host-dropdown'},React.createElement('button',{disabled,onClick:()=>setOpen(!open)},rgOptions.find(o=>o.data===selectedOption)?.label??strDefaultLabel??'Choose'),open&&React.createElement('div',{role:'listbox'},rgOptions.map(o=>React.createElement('button',{key:o.data,role:'option',onClick:()=>{onChange(o);setOpen(false)}},o.label))));}
      export const toaster={toast:options=>{window.lastToast={...options,achievement:options.body.props.achievement};return {dismiss(){}};}};
    ` }));
  } }],
});

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/3ioAAAAASUVORK5CYII=';
const titles = ['First Step', 'The Ending', 'All Trophies'];
const steamPage = (appid, name, names = titles) => {
  const queries = [
    { queryKey: ['achievements', appid, 'schema'], state: { data: { groups: [{ achievements: names.map((name, i) => ({ api_name: `ID_${i}`, name, description: `A unique objective for ${name}`, archived: false })) }] } } },
    { queryKey: ['StoreItem', `app_${appid}`, 'default_info'], state: { data: { id: appid, name } } },
  ];
  return `<script id="valve-ssr-data" type="application/json">${JSON.stringify({ renderContext: { queryData: JSON.stringify({ queries }) } })}</script>`;
};
const trophyPage = titles.map((name, i) => `<table><thead><tr><th>Sony Percent Earned</th><th>Image</th><th>Title</th><th>Percent Earned</th></tr></thead><tbody><tr><td>${[8.1, 0, 100][i]}</td><td><img class="trophy-image standard round" src="https://np.sentl.com/images/games/test/s/icon${i}.png"></td><td><span class="title ${['bronze', 'gold', 'platinum'][i]}"></span><a id="trophytitle${i + 1}">${name}</a><div id="trophydescription${i + 1}">A unique objective for ${name}</div></td><td>84.2%</td></tr></tbody></table>`).join('');
const fixtures = {
  steam: { 1245620: steamPage(1245620, 'ELDEN RING™'), 1145360: steamPage(1145360, 'Hades'), 990080: steamPage(990080, 'Hogwarts Legacy', titles.slice(0, 2)) },
  trophyPage, pixel,
};
let browser;
before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }); });
after(async () => { await browser?.close(); });

async function host(run, options = {}) {
  const page = await browser.newPage();
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    if (route.request().url().startsWith('https://np.sentl.com/')) return route.fulfill({ contentType: 'image/png', body: Buffer.from(pixel.split(',')[1], 'base64') });
    return route.abort();
  });
  await page.setContent('<html lang="en"><body><div id="root"></div></body></html>');
  await page.evaluate(({ fixtures, options }) => {
    window.activityConfig = { raritySource: 'steam', gameProfiles: '{}', showProgress: false, ...(options.activityConfig ?? {}) };
    window.calls = [];
    window.nativePercent = 12.3;
    window.configWrites = [];
    window.saved = options.saved ?? '';
    window.backend = {
      getGlobalSteamAchievementPercentages: async id => { window.calls.push(`steam-percentages:${id}`); return {achievementpercentages:{achievements:[12.3,0,100].map((percent,i)=>({name:`ID_${i}`,percent:String(percent)}))}}; },
      getPs4TrophySoundUri: async () => '', getTrophySoundUri: async () => '', getPlatinumSoundUri: async () => '',
      readPublicPs5Cache: async () => { window.calls.push('cache'); return window.saved; },
      writePublicPs5Cache: async (id, data) => { window.calls.push('save'); window.saved = data; return true; },
      getPublicSteamAchievements: async id => { window.calls.push(`steam:${id}`); if (options.slow && id === 1245620) await new Promise(resolve => setTimeout(resolve, 250)); return fixtures.steam[id]; },
      searchPublicPs5Games: async query => { window.calls.push(`search:${query}`); return { success: true, data: query.startsWith('ELDEN') ? [
        { platform: '4', display_title: 'ELDEN RING', sort_title: 'elden-ring-ps4' },
        { platform: '8', display_title: 'ELDEN RING NIGHTREIGN', sort_title: 'elden-ring-nightreign-ps5' },
        { platform: '8', display_title: 'ELDEN RING', sort_title: 'elden-ring-ps5' },
      ] : query === 'Hogwarts Legacy' ? [{ platform: '8', display_title: 'Hogwarts Legacy', sort_title: 'hogwarts-legacy-ps5' }] : [{ platform: '8', display_title: 'Hades', sort_title: 'hades-ps5' }] }; },
      getPublicPs5Page: async (slug, id) => { window.calls.push(`ps5:${slug}:${id}`); return id ? '<img id="id-trophyimage" src="https://np.sentl.com/images/games/test/l/full.png">' : slug === 'hogwarts-legacy-ps5' ? fixtures.trophyPage.replaceAll('All Trophies', 'Trophy Triumph') : fixtures.trophyPage; },
      getPublicPs5Icon: async () => { window.calls.push('image'); return fixtures.pixel; },
    };
    window.appStore = { allApps: [{ appid: '1245620', display_name: 'Элден Ринг', app_type: 1, visible_in_game_list: true }, { appid: '1145360', display_name: 'Hades', app_type: 1, visible_in_game_list: true }, { appid: '990080', display_name: 'Hogwarts Legacy', app_type: 1, visible_in_game_list: true }] };
    window.SteamClient = { Apps: { GetMyAchievementsForApp: async id => ({ result: 1, data: { rgAchievements: (id === '990080' ? ['ID_0', 'ID_1'] : ['ID_0', 'ID_1', 'ID_2']).map((strID, i) => ({ strID, strName: `${id === '1245620' ? 'Ачивка' : 'Hades achievement'} ${i}`, strDescription: 'Steam description', flAchieved: [12.3, 0, 100][i], strImage: fixtures.pixel, bAchieved: false })) } }) } };
    window.NotificationStore = { ProcessNotification() {} };
  }, { fixtures, options });
  await page.addScriptTag({ type: 'module', content: result.outputFiles[0].text });
  await page.waitForFunction(() => typeof window.catalog?.loadGameCatalog === 'function');
  await page.evaluate(source => window.presentation.updatePresentation('raritySource', source), options.activityConfig?.raritySource ?? 'steam');
  try { await run(page); assert.deepEqual(errors, []); } catch (error) { if (errors.length) error.message += `\nBrowser errors: ${errors.join('; ')}`; throw error; } finally { await page.close(); }
}

test('game profiles save independent overrides, preview the selected style and reset to global settings', async () => {
  await host(async page => {
    await page.evaluate(() => window.mount());
    await showSection(page, 'Game profiles');
    await page.getByRole('button', { name: 'Choose', exact: true }).click();
    await page.getByRole('option', { name: 'Hades', exact: true }).click();
    await page.locator('.host-dropdown').nth(2).getByRole('button').first().click();
    await page.getByRole('option', { name: 'Xbox Series X|S', exact: true }).click();
    await page.locator('[data-notification-style="xbox"]').waitFor();
    await page.locator('.host-dropdown').nth(3).getByRole('button').first().click();
    await page.getByRole('option', { name: '15 seconds', exact: true }).click();
    await page.locator('.host-dropdown').nth(4).getByRole('button').first().click();
    await page.getByRole('option', { name: 'Custom', exact: true }).click();
    await page.getByRole('slider', { name: 'Notification volume' }).fill('0');
    await page.getByText('Saved', { exact: true }).waitFor();
    const profile = await page.evaluate(() => JSON.parse(window.configWrites.filter(([key]) => key === 'gameProfiles').at(-1)[1])['1145360']);
    assert.deepEqual(profile, { notificationStyle: 'xbox', popupDuration: 15, soundVolume: 0 });
    await page.getByRole('button', { name: 'Preview notification', exact: true }).click();
    assert.equal(await page.evaluate(() => window.lastToast.achievement.appid), 1145360);
    await page.getByRole('button', { name: 'Reset game to global settings', exact: true }).click();
    await page.locator('[data-notification-style="ps5"]').waitFor();
    assert.deepEqual(await page.evaluate(() => JSON.parse(window.configWrites.filter(([key]) => key === 'gameProfiles').at(-1)[1])), {});
  });
});

test('progress is opt-in and a preview without game data does not fabricate counts', async () => {
  await host(async page => {
    await page.evaluate(() => window.mount());
    assert.equal(await page.locator('[data-trophy-progress]').count(), 0);
    await page.getByRole('checkbox', { name: 'Game progress in notifications' }).check();
    assert.equal(await page.locator('[data-trophy-progress]').count(), 0);
    assert.deepEqual(await page.evaluate(() => window.configWrites.at(-1)), ['showProgress', true]);
    await page.setViewportSize({ width: 360, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.getByRole('checkbox', { name: 'Game progress in notifications' }).uncheck();
    assert.equal(await page.locator('[data-trophy-progress]').count(), 0);
  });
});

test('history restores account records, searches, replays and clears without unlocking achievements', async () => {
  await host(async page => {
    await page.evaluate(() => {
      window.App = { m_CurrentUser: { strSteamID: '76561198000000001' } };
      window.activityConfig.achievementHistory_76561198000000001 = JSON.stringify([
        { appid: 1145360, game: 'Hades', earnedAt: 1700000000000, achievement: { strID: 'REAL', strName: 'A real unlock', description: 'Real Steam description', bAchieved: true } },
      ]);
    });
    await page.evaluate(() => window.mount());
    const preview = page.locator('[data-trophy-settings-preview]');
    await preview.getByText('A real unlock', { exact: true }).waitFor();
    await preview.getByText('Real Steam description', { exact: true }).first().waitFor();
    assert.equal(await preview.locator('[data-trophy-grade]').count(), 0);
    await showSection(page, 'Game profiles');
    await page.getByRole('button', { name: 'Choose', exact: true }).click();
    await page.getByRole('option', { name: 'Hades', exact: true }).click();
    await page.getByText('A real unlock', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Preview notification', exact: true }).click();
    assert.equal(await page.evaluate(() => window.lastToast.achievement.strID), 'REAL');
    await showSection(page, 'Achievement history');
    await page.getByText('A real unlock', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Replay', exact: true }).click();
    const achievement = await page.evaluate(() => window.lastToast.achievement);
    assert.equal(achievement.strID, 'REAL');
    assert.equal(achievement.appid, 1145360);
    assert.equal(achievement.hideGrade, true);
    await page.getByRole('textbox', { name: 'Find a game or achievement' }).fill('missing');
    await page.getByText('No matching achievements.', { exact: true }).waitFor();
    await page.getByRole('textbox', { name: 'Find a game or achievement' }).fill('Hades');
    await page.getByText('A real unlock', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Clear history', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm clear history', exact: true }).click();
    assert.equal(await page.locator('strong').count(), 0);
    await page.waitForFunction(() => window.activityConfig.achievementHistory_76561198000000001 === '[]');
    await showSection(page, 'Settings');
    await preview.getByText('First achievement', { exact: true }).waitFor();
    await preview.getByText('Your adventure begins.', { exact: true }).first().waitFor();
    await page.evaluate(() => window.presentation.updatePresentation('language', 'ru'));
    await preview.getByText('Первое достижение', { exact: true }).waitFor();
    await preview.getByText('Ваше приключение начинается.', { exact: true }).first().waitFor();
  });
});

async function showSection(page, name) {
  await page.locator('[data-trophy-menu-navigation]').getByRole('button').click();
  await page.getByRole('option', { name, exact: true }).click();
}

test('games previously in the test catalog resolve through public lookup without bundled data', async () => {
  const appids = [2358720, 1086940, 1091500, 2215430, 1817070, 2651280];
  const schemas = Object.fromEntries(appids.map(appid => [appid, steamPage(appid, 'Example Adventure')]));
  await host(async page => {
    await page.evaluate(schemas => {
      window.backend.getPublicSteamAchievements = async appid => {
        window.calls.push(`steam:${appid}`);
        return schemas[appid];
      };
      window.backend.searchPublicPs5Games = async () => ({ success: true, data: [
        { platform: 8, display_title: 'Example Adventure', sort_title: 'example-adventure-ps5' },
      ] });
    }, schemas);
    const result = await page.evaluate(async appids => {
      const catalogs = await Promise.all(appids.map(appid => window.catalog.loadGameCatalog(appid)));
      return { games: catalogs.map(catalog => catalog.gameId), matches: catalogs.map(catalog => Object.keys(catalog.matches).length), calls: window.calls };
    }, appids);
    assert.deepEqual(result.games, appids.map(() => 'example-adventure-ps5'));
    assert.deepEqual(result.matches, appids.map(() => 3));
    for (const appid of appids) assert.ok(result.calls.includes(`steam:${appid}`));
  });
});

async function showSources(page) {
  const section = page.locator('[data-trophy-menu-content="testing"]');
  if (!await section.count()) await showSection(page, 'Preview');
  const button = page.getByRole('button', { name: 'Sources', exact: true });
  if (await button.count()) await button.click();
}

test('settings open with a live preview and everyday preferences without debug controls', async () => {
  await host(async page => {
    await page.evaluate(() => window.mount());
    const settings = page.locator('[data-trophy-menu-content="settings"]');
    await settings.locator('[data-trophy-settings-preview] .trophy-styles-card').waitFor();
    for (const label of ['Appearance', 'Content and timing', 'Trophies and completion', 'Interface', 'Achievement percentage', 'Language']) {
      await settings.getByText(label, { exact: false }).first().waitFor();
    }
    assert.equal(await settings.getByRole('button', { name: 'Preview notification', exact: true }).count(), 0);
    assert.equal(await settings.getByRole('button', { name: 'Sources', exact: true }).count(), 0);
    await settings.getByRole('button', { name: 'PS5', exact: true }).click();
    await page.getByRole('option', { name: 'PS4', exact: true }).click();
    assert.equal(await settings.locator('[data-notification-style]').getAttribute('data-notification-style'), 'ps4');
    assert.equal(await settings.getByText('Achievement percentage', { exact: true }).count(), 0);
    await page.setViewportSize({ width: 360, height: 800 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  });
});

test('public lookup discovers a game outside the bundle, prefers PS5 over PS4 and rejects sequels and caches Steam ID mappings', async () => {
  let saved;
  await host(async page => {
    const result = await page.evaluate(async () => {
      const first = window.catalog.loadGameCatalog(1245620);
      const same = first === window.catalog.loadGameCatalog(1245620);
      const data = await first;
      return { same, data, saved: window.saved, calls: window.calls };
    });
    assert.equal(result.same, true);
    assert.equal(result.data.gameId, 'elden-ring-ps5');
    assert.deepEqual(result.data.matches, { ID_0: 'ps5:1', ID_1: 'ps5:2', ID_2: 'ps5:3' });
    assert.equal(result.data.trophies[0].grade, 'bronze');
    assert.ok(result.calls.includes('save'));
    saved = JSON.parse(result.saved);
  });
  await host(async page => {
    const result = await page.evaluate(async () => ({ data: await window.catalog.loadGameCatalog(1245620), calls: window.calls }));
    assert.equal(result.data.gameId, 'elden-ring-ps5');
    assert.deepEqual(result.calls, ['cache']);
  }, { saved });
});

test('Spider-Man 2 discovery accepts the current Steam schema and keeps sequels separate', async () => {
  await host(async page => {
    const result = await page.evaluate(async html => {
      window.backend.getPublicSteamAchievements = async () => html;
      window.backend.searchPublicPs5Games = async query => {
        window.calls.push(`search:${query}`);
        return { success: true, data: [
          { platform: 8, display_title: "Marvel's Spider-Man Remastered", sort_title: 'marvels-spider-man-remastered-ps5' },
          { platform: 8, display_title: "Marvel's Spider-Man 2", sort_title: 'marvels-spider-man-2-ps5' },
        ] };
      };
      return { catalog: await window.catalog.loadGameCatalog(2651280), calls: window.calls };
    }, steamPage(2651280, "Marvel's Spider-Man 2").replace('"schema"', '"schema_v2"'));
    assert.equal(result.catalog.kind, 'ready');
    assert.equal(result.catalog.gameId, 'marvels-spider-man-2-ps5');
    assert.equal(Object.keys(result.catalog.matches).length, 3);
    assert.deepEqual(result.calls.filter(call => call.startsWith('search:')), ["search:Marvel's Spider-Man 2"]);
  });
});

test('catalog search normalizes typographic punctuation and preserves the original spelling as a fallback', async () => {
  await host(async page => {
    for (const originalOnly of [false, true]) {
      const appid = originalOnly ? 1817190 : 1817070;
      const name = originalOnly ? 'Marvel’s Spider-Man: Miles Morales' : 'Marvel’s Spider-Man Remastered';
      const slug = originalOnly ? 'marvels-spider-man-miles-morales-ps5' : 'marvels-spider-man-remastered-ps5';
      const result = await page.evaluate(async ({ html, appid, name, slug, originalOnly }) => {
        window.backend.getPublicSteamAchievements = async () => html;
        window.backend.searchPublicPs5Games = async query => {
          window.calls.push(`search:${query}`);
          return { success: true, data: query === (originalOnly ? name : name.replace('’', "'"))
            ? [{ platform: 8, display_title: name, sort_title: slug }] : [] };
        };
        return window.catalog.loadGameCatalog(appid);
      }, { html: steamPage(appid, name), appid, name, slug, originalOnly });
      assert.equal(result.kind, 'ready');
      assert.equal(result.gameId, slug);
    }
  });
});

test('Steam schema parsing prefers valid v2 data and falls back to the legacy schema', async () => {
  await host(async page => {
    const result = await page.evaluate(html => {
      const document = new DOMParser().parseFromString(html, 'text/html');
      const state = JSON.parse(document.querySelector('#valve-ssr-data').textContent);
      const { queries } = JSON.parse(state.renderContext.queryData);
      const current = structuredClone(queries[0]);
      current.queryKey[2] = 'schema_v2';
      current.state.data.groups[0].achievements[0].name = 'Current title';
      queries.push(current);
      const parse = () => window.catalog.parseSteamSchema('<script id="valve-ssr-data">'
        + JSON.stringify({ renderContext: { queryData: JSON.stringify({ queries }) } }) + '</script>', 2651280);
      const preferred = parse().achievements[0].name;
      current.state.data = null;
      const fallback = parse().achievements[0].name;
      queries[0].queryKey[1] = 123;
      let error;
      try { parse(); } catch (failure) { error = failure.message; }
      return { preferred, fallback, error };
    }, steamPage(2651280, "Marvel's Spider-Man 2"));
    assert.deepEqual(result, { preferred: 'Current title', fallback: 'First Step', error: 'Steam did not return the English achievement schema.' });
  });
});

test('refresh reloads the English Steam schema before searching again', async () => {
  await host(async page => {
    const result = await page.evaluate(async () => {
      await window.catalog.loadGameCatalog(1145360);
      await window.catalog.loadGameCatalog(1145360, undefined, true);
      return window.calls.filter(call => call === 'steam:1145360');
    });
    assert.equal(result.length, 2);
  });
});

test('matching rejects ambiguous names and duplicate Steam-to-PS5 assignments', async () => {
  await host(async page => {
    const result = await page.evaluate(() => {
      const trophies = [{ strID: 'ps5:1', strName: 'Same', description: 'A unique description long enough to match' }];
      return [window.catalog.buildPublicMatches([{ id: 'a', name: 'Same', description: '' }, { id: 'b', name: 'Same', description: '' }], trophies),
        window.catalog.buildPublicMatches([{ id: 'a', name: 'Same', description: '' }], [...trophies, { ...trophies[0], strID: 'ps5:2' }]),
        window.catalog.buildPublicMatches([{ id: 'a', name: 'Different', description: trophies[0].description }], trophies)];
    });
    assert.deepEqual(result, [{}, {}, { a: 'ps5:1' }]);
  });
});

test('real Steam notifications ignore zero placeholders and display global API statistics by achievement ID', async () => {
  await host(async page => {
    await page.evaluate(() => {
      window.nativePercent = 0;
      window.backend.getGlobalSteamAchievementPercentages = async id => {
        window.calls.push(`steam-percentages:${id}`);
        return { achievementpercentages: { achievements: [{ name: 'ID_0', percent: '35.2' }] } };
      };
      window.SteamClient.Apps.GetMyAchievementsForApp = () => { throw new Error('Do not use user achievement metadata for global percentages'); };
      window.mountNative(1145360, 'ID_0', 'A real objective');
    });
    await page.locator('[data-rarity-source="steam"]').filter({ hasText: '35.2%' }).waitFor();
    assert.equal(await page.evaluate(() => window.calls.filter(call => call === 'steam-percentages:1145360').length), 1);
  });
});

test('debug selection uses global statistics even when all client percentages are zero and selection changes during loading', async () => {
  await host(async page => {
    await page.evaluate(() => {
      const getAchievements = window.SteamClient.Apps.GetMyAchievementsForApp;
      window.SteamClient.Apps.GetMyAchievementsForApp = async id => {
        const response = await getAchievements(id);
        for (const item of response.data.rgAchievements) item.flAchieved = 0;
        return response;
      };
      window.backend.getGlobalSteamAchievementPercentages = async id => {
        window.calls.push(`steam-percentages:${id}`);
        await new Promise(resolve => { window.releaseSteamPercentages = resolve; });
        return { achievementpercentages: { achievements: [{ name: 'ID_0', percent: '35.2' }, { name: 'ID_1', percent: '21.9' }] } };
      };
    });
    await page.evaluate(() => window.mount());
    await showSection(page, 'Preview');
    await page.getByRole('button', { name: 'Choose a game', exact: true }).click();
    await page.getByRole('option', { name: 'Элден Ринг', exact: true }).click();
    await page.getByRole('button', { name: 'Choose an achievement', exact: true }).click();
    await page.getByRole('option', { name: /Ачивка 0/ }).click();
    await page.waitForFunction(() => typeof window.releaseSteamPercentages === 'function');
    await page.locator('.host-dropdown').last().getByRole('button').first().click();
    await page.getByRole('option', { name: /Ачивка 1/ }).click();
    await page.evaluate(() => window.releaseSteamPercentages());
    await page.locator('[data-rarity-source="steam"]').filter({ hasText: '21.9%' }).waitFor();
    assert.equal(await page.locator('.trophy-styles-rarity').filter({ hasText: '35.2%' }).count(), 0);
    assert.equal(await page.evaluate(() => window.calls.filter(call => call === 'steam-percentages:1245620').length), 1);
    await page.waitForFunction(() => window.previewAchievement?.strID);
    await page.evaluate(() => window.previewSelectedAchievement());
    assert.equal(await page.evaluate(() => window.lastToast.achievement.steamPercent), 21.9);
  });
});

test('Steam API failures hide the percentage instead of using a zero notification placeholder', async () => {
  await host(async page => {
    await page.evaluate(() => {
      window.nativePercent = 0;
      window.backend.getGlobalSteamAchievementPercentages = async () => {
        window.globalStatsRequested = true;
        throw new Error('HTTP 503');
      };
      window.mountNative(1145360, 'ID_0', 'A real objective');
    });
    await page.waitForFunction(() => window.globalStatsRequested === true);
    await page.locator('.trophy-styles-card').waitFor();
    assert.equal(await page.locator('.trophy-styles-rarity').count(), 0);
  });
});

test('PSN percentages use the Sony column and reuse the existing catalog request', async () => {
  await host(async page => {
    const result = await page.evaluate(async () => {
      const catalog = await window.catalog.loadGameCatalog(1145360);
      await Promise.all([window.catalog.loadPsnRarities(1145360), window.catalog.loadPsnRarities(1145360)]);
      return { rates: catalog.trophies.map(trophy => trophy.psnPercent), calls: window.calls };
    });
    assert.deepEqual(result.rates, [8.1, 0, 100]);
    assert.equal(result.calls.filter(call => call === 'ps5:hades-ps5:').length, 1);
  });
});

test('older cached mappings load Sony percentages once without discarding their Steam IDs', async () => {
  let saved;
  await host(async page => {
    saved = await page.evaluate(async () => {
      const catalog = await window.catalog.loadGameCatalog(1145360);
      return { ...catalog, trophies: catalog.trophies.map(({ psnPercent, ...trophy }) => trophy) };
    });
  });
  await host(async page => {
    const result = await page.evaluate(async () => {
      const catalogs = await Promise.all([window.catalog.loadPsnRarities(1145360), window.catalog.loadPsnRarities(1145360)]);
      return { rates: catalogs[0].trophies.map(trophy => trophy.psnPercent), matches: catalogs[0].matches, calls: window.calls };
    });
    assert.deepEqual(result.rates, [8.1, 0, 100]);
    assert.deepEqual(result.matches, saved.matches);
    assert.equal(result.calls.filter(call => call === 'ps5:hades-ps5:').length, 1);
    assert.equal(result.calls.some(call => call.startsWith('steam:')), false);
  }, { saved });
});

test('switching sources during a PSN request cannot replace the selected Steam percentage', async () => {
  await host(async page => {
    await page.evaluate(() => {
      const request = window.backend.getPublicPs5Page;
      window.backend.getPublicPs5Page = async (...args) => {
        await new Promise(resolve => { window.releasePsn = resolve; });
        return request(...args);
      };
      window.presentation.updatePresentation('raritySource', 'psn');
      document.getElementById('root').style.width = '656px';
      window.mountNative(1145360, 'ID_0', 'A real objective');
    });
    await page.waitForFunction(() => typeof window.releasePsn === 'function');
    await page.evaluate(() => {
      window.presentation.updatePresentation('raritySource', 'steam');
      window.releasePsn();
    });
    await page.locator('[data-rarity-source="steam"]').filter({ hasText: '12.3%' }).waitFor();
    await page.evaluate(() => window.presentation.updatePresentation('raritySource', 'psn'));
    await page.locator('[data-rarity-source="psn"]').filter({ hasText: '8.1%' }).waitFor();
    const bounds = await page.locator('.trophy-styles-card').boundingBox();
    assert.equal(bounds.width, 656);
    assert.equal(bounds.height, 112);
    assert.equal(await page.locator('.trophy-styles-card').evaluate(card => card.scrollWidth <= card.clientWidth), true);
  });
});

test('the percentage setting persists PSN selection and remains independent of artwork matching', async () => {
  await host(async page => {
    await page.evaluate(() => window.mount());
    await page.getByRole('button', { name: 'Steam', exact: true }).click();
    await page.getByRole('option', { name: 'PSN', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.configWrites.at(-1)), ['raritySource', 'psn']);
    await showSection(page, 'Preview');
    await page.getByRole('button', { name: 'Choose a game', exact: true }).click();
    await page.getByRole('option', { name: 'Элден Ринг', exact: true }).click();
    await page.getByRole('button', { name: 'Choose an achievement', exact: true }).click();
    await page.getByRole('option', { name: /Ачивка 1/ }).click();
    await page.locator('[data-rarity-source="psn"]').filter({ hasText: '0.0%' }).waitFor();
    await page.getByRole('button', { name: 'Test options', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Use matching PS5 artwork and trophy grade', exact: true }).uncheck();
    await page.locator('[data-rarity-source="psn"]').filter({ hasText: '0.0%' }).waitFor();
    assert.equal(await page.locator('.trophy-styles-grade-icon').count(), 0);
    await page.waitForFunction(() => window.previewAchievement?.strID);
    await page.evaluate(() => window.previewSelectedAchievement());
    assert.equal(await page.evaluate(() => window.lastToast.achievement.hideGrade), true);
    assert.equal(await page.evaluate(() => window.calls.some(call => call.startsWith('steam-percentages:'))), false);
  });
});

test('PSN does not display the site percentage when Sony statistics are missing', async () => {
  await host(async page => {
    const result = await page.evaluate(raw => {
      return window.catalog.parsePublicTrophies(raw.replaceAll('Sony Percent Earned', 'Unknown column'), 'hades-ps5')
        .map(trophy => trophy.psnPercent ?? null);
    }, trophyPage);
    assert.deepEqual(result, [null, null, null]);
    await page.evaluate(() => {
      window.backend.getPublicPs5Page = async () => { throw new Error('HTTP 403'); };
      window.presentation.updatePresentation('raritySource', 'psn');
      window.mountNative(1145360, 'ID_1', 'A real objective');
    });
    await page.locator('[data-rarity-source="steam"]').filter({ hasText: '0.0%' }).waitFor();
    assert.equal(await page.locator('[data-rarity-source="psn"]').count(), 0);
  });
});

test('PSN selection falls back to Steam for games without a PlayStation release', async () => {
  await host(async page => {
    await page.evaluate(() => {
      window.presentation.updatePresentation('raritySource', 'psn');
      window.backend.searchPublicPs5Games = async () => ({ success: true, data: [] });
      window.mountNative(1145360, 'ID_0', 'A Steam-only game');
    });
    await page.locator('[data-rarity-source="steam"]').filter({ hasText: '12.3%' }).waitFor();
    assert.equal(await page.evaluate(async () => (await window.catalog.loadGameCatalog(1145360)).kind), 'missing');
    assert.equal(await page.locator('[data-rarity-source="psn"]').count(), 0);
  });
});

test('PSN selection falls back for Steam-exclusive achievements in matched PlayStation games', async () => {
  await host(async page => {
    await page.evaluate(async () => {
      await window.catalog.loadGameCatalog(1145360);
      window.presentation.updatePresentation('raritySource', 'psn');
      window.backend.getGlobalSteamAchievementPercentages = async () => ({ achievementpercentages: { achievements: [{ name: 'steam-only', percent: '9.2' }] } });
      window.mountNative(1145360, 'steam-only', 'A Steam-exclusive objective');
    });
    await page.locator('[data-rarity-source="steam"]').filter({ hasText: '9.2%' }).waitFor();
    assert.equal(await page.locator('.trophy-styles-grade-icon').count(), 0);
  });
});

test('turning percentages off cancels late display and can reuse Steam statistics after enabling again', async () => {
  await host(async page => {
    await page.evaluate(() => {
      window.backend.getGlobalSteamAchievementPercentages = async () => {
        window.calls.push('global-stats');
        await new Promise(resolve => { window.releaseStats = resolve; });
        window.statsCompleted = true;
        return { achievementpercentages: { achievements: [{ name: 'ID_0', percent: '35.2' }] } };
      };
      window.mountNative(1145360, 'ID_0', 'A real objective');
    });
    await page.waitForFunction(() => typeof window.releaseStats === 'function');
    await page.evaluate(() => {
      window.presentation.updatePresentation('raritySource', 'off');
      window.releaseStats();
    });
    await page.waitForFunction(() => window.statsCompleted);
    assert.equal(await page.locator('.trophy-styles-rarity').count(), 0);
    await page.evaluate(() => window.presentation.updatePresentation('raritySource', 'steam'));
    await page.locator('[data-rarity-source="steam"]').filter({ hasText: '35.2%' }).waitFor();
    assert.equal(await page.evaluate(() => window.calls.filter(call => call === 'global-stats').length), 1);
  });
});

test('disabled percentages start no global statistics request and the setting persists', async () => {
  await host(async page => {
    await page.evaluate(() => {
      window.presentation.updatePresentation('raritySource', 'off');
      window.mountNative(1145360, 'ID_0', 'A real objective');
    });
    await page.locator('.trophy-styles-card').waitFor();
    assert.equal(await page.locator('.trophy-styles-rarity').count(), 0);
    assert.equal(await page.evaluate(() => window.calls.some(call => call.startsWith('steam-percentages:'))), false);
  });
  await host(async page => {
    await page.evaluate(() => window.mount());
    await page.getByRole('button', { name: 'Steam', exact: true }).click();
    await page.getByRole('option', { name: 'Do not show', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.configWrites.at(-1)), ['raritySource', 'off']);
  });
});

test('failed lookup can retry and a missing PS5 game keeps Steam available', async () => {
  await host(async page => {
    const result = await page.evaluate(async () => {
      const original = window.backend.searchPublicPs5Games;
      window.backend.searchPublicPs5Games = async () => { throw new Error('HTTP 503'); };
      let failed = false;
      try { await window.catalog.loadGameCatalog(1245620); } catch { failed = true; }
      window.backend.searchPublicPs5Games = async () => ({ success: false, data: [] });
      const missing = await window.catalog.loadGameCatalog(1245620);
      window.backend.searchPublicPs5Games = original;
      const ready = await window.catalog.loadGameCatalog(1245620, undefined, true);
      return { failed, missing: missing.kind, ready: ready.kind };
    });
    assert.deepEqual(result, { failed: true, missing: 'missing', ready: 'ready' });
  });
});

test('ambiguous editions require a choice and stale persistent cache is refreshed', async () => {
  await host(async page => {
    const result = await page.evaluate(async () => {
      window.backend.searchPublicPs5Games = async () => ({ success: true, data: [
        { platform: 8, display_title: 'ELDEN RING', sort_title: 'elden-ring-ps5' },
        { platform: 8, display_title: 'ELDEN RING', sort_title: 'elden-ring-jp-ps5' },
      ] });
      const choice = await window.catalog.loadGameCatalog(1245620);
      const picked = await window.catalog.loadGameCatalog(1245620, 'elden-ring-jp-ps5');
      const automatic = await window.catalog.loadGameCatalog(1245620);
      return { kind: choice.kind, count: choice.candidates.length, picked: picked.gameId, automatic: automatic.gameId };
    });
    assert.deepEqual(result, { kind: 'choose', count: 2, picked: 'elden-ring-jp-ps5', automatic: 'elden-ring-jp-ps5' });
  }, { saved: { version: 2, appid: 1245620, fetchedAt: 1, kind: 'ready' } });
});

test('notification volume defaults to the previous level and persists zero for mute', async () => {
  await host(async page => {
    await page.evaluate(() => {
      const NativeAudioContext = window.AudioContext;
      window.backend.getPs4TrophySoundUri = window.backend.getTrophySoundUri = window.backend.getPlatinumSoundUri = async () => 'data:audio/wav;base64,UklGRg==';
      window.volumeGains = [];
      window.AudioContext = class extends NativeAudioContext {
        createGain() { const gain = super.createGain(); window.volumeGains.push(gain); return gain; }
      };
    });
    await page.evaluate(() => window.mount());
    const slider = page.getByRole('slider', { name: 'Notification volume' });
    assert.equal(await slider.inputValue(), '100');
    assert.equal(await slider.getAttribute('max'), '200');
    await slider.fill('200');
    assert.deepEqual(await page.evaluate(() => window.volumeGains.map(gain => gain.gain.value)), [2, 2, 2, 2, 2, 2]);
    await slider.fill('35');
    const gains = await page.evaluate(() => window.volumeGains.map(gain => gain.gain.value));
    assert.ok(gains.every(value => Math.abs(value - 0.35) < 0.0001));
    await slider.fill('0');
    assert.deepEqual(await page.evaluate(() => window.configWrites.slice(-2)), [['soundVolume', 35], ['soundVolume', 0]]);
  });
});

test('source diagnostics report both providers and new settings preserve previous defaults', async () => {
  await host(async page => {
    await page.evaluate(() => window.mount());
    await page.getByRole('button', { name: 'Top right', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Automatic (reading time)', exact: true }).waitFor();
    await showSection(page, 'Preview');
    await page.getByRole('button', { name: 'Choose a game', exact: true }).click();
    await page.getByRole('option', { name: 'Элден Ринг', exact: true }).click();
    await page.waitForFunction(() => window.catalog.cachedGameCatalog(1245620)?.kind === 'ready');
    await page.getByRole('button', { name: 'Choose an achievement', exact: true }).click();
    await page.getByRole('listbox').getByRole('option').nth(0).click();
    await showSources(page);
    await page.getByRole('button', { name: 'Check sources', exact: true }).click();
    await page.getByText('Displayed percentage: Steam · 12.3%', { exact: true }).waitFor();
    await page.getByText('PSN ·', { exact: false }).filter({ hasText: '8.1%' }).waitFor();
    await showSection(page, 'Settings');
    await page.getByRole('button', { name: 'Top right', exact: true }).click();
    await page.getByRole('option', { name: 'Bottom left', exact: true }).click();
    await page.getByRole('button', { name: 'Automatic (reading time)', exact: true }).click();
    await page.getByRole('option', { name: '10 seconds', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.configWrites.slice(-2)), [['popupCorner', 'bottom-left'], ['popupDuration', 10]]);
  });
});

test('source diagnostics retain HTTP errors and report Steam fallback without inventing PSN statistics', async () => {
  await host(async page => {
    await page.evaluate(() => {
      window.activityConfig.raritySource = 'psn';
      window.presentation.updatePresentation('raritySource', 'psn');
      window.backend.getPublicPs5Page = async () => { throw new Error('HTTP 403'); };
    });
    await page.evaluate(() => window.mount());
    await showSection(page, 'Preview');
    await page.getByRole('button', { name: 'Choose a game', exact: true }).click();
    await page.getByRole('option', { name: 'Элден Ринг', exact: true }).click();
    await page.getByRole('button', { name: 'Choose an achievement', exact: true }).click();
    await page.getByRole('listbox').getByRole('option').nth(0).click();
    await showSources(page);
    await page.getByRole('button', { name: 'Check sources', exact: true }).click();
    await page.getByText('PSN · HTTP 403', { exact: true }).waitFor();
    await page.getByText('Displayed percentage: Steam · 12.3%', { exact: true }).waitFor();
    await page.getByText('PSN percentage unavailable; using Steam.', { exact: true }).waitFor();
    await page.evaluate(() => window.presentation.updatePresentation('raritySource', 'off'));
    await page.getByText('Displayed percentage: Do not show', { exact: true }).waitFor();
  });
});

test('native section selection keeps the selected achievement and source report without repeating lookups', async () => {
  await host(async page => {
    await page.evaluate(() => window.mount());
    await page.locator('[data-trophy-menu-navigation]').getByRole('button').click();
    assert.deepEqual(await page.getByRole('option').allTextContents(), ['Settings', 'Game profiles', 'Achievement history', 'Preview']);
    await page.getByRole('option', { name: 'Settings', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Show test popup', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Check sources', exact: true }).count(), 0);
    await page.getByRole('checkbox', { name: 'Match PlayStation trophies in games', exact: true }).waitFor();
    assert.equal(await page.getByText('Trophy icon', { exact: true }).count(), 0);
    await showSources(page);
    await page.getByRole('button', { name: 'Choose a game', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Preview notification', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Show test popup', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Queue · 3', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Choose a game', exact: true }).click();
    await page.getByRole('option', { name: 'Элден Ринг', exact: true }).click();
    await page.getByRole('button', { name: 'Choose an achievement', exact: true }).click();
    await page.getByRole('option', { name: /Ачивка 1/ }).click();
    await showSources(page);
    await page.getByRole('button', { name: 'Check sources', exact: true }).click();
    await page.getByText('Displayed percentage: Steam · 0.0%', { exact: true }).waitFor();
    const calls = await page.evaluate(() => window.calls.slice());
    await showSection(page, 'Settings');
    await showSection(page, 'Preview');
    await page.waitForFunction(() => window.previewAchievement?.strID);
    await page.evaluate(() => window.previewSelectedAchievement());
    assert.deepEqual(await page.evaluate(() => ({ id: window.lastToast.achievement.strID, grade: window.lastToast.achievement.grade })),
      { id: 'ID_1', grade: 'gold' });
    await showSources(page);
    await page.getByText('Displayed percentage: Steam · 0.0%', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.calls), calls);
  });
});

test('a pending source check finishes while another menu section is open', async () => {
  await host(async page => {
    await page.evaluate(() => {
      window.backend.getGlobalSteamAchievementPercentages = async () => {
        await new Promise(resolve => { window.finishMenuCheck = resolve; });
        return { achievementpercentages: { achievements: [{ name: 'ID_0', percent: '35.2' }] } };
      };
    });
    await page.evaluate(() => window.mount());
    await showSection(page, 'Preview');
    await page.getByRole('button', { name: 'Choose a game', exact: true }).click();
    await page.getByRole('option', { name: 'Элден Ринг', exact: true }).click();
    await page.getByRole('button', { name: 'Choose an achievement', exact: true }).click();
    await page.getByRole('option', { name: /Ачивка 0/ }).click();
    await showSources(page);
    await page.getByRole('button', { name: 'Check sources', exact: true }).click();
    await page.getByRole('button', { name: 'Checking sources…', exact: true }).waitFor();
    await showSection(page, 'Settings');
    await page.evaluate(() => window.finishMenuCheck());
    await showSources(page);
    await page.getByText('Displayed percentage: Steam · 35.2%', { exact: true }).waitFor();
  });
});

test('changing achievements discards a pending source report and allows checking the previous selection again', async () => {
  await host(async page => {
    await page.evaluate(() => {
      window.backend.getGlobalSteamAchievementPercentages = async () => {
        await new Promise(resolve => { window.finishOldMenuCheck = resolve; });
        return { achievementpercentages: { achievements: [{ name: 'ID_0', percent: '35.2' }, { name: 'ID_1', percent: '0' }] } };
      };
    });
    await page.evaluate(() => window.mount());
    await showSection(page, 'Preview');
    await page.getByRole('button', { name: 'Choose a game', exact: true }).click();
    await page.getByRole('option', { name: 'Элден Ринг', exact: true }).click();
    await page.getByRole('button', { name: 'Choose an achievement', exact: true }).click();
    await page.getByRole('option', { name: /Ачивка 0/ }).click();
    await showSources(page);
    await page.getByRole('button', { name: 'Check sources', exact: true }).click();
    await page.getByRole('button', { name: 'Checking sources…', exact: true }).waitFor();
    await showSection(page, 'Preview');
    await page.locator('.host-dropdown').last().getByRole('button').first().click();
    await page.getByRole('option', { name: /Ачивка 1/ }).click();
    await page.evaluate(() => window.finishOldMenuCheck());
    await showSources(page);
    assert.equal(await page.getByText('Displayed percentage:', { exact: false }).count(), 0);
    await page.getByRole('button', { name: 'Check sources', exact: true }).click();
    await page.getByText('Displayed percentage: Steam · 0.0%', { exact: true }).waitFor();
    await showSection(page, 'Preview');
    await page.locator('.host-dropdown').last().getByRole('button').first().click();
    await page.getByRole('option', { name: /Ачивка 0/ }).click();
    await showSources(page);
    await page.getByRole('button', { name: 'Check sources', exact: true }).click();
    await page.getByText('Displayed percentage: Steam · 35.2%', { exact: true }).waitFor();
  });
});

test('actual settings list includes images and trophy grades and the popup uses the resolved grade', async () => {
  await host(async page => {
    await page.evaluate(() => window.mount());
    await showSection(page, 'Preview');
    await page.getByRole('button', { name: 'Choose a game', exact: true }).click();
    await page.getByRole('option', { name: 'Элден Ринг', exact: true }).click();
    await page.waitForFunction(() => window.catalog.cachedGameCatalog(1245620)?.kind === 'ready');
    await page.getByRole('button', { name: 'Choose an achievement', exact: true }).click();
    const rows = page.getByRole('listbox').getByRole('option');
    assert.equal(await rows.count(), 3);
    assert.equal(await rows.nth(0).locator('img').count(), 2);
    assert.equal(await rows.nth(0).locator('[data-trophy-grade]').getAttribute('data-trophy-grade'), 'bronze');
    assert.equal(await rows.nth(1).locator('[data-trophy-grade]').getAttribute('data-trophy-grade'), 'gold');
    await rows.nth(1).click();
    await page.waitForFunction(() => window.previewAchievement?.strID);
    await page.evaluate(() => window.previewSelectedAchievement());
    const payload = await page.evaluate(() => window.lastToast.achievement);
    assert.equal(payload.grade, 'gold');
    assert.equal(payload.strName, 'Ачивка 1');
    assert.equal(payload.strImage, pixel);
    assert.equal(payload.ps5TrophyId, 'ps5:2');
    assert.equal(await page.evaluate(() => window.calls.filter(call => call === 'image').length), 1);
  });
});

test('changing games during public lookup cannot replace the current achievement list or trophy', async () => {
  await host(async page => {
    await page.evaluate(() => window.mount());
    await showSection(page, 'Preview');
    await page.getByRole('button', { name: 'Choose a game', exact: true }).click();
    await page.getByRole('option', { name: 'Элден Ринг', exact: true }).click();
    await page.getByRole('button', { name: 'Элден Ринг', exact: true }).click();
    await page.getByRole('option', { name: 'Hades', exact: true }).click();
    await page.waitForFunction(() => window.catalog.cachedGameCatalog(1145360)?.kind === 'ready');
    await page.getByRole('button', { name: 'Choose an achievement', exact: true }).click();
    await page.getByRole('option', { name: /Hades achievement 0/ }).click();
    await page.waitForTimeout(350);
    await page.waitForFunction(() => window.previewAchievement?.strID);
    await page.evaluate(() => window.previewSelectedAchievement());
    assert.equal(await page.evaluate(() => window.lastToast.achievement.strName), 'Hades achievement 0');
  }, { slow: true });
});

test('extra PS5 platinum can be previewed without completing or modifying Steam achievements', async () => {
  await host(async page => {
    await page.evaluate(() => window.mount());
    await showSection(page, 'Preview');
    await page.getByRole('button', { name: 'Choose a game', exact: true }).click();
    await page.getByRole('option', { name: 'Hogwarts Legacy', exact: true }).click();
    await page.getByRole('button', { name: 'Test options', exact: true }).click();
    await page.getByRole('button', { name: 'Preview completion platinum', exact: true }).click();
    const payload = await page.evaluate(() => window.lastToast.achievement);
    assert.equal(payload.strName, 'Trophy Triumph');
    assert.equal(payload.grade, 'platinum');
    assert.equal(payload.ps5TrophyId, 'ps5:3');
    assert.equal(await page.evaluate(() => window.calls.some(call => call.includes('claim'))), false);
  });
});

test('actual Steam callback awards the missing platinum once after the final unlock', async () => {
  await host(async page => {
    await page.evaluate(() => {
      window.App = { m_CurrentUser: { strSteamID: '76561198000000001' } };
      window.claims = 0;
      window.award = false;
      window.SteamClient.GameSessions = { RegisterForAchievementNotification: callback => {
        window.unlockCallback = callback;
        return { unregister() {} };
      } };
      const getAchievements = window.SteamClient.Apps.GetMyAchievementsForApp;
      window.SteamClient.Apps.GetMyAchievementsForApp = async id => {
        const response = await getAchievements(id);
        response.data.rgAchievements[0].bAchieved = true;
        return response;
      };
      window.backend.hasCompletionPlatinum = async () => window.award;
      window.backend.claimCompletionPlatinum = async () => { if (window.award) return false; window.award = true; window.claims++; return true; };
      window.backend.releaseCompletionPlatinum = async () => { window.award = false; return true; };
      const timeout = window.setTimeout.bind(window);
      window.setTimeout = (callback, ms, ...args) => timeout(callback, ms === 5500 ? 0 : ms, ...args);
    });
    await page.evaluate(() => window.mount());
    await page.evaluate(() => window.unlockCallback({ unAppID: 990080, achievement: { strID: 'ID_1', bAchieved: true } }));
    await page.waitForFunction(() => window.lastToast?.className.startsWith('trophy-styles-completion-toast'));
    const payload = await page.evaluate(() => ({ name: window.lastToast.achievement.strName, grade: window.lastToast.achievement.grade, claims: window.claims }));
    assert.deepEqual(payload, { name: 'Trophy Triumph', grade: 'platinum', claims: 1 });
    await page.evaluate(() => window.unlockCallback({ unAppID: 990080, achievement: { strID: 'ID_1', bAchieved: true } }));
    await page.waitForTimeout(50);
    assert.equal(await page.evaluate(() => window.claims), 1);
    assert.equal(await page.evaluate(async () => (await window.SteamClient.Apps.GetMyAchievementsForApp('990080')).data.rgAchievements[1].bAchieved), false);
  });
});


test('catalog discovery handles Witcher Remastered, PS4-only BioShock and trademark-separated Borderlands', async () => {
  const cases = [
    { appid: 292030, name: 'The Witcher 3: Wild Hunt – Remastered', query: 'The Witcher 3: Wild Hunt', slug: 'witcher-3-wild-hunt-ps5', data: [
      { platform: 4, display_title: 'The Witcher 3: Wild Hunt', sort_title: 'witcher-3-wild-hunt-ps4' },
      { platform: 8, display_title: 'The Witcher 3: Wild Hunt', sort_title: 'witcher-3-wild-hunt-ps5' },
    ] },
    { appid: 8870, name: 'BioShock Infinite', query: 'BioShock Infinite', slug: 'bioshock-infinite-ps4', data: [
      { platform: 1, display_title: 'BioShock Infinite', sort_title: 'bioshock-infinite-ps3' },
      { platform: 4, display_title: 'BioShock Infinite', sort_title: 'bioshock-infinite-ps4' },
    ] },
    { appid: 49520, name: 'Borderlands 2', query: 'Borderlands', slug: 'borderlands-2-ps4', data: [
      { platform: 3, display_title: 'Borderlands™ 2', sort_title: 'borderlands-2-ps3-psvita' },
      { platform: 4, display_title: 'Borderlands™ 2', sort_title: 'borderlands-2-ps4' },
      { platform: 4, display_title: 'Borderlands® 2 VR', sort_title: 'borderlands-2-vr-ps4' },
      { platform: 8, display_title: 'Borderlands® 3', sort_title: 'borderlands-3-ps5' },
    ] },
  ];
  await host(async page => {
    for (const item of cases) {
      const result = await page.evaluate(async ({ item, html }) => {
        window.backend.getPublicSteamAchievements = async () => html;
        window.backend.readPublicPs5Cache = async () => '';
        window.backend.searchPublicPs5Games = async query => ({ success: true, data: query === item.query ? item.data : [] });
        return window.catalog.loadGameCatalog(item.appid);
      }, { item, html: steamPage(item.appid, item.name) });
      assert.equal(result.kind, 'ready');
      assert.equal(result.gameId, item.slug);
      assert.equal(Object.keys(result.matches).length, 3);
    }
  });
});


test('real notification keeps localized Steam content and artwork while using the matched PlayStation grade', async () => {
  await host(async page => {
    await page.evaluate(async image => {
      await window.catalog.loadGameCatalog(1145360);
      window.mountNative(1145360, 'ID_1', 'Оригинальное описание Steam', 1, image);
    }, pixel);
    await page.locator('.trophy-styles-grade-icon[data-trophy-grade="gold"]').waitFor();
    assert.equal(await page.locator('.trophy-styles-card [title="<Real Steam title>"]').count(), 1);
    assert.equal(await page.locator('.trophy-styles-subtitle').getAttribute('title'), 'Оригинальное описание Steam');
    assert.equal(await page.locator('.trophy-styles-card img').first().getAttribute('src'), pixel);
  });
});

test('an unmatched real achievement has no false grade even when a different trophy from the game matched', async () => {
  await host(async page => {
    await page.evaluate(async () => {
      await window.catalog.loadGameCatalog(1145360);
      window.mountNative(1145360, 'steam-only', 'Steam exclusive objective');
    });
    await page.locator('.trophy-styles-card').waitFor();
    assert.equal(await page.locator('.trophy-styles-grade-icon').count(), 0);
    assert.equal(await page.locator('.trophy-styles-platinum-figure').count(), 0);
  });
});

test('scaled game popup fits its native surface with unchanged logical typography and scrolling measurements', async () => {
  await host(async page => {
    await page.setViewportSize({width:510,height:102});
    await page.evaluate(async () => {
      await window.catalog.loadGameCatalog(1145360);
      window.monitorScale.setDesktopHeight(1440);
      window.notification.setOverlayMonitor(1145360, {
        m_usable: { m_nLeft: 0, m_nTop: 0, m_nWidth: 1920, m_nHeight: 1080 },
        m_full: { m_nHeight: 1080 },
      });
      document.body.classList.add('trophy-styles-notification-window');
      document.getElementById('root').style.width = '510px';
      window.mountNative(1145360, 'ID_1', 'A long scrolling objective '.repeat(20), 2);
    });
    await page.locator('.trophy-styles-popup-card').waitFor({ state: 'attached' });
    const result = await page.locator('.trophy-styles-popup-card').evaluate(card => ({
      width: card.getBoundingClientRect().width,
      height: card.getBoundingClientRect().height,
      logicalHeight: card.clientHeight,
      font: getComputedStyle(card.querySelector('.trophy-styles-subtitle')).fontSize,
      window: window.innerWidth,
    }));
    assert.equal(result.width, 492);
    assert.equal(result.height, 84);
    assert.equal(result.logicalHeight, 112);
    assert.equal(result.font, '24px');
  });
});

test('native achievement uses its Steam description and live subtitle/language settings preserve layout', async () => {
  await host(async page => {
    await page.evaluate(() => {
      document.getElementById('root').style.width = '656px';
      window.SteamClient.Apps.GetMyAchievementsForApp = async () => ({ result: 1, data: { rgAchievements: [
        { strID: 'real', strName: 'Real', strDescription: '<script>Collect every item</script> '.repeat(30), bAchieved: true },
      ] } });
      window.mountNative(1145360, 'real');
    });
    const subtitle = page.locator('.trophy-styles-subtitle');
    await subtitle.filter({ hasText: 'Collect every item' }).waitFor();
    assert.equal(await subtitle.locator('script').count(), 0);
    const bounds = await page.locator('.trophy-styles-card').boundingBox();
    assert.equal(bounds.width, 656);
    assert.equal(bounds.height, 112);
    assert.equal((await subtitle.boundingBox()).height, 32);
    const reading = await page.evaluate(() => {
      const viewport = document.querySelector('.trophy-styles-subtitle');
      const text = viewport.querySelector('.trophy-styles-subtitle-track').firstElementChild;
      return { actual: window.nativeNotification.nToastDurationMS, required: window.timing.readingDuration(text.scrollWidth, viewport.clientWidth) };
    });
    assert.ok(reading.actual >= reading.required);
    assert.ok(reading.actual > 10000);

    await page.evaluate(() => window.presentation.updatePresentation('subtitleMode', 'earned'));
    await subtitle.filter({ hasText: 'Trophy earned!' }).waitFor();
    await page.evaluate(() => window.presentation.updatePresentation('language', 'ru'));
    await subtitle.filter({ hasText: 'Трофей получен!' }).waitFor();
    await page.evaluate(() => window.presentation.updatePresentation('language', 'uk'));
    await subtitle.filter({ hasText: 'Трофей здобуто!' }).waitFor();
    assert.equal(await page.locator('.trophy-styles-card').getByText('<Real Steam title>', { exact: true }).count(), 1);
  });
});

test('language selection translates settings immediately and missing descriptions fall back safely', async () => {
  await host(async page => {
    await page.evaluate(() => window.mount());
    await page.getByRole('checkbox', { name: 'Match PlayStation trophies in games', exact: true }).waitFor();
    await page.locator('.host-dropdown').last().getByRole('button').click();
    await page.getByRole('option', { name: 'Русский', exact: true }).click();
    await page.getByText('Вторая строка попапа', { exact: false }).waitFor();
    await showSection(page, 'Предпросмотр');
    await page.getByRole('button', { name: 'Показать уведомление', exact: true }).waitFor();
    await page.locator('.trophy-styles-subtitle').filter({ hasText: 'Ваше приключение начинается.' }).waitFor();
    const result = await page.evaluate(() => ({
      steam: window.presentation.resolveLanguage('ukrainian'),
      regional: window.presentation.resolveLanguage('ru-RU'),
      fallback: window.presentation.resolveLanguage('japanese'),
      missing: window.presentation.achievementSubtitle('   '),
      description: window.presentation.achievementSubtitle('  Steam objective  '),
    }));
    assert.deepEqual(result, { steam: 'uk', regional: 'ru', fallback: 'en', missing: 'Трофей получен!', description: 'Steam objective' });
    await page.evaluate(() => window.presentation.updatePresentation('language', 'uk'));
    await showSection(page, 'Налаштування');
    await page.getByText('Другий рядок сповіщення', { exact: false }).waitFor();
  });
});


test('long descriptions scroll smoothly without moving the card and remeasure after resizing', async () => {
  await host(async page => {
    await page.evaluate(() => {
      document.getElementById('root').style.width = '320px';
      window.mountSubtitle('Collect every item and complete all objectives throughout the entire game.');
    });
    const viewport = page.locator('.trophy-styles-subtitle');
    await page.locator('.trophy-styles-subtitle[data-scrolling="true"]').waitFor();
    const movement = await page.evaluate(() => {
      const viewport = document.querySelector('.trophy-styles-subtitle');
      const track = viewport.querySelector('.trophy-styles-subtitle-track');
      const animation = track.getAnimations()[0];
      animation.pause();
      const delay = Number(animation.effect.getTiming().delay);
      animation.currentTime = delay + 1000;
      const first = new DOMMatrix(getComputedStyle(track).transform).m41;
      animation.currentTime = delay + 1500;
      const second = new DOMMatrix(getComputedStyle(track).transform).m41;
      return { first, second, width: viewport.clientWidth, height: viewport.clientHeight,
        copies: track.querySelectorAll('[aria-hidden="true"]:not([hidden])').length };
    });
    assert.ok(movement.first < -40);
    assert.ok(movement.first - movement.second > 20);
    assert.ok(movement.first - movement.second < 40);
    assert.equal(movement.width, 320);
    assert.equal(movement.height, 32);
    assert.equal(movement.copies, 1);
    await page.evaluate(() => { document.getElementById('root').style.width = '2400px'; });
    await page.locator('.trophy-styles-subtitle[data-scrolling="false"]').waitFor();
    assert.equal(await viewport.locator('.trophy-styles-subtitle-track').evaluate(element => element.getAnimations().length), 0);
    await page.evaluate(() => window.mountSubtitle('Short description'));
    await viewport.filter({ hasText: 'Short description' }).waitFor();
    assert.equal(await viewport.getAttribute('data-scrolling'), 'false');
  });
});

test('scrolling waits for popup visibility and honors reduced motion', async () => {
  await host(async page => {
    const text = 'Complete every challenge and collect all items across the world. '.repeat(4);
    await page.evaluate(text => {
      document.getElementById('root').style.width = '320px';
      window.mountSubtitle(text, false);
    }, text);
    await page.locator('.trophy-styles-subtitle[data-scrolling="false"]').waitFor();
    await page.evaluate(text => window.mountSubtitle(text, true), text);
    await page.locator('.trophy-styles-subtitle[data-scrolling="true"]').waitFor();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.trophy-styles-subtitle[data-scrolling="false"]').waitFor();
    assert.equal(await page.locator('.trophy-styles-subtitle-track').evaluate(element => element.getAnimations().length), 0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('.trophy-styles-subtitle[data-scrolling="true"]').waitFor();
  });
});


test('real Steam payload descriptions render directly without a separate achievement request', async () => {
  await host(async page => {
    await page.evaluate(() => {
      window.SteamClient.Apps.GetMyAchievementsForApp = () => { throw new Error('Unexpected metadata request'); };
      window.mountNative(362680, 'direct', 'Решите головоломку в лабиринте.');
    });
    await page.locator('.trophy-styles-subtitle').filter({ hasText: 'Решите головоломку в лабиринте.' }).waitFor();
  });
});


test('native debug test uses Steam own notification path without writing achievements', async () => {
  await host(async page => {
    await page.evaluate(() => {
      window.nativeTestApps = [];
      window.NotificationStore.TestAchievement = async (...args) => window.nativeTestApps.push(args);
    });
    await page.evaluate(() => window.mount());
    await showSection(page, 'Preview');
    await page.getByRole('button', { name: 'Choose a game', exact: true }).click();
    await page.getByRole('option', { name: 'Элден Ринг', exact: true }).click();
    await page.getByRole('button', { name: 'Choose an achievement', exact: true }).click();
    await page.getByRole('option', { name: /Ачивка 1/ }).click();
    assert.equal(await page.getByRole('button', { name: 'Show test popup', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Queue · 3', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Check sources', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Preview notification', exact: true }).click();
    await page.getByText('Steam test notification requested for the selected achievement.', { exact: false }).waitFor();
    const calls = await page.evaluate(() => window.nativeTestApps);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 1245620);
    assert.equal(calls[0][1], false);
    assert.equal(calls[0][2].achievement_id, 'ID_1');
    assert.equal(calls[0][2].name, 'Ачивка 1');
    assert.equal(calls[0][2].description, 'Steam description');
    assert.equal(await page.evaluate(() => window.lastToast), undefined);
  });
});

test('random appearance is saved and keeps a stable PS5 settings preview', async () => {
  await host(async page => {
    await page.evaluate(() => window.mount());
    await page.getByRole('button', { name: 'PS5', exact: true }).click();
    await page.getByRole('option', { name: 'Random (PS5 / PS4 / Xbox)', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.configWrites), [['notificationStyle', 'random']]);
    await page.getByText('Each notification randomly uses PS5, PS4 or Xbox, with matching sound and position. Consecutive styles may repeat. Preview shows PS5.', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-trophy-settings-preview] .trophy-styles-card').getAttribute('data-notification-style'), 'ps5');
    await showSection(page, 'Preview');
    await showSection(page, 'Settings');
    assert.equal(await page.getByRole('button', { name: 'Random (PS5 / PS4 / Xbox)', exact: true }).count(), 1);
  });
});

test('random native popups render the selected platform and keep it through settings changes', async () => {
  for (const [index, style] of ['ps5', 'ps4', 'xbox'].entries()) {
    await host(async page => {
      await page.evaluate(index => {
        window.presentation.updatePresentation('notificationStyle', 'random');
        Math.random = () => (index + 0.5) / 3;
        window.mountNative(42, 'random-native', 'Real Steam description', 2);
      }, index);
      const card = page.locator('.trophy-styles-popup-card');
      await card.waitFor();
      assert.equal(await card.getAttribute('data-notification-style'), style);
      await page.evaluate(() => window.presentation.updatePresentation('notificationStyle', 'ps5'));
      assert.equal(await card.getAttribute('data-notification-style'), style);
      const content = style === 'xbox' ? await card.getByRole('img').getAttribute('aria-label') : await card.textContent();
      assert.ok(content.includes('<Real Steam title>'));
    });
  }
});

test('PS4 selection is saved and shared with previews while PS5 remains the default', async () => {
  await host(async page => {
    await page.evaluate(() => window.mount());
    await page.getByRole('button', { name: 'PS5', exact: true }).click();
    await page.getByRole('option', { name: 'PS4', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.configWrites), [['notificationStyle', 'ps4']]);
    await page.getByRole('button', { name: 'Choose', exact: true }).first().click();
    await page.getByRole('option', { name: 'Trophy earned!', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.configWrites.at(-1)), ['subtitleMode', 'earned']);
    await showSection(page, 'Preview');
    const card = page.locator('.trophy-styles-card');
    await card.locator('.trophy-styles-earned').filter({ hasText: 'Trophy earned!' }).waitFor();
    assert.equal(await card.getAttribute('data-notification-style'), 'ps4');
    assert.equal(await card.locator('.trophy-styles-subtitle').count(), 0);
    await showSection(page, 'Settings');
    await page.getByRole('button', { name: 'PS4', exact: true }).click();
    await page.getByRole('option', { name: 'PS5', exact: true }).click();
    await showSection(page, 'Preview');
    assert.equal(await card.getAttribute('data-notification-style'), 'ps5');
    assert.equal(await card.locator('.trophy-styles-earned').count(), 0);
    await card.locator('.trophy-styles-subtitle').filter({ hasText: 'Trophy earned!' }).waitFor();
  });
});

test('PS4 uses a separate edge-sized surface, scalable badge, smooth halo and two-line Steam content', async () => {
  await host(async page => {
    await page.setViewportSize({ width: 554, height: 100 });
    await page.evaluate(pixel => {
      document.body.classList.add('trophy-styles-notification-window');
      window.monitorScale.setDesktopHeight(1080);
      window.presentation.updatePresentation('notificationStyle', 'ps4');
      window.presentation.updatePresentation('subtitleMode', 'earned');
      window.presentation.updatePresentation('language', 'ru');
      window.mountNative(362680, 'ps4-direct', 'Оригинальное описание Steam', 2, pixel);
    }, pixel);
    const card = page.locator('.trophy-styles-popup-card');
    const badge = card.locator('.trophy-styles-ps4-badge');
    const badgeImage = badge.locator('img');
    const halo = badge.locator('.trophy-styles-ps4-halo');
    await card.locator('.trophy-styles-earned').filter({ hasText: 'Трофей получен!' }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.evaluate(() => document.fonts.check('300 30px "Trophy SST"', 'Трофей получен!')), true);
    assert.equal(await card.locator('.trophy-styles-subtitle, .trophy-styles-rarity, .trophy-styles-badge').count(), 0);
    assert.equal(await card.locator('.trophy-styles-ps4-artwork').getAttribute('src'), pixel);
    assert.equal(await card.locator('.trophy-styles-grade-icon').count(), 0);
    assert.equal(await card.getByText('<Real Steam title>', { exact: true }).count(), 1);
    assert.match(await badgeImage.getAttribute('src'), /^data:image\/svg\+xml/);
    assert.equal(await badge.getAttribute('data-playing'), 'false');
    assert.equal(await halo.evaluate(element => element.getAnimations().length), 0);
    const position = await page.evaluate(() => window.notification.desktopPosition(window.nativeNotification, {
      m_usable: { m_nLeft: 0, m_nTop: 0, m_nWidth: 1920, m_nHeight: 1080 },
    }, 0, [{ toast: { m_notification: window.nativeNotification, m_nToastHeight: 100, m_eState: 1 }, flPercentDone: 0 }]));
    assert.deepEqual(position, { left: 0, top: 134 });
    const result = await card.evaluate(element => {
      const animation = element.getAnimations()[0];
      animation.pause();
      animation.currentTime = 0;
      const startX = new DOMMatrix(getComputedStyle(element).transform).m41;
      animation.currentTime = 200;
      const art = element.querySelector('.trophy-styles-ps4-artwork');
      const text = element.querySelector('.trophy-styles-ps4-text');
      const badge = element.querySelector('.trophy-styles-ps4-badge');
      return {
        width: element.clientWidth, height: element.clientHeight, startX,
        endX: new DOMMatrix(getComputedStyle(element).transform).m41,
        art: [art.offsetLeft, art.offsetTop, art.width, art.height],
        textLeft: text.offsetLeft, badge: [badge.offsetLeft, badge.offsetTop, badge.clientWidth, badge.clientHeight],
        padding: getComputedStyle(element.parentElement).padding,
        fits: element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight,
      };
    });
    assert.deepEqual(result, { width: 554, height: 100, startX: -554, endX: 0, art: [102,18,64,64], textLeft: 186, badge: [464,6,84,88], padding: '0px', fits: true });
    await page.waitForFunction(() => document.querySelector('.trophy-styles-ps4-badge').dataset.playing === 'true');
    assert.deepEqual(await badgeImage.evaluate(async image => { await image.decode(); return [image.naturalWidth, image.naturalHeight]; }), [84, 88]);
    const pulse = await halo.evaluate(element => {
      const animation = element.getAnimations()[0];
      animation.pause();
      animation.currentTime = 1000;
      const peak = Number(getComputedStyle(element).opacity);
      animation.currentTime = 2500;
      const fading = Number(getComputedStyle(element).opacity);
      animation.currentTime = 5200;
      return { peak, fading, end: Number(getComputedStyle(element).opacity), iterations: animation.effect.getTiming().iterations };
    });
    assert.equal(pulse.peak, 1);
    assert.ok(pulse.fading > .6 && pulse.fading < .75);
    assert.equal(pulse.end, 0);
    assert.equal(pulse.iterations, 1);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await halo.evaluate(element => getComputedStyle(element).animationName), 'none');
    assert.equal(await halo.evaluate(element => getComputedStyle(element).opacity), '0');
    assert.equal(await card.evaluate(element => getComputedStyle(element).animationName), 'none');
    assert.equal(await card.evaluate(element => getComputedStyle(element).opacity), '1');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    assert.equal(await halo.evaluate(element => getComputedStyle(element).animationName), 'trophy-ps4-halo');
    await page.evaluate(() => window.notification.desktopPosition(window.nativeNotification, {
      m_usable: { m_nLeft: 0, m_nTop: 0, m_nWidth: 1920, m_nHeight: 1080 },
    }, 1, [{ toast: { m_notification: window.nativeNotification, m_nToastHeight: 100, m_eState: 3 }, flPercentDone: 1 }]));
    const exit = await card.evaluate(element => {
      const animation = element.getAnimations()[0];
      animation.pause();
      animation.currentTime = 180;
      return { name: getComputedStyle(element).animationName, endX: new DOMMatrix(getComputedStyle(element).transform).m41 };
    });
    assert.deepEqual(exit, { name: 'trophy-ps4-exit', endX: -554 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await card.evaluate(element => getComputedStyle(element).opacity), '0');
    await page.evaluate(() => window.presentation.updatePresentation('notificationStyle', 'ps5'));
    assert.equal(await card.getAttribute('data-notification-style'), 'ps4');
    assert.equal(await page.evaluate(() => window.notification.desktopSize(window.nativeNotification).width), 554);
  });
});

test('PS4 description mode puts the Steam title first, scrolls the objective and preserves the classic option', async () => {
  await host(async page => {
    await page.setViewportSize({ width: 554, height: 100 });
    await page.evaluate(pixel => {
      document.body.classList.add('trophy-styles-notification-window');
      window.presentation.updatePresentation('notificationStyle', 'ps4');
      window.presentation.updatePresentation('subtitleMode', 'description');
      window.presentation.updatePresentation('language', 'en');
      window.mountNative(362680, 'ps4-description', 'Complete every challenge and collect all items across the entire world. '.repeat(3), 2, pixel);
      window.notification.desktopPosition(window.nativeNotification, {
        m_usable: { m_nLeft: 0, m_nTop: 0, m_nWidth: 1920, m_nHeight: 1080 },
      }, 0, [{ toast: { m_notification: window.nativeNotification, m_nToastHeight: 100, m_eState: 1 }, flPercentDone: 0 }]);
    }, pixel);
    const card = page.locator('.trophy-styles-card');
    await card.locator('.trophy-styles-ps4-heading').getByText('<Real Steam title>', { exact: true }).waitFor();
    await card.locator('.trophy-styles-subtitle[data-scrolling="true"]').waitFor();
    assert.equal(await card.locator('.trophy-styles-earned').count(), 0);
    const duration = await page.evaluate(() => {
      const before = window.nativeNotification.nToastDurationMS;
      window.notification.beginNotification(window.nativeNotification);
      return { before, after: window.nativeNotification.nToastDurationMS };
    });
    assert.ok(duration.before >= 15000);
    assert.ok(duration.after >= duration.before);
    assert.equal(await card.evaluate(element => element.clientHeight), 100);
    await page.evaluate(() => window.presentation.updatePresentation('subtitleMode', 'earned'));
    await card.locator('.trophy-styles-earned').filter({ hasText: 'Trophy earned!' }).waitFor();
    assert.equal(await card.locator('.trophy-styles-subtitle').count(), 0);
    assert.equal(await card.locator('.trophy-styles-ps4-title').getByText('<Real Steam title>', { exact: true }).count(), 1);
  });
});

test('PS4 loads missing Steam descriptions and exposes its saved second-line setting', async () => {
  await host(async page => {
    await page.evaluate(() => {
      window.presentation.updatePresentation('notificationStyle', 'ps4');
      window.presentation.updatePresentation('subtitleMode', 'description');
      window.SteamClient.Apps.GetMyAchievementsForApp = async () => ({ result: 1, data: { rgAchievements: [
        { strID: 'missing-description', strName: 'Real Steam title', strDescription: 'An objective loaded from Steam', bAchieved: true },
      ] } });
      window.mountNative(362680, 'missing-description', undefined);
    });
    await page.locator('.trophy-styles-subtitle').filter({ hasText: 'An objective loaded from Steam' }).waitFor();
  });
});


test('Xbox settings persist the style and preview cached Rare and Mythic without PlayStation lookups', async () => {
  await host(async page => {
    await page.evaluate(() => {
      window.backend.readPublicXboxCache = async appid => ({
        version: 1, appid, titleId: '1790216132', name: 'Hades', fetchedAt: Date.now(),
        matches: { ID_0: '1', ID_1: '2' },
        achievements: ['First Step', 'The Ending', 'All Trophies'].map((name, i) => ({
          id: String(i + 1), name, description: 'A unique objective', gamerscore: i === 1 ? 0 : 50, percent: 7.58, category: 'Rare', pack: 'base',
        })),
      });
      window.backend.writePublicXboxCache = async () => true;
    });
    await page.evaluate(() => window.mount());
    await page.getByRole('button', { name: 'PS5', exact: true }).click();
    await page.getByRole('option', { name: 'Xbox Series X|S', exact: true }).click();
    assert.ok(await page.evaluate(() => window.configWrites.some(([key, value]) => key === 'notificationStyle' && value === 'xbox')));
    assert.equal(await page.getByRole('button', { name: 'Xbox green', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Blue', exact: true }).click();
    assert.ok(await page.evaluate(() => window.configWrites.some(([key, value]) => key === 'xboxColor' && value === '#0078d7')));
    await page.getByLabel('Custom Xbox color', { exact: true }).fill('#abcdef');
    assert.ok(await page.evaluate(() => window.configWrites.some(([key, value]) => key === 'xboxColor' && value === '#abcdef')));
    await page.getByRole('button', { name: 'Reset Xbox color', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Xbox green', exact: true }).getAttribute('aria-pressed'), 'true');
    await showSection(page, 'Preview');
    await page.getByRole('button', { name: 'Choose a game', exact: true }).click();
    await page.getByRole('option', { name: 'Hades', exact: true }).click();
    await page.getByRole('button', { name: 'Choose an achievement', exact: true }).click();
    await page.getByRole('option', { name: /Hades achievement 0/ }).locator('[data-xbox-gamerscore="50"]').waitFor();
    assert.equal(await page.getByRole('option', { name: /Hades achievement 1/ }).locator('[data-xbox-gamerscore="0"]').count(), 1);
    assert.equal(await page.getByRole('option', { name: /Hades achievement 2/ }).locator('[data-xbox-gamerscore]').count(), 0);
    await page.getByRole('option', { name: /Hades achievement 0/ }).click();
    await page.locator('[data-xbox-variant="rare"] canvas').waitFor();
    await page.waitForFunction(() => window.previewAchievement?.strID);
    await page.evaluate(() => window.previewSelectedAchievement());
    let notice = await page.evaluate(() => ({ achievement: window.lastToast.achievement, classes: window.lastToast.className }));
    assert.equal(notice.achievement.xboxPercent, 7.58);
    assert.equal(notice.achievement.xboxGamerscore, 50);
    assert.match(notice.classes, /trophy-styles-xbox-rare/);
    await page.getByRole('button', { name: /Hades achievement 0/ }).click();
    await page.getByRole('option', { name: /Hades achievement 1/ }).click();
    assert.equal(await page.getByRole('button', { name: /Hades achievement 1/ }).locator('[data-xbox-gamerscore="0"]').count(), 1);
    await page.getByRole('button', { name: 'Test options', exact: true }).click();
    await page.getByRole('button', { name: 'Mythic', exact: true }).click();
    notice = await page.evaluate(() => ({ achievement: window.lastToast.achievement, classes: window.lastToast.className }));
    assert.equal(notice.achievement.xboxVariant, 'mythic');
    assert.equal(notice.achievement.completionCount, 3);
    assert.equal(notice.achievement.strName, 'Hades');
    assert.match(notice.classes, /trophy-styles-xbox-mythic/);
    const calls = await page.evaluate(() => window.calls);
    assert.equal(calls.some(call => call.startsWith('ps5:') || call.startsWith('search:')), false);
  });
});

test('Xbox settings expose the failing request and allow retrying immediately', async () => {
  await host(async page => {
    await page.evaluate(() => {
      window.backend.readPublicXboxCache = async () => '';
      window.backend.searchPublicXboxGames = async () => { throw new Error('xct.live returned HTTP 503'); };
    });
    await page.evaluate(() => window.mount());
    await page.getByRole('button', { name: 'PS5', exact: true }).click();
    await page.getByRole('option', { name: 'Xbox Series X|S', exact: true }).click();
    await showSection(page, 'Preview');
    await page.getByRole('button', { name: 'Choose a game', exact: true }).click();
    await page.getByRole('option', { name: 'Hades', exact: true }).click();
    await page.getByText('Xbox data is unavailable. Standard notifications remain available.', { exact: true }).waitFor();
    assert.match(await page.locator('[data-trophy-menu-content]').innerText(), /Xbox search: xct.live returned HTTP 503/);
    await page.evaluate(() => { window.backend.searchPublicXboxGames = async () => JSON.stringify({ products: [] }); });
    await page.getByRole('button', { name: 'Retry Xbox lookup', exact: true }).click();
    await page.getByText('No confident Xbox match. Standard notifications remain available.', { exact: true }).waitFor();
    assert.equal(await page.getByText('Xbox search: xct.live returned HTTP 503', { exact: true }).count(), 0);
  });
});


test('disabled percentage and completion preferences stay off when settings open', async () => {
  await host(async page => {
    await page.evaluate(() => window.mount());
    await page.getByRole('button', { name: 'Do not show', exact: true }).waitFor();
    assert.equal(await page.getByRole('checkbox', { name: 'Completion platinum', exact: true }).isChecked(), false);
    await page.evaluate(() => window.mountNative(1145360, 'ID_0', 'An objective'));
    await page.locator('.trophy-styles-card').waitFor();
    assert.equal(await page.locator('.trophy-styles-rarity').count(), 0);
    assert.equal(await page.evaluate(() => window.calls.some(call => call.startsWith('steam-percentages:'))), false);
  }, { activityConfig: { raritySource: 'off', completionPlatinum: false } });
});
