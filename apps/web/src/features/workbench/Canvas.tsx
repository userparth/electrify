'use client';
import { GRID, getPart, type Live, type Props } from '@eb/parts';
import { memo, useMemo, useRef, useState } from 'react';
import { placedPins, type Inst, type PlacedPin } from './model';
import { runner, useBench } from './store';

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

export function Canvas() {
  const doc = useBench(s => s.doc), sel = useBench(s => s.sel), view = useBench(s => s.view), live = useBench(s => s.live), volts = useBench(s => s.volts);
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<null | { kind: 'part'; id: string; dx: number; dy: number; moved: boolean } | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number } | { kind: 'wire'; from: PlacedPin; x: number; y: number } | { kind: 'end'; wire: string; end: 'a' | 'b'; orig: string; x: number; y: number }>(null);
  const [hover, setHover] = useState<PlacedPin | null>(null);

  const pins = useMemo(() => doc.parts.flatMap(placedPins), [doc.parts]);
  const pinAt = useMemo(() => new Map(pins.map(p => [p.key, p])), [pins]);
  const order = useMemo(() => [...doc.parts].sort((a, b) => (a.type === 'breadboard' ? -1 : 0) - (b.type === 'breadboard' ? -1 : 0)), [doc.parts]);

  const world = (e: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.x) / view.zoom / GRID, y: (e.clientY - r.top - view.y) / view.zoom / GRID };
  };
  const nearestPin = (wx: number, wy: number, except?: string) => {
    let best: PlacedPin | null = null, bd = SNAP_PX / GRID / Math.max(view.zoom, 0.5);
    for (const p of pins) { if (p.key === except) continue; const d = Math.hypot(p.x - wx, p.y - wy); if (d < bd) { bd = d; best = p; } }
    return best;
  };
  const act = (id: string, patch: Props) => useBench.getState().setProps(id, patch, true);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || e.altKey) { setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }); svg.current!.setPointerCapture(e.pointerId); return; }
    const t = e.target as Element, w = world(e);
    const pinEl = t.closest('[data-pin]'), partEl = t.closest('[data-part]'), wireEl = t.closest('[data-wire]'), endEl = t.closest('[data-end]');
    if (t.closest('[data-interactive]')) return;
    if (endEl && !e.shiftKey) {
      const [wid, end] = endEl.getAttribute('data-end')!.split('|') as [string, 'a' | 'b'], wire = doc.wires.find(x => x.id === wid);
      if (wire) { useBench.getState().select({ kind: 'wire', id: wid }); setDrag({ kind: 'end', wire: wid, end, orig: wire[end], x: w.x, y: w.y }); svg.current!.setPointerCapture(e.pointerId); return; }
    }
    if (pinEl || (endEl && e.shiftKey)) {
      const p = pinEl ? pinAt.get(pinEl.getAttribute('data-pin')!) : nearestPin(w.x, w.y);
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

  const net = runner.built?.net, hoverNet = hover ? net?.get(hover.key) : undefined;
  const hot = hoverNet ? pins.filter(p => net?.get(p.key) === hoverNet) : [];
  const fmtV = (k: string) => volts[k] != null ? `${volts[k]!.toFixed(volts[k]! < 10 ? 3 : 2)} V` : 'not connected';

  return (
    <div className="wb-canvas">
      <svg ref={svg} width="100%" height="100%" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={() => !drag && setHover(null)} onWheel={onWheel} onDragOver={e => e.preventDefault()} onDrop={onDrop} style={{ touchAction: 'none', cursor: drag?.kind === 'pan' ? 'grabbing' : 'default' }}>
        <defs>
          <pattern id="dots" width={GRID * view.zoom} height={GRID * view.zoom} patternUnits="userSpaceOnUse" x={view.x} y={view.y}><circle cx={1} cy={1} r={0.9} fill="#d8d0bd" /></pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dots)" />
        <g transform={`translate(${view.x},${view.y}) scale(${view.zoom})`}>
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
      </svg>
    </div>
  );
}

