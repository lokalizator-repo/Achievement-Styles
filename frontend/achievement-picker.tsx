import { DialogButton, Dropdown, Field, TextField, ToggleField } from 'millennium';
import { useEffect, useMemo, useState } from 'react';
import { loadDebugAchievements, readDebugGames, type DebugAchievement } from './debug-data';
import { applyPs5Trophy } from './ps5-catalog';
import { AchievementOption } from './achievement-option';
import { loadGameCatalog, loadPsnRarities, loadTrophyArtwork, resolveCatalogTrophy, type GameCatalog } from './public-catalog';
import { completionPlatinum } from './completion';
import { usePresentation } from './presentation';
import { useSteamPercent } from './use-steam-percent';
import { earnedPercent } from './rarity';
import { SourceDiagnostics, useSourceDiagnostics } from './source-diagnostics';
import { xboxMetadata, type XboxCatalog } from './xbox-catalog';

export function useAchievementPicker() {
  const { t, raritySource, notificationStyle } = usePresentation();
  const [games, setGames] = useState(readDebugGames);
  const [gameQuery, setGameQuery] = useState('');
  const [appid, setAppid] = useState<number>();
  const [loadedAppid, setLoadedAppid] = useState<number>();
  const [achievements, setAchievements] = useState<DebugAchievement[]>([]);
  const [achievementQuery, setAchievementQuery] = useState('');
  const [achievementId, setAchievementId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [nativeStatus, setNativeStatus] = useState<{ key: string; text: string }>();
  const [usePs5, setUsePs5] = useState(true);
  const [ps5Catalog, setPs5Catalog] = useState<GameCatalog>();
  const [ps5Loading, setPs5Loading] = useState(false);
  const [ps5Error, setPs5Error] = useState('');
  const [ps5Retry, setPs5Retry] = useState(0);
  const [ps5Edition, setPs5Edition] = useState<string>();
  const [artwork, setArtwork] = useState<{ key: string; image?: string; error?: string }>();
  const catalog = ps5Catalog?.appid === appid ? ps5Catalog : undefined;
  const needsCatalog = notificationStyle !== 'xbox' && (usePs5 || raritySource === 'psn');
  const selected = loadedAppid === appid ? achievements.find(item => item.strID === achievementId) : undefined;
  const diagnostics = useSourceDiagnostics(appid, selected?.strID, ps5Edition);
  const psnMatch = resolveCatalogTrophy(catalog, selected?.strID);
  const steamPercent = useSteamPercent(appid, selected?.strID,
    notificationStyle !== 'xbox' && raritySource !== 'off' && (raritySource === 'steam' || earnedPercent(psnMatch?.psnPercent) === undefined));
  const matched = usePs5 && notificationStyle !== 'xbox' ? psnMatch : undefined;
  const fullArtwork = matched && artwork?.key === matched.source ? artwork : undefined;
  const artworkPending = !!matched && !matched.strImage?.startsWith('data:') && !fullArtwork?.image && !fullArtwork?.error;
  const preview = useMemo(() => selected && {
    ...(matched ? applyPs5Trophy(selected, { ...matched, strImage: fullArtwork?.image ?? matched.strImage }) : { ...selected, grade: 'bronze' as const, hideGrade: true }),
    ...(psnMatch?.psnPercent === undefined ? {} : { psnPercent: psnMatch.psnPercent }),
    steamPercent,
  }, [selected, matched, fullArtwork, psnMatch, steamPercent]);

  useEffect(() => {
    let current = true;
    setArtwork(undefined);
    if (matched) void loadTrophyArtwork(matched).then(image => {
      if (current) setArtwork({ key: matched.source, image });
    }).catch(reason => {
      if (current) setArtwork({ key: matched.source, error: reason instanceof Error ? reason.message : 'Could not load full-size artwork.' });
    });
    return () => { current = false; };
  }, [matched, ps5Retry]);

  useEffect(() => {
    let current = true;
    setPs5Catalog(undefined);
    setPs5Loading(needsCatalog && appid !== undefined);
    setPs5Error('');
    if (needsCatalog && appid !== undefined) void loadGameCatalog(appid, ps5Edition, ps5Retry > 0).then(async result => {
      if (raritySource === 'psn' && result.kind === 'ready') await loadPsnRarities(appid).catch(() => {});
      if (!current) return;
      setPs5Catalog(result);
      setPs5Loading(false);
    }).catch(reason => {
      if (!current) return;
      setPs5Error(reason instanceof Error ? reason.message : 'Could not load PS5 artwork.');
      setPs5Loading(false);
    });
    return () => { current = false; };
  }, [appid, needsCatalog, ps5Retry, ps5Edition, raritySource]);

  useEffect(() => {
    let current = true;
    setAchievements([]);
    setAchievementId(undefined);
    setAchievementQuery('');
    setError('');
    setLoading(appid !== undefined);
    if (appid !== undefined) {
      void loadDebugAchievements(appid).then(items => {
        if (!current) return;
        setAchievements(items);
        setLoadedAppid(appid);
        setLoading(false);
      }).catch(reason => {
        if (!current) return;
        setError(reason instanceof Error ? reason.message : 'Could not load achievements.');
        setLoading(false);
      });
    }
    return () => { current = false; };
  }, [appid, retry]);

  const shownGames = useMemo(() => {
    const query = gameQuery.trim().toLocaleLowerCase();
    const filtered = games.filter(game => game.name.toLocaleLowerCase().includes(query)).slice(0, 100);
    const chosen = games.find(game => game.appid === appid);
    if (chosen && !filtered.includes(chosen)) filtered.unshift(chosen);
    return filtered;
  }, [games, gameQuery, appid]);
  const shownAchievements = useMemo(() => {
    const query = achievementQuery.trim().toLocaleLowerCase();
    const filtered = achievements.filter(item => `${item.strName} ${item.description}`.toLocaleLowerCase().includes(query)).slice(0, 150);
    if (selected && !filtered.includes(selected)) filtered.unshift(selected);
    return filtered;
  }, [achievements, achievementQuery, selected]);

  const busy = loading || ps5Loading || artworkPending || (appid !== undefined && !selected);
  const selectionKey = `${appid}:${selected?.strID}`;
  const testNative = () => {
    if (appid === undefined || !selected || busy) return;
    const status = (text: string) => setNativeStatus({ key: selectionKey, text });
    const store = window.NotificationStore;
    if (typeof store?.TestAchievement !== 'function') {
      status('Steam native notification test is unavailable. Reload Steam UI.');
      return;
    }
    void Promise.resolve().then(() => store.TestAchievement(appid, false, {
      appid, achievement_id: selected.strID, name: selected.strName, description: selected.description,
      image_url: preview?.strImage ?? selected.strImage ?? '', achieved: true, global_achieved_pct: preview?.steamPercent,
      rtime_unlocked: Math.floor(Date.now() / 1000), min_progress: 0, current_progress: 0, max_progress: 0,
    })).then(() => status('Steam test notification requested for the selected achievement. Nothing is unlocked.'))
      .catch(error => status(error instanceof Error ? error.message : 'Could not show the test popup.'));
  };
  return {
    games, setGames, gameQuery, setGameQuery, appid, achievements, achievementQuery, setAchievementQuery,
    achievementId, setAchievementId, loading, error, setRetry, usePs5, setUsePs5, catalog, ps5Loading, ps5Error,
    setPs5Retry, ps5Edition, selected, preview, busy, shownGames, shownAchievements, diagnostics,
    nativeStatus: nativeStatus?.key === selectionKey ? nativeStatus.text : '', testNative,
    completionPreview: usePs5 && loadedAppid === appid ? completionPlatinum(catalog, achievements) : undefined,
    selectGame(value: number) {
      if (value === appid) return;
      setPs5Edition(undefined);
      setPs5Retry(0);
      setNativeStatus(undefined);
      setAppid(value);
    },
    selectEdition: setPs5Edition,
    catalogStatus: ps5Loading ? t('Looking up the PS5 game and matching achievements…')
      : ps5Error ? t('PlayStation catalog unavailable: {error}. Using Steam artwork.', { error: ps5Error })
      : artworkPending ? t('Loading full-size PS5 artwork…')
      : matched ? t('{platform} match · {grade} · {name}{warning}', {
        platform: catalog?.gameId.includes('-ps4') ? 'PS4' : 'PS5', grade: t(matched.grade[0].toUpperCase() + matched.grade.slice(1)),
        name: matched.strName, warning: fullArtwork?.error ? t(' · Full-size image unavailable; using thumbnail.') : '',
      })
      : catalog?.kind === 'choose' ? t('Choose the correct PlayStation edition above. Steam artwork is used until then.')
      : catalog?.kind === 'missing' ? t('No matching PlayStation game found. Using Steam artwork without a trophy grade.')
      : selected ? t('No unambiguous PlayStation achievement match. Using Steam artwork without a trophy grade.')
      : catalog ? t('{count} Steam achievements matched to {platform}. Icons and trophies appear in the list.', {
        count: Object.keys(catalog.matches).length, platform: catalog.gameId.includes('-ps4') ? 'PS4' : 'PS5',
      }) : '',
  };
}

type Picker = ReturnType<typeof useAchievementPicker>;

function EditionPicker({ picker }: { picker: Picker }) {
  const { t } = usePresentation();
  if (!picker.usePs5 || picker.catalog?.kind !== 'choose') return null;
  return <Dropdown menuLabel={t('PlayStation edition')} strDefaultLabel={t('Choose the matching PlayStation edition')}
    selectedOption={picker.ps5Edition} rgOptions={picker.catalog.candidates.map(candidate => ({
      data: candidate.slug, label: `${candidate.platform} · ${candidate.name}${candidate.region ? ` · ${candidate.region}` : ''} · ${candidate.slug}`,
    }))} onChange={option => picker.selectEdition(option.data)} />;
}

export function AchievementPicker({ picker, xboxCatalog }: { picker: Picker; xboxCatalog?: XboxCatalog }) {
  const { t, notificationStyle } = usePresentation();
  const { games, gameQuery, setGameQuery, appid, achievements, achievementQuery, setAchievementQuery,
    achievementId, setAchievementId, loading, error, selected, shownGames, shownAchievements, usePs5, catalog } = picker;
  return <>
    <Field label={t('Test achievement')} description={t('Choose a real Steam achievement for the test popup. Nothing is unlocked.')} />
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 12px 12px', minWidth: 0 }}>
      <TextField label={t('Find a game')} value={gameQuery} onChange={event => setGameQuery(event.target.value)} />
      <Dropdown rgOptions={shownGames.map(game => ({ data: game.appid, label: game.name }))}
        selectedOption={appid} strDefaultLabel={t('Choose a game')} disabled={!games.length}
        onChange={option => picker.selectGame(Number(option.data))} />
      {!games.length && <DialogButton onClick={() => picker.setGames(readDebugGames())}>{t('Reload library games')}</DialogButton>}
      {achievements.length > 40 && <TextField label={t('Find an achievement')} value={achievementQuery} onChange={event => setAchievementQuery(event.target.value)} />}
      <Dropdown rgOptions={shownAchievements.map(item => ({ data: item.strID, label: <AchievementOption achievement={item}
        trophy={notificationStyle !== 'xbox' && usePs5 ? resolveCatalogTrophy(catalog, item.strID) : undefined}
        gamerscore={notificationStyle === 'xbox' && xboxCatalog?.appid === appid ? xboxMetadata(xboxCatalog, item.strID).xboxGamerscore : undefined} /> }))}
        contextMenuPositionOptions={{ bMatchWidth: true }}
        selectedOption={achievementId} strDefaultLabel={loading ? t('Loading achievements…') : t('Choose an achievement')}
        disabled={loading || !achievements.length} onChange={option => setAchievementId(option.data)} />
      <div role="status" style={{ fontSize: 12, lineHeight: '18px', overflowWrap: 'anywhere' }}>
        {(error ? t(error) : '') || (loading ? t('Loading from Steam…') : selected?.description || (appid !== undefined
          ? achievements.length ? t('{count} achievements. Select one, then use Preview notification.', { count: achievements.length }) : t('This game has no achievements available.')
          : games.length ? t('Search games by name. The list shows up to 100 matches.') : t('Library is not ready. Open your Steam library, then reload the list.')))}
      </div>
      {error && <DialogButton onClick={() => picker.setRetry(value => value + 1)}>{t('Retry achievements')}</DialogButton>}
      <EditionPicker picker={picker} />
    </div>
  </>;
}

export function AchievementDiagnostics({ picker }: { picker: Picker }) {
  const { t } = usePresentation();
  const { appid, selected, catalog, usePs5 } = picker;
  return <>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 12px 12px', minWidth: 0 }}>
      {appid !== undefined && selected?.strID && <SourceDiagnostics diagnostics={picker.diagnostics} />}
      {appid !== undefined && usePs5 && <>
        <Field label={t('PlayStation match')} description={picker.catalogStatus} />
        <DialogButton disabled={picker.ps5Loading} onClick={() => picker.setPs5Retry(value => value + 1)}>
          {t(picker.ps5Error ? 'Retry PS5 lookup' : 'Refresh PS5 match')}
        </DialogButton>
        {catalog?.source && <a href={catalog.source} target="_blank" rel="noreferrer">{t('PlayStation source · PSN Trophy Leaders')}</a>}
      </>}
    </div>
  </>;
}

export function AchievementTestOptions({ picker }: { picker: Picker }) {
  const { t } = usePresentation();
  return <ToggleField label={t('Use matching PS5 artwork and trophy grade')}
    description={t('Looks up the selected game in a public PlayStation catalog, with PS4 fallback when needed. No PSN account needed. Matches are cached locally.')}
    checked={picker.usePs5} onChange={picker.setUsePs5} />;
}
