import type { Ps5Trophy } from './ps5-catalog';
import { earnedPercent } from './rarity';

export interface CatalogCandidate {
  slug: string;
  name: string;
  region: string;
  platform: 'PS5' | 'PS4';
}

export interface GameCatalog {
  version: 2;
  appid: number;
  gameId: string;
  name: string;
  source: string;
  fetchedAt: number;
  kind: 'ready' | 'missing' | 'choose';
  trophies: Ps5Trophy[];
  matches: Record<string, string>;
  candidates: CatalogCandidate[];
}

interface SteamSchema {
  name: string;
  achievements: { id: string; name: string; description: string }[];
}

const requests = new Map<string, Promise<GameCatalog>>();
const resolved = new Map<number, GameCatalog>();
const schemas = new Map<number, Promise<SteamSchema>>();
const artworks = new Map<string, Promise<string>>();
const rarityRequests = new Map<string, Promise<Ps5Trophy[]>>();
const catalogHost = 'https://psntrophyleaders.com';

export function normalizeTitle(value: string) {
  return value.replace(/[™®]/g, '').normalize('NFKC').toLocaleLowerCase()
    .replace(/neighbourhood/g, 'neighborhood').replace(/disorganised/g, 'disorganized').replace(/[^\p{L}\p{N}]/gu, '');
}

export function parseSteamSchema(page: string, appid: number): SteamSchema {
  const document = new DOMParser().parseFromString(page, 'text/html');
  const state = JSON.parse(document.querySelector('#valve-ssr-data')?.textContent ?? 'null');
  const queries = JSON.parse(state?.renderContext?.queryData ?? 'null')?.queries;
  if (!Array.isArray(queries)) throw new Error('Steam public achievement page changed or is unavailable.');
  const schema = ['schema_v2', 'schema'].map(key => queries.find(query => query.queryKey?.[0] === 'achievements'
    && query.queryKey?.[1] === appid && query.queryKey?.[2] === key)?.state?.data).find(data => Array.isArray(data?.groups));
  const store = queries.find(query => query.queryKey?.[0] === 'StoreItem' && query.state?.data?.id === appid && typeof query.state?.data?.name === 'string')?.state?.data;
  if (!schema) throw new Error('Steam did not return the English achievement schema.');
  if (!store?.name) throw new Error('Steam did not return the English game name.');
  const items: { api_name?: unknown; name?: unknown; description?: unknown; archived?: unknown }[] = schema.groups.flatMap((group: { achievements?: unknown[] }) => group.achievements ?? []);
  const achievements = items.filter(item => item && !item.archived && typeof item.api_name === 'string' && typeof item.name === 'string')
    .map(item => ({ id: item.api_name as string, name: item.name as string, description: typeof item.description === 'string' ? item.description : '' }));
  if (achievements.length > 5000) throw new Error('Steam returned too many achievements.');
  return { name: store.name, achievements };
}

