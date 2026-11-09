import { BenchSupply, BJT, Capacitor, Diode, Fuse, Inductor, MOSFET, Potentiometer, Resistor, SolarPanel, Switch } from '@eb/engine';
import type { PointerEvent, WheelEvent } from 'react';
import { Glow, INK, Label, Lead, PAPER, u } from '../draw';
import type { PartDef } from '../types';
import { formatSI } from '../units';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const stop = (e: PointerEvent | WheelEvent) => { e.stopPropagation(); };

type PsuProps = { volts: number; limit: number };
export const psu: PartDef<PsuProps> = {
  type: 'psu', name: 'Bench power supply', category: 'Power', blurb: '0–30 V with current limit',
  mount: 'free',
  box: () => ({ x: -1, y: -1, w: 12, h: 9 }),
  pins: () => [{ id: '+', label: 'PSU +', x: 3, y: 6 }, { id: '-', label: 'PSU − (ground)', x: 7, y: 6, ground: true }],
  props: [
    { key: 'volts', label: 'Voltage', type: 'range', min: 0, max: 30, step: 0.1, unit: 'V' },
    { key: 'limit', label: 'Current limit', type: 'range', min: 0.01, max: 3, step: 0.01, unit: 'A' },
  ],
  defaults: { volts: 5, limit: 0.5 },
  build(ctx, p) {
    const s = ctx.add(new BenchSupply(ctx.pin('+'), ctx.pin('-'), p.volts, p.limit));
    return {
      read: (sim, v) => ({ v: v('+') - v('-'), amps: s.current(k => sim.branch(k)), mode: s.mode }),
      update: q => { s.volts = +q.volts!; s.limit = +q.limit!; return true; },
    };
  },
  info: [['CV mode', 'Holds the voltage you set'], ['CC mode', 'If the circuit tries to pull more than the limit, the supply lowers the voltage to hold the current'], ['Tip', 'Set a low current limit first — it saves parts from mistakes']],
  render: ({ props, live, act }) => {
    const cc = live.mode === 'CC';
    const knob = (x: number, key: 'volts' | 'limit', step: number, max: number) => (
      <g onWheel={e => { stop(e); act({ [key]: +clamp(+props[key] - Math.sign(e.deltaY) * step, key === 'limit' ? 0.01 : 0, max).toFixed(2) }); }} onPointerDown={stop} style={{ cursor: 'ns-resize' }}>
        <circle cx={u(x)} cy={u(4.2)} r={u(0.9)} fill="#33363c" stroke={INK} strokeWidth={1.2} />
        <line x1={u(x)} y1={u(4.2)} x2={u(x) + u(0.7) * Math.sin(+props[key] / max * 5 - 2.5)} y2={u(4.2) - u(0.7) * Math.cos(+props[key] / max * 5 - 2.5)} stroke={PAPER} strokeWidth={2} />
      </g>
    );
    return (
      <g>
        <rect x={u(-0.5)} y={u(-0.5)} width={u(11)} height={u(8)} rx={8} fill="#d8dadc" stroke={INK} strokeWidth={1.6} />
        <rect x={u(0.3)} y={u(0.2)} width={u(9.4)} height={u(2.6)} rx={4} fill="#1f2a27" stroke={INK} />
        <text x={u(2.6)} y={u(2.05)} fontSize={15} fill="#ff6a5a" textAnchor="middle" fontFamily="ui-monospace,Menlo,monospace" fontWeight={700}>{(live.v as number ?? props.volts).toFixed(2)}</text>
        <text x={u(7.2)} y={u(2.05)} fontSize={15} fill="#7be38f" textAnchor="middle" fontFamily="ui-monospace,Menlo,monospace" fontWeight={700}>{(Math.max(0, live.amps as number ?? 0)).toFixed(3)}</text>
        <Label x={4.6} y={1.1} size={7} color="#ff6a5a">V</Label><Label x={9.2} y={1.1} size={7} color="#7be38f">A</Label>
        <Label x={5} y={4.4} size={8} color={cc ? '#d6452f' : '#3a7a4a'}>{cc ? 'CC' : 'CV'}</Label>
        {knob(2.4, 'volts', 0.1, 30)}{knob(7.6, 'limit', 0.01, 3)}
        <Label x={2.4} y={5.9} size={7} color="#55585e">VOLT</Label><Label x={7.6} y={5.9} size={7} color="#55585e">CURR</Label>
        <circle cx={u(3)} cy={u(6)} r={5} fill="#d6452f" stroke={INK} /><circle cx={u(7)} cy={u(6)} r={5} fill="#262624" stroke={INK} />
      </g>
    );
  },
};

