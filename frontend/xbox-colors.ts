export const defaultXboxColor = '#107c10';

export const xboxPalette = [
  { name: 'Xbox green', color: defaultXboxColor },
  { name: 'Teal', color: '#008272' },
  { name: 'Blue', color: '#0078d7' },
  { name: 'Royal blue', color: '#0037da' },
  { name: 'Purple', color: '#744da9' },
  { name: 'Magenta', color: '#b4009e' },
  { name: 'Pink', color: '#c6007e' },
  { name: 'Red', color: '#c50f1f' },
  { name: 'Orange', color: '#ca5010' },
  { name: 'Brown', color: '#8e562e' },
  { name: 'Gray', color: '#69797e' },
  { name: 'Graphite', color: '#4c4a48' },
] as const;

export function normalizeXboxColor(value: unknown) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : defaultXboxColor;
}

export function xboxTheme(value: unknown) {
  const accent = normalizeXboxColor(value);
  const rgb = [1, 3, 5].map(offset => parseInt(accent.slice(offset, offset + 2), 16));
  const mix = (target: number, amount: number) => '#' + rgb.map(channel => Math.round(channel + (target - channel) * amount).toString(16).padStart(2, '0')).join('');
  const [red, green, blue] = rgb.map(channel => channel / 255);
  const highest = Math.max(red, green, blue), lowest = Math.min(red, green, blue), delta = highest - lowest;
  const hue = !delta ? 0 : 60 * (highest === red ? (green - blue) / delta % 6 : highest === green ? (blue - red) / delta + 2 : (red - green) / delta + 4);
  const saturation = delta ? delta / (1 - Math.abs(highest + lowest - 1)) : 0;
  const luminance = rgb.map(channel => channel / 255).map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
  return { accent, light: mix(255, 0.18), dark: mix(0, 0.2), glow: mix(255, 0.5), foreground: luminance > 0.45 ? '#111111' : '#ffffff', hue: (hue + 360) % 360, saturation };
}
