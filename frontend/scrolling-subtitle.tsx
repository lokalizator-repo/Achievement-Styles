import { useLayoutEffect, useRef } from 'react';
import { scrollDelay, subtitleScrollSpeed } from './notification-timing';

export function ScrollingSubtitle({ text, active, onMeasure }: { text: string; active: boolean; onMeasure?(width: number, available: number): void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLSpanElement>(null);
  const content = useRef<HTMLSpanElement>(null);
  const copy = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const container = viewport.current;
    const line = track.current;
    const original = content.current;
    const repeated = copy.current;
    const view = container?.ownerDocument.defaultView;
    if (!container || !line || !original || !repeated || !view) return;
    const reducedMotion = view.matchMedia('(prefers-reduced-motion: reduce)');
    let animation: Animation | undefined;
    let disposed = false;
    let lastDistance = -1;
    let lastRunning = false;
    let lastAvailable = -1;
    const measure = () => {
      if (disposed) return;
      const width = original.scrollWidth;
      onMeasure?.(width, container.clientWidth);
      const running = active && !reducedMotion.matches && container.clientWidth > 0 && width > container.clientWidth + 1;
      const distance = width + 48;
      if (distance === lastDistance && running === lastRunning && container.clientWidth === lastAvailable) return;
      lastDistance = distance;
      lastAvailable = container.clientWidth;
      lastRunning = running;
      animation?.cancel();
      repeated.hidden = !running;
      container.dataset.scrolling = String(running);
      if (running) {
        animation = line.animate([
          { transform: 'translate3d(0, 0, 0)' },
          { transform: `translate3d(-${distance}px, 0, 0)` },
        ], { duration: distance / subtitleScrollSpeed(width, container.clientWidth) * 1000, delay: scrollDelay, iterations: Infinity, easing: 'linear' });
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(original);
    reducedMotion.addEventListener('change', measure);
    void container.ownerDocument.fonts.ready.then(measure);
    measure();
    return () => {
      disposed = true;
      animation?.cancel();
      observer.disconnect();
      reducedMotion.removeEventListener('change', measure);
    };
  }, [text, active, onMeasure]);

  return <div ref={viewport} className="trophy-styles-subtitle" title={text} aria-label={text}
    style={{ fontSize: 24, lineHeight: '32px', color: '#a8a9a9', marginTop: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
    <span ref={track} className="trophy-styles-subtitle-track" style={{ display: 'inline-flex', whiteSpace: 'nowrap', width: 'max-content' }}>
      <span ref={content}>{text}</span>
      <span ref={copy} aria-hidden="true" hidden style={{ paddingLeft: 48 }}>{text}</span>
    </span>
  </div>;
}