type SunProps = { sun: number };
export const solarPanel: PartDef<SunProps> = {
  type: 'solar', name: 'Solar panel 55 W', category: 'Power', blurb: 'Voc 24.5 V, Isc 2.83 A',
  mount: 'free',
  box: () => ({ x: -0.5, y: -0.5, w: 15, h: 11 }),
  pins: () => [{ id: '+', label: 'Panel MC4 +', x: 5, y: 10 }, { id: '-', label: 'Panel MC4 −', x: 9, y: 10, ground: true }],
  props: [{ key: 'sun', label: 'Sunlight', type: 'range', min: 0, max: 100, step: 1, unit: '%' }],
  defaults: { sun: 90 },
  build(ctx, p) {
    const pv = ctx.add(new SolarPanel(ctx.pin('+'), ctx.pin('-')));
    pv.sun = p.sun / 100;
    return {
      read: (_s, v) => { const vv = v('+') - v('-'); return { v: vv, amps: pv.iv(vv)[0] }; },
      update: q => { pv.sun = +q.sun! / 100; return true; },
    };
  },
  info: [['Voc', 'Voltage with nothing connected: ~24.5 V in full sun'], ['Isc', 'Current when shorted: ~2.83 A — safe, the panel limits itself'], ['Shade', 'Less sun = less current, voltage drops only a little']],
  render: ({ props, live }) => {
    const g = props.sun / 100;
    return (
      <g>
        <rect x={0} y={0} width={u(14)} height={u(8.4)} rx={4} fill="#c9ced2" stroke={INK} strokeWidth={1.6} />
        <rect x={u(0.5)} y={u(0.5)} width={u(13)} height={u(7.4)} fill={g > 0.05 ? '#2c4a96' : '#22345f'} />
        {Array.from({ length: 5 }, (_, i) => <line key={i} x1={u(0.5 + 13 * (i + 1) / 6)} y1={u(0.5)} x2={u(0.5 + 13 * (i + 1) / 6)} y2={u(7.9)} stroke="#8fb0ea" strokeWidth={0.8} />)}
        {[1, 2].map(i => <line key={i} x1={u(0.5)} y1={u(0.5 + 7.4 * i / 3)} x2={u(13.5)} y2={u(0.5 + 7.4 * i / 3)} stroke="#8fb0ea" strokeWidth={0.8} />)}
        <polygon points={`${u(1.5)},${u(1)} ${u(4)},${u(1)} ${u(1.8)},${u(4)}`} fill="#fff" opacity={0.1 + 0.3 * g} />
        <path d={`M${u(5)},${u(8.4)} L${u(5)},${u(10)}`} stroke="#d6452f" strokeWidth={3} /><path d={`M${u(9)},${u(8.4)} L${u(9)},${u(10)}`} stroke="#262624" strokeWidth={3} />
        <Label x={7} y={9.6} size={8}>{live.v != null ? `${(live.v as number).toFixed(1)} V · ${(live.amps as number).toFixed(2)} A` : ''}</Label>
        <text x={u(13)} y={u(-0.4)} fontSize={14} opacity={0.3 + 0.7 * g}>☀️</text>
      </g>
    );
  },
};

type CapProps = { farads: number };
export const ceramicCap: PartDef<CapProps> = {
  type: 'cap-ceramic', name: 'Ceramic capacitor', category: 'Passive', blurb: 'small values, no polarity',
  box: () => ({ x: -0.4, y: -1.6, w: 2.8, h: 2 }),
  pins: () => [{ id: '1', label: 'Lead 1', x: 0, y: 0 }, { id: '2', label: 'Lead 2', x: 2, y: 0 }],
  props: [{ key: 'farads', label: 'Capacitance', type: 'number', unit: 'F', min: 1e-12, si: true }],
  defaults: { farads: 100e-9 },
  build(ctx, p) {
    const c = ctx.add(new Capacitor(ctx.pin('1'), ctx.pin('2'), p.farads));
    return { read: (_s, v) => ({ v: v('1') - v('2') }), update: q => { c.farads = +q.farads!; return true; } };
  },
  info: [['Stores charge', 'Like a tiny, fast battery'], ['Code', '104 = 10 × 10⁴ pF = 100 nF'], ['Polarity', 'None — either way round']],
  render: ({ props }) => (
    <g>
      <Lead x1={0} y1={0} x2={0.6} y2={-0.7} /><Lead x1={2} y1={0} x2={1.4} y2={-0.7} />
      <ellipse cx={u(1)} cy={u(-1)} rx={u(0.95)} ry={u(0.6)} fill="#e0a72c" stroke={INK} strokeWidth={1.2} />
      <Label x={1} y={-0.75} size={7}>{formatSI(props.farads, 'F', 2)}</Label>
    </g>
  ),
};

