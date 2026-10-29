import { popupStyle } from './popup-layout';
import { notificationApp } from './game-profiles';
import { notificationKey } from './motion';
import type { Achievement } from './card';
import { achievementSubtitle, getNotificationStyle, getPopupDuration } from './presentation';

export const scrollSpeed = 60;
export const scrollDelay = 900;
export const maximumPopupDuration = 15000;
const readingPause = 1800;

interface TimedNotification {
  data?: { className?: string; contentClassName?: string; appid?: () => number; achievement_id?: () => string };
  nToastDurationMS?: number;
}

const tracked = new Map<string, Map<TimedNotification, { start: number; revision?: string }>>();
const measurements = new Map<string, { duration: number; revision: string; platinum: boolean }>();

export function readingDuration(textWidth: number, availableWidth: number, platinum = false, appid?: number) {
  const manual = getPopupDuration(platinum, appid);
  if (manual !== undefined) return manual;
  const minimum = platinum ? 7000 : 5000;
  if (!Number.isFinite(textWidth) || !Number.isFinite(availableWidth) || availableWidth <= 0 || textWidth <= availableWidth + 1) return minimum;
  return Math.min(maximumPopupDuration, Math.max(minimum, Math.ceil(scrollDelay + (textWidth - availableWidth) / scrollSpeed * 1000 + readingPause)));
}

export function estimateDuration(achievement: Achievement) {
  if (getNotificationStyle(achievement.appid) === 'xbox') return Math.max(achievement.xboxVariant === 'mythic' ? 10800 : achievement.xboxVariant === 'rare' ? 9000 : 8400, getPopupDuration(false, achievement.appid) ?? 0);
  if (getNotificationStyle(achievement.appid) === 'ps4') return getPopupDuration(false, achievement.appid) ?? 5500;
  const text = achievementSubtitle(achievement.description);
  const canvas = typeof document === 'undefined' ? undefined : document.createElement('canvas');
  const context = canvas?.getContext('2d');
  if (context) context.font = '300 24px "Segoe UI", Arial, sans-serif';
  return readingDuration(context?.measureText(text).width ?? 0, 450, achievement.grade === 'platinum', achievement.appid);
}

function applyDuration(key: string) {
  const measurement = measurements.get(key);
  const manual = getPopupDuration(false, notificationApp(key));
  if (!measurement && manual === undefined) return;
  for (const [notification, state] of tracked.get(key) ?? []) {
    if (manual !== undefined) {
      const duration = getPopupDuration(measurement?.platinum, notificationApp(key)) ?? manual;
      notification.nToastDurationMS = popupStyle(key) === 'xbox' ? Math.max(duration, notification.nToastDurationMS ?? 0) : duration;
      state.revision = undefined;
      continue;
    }
    if (!measurement || state.revision === measurement.revision) continue;
    notification.nToastDurationMS = Math.min(maximumPopupDuration, measurement.duration + Math.max(0, performance.now() - state.start));
    state.revision = measurement.revision;
  }
}

export function trackNotification(notification: TimedNotification) {
  const key = notificationKey(notification);
  if (!key) return;
  let entries = tracked.get(key);
  if (!entries) tracked.set(key, entries = new Map());
  if (!entries.has(notification)) entries.set(notification, { start: performance.now() });
  applyDuration(key);
  if (tracked.size > 256) forgetTiming(tracked.keys().next().value!);
}

export function reportDuration(key: string | undefined, text: string, textWidth: number, availableWidth: number, platinum: boolean) {
  if (!key || availableWidth <= 0) return;
  const duration = readingDuration(textWidth, availableWidth, platinum, notificationApp(key));
  measurements.set(key, { duration, revision: `${duration}:${text}`, platinum });
  applyDuration(key);
  if (measurements.size > 256) forgetTiming(measurements.keys().next().value!);
}

export function forgetTiming(key: string) {
  tracked.delete(key);
  measurements.delete(key);
}

export function clearNotificationTiming() {
  tracked.clear();
  measurements.clear();
}


export function subtitleScrollSpeed(textWidth: number, availableWidth: number) {
  return Math.max(scrollSpeed, Math.max(0, textWidth - availableWidth) / (((getPopupDuration() ?? maximumPopupDuration) - scrollDelay - readingPause) / 1000));
}
