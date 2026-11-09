'use client';
import { GRID, getPart, resistorBands, type Live, type PartDef, type Props } from '@eb/parts';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { placedPins, type Inst, type PlacedPin } from '../model';
import { runner, useBench } from '../store';

const INK = '#1d1d1b', S = GRID, K = S * Math.sqrt(1.5);
const ISO = { th: Math.PI / 4, ph: Math.atan(1 / Math.SQRT2) };
const BB_H = 2.6;
const LED_HEX: Record<string, string> = { red: '#e0453a', yellow: '#f2c230', green: '#3fae66', blue: '#3a6ed6', white: '#f4f4f4' };
// Body height in grid units (1 = 2.54 mm); parts not listed use their category default.
const HEIGHT: Record<string, number> = {
  breadboard: BB_H, battery: 6, psu: 5, fgen: 4, dmm: 1.6, scope: 5, 'logic-analyzer': 2.4, 'logic-probe': 1.2,
  'arduino-uno': 1.2, rpi4: 1.6, pico: 0.8, 'seven-segment': 2.2, buzzer: 2.6, motor: 3.4, lamp: 3, button: 1.2,
  spdt: 1.2, spst: 1.4, 'logic-switch': 1.2, 'dip-switch-8': 1, pot: 2, fuse: 1.4, inductor: 1.8, 'cap-ceramic': 1.2,
  'charge-controller': 2.2, 'dc-fan': 2.4, router: 2.2, inverter: 3.2, 'dcdc-module': 1, 'usb-phone': 0.8, relay: 2.2,
  'bar-graph': 1.4, 'rgb-led': 2.6, ldr: 0.8, ntc: 0.8, 'ina226-module': 0.8, lm7805: 2.2,
};
// Side colour of the extruded body; the top face is the part's own 2D drawing.
const SIDE: Record<string, string> = {
  breadboard: '#e9e3d4', battery: '#2f2f33', psu: '#c9c2b0', fgen: '#c9c2b0', dmm: '#e2b42a', scope: '#3a4256', 'logic-analyzer': '#2b2d31',
  'arduino-uno': '#1d6f87', rpi4: '#2f7d4f', pico: '#2f7d4f', 'charge-controller': '#3a4256', inverter: '#3a4256', router: '#e9e4d6',
  'dc-fan': '#2b2d31', 'dcdc-module': '#2b6cb0', 'usb-phone': '#2b2d31', 'seven-segment': '#2b2d31', relay: '#3a6ed6', fuse: '#c84030',
};
const heightOf = (def: PartDef) => HEIGHT[def.type] ?? (def.category === 'Digital ICs' ? 1.1 : 1.6);
const sideOf = (def: PartDef) => SIDE[def.type] ?? (def.category === 'Digital ICs' ? '#2b2d31' : '#d9d2c2');

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255];
  return '#' + c.map(v => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)).map(v => v.toString(16).padStart(2, '0')).join('');
}

type V3 = [number, number, number];
/** Orthographic camera: `th` turns around the vertical axis, `ph` is the elevation (true isometric by default). */
interface Cam { cx: number; cy: number; th: number; ph: number; sin: number; cos: number; sp: number; cp: number }
const makeCam = (cx: number, cy: number, th: number, ph: number): Cam => ({ cx, cy, th, ph, sin: Math.sin(th), cos: Math.cos(th), sp: Math.sin(ph), cp: Math.cos(ph) });

/** Ground-plane coordinates as the camera sees them: u runs right, v runs towards the viewer. */
const viewXY = (cam: Cam, x: number, y: number): [number, number] => {
  const dx = x - cam.cx, dy = y - cam.cy;
  return [dx * cam.cos - dy * cam.sin, dx * cam.sin + dy * cam.cos];
};
/** Screen px (scene space, before pan/zoom) back to the world point on the horizontal plane at height z. */
function unproject(cam: Cam, sx: number, sy: number, z: number): [number, number] {
  const u = sx / K, v = (sy / K + z * cam.cp) / cam.sp;
  return [cam.cx + u * cam.cos + v * cam.sin, cam.cy - u * cam.sin + v * cam.cos];
}
function project(cam: Cam, x: number, y: number, z: number): [number, number] {
  const [u, v] = viewXY(cam, x, y);
  return [u * K, (v * cam.sp - z * cam.cp) * K];
}
/** Visible-side test and camera-relative shading for a vertical face with outward normal (nx, ny). */
function faceLook(cam: Cam, nx: number, ny: number): { visible: boolean; lit: number } {
  const l = Math.hypot(nx, ny) || 1, nu = (nx * cam.cos - ny * cam.sin) / l, nv = (nx * cam.sin + ny * cam.cos) / l;
  return { visible: nv > 1e-6, lit: -0.14 - 0.16 * nu };
}

const rotLocal = (rot: number, x: number, y: number): [number, number] => {
  switch (rot & 3) { case 1: return [-y, x]; case 2: return [-x, -y]; case 3: return [y, -x]; default: return [x, y]; }
};

type LocalMap = (lx: number, ly: number) => V3;
const toWorld = (inst: Inst, [x, y, z]: V3): V3 => { const [rx, ry] = rotLocal(inst.rot, x, y); return [inst.x + rx, inst.y + ry, z]; };

/** SVG matrix that paints the part's 2D drawing (local px) onto any plane, given where local grid points land. */
function mapMatrix(cam: Cam, inst: Inst, m: LocalMap) {
  const at = (px: number, py: number) => project(cam, ...toWorld(inst, m(px / GRID, py / GRID)));
  const o = at(0, 0), ex = at(GRID, 0), ey = at(0, GRID);
  return `matrix(${(ex[0] - o[0]) / GRID} ${(ex[1] - o[1]) / GRID} ${(ey[0] - o[0]) / GRID} ${(ey[1] - o[1]) / GRID} ${o[0]} ${o[1]})`;
}