type ElecProps = { farads: number; rating: number };
export const electrolyticCap: PartDef<ElecProps> = {
  type: 'cap-electrolytic', name: 'Electrolytic capacitor', category: 'Passive', blurb: 'big values, polarised!',
  box: () => ({ x: -0.6, y: -2.6, w: 2.2, h: 2.9 }),
  pins: () => [{ id: '+', label: 'Capacitor + (long leg)', x: 0, y: 0 }, { id: '-', label: 'Capacitor − (stripe)', x: 1, y: 0 }],
  props: [{ key: 'farads', label: 'Capacitance', type: 'number', unit: 'F', min: 1e-7, si: true }, { key: 'rating', label: 'Voltage rating', type: 'select', options: [['16', '16 V'], ['25', '25 V'], ['50', '50 V']] }],
  defaults: { farads: 100e-6, rating: 25 },
  build(ctx, p) {
    const c = ctx.add(new Capacitor(ctx.pin('+'), ctx.pin('-'), p.farads));
    return {
      read: (_s, v) => { const vv = v('+') - v('-'); return { v: vv, reversed: vv < -1, over: vv > +p.rating }; },
      update: q => { c.farads = +q.farads!; return String(q.rating) === String(p.rating); },
    };
  },
  info: [['Polarity', 'The stripe marks − . Backwards it heats up and can burst'], ['Rating', 'Never go above the voltage printed on it'], ['Use', 'Smoothing power and slow timing']],
  render: ({ props, live }) => {
    const bad = !!live.reversed || !!live.over, bulge = bad ? 2.5 : 0;
    return (
      <g>
        <Lead x1={0} y1={0} x2={0} y2={-0.5} /><Lead x1={1} y1={0} x2={1} y2={-0.5} />
        <rect x={u(-0.45) - bulge} y={u(-2.5)} width={u(1.9) + 2 * bulge} height={u(2)} rx={6} fill={bad ? '#7a4b8a' : '#2b4fa0'} stroke={INK} strokeWidth={1.2} />
        <rect x={u(1.05)} y={u(-2.5)} width={u(0.4)} height={u(2)} fill="#cfd8ef" />
        <Label x={0.4} y={-1.3} size={7} color={PAPER}>{formatSI(props.farads, 'F', 2)}</Label>
        {bad && <text x={u(0.5)} y={u(-2.7)} fontSize={11} textAnchor="middle">⚠️</text>}
      </g>
    );
  },
};

type IndProps = { henries: number };
export const inductor: PartDef<IndProps> = {
  type: 'inductor', name: 'Inductor', category: 'Passive', blurb: 'resists changes in current',
  box: () => ({ x: -0.4, y: -0.7, w: 4.8, h: 1.4 }),
  pins: () => [{ id: '1', label: 'Lead 1', x: 0, y: 0 }, { id: '2', label: 'Lead 2', x: 4, y: 0 }],
  props: [{ key: 'henries', label: 'Inductance', type: 'number', unit: 'H', min: 1e-6, si: true }],
  defaults: { henries: 10e-3 },
  build(ctx, p) {
    const mid = ctx.internal();
    const l = ctx.add(new Inductor(ctx.pin('1'), mid, p.henries));
    ctx.add(new Resistor(mid, ctx.pin('2'), 0.5));
    return { read: () => ({ amps: l.current }), update: q => { l.henries = +q.henries!; return true; } };
  },
  info: [['Coil', 'A wire wound into a coil stores energy in a magnetic field'], ['Switch off', 'Breaking its current gives a voltage spike — use a flyback diode']],
  render: ({ props }) => (
    <g>
      <Lead x1={0} y1={0} x2={4} y2={0} />
      <rect x={u(0.7)} y={-6.5} width={u(2.6)} height={13} rx={6} fill="#3a7a4a" stroke={INK} strokeWidth={1.2} />
      {[0, 1, 2, 3, 4].map(i => <line key={i} x1={u(0.95 + i * 0.52)} y1={-6} x2={u(1.15 + i * 0.52)} y2={6} stroke="#c27c3a" strokeWidth={2} />)}
      <Label x={2} y={1.4} size={7} color="#6b665a">{formatSI(props.henries, 'H')}</Label>
    </g>
  ),
};

