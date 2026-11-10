'use client';
import { PARTS, formatSI, getPart, parseSI, type Category, type PropDef } from '@eb/parts';
import { useState } from 'react';
import { EXAMPLES } from './examples';
import { useBench } from './store';
import { pending, useGuide } from './guide';
import { buildAnimated } from './Demo';
import { t } from '@/lib/i18n';

const CATS: Category[] = ['Microcontrollers', 'Instruments', 'Boards', 'Power', 'Passive', 'Semiconductors', 'Switches', 'Digital ICs', 'Output'];

/** Drops a new part in the middle of what the user is looking at. */
export function addAtCenter(type: string) {
  const st = useBench.getState(), el = document.querySelector('.wb-canvas');
  if (st.view3d) {
    const xs = st.doc.parts.map(p => p.x), ys = st.doc.parts.map(p => p.y);
    const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0, cy = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
    return st.addPart(type, Math.round(cx), Math.round(cy + 4));
  }
  const w = el?.clientWidth ?? 600, h = el?.clientHeight ?? 400, { view } = st;
  return st.addPart(type, Math.round((w / 2 - view.x) / view.zoom / 12), Math.round((h / 2 - view.y) / view.zoom / 12));
}

export function Palette({ onPick }: { onPick?: (type: string) => void } = {}) {
  const [q, setQ] = useState('');
  const add = (type: string) => { addAtCenter(type); onPick?.(type); };
  const list = PARTS.filter(p => !q || `${p.name} ${p.blurb} ${p.type}`.toLowerCase().includes(q.toLowerCase()));
  const doc = useBench(s => s.doc), acts = useGuide(s => s.acts), base = useGuide(s => s.base), need = pending(acts, base, doc, () => false).types;
  const item = (p: (typeof PARTS)[number], glow = false) => (
    <div key={p.type} data-type={p.type} className={`wb-pal ${glow ? 'glow' : ''}`} draggable onDragStart={e => { e.dataTransfer.setData('text/eb-part', p.type); e.dataTransfer.effectAllowed = 'copy'; }} onDoubleClick={() => add(p.type)} onClick={onPick ? () => add(p.type) : undefined} title={onPick ? 'Tap to add' : 'Drag onto the bench, or double-click'}>
      <b>{p.name}</b><small>{p.blurb}</small>
    </div>
  );
  return (
    <aside className="wb-palette">
      {need.length > 0 && <div className="wb-need"><div className="wb-cat">{t('demo.forStep')}</div>{PARTS.filter(p => need.includes(p.type)).map(p => item(p, true))}</div>}
      <input className="wb-search" placeholder="Search parts…" value={q} onChange={e => setQ(e.target.value)} />
      {CATS.map(cat => {
        const items = list.filter(p => p.category === cat);
        if (!items.length) return null;
        return (
          <div key={cat}>
            <div className="wb-cat">{cat}</div>
            {items.map(p => item(p))}
          </div>
        );
      })}
    </aside>
  );
}

