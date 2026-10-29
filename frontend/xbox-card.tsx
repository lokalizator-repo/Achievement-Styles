import { useEffect, useRef } from 'react';
import { progressText, type Achievement } from './card';
import { usePresentation } from './presentation';
import { popupLayouts } from './popup-layout';
import { popupScale } from './monitor-scale';
import { xboxImages } from './xbox-assets';
import { defaultXboxColor, xboxTheme } from './xbox-colors';
import { drawXboxDiamond, drawXboxNormalIcon, xboxIconScale } from './xbox-icons';
import { cubicBezier, spriteFrame, xboxFlipbook, xboxFrameState, xboxHideAt, xboxLaurel, xboxTimelines, type XboxVariant } from './xbox-animation';

const images = new Map<string, HTMLImageElement>();
const tintedImages = new Map<string, { color: string; canvas: HTMLCanvasElement }>();
const font = '"Segoe UI Variable Display", "Segoe UI", sans-serif';
const canvasWidth = popupLayouts.xbox.cardWidth, canvasHeight = popupLayouts.xbox.cardHeight;
const sceneWidth = 760, top = 80;
const sceneScale = 0.7, insetX = 70, insetY = 56;

function getImage(name: string) {
  let image = images.get(name);
  if (!image) {
    image = new Image();
    image.src = xboxImages[name];
    images.set(name, image);
  }
  return image;
}

function tintedImage(name: string, color: string) {
  const source = getImage(name);
  const existing = tintedImages.get(name);
  if (existing?.color === color) return existing.canvas;
  if (!source.complete || !source.naturalWidth) return source;
  const canvas = document.createElement('canvas');
  canvas.width = source.naturalWidth; canvas.height = source.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) return source;
  context.drawImage(source, 0, 0);
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  tintedImages.set(name, { color, canvas });
  return canvas;
}

function wrapText(context: CanvasRenderingContext2D, text: string, width: number) {
  const rows: string[] = [];
  let row = '';
  for (const word of text.trim().split(/\s+/)) {
    if (row && context.measureText(`${row} ${word}`).width > width) { rows.push(row); row = ''; }
    for (const character of (row ? ` ${word}` : word)) {
      if (row && context.measureText(row + character).width > width) { rows.push(row); row = ''; }
      row += character;
    }
  }
  if (row) rows.push(row);
  return rows;
}

function drawRows(context: CanvasRenderingContext2D, rows: string[], width: number, y: number, lineHeight: number, time: number, start: number, end: number) {
  const progress = Math.max(0, Math.min(1, (time - start) / Math.max(0.1, end - start)));
  const offset = Math.max(0, rows.length - 2) * lineHeight * progress;
  context.save();
  context.beginPath(); context.rect(0, y - lineHeight / 2, width, lineHeight * 2); context.clip();
  rows.forEach((row, index) => context.fillText(row, 0, y + index * lineHeight - offset));
  context.restore();
}

function featherEdges(context: CanvasRenderingContext2D) {
  context.save();
  context.globalCompositeOperation = 'destination-in';
  for (const vertical of [false, true]) {
    const length = vertical ? canvasHeight : canvasWidth;
    const gradient = context.createLinearGradient(0, 0, vertical ? 0 : length, vertical ? length : 0);
    gradient.addColorStop(0, '#0000'); gradient.addColorStop(24 / length, '#000');
    gradient.addColorStop(1 - 24 / length, '#000'); gradient.addColorStop(1, '#0000');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvasWidth, canvasHeight);
  }
  context.restore();
}

