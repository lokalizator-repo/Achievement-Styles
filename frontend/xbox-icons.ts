import { cubicBezier } from './xbox-animation';
import { xboxLogoPath } from './xbox-assets';

const trophyPath = 'M33 23H67V43C67 55 61 62 53 64V71H47V64C39 62 33 55 33 43Z';
const basePath = 'M36 69H64V74H69V78H31V74H36ZM40 73V74H60V73Z';
const handlePath = 'M33 29H26V41C26 48 29 52 36 54M67 29H74V41C74 48 71 52 64 54';
let trophy: Path2D | undefined, handles: Path2D | undefined, base: Path2D | undefined, emblem: Path2D | undefined;
type Point = [number, number, number];

export function xboxIconScale(time: number, hideAt: number) {
  if (time < 0.7) return 0;
  if (time < 1.067) return 1.2 * cubicBezier((time - 0.7) / 0.367, [0.52, 0, 0.59, 1]);
  if (time < 1.333) return 1.2 - 0.2 * cubicBezier((time - 1.067) / 0.266, [0.34, 0.05, 0.69, 1]);
  const exit = Math.max(0, Math.min(1, (time - hideAt - 0.767) / 0.6));
  return 1 - Math.expm1(7 * exit) / Math.expm1(7);
}

export function drawXboxTrophy(context: CanvasRenderingContext2D, angle = 0) {
  trophy ??= new Path2D(trophyPath);
  handles ??= new Path2D(handlePath);
  base ??= new Path2D(basePath);
  context.fillStyle = '#ffffff';
  context.strokeStyle = '#ffffff';
  context.lineWidth = 4;
  context.lineJoin = 'miter';
  context.save();
  context.translate(50, 0); context.scale(Math.cos(angle), 1); context.translate(-50, 0);
  context.stroke(handles);
  context.restore();
  context.fill(trophy);
  context.save();
  context.translate(50, 0); context.scale(0.72 + 0.28 * Math.abs(Math.cos(angle)), 1); context.translate(-50, 0);
  context.fill(base, 'evenodd');
  context.restore();
}

export function xboxTrophyPose(time: number, hideAt = Infinity) {
  if (time >= hideAt) {
    const exit = time - hideAt;
    return {
      closing: 1 - Math.max(0, Math.min(1, (exit - 0.18) / 0.18)),
      morph: 1 - Math.max(0, Math.min(1, (exit - 0.1) / 0.08)),
      angle: Math.PI / 2 * Math.max(0, Math.min(1, exit / 0.1)),
    };
  }
  const closing = Math.max(0, Math.min(1, (time - 1.3) / 0.16));
  const morph = Math.max(0, Math.min(1, (time - 1.48) / 0.06));
  const spin = Math.max(0, Math.min(1, (time - 1.54) / 0.34));
  return { closing, morph, angle: spin === 1 ? 0 : -Math.PI * 1.5 * (1 - spin) };
}

export function drawXboxNormalIcon(context: CanvasRenderingContext2D, time: number, hideAt: number) {
  const { closing, morph, angle } = xboxTrophyPose(time, hideAt);
  const scale = time < 0.667 ? 0 : time < 0.917 ? 1.2 * cubicBezier((time - 0.667) / 0.25, [0.2, 0, 0.4, 1])
    : time < 1.1 ? 1.2 - 0.2 * cubicBezier((time - 0.917) / 0.183, [0.2, 0, 0.4, 1]) : xboxIconScale(Math.max(1.333, time), hideAt);
  context.save();
  context.translate(50, 50); context.scale(scale, scale); context.translate(-50, -50);
  if (morph < 1) {
    emblem ??= new Path2D(xboxLogoPath);
    context.save();
    context.globalAlpha *= 1 - morph;
    context.translate(50, 50); context.rotate(-Math.PI / 4 * closing); context.translate(-50, -50);
    context.fillStyle = '#ffffff';
    context.save(); context.translate(19, 19); context.scale(62 / 24, 62 / 24); context.fill(emblem); context.restore();
    context.globalAlpha *= closing;
    context.beginPath(); context.arc(50, 50, 31, 0, Math.PI * 2); context.fill();
    context.restore();
  }
  if (morph > 0) {
    context.save(); context.globalAlpha *= morph;
    drawXboxTrophy(context, angle);
    context.restore();
  }
  context.restore();
}

export function drawXboxDiamond(context: CanvasRenderingContext2D, time: number) {
  const angle = time * Math.PI / (4 * 0.66), cosine = Math.cos(angle), sine = Math.sin(angle);
  const rotate = ([x, y, z]: Point): Point => [x * cosine + z * sine, y, z * cosine - x * sine];
  const ring = (radius: number, depth: number, y: number, offset = 0) => Array.from({ length: 8 }, (_, index) => {
    const theta = index * Math.PI / 4 + Math.PI / 8 + offset;
    return rotate([radius * Math.cos(theta), y, depth * Math.sin(theta)]);
  });
  const table = ring(23, 23, -29), girdle = ring(35, 35, -9), pavilion = ring(17, 17, 16, Math.PI / 8), tip = rotate([0, 39, 0]);
  const faces: Point[][] = [table];
  for (let i = 0; i < 8; i++) {
    const next = (i + 1) % 8;
    const previous = (i + 7) % 8;
    faces.push([table[i], table[next], girdle[i]], [table[next], girdle[next], girdle[i]],
      [girdle[i], girdle[next], pavilion[i]], [girdle[i], pavilion[i], pavilion[previous]], [pavilion[i], pavilion[next], tip]);
  }
  faces.sort((a, b) => b.reduce((sum, point) => sum + point[2], 0) / b.length - a.reduce((sum, point) => sum + point[2], 0) / a.length);
  context.save();
  context.translate(50, 46);
  for (const points of faces) {
    const [a, b, c] = points;
    const u = b.map((value, index) => value - a[index]), v = c.map((value, index) => value - a[index]);
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const center = [0, 1, 2].map(axis => points.reduce((sum, point) => sum + point[axis], 0) / points.length);
    const orientation = Math.sign(normal.reduce((sum, value, axis) => sum + value * center[axis], 0)) || 1;
    const length = Math.hypot(...normal);
    const light = Math.min(1, Math.max(0,
      (-normal[0] * 0.45 - normal[1] * 0.55 - normal[2] * 0.7) * orientation / length,
      (normal[0] * 0.75 + normal[1] * 0.55 - normal[2] * 0.5) * orientation / length));
    const front = Math.max(0, Math.min(1, 0.5 - center[2] / 16));
    const alpha = (0.06 + light * 0.16) * (1 - front) + (0.12 + light ** 2 * 0.85) * front;
    const shade = Math.round(135 + light * 120);
    const projected = points.map(([x, y, z]) => [x * 240 / (240 + z), (y + z * 0.15) * 240 / (240 + z)]);
    context.beginPath();
    projected.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
    context.closePath();
    const gradient = context.createLinearGradient(-25, -30, 25, 40);
    gradient.addColorStop(0, `rgba(${shade},${Math.min(255, shade + 8)},${Math.min(255, shade + 8)},${alpha})`);
    gradient.addColorStop(0.55, `rgba(${shade},${shade},${shade},${alpha * 0.6})`);
    gradient.addColorStop(1, `rgba(255,255,255,${alpha})`);
    context.fillStyle = gradient;
    context.fill();
    context.strokeStyle = `rgba(245,255,255,${0.03 + light * 0.18})`;
    context.lineWidth = 0.35;
    context.stroke();
  }
  context.restore();
}
