import type { Achievement } from './card';
import { getSteamSchema, normalizeTitle } from './public-catalog';
import { earnedPercent } from './rarity';

export interface XboxAchievement {
  id: string;
  name: string;
  description: string;
  gamerscore: number;
  percent?: number;
  category?: 'Rare' | 'Common';
  pack: 'base' | 'dlc' | 'unknown';
}

export interface XboxCatalog {
  version: 1;
  appid: number;
  titleId: string;
  name: string;
  fetchedAt: number;
  achievements: XboxAchievement[];
  matches: Record<string, string>;
}

interface SteamEntry { id: string; name: string; description: string }
interface Candidate { titleId: string; name: string }
const requests = new Map<number, { until: number; promise: Promise<XboxCatalog | undefined> }>();
const catalogs = new Map<number, XboxCatalog>();

function validAppid(appid: number) {
  return Number.isSafeInteger(appid) && appid > 0 && appid < 2147483648;
}

function gameTitle(name: string) {
  return normalizeTitle(name.replace(/\s*(?:[:–—-]\s*)?(?:game of the year(?: edition)?|definitive edition|deluxe edition|standard edition|complete edition)\s*$/i, ''));
}

export function parseXboxCandidates(raw: unknown, name: string): Candidate[] {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!Array.isArray(data?.products)) throw new Error('Xbox game search returned an unexpected response.');
  const candidates = new Map<string, Candidate>();
  for (const item of data.products) {
    if (item?.productKind !== 'Game' || typeof item.title !== 'string'
      || typeof item.xboxTitleId !== 'string' || !/^\d{1,10}$/.test(item.xboxTitleId)
      || gameTitle(item.title) !== gameTitle(name)) continue;
    candidates.set(item.xboxTitleId, { titleId: item.xboxTitleId, name: item.title });
  }
  return [...candidates.values()].slice(0, 4);
}

export function parseXboxAchievements(raw: unknown): XboxAchievement[] {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!Array.isArray(data?.achievements) || !data.achievements.length || data.achievements.length > 5000) {
    throw new Error('Xbox achievement list is empty or unavailable.');
  }
  const seen = new Set<string>();
  return data.achievements.map((item: Record<string, unknown>) => {
    if (!item || typeof item.id !== 'string' || !/^\d{1,12}$/.test(item.id) || seen.has(item.id)
      || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 512 || typeof item.description !== 'string' || item.description.length > 4000
      || typeof item.gamerscore !== 'number' || !Number.isSafeInteger(item.gamerscore) || item.gamerscore < 0) {
      throw new Error('Xbox returned an invalid achievement.');
    }
    seen.add(item.id);
    const percent = typeof item.rarityPct === 'number' ? earnedPercent(item.rarityPct)
      : typeof item.rarityPct === 'string' && /^\d+(?:\.\d+)?$/.test(item.rarityPct) ? earnedPercent(Number(item.rarityPct)) : undefined;
    return {
      id: item.id, name: item.name, description: item.description, gamerscore: item.gamerscore, percent,
      category: item.rarityCategory === 'Rare' || item.rarityCategory === 'Common' ? item.rarityCategory : undefined,
      pack: item.packKind === 'base' || item.packKind === 'dlc' ? item.packKind : 'unknown',
    };
  });
}

function similarity(left: string, right: string) {
  if (!left.length || !right.length) return 0;
  let row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 0; i < left.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < right.length; j++) next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + (left[i] === right[j] ? 0 : 1)));
    row = next;
  }
  return 1 - row[right.length] / Math.max(left.length, right.length);
}

export function matchXboxAchievements(steam: SteamEntry[], xbox: XboxAchievement[]) {
  const normalized = xbox.map(item => ({ item, name: normalizeTitle(item.name), description: normalizeTitle(item.description) }));
  const proposed = steam.flatMap(entry => {
    const name = normalizeTitle(entry.name), description = normalizeTitle(entry.description);
    let matches = normalized.filter(item => item.name === name);
    if (!matches.length && description.length >= 12) matches = normalized.filter(item => item.description === description);
    if (!matches.length && name.length >= 8 && description.length >= 20) {
      matches = normalized.filter(item => similarity(name, item.name) >= 0.9 && similarity(description, item.description) >= 0.9);
    }
    return matches.length === 1 ? [{ steamId: entry.id, xboxId: matches[0].item.id }] : [];
  });
  const counts = new Map<string, number>();
  for (const match of proposed) counts.set(match.xboxId, (counts.get(match.xboxId) ?? 0) + 1);
  return Object.fromEntries(proposed.filter(match => counts.get(match.xboxId) === 1).map(match => [match.steamId, match.xboxId]));
}