type PotProps = { ohms: number; position: number };
export const potentiometer: PartDef<PotProps> = {
  type: 'pot', name: 'Potentiometer', category: 'Passive', blurb: 'turn the knob: adjustable divider',
  box: () => ({ x: -0.6, y: -3.2, w: 3.2, h: 3.6 }),
  pins: () => [{ id: '1', label: 'Pot end 1', x: 0, y: 0 }, { id: 'W', label: 'Pot wiper (middle)', x: 1, y: 0 }, { id: '2', label: 'Pot end 2', x: 2, y: 0 }],
  props: [{ key: 'ohms', label: 'Total resistance', type: 'number', unit: 'Ω', min: 100, si: true }, { key: 'position', label: 'Knob position', type: 'range', min: 0, max: 1, step: 0.01 }],
  defaults: { ohms: 10000, position: 0.5 },
  build(ctx, p) {
    const pot = ctx.add(new Potentiometer(ctx.pin('1'), ctx.pin('W'), ctx.pin('2'), p.ohms, p.position));
    return { read: (_s, v) => ({ vw: v('W') - v('2') }), update: q => { pot.ohms = +q.ohms!; pot.position = +q.position!; return true; } };
  },
  info: [['Three legs', 'Outer legs = the full resistor, middle = the slider'], ['As a divider', 'Ends to + and −, middle gives any voltage in between']],
  render: ({ props, act }) => {
    const ang = (props.position - 0.5) * 270;
    const turn = (d: number) => act({ position: +clamp(props.position + d, 0, 1).toFixed(3) });
    return (
      <g>
        <Lead x1={0} y1={0} x2={0} y2={-0.6} /><Lead x1={1} y1={0} x2={1} y2={-0.6} /><Lead x1={2} y1={0} x2={2} y2={-0.6} />
        <rect x={u(-0.5)} y={u(-3)} width={u(3)} height={u(2.5)} rx={4} fill="#3a6ed6" stroke={INK} strokeWidth={1.2} />
        <g style={{ cursor: 'grab' }} onPointerDown={e => { stop(e); (e.currentTarget as Element).setPointerCapture(e.pointerId); }}
          onPointerMove={e => { if (e.buttons === 1) { stop(e); turn(e.movementX / 120 - e.movementY / 120); } }}
          onWheel={e => { stop(e); turn(-Math.sign(e.deltaY) * 0.03); }}>
          <circle cx={u(1)} cy={u(-1.75)} r={u(1)} fill="#e9e5da" stroke={INK} strokeWidth={1.2} />
          <line x1={u(1)} y1={u(-1.75)} x2={u(1) + u(0.85) * Math.sin(ang * Math.PI / 180)} y2={u(-1.75) - u(0.85) * Math.cos(ang * Math.PI / 180)} stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
        </g>
        <Label x={1} y={1.3} size={7} color="#6b665a">{formatSI(props.ohms, 'Ω')}</Label>
      </g>
    );
  },
};

type FuseProps = { rating: number; spare: number };
export const bladeFuse: PartDef<FuseProps> = {
  type: 'fuse', name: 'Blade fuse', category: 'Passive', blurb: 'blows on too much current',
  box: () => ({ x: -0.4, y: -1.4, w: 3.8, h: 1.8 }),
  pins: () => [{ id: '1', label: 'Fuse end 1', x: 0, y: 0 }, { id: '2', label: 'Fuse end 2', x: 3, y: 0 }],
  props: [{ key: 'rating', label: 'Rating', type: 'select', options: [['1', '1 A'], ['2', '2 A'], ['5', '5 A'], ['10', '10 A'], ['20', '20 A']] }],
  defaults: { rating: 2, spare: 0 },
  build(ctx, p) {
    const f = ctx.add(new Fuse(ctx.pin('1'), ctx.pin('2'), +p.rating, 0.01, `${p.rating} A fuse`));
    return { read: (_s, v) => ({ blown: f.blown, amps: (v('1') - v('2')) / f.ohms }), update: q => String(q.rating) === String(p.rating) && String(q.spare) === String(p.spare) };
  },
  info: [['Job', 'Melts before the wire overheats'], ['Placement', 'As close to the battery + as possible'], ['Blown?', 'Click it to fit a new one — but fix the fault first']],
  render: ({ props, live, act }) => {
    const col: Record<string, string> = { '1': '#1d1d1b', '2': '#9aa1a7', '5': '#e0a72c', '10': '#d6452f', '20': '#f3c33b' };
    return (
      <g onDoubleClick={() => live.blown && act({ spare: +props.spare + 1 })}>
        <Lead x1={0} y1={0} x2={0.6} y2={0} /><Lead x1={2.4} y1={0} x2={3} y2={0} />
        <rect x={u(0.5)} y={u(-1.2)} width={u(2)} height={u(1.5)} rx={3} fill={live.blown ? '#8a8577' : col[String(props.rating)] ?? '#e0a72c'} stroke={INK} strokeWidth={1.2} />
        <Label x={1.5} y={-0.25} size={8} color={props.rating === 1 ? PAPER : INK}>{live.blown ? '✕' : props.rating}</Label>
      </g>
    );
  },
};

