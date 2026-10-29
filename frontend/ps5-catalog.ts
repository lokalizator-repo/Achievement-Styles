import type { TrophyGrade } from './card';
import type { DebugAchievement } from './debug-data';

export interface Ps5Trophy extends DebugAchievement {
  strID: string;
  grade: TrophyGrade;
  source: string;
  iconSource: string;
}

export function applyPs5Trophy(achievement: DebugAchievement, trophy: Ps5Trophy): DebugAchievement {
  return { ...achievement, strImage: trophy.strImage, grade: trophy.grade, ps5TrophyId: trophy.strID,
    ...(trophy.psnPercent === undefined ? {} : { psnPercent: trophy.psnPercent }) };
}
