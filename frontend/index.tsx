import { startAchievementActivity, useAchievementActivity } from './achievement-activity';
import { definePlugin, Focusable, pluginConfig, subscribePluginConfig } from 'millennium';
import { useEffect, useState, type ComponentType } from 'react';
import { Settings } from './settings';
import { TrophyCard, TrophyIcon, type Achievement } from './card';
import { dismissTestPopup } from './test-popup';
import { notificationStyleFor, desktopPosition, desktopSize, displayAlone, beginNotification, prepareNotification, queueBlocked, setStyleEnabled } from './desktop-layout';
import { PopupCard } from './popup-card';
import { configureSound, playNotificationSound, setSoundVolume, stopSounds } from './sound';
import { loadDebugAchievements } from './debug-data';
import { updatePresentation, usePresentation } from './presentation';
import { clearNotificationTiming } from './notification-timing';
import { startCompletionService } from './completion-service';
import { liveTrophy, liveXbox, setLiveMatching, startLiveTrophies, warmRunningGames } from './live-trophies';
import { setOverlayMonitor, startMonitorScale } from './monitor-scale';
import { earnedPercent } from './rarity';
import { useSteamPercent } from './use-steam-percent';
import { cachedGameCatalog, loadPsnRarities, resolveCatalogTrophy } from './public-catalog';
import { popupStyle } from './popup-layout';
import { unpackSoundUri } from './packed-resource';

interface NativeToastProps {
  location: number;
  group: {
    notifications: Array<{ data: {
      name(): string;
      description?(): string;
      achieved(): boolean;
      image_url(): string;
      appid(): number;
      achievement_id(): string;
    } }>;
  };
  onActivate?: (event: unknown) => void;
  onDismiss?: () => void;
}

interface AchievementToastProps extends NativeToastProps {
  nativeToast: ComponentType<NativeToastProps>;
}

function AchievementToast({ nativeToast: NativeToast, ...nativeProps }: AchievementToastProps) {

  const [metadata, setMetadata] = useState<{ key: string; description?: string }>();
  const [psnRarity, setPsnRarity] = useState<{ key: string; percent?: number }>();
  const notifications = nativeProps.group.notifications;
  const data = notifications[notifications.length - 1]?.data;
  const { enabled, notificationStyle, subtitleMode, raritySource, showProgress } = usePresentation(data?.appid());
  const nativeDescription = typeof data?.description === 'function' ? data.description().trim() : '';
  const isToast = (nativeProps.location === 1 || nativeProps.location === 2) && typeof nativeProps.onDismiss === 'function';
  const activity = useAchievementActivity(enabled && isToast && data?.achieved() && showProgress ? data.appid() : undefined);
  const key = data ? `${data.appid()}:${data.achievement_id()}` : '';
  const currentNotification = notifications[notifications.length - 1];
  const style = nativeProps.location === 2 ? popupStyle(key, notificationStyle)
    : enabled && isToast && data?.achieved() && currentNotification ? notificationStyleFor(currentNotification) : notificationStyle;
  const psnPercent = psnRarity?.key === key ? psnRarity.percent : data
    ? resolveCatalogTrophy(cachedGameCatalog(data.appid()), data.achievement_id())?.psnPercent : undefined;
  const steamPercent = useSteamPercent(data?.appid(), data?.achievement_id(),
    enabled === true && style === 'ps5' && isToast && data?.achieved() === true && raritySource !== 'off'
      && (raritySource === 'steam' || earnedPercent(psnPercent) === undefined));
  useEffect(() => {
    let current = true;
    if (isToast && enabled === true && data?.achieved() && !nativeDescription && (style === 'xbox' || subtitleMode === 'description')) {
      void loadDebugAchievements(data.appid()).then(items => {
        const item = items.find(item => item.strID === data.achievement_id());
        if (current) setMetadata({ key, description: item?.description });
      }).catch(() => {});
    }
    return () => { current = false; };
  }, [key, enabled, style, subtitleMode, data, isToast, nativeDescription]);
  useEffect(() => {
    let current = true;
    if (style === 'ps5' && isToast && enabled === true && data?.achieved() && raritySource === 'psn') {
      void loadPsnRarities(data.appid()).then(catalog => {
        if (current) setPsnRarity({ key, percent: resolveCatalogTrophy(catalog, data.achievement_id())?.psnPercent });
      }).catch(() => {});
    }
    return () => { current = false; };
  }, [key, enabled, style, data, isToast, raritySource]);
  if (enabled !== true || !isToast || !data?.achieved()) return <NativeToast {...nativeProps} />;
  const achievement: Achievement = {
    appid: data.appid(), gameProgress: activity.progress[data.appid()],
    description: nativeDescription || (metadata?.key === key ? metadata.description : undefined),
    strName: data.name(), strImage: data.image_url(), bAchieved: true,
    ...(style === 'xbox' ? liveXbox(data) : liveTrophy(data)),
    motionKey: `${data.appid()}:${data.achievement_id()}`,
    steamPercent,
    psnPercent,
  };
  const activate = (event: unknown) => {
    if (nativeProps.onActivate) nativeProps.onActivate(event);
    else window.SteamClient?.WebChat?.OpenURLInClient(`steam://url/SteamIDAchievementsPage/${data.appid()}`, 0, false);
    nativeProps.onDismiss?.();
  };

  return (
    <Focusable
      style={{ width: '100%', minWidth: 0 }}
      onActivate={activate}
      onMouseDown={event => { if (event.button === 1) nativeProps.onDismiss?.(); }}
    >
      {nativeProps.location === 2 ? <PopupCard achievement={achievement} /> : <TrophyCard achievement={achievement} notificationStyle={style} />}
    </Focusable>
  );
}