function readCache(raw: unknown, appid: number): XboxCatalog | undefined {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (data?.version !== 1 || data.appid !== appid || !/^\d{1,10}$/.test(data.titleId) || typeof data.name !== 'string'
      || !Number.isFinite(data.fetchedAt) || data.fetchedAt > Date.now() + 60000 || Date.now() - data.fetchedAt > 7 * 86400000
      || !data.matches || typeof data.matches !== 'object' || Array.isArray(data.matches)) return;
    const achievements = parseXboxAchievements(JSON.stringify({ achievements: data.achievements.map((item: XboxAchievement) => ({
      ...item, rarityPct: item.percent, rarityCategory: item.category, packKind: item.pack,
    })) }));
    const ids = new Set(achievements.map(item => item.id));
    if (Object.entries(data.matches).some(([key, id]) => !key || typeof id !== 'string' || !ids.has(id))) return;
    return { ...data, achievements };
  } catch { return; }
}

export function cachedXboxCatalog(appid: number) {
  return catalogs.get(appid);
}

async function catalogStep<T>(stage: string, action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (reason) { throw new Error(`${stage}: ${reason instanceof Error ? reason.message : String(reason)}`); }
}

export function loadXboxCatalog(appid: number, refresh = false): Promise<XboxCatalog | undefined> {
  if (!validAppid(appid)) return Promise.reject(new Error('Invalid Steam game.'));
  const existing = requests.get(appid);
  if (!refresh && existing && existing.until > Date.now()) return existing.promise;
  const load = async () => {
    let saved: XboxCatalog | undefined;
    try { saved = readCache(await backend.readPublicXboxCache(appid), appid); } catch {}
    if (!refresh && saved && Date.now() - saved.fetchedAt < 86400000) return saved;
    try {
      const steam = await catalogStep('Steam schema', () => getSteamSchema(appid));
      const candidates = await catalogStep('Xbox search', async () => parseXboxCandidates(await backend.searchPublicXboxGames(steam.name.slice(0, 200)), steam.name));
      const results: XboxCatalog[] = [];
      const failures: unknown[] = [];
      for (const candidate of candidates) {
        try {
          const achievements = await catalogStep(`Xbox title ${candidate.titleId}`, async () => parseXboxAchievements(await backend.getPublicXboxAchievements(candidate.titleId)));
          results.push({ version: 1, appid, titleId: candidate.titleId, name: candidate.name, fetchedAt: Date.now(),
            achievements, matches: matchXboxAchievements(steam.achievements, achievements) });
        } catch (error) { failures.push(error); }
      }
      if (!results.length && failures.length) throw failures[0];
      results.sort((left, right) => Object.keys(right.matches).length - Object.keys(left.matches).length);
      const catalog = results[0];
      if (!catalog || !Object.keys(catalog.matches).length
        || results[1] && Object.keys(results[1].matches).length === Object.keys(catalog.matches).length) return;
      try { await backend.writePublicXboxCache(appid, JSON.stringify(catalog)); } catch {}
      return catalog;
    } catch (error) {
      if (saved) return saved;
      throw error;
    }
  };
  const record = { until: Date.now() + 15 * 60000, promise: Promise.resolve(undefined) as Promise<XboxCatalog | undefined> };
  record.promise = load().then(catalog => {
    if (catalog) {
      if (requests.get(appid) === record) catalogs.set(appid, catalog);
      record.until = Math.max(Date.now() + 15 * 60000, catalog.fetchedAt + 86400000);
      if (catalogs.size > 128) catalogs.delete(catalogs.keys().next().value!);
    }
    return catalog;
  }).catch(error => { if (requests.get(appid) === record) requests.delete(appid); throw error; });
  requests.set(appid, record);
  if (requests.size > 128) requests.delete(requests.keys().next().value!);
  return record.promise;
}

export function xboxMetadata(catalog: XboxCatalog | undefined, id: string | undefined): Pick<Achievement, 'xboxVariant' | 'xboxPercent' | 'xboxGamerscore' | 'xboxAchievementId'> {
  const match = id && catalog?.matches[id];
  const item = match ? catalog?.achievements.find(item => item.id === match) : undefined;
  return item ? { xboxVariant: item.category === 'Rare' ? 'rare' : 'normal', xboxPercent: item.percent, xboxGamerscore: item.gamerscore, xboxAchievementId: item.id }
    : { xboxVariant: 'normal' };
}

export function xboxCompletion(catalog: XboxCatalog | undefined, achievements: { strID?: string; bAchieved: boolean }[], unlocks: Set<string>): Achievement | undefined {
  if (!achievements.length || achievements.some(item => !item.strID)) return;
  const base = catalog?.achievements.filter(item => item.pack === 'base') ?? [];
  const reverse = new Map(Object.entries(catalog?.matches ?? {}).map(([steam, xbox]) => [xbox, steam]));
  const steamIds = new Set(achievements.map(item => item.strID));
  const mappedBase = base.length > 0 && catalog?.achievements.every(item => item.pack !== 'unknown')
    && base.every(item => reverse.has(item.id) && steamIds.has(reverse.get(item.id)!));
  const required = mappedBase ? new Set(base.map(item => reverse.get(item.id)!)) : steamIds;
  if (!achievements.filter(item => required.has(item.strID)).every(item => item.bAchieved || unlocks.has(item.strID!))) return;
  return { strName: catalog?.name ?? '', description: '', bAchieved: true, xboxVariant: 'mythic',
    completionCount: required.size, completionBaseGame: mappedBase };
}
