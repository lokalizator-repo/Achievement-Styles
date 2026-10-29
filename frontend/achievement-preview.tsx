import { DialogButton, Field } from 'millennium';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { AchievementDiagnostics, AchievementPicker, AchievementTestOptions, useAchievementPicker } from './achievement-picker';
import type { Achievement, TrophyGrade } from './card';
import { CardPreview } from './card-preview';
import { usePresentation, type NotificationStyle } from './presentation';
import { showTestQueue } from './test-popup';
import { loadXboxCatalog, type XboxCatalog } from './xbox-catalog';

export function useXboxPreview(activeStyle: NotificationStyle, appid?: number) {
  const [xboxCatalog, setXboxCatalog] = useState<XboxCatalog>();
  const [xboxStatus, setXboxStatus] = useState('');
  const [xboxError, setXboxError] = useState('');
  const [xboxRetry, setXboxRetry] = useState(0);
  const [xboxLoading, setXboxLoading] = useState(false);
  useEffect(() => {
    let current = true;
    setXboxCatalog(undefined);
    setXboxStatus('');
    setXboxError('');
    setXboxLoading(false);
    if (activeStyle === 'xbox' && appid) {
      setXboxStatus('Loading Xbox achievements…');
      setXboxLoading(true);
      void loadXboxCatalog(appid, xboxRetry > 0).then(catalog => {
        if (!current) return;
        setXboxCatalog(catalog);
        setXboxStatus(catalog ? 'Xbox achievement data loaded.' : 'No confident Xbox match. Standard notifications remain available.');
      }).catch(reason => {
        if (!current) return;
        setXboxStatus('Xbox data is unavailable. Standard notifications remain available.');
        setXboxError(reason instanceof Error ? reason.message : String(reason));
      }).finally(() => { if (current) setXboxLoading(false); });
    }
    return () => { current = false; };
  }, [activeStyle, appid, xboxRetry]);
  return { xboxCatalog, xboxStatus, xboxError, xboxRetry, setXboxRetry, xboxLoading };
}

interface AchievementPreviewProps {
  picker: ReturnType<typeof useAchievementPicker>;
  achievement: Achievement;
  xbox: ReturnType<typeof useXboxPreview>;
  status: string;
  setStatus(value: string): void;
  showTestOptions: boolean;
  setShowTestOptions: Dispatch<SetStateAction<boolean>>;
  showSources: boolean;
  setShowSources: Dispatch<SetStateAction<boolean>>;
  testPopup(grade?: TrophyGrade, override?: Achievement): void;
}

export function AchievementPreview({
  picker, achievement, xbox, status, setStatus,
  showTestOptions, setShowTestOptions, showSources, setShowSources, testPopup,
}: AchievementPreviewProps) {
  const { notificationStyle: activeStyle, t } = usePresentation();
  const { xboxCatalog, xboxStatus, xboxError, setXboxRetry, xboxLoading } = xbox;
  return <>
    <AchievementPicker picker={picker} xboxCatalog={xboxCatalog} />
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 12px 12px', minWidth: 0 }}>
      <CardPreview achievement={achievement} />
      <DialogButton disabled={picker.busy || !picker.selected} style={{ width: '100%', minWidth: 0 }} onClick={() => {
        setStatus('');
        picker.testNative();
      }}>{t('Preview notification')}</DialogButton>
      {picker.nativeStatus && <div role="status" style={{ fontSize: 12, lineHeight: '18px', overflowWrap: 'anywhere' }}>{t(picker.nativeStatus)}</div>}
      {status && <Field description={t(status)} />}
      {activeStyle === 'xbox'
        ? (xboxStatus && (!xboxCatalog || xboxLoading) && <Field description={t(xboxStatus)} />)
        : (picker.catalogStatus && <Field description={picker.catalogStatus} />)}
      {xboxError && activeStyle === 'xbox' && <>
        <Field label={t('Xbox request error')} description={xboxError} />
        <DialogButton disabled={!picker.appid || xboxLoading} onClick={() => setXboxRetry(value => value + 1)}>{t('Retry Xbox lookup')}</DialogButton>
      </>}
      <DialogButton style={{ width: '100%' }} aria-expanded={showTestOptions} onClick={() => setShowTestOptions(value => !value)}>
        {t(showTestOptions ? 'Hide test options' : 'Test options')}
      </DialogButton>
    </div>
    {showTestOptions && <>
      {activeStyle !== 'xbox' && <AchievementTestOptions picker={picker} />}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 12px 12px', minWidth: 0 }}>
        <DialogButton disabled={picker.busy} style={{ flex: '1 1 120px', minWidth: 0 }} onClick={() => {
          try { showTestQueue(achievement); }
          catch (error) { setStatus(error instanceof Error ? error.message : 'Could not show the test popup.'); }
        }}>{t('Queue · 3')}</DialogButton>
        {activeStyle === 'xbox'
          ? (['normal', 'rare', 'mythic'] as const).map(variant => <DialogButton key={variant} disabled={picker.busy} style={{ flex: '1 1 100px', minWidth: 0 }} onClick={() => testPopup(variant === 'mythic' ? 'platinum' : 'bronze', {
            ...achievement, xboxVariant: variant, xboxPercent: variant === 'rare' ? achievement.xboxPercent : undefined,
            strName: variant === 'mythic' ? picker.games.find(game => game.appid === picker.appid)?.name ?? t('Game complete') : achievement.strName,
            completionCount: picker.achievements.length || undefined,
            completionBaseGame: false,
          })}>{t(variant === 'normal' ? 'Normal' : variant === 'rare' ? 'Rare' : 'Mythic')}</DialogButton>)
          : <DialogButton disabled={picker.busy} style={{ flex: '1 1 100px', minWidth: 0 }} onClick={() => testPopup('platinum')}>{t('Platinum')}</DialogButton>}
        {activeStyle !== 'xbox' && picker.completionPreview && <DialogButton disabled={picker.loading || picker.ps5Loading} style={{ flex: '1 1 100%', minWidth: 0 }} onClick={() => testPopup('platinum', picker.completionPreview)}>
          {t('Preview completion platinum')}
        </DialogButton>}
      </div>
    </>}
    <div style={{ padding: '0 12px 12px', minWidth: 0 }}>
      <DialogButton style={{ width: '100%' }} aria-expanded={showSources} onClick={() => setShowSources(value => !value)}>
        {t(showSources ? 'Hide sources' : 'Sources')}
      </DialogButton>
    </div>
    {showSources && <>
      {activeStyle === 'xbox' ? <>
        <Field label={t('Xbox achievement data')} description={xboxCatalog ? `${xboxCatalog.name} · ${Object.keys(xboxCatalog.matches).length}/${picker.achievements.length}` : t(xboxStatus || 'Choose a game and achievement in Preview first.')} />
        {achievement.xboxAchievementId && <Field description={`${achievement.xboxVariant === 'rare' ? 'Rare' : 'Common'} · ${achievement.xboxGamerscore}G${achievement.xboxPercent === undefined ? '' : ` · ${achievement.xboxPercent}%`}`} />}
        {!xboxError && <div style={{ padding: '0 12px 12px' }}><DialogButton disabled={!picker.appid || xboxLoading} onClick={() => setXboxRetry(value => value + 1)}>{t('Retry Xbox lookup')}</DialogButton></div>}
      </> : <AchievementDiagnostics picker={picker} />}
    </>}
  </>;

}
