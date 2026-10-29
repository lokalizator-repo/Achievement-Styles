import { useEffect, useState } from 'react';
import { cachedSteamPercent, loadSteamPercentages } from './steam-rarity';

export function useSteamPercent(appid: number | undefined, achievementId: string | undefined, enabled: boolean) {
  const [result, setResult] = useState<{ appid: number; achievementId: string; percent?: number }>();
  useEffect(() => {
    let current = true;
    if (enabled && appid !== undefined && achievementId) {
      void loadSteamPercentages(appid).then(percentages => {
        if (current) setResult({ appid, achievementId, percent: percentages.get(achievementId) });
      }).catch(() => {});
    }
    return () => { current = false; };
  }, [appid, achievementId, enabled]);
  if (!enabled || appid === undefined || !achievementId) return undefined;
  return result?.appid === appid && result.achievementId === achievementId
    ? result.percent : cachedSteamPercent(appid, achievementId);
}
