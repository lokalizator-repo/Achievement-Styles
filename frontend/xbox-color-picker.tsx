import { defaultXboxColor, normalizeXboxColor, xboxPalette } from './xbox-colors';
import { usePresentation } from './presentation';

export function XboxColorPicker({ value, onChange }: { value: unknown; onChange(color: string): void }) {
  const { t } = usePresentation();
  const color = normalizeXboxColor(value);
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 12px 16px' }}>
    <div role="group" aria-label={t('Xbox color palette')} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {xboxPalette.map(item => <button key={item.color} type="button" aria-label={t(item.name)} aria-pressed={color === item.color}
        title={t(item.name)} onClick={() => onChange(item.color)} style={{
          width: 34, height: 34, padding: 0, flex: '0 0 34px', borderRadius: 5, background: item.color, cursor: 'pointer',
          border: color === item.color ? '3px solid #fff' : '2px solid #ffffff40', boxShadow: color === item.color ? '0 0 0 1px #111' : 'none',
          color: '#fff', fontSize: 19, lineHeight: '26px',
        }}>{color === item.color ? '✓' : ''}</button>)}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span>{t('Custom color')}</span>
        <input type="color" aria-label={t('Custom Xbox color')} value={color} onChange={event => onChange(event.target.value)}
          style={{ width: 48, height: 32, padding: 2, border: '1px solid #ffffff50', borderRadius: 4, cursor: 'pointer', background: 'transparent' }} />
      </label>
      <button type="button" onClick={() => onChange(defaultXboxColor)}
        style={{ border: '1px solid #ffffff50', borderRadius: 4, color: 'inherit', background: 'transparent', padding: '6px 10px', cursor: 'pointer' }}>{t('Reset Xbox color')}</button>
    </div>
  </div>;
}
