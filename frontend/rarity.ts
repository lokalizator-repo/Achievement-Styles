import type { Achievement } from './card';

export type RaritySource = 'steam' | 'psn' | 'off';

export function earnedPercent(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : undefined;
}

export function achievementRarity(achievement: Achievement, preferred: RaritySource) {
  if (preferred === 'off') return undefined;
  const psn = earnedPercent(achievement.psnPercent);
  if (preferred === 'psn' && psn !== undefined) return { source: 'psn' as const, percent: psn };
  const steam = earnedPercent(achievement.steamPercent);
  return steam === undefined ? undefined : { source: 'steam' as const, percent: steam };
}
