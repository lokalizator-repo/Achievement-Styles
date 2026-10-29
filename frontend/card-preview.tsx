import { useEffect, useRef, useState } from 'react';
import { TrophyCard, type Achievement } from './card';
import { usePresentation } from './presentation';
import { popupLayouts } from './popup-layout';
import { useAchievementActivity } from './achievement-activity';
import { sampleAchievement } from './sample-achievement';

export function usePreviewAchievement(appid?: number): Achievement {
  const activity = useAchievementActivity(appid);
  usePresentation(appid);
  const entry = activity.history.find(item => appid === undefined || item.appid === appid);
  return entry ? {
    ...entry.achievement,
    appid,
    hideGrade: !entry.achievement.grade,
    gameProgress: activity.progress[entry.appid] ?? entry.achievement.gameProgress,
  } : {
    ...sampleAchievement,
    appid,
    gameProgress: activity.progress[appid ?? 0],
  };
}

export function CardPreview({ achievement }: { achievement: Achievement }) {
  const { notificationStyle } = usePresentation(achievement.appid);
  const layout = popupLayouts[notificationStyle];
  const container = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setScale(Math.min(1, entry.contentRect.width / layout.cardWidth)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [layout.cardWidth]);
  return <div ref={container} style={{ width: '100%', minWidth: 0, height: layout.cardHeight * scale, overflow: 'hidden' }}>
    <div style={{ width: layout.cardWidth, transformOrigin: 'top left', transform: `scale(${scale})` }}>
      <TrophyCard achievement={achievement} />
    </div>
  </div>;
}