/** SVG matrix that paints the part's 2D drawing (local px) onto a plane in the scene. */
function faceMatrix(cam: Cam, inst: Inst, z: (lx: number, ly: number) => number) {
  const at = (px: number, py: number) => { const lx = px / GRID, ly = py / GRID, [rx, ry] = rotLocal(inst.rot, lx, ly); return project(cam, inst.x + rx, inst.y + ry, z(lx, ly)); };
  const o = at(0, 0), ex = at(GRID, 0), ey = at(0, GRID);
  return `matrix(${(ex[0] - o[0]) / GRID} ${(ex[1] - o[1]) / GRID} ${(ey[0] - o[0]) / GRID} ${(ey[1] - o[1]) / GRID} ${o[0]} ${o[1]})`;
}

const pts = (a: [number, number][]) => a.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

type Box = { x: number; y: number; w: number; h: number };
function footprint(def: PartDef, inst: Inst, props: Props, box?: Box): [number, number][] {
  const b = box ?? def.box(props);
  return [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(([x, y]) => { const [rx, ry] = rotLocal(inst.rot, x!, y!); return [inst.x + rx, inst.y + ry]; });
}

/** Extruded body: visible side faces (lit from the left), then the 2D drawing as the lid. */
function Extrude({ cam, inst, def, props, base, h, top, box }: { cam: Cam; inst: Inst; def: PartDef; props: Props; base: number; h: number; top: ReactNode; box?: Box }) {
  const fp = footprint(def, inst, props, box), side = sideOf(def), faces: ReactNode[] = [], clip = box && `iso-clip-${inst.id}`;
  const sgn = Math.sign((fp[1]![0] - fp[0]![0]) * (fp[2]![1] - fp[1]![1]) - (fp[1]![1] - fp[0]![1]) * (fp[2]![0] - fp[1]![0])) || 1;
  for (let i = 0; i < 4; i++) {
    const a = fp[i]!, b = fp[(i + 1) % 4]!, { visible, lit } = faceLook(cam, sgn * (b[1] - a[1]), -sgn * (b[0] - a[0]));
    if (!visible) continue;
    const quad: [number, number][] = [project(cam, a[0], a[1], base), project(cam, b[0], b[1], base), project(cam, b[0], b[1], base + h), project(cam, a[0], a[1], base + h)];
    faces.push(<polygon key={i} points={pts(quad)} fill={shade(side, lit)} stroke={INK} strokeWidth={1.3} strokeLinejoin="round" />);
  }
  const lid = fp.map(p => project(cam, p[0], p[1], base + h));
  return (
    <g>
      {faces}
      <polygon points={pts(lid)} fill={shade(side, 0.35)} stroke={INK} strokeWidth={1.3} strokeLinejoin="round" />
      <g transform={faceMatrix(cam, inst, () => base + h)}>
        {clip && <clipPath id={clip}><rect x={box.x * GRID} y={box.y * GRID} width={box.w * GRID} height={box.h * GRID} /></clipPath>}
        <g clipPath={clip ? `url(#${clip})` : undefined}>{top}</g>
      </g>
      <polygon points={pts(lid)} fill="none" stroke={INK} strokeWidth={1.3} strokeLinejoin="round" pointerEvents="none" />
    </g>
  );
}

function Shadow({ cam, poly, spread = 0.6 }: { cam: Cam; poly: [number, number][]; spread?: number }) {
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  const grown = poly.map(([x, y]) => [cx + (x - cx) * 1.04 + spread, cy + (y - cy) * 1.04 + spread] as [number, number]);
  return <polygon points={pts(grown.map(p => project(cam, p[0], p[1], 0)))} fill="#1d1d1b" opacity={0.16} filter="url(#iso-soft)" />;
}

/** A lead or wire stroke with an ink edge and a soft highlight, so it reads as a round cable. */
function Cable({ d, color, width }: { d: string; color: string; width: number }) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} stroke={INK} strokeWidth={width + 2.4} />
      <path d={d} stroke={color} strokeWidth={width} />
      <path d={d} stroke="#fff" strokeOpacity={0.35} strokeWidth={Math.max(0.8, width * 0.28)} transform="translate(-0.6,-0.8)" />
    </g>
  );
}

const polyline = (cam: Cam, p: V3[]) => 'M' + p.map(q => project(cam, ...q).map(n => n.toFixed(1)).join(',')).join(' L');

function Resistor({ cam, inst, props, base }: { cam: Cam; inst: Inst; props: Props; base: number }) {
  const span = Number(props.span), L = Math.min(2.6, span - 1), x0 = (span - L) / 2, zt = base + 1.1;
  const w = (lx: number, z: number): V3 => { const [rx, ry] = rotLocal(inst.rot, lx, 0); return [inst.x + rx, inst.y + ry, z]; };
  const leads = [[w(0, base), w(0, zt), w(x0, zt)], [w(span, base), w(span, zt), w(span - x0, zt)]].map((p, i) => <Cable key={i} d={polyline(cam, p)} color="#c3c8cd" width={1.6} />);
  const body = polyline(cam, [w(x0 + 0.45, zt), w(span - x0 - 0.45, zt)]);
  const bands = resistorBands(Number(props.ohms));
  return (
    <g>
      {leads}
      <path d={body} stroke={INK} strokeWidth={0.95 * S + 2.6} strokeLinecap="round" fill="none" />
      <path d={body} stroke="#e3cfa3" strokeWidth={0.95 * S} strokeLinecap="round" fill="none" />
      {bands.map((c, i) => { const t = x0 + 0.55 + i * (L - 1.3) / 3.2 + (i === 3 ? 0.35 : 0); return <path key={i} d={polyline(cam, [w(t, zt), w(t + 0.18, zt)])} stroke={c} strokeWidth={0.95 * S} fill="none" />; })}
      <path d={body} stroke="#fff" strokeOpacity={0.35} strokeWidth={2.2} strokeLinecap="round" fill="none" transform="translate(0,-3.5)" />
    </g>
  );
}