type DiodeKind = '1n4007' | 'zener';
const diodePart = (kind: DiodeKind): PartDef<{}> => ({
  type: kind === 'zener' ? 'zener' : 'diode', name: kind === 'zener' ? 'Zener diode 1N4733 (5.1 V)' : 'Diode 1N4007', category: 'Semiconductors',
  blurb: kind === 'zener' ? 'holds 5.1 V when reversed' : 'one-way valve for current',
  box: () => ({ x: -0.4, y: -0.6, w: 4.8, h: 1.2 }),
  pins: () => [{ id: 'A', label: 'Anode', x: 0, y: 0 }, { id: 'K', label: 'Cathode (stripe)', x: 4, y: 0 }],
  props: [], defaults: {},
  build(ctx) {
    const d = ctx.add(new Diode(ctx.pin('A'), ctx.pin('K'), kind === 'zener' ? { is: 1e-11, n: 1.6, bv: 5.1, ibv: 5e-3 } : { is: 7e-9, n: 1.8 }));
    return { read: (_s, v) => ({ amps: d.current(n => n === d.anode ? v('A') : v('K')) }) };
  },
  info: kind === 'zener'
    ? [['Reverse', 'Above 5.1 V it conducts and holds the voltage there'], ['Use', 'A simple voltage reference — always with a series resistor']]
    : [['Forward', 'Conducts from anode to cathode, dropping ~0.7 V'], ['Reverse', 'Blocks up to 1000 V'], ['Stripe', 'Marks the cathode']],
  render: () => (
    <g>
      <Lead x1={0} y1={0} x2={4} y2={0} />
      <rect x={u(1)} y={-5} width={u(2)} height={10} rx={3} fill={kind === 'zener' ? '#c94f3a' : '#2b2b2b'} stroke={INK} strokeWidth={1.2} />
      <rect x={u(2.55)} y={-5} width={4} height={10} fill={kind === 'zener' ? '#1d1d1b' : '#cfcfcf'} />
    </g>
  ),
});

const to92 = (label: string, fill = '#2b2b2b') => (
  <g>
    <Lead x1={0} y1={0} x2={0} y2={-0.5} /><Lead x1={1} y1={0} x2={1} y2={-0.5} /><Lead x1={2} y1={0} x2={2} y2={-0.5} />
    <path d={`M${u(-0.3)},${u(-0.45)} L${u(2.3)},${u(-0.45)} L${u(2.3)},${u(-1.2)} A${u(1.3)},${u(0.9)} 0 0 0 ${u(-0.3)},${u(-1.2)} Z`} fill={fill} stroke={INK} strokeWidth={1.2} />
    <Label x={1} y={-0.85} size={6} color={PAPER}>{label}</Label>
  </g>
);

const bjtPart = (type: 'npn' | 'pnp'): PartDef<{}> => ({
  type: type === 'npn' ? '2n2222' : '2n2907', name: type === 'npn' ? 'NPN transistor 2N2222' : 'PNP transistor 2N2907', category: 'Semiconductors',
  blurb: type === 'npn' ? 'small current at B switches C→E' : 'pull B low to switch E→C',
  box: () => ({ x: -0.5, y: -2.3, w: 3, h: 2.6 }),
  pins: () => [{ id: 'E', label: 'Emitter', x: 0, y: 0 }, { id: 'B', label: 'Base', x: 1, y: 0 }, { id: 'C', label: 'Collector', x: 2, y: 0 }],
  props: [], defaults: {},
  build(ctx) {
    ctx.add(new BJT(ctx.pin('C'), ctx.pin('B'), ctx.pin('E'), { type, is: 1e-14, bf: 200, br: 3 }));
    return { read: (_s, v) => ({ vbe: v('B') - v('E'), vce: v('C') - v('E') }) };
  },
  info: type === 'npn'
    ? [['Pins (flat side up)', 'E – B – C'], ['Switch', 'Base resistor ~1 kΩ; the load goes between + and C'], ['Gain', 'Collector current ≈ 100–300 × base current']]
    : [['Pins (flat side up)', 'E – B – C'], ['Switch', 'Emitter to +, pull the base low through a resistor to turn on']],
  render: () => to92(type === 'npn' ? '2222' : '2907'),
});

const nmos: PartDef<{}> = {
  type: '2n7000', name: 'N-MOSFET 2N7000', category: 'Semiconductors', blurb: 'voltage on G switches D→S',
  box: () => ({ x: -0.5, y: -2.3, w: 3, h: 2.6 }),
  pins: () => [{ id: 'S', label: 'Source', x: 0, y: 0 }, { id: 'G', label: 'Gate', x: 1, y: 0 }, { id: 'D', label: 'Drain', x: 2, y: 0 }],
  props: [], defaults: {},
  build(ctx) {
    const m = ctx.add(new MOSFET(ctx.pin('D'), ctx.pin('G'), ctx.pin('S'), { type: 'n', vth: 2.1, k: 0.1, lambda: 0.01 }));
    return { read: (_s, v) => ({ id: m.drainCurrent(n => n === m.d ? v('D') : n === m.g ? v('G') : v('S')) }) };
  },
  info: [['Pins (flat side up)', 'S – G – D'], ['Gate', 'Takes almost no current; above ~2 V it turns on'], ['Tip', 'Add a 100 kΩ gate-to-source resistor so it never floats']],
  render: () => to92('7000', '#30343c'),
};

