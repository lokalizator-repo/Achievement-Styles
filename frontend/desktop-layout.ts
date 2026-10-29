import { notificationApp, rememberNotificationApp } from './game-profiles';
import { notificationKey, syncPopupMotion } from './motion';
import { trackNotification } from './notification-timing';
import { chooseNotificationStyle, getPopupCorner, getPopupDuration, updatePresentation, type NotificationStyle } from './presentation';
import { overlayScale, ps4Scale, rememberPopupScale, popupScale, type ToastMonitor } from './monitor-scale';
import { popupLayouts, rememberPopupStyle } from './popup-layout';
import { liveXbox, warmGameTrophies } from './live-trophies';

interface NotificationData {
  className?: string;
  contentClassName?: string;
  achieved?: () => boolean;
  appid?: () => number;
  achievement_id?: () => string;
}

export interface SteamNotification {
  data?: NotificationData;
  nToastDurationMS?: number;
  notificationID?: number | string;
  nNotificationID?: number | string;
}

interface PopupRecord {
  toast: { m_notification: SteamNotification; m_nToastHeight: number; m_eState?: number };
  flPercentDone: number;
}

let styleEnabled = false;
const notificationStyles = new WeakMap<SteamNotification, NotificationStyle>();
const contexts = new WeakMap<SteamNotification, number>();

export function setStyleEnabled(enabled: boolean) {
  styleEnabled = enabled;
  updatePresentation('enabled', enabled);
}

export function isPs5Notification(notification: SteamNotification) {
  const data = notification?.data;
  const isTest = ['trophy-styles-test-toast', 'trophy-styles-completion-toast'].includes(data?.className?.split(' ')[0] ?? '');
  const isEarned = styleEnabled && typeof data?.achieved === 'function' && data.achieved();
  return isTest || isEarned;
}

export function notificationStyleFor(notification: SteamNotification) {
  let style = notificationStyles.get(notification);
  if (!style) {
    const key = notificationKey(notification);
    const appid = notification.data?.appid?.() ?? notificationApp(key);
    if (key) rememberNotificationApp(key, appid);
    style = chooseNotificationStyle(appid);
    notificationStyles.set(notification, style);
    rememberPopupStyle(notificationKey(notification), style);
  }
  return style;
}

export function desktopSize(notification: SteamNotification, appid?: number) {
  if (!isPs5Notification(notification)) return undefined;
  if (appid !== undefined) contexts.set(notification, appid);
  const style = notificationStyleFor(notification);
  const popupSize = popupLayouts[style];
  const scale = style === 'ps4' || style === 'xbox' ? ps4Scale(contexts.get(notification) ?? 0) : overlayScale(contexts.get(notification) ?? 0);
  rememberPopupScale(notificationKey(notification), scale);
  rememberPopupStyle(notificationKey(notification), style);
  trackNotification(notification);
  return { width: Math.ceil(popupSize.width * scale), height: Math.ceil(popupSize.height * scale) };
}

export function displayAlone(notification: SteamNotification) {
  if (!isPs5Notification(notification)) return undefined;
  return true;
}

export function beginNotification(notification: SteamNotification) {
  if (!isPs5Notification(notification)) return;
  if (notificationStyleFor(notification) === 'xbox') {
    const classes = notification.data?.className?.split(' ') ?? [];
    const variant = classes.includes('trophy-styles-xbox-mythic') || classes.includes('trophy-styles-grade-platinum') ? 'mythic' : classes.includes('trophy-styles-xbox-rare') ? 'rare'
      : classes[0] === 'trophy-styles-test-toast' ? 'normal' : notification.data ? liveXbox(notification.data).xboxVariant : 'normal';
    notification.nToastDurationMS = Math.max(variant === 'mythic' ? 10800 : variant === 'rare' ? 9000 : 8400, getPopupDuration(false, notification.data?.appid?.() ?? notificationApp(notificationKey(notification))) ?? 0);
  }
  if (notificationStyleFor(notification) === 'ps4') {
    notification.nToastDurationMS = getPopupDuration(false, notification.data?.appid?.() ?? notificationApp(notificationKey(notification))) ?? Math.max(5500, notification.nToastDurationMS ?? 0);
  }
  trackNotification(notification);
}

export function desktopPosition(notification: SteamNotification, monitor: ToastMonitor, _progress: number, records: PopupRecord[]) {
  const size = desktopSize(notification);
  if (!size) return undefined;
  const scale = popupScale(notificationKey(notification));
  syncPopupMotion(notification, records.find(record => record.toast.m_notification === notification)?.toast.m_eState);
  if (notificationStyles.get(notification) === 'ps4') {
    const area = monitor.m_full ?? monitor.m_usable;
    return {
      left: Math.round(area.m_nLeft ?? monitor.m_usable.m_nLeft),
      top: Math.round((area.m_nTop ?? monitor.m_usable.m_nTop) + area.m_nHeight * 134 / 1080),
    };
  }
  let offset = 0;
  for (const record of records) {
    if (record.toast.m_notification === notification) break;
    if (desktopSize(record.toast.m_notification)) offset += record.toast.m_nToastHeight + 8 * scale;
  }
  const area = monitor.m_usable;
  if (notificationStyles.get(notification) === 'xbox') return {
    left: Math.round(area.m_nLeft + (area.m_nWidth - size.width) / 2),
    top: Math.round(area.m_nTop + area.m_nHeight - size.height - 24 * scale),
  };
  const corner = getPopupCorner();
  return {
    left: Math.round(area.m_nLeft + (corner.endsWith('left') ? 24 * scale : area.m_nWidth - size.width - 24 * scale)),
    top: Math.round(area.m_nTop + (corner.startsWith('bottom') ? area.m_nHeight - size.height - 24 * scale - offset : 24 * scale + offset)),
  };
}


export function prepareNotification(notification: SteamNotification) {
  if (styleEnabled && notification.data?.achieved?.()) {
    const appid = notification.data.appid?.();
    if (appid !== undefined) void warmGameTrophies(appid);
  }
  if (isPs5Notification(notification) && notification.notificationID === undefined && notification.nNotificationID !== undefined) {
    notification.notificationID = notification.nNotificationID;
  }
}


export function queueBlocked(active: SteamNotification[]) {
  return active.some(isPs5Notification);
}
