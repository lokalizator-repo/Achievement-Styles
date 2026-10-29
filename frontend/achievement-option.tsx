import { TrophyIcon } from './card';
import type { DebugAchievement } from './debug-data';
import type { Ps5Trophy } from './ps5-catalog';

export function AchievementOption({ achievement, trophy, gamerscore }: { achievement: DebugAchievement; trophy?: Ps5Trophy; gamerscore?: number }) {
  return <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, width: '100%', padding: '1px 0' }} title={achievement.strName}>
    <img src={trophy?.strImage ?? achievement.strImage} alt="" style={{ width: 24, height: 24, objectFit: 'contain', flexShrink: 0 }} onError={event => {
      const image = event.currentTarget;
      image.onerror = null;
      if (achievement.strImage && image.src !== achievement.strImage) image.src = achievement.strImage;
      else image.style.visibility = 'hidden';
    }} />
    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{achievement.strName}</span>
    {trophy && <span data-trophy-grade={trophy.grade} title={`${trophy.grade} trophy`} style={{ width: 18, height: 22, flexShrink: 0 }}><TrophyIcon grade={trophy.grade} /></span>}
    {gamerscore !== undefined && <span data-xbox-gamerscore={gamerscore} style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{gamerscore} G</span>}
  </span>;
}
