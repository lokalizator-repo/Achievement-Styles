import animation from '../resources/xbox/animation.json';
import consoleSources from '../resources/xbox/console-sources.json';

export type XboxVariant = 'normal' | 'rare' | 'mythic';
interface Easing { t: string; k?: number; a?: number; m: string }
interface Keyframe { t: number; v: number; k: string; s?: number[]; e?: Easing }
interface Track { el: string; prop: string; begin: number; kf?: Keyframe[]; from?: number; to?: number; dur?: number; rep?: number; rev?: boolean; e?: Easing }
interface Board { begin?: number; speed?: number; rep?: number; tracks: Track[] }
export interface Flipbook { FrameCount: string; FrameWidth: string; FrameHeight: string; DesiredFrameRate: string; hold?: number[]; rep?: number; Boomerang?: string }
interface Panel { states: Record<string, Board>; boards: Record<string, Board>; flipbooks: Record<string, Flipbook> }
interface Leaf { d: string; cx: number; cy: number; r0: number; r1: number; tx: number; ty: number; s1: number; in: number[]; out: number[]; hide: number }
interface Laurel { stem: { d: string; w: number; cx: number; cy: number; in: number[]; out: number[] }; leaves: Leaf[] }
const spec = animation as unknown as { enhanced: Panel; gleam: Panel; aurora: Panel; laurel: Record<string, Laurel> };
export const xboxTimelines = {
  normal: { panel: 'enhanced', hide: 6.2, rotate: 4, end: 8.4 },
  rare: { panel: 'gleam', hide: 6.8, rotate: 4.2, end: 9 },
  mythic: { panel: 'aurora', hide: 8.6, rotate: 5.2, end: 10.8 },
} as const;

export function xboxHideAt(kind: XboxVariant, duration?: number | string) {
  return Math.max(xboxTimelines[kind].hide, typeof duration === 'number' ? duration - 2.2 : 0);
}

export function cubicBezier(x: number, points: number[]) {
  const [x1, y1, x2, y2] = points;
  const sample = (t: number, first: number, second: number) => 3 * (1 - t) ** 2 * t * first + 3 * (1 - t) * t ** 2 * second + t ** 3;
  let low = 0, high = 1;
  for (let i = 0; i < 18; i++) {
    const t = (low + high) / 2;
    if (sample(t, x1, x2) < x) low = t; else high = t;
  }
  return sample((low + high) / 2, y1, y2);
}

function ease(progress: number, easing?: Easing, spline?: number[]) {
  const p = Math.max(0, Math.min(1, progress));
  if (spline) return cubicBezier(p, spline);
  if (!easing) return p;
  const inside = (q: number) => easing.t === 'exp' ? Math.expm1((easing.k ?? 7) * q) / Math.expm1(easing.k ?? 7)
    : easing.t === 'back' ? q ** 3 - q * (easing.a ?? 0) * Math.sin(Math.PI * q) : q;
  return easing.m === 'EaseIn' ? inside(p) : easing.m === 'EaseOut' ? 1 - inside(1 - p)
    : p < 0.5 ? inside(p * 2) / 2 : 1 - inside((1 - p) * 2) / 2;
}

function valueAt(track: Track, time: number, from: number, base: number) {
  const t = time - track.begin;
  if (t < 0) return;
  if (track.kf) {
    let previousTime = 0, previous = from;
    for (const key of track.kf) {
      if (t < key.t) return key.k === 'd' ? previous
        : previous + (key.v - previous) * ease((t - previousTime) / Math.max(0.00001, key.t - previousTime), key.e, key.s);
      previous = key.v;
      previousTime = key.t;
    }
    return previous;
  }
  const duration = track.dur ?? 0;
  if (!duration) return track.to ?? from;
  const cycle = duration * (track.rev ? 2 : 1), repeats = track.rep ?? 1;
  const start = track.from ?? from, end = track.to ?? base;
  if (repeats >= 0 && t >= cycle * repeats) return track.rev ? start : end;
  const fraction = t % cycle / duration;
  return start + (end - start) * ease(fraction > 1 ? 2 - fraction : fraction, track.e);
}

type Values = Record<string, Record<string, number>>;
const defaults: Values = {
  ToastBackground: { sx: 0 }, DropshadowGrid: { sx: 0, op: 0, vis: 0 }, TextGrid: { op: 0 }, BackText: { ty: 100 },
  IconIntroSequence: { op: 0 }, IconAmbientLoopSequence: { op: 0 }, IconExitLoopSequence: { op: 0 },
  ImageBackgroundGrid: { op: 0, vis: 0 }, GleamRectangle: { tx: -100, vis: 0 },
  AuroraFlipBook: { op: 0 }, GlowLayer: { op: 0 }, RippleImage: { op: 0, sx: 0, sy: 0 }, PulseImage: { op: 0 }, PulseImageDelayed: { op: 0 },
  ...Object.fromEntries(['LightRippleEllipse', 'MediumRippleEllipse', 'DarkRippleEllipse', 'MediumRippleEllipse2'].map(name => [name, { sx: 0, sy: 0, vis: 0 }])),
  ...Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`Sparkle${i + 1}`, { op: 0, sx: 0.3, sy: 0.3 }])),
};
const defaultValue = (name: string, prop: string) => defaults[name]?.[prop] ?? (['sx', 'sy', 'op', 'vis'].includes(prop) ? 1 : 0);

