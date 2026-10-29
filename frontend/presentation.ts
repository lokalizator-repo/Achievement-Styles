import { useSyncExternalStore } from 'react';
import ru from './locales/ru.json';
import uk from './locales/uk.json';
import { parseProfiles, type GameProfile } from './game-profiles';
import type { RaritySource } from './rarity';
import { defaultXboxColor, normalizeXboxColor } from './xbox-colors';

export type Language = 'auto' | 'en' | 'ru' | 'uk';
export type SubtitleMode = 'description' | 'earned';
export type PopupCorner = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
export type PopupDuration = 'auto' | 5 | 7 | 10 | 15;
export type NotificationStyle = 'ps5' | 'ps4' | 'xbox';
export type NotificationStyleSelection = NotificationStyle | 'random';
const dictionaries: Record<string, Record<string, string>> = { ru, uk };
const listeners = new Set<() => void>();
let profiles: Record<string, GameProfile> = {};
let settings = { showProgress: false, notificationStyle: 'ps5' as NotificationStyleSelection, xboxColor: defaultXboxColor, popupCorner: 'top-right' as PopupCorner, popupDuration: 'auto' as PopupDuration, language: 'auto' as Language, subtitleMode: 'description' as SubtitleMode, raritySource: 'steam' as RaritySource, steamLanguage: '', enabled: false, matchPlayStation: true };

export function getGameProfile(appid?: number) {
  return profiles[String(appid)] ?? {};
}

export function getGamePresentation(appid?: number) {
  return { ...settings, ...getGameProfile(appid) };
}

export function getPopupCorner() {
  return settings.popupCorner;
}

export function getNotificationStyle(appid?: number) {
  const settings = getGamePresentation(appid);
  return settings.notificationStyle === 'random' ? 'ps5' : settings.notificationStyle;
}

export function getNotificationStyleSelection(appid?: number) {
  return getGamePresentation(appid).notificationStyle;
}

export function chooseNotificationStyle(appid?: number): NotificationStyle {
  const settings = getGamePresentation(appid);
  return settings.notificationStyle === 'random'
    ? (['ps5', 'ps4', 'xbox'] as const)[Math.floor(Math.random() * 3)]
    : settings.notificationStyle;
}

export function getPopupDuration(platinum = false, appid?: number) {
  const settings = getGamePresentation(appid);
  return settings.popupDuration === 'auto' ? undefined : Math.max(platinum ? 7000 : 5000, settings.popupDuration * 1000);
}

export function getRaritySource() {
  return settings.raritySource;
}

export function resolveLanguage(value: string): Exclude<Language, 'auto'> {
  const name = value.toLowerCase().replace('_', '-');
  if (name === 'russian' || /^ru(?:-|$)/.test(name)) return 'ru';
  if (name === 'ukrainian' || /^uk(?:-|$)/.test(name)) return 'uk';
  return 'en';
}

function currentLanguage() {
  return settings.language === 'auto' ? resolveLanguage(settings.steamLanguage
    || (typeof document !== 'undefined' ? document.documentElement.lang : '')
    || (typeof navigator !== 'undefined' ? navigator.language : 'en')) : settings.language;
}

export function translate(text: string, values: Record<string, string | number> = {}, language = currentLanguage()) {
  return (dictionaries[language]?.[text] ?? text).replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));
}

export function updatePresentation(key: string, value: unknown) {
  if (key === 'gameProfiles') { profiles = parseProfiles(value); settings = { ...settings }; }
  else if (key === 'showProgress' && typeof value === 'boolean') settings = { ...settings, showProgress: value };
  else if (key === 'enabled' && typeof value === 'boolean') settings = { ...settings, enabled: value };
  else if (key === 'matchPlayStation' && typeof value === 'boolean') settings = { ...settings, matchPlayStation: value };
  else if (key === 'notificationStyle' && (value === 'ps5' || value === 'ps4' || value === 'xbox' || value === 'random')) settings = { ...settings, notificationStyle: value };
  else if (key === 'xboxColor') settings = { ...settings, xboxColor: normalizeXboxColor(value) };
  else if (key === 'language' && ['auto', 'en', 'ru', 'uk'].includes(String(value))) settings = { ...settings, language: value as Language };
  else if (key === 'subtitleMode' && (value === 'description' || value === 'earned')) settings = { ...settings, subtitleMode: value };
  else if (key === 'raritySource' && (value === 'steam' || value === 'psn' || value === 'off')) settings = { ...settings, raritySource: value };
  else if (key === 'popupCorner' && ['top-right', 'top-left', 'bottom-right', 'bottom-left'].includes(String(value))) settings = { ...settings, popupCorner: value as PopupCorner };
  else if (key === 'popupDuration' && (value === 'auto' || [5, 7, 10, 15].includes(value as number))) settings = { ...settings, popupDuration: value as PopupDuration };
  else if (key === 'steamLanguage' && typeof value === 'string') settings = { ...settings, steamLanguage: value };
  else return;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function usePresentation(appid?: number) {
  useSyncExternalStore(subscribe, () => settings, () => settings);
  const value = getGamePresentation(appid);
  return { ...value, styleSelection: value.notificationStyle, notificationStyle: getNotificationStyle(appid), locale: currentLanguage(), t: translate };
}

export function achievementSubtitle(description: string | undefined, mode: SubtitleMode = settings.subtitleMode) {
  return mode === 'description' && description?.trim() ? description.trim() : translate('Trophy earned!');
}
