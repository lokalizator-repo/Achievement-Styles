import type { NotificationStyleSelection, PopupDuration } from './presentation';

export interface GameProfile {
  notificationStyle?: NotificationStyleSelection;
  popupDuration?: PopupDuration;
  soundVolume?: number;
  showProgress?: boolean;
}

export function parseProfiles(value: unknown): Record<string, GameProfile> {
  try {
    const source = typeof value === 'string' ? JSON.parse(value) : value;
    if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
    const result: Record<string, GameProfile> = {};
    for (const [id, raw] of Object.entries(source)) {
      if (!/^[1-9]\d*$/.test(id) || Number(id) >= 2147483648 || !raw || typeof raw !== 'object') continue;
      const item = raw as GameProfile;
      const profile: GameProfile = {};
      if (['ps5', 'ps4', 'xbox', 'random'].includes(item.notificationStyle ?? '')) profile.notificationStyle = item.notificationStyle;
      if (item.popupDuration === 'auto' || [5, 7, 10, 15].includes(item.popupDuration as number)) profile.popupDuration = item.popupDuration;
      if (typeof item.soundVolume === 'number' && Number.isFinite(item.soundVolume)) profile.soundVolume = Math.max(0, Math.min(200, item.soundVolume));
      if (typeof item.showProgress === 'boolean') profile.showProgress = item.showProgress;
      if (Object.keys(profile).length) result[id] = profile;
    }
    return result;
  } catch { return {}; }
}

const notificationApps = new Map<string, number>();

export function rememberNotificationApp(key: string, appid?: number) {
  if (!appid) return;
  notificationApps.set(key, appid);
  if (notificationApps.size > 512) notificationApps.delete(notificationApps.keys().next().value!);
}

export function notificationApp(key?: string) {
  if (!key) return undefined;
  return notificationApps.get(key) ?? (/^[1-9]\d*:/u.test(key) ? Number(key.split(':')[0]) : undefined);
}
