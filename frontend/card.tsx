import { useCallback, type CSSProperties } from 'react';
import { playstationLogo, trophyImages } from './ps5-assets';
import { motionStyles } from './motion';
import { achievementSubtitle, usePresentation, type NotificationStyle } from './presentation';
import { Ps4Card } from './ps4-card';
import { PlatinumAnimation } from './platinum-animation';
import { ScrollingSubtitle } from './scrolling-subtitle';
import { reportDuration } from './notification-timing';
import { achievementRarity } from './rarity';
import { XboxCard } from './xbox-card';

export type TrophyGrade = keyof typeof trophyImages;

export interface Achievement {
  appid?: number;
  gameProgress?: { earned: number; total: number };
  strName: string;
  strImage?: string;
  description?: string;
  bAchieved: boolean;
  strID?: string;
  grade?: TrophyGrade;
  ps5TrophyId?: string;
  motionKey?: string;
  hideGrade?: boolean;
  steamPercent?: number;
  psnPercent?: number;
  xboxVariant?: 'normal' | 'rare' | 'mythic';
  xboxPercent?: number;
  xboxGamerscore?: number;
  xboxAchievementId?: string;
  completionCount?: number;
  completionBaseGame?: boolean;
}

export function TrophyIcon({ grade = 'bronze' }: { grade?: TrophyGrade }) {
  return <img src={trophyImages[grade]} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />;
}

const styles: Record<string, CSSProperties> = {
  card: {
    boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 20,
    width: '100%', minWidth: 0, height: 112, padding: '18px 24px',
    borderRadius: 14, color: '#e4e4e4',
    background: 'linear-gradient(105deg, #26282a, #121617)',
    boxShadow: '0 4px 12px rgba(0,0,0,.15)',
    fontFamily: '"Segoe UI", Arial, sans-serif', fontWeight: 300, textAlign: 'left',
  },
  artwork: { width: 64, height: 64, flexShrink: 0, position: 'relative' },
  fallback: { position: 'absolute', inset: 0, padding: 8, boxSizing: 'border-box' },
  text: { minWidth: 0, flex: 1 },
  titleRow: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 },
  grade: { width: 24, height: 28, flexShrink: 0 },
  name: { flex: 1, minWidth: 0, fontSize: 28, fontWeight: 300, lineHeight: '36px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' },
  rarity: { flexShrink: 0, fontSize: 16, lineHeight: '24px', color: '#aab2bc', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  metadata: { display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
  progress: { fontSize: 13, lineHeight: '24px', color: '#89919a', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  image: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' },
  badge: { width: 54, height: 54, flexShrink: 0, boxSizing: 'border-box', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  badgeInner: { width: 36, height: 36, borderRadius: '50%', background: '#f0f0e9', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  logo: { width: 26, height: 26, objectFit: 'contain' },
};

interface TrophyCardProps { achievement: Achievement; popup?: boolean; playing?: boolean }

export function TrophyCard({ notificationStyle: override, ...props }: TrophyCardProps & { notificationStyle?: NotificationStyle }) {
  const { notificationStyle } = usePresentation(props.achievement.appid);
  const style = override ?? notificationStyle;
  return style === 'xbox' ? <XboxCard {...props} /> : style === 'ps4' ? <Ps4Card {...props} /> : <Ps5Card {...props} />;
}

function Ps5Card({ achievement, popup = false, playing = !popup }: TrophyCardProps) {
  const { subtitleMode, raritySource, popupDuration, showProgress, locale, t } = usePresentation(achievement.appid);
  const rarity = achievementRarity(achievement, raritySource);
  const percent = rarity?.percent;
  const sourceName = rarity?.source === 'psn' ? 'PSN' : 'Steam';
  const percentText = percent === undefined ? '' : `${percent.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  const subtitle = achievementSubtitle(achievement.description, subtitleMode);
  const progress = progressText(achievement, showProgress, t);
  const platinum = achievement.grade === 'platinum';
  const measureSubtitle = useCallback((width: number, available: number) => {
    reportDuration(achievement.motionKey, subtitle, width, available, platinum);
  }, [achievement.motionKey, subtitle, platinum, popupDuration]);
  return (
    <>
    <style>{motionStyles}</style>
    <div className={`trophy-styles-card${popup ? ' trophy-styles-popup-card' : ''}${platinum ? ' trophy-styles-platinum' : ''}`} style={styles.card} data-notification-style="ps5" data-trophy-phase={popup ? 'waiting' : undefined}>
      <div style={styles.artwork}>
        {platinum ? <div className="trophy-styles-platinum-figure">
          <PlatinumAnimation key={achievement.motionKey ?? achievement.strID ?? achievement.strName} active={playing} />
        </div> : achievement.strImage ? <img style={styles.image} src={achievement.strImage} alt="" onError={event => {
          event.currentTarget.onerror = null;
          event.currentTarget.src = trophyImages[achievement.grade ?? 'bronze'];
        }} /> : <div style={styles.fallback}><TrophyIcon grade={achievement.grade} /></div>}
      </div>
      <div style={styles.text}>
        <div style={styles.titleRow}>
          {!achievement.hideGrade && (!platinum || achievement.ps5TrophyId) && <div className="trophy-styles-grade-icon" data-trophy-grade={achievement.grade ?? 'bronze'} title={t((achievement.grade ?? 'bronze')[0].toUpperCase() + (achievement.grade ?? 'bronze').slice(1))} style={styles.grade}><TrophyIcon grade={achievement.grade} /></div>}
          <div style={styles.name} title={achievement.strName}>{achievement.strName}</div>
          {(percent !== undefined || progress) && <div style={styles.metadata}>
            {percent !== undefined && <span className="trophy-styles-rarity" data-rarity-source={rarity?.source} style={styles.rarity}
              title={t('{percent} of players earned this achievement ({source}).', { percent: percentText, source: sourceName })}>{sourceName} · {percentText}</span>}
            {progress && <span data-trophy-progress style={styles.progress} title={progress} aria-label={progress}>{achievement.gameProgress!.earned} / {achievement.gameProgress!.total}</span>}
          </div>}
        </div>
        <ScrollingSubtitle text={subtitle} active={playing} onMeasure={measureSubtitle} />
      </div>
      <div className="trophy-styles-badge" style={styles.badge}><div style={styles.badgeInner}><img src={playstationLogo} style={styles.logo} alt="PlayStation" /></div></div>
    </div>
    </>
  );
}

export function progressText(achievement: Achievement, enabled: boolean, t: (text: string, values?: Record<string, string | number>) => string) {
  const progress = achievement.gameProgress;
  if (!enabled || !progress || progress.total < 1 || achievement.grade === 'platinum') return '';
  return t('Earned {earned} of {total} · {percent}%', { ...progress, percent: Math.floor(progress.earned / progress.total * 100) });
}