/** @ffi */
export const notification = { AchievementToast, desktopSize, desktopPosition, displayAlone, beginNotification, prepareNotification, queueBlocked, playNotificationSound, setOverlayMonitor };

export default definePlugin(async () => {
  const stopActivity = startAchievementActivity({
    read: key => pluginConfig.get(key), write: (key, value) => pluginConfig.set(key, value),
    metadata(appid, achievementId) {
      const data = { appid: () => appid, achievement_id: () => achievementId, achieved: () => true };
      return { ...liveTrophy(data), ...liveXbox(data) };
    },
  });
  const stopMonitorScale = startMonitorScale();
  const presentationChanges = new Set<string>();
  let receivedChange = false;
  let receivedCompletionChange = false;
  let receivedVolumeChange = false;
  let styleActive = false;
  let completionActive = false;
  const completion = startCompletionService();
  const updateStyle = (value: boolean) => { styleActive = value; setStyleEnabled(value); completion.setEnabled(styleActive && completionActive); };
  const updateCompletion = (value: boolean) => { completionActive = value; completion.setEnabled(styleActive && completionActive); };
  const unsubscribe = subscribePluginConfig((key, value) => {
    if (key === 'soundVolume') {
      receivedVolumeChange = true;
      setSoundVolume(value);
      return;
    }
    if (key === 'matchPlayStation') setLiveMatching(value !== false);
    if (key === 'gameProfiles' || key === 'showProgress' || key === 'language' || key === 'subtitleMode' || key === 'matchPlayStation' || key === 'raritySource' || key === 'popupCorner' || key === 'popupDuration' || key === 'notificationStyle' || key === 'xboxColor') {
      presentationChanges.add(key);
      updatePresentation(key, value);
      if (key === 'notificationStyle' || key === 'gameProfiles') {
        completion.setEnabled(styleActive && completionActive);
        warmRunningGames();
      }
      return;
    }
    if (key === 'completionPlatinum') {
      receivedCompletionChange = true;
      updateCompletion(value === true);
      return;
    }
    if (key !== 'enabled') return;
    receivedChange = true;
    updateStyle(value === true);
  });
  try {
    for (const key of ['gameProfiles', 'showProgress', 'language', 'subtitleMode', 'matchPlayStation', 'raritySource', 'popupCorner', 'popupDuration', 'notificationStyle', 'xboxColor']) {
      const value = await pluginConfig.get<unknown>(key);
      if (!presentationChanges.has(key)) {
        updatePresentation(key, value);
        if (key === 'matchPlayStation') setLiveMatching(value !== false);
      }
    }
    const steamLanguage = await window.SteamClient?.Settings?.GetCurrentLanguage?.().catch(() => '');
    updatePresentation('steamLanguage', steamLanguage);
    const enabled = await pluginConfig.get<boolean>('enabled');
    if (!receivedChange) updateStyle(enabled === true);
    const completionValue = await pluginConfig.get<boolean>('completionPlatinum');
    if (!receivedCompletionChange) updateCompletion(completionValue === true);
  } catch (error) {
    console.warn('Could not load achievement style settings', error);
  }
  try {
    const savedVolume = await pluginConfig.get<unknown>('soundVolume');
    if (!receivedVolumeChange) setSoundVolume(savedVolume);
    configureSound(await unpackSoundUri(await backend.getTrophySoundUri()));
    configureSound(await unpackSoundUri(await backend.getPlatinumSoundUri()), 'platinum');
  } catch (error) {
    console.warn('Could not load trophy sound', error);
  }
  try {
    configureSound(await unpackSoundUri(await backend.getPs4TrophySoundUri()), 'ps4');
  } catch (error) {
    console.warn('Could not load PS4 trophy sound', error);
  }
  for (const variant of ['normal', 'rare', 'mythic'] as const) {
    try { configureSound(await unpackSoundUri(await backend.getXboxSoundUri(variant)), `xbox-${variant}`); }
    catch (error) { console.warn(`Could not load Xbox ${variant} sound`, error); }
  }
  const stopLiveTrophies = startLiveTrophies();
  return {
    title: 'Achievement Styles', icon: <TrophyIcon />, content: <Settings onStyleChange={updateStyle} onCompletionChange={updateCompletion} />,
    onDismount() {
      unsubscribe();
      stopActivity();
      completion.stop();
      stopLiveTrophies();
      stopMonitorScale();
      setStyleEnabled(false);
      dismissTestPopup();
      stopSounds();
      clearNotificationTiming();
    },
  };
});