/** Upright cylinder (LED, capacitor can) drawn from ellipses; returns the screen point of its top centre. */
function Can({ cam, x, y, z0, z1, r, fill, dome, glass }: { cam: Cam; x: number; y: number; z0: number; z1: number; r: number; fill: string; dome?: boolean; glass?: boolean }) {
  const [bx, by] = project(cam, x, y, z0), [tx, ty] = project(cam, x, y, z1), rx = r * K, ry = r * K * cam.sp;
  const body = `M${bx - rx},${by} L${tx - rx},${ty} ${dome ? `A${rx},${rx * 1.05} 0 0 1 ${tx + rx},${ty}` : `A${rx},${ry} 0 0 1 ${tx + rx},${ty}`} L${bx + rx},${by} A${rx},${ry} 0 0 1 ${bx - rx},${by} Z`;
  return (
    <g>
      <path d={body} fill={fill} fillOpacity={glass ? 0.88 : 1} stroke={INK} strokeWidth={1.3} />
      {!dome && <ellipse cx={tx} cy={ty} rx={rx} ry={ry} fill={shade(fill, 0.25)} stroke={INK} strokeWidth={1.3} />}
      <path d={`M${tx - rx * 0.55},${ty + (dome ? -rx * 0.2 : ry * 0.4)} L${bx - rx * 0.55},${by - 2}`} stroke="#fff" strokeOpacity={0.45} strokeWidth={2.4} strokeLinecap="round" />
    </g>
  );
}

/** A disc standing upright along the part's axis (ceramic capacitor). */
function Disc({ cam, inst, base, span, r, fill }: { cam: Cam; inst: Inst; base: number; span: number; r: number; fill: string }) {
  const w = (lx: number, z: number): V3 => { const [rx, ry] = rotLocal(inst.rot, lx, 0); return [inst.x + rx, inst.y + ry, z]; };
  const c = span / 2, zc = base + 1.1 + r, ring: V3[] = [];
  for (let i = 0; i <= 32; i++) { const t = (i / 32) * Math.PI * 2; ring.push(w(c + r * Math.cos(t), zc + r * Math.sin(t))); }
  const d = polyline(cam, ring) + ' Z';
  return (
    <g>
      {[0, span].map(lx => <Cable key={lx} d={polyline(cam, [w(lx, base), w(lx, base + 1), w(c + (lx ? 0.35 : -0.35), zc - r + 0.2)])} color="#c3c8cd" width={1.5} />)}
      <path d={d} fill={fill} stroke={INK} strokeWidth={1.4} />
      <path d={polyline(cam, ring.slice(9, 15))} fill="none" stroke="#fff" strokeOpacity={0.5} strokeWidth={2} strokeLinecap="round" />
    </g>
  );
}

function Led({ cam, inst, props, live, base }: { cam: Cam; inst: Inst; props: Props; live: Live; base: number }) {
  const color = live.burnt ? '#4a4741' : LED_HEX[String(props.color)] ?? '#e0453a', glow = live.burnt ? 0 : Number(live.glow ?? 0);
  const p = (lx: number): [number, number] => { const [rx, ry] = rotLocal(inst.rot, lx, 0); return [inst.x + rx, inst.y + ry]; };
  const [ax, ay] = p(0), [kx, ky] = p(1), [mx, my] = p(0.5), [gx, gy] = project(cam, mx, my, base + 3.4);
  return (
    <g>
      <Cable d={polyline(cam, [[ax, ay, base], [ax, ay, base + 1.6]])} color="#c3c8cd" width={1.5} />
      <Cable d={polyline(cam, [[kx, ky, base], [kx, ky, base + 1.4]])} color="#c3c8cd" width={1.5} />
      <Can cam={cam} x={mx} y={my} z0={base + 1.5} z1={base + 3.2} r={0.95} fill={color} dome glass />
      {glow > 0.04 && <circle cx={gx} cy={gy} r={10 + 26 * glow} fill={`url(#iso-glow-${String(props.color)})`} opacity={Math.min(1, 0.25 + glow)} pointerEvents="none" style={{ mixBlendMode: 'screen' }} />}
    </g>
  );
}

const solarZ = (b: { y: number; h: number }, ly: number) => 2.4 + 3.2 * (1 - (ly - b.y) / b.h);

function SolarPanel({ cam, inst, def, props, live, act, selected }: { cam: Cam; inst: Inst; def: PartDef; props: Props; live: Live; act: (p: Props) => void; selected: boolean }) {
  const b = def.box(props);
  const z = (_lx: number, ly: number) => solarZ(b, ly);
  const corner = (lx: number, ly: number): V3 => { const [rx, ry] = rotLocal(inst.rot, lx, ly); return [inst.x + rx, inst.y + ry, z(lx, ly)]; };
  const c = [corner(b.x, b.y), corner(b.x + b.w, b.y), corner(b.x + b.w, b.y + b.h), corner(b.x, b.y + b.h)];
  const legs = [c[0]!, c[1]!, c[2]!, c[3]!].map((q, i) => <Cable key={i} d={polyline(cam, [[q[0], q[1], 0], q])} color="#9aa1a8" width={2} />);
  const frame: ReactNode[] = [];
  for (let i = 0; i < 4; i++) {
    const a = c[i]!, q = c[(i + 1) % 4]!, { visible, lit } = faceLook(cam, q[1] - a[1], -(q[0] - a[0]));
    if (visible) frame.push(<polygon key={i} points={pts([project(cam, ...a), project(cam, ...q), project(cam, q[0], q[1], q[2] - 0.45), project(cam, a[0], a[1], a[2] - 0.45)])} fill={shade('#9aa1a8', lit)} stroke={INK} strokeWidth={1.2} />);
  }
  return (
    <g>
      {legs.slice(0, 2)}
      {frame}
      <g transform={faceMatrix(cam, inst, z)}>{def.render({ props, live, selected, act })}</g>
      <polygon points={pts(c.map(q => project(cam, ...q)))} fill="none" stroke={INK} strokeWidth={1.4} pointerEvents="none" />
      {legs.slice(2)}
    </g>
  );
}

const NO_LIVE: Live = {};
const NO_SHADOW = new Set(['breadboard', 'led', 'resistor', 'cap-ceramic']);
// Instruments stand up with their 2D drawing as the front panel; dmm leans back on a kickstand.
const UPRIGHT: Record<string, { depth: number; lean?: number }> = { psu: { depth: 7 }, fgen: { depth: 6 }, scope: { depth: 9 }, 'charge-controller': { depth: 2.6 }, dmm: { depth: 1.4, lean: 0.42 } };

function uprightMap(def: PartDef, props: Props, base: number): LocalMap {
  const b = def.box(props), front = b.y + b.h, u = UPRIGHT[def.type]!, lean = u.lean ?? 0;
  return (lx, ly) => { const d = front - ly; return [lx, front - d * Math.sin(lean), base + (lean ? 0.25 : 0) + d * Math.cos(lean)]; };
}

