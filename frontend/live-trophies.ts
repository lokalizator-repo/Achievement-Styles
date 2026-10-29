import type { Achievement } from './card';
import { cachedGameCatalog, loadGameCatalog, loadPsnRarities, resolveCatalogTrophy } from './public-catalog';
import { getNotificationStyle, getNotificationStyleSelection, getRaritySource } from './presentation';
import { cachedXboxCatalog, loadXboxCatalog, xboxMetadata } from './xbox-catalog';
import { loadSteamPercentages } from './steam-rarity';

interface EarnedData {
  appid?: () => number;
  achievement_id?: () => string;
  achieved?: () => boolean;
}

let matching = true;
let snapshots = new WeakMap<EarnedData, Pick<Achievement, 'grade' | 'hideGrade' | 'ps5TrophyId'>>();
const warming = new Map<number, Promise<unknown>>();
let xboxSnapshots = new WeakMap<EarnedData, ReturnType<typeof xboxMetadata>>();

export function liveXbox(data: EarnedData) {
  const existing = xboxSnapshots.get(data);
  if (existing) return existing;
  const appid = data.appid?.();
  const result = xboxMetadata(appid === undefined ? undefined : cachedXboxCatalog(appid), data.achievement_id?.());
  xboxSnapshots.set(data, result);
  if (appid !== undefined && !cachedXboxCatalog(appid)) void warmGameTrophies(appid);
  return result;
}

export function setLiveMatching(value: boolean) {
  if (matching === value) return;
  matching = value;
  snapshots = new WeakMap();
  if (value && typeof window !== 'undefined') warmRunningGames();
}

export function warmGameTrophies(appid: number) {
  if (!Number.isSafeInteger(appid) || appid < 1 || appid >= 2147483648) return;
  if (getNotificationStyleSelection(appid) === 'random') void loadXboxCatalog(appid).catch(() => {});
  if (getNotificationStyle(appid) === 'xbox') return loadXboxCatalog(appid).catch(() => undefined);
  if (getRaritySource() === 'steam') void loadSteamPercentages(appid).catch(() => {});
  const psnRarity = getRaritySource() === 'psn';
  if (!matching && !psnRarity) return;
  const pending = warming.get(appid);
  if (pending) return pending;
  const request = (psnRarity ? loadPsnRarities(appid) : loadGameCatalog(appid)).catch(() => undefined).finally(() => warming.delete(appid));
  warming.set(appid, request);
  return request;
}

export function liveTrophy(data: EarnedData): Pick<Achievement, 'grade' | 'hideGrade' | 'ps5TrophyId'> {
  if (!matching) return { grade: 'bronze', hideGrade: true };
  const existing = snapshots.get(data);
  if (existing) return existing;
  const appid = data.appid?.();
  const catalog = appid === undefined ? undefined : cachedGameCatalog(appid);
  const trophy = resolveCatalogTrophy(catalog, data.achievement_id?.());
  const result = trophy ? { grade: trophy.grade, ps5TrophyId: trophy.strID }
    : { grade: 'bronze' as const, hideGrade: true };
  snapshots.set(data, result);
  if (!catalog && appid !== undefined) void warmGameTrophies(appid);
  return result;
}

export function warmRunningGames() {
  const apps = (window.appStore as typeof window.appStore & { allApps?: { appid: number; local_per_client_data?: { display_status?: number } }[] } | undefined)?.allApps ?? [];
  for (const app of apps) if (app.local_per_client_data?.display_status === 4) void warmGameTrophies(app.appid);
}

export function startLiveTrophies() {
  const launch = window.SteamClient?.GameSessions?.RegisterForAppLifetimeNotifications?.(event => {
    if (event.bRunning) void warmGameTrophies(event.unAppID);
  });
  warmRunningGames();
  return () => {
    launch?.unregister();
    snapshots = new WeakMap();
    xboxSnapshots = new WeakMap();
  };
}
