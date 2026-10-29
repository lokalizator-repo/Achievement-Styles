import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { type TrophyGrade } from '../frontend/card';
import { PopupCard } from '../frontend/popup-card';
import { syncPopupMotion } from '../frontend/motion';
import { sampleArtwork } from '../frontend/ps5-assets';
import { sampleAchievement } from '../frontend/sample-achievement';
import { updatePresentation, usePresentation } from '../frontend/presentation';
import { version } from '../package.json';

function Preview() {
  const { notificationStyle, subtitleMode } = usePresentation();
  const [key, setKey] = useState(1);
  const [visible, setVisible] = useState(true);
  const [name, setName] = useState(sampleAchievement.strName);
  const [grade, setGrade] = useState<TrophyGrade>('bronze');
  const stage = useRef<HTMLDivElement>(null);
  const [screenScale, setScreenScale] = useState(0.5);
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setScreenScale(entry.contentRect.width / 1920));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setVisible(true);
  }, [key]);
  useEffect(() => {
    if (!visible) return;
    const notification = { data: { className: 'trophy-styles-test-toast', contentClassName: 'preview' } };
    syncPopupMotion(notification, 1);
    const duration = notificationStyle === 'ps4' ? 5500 : grade === 'platinum' ? 7000 : 5000;
    const exit = window.setTimeout(() => syncPopupMotion(notification, 3), duration);
    const hide = window.setTimeout(() => setVisible(false), duration + 300);
    return () => { window.clearTimeout(exit); window.clearTimeout(hide); };
  }, [key, visible, grade, notificationStyle]);

  return (
    <main>
      <style>{`
        *{box-sizing:border-box}body{background:#101216;color:#e6e7eb;font-family:'Segoe UI',sans-serif}
        main{max-width:1100px;padding:60px 32px;margin:auto}header{display:flex;justify-content:space-between;align-items:center;gap:24px;margin-bottom:28px}
        h1{font-size:24px;font-weight:500;margin:6px 0}p{font-size:14px;color:#999fa9;line-height:1.7;margin:6px 0}
        .label{font-size:11px;letter-spacing:2px;color:#939bab}.stage{aspect-ratio:16/9;position:relative;overflow:hidden;background:radial-gradient(ellipse at 35% 120%,#384650 0,transparent 60%),linear-gradient(145deg,#1e2a33,#10151d 75%)}
        .stage:before{content:'';position:absolute;width:90%;height:400px;top:220px;left:-15%;transform:rotate(-13deg);background:linear-gradient(130deg,#273f48,#17242b);border-radius:50%}
        .toast{position:absolute;top:16px;right:16px;width:min(680px,calc(100% - 32px))}
        button,input{border:1px solid #404650;border-radius:6px;background:#242932;color:#f3f4f5;padding:11px 16px;font:inherit;font-size:14px}button{cursor:pointer}button:hover{background:#323a46}input{width:270px;max-width:100%}.controls{display:flex;gap:12px;margin-top:20px;flex-wrap:wrap}
        .caption{position:absolute;bottom:24px;left:28px;font-size:11px;letter-spacing:2px;color:#7c8b96}@media(prefers-reduced-motion:reduce){.toast{animation:none}}
      `}</style>
      <header><div><div className="label">ACHIEVEMENT STYLES</div><h1>{notificationStyle.toUpperCase()} achievement notification</h1><p>Achievement notification preview</p></div><span className="label">{version}</span></header>
      <div className="stage" ref={stage}>
        <div style={{ position: 'absolute', width: 1920, height: 1080, transformOrigin: 'top left', transform: `scale(${screenScale})` }}>
          {visible && <div key={key} className="toast" style={notificationStyle === 'ps4' ? { left: 0, right: 'auto', top: 134, width: 554 } : undefined}><PopupCard achievement={{ ...sampleAchievement, strName: name || sampleAchievement.strName, strImage: sampleArtwork, grade, motionKey: 'preview' }} /></div>}
        </div>
        <div className="caption">NOTIFICATION PREVIEW</div>
      </div>
      <div className="controls"><input aria-label="Achievement name" value={name} onChange={event => setName(event.target.value)} /><button onClick={() => setKey(value => value + 1)}>Replay notification</button></div>
      <div className="controls">{(['ps5', 'ps4'] as const).map(value => <button key={value} aria-pressed={notificationStyle === value} onClick={() => { updatePresentation('notificationStyle', value); setKey(key => key + 1); }}>{value.toUpperCase()}</button>)}<button aria-pressed={subtitleMode === 'earned'} onClick={() => { updatePresentation('subtitleMode', subtitleMode === 'earned' ? 'description' : 'earned'); setKey(key => key + 1); }}>Toggle description</button></div>
      <div className="controls">{(['bronze', 'silver', 'gold', 'platinum'] as const).map(value => <button key={value} onClick={() => { setGrade(value); setKey(key => key + 1); }}>{value}</button>)}</div>
      <p>Both styles keep Steam achievement artwork and localized text. Real notifications show a trophy grade only after a PlayStation match. The plugin retains its existing PS5 sounds; this browser preview is silent.</p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Preview />);
