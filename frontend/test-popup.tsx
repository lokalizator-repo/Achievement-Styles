import { rememberNotificationApp } from './game-profiles';
import { toaster } from 'millennium';
import type { Achievement, TrophyGrade } from './card';
import { PopupCard } from './popup-card';
import { estimateDuration } from './notification-timing';
import { getNotificationStyle } from './presentation';
import { sampleAchievement } from './sample-achievement';

export { sampleAchievement } from './sample-achievement';

const activeTests = new Set<{ dismiss(): void }>();
let testSequence = 0;

export function dismissTestPopup() {
  for (const popup of activeTests) popup.dismiss();
  activeTests.clear();
}

export function showTestPopup(grade: TrophyGrade = 'bronze', achievement: Achievement = sampleAchievement, append = false) {
  if (typeof window.NotificationStore?.ProcessNotification !== 'function') {
    throw new Error('Steam notifications are not ready. Reload Steam UI and try again.');
  }

  if (!append) dismissTestPopup();
  const motionKey = `trophy-styles-test-content-${++testSequence}`;
  rememberNotificationApp(motionKey, achievement.appid);
  if (getNotificationStyle(achievement.appid) === 'xbox') achievement = { ...achievement, xboxVariant: grade === 'platinum' ? 'mythic' : achievement.xboxVariant ?? 'normal' };
  const duration = estimateDuration({ ...achievement, grade });
  const popup = toaster.toast({
    title: '',
    body: <PopupCard achievement={{ ...achievement, bAchieved: true, grade, motionKey }} />,
    className: `trophy-styles-test-toast ${motionKey} trophy-styles-grade-${grade} trophy-styles-xbox-${achievement.xboxVariant ?? 'normal'}`,
    contentClassName: motionKey,
    duration,
    expiration: duration + 1000,
    showNewIndicator: false,
    showToast: true,
    playSound: false,
    onClick: () => { popup.dismiss(); activeTests.delete(popup); },
  });
  activeTests.add(popup);
}


export function showTestQueue(achievement: Achievement = sampleAchievement) {
  dismissTestPopup();
  for (const [index, grade] of (['bronze', 'silver', 'gold'] as const).entries()) {
    showTestPopup(grade, { ...achievement, strName: `${achievement.strName} · ${index + 1}/3` }, true);
  }
}
