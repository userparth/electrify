'use client';
import { GRID, getPart, type Live, type Props } from '@eb/parts';
import { memo, useMemo, useRef, useState } from 'react';
import { placedPins, type Inst, type PlacedPin } from './model';
import { runner, useBench } from './store';
import { pending, useGuide } from './guide';

const SNAP_PX = 9;

const PartView = memo(function PartView({ inst, live, selected, act }: { inst: Inst; live: Live | undefined; selected: boolean; act: (id: string, patch: Props) => void }) {
  const def = getPart(inst.type);
  if (!def) return null;
  const props = { ...def.defaults, ...inst.props }, box = def.box(props);
  return (
    <g data-part={inst.id} transform={`translate(${inst.x * GRID},${inst.y * GRID}) rotate(${inst.rot * 90})`} style={{ cursor: 'move' }}>
      <rect x={box.x * GRID} y={box.y * GRID} width={box.w * GRID} height={box.h * GRID} fill="transparent" />
      {def.render({ props, live: live ?? {}, selected, act: patch => act(inst.id, patch as Props) })}
      {selected && <rect x={box.x * GRID - 4} y={box.y * GRID - 4} width={box.w * GRID + 8} height={box.h * GRID + 8} rx={6} fill="none" stroke="#3a6ed6" strokeWidth={1.5} strokeDasharray="5 4" pointerEvents="none" />}
    </g>
  );
});

function wirePath(ax: number, ay: number, bx: number, by: number) {
  const x1 = ax * GRID, y1 = ay * GRID, x2 = bx * GRID, y2 = by * GRID;
  if (ax === bx || ay === by) return `M${x1},${y1} L${x2},${y2}`;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, k = 0.18;
  return `M${x1},${y1} Q${mx - dy * k},${my + dx * k} ${x2},${y2}`;
}

/** Magnifier above the finger while picking a pin in wire mode, so the finger never hides the hole. */
function Loupe({ pick, zoom, from }: { pick: { wx: number; wy: number; cx: number; cy: number; cand: PlacedPin | null }; zoom: number; from: PlacedPin | null }) {
  const R = 66, s = Math.max(2.6, zoom * 2.2), c = pick.cand, left = pick.cx - R, top = Math.max(4, pick.cy - 2 * R - 46);
  return (
    <div className="wb-loupe" style={{ left, top }}>
      <svg width={2 * R} height={2 * R}>
        <defs><clipPath id="wb-loupe-clip"><circle cx={R} cy={R} r={R - 2} /></clipPath></defs>
        <g clipPath="url(#wb-loupe-clip)">
          <rect width={2 * R} height={2 * R} fill="var(--canvas)" />
          <g transform={`translate(${R},${R}) scale(${s}) translate(${-pick.wx * GRID},${-pick.wy * GRID})`}>
            <use href="#wb-world" />
            {c && <circle cx={c.x * GRID} cy={c.y * GRID} r={5.5} fill="#3a6ed644" stroke="#3a6ed6" strokeWidth={1.6} />}
          </g>
          <path d={`M${R - 8},${R} H${R + 8} M${R},${R - 8} V${R + 8}`} stroke="#1d1d1b" strokeWidth={1} opacity={0.5} />
        </g>
        <circle cx={R} cy={R} r={R - 2} fill="none" stroke="#1d1d1b" strokeWidth={2.4} />
      </svg>
      <div className="wb-loupe-label">{c ? `${c.def.name.replace(/\s*\(.*\)$/, '')} · ${c.pin.label}` : 'move onto a pin'}{from && c && from.key !== c.key ? ' ✓' : ''}</div>
    </div>
  );
}

