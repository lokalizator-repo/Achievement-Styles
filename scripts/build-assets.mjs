import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
const packedRoot = new URL('../resources/packed/', import.meta.url);
const xboxSounds = await readdir(new URL('../resources/xbox/', import.meta.url));
const packedFiles = [
  'ps4-trophy.wav', 'ps5-trophy.wav', 'ps5-platinum.wav',
  ...xboxSounds.filter(name => name.endsWith('.wav')).map(name => `xbox/${name}`),
];
for (const folder of ['', 'xbox/']) {
  await mkdir(new URL(folder, packedRoot), { recursive: true });
}
await Promise.all(packedFiles.map(async name => {
  const destination = new URL(`${name}.gz`, packedRoot);
  const bytes = await readFile(new URL(`../resources/${name}`, import.meta.url));
  await writeFile(destination, gzipSync(bytes, { level: 9 }));
}));

const grades = ['bronze', 'silver', 'gold', 'platinum'];
const entries = await Promise.all(grades.map(async grade => {
  const filename = `${grade[0].toUpperCase()}${grade.slice(1)}_trophy_(PS5).png`;
  const bytes = await readFile(new URL(`../resources/${filename}`, import.meta.url));
  return `  ${grade}: 'data:image/png;base64,${bytes.toString('base64')}',`;
}));
const logo = await readFile(new URL('../resources/playstation-logo.svg', import.meta.url));
const animation = await readFile(new URL('../resources/ps5-platinum-animation.webp', import.meta.url));
await writeFile(new URL('../frontend/ps5-assets.ts', import.meta.url),
  `export const trophyImages = {\n${entries.join('\n')}\n};\nexport const playstationLogo = 'data:image/svg+xml;base64,${logo.toString('base64')}';\nexport const sampleArtwork = trophyImages.bronze;\nexport const platinumAnimation = 'data:image/webp;base64,${animation.toString('base64')}';\n`);

const badge = await readFile(new URL('../resources/ps4-badge.svg', import.meta.url));
const ps4Trophies = Object.fromEntries(await Promise.all(grades.map(async grade => {
  const bytes = await readFile(new URL(`../resources/ps4-trophy-${grade}.png`, import.meta.url));
  return [grade, `data:image/png;base64,${bytes.toString('base64')}`];
})));
const ps4Fonts = await Promise.all([
  ['SST-Light-latin.3cce6.woff2', 'U+20-FF,U+2DA,U+2DC-2DD,U+2010-2044,U+20AC,U+2122,U+2215'],
  ['SST-Light-latin-ext.7afe7.woff2', 'U+0104-010F,U+0112-017E,U+192,U+218-21B,U+237,U+2C6-2C9,U+1E80-1E9F,U+2070-2089,U+2105,U+2113,U+2116-2117,U+2126,U+212E,U+2202,U+2206,U+220F,U+2211-2212,U+2219-221A,U+221E,U+222B,U+2248,U+2260,U+2264-2265,U+25CA,U+E000-E02A,U+F001-F002,U+FB00-FB04'],
  ['SST-Light-cyrillic.8b377.woff2', 'U+0400-045F,U+0490-0491'],
].map(async ([filename, unicodeRange]) => {
  const bytes = await readFile(new URL(`../resources/fonts/${filename}`, import.meta.url));
  return { source: `data:font/woff2;base64,${bytes.toString('base64')}`, unicodeRange };
}));
await writeFile(new URL('../frontend/ps4-assets.ts', import.meta.url),
  `export const ps4BadgeImage = 'data:image/svg+xml;base64,${badge.toString('base64')}';\nexport const ps4TrophyImages = ${JSON.stringify(ps4Trophies)};\nexport const ps4Fonts = ${JSON.stringify(ps4Fonts)};\n`);

const gameBarAchievementSheets = new Set(['TrophyIntro.png', 'TrophyIdle.png', 'TrophyOutro.png', 'DiamondIntroV2.png', 'DiamondIdleV2.png', 'DiamondOutroV2.png']);
const xboxImages = Object.fromEntries(await Promise.all((await readdir(new URL('../resources/xbox/', import.meta.url)))
  .filter(name => name.endsWith('.png') && !gameBarAchievementSheets.has(name) && !/^Console(Trophy|Diamond)/.test(name)).map(async name => [name, `data:image/png;base64,${(await readFile(new URL(`../resources/xbox/${name}`, import.meta.url))).toString('base64')}`])));
const xboxLogo = await readFile(new URL('../resources/xbox-logo.svg', import.meta.url), 'utf8');
const xboxLogoPath = xboxLogo.match(/<path[^>]* d="([^"]+)"/)?.[1];
if (!xboxLogoPath) throw new Error('Xbox logo path is missing');
await writeFile(new URL('../frontend/xbox-assets.ts', import.meta.url), `export const xboxImages: Record<string, string> = ${JSON.stringify(xboxImages)};\nexport const xboxLogoPath = ${JSON.stringify(xboxLogoPath)};\n`);
