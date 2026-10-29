import { earnedPercent } from './rarity';

const requests = new Map<number, Promise<Map<string, number>>>();
const resolved = new Map<number, Map<string, number>>();

export function parseSteamPercentages(raw: unknown) {
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const items = value?.achievementpercentages?.achievements;
  if (!Array.isArray(items) || items.length > 5000) throw new Error('Steam returned an unexpected global achievement list.');
  const percentages = new Map<string, number>();
  for (const item of items) {
    if (!item || typeof item.name !== 'string' || !item.name) continue;
    const value = typeof item.percent === 'string' && /^\d+(?:\.\d+)?$/.test(item.percent) ? Number(item.percent) : item.percent;
    const percent = earnedPercent(value);
    if (percent === undefined) continue;
    if (percentages.has(item.name)) throw new Error('Steam returned duplicate achievement statistics.');
    percentages.set(item.name, percent);
  }
  return percentages;
}

export function loadSteamPercentages(appid: number) {
  if (!Number.isSafeInteger(appid) || appid < 1 || appid >= 2147483648) return Promise.reject(new Error('Invalid Steam game.'));
  const existing = requests.get(appid);
  if (existing) return existing;
  const load = async () => parseSteamPercentages(await backend.getGlobalSteamAchievementPercentages(appid));
  const request = load().then(percentages => {
    resolved.set(appid, percentages);
    return percentages;
  }).catch(error => { requests.delete(appid); throw error; });
  requests.set(appid, request);
  return request;
}

export function cachedSteamPercent(appid: number, achievementId: string) {
  return resolved.get(appid)?.get(achievementId);
}