export function drawXboxCard(context: CanvasRenderingContext2D, kind: XboxVariant, time: number, lines: [string, string, string], hideAt: number, gamerscore?: number, color = defaultXboxColor) {
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  if (time >= hideAt + 2.2) return;
  context.save();
  context.translate(insetX, insetY);
  context.scale(sceneScale, sceneScale);
  const theme = xboxTheme(color), accent = theme.accent;
  context.font = `400 22px ${font}`;
  const firstWidth = context.measureText(lines[0]).width;
  context.font = `400 24px ${font}`;
  const scoreWidth = gamerscore === undefined || kind === 'mythic' ? 0 : 27 + context.measureText(`${gamerscore} – `).width;
  const secondWidth = context.measureText(lines[1]).width + scoreWidth;
  context.font = `400 22px ${font}`;
  let descriptionWidth = 224, limit = 454;
  while (descriptionWidth < limit) {
    const middle = Math.floor((descriptionWidth + limit) / 2);
    if (wrapText(context, lines[2], middle).length > 2) descriptionWidth = middle + 1; else limit = middle;
  }
  const width = Math.min(530, Math.max(300, Math.ceil(Math.max(firstWidth, secondWidth, descriptionWidth)) + 76));
  const x = (sceneWidth - width) / 2;
  const state = xboxFrameState(kind, time, width, hideAt);
  const node = (name: string, left: number, y: number, w: number, h: number, draw: () => void) => {
    if (state(name, 'vis') < 0.5 || state(name, 'op') <= 0) return;
    context.save();
    context.translate(left + w / 2 + state(name, 'tx'), y + h / 2 + state(name, 'ty'));
    context.rotate(state(name, 'rot') * Math.PI / 180);
    context.scale(state(name, 'sx'), state(name, 'sy'));
    context.translate(-w / 2, -h / 2);
    context.globalAlpha *= Math.max(0, Math.min(1, state(name, 'op')));
    draw();
    context.restore();
  };
  const image = (name: string, left: number, y: number, w: number, h: number) => {
    const source = getImage(name);
    if (source.complete && source.naturalWidth) {
      context.drawImage(kind === 'mythic' && /^(Mythic|Ripple)/.test(name) ? tintedImage(name, theme.glow) : source, left, y, w, h);
    }
  };
  const sheet = (name: string, file: string, elapsed: number, cx: number, cy: number) => {
    const book = xboxFlipbook(kind, name), source = getImage(file);
    if (!book || !source.complete || !source.naturalWidth) return;
    const frame = spriteFrame(book, elapsed), w = Number(book.FrameWidth), h = Number(book.FrameHeight);
    const columns = Math.floor(source.naturalWidth / w);
    context.save();
    if (kind === 'mythic' && name.endsWith('Base') && theme.saturation > 0.1) context.filter = `sepia(1) saturate(${3 * theme.saturation}) hue-rotate(${theme.hue - 50}deg)`;
    const artwork = name === 'AuroraFlipBook' ? tintedImage(file, theme.glow) : source;
    context.drawImage(artwork, frame % columns * w, Math.floor(frame / columns) * h, w, h, cx - w / 2, cy - h / 2, w, h);
    context.restore();
  };
  context.save();
  context.translate(x, top);
  if (kind === 'mythic') node('AuroraFlipBook', width / 2 - 130, -10, 260, 120, () => {
    context.save(); context.translate(130, 60); context.scale((width + 100) / 146, 100 / 30); context.translate(-130, -60);
    sheet('AuroraFlipBook', 'Aurora.png', time, 130, 60); context.restore();
  });
  node('DropshadowGrid', -55, -5, width + 110, 110, () => {
    image('EnhancedShadowEdge.png', 0, 0, 56, 110);
    image('EnhancedShadowCenter.png', 56, 0, width - 2, 110);
    context.save(); context.translate(width + 110, 0); context.scale(-1, 1); image('EnhancedShadowEdge.png', 0, 0, 56, 110); context.restore();
  });
  node('ToastBackground', -50, 0, width + 100, 100, () => {
    context.beginPath(); context.roundRect(0, 0, width + 100, 100, 50);
    context.fillStyle = theme.dark; context.fill(); context.clip();
    if (kind !== 'normal') node('GleamRectangle', 100, 0, width - 100, 100, () => image('gleam.png', 0, 0, width - 100, 100));
  });
  for (const [index, name] of ['LightRippleEllipse', 'MediumRippleEllipse', 'DarkRippleEllipse', 'MediumRippleEllipse2'].entries()) {
    node(name, width / 2 - 50, 0, 100, 100, () => {
      context.fillStyle = [theme.light, accent, theme.dark, accent][index];
      context.beginPath(); context.arc(50, 50, 50, 0, Math.PI * 2); context.fill();
    });
  }
  context.save(); context.beginPath(); context.rect(68, 0, width - 68, 100); context.clip();
  node('TextGrid', 68, 0, width - 68, 100, () => {
    context.fillStyle = theme.foreground; context.textBaseline = 'middle';
    node('FrontText', 0, 0, width - 68, 100, () => {
      const headlineSize = Math.min(22, 22 * (width - 76) / Math.max(1, firstWidth));
      context.font = `400 ${headlineSize}px ${font}`; context.fillText(lines[0], 0, 28);
      context.font = `400 24px ${font}`;
      const offset = scoreWidth;
      const rows = wrapText(context, lines[1], width - 76 - offset);
      const titleY = rows.length > 1 ? 58 : 69;
      if (gamerscore !== undefined && kind !== 'mythic') {
        context.save(); context.beginPath(); context.arc(10, titleY, 9, 0, Math.PI * 2); context.fill();
        context.fillStyle = accent; context.font = `700 13px ${font}`; context.fillText('G', 5, titleY); context.restore();
        const score = `${gamerscore} – `;
        context.fillText(score, 27, titleY);
      }
      context.save(); context.translate(offset, 0);
      drawRows(context, rows, width - 76 - offset, titleY, 28, time, 2.3, xboxTimelines[kind].rotate - 0.3);
      context.restore();
    });
    node('BackText', 0, 0, width - 68, 100, () => {
      context.font = `400 22px ${font}`;
      const rows = wrapText(context, lines[2], width - 76);
      drawRows(context, rows, width - 76, rows.length > 1 ? 33 : 50, 34, time, xboxTimelines[kind].rotate + 1.1, hideAt - 0.3);
    });
  });
  context.restore();
  node('ImageGrid', width / 2 - 50, 0, 100, 100, () => {
    node('ImageBackgroundGrid', 0, 0, 100, 100, () => { context.fillStyle = accent; context.beginPath(); context.arc(50, 50, 50, 0, Math.PI * 2); context.fill(); });
    if (kind === 'mythic') {
      node('GlowLayer', -65, -65, 230, 230, () => {
        node('GlowImageA', 0, 0, 230, 230, () => image('MythicGlowA.png', 0, 0, 230, 230));
        node('GlowImageB', 0, 0, 230, 230, () => image('MythicGlowB.png', 0, 0, 230, 230));
      });
      for (const name of ['PulseImage', 'PulseImageDelayed']) node(name, -15, -15, 130, 130, () => image('MythicPulse.png', 0, 0, 130, 130));
    }
    if (kind === 'normal') drawXboxNormalIcon(context, time, hideAt);
    if (kind === 'rare') {
      const scale = xboxIconScale(time, hideAt);
      context.save();
      context.translate(50, 50); context.scale(scale, scale); context.translate(-50, -50);
      drawXboxDiamond(context, time);
      context.restore();
    }
    if (kind === 'mythic') for (const [phase, nodeName, start] of [['Intro', 'IconIntroSequence', 0], ['Idle', 'IconAmbientLoopSequence', 4], ['Outro', 'IconExitLoopSequence', hideAt]] as const) {
      node(nodeName, -70, -70, 240, 240, () => {
        const bookName = phase === 'Intro' ? 'IconIntro' : phase === 'Idle' ? 'IconAmbient' : 'IconExit';
        sheet(`${bookName}Base`, `Mythic${phase}.png`, time - start, 120, 120);
        sheet(`${bookName}Highlight`, `Mythic${phase}Highlights.png`, time - start, 120, 120);
      });
    }
    if (kind === 'mythic') {
      const laurel = xboxLaurel(kind), leaving = time >= hideAt;
      const progress = (range: number[]) => {
        const elapsed = leaving ? time - hideAt : time - 0.667;
        return Math.max(0, Math.min(1, (elapsed - range[0]) / Math.max(0.00001, range[1] - range[0])));
      };
      for (const mirrored of [false, true]) {
        context.save(); context.translate(-6, -10);
        if (mirrored) { context.translate(112, 0); context.scale(-1, 1); }
        context.fillStyle = theme.glow; context.strokeStyle = context.fillStyle;
        for (const leaf of laurel.leaves) {
          const p = cubicBezier(progress(leaving ? leaf.out : leaf.in), leaving ? [1, 0, 0.833, 0.833] : [0.167, 0.167, 0, 1]);
          if (time < 0.667 || leaving && time - hideAt >= leaf.hide) continue;
          const scale = leaf.s1 * (leaving ? 1 - p : p), rotation = leaving ? leaf.r1 + (leaf.r0 - leaf.r1) * p : leaf.r0 + (leaf.r1 - leaf.r0) * p;
          context.save(); context.translate(leaf.tx + leaf.cx, leaf.ty + leaf.cy); context.rotate(rotation * Math.PI / 180); context.scale(scale, scale); context.translate(-leaf.cx, -leaf.cy); context.fill(new Path2D(leaf.d)); context.restore();
        }
        const stem = laurel.stem, scale = leaving ? 1 - progress(stem.out) : progress(stem.in);
        if (time >= 0.667 && (!leaving || time - hideAt < stem.out[0])) {
          context.translate(stem.cx, stem.cy); context.scale(scale, scale); context.translate(-stem.cx, -stem.cy); context.lineWidth = stem.w; context.stroke(new Path2D(stem.d));
        }
        context.restore();
      }
    }
    if (kind === 'mythic') node('RippleImage', -50, -50, 200, 200, () => image('Ripple.png', 0, 0, 200, 200));
  });
  if (kind === 'mythic') for (let i = 0; i < 6; i++) node(`Sparkle${i + 1}`, -20 + (width + 20) * i / 5, i % 2 ? 88 : -12, 14, 24, () => image('ShimmerSparkle.png', 0, 0, 14, 24));
  context.restore();
  context.restore();
  featherEdges(context);
}