function stripEdition(name: string) {
  return name.replace(/\s*(?:[:–—\-�]\s*)?(?:remastered|director['’]s cut|game of the year(?: edition)?|definitive edition|complete edition|deluxe edition)\s*$/i, '').trim();
}

function sameGame(left: string, right: string) {
  return normalizeTitle(stripEdition(left)) === normalizeTitle(stripEdition(right));
}

export function parseCandidates(raw: unknown): CatalogCandidate[] {
  const response = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!response || typeof response !== 'object' || !('success' in response)) throw new Error('Public game search returned an unexpected response.');
  const data = (response as { success: boolean; data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  return data.flatMap(item => {
    if (!item || (Number(item.platform) & 12) === 0 || typeof item.sort_title !== 'string'
      || !/^[a-z0-9][a-z0-9-]{1,179}$/.test(item.sort_title) || typeof item.display_title !== 'string' || seen.has(item.sort_title)) return [];
    seen.add(item.sort_title);
    return [{ slug: item.sort_title, name: item.display_title, region: typeof item.region === 'string' ? item.region : '', platform: (Number(item.platform) & 8) ? 'PS5' as const : 'PS4' as const }];
  }).slice(0, 100);
}

export function parsePublicTrophies(page: string, slug: string): Ps5Trophy[] {
  const document = new DOMParser().parseFromString(page, 'text/html');
  const result: Ps5Trophy[] = [];
  for (const title of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[id^="trophytitle"]'))) {
    const row = title.closest('tr');
    const id = title.id.match(/^trophytitle(\d+)$/)?.[1];
    const grade = ['bronze', 'silver', 'gold', 'platinum'].find(value => row?.querySelector(`span.title.${value}`));
    const image = row?.querySelector<HTMLImageElement>('img.trophy-image.standard')?.getAttribute('src');
    const name = title.textContent?.trim();
    if (!row || !id || !grade || !name || !image || !/^https:\/\/np\.sentl\.com\/images\/games\/[a-zA-Z0-9/_.-]+$/.test(image)) continue;
    const headers = Array.from(row.closest('table')?.querySelector('thead tr, tr')?.querySelectorAll('th, td') ?? []);
    const sonyColumn = headers.findIndex(cell => normalizeTitle(cell.textContent ?? '') === 'sonypercentearned');
    const sonyValue = sonyColumn < 0 ? '' : row.cells[sonyColumn]?.textContent?.trim().replace(/%$/, '').trim() ?? '';
    const psnPercent = /^\d+(?:[.,]\d+)?$/.test(sonyValue) ? earnedPercent(Number(sonyValue.replace(',', '.'))) : undefined;
    result.push({ strID: `ps5:${id}`, strName: name, description: row?.querySelector('[id^="trophydescription"]')?.textContent?.trim() ?? '',
      ...(psnPercent === undefined ? {} : { psnPercent }),
      grade: grade as Ps5Trophy['grade'], bAchieved: false, strImage: image, iconSource: image, source: `${catalogHost}/game/view/${slug}/${id}` });
  }
  if (!result.length || result.length > 5000 || new Set(result.map(item => item.strID)).size !== result.length) {
    throw new Error('Public PS5 trophy list is empty, blocked or has changed format.');
  }
  return result;
}

export function buildPublicMatches(steam: SteamSchema['achievements'], trophies: Ps5Trophy[]) {
  const proposed = steam.flatMap(item => {
    let candidates = trophies.filter(trophy => normalizeTitle(trophy.strName) === normalizeTitle(item.name));
    if (!candidates.length && item.description.length >= 20) candidates = trophies.filter(trophy => normalizeTitle(trophy.description) === normalizeTitle(item.description));
    return candidates.length === 1 ? [{ id: item.id, trophyId: candidates[0].strID }] : [];
  });
  const counts = new Map<string, number>();
  for (const item of proposed) counts.set(item.trophyId, (counts.get(item.trophyId) ?? 0) + 1);
  return Object.fromEntries(proposed.filter(item => counts.get(item.trophyId) === 1).map(item => [item.id, item.trophyId]));
}

function readCached(raw: unknown, appid: number, slug?: string): GameCatalog | undefined {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || value.version !== 2 || value.appid !== appid || value.kind !== 'ready'
      || typeof value.gameId !== 'string' || !/^[a-z0-9][a-z0-9-]{1,179}$/.test(value.gameId)
      || (slug && value.gameId !== slug) || value.source !== `${catalogHost}/game/view/${value.gameId}`
      || typeof value.name !== 'string' || !Number.isFinite(value.fetchedAt)
      || Date.now() - value.fetchedAt > 7 * 86400000 || value.fetchedAt > Date.now() + 60000
      || !Array.isArray(value.trophies) || !value.trophies.length || value.trophies.length > 5000
      || !value.matches || typeof value.matches !== 'object' || Array.isArray(value.matches)) return;
    for (const trophy of value.trophies) {
      if (!trophy || typeof trophy.strID !== 'string' || typeof trophy.strName !== 'string' || typeof trophy.description !== 'string'
        || !['bronze', 'silver', 'gold', 'platinum'].includes(trophy.grade)
        || !/^https:\/\/np\.sentl\.com\/images\/games\/[a-zA-Z0-9/_.-]+$/.test(trophy.strImage)
        || !trophy.source?.startsWith(`${value.source}/`)
        || (trophy.psnPercent !== undefined && earnedPercent(trophy.psnPercent) === undefined)) return;
    }
    const ids = new Set(value.trophies.map((item: Ps5Trophy) => item.strID));
    if (Object.values(value.matches).some(id => typeof id !== 'string' || !ids.has(id))) return;
    return { ...value, candidates: [] };
  } catch { return; }
}

export function getSteamSchema(appid: number) {
  let request = schemas.get(appid);
  if (!request) {
    request = backend.getPublicSteamAchievements(appid).then(page => parseSteamSchema(page, appid))
      .catch(error => { schemas.delete(appid); throw error; });
    schemas.set(appid, request);
  }
  return request;
}

async function searchCatalogCandidates(name: string, slug?: string) {
  const originalName = name.replace(/[™®]/g, '').trim();
  const searchName = originalName.normalize('NFKC').replace(/[‘’ʼ]/g, "'").replace(/[‐‑–—]/g, '-');
  const baseName = stripEdition(searchName);
  const queries = [...new Set([searchName, originalName, baseName, baseName.split(/\s+/).slice(0, 1).join(' ')])].filter(query => query.length >= 2);
  let candidates: CatalogCandidate[] = [];
  for (const query of queries) {
    const found = parseCandidates(await backend.searchPublicPs5Games(query.slice(0, 200)));
    candidates = [...new Map([...candidates, ...found].map(candidate => [candidate.slug, candidate])).values()];
    if (slug ? candidates.some(candidate => candidate.slug === slug) : candidates.some(candidate => sameGame(candidate.name, name))) break;
  }
  return candidates;
}

function selectCatalogCandidate(name: string, candidates: CatalogCandidate[], slug?: string) {
  const exact = candidates.filter(candidate => normalizeTitle(candidate.name) === normalizeTitle(name));
  const compatible = exact.length ? exact : candidates.filter(candidate => sameGame(candidate.name, name));
  const preferred = compatible.some(candidate => candidate.platform === 'PS5')
    ? compatible.filter(candidate => candidate.platform === 'PS5') : compatible;
  const choices = compatible.length ? compatible : candidates;
  const chosen = slug ? choices.find(candidate => candidate.slug === slug) : preferred.length === 1 ? preferred[0] : undefined;
  if (slug && !chosen) throw new Error('The selected PS5 edition is no longer in the public search results.');
  return { candidates: choices, chosen };
}

async function fetchGameCatalog(appid: number, slug?: string): Promise<GameCatalog> {
  const steam = await getSteamSchema(appid);
  const found = await searchCatalogCandidates(steam.name, slug);
  const { candidates, chosen } = selectCatalogCandidate(steam.name, found, slug);
  const base = { version: 2 as const, appid, gameId: '', name: steam.name, source: '', fetchedAt: Date.now(), trophies: [], matches: {}, candidates };
  if (!chosen) return { ...base, kind: candidates.length ? 'choose' : 'missing' };
  const trophies = parsePublicTrophies(await backend.getPublicPs5Page(chosen.slug, ''), chosen.slug);
  rarityRequests.set(chosen.slug, Promise.resolve(trophies));
  const result: GameCatalog = { ...base, kind: 'ready', gameId: chosen.slug, name: chosen.name,
    source: `${catalogHost}/game/view/${chosen.slug}`, trophies, matches: buildPublicMatches(steam.achievements, trophies), candidates: [] };
  await backend.writePublicPs5Cache(appid, JSON.stringify(result)).catch(() => false);
  if (slug) requests.set(`${appid}:`, Promise.resolve(result));
  return result;
}

export function loadGameCatalog(appid: number, slug?: string, refresh = false): Promise<GameCatalog> {
  if (!Number.isSafeInteger(appid) || appid < 1 || appid >= 2147483648) return Promise.reject(new Error('Invalid Steam game.'));
  const key = `${appid}:${slug ?? ''}`;
  if (refresh) {
    requests.delete(key);
    schemas.delete(appid);
  }
  const existing = requests.get(key);
  if (existing) return existing;
  const load = async (): Promise<GameCatalog> => {
    if (!refresh) {
      const saved = await backend.readPublicPs5Cache(appid).catch(() => '');
      const cached = readCached(saved, appid, slug);
      if (cached) return cached;
    }
    return fetchGameCatalog(appid, slug);
  };
  const request = load().then(catalog => {
    if (requests.get(key) === request) resolved.set(appid, catalog);
    return catalog;
  }).catch(error => { if (requests.get(key) === request) requests.delete(key); throw error; });
  requests.set(key, request);
  return request;
}

export function cachedGameCatalog(appid: number) {
  return resolved.get(appid);
}

export async function loadPsnRarities(appid: number) {
  const catalog = await loadGameCatalog(appid);
  if (catalog.kind !== 'ready' || catalog.trophies.every(trophy => earnedPercent(trophy.psnPercent) !== undefined)) return catalog;
  let request = rarityRequests.get(catalog.gameId);
  if (!request) {
    request = backend.getPublicPs5Page(catalog.gameId, '').then(page => parsePublicTrophies(page, catalog.gameId))
      .catch(error => { rarityRequests.delete(catalog.gameId); throw error; });
    rarityRequests.set(catalog.gameId, request);
  }
  const rates = new Map((await request).map(trophy => [trophy.strID, trophy.psnPercent]));
  for (const trophy of catalog.trophies) {
    const percent = earnedPercent(rates.get(trophy.strID));
    if (percent !== undefined) trophy.psnPercent = percent;
  }
  return catalog;
}

export function resolveCatalogTrophy(catalog: GameCatalog | undefined, steamId: string | undefined) {
  if (!steamId || !catalog) return undefined;
  const trophyId = catalog.matches[steamId];
  return trophyId ? catalog.trophies.find(item => item.strID === trophyId) : undefined;
}

export function loadTrophyArtwork(trophy: Ps5Trophy): Promise<string> {
  if (trophy.strImage?.startsWith('data:')) return Promise.resolve(trophy.strImage);
  const key = trophy.source;
  const existing = artworks.get(key);
  if (existing) return existing;
  const request = (async () => {
    const path = key.match(/^https:\/\/psntrophyleaders\.com\/game\/view\/([a-z0-9-]+)\/(\d+)$/);
    if (!path) throw new Error('Invalid PS5 trophy source.');
    const page = await backend.getPublicPs5Page(path[1], path[2]);
    const document = new DOMParser().parseFromString(page, 'text/html');
    const url = document.querySelector('#id-trophyimage')?.getAttribute('src');
    if (!url || !/^https:\/\/np\.sentl\.com\/images\/games\/[a-zA-Z0-9/_.-]+$/.test(url)) throw new Error('Full-size PS5 artwork is unavailable.');
    const image = await backend.getPublicPs5Icon(url);
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(image) && image !== url) throw new Error('PS5 artwork returned an unexpected format.');
    await new Promise<void>((resolve, reject) => {
      const preview = new Image();
      const finish = (error?: Error) => {
        clearTimeout(timer);
        preview.onload = null;
        preview.onerror = null;
        if (error) reject(error);
        else resolve();
      };
      const timer = setTimeout(() => finish(new Error('PS5 artwork took too long to load.')), 12000);
      preview.onload = () => finish();
      preview.onerror = () => finish(new Error('Steam could not decode the PS5 artwork.'));
      preview.src = image;
    });
    return image;
  })().catch(error => { artworks.delete(key); throw error; });
  artworks.set(key, request);
  return request;
}