function PropField({ id, def, value }: { id: string; def: PropDef; value: unknown }) {
  const set = (v: string | number | boolean) => useBench.getState().setProps(id, { [def.key]: v });
  const [text, setText] = useState<string | null>(null);
  if (def.type === 'select') return <label>{def.label}<select value={String(value)} onChange={e => set(e.target.value)}>{def.options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>;
  if (def.type === 'bool') return <label className="wb-check"><input type="checkbox" checked={!!value} onChange={e => set(e.target.checked)} /> {def.label}</label>;
  if (def.type === 'range') return <label>{def.label} <b>{String(value)}{def.unit ?? ''}</b><input type="range" min={def.min} max={def.max} step={def.step} value={Number(value)} onChange={e => useBench.getState().setProps(id, { [def.key]: +e.target.value }, true)} /></label>;
  const shown = text ?? (def.si ? formatSI(Number(value), '') : String(value));
  return (
    <label>{def.label}{def.unit ? ` (${def.unit})` : ''}
      <input value={shown} onChange={e => setText(e.target.value)} onBlur={() => {
        if (text == null) return;
        const v = def.si ? parseSI(text) : parseFloat(text);
        if (v != null && isFinite(v) && (def.min == null || v >= def.min) && (def.max == null || v <= def.max)) set(v);
        setText(null);
      }} onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    </label>
  );
}

export function Inspector() {
  const sel = useBench(s => s.sel), doc = useBench(s => s.doc), live = useBench(s => s.live);
  if (!sel) return <div className="wb-card"><div className="wb-k">Nothing selected</div>Drag a part from the left. Drag from any pin to another pin to make a wire; drag a wire's end to move it (Shift-drag to start a new wire there). Scroll to zoom, drag empty space to pan.</div>;
  if (sel.kind === 'wire') {
    const w = doc.wires.find(x => x.id === sel.id);
    if (!w) return null;
    return (
      <div className="wb-card">
        <div className="wb-k">Jumper wire</div>
        <div className="wb-row">{['#d6452f', '#1d1d1b', '#3a6ed6', '#3fae66', '#f3c33b', '#ef8a2b', '#8b5cc7', '#f6f4ee'].map(c => <button key={c} className="wb-sw" style={{ background: c }} onClick={() => { const d = useBench.getState().doc; useBench.getState().commit({ ...d, wires: d.wires.map(x => x.id === w.id ? { ...x, color: c } : x) }); }} />)}</div>
        <button className="btn" onClick={() => useBench.getState().remove(sel)}>Delete wire <kbd>Del</kbd></button>
      </div>
    );
  }
  const inst = doc.parts.find(p => p.id === sel.id), def = inst && getPart(inst.type);
  if (!inst || !def) return null;
  const props = { ...def.defaults, ...inst.props }, lv = live[inst.id] ?? {};
  return (
    <div className="wb-card">
      <div className="wb-k">{def.name}</div>
      {def.props.map(p => <PropField key={p.key + inst.id} id={inst.id} def={p} value={props[p.key]} />)}
      {Object.keys(lv).length > 0 && <table className="wb-live"><tbody>{Object.entries(lv).filter(([, v]) => !Array.isArray(v)).map(([k, v]) => <tr key={k}><td>{k}</td><td>{typeof v === 'number' ? formatSI(v, '', 4) : String(v)}</td></tr>)}</tbody></table>}
      <div className="wb-row">
        <button className="btn" onClick={() => useBench.getState().rotate(inst.id)}>Rotate <kbd>R</kbd></button>
        <button className="btn" onClick={() => useBench.getState().remove(sel)}>Delete <kbd>Del</kbd></button>
      </div>
      {def.info && <table className="wb-info"><tbody>{def.info.map(([a, b]) => <tr key={a}><td>{a}</td><td>{b}</td></tr>)}</tbody></table>}
    </div>
  );
}

export function EventLog() {
  const log = useBench(s => s.log);
  return (
    <div className="wb-log">
      {log.length === 0 && <div className="wb-muted">› Events (blown fuses, burnt LEDs, …) show up here.</div>}
      {log.map((l, i) => <div key={i} className={l.e.severity}>[{formatSI(l.t, 's')}] {l.e.message}</div>)}
    </div>
  );
}

const DT: [number, string][] = [[1e-3, '1 ms · DC / slow'], [1e-4, '100 µs · default'], [1e-5, '10 µs · audio'], [1e-6, '1 µs · fast edges']];

export function Toolbar() {
  const running = useBench(s => s.running), dt = useBench(s => s.dt), speed = useBench(s => s.speed), t = useBench(s => s.simTime), past = useBench(s => s.past.length), future = useBench(s => s.future.length);
  const b = useBench.getState(), view3d = useBench(s => s.view3d);
  return (
    <div className="wb-toolbar">
      <div className="wb-seg"><button className={`btn ${!view3d ? 'on' : ''}`} onClick={() => b.setView3d(false)}>2D</button><button className={`btn ${view3d ? 'on' : ''}`} onClick={() => b.setView3d(true)} title="Press V to switch">3D</button></div>
      <button className={`btn ${running ? 'on' : ''}`} onClick={() => b.setRunning(!running)}>{running ? '❚❚ Pause' : '▶ Run'}</button>
      <button className="btn" onClick={() => useBench.getState().setDt(useBench.getState().dt)}>↺ Restart</button>
      <label className="wb-inline">Timestep <select value={dt} onChange={e => b.setDt(+e.target.value)}>{DT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <span className="wb-stat">t = {formatSI(t, 's')}</span>
      <span className={`wb-stat ${speed < 0.5 ? 'bad' : ''}`} title="Simulated seconds per real second">{speed >= 0.995 ? 'real time' : `${(speed * 100).toFixed(speed < 0.1 ? 1 : 0)}% speed`}</span>
      <span className="wb-grow" />
      <button className="btn" disabled={!past} onClick={b.undo}>↶ Undo</button>
      <button className="btn" disabled={!future} onClick={b.redo}>↷ Redo</button>
      <select className="btn" value="" onChange={e => { const ex = EXAMPLES.find(x => x.id === e.target.value); if (ex) buildAnimated(ex.build(), ex.dt); }}>
        <option value="">Examples…</option>
        {EXAMPLES.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      <button className="btn" onClick={() => b.load({ parts: [], wires: [] })}>Clear</button>
    </div>
  );
}