function Upright({ cam, inst, def, props, base, lid }: { cam: Cam; inst: Inst; def: PartDef; props: Props; base: number; lid: ReactNode }) {
  const b = def.box(props), u = UPRIGHT[def.type]!, m = uprightMap(def, props, base), side = sideOf(def), front = b.y + b.h;
  const P = (q: V3) => project(cam, ...toWorld(inst, q));
  const fr: V3[] = [m(b.x, front), m(b.x + b.w, front), m(b.x + b.w, b.y), m(b.x, b.y)];
  const back = fr.map(([x, y, z]) => [x, y - u.depth, z] as V3), faces: ReactNode[] = [];
  const wn = (nx: number, ny: number) => rotLocal(inst.rot, nx, ny);
  const quads: [V3[], number, number][] = [
    [[back[0]!, back[1]!, back[2]!, back[3]!], ...wn(0, -1)] as [V3[], number, number],
    [[fr[0]!, back[0]!, back[3]!, fr[3]!], ...wn(-1, 0)] as [V3[], number, number],
    [[fr[1]!, back[1]!, back[2]!, fr[2]!], ...wn(1, 0)] as [V3[], number, number],
  ];
  for (const [q, nx, ny] of quads) { const { visible, lit } = faceLook(cam, nx, ny); if (visible) faces.push(<polygon key={faces.length} points={pts(q.map(P))} fill={shade(side, lit)} stroke={INK} strokeWidth={1.3} strokeLinejoin="round" />); }
  const topQ = [fr[3]!, fr[2]!, back[2]!, back[3]!];
  const [fnx, fny] = wn(0, 1), seeFront = faceLook(cam, fnx, fny).visible, clip = `iso-clip-${inst.id}`;
  return (
    <g>
      {u.lean && <Cable d={polyline(cam, [toWorld(inst, [b.x + b.w / 2, front - b.h * 0.55 * Math.sin(u.lean) - u.depth, base + b.h * 0.55 * Math.cos(u.lean)]), toWorld(inst, [b.x + b.w / 2, front - b.h * 0.9, base])])} color="#3a3a3e" width={2.6} />}
      {faces}
      <polygon points={pts(topQ.map(P))} fill={shade(side, 0.3)} stroke={INK} strokeWidth={1.3} strokeLinejoin="round" />
      {seeFront ? (
        <g transform={mapMatrix(cam, inst, m)}>
          <clipPath id={clip}><rect x={b.x * GRID} y={b.y * GRID} width={b.w * GRID} height={b.h * GRID} /></clipPath>
          <g clipPath={`url(#${clip})`}><rect x={b.x * GRID} y={b.y * GRID} width={b.w * GRID} height={b.h * GRID} fill={shade(side, 0.1)} />{lid}</g>
        </g>
      ) : null}
      <polygon points={pts(fr.map(P))} fill={seeFront ? 'none' : shade(side, -0.2)} stroke={INK} strokeWidth={1.4} strokeLinejoin="round" pointerEvents={seeFront ? 'none' : undefined} />
    </g>
  );
}

interface Placed { inst: Inst; def: PartDef; props: Props; base: number; h: number; depth: number; onBoard: boolean }

const IsoPart = memo(function IsoPart({ cam, p, live, selected, wobble, holes }: { cam: Cam; p: Placed; live: Live | undefined; selected: boolean; wobble: boolean; holes?: ReactNode }) {
  const { inst, def, props, base, h } = p, lv = live ?? NO_LIVE;
  const act = useCallback((patch: Props) => useBench.getState().setProps(inst.id, patch, true), [inst.id]);
  // The lid drawing only changes with the part's state, so orbiting reuses it and React skips the subtree.
  const lid = useMemo(() => def.render({ props, live: lv, selected, act }), [def, props, lv, selected, act]);
  let body: ReactNode;
  if (inst.type === 'resistor') body = <Resistor cam={cam} inst={inst} props={props} base={base} />;
  else if (inst.type === 'led') body = <Led cam={cam} inst={inst} props={props} live={lv} base={base} />;
  else if (inst.type === 'cap-electrolytic') {
    const [rx, ry] = rotLocal(inst.rot, 1, 0), x = inst.x + rx, y = inst.y + ry;
    body = <g>{[0, 2].map(lx => { const [qx, qy] = rotLocal(inst.rot, lx, 0); return <Cable key={lx} d={polyline(cam, [[inst.x + qx, inst.y + qy, base], [inst.x + qx, inst.y + qy, base + 0.8]])} color="#c3c8cd" width={1.5} />; })}<Can cam={cam} x={x} y={y} z0={base + 0.6} z1={base + 4.4} r={1.35} fill={lv.reversed ? '#8a3a2a' : '#2f4a8a'} /></g>;
  } else if (UPRIGHT[inst.type]) body = <Upright cam={cam} inst={inst} def={def} props={props} base={base} lid={lid} />;
  else if (inst.type === 'cap-ceramic') body = <Disc cam={cam} inst={inst} base={base} span={def.pins(props)[1]?.x ?? 2} r={1.05} fill="#e8b13a" />;
  else if (inst.type === 'solar') body = <SolarPanel cam={cam} inst={inst} def={def} props={props} live={lv} act={act} selected={selected} />;
  else if (def.category === 'Digital ICs' && /^DIP|^\d|·/.test(def.pins(props)[0]?.label ?? '')) {
    const legs = placedPins(inst).map(q => <Cable key={q.key} d={polyline(cam, [[q.x, q.y, base], [q.x, q.y, base + h * 0.45]])} color="#c3c8cd" width={1.8} />);
    const n = def.pins(props).length;
    body = <g>{legs}<Extrude cam={cam} inst={inst} def={def} props={props} base={base + 0.35} h={h} top={lid} box={{ x: -0.5, y: -2.55, w: n / 2, h: 2.1 }} /></g>;
  } else body = <Extrude cam={cam} inst={inst} def={def} props={props} base={base} h={h} top={lid} />;
  return (
    <>
      <g data-part={inst.id} style={{ cursor: 'pointer' }} filter={wobble ? 'url(#iso-wobble)' : undefined}>
        {selected && inst.type !== 'breadboard' && <Outline cam={cam} p={p} />}
        {body}
      </g>
      {holes}
    </>
  );
});

