import { rememberNotificationApp } from './game-profiles';
import { toaster } from 'millennium';
import { createCompletionMonitor, type UnlockEvent } from './completion';
import type { Achievement } from './card';
import { loadGameCatalog, loadPsnRarities } from './public-catalog';
import { getNotificationStyle, getRaritySource, translate } from './presentation';
import { loadXboxCatalog, xboxCompletion } from './xbox-catalog';
import { estimateDuration } from './notification-timing';
import { PopupCard } from './popup-card';
import { warmGameTrophies } from './live-trophies';

let sequence = 0;
const popups = new Set<{ dismiss(): void }>();

function showCompletion(achievement: Achievement) {
  if (typeof window.NotificationStore?.ProcessNotification !== 'function') throw new Error('Steam notifications are not ready.');
  const motionKey = `trophy-styles-completion-${++sequence}`;
  rememberNotificationApp(motionKey, achievement.appid);
  const duration = estimateDuration({ ...achievement, grade: 'platinum' });
  const popup = toaster.toast({
    title: '', body: <PopupCard achievement={{ ...achievement, grade: 'platinum', motionKey }} />,
    className: `trophy-styles-completion-toast ${motionKey} trophy-styles-grade-platinum trophy-styles-xbox-${achievement.xboxVariant ?? 'normal'}`, contentClassName: motionKey,
    duration, expiration: duration + 1000, showToast: true, showNewIndicator: false, playSound: false,
    onClick: () => popup.dismiss(),
  });
  popups.add(popup);
  window.setTimeout(() => popups.delete(popup), duration + 3000);
}

export function startCompletionService() {
  const dependencies = {
    currentUser: () => window.App?.m_CurrentUser?.strSteamID,
    async achievements(appid: number) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const response = await Promise.race([
          window.SteamClient.Apps.GetMyAchievementsForApp(String(appid)),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Steam completion check timed out.')), 12000); }),
        ]);
        if (response.result !== 1 || !Array.isArray(response.data?.rgAchievements)) throw new Error('Steam could not confirm completion.');
        return response.data.rgAchievements.map(item => ({ ...item, description: item.strDescription ?? '' }));
      } finally { clearTimeout(timer); }
    },
    catalog: (appid: number) => getRaritySource() === 'psn' ? loadPsnRarities(appid) : loadGameCatalog(appid),
    awarded: (user: string, appid: number) => backend.hasCompletionPlatinum(user, appid),
    claim: (user: string, appid: number) => backend.claimCompletionPlatinum(user, appid),
    release: (user: string, appid: number) => backend.releaseCompletionPlatinum(user, appid),
    show: showCompletion,
    wait: (milliseconds: number, signal: AbortSignal) => new Promise<void>(resolve => {
      const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
      const timer = setTimeout(done, milliseconds);
      signal.addEventListener('abort', done, { once: true });
      if (signal.aborted) done();
    }),
    report: (error: unknown) => console.warn('Could not award completion trophy', error),
  };
  const monitor = createCompletionMonitor(dependencies);
  const xbox = createCompletionMonitor({
    ...dependencies,
    awarded: (user, appid) => backend.hasCompletionMythic(user, appid),
    claim: (user, appid) => backend.claimCompletionMythic(user, appid),
    release: (user, appid) => backend.releaseCompletionMythic(user, appid),
    async resolve(appid, achievements, unlocks) {
      const catalog = await loadXboxCatalog(appid).catch(() => undefined);
      const result = xboxCompletion(catalog, achievements, unlocks);
      if (result && !result.strName) result.strName = window.appStore?.GetAppOverviewByAppID?.(appid)?.display_name ?? translate('Game complete');
      return result;
    },
    delay: 10000,
  });
  const callback = (event: unknown) => {
    void warmGameTrophies((event as UnlockEvent).unAppID);
    if (getNotificationStyle((event as UnlockEvent).unAppID) === 'xbox') void xbox.notify(event as UnlockEvent);
    else void monitor.notify(event as UnlockEvent);
  };
  const listener = window.SteamClient?.GameSessions?.RegisterForAchievementNotification?.(callback);
  return {
    setEnabled(value: boolean) {
      monitor.setEnabled(value);
      xbox.setEnabled(value);
    },
    stop() {
      listener?.unregister();
      monitor.stop();
      xbox.stop();
      for (const popup of popups) popup.dismiss();
      popups.clear();
    },
  };
}