export function xboxFrameState(kind: XboxVariant, time: number, width: number, hideAt = xboxTimelines[kind].hide as number) {
  const panel = spec[xboxTimelines[kind].panel], values: Values = {};
  const apply = (board: Board | undefined, at: number, offset = 0) => {
    if (!board || at < offset) return;
    const local = (at - offset - (board.begin ?? 0)) * (board.speed ?? 1);
    if (local < 0) return;
    const duration = Math.max(0, ...board.tracks.map(track => track.begin + (track.kf?.[track.kf.length - 1]?.t ?? (track.dur ?? 0) * (track.rev ? 2 : 1) * Math.max(1, track.rep ?? 1))));
    const looped = (board.rep ?? 1) > 1 && duration > 0 && local < duration * (board.rep ?? 1) ? local % duration : local;
    for (const original of board.tracks) {
      let track = original;
      if (kind === 'normal' && board === panel.states.Show && ['ToastBackground', 'ImageGrid', 'TextGrid'].includes(track.el) && track.kf) {
        const timing: Record<number, number> = { 1.333: 1.3, 1.433: 1.3, 1.733: 1.4, 2.333: 1.9, 2.433: 1.9 };
        track = { ...track, kf: track.kf.map(key => ({ ...key, t: timing[key.t] ?? key.t })) };
      }
      if (track.el === 'ImageGrid' && track.prop === 'tx' && track.kf && board === panel.states.Show) {
        track = { ...track, kf: track.kf.map((key, index, keys) => index === keys.length - 1 ? { ...key, v: -(width / 2 + 15) } : key) };
      }
      const base = defaultValue(track.el, track.prop), from = values[track.el]?.[track.prop] ?? base;
      const value = valueAt(track, looped, from, base);
      if (value !== undefined) (values[track.el] ??= {})[track.prop] = value;
    }
  };
  const active = Math.min(time, hideAt);
  apply(panel.states.Show, active);
  if (kind === 'mythic') {
    apply(panel.boards.GlowAnimation, active);
    apply(panel.boards.RippleAnimation, active);
    apply(panel.boards.PulseAnimation, active, 0.7);
    apply(panel.boards.GleamAnimation, active);
    if (active >= 4) { (values.IconIntroSequence ??= {}).op = 0; (values.IconAmbientLoopSequence ??= {}).op = 1; }
  } else if (kind === 'rare') apply(panel.boards.GleamAnimation, active, 2.631);
  apply(panel.states.RotateMessages, active, xboxTimelines[kind].rotate);
  if (time >= hideAt) apply(panel.states.Hide, time, hideAt);
  return (name: string, prop: string) => values[name]?.[prop] ?? defaultValue(name, prop);
}

export function xboxFlipbook(kind: XboxVariant, name: string) {
  if (kind !== 'mythic') {
    const phase = name === 'IconIntroSequence' ? 'Intro' : name === 'IconAmbientLoopSequence' ? 'Idle' : name === 'IconExitLoopSequence' ? 'Outro' : undefined;
    if (phase) {
      const key = `${kind === 'rare' ? 'ConsoleDiamond' : 'ConsoleTrophy'}${phase}` as keyof typeof consoleSources.assets;
      const source = consoleSources.assets[key];
      return { FrameCount: String(source.frames), FrameWidth: String(source.frameWidth), FrameHeight: String(source.frameHeight),
        DesiredFrameRate: String(source.fps), rep: phase === 'Idle' ? -1 : 1 } as Flipbook;
    }
  }
  return spec[xboxTimelines[kind].panel].flipbooks[name];
}

export function spriteFrame(book: Flipbook, time: number) {
  const count = Number(book.FrameCount), hold = book.hold?.[1] ?? 0;
  const length = book.Boomerang === 'True' ? count * 2 - 2 : count + hold;
  let frame = Math.floor(Math.max(0, time) * (Number(book.DesiredFrameRate) || 30));
  if ((book.rep ?? 1) >= 0) frame = Math.min(frame, length * (book.rep ?? 1) - 1);
  frame %= length;
  if (book.Boomerang === 'True') return frame < count ? frame : 2 * count - 2 - frame;
  if (book.hold) return frame <= book.hold[0] ? frame : frame <= book.hold[0] + hold ? book.hold[0] : frame - hold;
  return frame;
}

export function xboxLaurel(kind: XboxVariant) {
  return spec.laurel[kind === 'mythic' ? '2' : '1'];
}