const pmosPower: PartDef<{}> = {
  type: 'irf9540', name: 'P-MOSFET IRF9540 (TO-220)', category: 'Semiconductors', blurb: 'high-side power switch',
  box: () => ({ x: -0.7, y: -5.6, w: 3.4, h: 5.9 }),
  pins: () => [{ id: 'G', label: 'Gate', x: 0, y: 0 }, { id: 'D', label: 'Drain', x: 1, y: 0 }, { id: 'S', label: 'Source', x: 2, y: 0 }],
  props: [], defaults: {},
  build(ctx) {
    ctx.add(new MOSFET(ctx.pin('D'), ctx.pin('G'), ctx.pin('S'), { type: 'p', vth: 3, k: 1.5, lambda: 0.01 }));
    return { read: (_s, v) => ({ vgs: v('G') - v('S') }) };
  },
  info: [['Pins (front)', 'G – D – S'], ['On', 'Pull the gate ~5–10 V below the source'], ['Tab', 'The metal tab is the drain']],
  render: () => (
    <g>
      <Lead x1={0} y1={0} x2={0} y2={-1} /><Lead x1={1} y1={0} x2={1} y2={-1} /><Lead x1={2} y1={0} x2={2} y2={-1} />
      <rect x={u(-0.6)} y={u(-5.4)} width={u(3.2)} height={u(1.8)} rx={2} fill="#bfc4c8" stroke={INK} strokeWidth={1.2} />
      <circle cx={u(1)} cy={u(-4.5)} r={4} fill="#f4f1ea" stroke={INK} />
      <rect x={u(-0.6)} y={u(-3.6)} width={u(3.2)} height={u(2.7)} rx={2} fill="#2b2b2b" stroke={INK} strokeWidth={1.2} />
      <Label x={1} y={-2} size={6} color={PAPER}>IRF9540</Label>
    </g>
  ),
};

type BtnProps = { pressed: boolean };
export const pushButton: PartDef<BtnProps> = {
  type: 'button', name: 'Push button', category: 'Switches', blurb: 'on only while pressed',
  box: () => ({ x: -0.4, y: -0.4, w: 3.8, h: 2.8 }),
  pins: () => [{ id: '1a', label: 'Button side 1', x: 0, y: 0 }, { id: '1b', label: 'Button side 1', x: 0, y: 2 }, { id: '2a', label: 'Button side 2', x: 3, y: 0 }, { id: '2b', label: 'Button side 2', x: 3, y: 2 }],
  nets: () => [['1a', '1b'], ['2a', '2b']],
  props: [], defaults: { pressed: false },
  build(ctx, p) {
    const sw = ctx.add(new Switch(ctx.pin('1a'), ctx.pin('2a'), p.pressed));
    return { update: q => { sw.closed = !!q.pressed; return true; } };
  },
  info: [['Legs', 'The two legs on each side are always joined'], ['Pressing', 'Joins side 1 to side 2'], ['Breadboard', 'Put it across the centre gap']],
  render: ({ props, act }) => (
    <g>
      <rect x={u(-0.3)} y={u(-0.3)} width={u(3.6)} height={u(2.6)} rx={3} fill="#2b2d31" stroke={INK} strokeWidth={1.2} />
      <circle cx={u(1.5)} cy={u(1)} r={u(0.85)} fill={props.pressed ? '#a8322a' : '#d6452f'} stroke={INK} strokeWidth={1.4} style={{ cursor: 'pointer' }}
        onPointerDown={e => { stop(e); (e.currentTarget as Element).setPointerCapture(e.pointerId); act({ pressed: true }); }}
        onPointerUp={e => { stop(e); act({ pressed: false }); }} onPointerCancel={() => act({ pressed: false })} />
    </g>
  ),
};

