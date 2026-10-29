import type { Achievement } from './card';

export interface DebugGame {
  appid: number;
  name: string;
}

export interface DebugAchievement extends Achievement {
  description: string;
}

interface LibraryApp {
  appid: number | string;
  display_name: string;
  app_type: number;
  visible_in_game_list: boolean;
}

const requests = new Map<number, Promise<DebugAchievement[]>>();

export function readDebugGames(store = window.appStore) {
  const apps = (store as typeof store & { allApps?: LibraryApp[] } | undefined)?.allApps ?? [];
  return apps.filter(app => app.app_type === 1 && app.visible_in_game_list && app.display_name)
    .map(app => ({ appid: Number(app.appid), name: app.display_name }))
    .filter(app => Number.isSafeInteger(app.appid) && app.appid > 0 && app.appid < 2147483648)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function loadDebugAchievements(appid: number) {
  if (!Number.isSafeInteger(appid) || appid <= 0) return Promise.reject(new Error('Choose a Steam game first.'));
  const existing = requests.get(appid);
  if (existing) return existing;
  const load = async () => {
    const apps = window.SteamClient?.Apps;
    if (typeof apps?.GetMyAchievementsForApp !== 'function') throw new Error('Steam achievements are not ready. Reload Steam UI and try again.');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        apps.GetMyAchievementsForApp(String(appid)),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Steam took too long. Select the game again to retry.')), 12000); }),
      ]);
      if (response.result !== 1) throw new Error(`Steam could not load achievements (code ${response.result}).`);
      if (!Array.isArray(response.data?.rgAchievements)) throw new Error('Steam returned an unexpected achievement list.');
      return response.data.rgAchievements.filter(item => item.strID && item.strName).map(item => ({
        strID: item.strID, strName: item.strName, strImage: item.strImage,
        description: item.strDescription ?? '', bAchieved: item.bAchieved,
      }));
    } finally {
      clearTimeout(timer);
    }
  };
  const request = load().catch(error => { requests.delete(appid); throw error; });
  requests.set(appid, request);
  return request;
}
