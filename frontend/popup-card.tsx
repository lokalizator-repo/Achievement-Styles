import { TrophyCard, type Achievement } from './card';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { registerPopupMotion } from './motion';
import { forgetTiming } from './notification-timing';
import { popupScale } from './monitor-scale';
import { popupLayouts, popupStyle } from './popup-layout';
import { usePresentation } from './presentation';

const popupStyles = `
  html:has(body.trophy-styles-notification-window), body.trophy-styles-notification-window {
    box-sizing: border-box !important;
    width: 100vw !important;
    height: 100vh !important;
    min-width: 0 !important;
    min-height: 0 !important;
    max-width: none !important;
    max-height: none !important;
    margin: 0 !important;
    padding: 0 !important;
    background: transparent !important;
    overflow: hidden !important;
  }
  body.trophy-styles-notification-window div:has(.trophy-styles-popup-card):not(.trophy-styles-popup-surface) {
    position: static !important;
    display: block !important;
    box-sizing: border-box !important;
    width: 100% !important;
    height: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
    max-width: none !important;
    max-height: none !important;
    padding: 0 !important;
    margin: 0 !important;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    transform: none !important;
    animation: none !important;
    white-space: normal !important;
    overflow: visible !important;
    -webkit-line-clamp: unset !important;
  }
  body.trophy-styles-notification-window div:has(.trophy-styles-popup-card) > :not(:has(.trophy-styles-popup-card)):not(.trophy-styles-popup-card):not(style) {
    display: none !important;
  }
`;

export function PopupCard({ achievement }: { achievement: Achievement }) {
  const { notificationStyle } = usePresentation(achievement.appid);
  const style = popupStyle(achievement.motionKey, notificationStyle);
  const layout = popupLayouts[style];
  const scale = popupScale(achievement.motionKey);
  useEffect(() => () => { if (achievement.motionKey) forgetTiming(achievement.motionKey); }, [achievement.motionKey]);
  const surface = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  useLayoutEffect(() => {
    setPlaying(false);
    const card = surface.current?.querySelector<HTMLElement>('.trophy-styles-popup-card');
    if (card) return registerPopupMotion(achievement.motionKey ?? 'test', card, phase => {
      if (phase === 'enter') setPlaying(true);
    });
  }, [achievement.motionKey, style]);
  return (
    <>
      <style>{popupStyles}</style>
      <div ref={surface} className="trophy-styles-popup-surface" style={{ width: style === 'ps5' && scale === 1 ? '100%' : layout.width, zoom: scale, boxSizing: 'border-box', padding: layout.padding }}>
        <TrophyCard achievement={style === 'xbox' && achievement.grade === 'platinum' ? { ...achievement, xboxVariant: 'mythic' } : achievement} notificationStyle={style} popup playing={playing} />
      </div>
    </>
  );
}
