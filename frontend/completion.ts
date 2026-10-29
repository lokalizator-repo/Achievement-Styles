import type { Achievement } from './card';
import type { DebugAchievement } from './debug-data';
import type { GameCatalog } from './public-catalog';

export interface UnlockEvent {
  unAppID: number;
  achievement: { strID: string; bAchieved: boolean };
}

export function completionPlatinum(catalog: GameCatalog | undefined, achievements: DebugAchievement[]): Achievement | undefined {
  if (!catalog || catalog.kind !== 'ready' || !achievements.length) return;
  const platinums = catalog.trophies.filter(item => item.grade === 'platinum');
  if (platinums.length !== 1) return;
  const trophy = platinums[0];
  if (achievements.some(item => item.strID && catalog.matches[item.strID] === trophy.strID)) return;
  return { ...trophy, bAchieved: true, ps5TrophyId: trophy.strID };
}

interface CompletionDependencies {
  currentUser(): string | undefined;
  achievements(appid: number): Promise<DebugAchievement[]>;
  catalog(appid: number): Promise<GameCatalog>;
  awarded(user: string, appid: number): Promise<boolean>;
  claim(user: string, appid: number): Promise<boolean>;
  release(user: string, appid: number): Promise<unknown>;
  show(achievement: Achievement): void;
  wait(milliseconds: number, signal: AbortSignal): Promise<void>;
  report(error: unknown): void;
  resolve?(appid: number, achievements: DebugAchievement[], unlocks: Set<string>): Promise<Achievement | undefined>;
  delay?: number;
}

export function createCompletionMonitor(deps: CompletionDependencies) {
  let enabled = false;
  let controller = new AbortController();
  const jobs = new Map<string, { unlocks: Set<string>; revision: number; promise?: Promise<void> }>();
  const completed = new Set<string>();

  const setEnabled = (value: boolean) => {
    if (enabled === value) return;
    enabled = value;
    controller.abort();
    controller = new AbortController();
    jobs.clear();
  };

  const notify = (event: UnlockEvent): Promise<void> => {
    const appid = Number(event?.unAppID);
    const user = deps.currentUser();
    if (!enabled || !user || !Number.isSafeInteger(appid) || appid < 1 || appid >= 2147483648
      || event?.achievement?.bAchieved !== true || !event.achievement.strID) return Promise.resolve();
    const key = `${user}:${appid}`;
    if (completed.has(key)) return Promise.resolve();
    let job = jobs.get(key);
    if (!job) {
      job = { unlocks: new Set(), revision: 0 };
      jobs.set(key, job);
    }
    job.unlocks.add(event.achievement.strID);
    job.revision++;
    if (job.promise) return job.promise;
    const current = job;
    const signal = controller.signal;
    const active = () => !signal.aborted && enabled && deps.currentUser() === user;
    current.promise = (async () => {
      let checkedRevision: number;
      do {
        checkedRevision = current.revision;
        if (!active()) return;
        if (await deps.awarded(user, appid)) { completed.add(key); return; }
        const achievements = await deps.achievements(appid);
        if (!active() || !achievements.length) continue;
        let trophy: Achievement | undefined;
        if (deps.resolve) {
          trophy = await deps.resolve(appid, achievements, current.unlocks);
        } else {
          if (!achievements.every(item => item.strID && (item.bAchieved || current.unlocks.has(item.strID)))) continue;
          let catalog: GameCatalog | undefined;
          for (let attempt = 0; attempt < 3 && active(); attempt++) {
            try { catalog = await deps.catalog(appid); break; }
            catch (error) {
              if (attempt === 2) throw error;
              await deps.wait(2000 * (attempt + 1), signal);
            }
          }
          trophy = completionPlatinum(catalog, achievements);
        }
        if (!active() || !trophy) continue;
        // Let the last ordinary achievement finish before its completion trophy.
        await deps.wait(deps.delay ?? 5500, signal);
        if (!active() || !await deps.claim(user, appid)) return;
        if (!active()) { await deps.release(user, appid); return; }
        try {
          deps.show({ ...trophy, appid });
          completed.add(key);
        } catch (error) {
          await deps.release(user, appid);
          throw error;
        }
        return;
      } while (current.revision !== checkedRevision && active());
    })().catch(deps.report).finally(() => {
      if (jobs.get(key) === current) jobs.delete(key);
    });
    return current.promise;
  };

  return { notify, setEnabled, stop() { setEnabled(false); controller.abort(); } };
}
