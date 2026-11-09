'use client';
import { FONTS, PALETTES, useSettings } from '@/lib/settings';

function Swatch({ p }: { p: (typeof PALETTES)[number] }) {
  return (
    <svg viewBox="0 0 120 64" className="st-swatch" aria-hidden>
      <rect width="120" height="64" fill={p.bg} />
      <path d="M14 46 L60 24 L106 46 L60 62 Z" fill={p.mat} stroke={p.ink} strokeWidth="1.4" />
      <rect x="8" y="8" width="46" height="22" rx="5" fill={p.paper} stroke={p.ink} strokeWidth="1.4" />
      <rect x="14" y="14" width="26" height="3" rx="1.5" fill={p.ink} /><rect x="14" y="21" width="34" height="2.5" rx="1.2" fill={p.ink} opacity=".35" />
      <rect x="72" y="10" width="38" height="14" rx="7" fill={p.accent} stroke={p.ink} strokeWidth="1.4" />
    </svg>
  );
}

export function PaletteCards() {
  const settings = useSettings(s => s.settings), set = useSettings(s => s.set);
  return (
    <div className="st-grid">
      {PALETTES.map(p => (
        <button key={p.id} className={`st-card ${settings.palette === p.id ? 'on' : ''}`} onClick={() => set({ palette: p.id })} aria-pressed={settings.palette === p.id}>
          <Swatch p={p} />
          <b>{p.name}{settings.palette === p.id ? ' ✓' : ''}</b>
          <small>{p.note}</small>
        </button>
      ))}
    </div>
  );
}

export function FontCards() {
  const settings = useSettings(s => s.settings), set = useSettings(s => s.set);
  return (
    <div className="st-fonts">
      {FONTS.map(f => (
        <button key={f.id} className={`st-card st-font ${settings.font === f.id ? 'on' : ''}`} onClick={() => set({ font: f.id })} aria-pressed={settings.font === f.id}>
          <span className="st-sample" style={{ fontFamily: f.ui }}>A resistor limits current: V = I × R, so 9 V across 1 kΩ gives 9 mA. Il1 O0</span>
          <b>{f.name}{settings.font === f.id ? ' ✓' : ''}</b>
          <small>{f.note}</small>
        </button>
      ))}
    </div>
  );
}