type SlideProps = { side: string };
export const slideSwitch: PartDef<SlideProps> = {
  type: 'spdt', name: 'Slide switch (SPDT)', category: 'Switches', blurb: 'middle leg goes left or right',
  box: () => ({ x: -0.6, y: -1.8, w: 3.2, h: 2 }),
  pins: () => [{ id: 'L', label: 'Left contact', x: 0, y: 0 }, { id: 'C', label: 'Common (middle)', x: 1, y: 0 }, { id: 'R', label: 'Right contact', x: 2, y: 0 }],
  props: [{ key: 'side', label: 'Position', type: 'select', options: [['L', 'Left'], ['R', 'Right']] }],
  defaults: { side: 'L' },
  build(ctx, p) {
    const a = ctx.add(new Switch(ctx.pin('C'), ctx.pin('L'), p.side === 'L')), b = ctx.add(new Switch(ctx.pin('C'), ctx.pin('R'), p.side === 'R'));
    return { update: q => { a.closed = q.side === 'L'; b.closed = q.side === 'R'; return true; } };
  },
  info: [['SPDT', 'Single pole, double throw: one input, two outputs'], ['Use', 'Choose between two circuits, or ON/OFF using two legs']],
  render: ({ props, act }) => (
    <g onPointerDown={e => { stop(e); act({ side: props.side === 'L' ? 'R' : 'L' }); }} style={{ cursor: 'pointer' }}>
      <Lead x1={0} y1={0} x2={0} y2={-0.5} /><Lead x1={1} y1={0} x2={1} y2={-0.5} /><Lead x1={2} y1={0} x2={2} y2={-0.5} />
      <rect x={u(-0.5)} y={u(-1.6)} width={u(3)} height={u(1.2)} rx={3} fill="#9aa1a7" stroke={INK} strokeWidth={1.2} />
      <rect x={u(props.side === 'L' ? -0.2 : 1.2)} y={u(-1.45)} width={u(1)} height={u(0.9)} rx={2} fill="#2b2b2b" />
    </g>
  ),
};

type ToggleProps = { on: boolean };
export const toggleSwitch: PartDef<ToggleProps> = {
  type: 'spst', name: 'Toggle switch (SPST)', category: 'Switches', blurb: 'simple ON / OFF',
  box: () => ({ x: -0.5, y: -2.2, w: 3, h: 2.4 }),
  pins: () => [{ id: '1', label: 'Switch pin 1', x: 0, y: 0 }, { id: '2', label: 'Switch pin 2', x: 2, y: 0 }],
  props: [{ key: 'on', label: 'On', type: 'bool' }],
  defaults: { on: false },
  build(ctx, p) {
    const s = ctx.add(new Switch(ctx.pin('1'), ctx.pin('2'), p.on));
    return { update: q => { s.closed = !!q.on; return true; } };
  },
  info: [['SPST', 'Single pole, single throw: one path, on or off']],
  render: ({ props, act }) => (
    <g onPointerDown={e => { stop(e); act({ on: !props.on }); }} style={{ cursor: 'pointer' }}>
      <Lead x1={0} y1={0} x2={0} y2={-0.5} /><Lead x1={2} y1={0} x2={2} y2={-0.5} />
      <rect x={u(-0.4)} y={u(-1.4)} width={u(2.8)} height={u(1)} rx={3} fill="#33363c" stroke={INK} strokeWidth={1.2} />
      <line x1={u(1)} y1={u(-1)} x2={u(props.on ? 1.7 : 0.3)} y2={u(-2)} stroke="#c9ced2" strokeWidth={4} strokeLinecap="round" />
      <Label x={1} y={-0.6} size={6} color={props.on ? '#7be38f' : '#8a8577'}>{props.on ? 'ON' : 'OFF'}</Label>
    </g>
  ),
};

export const buzzer: PartDef<{}> = {
  type: 'buzzer', name: 'Active buzzer (5 V)', category: 'Output', blurb: 'beeps when powered',
  box: () => ({ x: -1, y: -2.8, w: 4, h: 3.1 }),
  pins: () => [{ id: '+', label: 'Buzzer + (long leg)', x: 0, y: 0 }, { id: '-', label: 'Buzzer −', x: 2, y: 0 }],
  props: [], defaults: {},
  build(ctx) {
    ctx.add(new Resistor(ctx.pin('+'), ctx.pin('-'), 170));
    return { read: (_s, v) => ({ v: v('+') - v('-'), sounding: v('+') - v('-') > 2 }) };
  },
  info: [['Active', 'Has its own oscillator: just give it 3–5 V'], ['Current', 'About 30 mA — fine from a battery, too much for a chip pin without a transistor']],
  render: ({ live }) => (
    <g>
      <Lead x1={0} y1={0} x2={0} y2={-0.4} /><Lead x1={2} y1={0} x2={2} y2={-0.4} />
      <circle cx={u(1)} cy={u(-1.4)} r={u(1.3)} fill="#2b2b2b" stroke={INK} strokeWidth={1.2} />
      <circle cx={u(1)} cy={u(-1.4)} r={3} fill="#555" />
      {live.sounding && <text x={u(2.4)} y={u(-2.2)} fontSize={12}>🔊</text>}
    </g>
  ),
};

