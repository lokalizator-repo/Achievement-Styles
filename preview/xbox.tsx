import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Achievement } from '../frontend/card';
import { XboxCard, drawXboxCard } from '../frontend/xbox-card';
import { XboxColorPicker } from '../frontend/xbox-color-picker';
import { defaultXboxColor, normalizeXboxColor } from '../frontend/xbox-colors';
import { updatePresentation, usePresentation } from '../frontend/presentation';
import { xboxTimelines, type XboxVariant } from '../frontend/xbox-animation';
import { sampleAchievement } from '../frontend/sample-achievement';
export { drawXboxCard } from '../frontend/xbox-card';

const examples: Array<Achievement & { xboxVariant: XboxVariant }> = (['normal', 'rare', 'mythic'] as const)
  .map(xboxVariant => ({ ...sampleAchievement, xboxVariant }));
let color = defaultXboxColor;

export function setColor(value: string) {
  color = normalizeXboxColor(value);
  updatePresentation('xboxColor', color);
}

export function renderAt(kind: XboxVariant, time: number) {
  const canvas = document.querySelector<HTMLCanvasElement>(`[data-xbox-variant="${kind}"] canvas`);
  const context = canvas?.getContext('2d');
  const example = examples.find(item => item.xboxVariant === kind);
  if (!context || !example) return;
  const headline = kind === 'mythic' ? 'Mythic achievement unlocked' : kind === 'rare' ? 'Rare achievement unlocked' : 'Achievement unlocked';
  const description = kind === 'mythic' ? 'Game complete' : example.description ?? '';
  drawXboxCard(context, kind, time, [headline, example.strName, description], xboxTimelines[kind].hide, example.xboxGamerscore, color);
}

function Preview() {
  const { xboxColor } = usePresentation();
  const [iteration, setIteration] = useState(0);
  return <main style={{ width: 672, maxWidth: '100%', margin: '0 auto', paddingTop: 24 }}>
    <header style={{ padding: '0 12px 20px' }}>
      <h1 style={{ fontSize: 26, fontWeight: 400, margin: '0 0 18px' }}>Xbox Series X|S</h1>
      <XboxColorPicker value={xboxColor} onChange={setColor} />
      <button onClick={() => setIteration(value => value + 1)} style={{ color: '#fff', background: '#ffffff15', border: '1px solid #ffffff50', padding: '9px 16px', borderRadius: 5, cursor: 'pointer' }}>Replay animations</button>
    </header>
    {examples.map(example => <section key={example.xboxVariant}>
      <h2 style={{ margin: '12px 24px 0', fontSize: 20, fontWeight: 400, textTransform: 'capitalize' }}>{example.xboxVariant}</h2>
      <XboxCard achievement={{ ...example, motionKey: `preview-${example.xboxVariant}-${iteration}` }} />
    </section>)}
  </main>;
}

updatePresentation('language', 'en');
createRoot(document.getElementById('root')!).render(<Preview />);
