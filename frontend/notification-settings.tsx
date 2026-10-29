import { DialogButton, Dropdown, Field, SliderField, ToggleField, usePluginConfig } from 'millennium';
import { useState } from 'react';
import type { Achievement } from './card';
import { CardPreview } from './card-preview';
import { updatePresentation, usePresentation, type Language, type NotificationStyleSelection, type PopupCorner, type PopupDuration, type SubtitleMode } from './presentation';
import type { RaritySource } from './rarity';
import { setLiveMatching } from './live-trophies';
import { setSoundVolume, testSound } from './sound';
import { XboxColorPicker } from './xbox-color-picker';

export function useNotificationPreferences() {
  const [matchPlayStation, setMatchPlayStation] = usePluginConfig<boolean>('matchPlayStation');
  const [language, setLanguage] = usePluginConfig<Language>('language');
  const [subtitleMode, setSubtitleMode] = usePluginConfig<SubtitleMode>('subtitleMode');
  const [raritySource, setRaritySource] = usePluginConfig<RaritySource>('raritySource');
  const [popupCorner, setPopupCorner] = usePluginConfig<PopupCorner>('popupCorner');
  const [popupDuration, setPopupDuration] = usePluginConfig<PopupDuration>('popupDuration');
  const [showProgress, setShowProgress] = usePluginConfig<boolean>('showProgress');
  const [enabled, setEnabled] = usePluginConfig<boolean>('enabled');
  const [notificationStyle, setNotificationStyle] = usePluginConfig<NotificationStyleSelection>('notificationStyle');
  const [completionEnabled, setCompletionEnabled] = usePluginConfig<boolean>('completionPlatinum');
  const [soundVolume, saveSoundVolume] = usePluginConfig<number>('soundVolume');
  const [, saveXboxColor] = usePluginConfig<string>('xboxColor');
  const [soundStatus, setSoundStatus] = useState('');
  return {
    matchPlayStation, setMatchPlayStation, language, setLanguage,
    subtitleMode, setSubtitleMode, raritySource, setRaritySource,
    popupCorner, setPopupCorner, popupDuration, setPopupDuration,
    showProgress, setShowProgress, enabled, setEnabled,
    notificationStyle, setNotificationStyle, completionEnabled, setCompletionEnabled,
    soundVolume, saveSoundVolume, saveXboxColor, soundStatus,
    setSoundStatus,
  };
}

interface NotificationSettingsProps {
  preferences: ReturnType<typeof useNotificationPreferences>;
  achievement: Achievement;
  settingsPreview: Achievement;
  onStyleChange(value: boolean): void;
  onCompletionChange(value: boolean): void;
}

