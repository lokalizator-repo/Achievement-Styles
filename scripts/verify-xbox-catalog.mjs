import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const compiled = await build({ entryPoints: ['frontend/xbox-catalog.ts'], bundle: true, write: false, format: 'iife', globalName: 'XboxCatalog' });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  const page = await browser.newPage();
  await page.exposeFunction('catalogRequest', async (kind, value) => {
    const url = kind === 'steam' ? `https://steamcommunity.com/achievements/${Number(value)}?l=english`
      : kind === 'search' ? `https://xct.live/api/v1/store/products?q=${encodeURIComponent(value)}&per_page=25&lite=1`
      : `https://xct.live/api/v1/store/title-achievements/${encodeURIComponent(value)}`;
    const { stdout: text } = process.env.XBOX_HTTP_PYTHON ? await run(process.env.XBOX_HTTP_PYTHON, ['-c',
      'import sys,urllib.request; r=urllib.request.urlopen(urllib.request.Request(sys.argv[1],headers={"User-Agent":"TrophyStyles/1.0.0"}),timeout=15); sys.stdout.buffer.write(r.read(6000001))', url,
    ], { maxBuffer: 6000000, windowsHide: true }) : await run(process.platform === 'win32' ? 'curl.exe' : 'curl', [
      '--silent', '--show-error', '--fail', '--max-time', '15', '--user-agent', 'TrophyStyles/1.0.0', url,
    ], { maxBuffer: 6000000, windowsHide: true });
    if (text.length > 6000000) throw new Error('Catalog response is too large.');
    return text;
  });
  await page.evaluate(() => {
    window.backend = {
      readPublicXboxCache: async () => '', writePublicXboxCache: async () => true,
      getPublicSteamAchievements: id => window.catalogRequest('steam', id),
      searchPublicXboxGames: query => window.catalogRequest('search', query),
      getPublicXboxAchievements: id => window.catalogRequest('achievements', id),
    };
  });
  await page.addScriptTag({ content: compiled.outputFiles[0].text });
  for (const [name, appid] of [['INDIKA', 1373960], ['Hades', 1145360], ['Hogwarts Legacy', 990080], ['Cyberpunk 2077', 1091500]]) {
    let row;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        row = await page.evaluate(async ({ name, appid }) => {
      const catalog = await window.XboxCatalog.loadXboxCatalog(appid);
      if (!catalog) throw new Error(`No automatic Xbox game match for ${name}.`);
      return { name, appid, titleId: catalog.titleId, xboxAchievements: catalog.achievements.length,
        matched: Object.keys(catalog.matches).length, percentages: catalog.achievements.filter(item => item.percent !== undefined).length,
        base: catalog.achievements.filter(item => item.pack === 'base').length,
        dlc: catalog.achievements.filter(item => item.pack === 'dlc').length };
        }, { name, appid });
        break;
      } catch (error) {
        if (attempt === 1) throw error;
        await page.reload();
        await page.evaluate(() => {
          window.backend = {
            readPublicXboxCache: async () => '', writePublicXboxCache: async () => true,
            getPublicSteamAchievements: id => window.catalogRequest('steam', id),
            searchPublicXboxGames: query => window.catalogRequest('search', query),
            getPublicXboxAchievements: id => window.catalogRequest('achievements', id),
          };
        });
        await page.addScriptTag({ content: compiled.outputFiles[0].text });
      }
    }
    if (!row.matched || row.percentages !== row.xboxAchievements) throw new Error(`Incomplete Xbox smoke check: ${name}.`);
    results.push(row);
    console.log(`${name}: ${row.matched} automatic matches, ${row.percentages}/${row.xboxAchievements} Xbox percentages; ${row.base} base + ${row.dlc} DLC.`);
  }
  await mkdir('dist', { recursive: true });
  await writeFile('dist/xbox-catalog-verification.json', JSON.stringify({ verifiedAt: new Date().toISOString(), results }, null, 2) + '\n');
} finally { await browser.close(); }
