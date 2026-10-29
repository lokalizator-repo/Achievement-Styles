type Phase = 'enter' | 'exit';
interface MotionData {
  className?: string;
  contentClassName?: string;
  appid?: () => number;
  achievement_id?: () => string;
}

interface MotionSurface {
  element: HTMLElement;
  onPhase?: (phase: Phase) => void;
}

const surfaces = new Map<string, Set<MotionSurface>>();
const phases = new Map<string, Phase>();

export const motionStyles = `
  @keyframes trophy-enter {
    from { opacity: 0; transform: translate3d(28px, 0, 0); }
    to { opacity: 1; transform: translate3d(0, 0, 0); }
  }
  @keyframes trophy-exit {
    from { opacity: 1; transform: translate3d(0, 0, 0); }
    to { opacity: 0; transform: translate3d(18px, 0, 0); }
  }
  @keyframes trophy-ring {
    0% { opacity: 0; transform: scale(.7); }
    18% { opacity: .85; }
    82%, 100% { opacity: 0; transform: scale(1.05); }
  }
  .trophy-styles-platinum-figure { width: 100%; height: 100%; position: relative; }
  .trophy-styles-platinum-animation {
    position: absolute; width: 90px; height: 104px; left: -13px; top: -20px; object-fit: contain;
  }
  .trophy-styles-platinum-poster { width: 100%; height: 100%; object-fit: contain; }
  .trophy-styles-popup-card[data-notification-style="ps5"] { opacity: 0; will-change: transform, opacity; }
  .trophy-styles-popup-card[data-notification-style="ps5"][data-trophy-phase="enter"] {
    animation: trophy-enter 320ms cubic-bezier(.16, 1, .3, 1) both;
  }
  .trophy-styles-popup-card[data-notification-style="ps5"][data-trophy-phase="exit"] {
    animation: trophy-exit 220ms cubic-bezier(.4, 0, 1, 1) both;
  }
  .trophy-styles-badge { position: relative; }
  .trophy-styles-badge::after {
    content: ''; position: absolute; inset: 0; border: 3px solid #d4d5cc;
    border-radius: 50%; opacity: 0; pointer-events: none;
  }
  .trophy-styles-popup-card[data-notification-style="ps5"][data-trophy-phase="enter"] .trophy-styles-badge::after,
  .trophy-styles-card:not(.trophy-styles-popup-card) .trophy-styles-badge::after {
    animation: trophy-ring 1200ms ease-out 300ms infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .trophy-styles-popup-card[data-notification-style="ps5"][data-trophy-phase="enter"] { animation: none; opacity: 1; transform: none; }
    .trophy-styles-popup-card[data-notification-style="ps5"][data-trophy-phase="exit"] { animation: none; opacity: 0; }
    .trophy-styles-card .trophy-styles-badge::after { animation: none !important; }
  }
`;

export function registerPopupMotion(key: string, element: HTMLElement, onPhase?: (phase: Phase) => void) {
  let elements = surfaces.get(key);
  if (!elements) surfaces.set(key, elements = new Set());
  const surface = { element, onPhase };
  elements.add(surface);
  const phase = phases.get(key);
  if (phase) {
    element.dataset.trophyPhase = phase;
    onPhase?.(phase);
  }
  return () => {
    elements.delete(surface);
    if (!elements.size) {
      surfaces.delete(key);
      phases.delete(key);
    }
  };
}

export function notificationKey(notification: { data?: MotionData }) {
  const data = notification.data;
  const isCustom = ['trophy-styles-test-toast', 'trophy-styles-completion-toast'].includes(data?.className?.split(' ')[0] ?? '');
  return isCustom ? data?.contentClassName ?? data?.className?.split(' ')[1] ?? 'test'
    : typeof data?.appid === 'function' && typeof data.achievement_id === 'function'
      ? `${data.appid()}:${data.achievement_id()}` : undefined;
}

export function syncPopupMotion(notification: { data?: MotionData }, state: number | undefined) {
  if (state === undefined) return;
  const key = notificationKey(notification);
  if (!key) return;
  const phase = state === 3 || state === 4 ? 'exit' : 'enter';
  if (phases.get(key) === phase) return;
  phases.set(key, phase);
  if (phases.size > 64) phases.delete(phases.keys().next().value!);
  for (const { element, onPhase } of surfaces.get(key) ?? []) {
    element.dataset.trophyPhase = phase;
    onPhase?.(phase);
  }
}