export function NotificationSettings({
  preferences, achievement, settingsPreview, onStyleChange, onCompletionChange,
}: NotificationSettingsProps) {
  const { notificationStyle: activeStyle, styleSelection, xboxColor, t } = usePresentation();
  const {
    matchPlayStation, setMatchPlayStation, language, setLanguage,
    subtitleMode, setSubtitleMode, raritySource, setRaritySource,
    popupCorner, setPopupCorner, popupDuration, setPopupDuration,
    showProgress, setShowProgress, enabled, setEnabled,
    notificationStyle, setNotificationStyle, completionEnabled, setCompletionEnabled,
    soundVolume, saveSoundVolume, saveXboxColor, soundStatus,
    setSoundStatus,
  } = preferences;
  return <>
    <ToggleField label={t('Achievement notification styles')} checked={enabled === true}
      onChange={value => { onStyleChange(value); void setEnabled(value); }} />
    <>
      <Field label={t('Appearance')} />
      <Field label={t('Notification style')} childrenLayout="below"><Dropdown
        selectedOption={notificationStyle === 'ps4' || notificationStyle === 'xbox' || notificationStyle === 'random' ? notificationStyle : 'ps5'}
        rgOptions={[{ data: 'ps5', label: 'PS5' }, { data: 'ps4', label: 'PS4' }, { data: 'xbox', label: 'Xbox Series X|S' }, { data: 'random', label: t('Random (PS5 / PS4 / Xbox)') }]}
        onChange={option => { updatePresentation('notificationStyle', option.data); void setNotificationStyle(option.data); }} /></Field>
      {styleSelection === 'random' && <Field description={t('Each notification randomly uses PS5, PS4 or Xbox, with matching sound and position. Consecutive styles may repeat. Preview shows PS5.')} />}
      <div data-trophy-settings-preview style={{ padding: '4px 12px 16px', minWidth: 0 }}><CardPreview achievement={settingsPreview} /></div>
      {(activeStyle === 'xbox' || styleSelection === 'random') && <>
        <Field label={t('Xbox achievement color')} />
        <XboxColorPicker value={xboxColor} onChange={color => { updatePresentation('xboxColor', color); void saveXboxColor(color); }} />
      </>}
      {activeStyle === 'xbox' ? <Field description={t('Xbox notifications appear at the bottom center. Rare achievements use Xbox rarity; unmatched achievements use the standard notification.')} /> : activeStyle === 'ps4' ? <Field description={t('PS4 uses the original two-line layout and slides from the top-left screen edge. Size follows the monitor resolution.')} /> : <Field label={t('Popup position')} childrenLayout="below"><Dropdown
        selectedOption={['top-left', 'bottom-right', 'bottom-left'].includes(popupCorner ?? '') ? popupCorner : 'top-right'}
        rgOptions={[
          { data: 'top-right', label: t('Top right') }, { data: 'top-left', label: t('Top left') },
          { data: 'bottom-right', label: t('Bottom right') }, { data: 'bottom-left', label: t('Bottom left') },
        ]} onChange={option => { updatePresentation('popupCorner', option.data); void setPopupCorner(option.data); }} /></Field>}
      <Field label={t('Content and timing')} />
      <ToggleField label={t('Game progress in notifications')} description={t('Show the number of earned achievements and completion percentage on notifications.')}
        checked={showProgress === true} onChange={value => { updatePresentation('showProgress', value); void setShowProgress(value); }} />
      <Field label={t('Popup duration')} childrenLayout="below"><Dropdown
        selectedOption={[5, 7, 10, 15].includes(popupDuration as number) ? popupDuration : 'auto'}
        rgOptions={[
          { data: 'auto', label: t('Automatic (reading time)') },
          ...([5, 7, 10, 15] as const).map(seconds => ({ data: seconds, label: t('{seconds} seconds', { seconds }) })),
        ]} onChange={option => { updatePresentation('popupDuration', option.data); void setPopupDuration(option.data); }} /></Field>
      {activeStyle !== 'xbox' && <Field label={t('Popup second line')} childrenLayout="below"><Dropdown selectedOption={subtitleMode ?? 'description'} rgOptions={[
        { data: 'description', label: t('Achievement description') }, { data: 'earned', label: t('Trophy earned!') },
      ]} onChange={option => { updatePresentation('subtitleMode', option.data); void setSubtitleMode(option.data); }} /></Field>}
      {activeStyle === 'ps5' && <Field label={t('Achievement percentage')} childrenLayout="below"><Dropdown
        selectedOption={raritySource === 'off' ? 'off' : raritySource === 'psn' ? 'psn' : 'steam'}
        rgOptions={[
          { data: 'steam', label: 'Steam' }, { data: 'psn', label: 'PSN' }, { data: 'off', label: t('Do not show') },
        ]} onChange={option => { updatePresentation('raritySource', option.data); void setRaritySource(option.data); }} /></Field>}
    </>
    <>
      <Field label={t('Notification sound')} />
      <SliderField label={t('Notification volume')}
        value={typeof soundVolume === 'number' && Number.isFinite(soundVolume) ? Math.max(0, Math.min(200, soundVolume)) : 100}
        min={0} max={200} step={1} resetValue={100} showValue valueSuffix="%"
        onChange={value => { setSoundVolume(value); void saveSoundVolume(value); }} />
      <div style={{ padding: '0 12px 12px' }}>
        <DialogButton style={{ width: '100%' }} onClick={() => {
          void testSound(activeStyle === 'xbox' ? achievement.xboxVariant : achievement.grade, activeStyle).then(() => setSoundStatus(activeStyle === 'xbox' ? 'Playing Xbox achievement sound.' : activeStyle === 'ps4'
            ? 'Playing PS4 trophy sound.' : achievement.grade === 'platinum'
            ? 'Playing PS5 platinum sound.' : 'Playing PS5 trophy sound.')).catch(error => {
            setSoundStatus(error instanceof Error ? error.message : 'Could not play trophy sound.');
          });
        }}>{t('Test sound')}</DialogButton>
        {soundStatus && <Field description={t(soundStatus)} />}
      </div>
    </>
    <>
      <Field label={t('Trophies and completion')} />
      {activeStyle !== 'xbox' && <ToggleField label={t('Match PlayStation trophies in games')}
        description={t('Use the original trophy grade when matched. Unmatched achievements keep Steam artwork without a trophy grade. Catalogs load in the background.')}
        checked={matchPlayStation !== false} onChange={value => {
          setLiveMatching(value); updatePresentation('matchPlayStation', value); void setMatchPlayStation(value);
        }} />}
      <ToggleField label={t(activeStyle === 'xbox' ? 'Completion Mythic' : 'Completion platinum')}
        description={t(activeStyle === 'xbox' ? 'Show Mythic after the matched base game set, or all Steam achievements when the base set cannot be matched. Does not create a Steam achievement.' : 'Show an extra plugin platinum after all Steam achievements are earned, when PS5 has a platinum missing from Steam. Does not create a Steam achievement.')}
        checked={completionEnabled === true} onChange={value => { onCompletionChange(value); void setCompletionEnabled(value); }} />
      <Field label={t('Interface')} />
      <Field label={t('Language')} childrenLayout="below"><Dropdown selectedOption={language ?? 'auto'} rgOptions={[
        { data: 'auto', label: t('Automatic (Steam)') }, { data: 'en', label: 'English' },
        { data: 'ru', label: 'Русский' }, { data: 'uk', label: 'Українська' },
      ]} onChange={option => { updatePresentation('language', option.data); void setLanguage(option.data); }} /></Field>
    </>
  </>;

}
