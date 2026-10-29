import { useEffect, useSyncExternalStore } from 'react';
import type { Achievement } from './card';
import type { UnlockEvent } from './completion';

export interface HistoryEntry {
  appid: number;
  game: string;
  earnedAt: number;
  achievement: Achievement & { strID: string };
}

export interface GameProgress { earned: number; total: number }
const listeners = new Set<() => void>();
let state = { user: '', history: [] as HistoryEntry[], progress: {} as Record<number, GameProgress>, loading: true, error: '' };
let refresh: ((appid: number) => void) | undefined;
let clear: (() => Promise<void>) | undefined;
let retry: (() => Promise<void>) | undefined;

function publish(value: Partial<typeof state>) {
  state = { ...state, ...value };
  for (const listener of listeners) listener();
}

export function parseHistory(value: unknown): HistoryEntry[] {
  try {
    const rows: unknown = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(rows)) return [];
    const seen = new Set<string>();
    return rows.filter((row): row is HistoryEntry => {
      if (!row || typeof row !== 'object') return false;
      const item = row as HistoryEntry;
      const key = `${item.appid}:${item.achievement?.strID}`;
      if (!Number.isSafeInteger(item.appid) || item.appid < 1 || item.appid >= 2147483648
        || typeof item.game !== 'string' || !Number.isFinite(item.earnedAt) || item.earnedAt <= 0
        || typeof item.achievement?.strID !== 'string' || !item.achievement.strID
        || typeof item.achievement.strName !== 'string' || !item.achievement.strName || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => b.earnedAt - a.earnedAt).slice(0, 500);
  } catch { return []; }
}

export function achievementProgress(achievements: Array<{ strID?: string; bAchieved: boolean }>, unlocks: Set<string>): GameProgress | undefined {
  const items = new Map(achievements.filter(item => item.strID).map(item => [item.strID!, item.bAchieved]));
  if (!items.size) return;
  let earned = 0;
  for (const [id, achieved] of items) if (achieved || unlocks.has(id)) earned++;
  return { earned, total: items.size };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getAchievementActivity() { return state; }

export function useAchievementActivity(appid?: number) {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => { if (appid) refresh?.(appid); }, [appid, snapshot.user]);
  return snapshot;
}

export function clearAchievementHistory() { return clear?.() ?? Promise.resolve(); }
export function retryAchievementHistory() { return retry?.() ?? Promise.resolve(); }

export function startAchievementActivity(storage: { read(key: string): Promise<unknown>; write(key: string, value: string): Promise<void>; metadata?(appid: number, achievementId: string): Partial<Achievement> }) {
  let stopped = false;
  let generation = 0;
  let historyLoaded = false;
  let accountReady = Promise.resolve();
  let writes = Promise.resolve();
  const pending = new Map<number, Promise<void>>();
  const unlocks = new Map<number, Set<string>>();
  const user = () => {
    const id = window.App?.m_CurrentUser?.strSteamID ?? '';
    return /^\d{17}$/.test(id) ? id : '';
  };
  const storageKey = (id: string) => `achievementHistory_${id}`;
  const report = (error: unknown) => { if (!stopped) publish({ error: error instanceof Error ? error.message : String(error) }); };
  const checkAccount = (force = false) => {
    const id = user();
    if (state.user === id && !force) return;
    const version = ++generation;
    historyLoaded = false;
    pending.clear();
    unlocks.clear();
    publish({ user: id, history: [], progress: {}, loading: true, error: '' });
    accountReady = (async () => {
      try {
        const saved = id ? await storage.read(storageKey(id)) : [];
        if (!stopped && generation === version) { historyLoaded = true; publish({ history: parseHistory(saved), loading: false }); }
      } catch (error) {
        if (!stopped && generation === version) { publish({ loading: false }); report(error); }
      }
    })();
  };
  const save = (id: string, rows: HistoryEntry[]) => {
    const content = JSON.stringify(rows);
    writes = writes.catch(() => {}).then(() => storage.write(storageKey(id), content));
    return writes;
  };
  const updateProgress = (appid: number): Promise<void> => {
    const existing = pending.get(appid);
    if (existing) return existing;
    const version = generation;
    const id = user();
    const request = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const response = await Promise.race([
          window.SteamClient.Apps.GetMyAchievementsForApp(String(appid)),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Steam achievement progress timed out.')), 12000); }),
        ]);
        if (stopped || version !== generation || user() !== id) return;
        if (response.result !== 1 || !Array.isArray(response.data?.rgAchievements)) return;
        const progress = achievementProgress(response.data.rgAchievements, unlocks.get(appid) ?? new Set());
        if (progress) publish({ progress: { ...state.progress, [appid]: progress } });
      } catch (error) { if (!stopped && version === generation) console.warn('Could not load achievement progress', error); }
      finally { clearTimeout(timer); if (version === generation) pending.delete(appid); }
    })();
    pending.set(appid, request);
    return request;
  };
  refresh = appid => { checkAccount(); if (user() && !state.progress[appid]) void updateProgress(appid); };
  clear = async () => {
    checkAccount();
    const id = user(), version = generation;
    await accountReady;
    if (!id || stopped || generation !== version || !historyLoaded) return;
    publish({ history: [], error: '' });
    try { await save(id, []); } catch (error) { if (version === generation) report(error); }
  };
  retry = async () => {
    checkAccount();
    const id = user(), version = generation;
    if (!id) return;
    if (!historyLoaded) { checkAccount(true); await accountReady; return; }
    publish({ error: '' });
    try { await save(id, state.history); } catch (error) { if (version === generation) report(error); }
  };
  const notify = async (event: UnlockEvent & { achievement: Achievement & { strID: string } }) => {
    checkAccount();
    const id = user(), version = generation;
    const appid = event?.unAppID;
    if (!id || event?.achievement?.bAchieved !== true || !event.achievement.strID || !event.achievement.strName
      || !Number.isSafeInteger(appid) || appid < 1 || appid >= 2147483648) return;
    let earned = unlocks.get(appid);
    if (!earned) unlocks.set(appid, earned = new Set());
    earned.add(event.achievement.strID);
    void updateProgress(appid);
    const entry: HistoryEntry = {
      appid, earnedAt: Date.now(), game: window.appStore?.GetAppOverviewByAppID?.(appid)?.display_name ?? String(appid),
      achievement: { strID: event.achievement.strID, strName: event.achievement.strName, strImage: event.achievement.strImage,
        description: (event.achievement as Achievement & { strDescription?: string }).strDescription ?? event.achievement.description,
        ...storage.metadata?.(appid, event.achievement.strID), bAchieved: true },
    };
    await accountReady;
    if (stopped || generation !== version || user() !== id || !historyLoaded) return;
    if (state.history.some(item => item.appid === appid && item.achievement.strID === entry.achievement.strID)) return;
    const history = [entry, ...state.history].slice(0, 500);
    publish({ history });
    try { await save(id, history); } catch (error) { if (version === generation) report(error); }
  };
  checkAccount();
  const listener = window.SteamClient?.GameSessions?.RegisterForAchievementNotification?.(event => { void notify(event as unknown as UnlockEvent & { achievement: Achievement & { strID: string } }).catch(report); });
  const accountTimer = setInterval(checkAccount, 2000);
  return () => { stopped = true; generation++; clearInterval(accountTimer); listener?.unregister(); refresh = undefined; clear = undefined; retry = undefined; publish({ user: '', history: [], progress: {}, loading: true, error: '' }); };
}