/** Dashed footprint ring under the selected part. */
function Outline({ cam, p }: { cam: Cam; p: Placed }) {
  const f = footprint(p.def, p.inst, p.props), cx = f.reduce((a, q) => a + q[0], 0) / 4, cy = f.reduce((a, q) => a + q[1], 0) / 4;
  const g = f.map(([x, y]) => project(cam, cx + (x - cx) * 1.08 + Math.sign(x - cx) * 0.4, cy + (y - cy) * 1.08 + Math.sign(y - cy) * 0.4, p.base));
  return <polygon points={pts(g)} fill="#3a6ed6" fillOpacity={0.08} stroke="#3a6ed6" strokeWidth={1.8} strokeDasharray="6 4" pointerEvents="none" />;
}

function wirePath(cam: Cam, a: V3, b: V3) {
  const d = Math.hypot(a[0] - b[0], a[1] - b[1]), lift = Math.min(9, 1.2 + d * 0.22), top = Math.max(a[2], b[2]) + lift, n = 24, out: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = 1 - t;
    const x = a[0] * s + b[0] * t, y = a[1] * s + b[1] * t;
    const z = s * s * s * a[2] + 3 * s * s * t * (a[2] + (top - a[2]) * 0.9) + 3 * s * t * t * (b[2] + (top - b[2]) * 0.9) + t * t * t * b[2];
    out.push([x, y, z]);
  }
  return polyline(cam, out);
}

function Label({ cam, p }: { cam: Cam; p: Placed }) {
  const fp = footprint(p.def, p.inst, p.props), cx = fp.reduce((s, q) => s + q[0], 0) / 4, cy = fp.reduce((s, q) => s + q[1], 0) / 4;
  const lift = UPRIGHT[p.inst.type] ? p.def.box(p.props).h * 0.9 - p.h : p.inst.type === 'solar' ? 4 : p.inst.type === 'led' ? 2 : 0.2;
  const [ax, ay] = project(cam, cx, cy, p.base + p.h + lift);
  const text = p.def.name.replace(/\s*\(.*\)$/, '').toUpperCase(), w = text.length * 5.6 + 16, lx = ax, ly = ay - 34;
  return (
    <g pointerEvents="none" fontFamily="ui-monospace,Menlo,monospace">
      <line x1={ax} y1={ay} x2={lx} y2={ly + 9} stroke={INK} strokeWidth={1} />
      <circle cx={ax} cy={ay} r={2.4} fill={INK} />
      <rect x={lx - w / 2} y={ly - 9} width={w} height={18} rx={9} fill="#fbf8f1" stroke={INK} strokeWidth={1.3} />
      <text x={lx} y={ly + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={INK}>{text}</text>
    </g>
  );
}

function Mat({ cam, x0, y0, x1, y1 }: { cam: Cam; x0: number; y0: number; x1: number; y1: number }) {
  const t = 0.9, c: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], lines: ReactNode[] = [];
  for (let x = Math.ceil(x0 / 5) * 5; x <= x1; x += 5) lines.push(<line key={`x${x}`} x1={project(cam, x, y0, 0)[0]} y1={project(cam, x, y0, 0)[1]} x2={project(cam, x, y1, 0)[0]} y2={project(cam, x, y1, 0)[1]} stroke="#2f6f5e" strokeOpacity={x % 25 === 0 ? 0.35 : 0.16} />);
  for (let y = Math.ceil(y0 / 5) * 5; y <= y1; y += 5) lines.push(<line key={`y${y}`} x1={project(cam, x0, y, 0)[0]} y1={project(cam, x0, y, 0)[1]} x2={project(cam, x1, y, 0)[0]} y2={project(cam, x1, y, 0)[1]} stroke="#2f6f5e" strokeOpacity={y % 25 === 0 ? 0.35 : 0.16} />);
  const top = c.map(([x, y]) => project(cam, x, y, 0)), faces: ReactNode[] = [];
  for (let i = 0; i < 4; i++) {
    const a = c[i]!, b = c[(i + 1) % 4]!, { visible, lit } = faceLook(cam, b[1] - a[1], -(b[0] - a[0]));
    if (!visible) continue;
    faces.push(<polygon key={i} points={pts([project(cam, a[0], a[1], -t), project(cam, b[0], b[1], -t), project(cam, b[0], b[1], 0), project(cam, a[0], a[1], 0)])} fill={shade('#5aa892', lit)} stroke={INK} strokeWidth={1.4} />);
  }
  return <g>{faces}<polygon points={pts(top)} fill="#8fc4b0" stroke={INK} strokeWidth={1.4} />{lines}</g>;
}

/** Invisible hit targets on every pin and breadboard hole; part pins are drawn last so they win over holes. */
const PinLayer = memo(function PinLayer({ cam, pins, pinPos, holes }: { cam: Cam; pins: PlacedPin[]; pinPos: (p: PlacedPin) => V3; holes: boolean }) {
  return <g>{pins.filter(p => (p.inst.type === 'breadboard') === holes).map(p => { const [x, y] = project(cam, ...pinPos(p)); return <circle key={p.key} data-pin={p.key} cx={x} cy={y} r={p.inst.type === 'breadboard' ? 4 : 5.5} fill="transparent" />; })}</g>;
});

