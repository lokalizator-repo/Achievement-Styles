import { getNotificationStyle, type NotificationStyle } from './presentation';

export const popupLayouts = {
  ps5: { width: 680, height: 136, cardWidth: 656, cardHeight: 112, padding: 12 },
  ps4: { width: 554, height: 100, cardWidth: 554, cardHeight: 100, padding: 0 },
  xbox: { width: 672, height: 294, cardWidth: 672, cardHeight: 294, padding: 0 },
} as const;

const popupStyles = new Map<string, NotificationStyle>();

export function rememberPopupStyle(key: string | undefined, style: NotificationStyle) {
  if (!key) return;
  popupStyles.set(key, style);
  if (popupStyles.size > 256) popupStyles.delete(popupStyles.keys().next().value!);
}

export function popupStyle(key: string | undefined, fallback = getNotificationStyle()) {
  return (key && popupStyles.get(key)) || fallback;
}