export const dcMotor: PartDef<{}> = {
  type: 'motor', name: 'DC motor (3–6 V)', category: 'Output', blurb: 'spins faster with more current',
  box: () => ({ x: -1.2, y: -4.8, w: 4.4, h: 5.1 }),
  pins: () => [{ id: '1', label: 'Motor terminal 1', x: 0, y: 0 }, { id: '2', label: 'Motor terminal 2', x: 2, y: 0 }],
  props: [], defaults: {},
  build(ctx) {
    const mid = ctx.internal();
    ctx.add(new Resistor(ctx.pin('1'), mid, 4));
    const l = ctx.add(new Inductor(mid, ctx.pin('2'), 2e-3));
    let angle = 0, last = 0;
    return {
      read: sim => {
        const dt = Math.max(0, sim.t - last); last = sim.t;
        angle = (angle + l.current * 2000 * dt * 360) % 360;
        return { amps: l.current, angle };
      },
    };
  },
  info: [['Direction', 'Swap the wires and it spins the other way'], ['Flyback', 'Put a diode across it when switching with a transistor'], ['Current', 'Stalls draw a lot — drive it with a transistor, never a chip pin']],
  render: ({ live }) => {
    const a = (live.angle as number) || 0;
    return (
      <g>
        <Lead x1={0} y1={0} x2={0} y2={-0.8} /><Lead x1={2} y1={0} x2={2} y2={-0.8} />
        <rect x={u(-1)} y={u(-3.8)} width={u(4)} height={u(3)} rx={8} fill="#cfd3d6" stroke={INK} strokeWidth={1.4} />
        <circle cx={u(1)} cy={u(-2.3)} r={u(1.1)} fill="#e9e5da" stroke={INK} />
        <g transform={`rotate(${a} ${u(1)} ${u(-2.3)})`}><line x1={u(1)} y1={u(-2.3)} x2={u(1)} y2={u(-3.3)} stroke="#d6452f" strokeWidth={3} /></g>
        <Label x={1} y={-4.2} size={7} color="#6b665a">{live.amps != null ? `${((live.amps as number) * 1000).toFixed(0)} mA` : ''}</Label>
      </g>
    );
  },
};

export const lamp: PartDef<{}> = {
  type: 'lamp', name: 'Lamp 12 V 5 W', category: 'Output', blurb: 'glows with power',
  mount: 'free',
  box: () => ({ x: -1.5, y: -5, w: 6, h: 5.4 }),
  pins: () => [{ id: '1', label: 'Lamp terminal 1', x: 0, y: 0 }, { id: '2', label: 'Lamp terminal 2', x: 3, y: 0 }],
  props: [], defaults: {},
  build(ctx) {
    ctx.add(new Resistor(ctx.pin('1'), ctx.pin('2'), 28.8));
    return { read: (_s, v) => { const p = (v('1') - v('2')) ** 2 / 28.8; return { watts: p, glow: clamp(p / 5, 0, 1.4) }; } };
  },
  info: [['Rating', '12 V and 5 W → about 0.42 A'], ['Lower voltage', 'Half the voltage gives only a quarter of the power']],
  render: ({ live }) => {
    const g = (live.glow as number) || 0;
    return (
      <g>
        <rect x={u(-0.6)} y={u(-1)} width={u(4.2)} height={u(1.3)} rx={3} fill="#9aa1a7" stroke={INK} strokeWidth={1.2} />
        <Glow cx={u(1.5)} cy={u(-2.8)} r={14} color="#f3c33b" amount={Math.min(1, g)} />
        <circle cx={u(1.5)} cy={u(-2.8)} r={u(1.6)} fill={g > 0.05 ? '#fff3b0' : '#f1efe9'} fillOpacity={0.6 + 0.4 * Math.min(1, g)} stroke={INK} strokeWidth={1.2} />
        <path d={`M${u(1)},${u(-1)} L${u(1.2)},${u(-2.8)} L${u(1.8)},${u(-2.8)} L${u(2)},${u(-1)}`} fill="none" stroke={g > 0.05 ? '#e0a72c' : '#8a8577'} strokeWidth={1.4} />
        <Label x={1.5} y={-4.6} size={7} color="#6b665a">{live.watts != null ? `${(live.watts as number).toFixed(1)} W` : ''}</Label>
      </g>
    );
  },
};

export const diode = diodePart('1n4007');
export const zener = diodePart('zener');
export const npn = bjtPart('npn');
export const pnp = bjtPart('pnp');
export { nmos, pmosPower };

export const analogParts: PartDef<any>[] = [
  psu, solarPanel,
  ceramicCap, electrolyticCap, inductor, potentiometer, bladeFuse,
  diode, zener, npn, pnp, nmos, pmosPower,
  pushButton, slideSwitch, toggleSwitch,
  buzzer, dcMotor, lamp,
];