function PinHover({ cam, hover, from, rubber, pins, pinAt, pinPos }: { cam: Cam; hover: string | null; from: string | null; rubber: [number, number] | null; pins: PlacedPin[]; pinAt: Map<string, PlacedPin>; pinPos: (p: PlacedPin) => V3 }) {
  const volts = useBench(s => s.volts), net = runner.net, h = hover ? pinAt.get(hover) : undefined, f = from ? pinAt.get(from) : undefined;
  const hn = h && net.get(h.key), same = hn ? pins.filter(p => net.get(p.key) === hn) : h ? [h] : [];
  const at = (p: PlacedPin) => project(cam, ...pinPos(p));
  const fp = f && at(f), hp = h && at(h), end = hp ?? rubber;
  const v = h ? volts[h.key] : undefined, vText = v != null ? `${v.toFixed(v < 10 ? 3 : 2)} V` : 'not connected';
  return (
    <g pointerEvents="none">
      {same.map(p => { const [x, y] = at(p); return <circle key={p.key} cx={x} cy={y} r={3.2} fill="#3a6ed6" fillOpacity={0.45} />; })}
      {fp && end && <path d={`M${fp[0]},${fp[1]} Q${(fp[0] + end[0]) / 2},${Math.min(fp[1], end[1]) - 40} ${end[0]},${end[1]}`} fill="none" stroke="#3a6ed6" strokeWidth={3} strokeDasharray="6 5" strokeLinecap="round" />}
      {hp && <circle cx={hp[0]} cy={hp[1]} r={6.5} fill="none" stroke="#3a6ed6" strokeWidth={2.2} />}
      {hp && h && (
        <g transform={`translate(${hp[0] + 10},${hp[1] - 28})`} fontFamily="ui-monospace,Menlo,monospace">
          <rect width={Math.max(h.pin.label.length, vText.length) * 5.6 + 16} height={30} rx={8} fill="#fbf8f1" stroke={INK} strokeWidth={1.2} />
          <text x={8} y={12} fontSize={8.5} fontWeight={700} fill={INK}>{h.pin.label}</text>
          <text x={8} y={24} fontSize={8.5} fill="#4b4840">{vText}</text>
        </g>
      )}
    </g>
  );
}

type Drag = { x: number; y: number; mode: 'orbit' | 'pan' | 'part' | 'wire'; th: number; ph: number; vx: number; vy: number; moved: boolean; pick: Element | null; part?: { id: string; board: boolean; off0: [number, number]; offB: [number, number] }; from?: string };

