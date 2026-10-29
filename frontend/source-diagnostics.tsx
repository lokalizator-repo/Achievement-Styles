import { DialogButton } from 'millennium';
import { useEffect, useState } from 'react';
import { loadGameCatalog, loadPsnRarities, resolveCatalogTrophy } from './public-catalog';
import { loadSteamPercentages } from './steam-rarity';
import { achievementRarity, earnedPercent } from './rarity';
import { usePresentation } from './presentation';

interface SourceResult {
  steamPercent?: number;
  psnPercent?: number;
  steamError?: string;
  psnError?: string;
  match?: string;
}

const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

export function useSourceDiagnostics(appid: number | undefined, achievementId: string | undefined, edition?: string) {
  const { t } = usePresentation();
  const key = `${appid}:${achievementId}:${edition ?? ''}`;
  const [request, setRequest] = useState<{ key: string }>();
  const [response, setResponse] = useState<{ key: string; result: SourceResult }>();
  const [pending, setPending] = useState<string>();
  useEffect(() => {
    if (request?.key !== key) {
      if (request) setRequest(undefined);
      setPending(undefined);
      setResponse(undefined);
      return;
    }
    if (appid === undefined || !achievementId) return;
    let current = true;
    setPending(key);
    setResponse(undefined);
    const psn = async (): Promise<SourceResult> => {
      const catalog = await loadGameCatalog(appid, edition);
      const match = resolveCatalogTrophy(catalog, achievementId);
      const status = catalog.kind === 'choose' ? 'Choose the matching PlayStation edition.'
        : catalog.kind === 'missing' ? 'No matching PlayStation game found.'
        : !match ? 'No unambiguous PlayStation achievement match.' : undefined;
      if (status) return { psnError: t(status) };
      try {
        const enriched = await loadPsnRarities(appid);
        return { match: match && `${match.strName} · ${t(match.grade[0].toUpperCase() + match.grade.slice(1))}`, psnPercent: resolveCatalogTrophy(enriched, achievementId)?.psnPercent };
      } catch (error) {
        return { match: match?.strName, psnError: errorText(error) };
      }
    };
    void Promise.allSettled([loadSteamPercentages(appid), psn()]).then(([steam, playstation]) => {
      if (!current) return;
      setResponse({ key, result: {
        ...(playstation.status === 'fulfilled' ? playstation.value : { psnError: errorText(playstation.reason) }),
        ...(steam.status === 'fulfilled' ? { steamPercent: steam.value.get(achievementId) } : { steamError: errorText(steam.reason) }),
      } });
      setPending(undefined);
    });
    return () => { current = false; };
  }, [appid, achievementId, edition, key, request, t]);
  return {
    result: response?.key === key ? response.result : undefined,
    loading: pending === key,
    check: () => setRequest({ key }),
  };
}

export function SourceDiagnostics({ diagnostics }: { diagnostics: ReturnType<typeof useSourceDiagnostics> }) {
  const { t, raritySource, locale } = usePresentation();
  const { result, loading } = diagnostics;
  const percent = (value: unknown) => earnedPercent(value) === undefined ? t('Percentage unavailable.')
    : `${(value as number).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  const chosen = result && achievementRarity({ ...result, strName: '', bAchieved: false }, raritySource);
  return <>
    <DialogButton disabled={loading} onClick={diagnostics.check}>{t(loading ? 'Checking sources…' : 'Check sources')}</DialogButton>
    {result && <div role="status" style={{ fontSize: 12, lineHeight: '18px', overflowWrap: 'anywhere' }}>
      <div>Steam · {result.steamError || percent(result.steamPercent)}</div>
      <div>PSN · {result.match && `${result.match} · `}{result.psnError || percent(result.psnPercent)}</div>
      <div>{t('Displayed percentage')}: {raritySource === 'off' ? t('Do not show') : chosen ? `${chosen.source === 'psn' ? 'PSN' : 'Steam'} · ${percent(chosen.percent)}` : t('Percentage unavailable.')}</div>
      {raritySource === 'psn' && chosen?.source === 'steam' && <div>{t('PSN percentage unavailable; using Steam.')}</div>}
    </div>}
  </>;
}
