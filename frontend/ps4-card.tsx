import { progressText, type Achievement } from './card';
import { ps4BadgeImage, ps4TrophyImages, ps4Fonts } from './ps4-assets';
import { usePresentation } from './presentation';
import { useCallback } from 'react';
import { ScrollingSubtitle } from './scrolling-subtitle';
import { reportDuration } from './notification-timing';

function Ps4Badge({ active }: { active: boolean }) {
  return <div className="trophy-styles-ps4-badge" data-playing={active}>
    <span className="trophy-styles-ps4-halo" aria-hidden="true" />
    <img src={ps4BadgeImage} alt="PlayStation" />
  </div>;
}

export const ps4MotionStyles = `
  ${ps4Fonts.map(font => `@font-face { font-family: 'Trophy SST'; font-style: normal; font-weight: 300; src: url('${font.source}') format('woff2'); unicode-range: ${font.unicodeRange}; font-display: block; }`).join('\n')}
  @keyframes trophy-ps4-enter {
    from { transform: translate3d(-100%, 0, 0); }
    to { transform: translate3d(0, 0, 0); }
  }
  @keyframes trophy-ps4-exit {
    from { transform: translate3d(0, 0, 0); }
    to { transform: translate3d(-100%, 0, 0); }
  }
  @keyframes trophy-ps4-halo {
    0%, 10% { opacity: 0; transform: scale(.93); }
    17%, 22% { opacity: 1; transform: scale(1); }
    30% { opacity: .93; transform: scale(1); }
    40% { opacity: .83; transform: scale(1.005); }
    50% { opacity: .65; transform: scale(1.01); }
    60% { opacity: .28; transform: scale(1.015); }
    70% { opacity: .1; transform: scale(1.02); }
    90%, 100% { opacity: 0; transform: scale(1.02); }
  }
  .trophy-styles-ps4-card {
    box-sizing: border-box; position: relative; width: 554px; height: 100px;
    border-radius: 0; background: #f1f1f1; color: #555;
    font-family: "Trophy SST", "Segoe UI", Arial, sans-serif; font-weight: 300; text-align: left;
    overflow: hidden;
  }
  .trophy-styles-ps4-artwork { position: absolute; left: 102px; top: 18px; width: 64px; height: 64px; object-fit: contain; }
  .trophy-styles-ps4-text { position: absolute; left: 186px; top: 19px; width: 274px; }
  .trophy-styles-ps4-card .trophy-styles-earned { font-size: 30px; line-height: 36px; white-space: nowrap; }
  .trophy-styles-ps4-title { display: flex; align-items: center; gap: 11px; min-width: 0; height: 34px; margin-top: 1px; }
  .trophy-styles-ps4-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 27px; line-height: 34px; }
  .trophy-styles-ps4-card .trophy-styles-grade-icon { align-self: flex-start; flex: none; width: 26px; height: 28px; object-fit: contain; }
  .trophy-styles-ps4-card .trophy-styles-ps4-heading { height: 36px; margin-top: 0; }
  .trophy-styles-ps4-heading .trophy-styles-ps4-name { font-size: 30px; line-height: 36px; }
  .trophy-styles-ps4-heading .trophy-styles-grade-icon { align-self: center; }
  .trophy-styles-ps4-card .trophy-styles-subtitle { font-size: 27px !important; line-height: 34px !important; color: #666 !important; }
  .trophy-styles-ps4-badge { position: absolute; left: 464px; top: 6px; width: 84px; height: 88px; }
  .trophy-styles-ps4-badge > img { position: absolute; inset: 0; width: 100%; height: 100%; }
  .trophy-styles-ps4-halo {
    position: absolute; inset: 0; opacity: 0; pointer-events: none;
    background: radial-gradient(circle 42px at 42px 44px, transparent 22px, #70bfff08 25px, #65bcf04d 28px, #6ebef8b8 31px, #70bfff48 33px, #78c4fa14 36px, transparent 40px);
  }
  .trophy-styles-ps4-badge[data-playing="true"] .trophy-styles-ps4-halo {
    animation: trophy-ps4-halo 5200ms linear both;
  }
  .trophy-styles-ps4-card.trophy-styles-popup-card { opacity: 0; will-change: transform; }
  .trophy-styles-ps4-card[data-trophy-phase="enter"] { opacity: 1; animation: trophy-ps4-enter 200ms cubic-bezier(.2, .7, .3, 1) both; }
  .trophy-styles-ps4-card[data-trophy-phase="exit"] { opacity: 1; animation: trophy-ps4-exit 180ms ease-in both; }
  @media (prefers-reduced-motion: reduce) {
    .trophy-styles-ps4-card[data-trophy-phase="enter"] { animation: none; opacity: 1; transform: none; }
    .trophy-styles-ps4-card[data-trophy-phase="exit"] { animation: none; opacity: 0; }
    .trophy-styles-ps4-badge[data-playing] .trophy-styles-ps4-halo { animation: none; opacity: 0; }
  }
`;

export function Ps4Card({ achievement, popup = false, playing = !popup }: { achievement: Achievement; popup?: boolean; playing?: boolean }) {
  const { t, subtitleMode, popupDuration, showProgress } = usePresentation(achievement.appid);
  const grade = achievement.grade;
  const descriptionMode = subtitleMode === 'description';
  const progress = progressText(achievement, showProgress, t);
  const description = achievement.description?.trim() || t('Trophy earned!');
  const measureDescription = useCallback((width: number, available: number) => {
    reportDuration(achievement.motionKey, description, width, available, false);
  }, [achievement.motionKey, description, popupDuration]);
  return <>
    <style>{ps4MotionStyles}</style>
    <div className={`trophy-styles-card trophy-styles-ps4-card${popup ? ' trophy-styles-popup-card' : ''}`}
      data-notification-style="ps4" data-trophy-phase={popup ? 'waiting' : undefined}>
      <img className="trophy-styles-ps4-artwork" src={achievement.strImage || ps4TrophyImages[grade ?? 'bronze']} alt=""
        onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = ps4TrophyImages[grade ?? 'bronze']; }} />
      <div className="trophy-styles-ps4-text" style={progress ? { top: 10 } : undefined}>
        {!descriptionMode && <div className="trophy-styles-earned">{t('Trophy earned!')}</div>}
        <div className={`trophy-styles-ps4-title${descriptionMode ? ' trophy-styles-ps4-heading' : ''}`}>
          {grade && !achievement.hideGrade && <img className="trophy-styles-grade-icon" data-trophy-grade={grade}
            src={ps4TrophyImages[grade]} alt="" title={t(grade[0].toUpperCase() + grade.slice(1))} />}
          <div className="trophy-styles-ps4-name" title={achievement.strName}>{achievement.strName}</div>
        </div>
        {descriptionMode && <ScrollingSubtitle text={description} active={playing} onMeasure={measureDescription} />}
        {progress && <div data-trophy-progress style={{ fontSize: 14, lineHeight: '16px', whiteSpace: 'nowrap' }}>{progress}</div>}
      </div>
      <Ps4Badge key={achievement.motionKey ?? achievement.strID ?? achievement.strName} active={playing} />
    </div>
  </>;
}