export default function IsoView() {
  const doc = useBench(s => s.doc), live = useBench(s => s.live), sel = useBench(s => s.sel);
  const [angle, setAngle] = useState(ISO), [labels, setLabels] = useState(true), [wobble, setWobble] = useState(1.2), [moving, setMoving] = useState(false);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [center, setCenter] = useState<[number, number] | null>(null);
  const [hover, setHover] = useState<string | null>(null), [rubber, setRubber] = useState<[number, number] | null>(null);
  const host = useRef<HTMLDivElement>(null), drag = useRef<Drag | null>(null);

  const scene = useMemo(() => {
    const pins = doc.parts.flatMap(placedPins), holes = new Set(pins.filter(p => p.inst.type === 'breadboard').map(p => `${p.x},${p.y}`));
    const placed = doc.parts.flatMap(inst => {
      const def = getPart(inst.type);
      if (!def) return [];
      const props = { ...def.defaults, ...inst.props } as Props;
      const onBoard = inst.type !== 'breadboard' && (def.mount ?? 'board') === 'board' && pins.some(p => p.inst === inst && holes.has(`${p.x},${p.y}`));
      return [{ inst, def, props, onBoard, base: onBoard ? BB_H : 0, h: heightOf(def), depth: 0 }];
    });
    const xs: number[] = [], ys: number[] = [];
    for (const p of placed) for (const [x, y] of footprint(p.def, p.inst, p.props)) { xs.push(x); ys.push(y); }
    const x0 = xs.length ? Math.min(...xs) - 6 : -20, x1 = xs.length ? Math.max(...xs) + 6 : 20, y0 = ys.length ? Math.min(...ys) - 6 : -20, y1 = ys.length ? Math.max(...ys) + 6 : 20;
    return { pins, holes, placed, bounds: { x0, y0, x1, y1 } };
  }, [doc.parts]);
  const mid: [number, number] = [(scene.bounds.x0 + scene.bounds.x1) / 2, (scene.bounds.y0 + scene.bounds.y1) / 2];
  // The orbit centre only moves when the view is re-fitted, so editing never makes the scene jump.
  const cam = useMemo(() => makeCam(center?.[0] ?? mid[0], center?.[1] ?? mid[1], angle.th, angle.ph), [center, mid[0], mid[1], angle]); // eslint-disable-line react-hooks/exhaustive-deps

  const ordered = useMemo(() => scene.placed.map(p => {
    const fp = footprint(p.def, p.inst, p.props).map(([x, y]) => viewXY(cam, x, y)[1]);
    return { ...p, depth: p.inst.type === 'breadboard' ? -1e9 : Math.max(...fp) + (p.onBoard ? 0.01 : 0) };
  }).sort((a, b) => a.depth - b.depth), [scene.placed, cam]);

  const fit = useCallback(() => {
    const el = host.current, b = scene.bounds;
    if (!el) return;
    const cam = makeCam((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, angle.th, angle.ph);
    setCenter([cam.cx, cam.cy]);
    const corners = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]].flatMap(([x, y]) => [project(cam, x!, y!, 0), project(cam, x!, y!, 9)]);
    const sx = corners.map(c => c[0]), sy = corners.map(c => c[1]), w = Math.max(...sx) - Math.min(...sx), h = Math.max(...sy) - Math.min(...sy);
    const zoom = Math.min(2.5, Math.max(0.2, Math.min(el.clientWidth / w, el.clientHeight / h) * 0.92));
    setView({ zoom, x: el.clientWidth / 2 - (Math.min(...sx) + w / 2) * zoom, y: el.clientHeight / 2 - (Math.min(...sy) + h / 2) * zoom });
  }, [scene.bounds, angle]);
  const ids = useRef<Set<string>>(new Set());
  useEffect(() => {
    const now = new Set(doc.parts.map(p => p.id)), fresh = !ids.current.size || ![...now].some(id => ids.current.has(id));
    ids.current = now;
    if (fresh) fit();
  }, [doc.parts]); // eslint-disable-line react-hooks/exhaustive-deps

  const pinPos = useMemo(() => {
    const byId = new Map(scene.placed.map(p => [p.inst.id, p]));
    return (pin: PlacedPin): V3 => {
      const p = byId.get(pin.inst.id);
      const onHole = pin.inst.type === 'breadboard' || ((pin.def.mount ?? 'board') === 'board' && scene.holes.has(`${pin.x},${pin.y}`));
      if (onHole || !p) return [pin.x, pin.y, BB_H];
      if (UPRIGHT[p.inst.type]) { const [x, y, z] = uprightMap(p.def, p.props, p.base)(pin.pin.x, pin.pin.y); return toWorld(p.inst, [x, y + 0.15, z]); }
      if (p.inst.type === 'solar') return [pin.x, pin.y, solarZ(p.def.box(p.props), pin.pin.y) - 0.3];
      if ((pin.def.mount ?? 'board') === 'board') return [pin.x, pin.y, p.base];
      return [pin.x, pin.y, p.base + p.h];
    };
  }, [scene]);
  const pinAt = useMemo(() => new Map(scene.pins.map(p => [p.key, p])), [scene.pins]);
  const holeLayers = useMemo(() => new Map(scene.placed.filter(p => p.inst.type === 'breadboard').map(p => [p.inst.id, <PinLayer key="h" cam={cam} pins={scene.pins.filter(q => q.inst === p.inst)} pinPos={pinPos} holes />])), [scene, cam, pinPos]);

  const zoomAt = useCallback((cx: number, cy: number, to: (z: number) => number) => {
    const r = host.current!.getBoundingClientRect(), mx = cx - r.left, my = cy - r.top;
    setView(v => { const zoom = Math.min(5, Math.max(0.15, to(v.zoom))), k = zoom / v.zoom; return { zoom, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k }; });
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    // Trackpad: pinch arrives as ctrl+wheel and two-finger moves as plain wheel; a mouse wheel moves in whole notches.
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const notch = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Math.abs((e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY ?? 0) % 120 === 0);
      if (e.ctrlKey) zoomAt(e.clientX, e.clientY, z => z * Math.exp(-e.deltaY * 0.01));
      else if (notch) zoomAt(e.clientX, e.clientY, z => z * Math.exp(-e.deltaY * 0.0015));
      else setView(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    // Safari reports trackpad pinch as gesture events instead of ctrl+wheel.
    let base = 1;
    const gStart = (e: Event) => { e.preventDefault(); base = 1; };
    const gChange = (e: Event) => { e.preventDefault(); const g = e as Event & { scale: number; clientX: number; clientY: number }, f = g.scale / base; base = g.scale; zoomAt(g.clientX, g.clientY, z => z * f); };
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('gesturestart', gStart);
    el.addEventListener('gesturechange', gChange);
    return () => { el.removeEventListener('wheel', wheel); el.removeEventListener('gesturestart', gStart); el.removeEventListener('gesturechange', gChange); };
  }, [zoomAt]);

  // Touch screens: two fingers pinch to zoom and move together to pan.
  const touches = useRef(new Map<number, [number, number]>()), pinch = useRef<{ d: number; mx: number; my: number } | null>(null);
  const pinchState = () => {
    const [a, b] = [...touches.current.values()];
    return { d: Math.hypot(a![0] - b![0], a![1] - b![1]) || 1, mx: (a![0] + b![0]) / 2, my: (a![1] + b![1]) / 2 };
  };

  const scenePt = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = host.current!.getBoundingClientRect();
    return [(e.clientX - r.left - view.x) / view.zoom, (e.clientY - r.top - view.y) / view.zoom];
  };
  const boards = useMemo(() => scene.placed.filter(p => p.inst.type === 'breadboard').map(p => { const f = footprint(p.def, p.inst, p.props); return [Math.min(...f.map(q => q[0])), Math.min(...f.map(q => q[1])), Math.max(...f.map(q => q[0])), Math.max(...f.map(q => q[1]))]; }), [scene.placed]);
  /** Where the pointer lands: the breadboard top if it is over one (and the part can sit in holes), else the mat. */
  const ground = (e: { clientX: number; clientY: number }, boardOk = true): { x: number; y: number; z: number } => {
    const [sx, sy] = scenePt(e);
    if (boardOk) { const [x, y] = unproject(cam, sx, sy, BB_H); if (boards.some(([a, b, c, d]) => x >= a! && x <= c! && y >= b! && y <= d!)) return { x, y, z: BB_H }; }
    const [x, y] = unproject(cam, sx, sy, 0);
    return { x, y, z: 0 };
  };
  const pinUnder = (e: { clientX: number; clientY: number }) => document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-pin]')?.getAttribute('data-pin') ?? null;

  const down = (e: React.PointerEvent) => {
    const t = e.target as Element;
    if (t.closest('[data-interactive], .iso-tools')) return;
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, [e.clientX, e.clientY]);
      if (touches.current.size === 2) { drag.current = null; setMoving(true); setRubber(null); pinch.current = pinchState(); (e.currentTarget as Element).setPointerCapture(e.pointerId); return; }
    }
    const pan = e.button === 2 || e.shiftKey || e.button === 1, pin = t.closest('[data-pin]')?.getAttribute('data-pin'), partEl = t.closest('[data-part]');
    const d: Drag = { x: e.clientX, y: e.clientY, mode: pan ? 'pan' : 'orbit', th: angle.th, ph: angle.ph, vx: view.x, vy: view.y, moved: false, pick: t.closest('[data-part], [data-wire]') };
    if (!pan && pin) { d.mode = 'wire'; d.from = pin; }
    else if (!pan && partEl) {
      const id = partEl.getAttribute('data-part')!, p = scene.placed.find(q => q.inst.id === id);
      if (p && p.inst.type !== 'breadboard') {
        const [sx, sy] = scenePt(e), g0 = unproject(cam, sx, sy, 0), gB = unproject(cam, sx, sy, BB_H);
        d.mode = 'part'; d.part = { id, board: (p.def.mount ?? 'board') === 'board', off0: [p.inst.x - g0[0], p.inst.y - g0[1]], offB: [p.inst.x - gB[0], p.inst.y - gB[1]] };
      }
    }
    drag.current = d;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) touches.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch.current && touches.current.size === 2) {
      const p0 = pinch.current, p1 = pinchState();
      zoomAt(p1.mx, p1.my, z => z * p1.d / p0.d);
      setView(v => ({ ...v, x: v.x + p1.mx - p0.mx, y: v.y + p1.my - p0.my }));
      pinch.current = p1;
      return;
    }
    const d = drag.current;
    if (d && e.buttons === 0) { up(e); return; }
    if (!d) { setHover(pinUnder(e)); return; }
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 4) { d.moved = true; setMoving(d.mode === 'orbit' || d.mode === 'pan'); }
    if (!d.moved) return;
    if (d.mode === 'pan') setView(v => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
    else if (d.mode === 'orbit') setAngle({ th: d.th - dx * 0.008, ph: Math.min(1.45, Math.max(0.12, d.ph + dy * 0.006)) });
    else if (d.mode === 'part' && d.part) {
      const [sx, sy] = scenePt(e), gB = unproject(cam, sx, sy, BB_H), bx = gB[0] + d.part.offB[0], by = gB[1] + d.part.offB[1];
      const onBoard = d.part.board && boards.some(([a, b, c, dd]) => bx >= a! && bx <= c! && by >= b! && by <= dd!);
      const g0 = unproject(cam, sx, sy, 0), nx = Math.round(onBoard ? bx : g0[0] + d.part.off0[0]), ny = Math.round(onBoard ? by : g0[1] + d.part.off0[1]), inst = doc.parts.find(p => p.id === d.part!.id);
      if (inst && (nx !== inst.x || ny !== inst.y)) { useBench.getState().movePart(inst.id, nx, ny, !d.pick?.hasAttribute('data-moved')); d.pick?.setAttribute('data-moved', ''); }
    } else if (d.mode === 'wire') { const to = pinUnder(e); setHover(to); setRubber(scenePt(e)); }
  };
  const up = (e: { clientX: number; clientY: number; pointerId?: number }) => {
    if (e.pointerId != null) touches.current.delete(e.pointerId);
    if (pinch.current) { if (touches.current.size < 2) { pinch.current = null; setMoving(false); } return; }
    const d = drag.current;
    drag.current = null; setMoving(false); setRubber(null);
    d?.pick?.removeAttribute('data-moved');
    if (!d) return;
    if (d.mode === 'wire' && d.from) {
      const to = pinUnder(e);
      if (d.moved && to && to !== d.from) useBench.getState().addWire(d.from, to);
      if (!d.moved) useBench.getState().select(null);
      return;
    }
    if (d.moved) return;
    const id = d.pick?.getAttribute('data-part'), wire = d.pick?.getAttribute('data-wire');
    useBench.getState().select(id ? { kind: 'part', id } : wire ? { kind: 'wire', id: wire } : null);
  };
  const drop = (e: React.DragEvent) => {
    const type = e.dataTransfer.getData('text/eb-part'), def = type && getPart(type);
    if (!def) return;
    e.preventDefault();
    const g = ground(e, (def.mount ?? 'board') === 'board');
    useBench.getState().addPart(type, Math.round(g.x), Math.round(g.y));
  };
  const wob = wobble > 0 && !moving;

  return (
    <div className="wb-canvas iso-host" ref={host} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={e => drag.current && up(e)} onPointerLeave={() => !drag.current && setHover(null)} onContextMenu={e => e.preventDefault()} onDragOver={e => e.preventDefault()} onDrop={drop} style={{ cursor: moving ? 'grabbing' : hover ? 'crosshair' : 'grab' }}>
      <svg width="100%" height="100%">
        <defs>
          <filter id="iso-wobble" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" /><feDisplacementMap in="SourceGraphic" scale={wobble} /></filter>
          <filter id="iso-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5" /></filter>
          {Object.entries(LED_HEX).map(([k, c]) => <radialGradient key={k} id={`iso-glow-${k}`}><stop offset="0" stopColor="#fff" stopOpacity={0.95} /><stop offset="0.25" stopColor={c} stopOpacity={0.8} /><stop offset="1" stopColor={c} stopOpacity={0} /></radialGradient>)}
        </defs>
        <g transform={`translate(${view.x},${view.y}) scale(${view.zoom})`}>
          <g filter={wob ? 'url(#iso-wobble)' : undefined}><Mat cam={cam} {...scene.bounds} /></g>
          {ordered.filter(p => !NO_SHADOW.has(p.inst.type)).map(p => { const u = UPRIGHT[p.inst.type], b = p.def.box(p.props); return <Shadow key={`s${p.inst.id}`} cam={cam} poly={footprint(p.def, p.inst, p.props, u ? { x: b.x, y: b.y + b.h - (u.lean ? b.h * 0.9 : u.depth), w: b.w, h: u.lean ? b.h * 0.9 : u.depth } : undefined)} spread={p.onBoard ? 0.3 : 0.8} />; })}
          {ordered.map(p => <IsoPart key={p.inst.id} cam={cam} p={p} live={live[p.inst.id]} selected={sel?.kind === 'part' && sel.id === p.inst.id} wobble={wob && p.inst.type !== 'breadboard'} holes={holeLayers.get(p.inst.id)} />)}
          {doc.wires.map(w => {
            const a = pinAt.get(w.a), b = pinAt.get(w.b);
            if (!a || !b) return null;
            const d = wirePath(cam, pinPos(a), pinPos(b));
            return <g key={w.id} data-wire={w.id} style={{ cursor: 'pointer' }}><path d={d} stroke="transparent" strokeWidth={12} fill="none" /><Cable d={d} color={w.color} width={sel?.kind === 'wire' && sel.id === w.id ? 4.6 : 3.4} /></g>;
          })}
          {labels && ordered.filter(p => p.inst.type !== 'breadboard').map(p => <Label key={`l${p.inst.id}`} cam={cam} p={p} />)}
          <PinLayer cam={cam} pins={scene.pins} pinPos={pinPos} holes={false} />
          {(hover || rubber) && <PinHover cam={cam} hover={hover} from={drag.current?.from ?? null} rubber={rubber} pins={scene.pins} pinAt={pinAt} pinPos={pinPos} />}
        </g>
      </svg>
      <div className="iso-tools">
        <button className={`btn ${labels ? 'on' : ''}`} onClick={() => setLabels(l => !l)}>Labels</button>
        <button className="btn" onClick={() => { setAngle(ISO); requestAnimationFrame(fit); }} title="Back to the isometric angle">Reset view</button>
        <button className="btn" onClick={fit}>Fit</button>
        <label className="iso-wob">Wobble <input type="range" min={0} max={4} step={0.2} value={wobble} onChange={e => setWobble(+e.target.value)} /></label>
      </div>
      <div className="wb-3d-hint">drag the mat to orbit · pinch to zoom · two fingers to move · drag a part to move it · drag pin → pin for a wire · Del / R / ⌘Z</div>
    </div>
  );
}
