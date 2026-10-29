import { DialogButton, Dropdown, Field, SliderField, TextField, usePluginConfig } from 'millennium';
import { useEffect, useRef, useState } from 'react';
import { CardPreview, usePreviewAchievement } from './card-preview';
import { readDebugGames } from './debug-data';
import { parseProfiles, type GameProfile } from './game-profiles';
import { updatePresentation, usePresentation } from './presentation';
import { showTestPopup } from './test-popup';
import { clearAchievementHistory, retryAchievementHistory, useAchievementActivity } from './achievement-activity';

export function GameSettings() {
  const { t } = usePresentation();
  const [saved, saveConfig] = usePluginConfig<string>('gameProfiles');
  const [profiles, setProfiles] = useState(() => parseProfiles(saved));
  const draft = useRef(profiles);
  const writes = useRef(Promise.resolve());
  const pendingWrites = useRef(0);
  const [games, setGames] = useState(readDebugGames);
  const [query, setQuery] = useState('');
  const [appid, setAppid] = useState<number>();
  const [status, setStatus] = useState('');
  useEffect(() => {
    if (pendingWrites.current) return;
    const value = parseProfiles(saved);
    draft.current = value;
    setProfiles(value);
  }, [saved]);
  const profile = profiles[String(appid)] ?? {};
  const preview = usePreviewAchievement(appid);
  const presentation = usePresentation(appid);
  const shown = games.filter(game => game.appid === appid || game.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const change = (patch?: Partial<GameProfile>) => {
    if (!appid) return;
    const next = { ...draft.current };
    if (!patch) delete next[String(appid)];
    else {
      const value = { ...next[String(appid)], ...patch };
      next[String(appid)] = Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
      if (!Object.keys(next[String(appid)]).length) delete next[String(appid)];
    }
    draft.current = next;
    setProfiles(next);
    updatePresentation('gameProfiles', next);
    setStatus('Saving…');
    pendingWrites.current++;
    writes.current = writes.current.catch(() => {}).then(() => saveConfig(JSON.stringify(next))).finally(() => { pendingWrites.current--; });
    void writes.current.then(() => { if (draft.current === next) setStatus('Saved'); }).catch(error => setStatus(String(error)));
  };
  return <>
    <Field description={t('Games use global settings until you choose an override. Changes are saved automatically.')} />
    <TextField label={t('Find a game')} value={query} onChange={event => setQuery(event.target.value)} />
    <Field label={t('Game')} childrenLayout="below"><Dropdown selectedOption={appid}
      rgOptions={shown.map(game => ({ data: game.appid, label: `${game.name}${profiles[String(game.appid)] ? ` · ${t('Custom')}` : ''}` }))}
      onChange={option => { setAppid(option.data); setStatus(''); }} /></Field>
    {!games.length && <DialogButton onClick={() => setGames(readDebugGames())}>{t('Refresh games')}</DialogButton>}
    {appid && saved !== undefined && <>
      <Field label={t('Notification style')} childrenLayout="below"><Dropdown selectedOption={profile.notificationStyle ?? 'inherit'} rgOptions={[
        { data: 'inherit', label: t('Use global setting') }, { data: 'ps5', label: 'PS5' }, { data: 'ps4', label: 'PS4' },
        { data: 'xbox', label: 'Xbox Series X|S' }, { data: 'random', label: t('Random (PS5 / PS4 / Xbox)') },
      ]} onChange={option => change({ notificationStyle: option.data === 'inherit' ? undefined : option.data })} /></Field>
      <Field label={t('Popup duration')} childrenLayout="below"><Dropdown selectedOption={profile.popupDuration ?? 'inherit'} rgOptions={[
        { data: 'inherit', label: t('Use global setting') }, { data: 'auto', label: t('Automatic (reading time)') },
        ...([5, 7, 10, 15] as const).map(seconds => ({ data: seconds, label: t('{seconds} seconds', { seconds }) })),
      ]} onChange={option => change({ popupDuration: option.data === 'inherit' ? undefined : option.data })} /></Field>
      <Field label={t('Notification volume')} childrenLayout="below"><Dropdown selectedOption={profile.soundVolume === undefined ? 'inherit' : 'custom'} rgOptions={[
        { data: 'inherit', label: t('Use global setting') }, { data: 'custom', label: t('Custom') },
      ]} onChange={option => change({ soundVolume: option.data === 'inherit' ? undefined : 100 })} /></Field>
      {profile.soundVolume !== undefined && <SliderField label={t('Notification volume')} value={profile.soundVolume} min={0} max={200} step={1} showValue valueSuffix="%"
        onChange={value => change({ soundVolume: value })} />}
      <Field label={t('Game progress in notifications')} childrenLayout="below"><Dropdown selectedOption={profile.showProgress === undefined ? 'inherit' : profile.showProgress ? 'on' : 'off'} rgOptions={[
        { data: 'inherit', label: t('Use global setting') }, { data: 'on', label: t('Show') }, { data: 'off', label: t('Do not show') },
      ]} onChange={option => change({ showProgress: option.data === 'inherit' ? undefined : option.data === 'on' })} /></Field>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        {presentation.styleSelection === 'random' && <Field description={t('Random style preview uses PS5. Each replay chooses a style again.')} />}
        <CardPreview achievement={preview} />
        <DialogButton onClick={() => { try { showTestPopup(preview.grade ?? 'bronze', preview); } catch (error) { setStatus(String(error)); } }}>{t('Preview notification')}</DialogButton>
        <DialogButton disabled={!profiles[String(appid)]} onClick={() => change()}>{t('Reset game to global settings')}</DialogButton>
      </div>
    </>}
    {status && <Field description={t(status)} />}
  </>;
}

export function AchievementHistory() {
  const { t, locale } = usePresentation();
  const activity = useAchievementActivity();
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(25);
  const [status, setStatus] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const search = query.trim().toLocaleLowerCase();
  const rows = activity.history.filter(item => `${item.game} ${item.achievement.strName}`.toLocaleLowerCase().includes(search));
  return <>
    <Field description={t('The last 500 achievements earned while the plugin is running. Test notifications are excluded. History is separate for each Steam account.')} />
    <TextField label={t('Find a game or achievement')} value={query} onChange={event => { setQuery(event.target.value); setLimit(25); }} />
    {activity.loading ? <Field description={t('Loading history…')} /> : !rows.length && <Field description={t(search ? 'No matching achievements.' : 'No achievements recorded yet.')} />}
    <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      {rows.slice(0, limit).map(entry => <div key={`${entry.appid}:${entry.achievement.strID}`} style={{ borderBottom: '1px solid #ffffff20', paddingBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
          {entry.achievement.strImage && <img src={entry.achievement.strImage} alt="" style={{ width: 40, height: 40, objectFit: 'contain' }} />}
          <div style={{ minWidth: 0 }}><strong>{entry.achievement.strName}</strong><div style={{ fontSize: 12, opacity: .7 }}>{entry.game} · {new Date(entry.earnedAt).toLocaleString(locale)}</div></div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <DialogButton onClick={() => {
            try {
              showTestPopup(entry.achievement.grade ?? 'bronze', { ...entry.achievement, appid: entry.appid, hideGrade: !entry.achievement.grade, gameProgress: activity.progress[entry.appid] });
              setStatus('');
            } catch (error) { setStatus(String(error)); }
          }}>{t('Replay')}</DialogButton>
          <DialogButton onClick={() => window.SteamClient?.WebChat?.OpenURLInClient(`steam://url/SteamIDAchievementsPage/${entry.appid}`, 0, false)}>{t('Steam achievements')}</DialogButton>
        </div>
      </div>)}
      {rows.length > limit && <DialogButton onClick={() => setLimit(value => value + 25)}>{t('Show more')}</DialogButton>}
      {!!activity.history.length && <DialogButton onClick={() => {
        if (!confirmClear) { setConfirmClear(true); return; }
        void clearAchievementHistory(); setConfirmClear(false);
      }}>{t(confirmClear ? 'Confirm clear history' : 'Clear history')}</DialogButton>}
      {activity.error && <DialogButton onClick={() => { void retryAchievementHistory(); }}>{t('Retry history storage')}</DialogButton>}
    </div>
    {(activity.error || status) && <Field description={activity.error || status} />}
  </>;
}