export function Canvas() {
  const doc = useBench(s => s.doc), sel = useBench(s => s.sel), view = useBench(s => s.view), live = useBench(s => s.live), volts = useBench(s => s.volts);
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<null | { kind: 'part'; id: string; dx: number; dy: number; moved: boolean } | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number } | { kind: 'wire'; from: PlacedPin; x: number; y: number } | { kind: 'end'; wire: string; end: 'a' | 'b'; orig: string; x: number; y: number }>(null);
  const [hover, setHover] = useState<PlacedPin | null>(null);
  const wireMode = useBench(s => s.wireMode), wireFrom = useBench(s => s.wireFrom);
  const [pick, setPickState] = useState<{ wx: number; wy: number; cx: number; cy: number; cand: PlacedPin | null } | null>(null);
  // Lifting a finger jitters it, so the pin picked is the one the loupe showed last, not one recomputed at lift-off.
  const pickRef = useRef<typeof pick>(null);
  const setPick = (p: typeof pick) => { pickRef.current = p; setPickState(p); };

  const acts = useGuide(s => s.acts), base = useGuide(s => s.base), playing = useGuide(s => s.playing);
  const glow = playing ? [] : pending(acts, base, doc, (a, b) => !!runner.net.get(a) && runner.net.get(a) === runner.net.get(b)).pins;
  const pins = useMemo(() => doc.parts.flatMap(placedPins), [doc.parts]);
  const pinAt = useMemo(() => new Map(pins.map(p => [p.key, p])), [pins]);
  const order = useMemo(() => [...doc.parts].sort((a, b) => (a.type === 'breadboard' ? -1 : 0) - (b.type === 'breadboard' ? -1 : 0)), [doc.parts]);

  const world = (e: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.x) / view.zoom / GRID, y: (e.clientY - r.top - view.y) / view.zoom / GRID };
  };
  const touch = useRef(false);
  // Fingers are far less precise than a mouse, so pins snap from further away on touch.
  const nearestPin = (wx: number, wy: number, except?: string) => {
    let best: PlacedPin | null = null, bd = SNAP_PX * (touch.current ? 2.4 : 1) / GRID / Math.max(view.zoom, 0.5);
    for (const p of pins) { if (p.key === except) continue; const d = Math.hypot(p.x - wx, p.y - wy); if (d < bd) { bd = d; best = p; } }
    return best;
  };
  const act = (id: string, patch: Props) => useBench.getState().setProps(id, patch, true);
  const pickAt = (e: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect(), w = world(e);
    let cand: PlacedPin | null = null, bd = 26 / GRID / view.zoom;
    for (const p of pins) { const d = Math.hypot(p.x - w.x, p.y - w.y); if (d < bd) { bd = d; cand = p; } }
    return { wx: w.x, wy: w.y, cx: e.clientX - r.left, cy: e.clientY - r.top, cand };
  };

  const fingers = useRef(new Map<number, [number, number]>()), pinch = useRef<{ d: number; mx: number; my: number } | null>(null);
  const pinchNow = () => { const [a, b] = [...fingers.current.values()]; return { d: Math.hypot(a![0] - b![0], a![1] - b![1]) || 1, mx: (a![0] + b![0]) / 2, my: (a![1] + b![1]) / 2 }; };

  const onPointerDown = (e: React.PointerEvent) => {
    touch.current = e.pointerType === 'touch';
    if (touch.current) {
      fingers.current.set(e.pointerId, [e.clientX, e.clientY]);
      if (fingers.current.size === 2) { setDrag(null); setHover(null); pinch.current = pinchNow(); svg.current!.setPointerCapture(e.pointerId); return; }
    }
    if (wireMode && !(e.target as Element).closest('[data-interactive]')) { setPick(pickAt(e)); svg.current!.setPointerCapture(e.pointerId); return; }
    if (e.button === 1 || e.altKey) { setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }); svg.current!.setPointerCapture(e.pointerId); return; }
    const t = e.target as Element, w = world(e);
    const pinEl = t.closest('[data-pin]'), partEl = t.closest('[data-part]'), wireEl = t.closest('[data-wire]'), endEl = t.closest('[data-end]');
    if (t.closest('[data-interactive]')) return;
    if (endEl && !e.shiftKey) {
      const [wid, end] = endEl.getAttribute('data-end')!.split('|') as [string, 'a' | 'b'], wire = doc.wires.find(x => x.id === wid);
      if (wire) { useBench.getState().select({ kind: 'wire', id: wid }); setDrag({ kind: 'end', wire: wid, end, orig: wire[end], x: w.x, y: w.y }); svg.current!.setPointerCapture(e.pointerId); return; }
    }
    const touchPin = touch.current && !pinEl && !endEl ? nearestPin(w.x, w.y) : null;
    if (pinEl || touchPin || (endEl && e.shiftKey)) {
      const p = pinEl ? pinAt.get(pinEl.getAttribute('data-pin')!) : touchPin ?? nearestPin(w.x, w.y);
      if (p) { setDrag({ kind: 'wire', from: p, x: w.x, y: w.y }); svg.current!.setPointerCapture(e.pointerId); return; }
    }
    if (wireEl) { useBench.getState().select({ kind: 'wire', id: wireEl.getAttribute('data-wire')! }); return; }
    if (partEl) {
      const id = partEl.getAttribute('data-part')!, inst = doc.parts.find(p => p.id === id)!;
      useBench.getState().select({ kind: 'part', id });
      setDrag({ kind: 'part', id, dx: inst.x - w.x, dy: inst.y - w.y, moved: false });
      svg.current!.setPointerCapture(e.pointerId);
      return;
    }
    useBench.getState().select(null);
    setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y });
    svg.current!.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (fingers.current.has(e.pointerId)) fingers.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch.current && fingers.current.size === 2) {
      const p0 = pinch.current, p1 = pinchNow(), r = svg.current!.getBoundingClientRect(), mx = p1.mx - r.left, my = p1.my - r.top;
      const v = useBench.getState().view, zoom = Math.min(4, Math.max(0.3, v.zoom * p1.d / p0.d)), k = zoom / v.zoom;
      useBench.getState().setView({ zoom, x: mx - (mx - v.x) * k + p1.mx - p0.mx, y: my - (my - v.y) * k + p1.my - p0.my });
      pinch.current = p1;
      return;
    }
    if (pickRef.current) { setPick(pickAt(e)); return; }
    const w = world(e);
    if (!drag) { setHover(nearestPin(w.x, w.y)); return; }
    if (drag.kind === 'pan') useBench.getState().setView({ x: drag.vx + e.clientX - drag.sx, y: drag.vy + e.clientY - drag.sy });
    if (drag.kind === 'wire') { setDrag({ ...drag, x: w.x, y: w.y }); setHover(nearestPin(w.x, w.y, drag.from.key)); }
    if (drag.kind === 'end') {
      const to = nearestPin(w.x, w.y);
      setDrag({ ...drag, x: w.x, y: w.y }); setHover(to);
      if (to) useBench.getState().rewire(drag.wire, drag.end, to.key, false);
    }
    if (drag.kind === 'part') {
      const nx = Math.round(w.x + drag.dx), ny = Math.round(w.y + drag.dy), inst = doc.parts.find(p => p.id === drag.id);
      if (inst && (nx !== inst.x || ny !== inst.y)) { useBench.getState().movePart(drag.id, nx, ny, !drag.moved); if (!drag.moved) setDrag({ ...drag, moved: true }); }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    fingers.current.delete(e.pointerId);
    if (pinch.current) { if (fingers.current.size < 2) pinch.current = null; setDrag(null); setPick(null); return; }
    if (pickRef.current) { const c = pickRef.current.cand; setPick(null); if (c) useBench.getState().pickWirePin(c.key); return; }
    if (drag?.kind === 'wire') {
      const w = world(e), to = nearestPin(w.x, w.y, drag.from.key);
      if (to) useBench.getState().addWire(drag.from.key, to.key);
    }
    if (drag?.kind === 'end') {
      const w = world(e), to = nearestPin(w.x, w.y);
      useBench.getState().rewire(drag.wire, drag.end, drag.orig, false);
      if (to) useBench.getState().rewire(drag.wire, drag.end, to.key, true);
    }
    setDrag(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    if ((e.target as Element).closest('[data-interactive]')) return;
    const r = svg.current!.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const z = Math.min(4, Math.max(0.3, view.zoom * Math.exp(-e.deltaY * 0.0015)));
    useBench.getState().setView({ zoom: z, x: mx - (mx - view.x) * z / view.zoom, y: my - (my - view.y) * z / view.zoom });
  };

  const onDrop = (e: React.DragEvent) => {
    const type = e.dataTransfer.getData('text/eb-part');
    if (!type) return;
    e.preventDefault();
    const w = world(e);
    useBench.getState().addPart(type, Math.round(w.x), Math.round(w.y));
  };

  const net = runner.net, hoverNet = hover ? net?.get(hover.key) : undefined;
  const hot = hoverNet ? pins.filter(p => net?.get(p.key) === hoverNet) : [];
  const fmtV = (k: string) => volts[k] != null ? `${volts[k]!.toFixed(volts[k]! < 10 ? 3 : 2)} V` : 'not connected';

  return (
    <div className="wb-canvas">
      <svg ref={svg} width="100%" height="100%" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={() => !drag && setHover(null)} onWheel={onWheel} onDragOver={e => e.preventDefault()} onDrop={onDrop} style={{ touchAction: 'none', cursor: drag?.kind === 'pan' ? 'grabbing' : 'default' }}>
        <defs>
          <pattern id="dots" width={GRID * view.zoom} height={GRID * view.zoom} patternUnits="userSpaceOnUse" x={view.x} y={view.y}><circle cx={1} cy={1} r={0.9} fill="var(--dots)" /></pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dots)" />
        <g transform={`translate(${view.x},${view.y}) scale(${view.zoom})`}>
          <g id="wb-world">
          {order.map(inst => <PartView key={inst.id} inst={inst} live={live[inst.id]} selected={sel?.kind === 'part' && sel.id === inst.id} act={act} />)}
          {doc.wires.map(w => {
            const a = pinAt.get(w.a), b = pinAt.get(w.b);
            if (!a || !b) return null;
            const d = wirePath(a.x, a.y, b.x, b.y), on = sel?.kind === 'wire' && sel.id === w.id;
            return (
              <g key={w.id} data-wire={w.id} style={{ cursor: 'pointer' }}>
                <path d={d} fill="none" stroke="transparent" strokeWidth={12} />
                {on && <path d={d} fill="none" stroke="#f3c33b" strokeWidth={9} strokeLinecap="round" />}
                <path d={d} fill="none" stroke="#1d1d1b" strokeWidth={5} strokeLinecap="round" />
                <path d={d} fill="none" stroke={w.color} strokeWidth={3.2} strokeLinecap="round" />
              </g>
            );
          })}
          <g>
            {pins.map(p => <circle key={p.key} data-pin={p.key} cx={p.x * GRID} cy={p.y * GRID} r={p.inst.type === 'breadboard' ? 3.5 : 4.5} fill="transparent" style={{ cursor: 'crosshair' }} />)}
          </g>
          {doc.wires.map(w => {
            const a = pinAt.get(w.a), b = pinAt.get(w.b), on = sel?.kind === 'wire' && sel.id === w.id;
            if (!a || !b) return null;
            return ([['a', a], ['b', b]] as const).map(([end, p]) => <circle key={w.id + end} data-end={`${w.id}|${end}`} cx={p.x * GRID} cy={p.y * GRID} r={on ? 5 : 3.2} fill={w.color} stroke="#1d1d1b" style={{ cursor: 'grab' }} />);
          })}
          {hot.map(p => <circle key={'h' + p.key} cx={p.x * GRID} cy={p.y * GRID} r={4} fill="#f3c33b88" stroke="#c9a23a" strokeWidth={1} pointerEvents="none" />)}
          {drag?.kind === 'wire' && <path d={wirePath(drag.from.x, drag.from.y, hover?.x ?? drag.x, hover?.y ?? drag.y)} fill="none" stroke="#1d1d1b" strokeWidth={3} strokeDasharray="6 5" pointerEvents="none" />}
          {hover && (
            <g transform={`translate(${hover.x * GRID + 10},${hover.y * GRID - 30})`} pointerEvents="none">
              <rect width={Math.max(150, (hover.def.name.length + hover.pin.label.length) * 6 + 20)} height={38} rx={8} fill="#1d1d1b" />
              <text x={8} y={15} fontSize={10} fill="#f2efe7" fontFamily="ui-monospace,Menlo,monospace" fontWeight={700}>{hover.def.name} · {hover.pin.label}</text>
              <text x={8} y={30} fontSize={10} fill="#9be3b4" fontFamily="ui-monospace,Menlo,monospace">{fmtV(hover.key)}{hot.length > 1 ? ` · joined to ${hot.length - 1}` : ''}</text>
            </g>
          )}
          </g>
          {wireFrom && pinAt.get(wireFrom) && (() => { const f = pinAt.get(wireFrom)!, c = pick?.cand; return (
            <g pointerEvents="none">
              {c && c.key !== wireFrom && <path d={wirePath(f.x, f.y, c.x, c.y)} fill="none" stroke="#3a6ed6" strokeWidth={3} strokeDasharray="6 5" strokeLinecap="round" />}
              <circle cx={f.x * GRID} cy={f.y * GRID} r={7} fill="#3a6ed633" stroke="#3a6ed6" strokeWidth={2.5} className="wb-pulse" />
            </g>
          ); })()}
          {glow.map(k => { const p = pinAt.get(k); return p && <circle key={'g' + k} cx={p.x * GRID} cy={p.y * GRID} r={7} fill="#f3c33b55" stroke="#e0a400" strokeWidth={2.5} className="wb-pulse" pointerEvents="none" />; })}
        </g>
      </svg>
      {pick && <Loupe pick={pick} zoom={view.zoom} from={wireFrom ? pinAt.get(wireFrom) ?? null : null} />}
    </div>
  );
}

