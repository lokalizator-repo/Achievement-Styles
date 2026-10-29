import { AchievementPreview, useXboxPreview } from './achievement-preview';
import { NotificationSettings, useNotificationPreferences } from './notification-settings';
import { AchievementHistory, GameSettings } from './game-settings';
import { Dropdown } from 'millennium';
import { useEffect, useState } from 'react';
import { useAchievementPicker } from './achievement-picker';
import type { Achievement, TrophyGrade } from './card';
import { usePreviewAchievement } from './card-preview';
import { usePresentation } from './presentation';
import { sampleAchievement, showTestPopup } from './test-popup';
import { xboxMetadata } from './xbox-catalog';
import { useAchievementActivity } from './achievement-activity';

export function Settings({ onStyleChange, onCompletionChange }: { onStyleChange(value: boolean): void; onCompletionChange(value: boolean): void }) {
  const { notificationStyle: activeStyle, t } = usePresentation();
  const [section, setSection] = useState('settings');
  const [showTestOptions, setShowTestOptions] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const preferences = useNotificationPreferences();
  const [status, setStatus] = useState('');
  const picker = useAchievementPicker();
  const activity = useAchievementActivity(picker.appid);
  const settingsPreview = usePreviewAchievement();
  const xbox = useXboxPreview(activeStyle, picker.appid);
  const selectedAchievement = { ...(picker.preview ?? sampleAchievement), gameProgress: activity.progress[picker.appid ?? 0] };
  const achievement = activeStyle === 'xbox' ? { ...selectedAchievement, grade: undefined, hideGrade: true, ...xboxMetadata(xbox.xboxCatalog, picker.achievementId) } : selectedAchievement;
  useEffect(() => {
    setStatus('');
  }, [picker.appid, picker.achievementId]);
  const testPopup = (grade?: TrophyGrade, override?: Achievement) => {
    try {
      setStatus('');
      const selected = override ?? achievement;
      showTestPopup(grade ?? selected.grade ?? 'bronze', grade ? { ...selected, hideGrade: false } : selected);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not show the test popup.');
    }
  };

  return <>
    <div data-trophy-menu-navigation style={{ padding: '0 12px 12px', minWidth: 0 }}>
      <Dropdown selectedOption={section} rgOptions={[
        { data: 'settings', label: t('Settings') },
        { data: 'games', label: t('Game profiles') },
        { data: 'history', label: t('Achievement history') },
        { data: 'testing', label: t('Preview') },
      ]} onChange={option => { preferences.setSoundStatus(''); setSection(option.data); }} />
    </div>
    <div data-trophy-menu-content={section} style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      {section === 'settings' && <NotificationSettings
        preferences={preferences} achievement={achievement} settingsPreview={settingsPreview}
        onStyleChange={onStyleChange} onCompletionChange={onCompletionChange}
      />}
      {section === 'games' && <GameSettings />}
      {section === 'history' && <AchievementHistory />}
      {section === 'testing' && <AchievementPreview
        picker={picker} achievement={achievement} xbox={xbox} status={status} setStatus={setStatus}
        showTestOptions={showTestOptions} setShowTestOptions={setShowTestOptions}
        showSources={showSources} setShowSources={setShowSources} testPopup={testPopup}
      />}
    </div>
  </>;
}