export function XboxCard({ achievement, popup = false, playing = !popup }: { achievement: Achievement; popup?: boolean; playing?: boolean }) {
  const { t, locale, popupDuration, xboxColor, showProgress } = usePresentation(achievement.appid);
  const canvas = useRef<HTMLCanvasElement>(null);
  const currentFrame = useRef<number | undefined>(undefined);
  const color = useRef(xboxColor);
  color.current = xboxColor;
  const kind = achievement.xboxVariant ?? 'normal';
  const percent = achievement.xboxPercent;
  const headline = t(kind === 'mythic' ? 'Mythic achievement unlocked' : kind === 'rare' ? 'Rare achievement unlocked' : 'Achievement unlocked')
    + (kind === 'rare' && percent !== undefined ? ` - ${percent.toLocaleString(locale, { maximumFractionDigits: 2 })}%` : '');
  const description = kind === 'mythic' ? achievement.completionCount === undefined ? t('Game complete')
    : t(achievement.completionBaseGame ? 'Unlocked all {count} achievements in the original game' : 'Unlocked all {count} Steam achievements', { count: achievement.completionCount })
    : [achievement.description?.trim() || achievement.strName, progressText(achievement, showProgress, t)].filter(Boolean).join(' · ');
  const hideAt = xboxHideAt(kind, popupDuration);
  useEffect(() => {
    const element = canvas.current, context = element?.getContext('2d');
    if (!element || !context) return;
    let stopped = false, frame = 0;
    currentFrame.current = undefined;
    const owner = element.ownerDocument.defaultView ?? window;
    const resize = () => {
      const displayedScale = element.getBoundingClientRect().width / canvasWidth;
      const zoom = popup ? popupScale(achievement.motionKey) : 1;
      const ratio = Math.min(6, Math.max(2, (owner.devicePixelRatio || 1) * Math.max(displayedScale, zoom)));
      const width = Math.ceil(canvasWidth * ratio), height = Math.ceil(canvasHeight * ratio);
      if (element.width === width && element.height === height) return;
      element.width = width; element.height = height;
      context.setTransform(width / canvasWidth, 0, 0, height / canvasHeight, 0, 0);
      if (currentFrame.current !== undefined) drawXboxCard(context, kind, currentFrame.current,
        [headline, achievement.strName, description], hideAt, achievement.xboxGamerscore, color.current);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    owner.addEventListener('resize', resize);
    const ready = Object.keys(xboxImages).map(name => getImage(name).decode().catch(() => {}));
    void Promise.all(ready).then(() => {
      if (stopped || !playing) return;
      const reduced = owner.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let started: number | undefined;
      const draw = (now: number) => {
        if (stopped) return;
        started ??= now;
        const elapsed = (now - started) / 1000;
        const at = reduced ? 3.4 : popup ? elapsed : Math.min(elapsed, hideAt - 0.05);
        currentFrame.current = at;
        drawXboxCard(context, kind, at, [headline, achievement.strName, description], hideAt, achievement.xboxGamerscore, color.current);
        element.dataset.xboxTime = at.toFixed(3);
        if (!reduced && elapsed < (popup ? hideAt + 2.2 : hideAt)) frame = owner.requestAnimationFrame(draw);
      };
      frame = owner.requestAnimationFrame(draw);
    });
    return () => { stopped = true; owner.cancelAnimationFrame(frame); observer.disconnect(); owner.removeEventListener('resize', resize); };
  }, [playing, popup, kind, headline, achievement.strName, description, achievement.xboxGamerscore, achievement.motionKey, hideAt]);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (context && currentFrame.current !== undefined) drawXboxCard(context, kind, currentFrame.current,
      [headline, achievement.strName, description], hideAt, achievement.xboxGamerscore, xboxColor);
  }, [xboxColor]);
  return <div className={`trophy-styles-card trophy-styles-xbox-card${popup ? ' trophy-styles-popup-card' : ''}`}
    data-notification-style="xbox" data-xbox-variant={kind} data-trophy-phase={popup ? 'waiting' : undefined}
    style={{ position: 'relative', width: canvasWidth, height: canvasHeight, background: 'transparent', overflow: 'hidden' }}>
    <canvas ref={canvas} role="img" aria-label={`${headline}. ${achievement.strName}. ${description}`}
      style={{ display: 'block', width: canvasWidth, height: canvasHeight }} />
  </div>;
}
