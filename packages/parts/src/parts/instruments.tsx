import { FunctionGenerator, Fuse, Resistor, VoltageSource, type Shape } from '@eb/engine';
import { INK, Label, PAPER, u } from '../draw';
import type { PartDef } from '../types';
import { formatSI } from '../units';

const stop = (e: { stopPropagation(): void }) => e.stopPropagation();

/** 6000-count auto-range: 12.65, 0.005, 219.8, OL. */
export function fmtCounts(v: number): string {
  const a = Math.abs(v);
  if (!isFinite(v) || a >= 6000) return 'OL';
  const d = a < 6 ? 3 : a < 60 ? 2 : a < 600 ? 1 : 0;
  return (v < 0 ? '-' : '') + a.toFixed(d);
}

function fmtOhms(r: number): [string, string] {
  if (!isFinite(r) || r > 2e6 || r < 0) return ['OL', 'MΩ'];
  if (r < 6000) return [fmtCounts(r), 'Ω'];
  if (r < 6e6) return [fmtCounts(r / 1e3), 'kΩ'];
  return [fmtCounts(r / 1e6), 'MΩ'];
}

type Knob = 'OFF' | 'V' | 'OHM' | 'CONT' | 'A';
type DmmProps = { knob: Knob; ac: boolean; hold: boolean; fuseFix: number };
const KNOB: [Knob, number, string][] = [['OFF', -120, 'OFF'], ['V', -60, 'V'], ['OHM', 0, 'Ω'], ['CONT', 60, '·))'], ['A', 120, 'A']];
// Ohmmeter = 3 V open-circuit test source behind 6 kΩ (0.5 mA short-circuit), like a real meter's compliance limit.
const OHM_V = 3, OHM_R = 6000, RIN = 10e6;

export const dmm: PartDef<DmmProps> = {
  type: 'dmm', name: 'Multimeter (TH-M100)', category: 'Instruments', blurb: 'V, Ω, continuity, 10 A',
  mount: 'free',
  box: () => ({ x: 0, y: 0, w: 16, h: 24 }),
  pins: () => [
    { id: '10A', label: '10A jack (current only!)', x: 3, y: 23 },
    { id: 'COM', label: 'COM jack (black lead)', x: 8, y: 23 },
    { id: 'VmA', label: 'VΩmA jack (red lead)', x: 13, y: 23 },
  ],
  leadColor: { '10A': '#d6452f', COM: '#1d1d1b', VmA: '#d6452f' },
  props: [
    { key: 'knob', label: 'Knob', type: 'select', options: [['OFF', 'OFF'], ['V', 'V (voltage)'], ['OHM', 'Ω (resistance)'], ['CONT', 'Continuity (beep)'], ['A', 'A (current, 10A jack)']] },
    { key: 'ac', label: 'AC (FUNC)', type: 'bool' },
    { key: 'hold', label: 'HOLD', type: 'bool' },
  ],
  defaults: { knob: 'V', ac: true, hold: false, fuseFix: 0 },
  build(ctx, p) {
    const vma = ctx.pin('VmA'), com = ctx.pin('COM'), a10 = ctx.pin('10A'), mid = ctx.internal();
    ctx.add(new Resistor(vma, com, RIN));
    const src = ctx.add(new VoltageSource(vma, com, OHM_V, OHM_R, 'Ohmmeter test source'));
    ctx.add(new Resistor(a10, mid, 0.01));
    const fuse = ctx.add(new Fuse(mid, com, 10, 0.005, 'Meter 10A fuse'));
    let st = { ...p }, fixes = p.fuseFix, n = 0, mean = 0, ms = 0, held: Record<string, string | number | boolean> | null = null;
    const apply = (q: DmmProps) => { src.enabled = q.knob === 'OHM' || q.knob === 'CONT'; };
    apply(p);
    const raw = (sim: { v(n: number): number }) => st.knob === 'A' ? (sim.v(a10) - sim.v(mid)) / 0.01 : sim.v(vma) - sim.v(com);
    return {
      update(q) {
        const next = q as unknown as DmmProps;
        if (next.knob !== st.knob || next.ac !== st.ac) { n = 0; mean = 0; ms = 0; }
        if (+next.fuseFix !== fixes) { fixes = +next.fuseFix; fuse.reset(); }
        if (!next.hold) held = null;
        st = { ...next }; apply(st);
        return true;
      },
      sample(sim) {
        const x = raw(sim), k = Math.min(1, sim.dt / (st.ac ? 0.2 : 0.3));
        if (n === 0) { mean = x; ms = x * x; } else { mean += (x - mean) * k; ms += (x * x - ms) * k; }
        n++;
      },
      read(sim) {
        if (st.hold && held) return held;
        const x = n ? mean : raw(sim), rms = n ? Math.sqrt(Math.max(0, ms - mean * mean)) : 0;
        let display = '', unit = '', mode = 'OFF', value = 0, beep = false;
        if (st.knob === 'V' || st.knob === 'A') {
          value = st.ac ? rms : x;
          display = fmtCounts(value); unit = st.knob; mode = `${st.knob} ${st.ac ? 'AC' : 'DC'}`;
          if (st.knob === 'A' && fuse.blown) { display = '0.000'; value = 0; }
        } else if (st.knob === 'OHM' || st.knob === 'CONT') {
          const v = sim.v(vma) - sim.v(com), rx = v >= OHM_V - 1e-4 ? Infinity : OHM_R * v / (OHM_V - v), r = v < 0 ? -1 : 1 / Math.max(1 / rx - 1 / RIN, 1e-12);
          [display, unit] = fmtOhms(r); value = r; mode = st.knob === 'OHM' ? 'Ω' : 'CONT';
          beep = st.knob === 'CONT' && r >= 0 && r < 30;
          if (st.knob === 'CONT' && display === 'OL') unit = 'Ω';
        }
        const out = { display, unit, mode, value, beep, fuseBlown: fuse.blown };
        if (st.hold) held = out;
        return out;
      },
    };
  },
  info: [
    ['Voltage', 'Knob V, press FUNC for DC, red in VΩmA, leads across the part'],
    ['Current', 'Knob A, red in 10A, and break the circuit so the meter sits in series'],
    ['Never', 'Red in 10A straight across a battery: that is a short, the meter fuse blows'],
    ['Resistance', 'Power the circuit off first; on a live circuit Ω reads nonsense. Range up to ~2 MΩ'],
    ['Minus sign', 'Leads are reversed — nothing is wrong'],
  ],
  render: ({ props, live, act }) => {
    const knob = props.knob, ang = KNOB.find(k => k[0] === knob)![1], off = knob === 'OFF', kx = u(8), ky = u(14);
    const next = () => { const i = KNOB.findIndex(k => k[0] === knob), k = KNOB[(i + 1) % KNOB.length]![0]; act({ knob: k, ac: k === 'V' }); };
    return (
      <g>
        <rect x={0} y={0} width={u(16)} height={u(24)} rx={18} fill="#f2c230" stroke={INK} strokeWidth={2} />
        <rect x={u(1)} y={u(1)} width={u(14)} height={u(22)} rx={10} fill="#2b2d31" stroke={INK} />
        <rect x={u(2)} y={u(1.8)} width={u(12)} height={u(5.4)} rx={5} fill={off ? '#9aa58c' : live.fuseBlown && knob === 'A' ? '#f0b8ab' : '#c7d6b3'} stroke={INK} />
        {!off && <>
          <Label x={2.6} y={3.0} size={9} anchor="start" color="#1d2a18">{(knob === 'V' || knob === 'A') ? (props.ac ? 'AC' : 'DC') : ''}{props.hold ? '  H' : ''}{live.beep ? '  ·))' : ''}</Label>
          <Label x={13.4} y={5.7} size={30} anchor="end" color="#1d2a18">{String(live.display ?? '')}</Label>
          <Label x={13.4} y={6.8} size={10} anchor="end" color="#1d2a18">{String(live.unit ?? '')}</Label>
        </>}
        <Label x={8} y={8.3} size={8} color="#9a9a9a">TH-M100 · 6000</Label>
        <g data-interactive onPointerDown={e => { stop(e); act({ ac: !props.ac }); }} style={{ cursor: 'pointer' }}>
          <rect x={u(2.2)} y={u(8.9)} width={u(4.6)} height={u(1.5)} rx={9} fill="#4a4d55" stroke={INK} /><Label x={4.5} y={9.95} size={9} color={PAPER}>FUNC</Label>
        </g>
        <g data-interactive onPointerDown={e => { stop(e); act({ hold: !props.hold }); }} style={{ cursor: 'pointer' }}>
          <rect x={u(9.2)} y={u(8.9)} width={u(4.6)} height={u(1.5)} rx={9} fill={props.hold ? '#7a7f8a' : '#4a4d55'} stroke={INK} /><Label x={11.5} y={9.95} size={9} color={PAPER}>HOLD</Label>
        </g>
        <circle cx={kx} cy={ky} r={u(4.2)} fill="#3a3d43" stroke={INK} />
        {KNOB.map(([k, a, t]) => (
          <g key={k} data-interactive onPointerDown={e => { stop(e); act({ knob: k, ac: k === 'V' }); }} style={{ cursor: 'pointer' }}>
            <circle cx={kx + u(4.9) * Math.sin(a * Math.PI / 180)} cy={ky - u(4.9) * Math.cos(a * Math.PI / 180)} r={9} fill="transparent" />
            <text x={kx + u(4.9) * Math.sin(a * Math.PI / 180)} y={ky - u(4.9) * Math.cos(a * Math.PI / 180) + 4} fontSize={10} fontWeight={700} fill={k === knob ? '#f3c33b' : PAPER} textAnchor="middle" fontFamily="ui-monospace,Menlo,monospace">{t}</text>
          </g>
        ))}
        <g data-interactive onPointerDown={e => { stop(e); next(); }} style={{ cursor: 'pointer' }} transform={`rotate(${ang} ${kx} ${ky})`}>
          <circle cx={kx} cy={ky} r={u(3.2)} fill="#1b1c1f" stroke="#000" />
          <rect x={kx - 5} y={ky - u(3)} width={10} height={u(3)} rx={4} fill="#33363c" />
          <rect x={kx - 3} y={ky - u(2.9)} width={6} height={u(1.1)} rx={2} fill={PAPER} />
        </g>
        {live.fuseBlown && (
          <g data-interactive onPointerDown={e => { stop(e); act({ fuseFix: (+props.fuseFix || 0) + 1 }); }} style={{ cursor: 'pointer' }}>
            <Label x={3} y={20.6} size={8} color="#ff8a7a">✕ replace fuse</Label>
          </g>
        )}
        {[['10A', 3, '#d6452f'], ['COM', 8, '#777'], ['VΩmA', 13, '#d6452f']].map(([t, x, c]) => (
          <g key={t as string}>
            <circle cx={u(x as number)} cy={u(23)} r={8} fill="#111" stroke={c as string} strokeWidth={3} />
            <Label x={x as number} y={21.6} size={8} color="#ddd">{t}</Label>
          </g>
        ))}
      </g>
    );
  },
};

type FgProps = { on: boolean; shape: Shape; freq: number; amplitude: number; offset: number; duty: number };
const SHAPES: [Shape, string][] = [['sine', '∿'], ['square', '⊓'], ['triangle', '△'], ['saw', '⟋']];

export const fgen: PartDef<FgProps> = {
  type: 'fgen', name: 'Function generator', category: 'Instruments', blurb: 'sine, square, triangle, saw',
  mount: 'free',
  box: () => ({ x: 0, y: 0, w: 18, h: 11 }),
  pins: () => [{ id: 'OUT', label: 'OUT (signal)', x: 13, y: 10 }, { id: 'COM', label: 'COM (ground of the signal)', x: 16, y: 10 }],
  leadColor: { OUT: '#d6452f', COM: '#1d1d1b' },
  props: [
    { key: 'on', label: 'Output on', type: 'bool' },
    { key: 'shape', label: 'Shape', type: 'select', options: SHAPES.map(([s]) => [s, s] as [string, string]) },
    { key: 'freq', label: 'Frequency', type: 'number', unit: 'Hz', min: 0.1, max: 1e6, si: true },
    { key: 'amplitude', label: 'Amplitude (peak-to-peak)', type: 'number', unit: 'V', min: 0, max: 20 },
    { key: 'offset', label: 'DC offset', type: 'number', unit: 'V', min: -10, max: 10 },
    { key: 'duty', label: 'Duty (square)', type: 'range', min: 0.05, max: 0.95, step: 0.05 },
  ],
  defaults: { on: true, shape: 'sine', freq: 1000, amplitude: 2, offset: 0, duty: 0.5 },
  build(ctx, p) {
    const g = ctx.add(new FunctionGenerator(ctx.pin('OUT'), ctx.pin('COM'), { shape: p.shape, freq: p.freq, amplitude: p.amplitude, offset: p.offset, duty: p.duty }, 50, 'Function generator'));
    g.on = p.on;
    return {
      update(q) {
        const n = q as unknown as FgProps;
        g.on = !!n.on; g.s = { shape: n.shape, freq: +n.freq, amplitude: +n.amplitude, offset: +n.offset, duty: +n.duty };
        return true;
      },
      read: (_s, v) => ({ vout: v('OUT') - v('COM') }),
    };
  },
  info: [
    ['Amplitude', 'Peak-to-peak: 2 Vpp swings from −1 V to +1 V around the offset'],
    ['Output', '50 Ω inside, so a heavy load pulls the signal down'],
    ['Use with', 'The oscilloscope: OUT to the circuit, COM to its ground'],
  ],
  render: ({ props, act }) => {
    const icon = (s: Shape, x: number, y: number, w: number, h: number) => {
      const pts = Array.from({ length: 25 }, (_, i) => {
        const t = i / 24, ph = (t * 2) % 1;
        const yv = s === 'sine' ? Math.sin(2 * Math.PI * ph) : s === 'square' ? (ph < 0.5 ? 1 : -1) : s === 'triangle' ? (ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph) : 2 * ph - 1;
        return `${(x + t * w).toFixed(1)},${(y - yv * h / 2).toFixed(1)}`;
      });
      return <polyline points={pts.join(' ')} fill="none" stroke="#9be3b4" strokeWidth={1.6} />;
    };
    return (
      <g>
        <rect x={0} y={0} width={u(18)} height={u(11)} rx={10} fill="#cfd3d6" stroke={INK} strokeWidth={2} />
        <rect x={u(1)} y={u(1)} width={u(11)} height={u(4.4)} rx={5} fill="#1f2a27" stroke={INK} />
        {icon(props.shape, u(1.6), u(3.2), u(2.6), u(2.2))}
        <Label x={4.6} y={2.4} size={9} anchor="start" color="#9be3b4">{props.on ? props.shape.toUpperCase() : 'OUTPUT OFF'}</Label>
        <Label x={4.6} y={3.6} size={10} anchor="start" color="#9be3b4">{formatSI(+props.freq, 'Hz', 4)}</Label>
        <Label x={4.6} y={4.8} size={9} anchor="start" color="#9be3b4">{(+props.amplitude).toFixed(2)} Vpp {+props.offset ? `${(+props.offset).toFixed(1)}V off` : ''}</Label>
        {SHAPES.map(([s, g], i) => (
          <g key={s} data-interactive onPointerDown={e => { stop(e); act({ shape: s }); }} style={{ cursor: 'pointer' }}>
            <rect x={u(1 + i * 2.8)} y={u(6.4)} width={u(2.4)} height={u(1.8)} rx={6} fill={props.shape === s ? '#1d1d1b' : PAPER} stroke={INK} />
            <Label x={2.2 + i * 2.8} y={7.75} size={12} color={props.shape === s ? PAPER : INK}>{g}</Label>
          </g>
        ))}
        <g data-interactive onPointerDown={e => { stop(e); act({ on: !props.on }); }} style={{ cursor: 'pointer' }}>
          <rect x={u(13)} y={u(1.2)} width={u(4)} height={u(1.8)} rx={8} fill={props.on ? '#3fae66' : '#8a8577'} stroke={INK} />
          <Label x={15} y={2.5} size={9} color={PAPER}>{props.on ? 'ON' : 'OFF'}</Label>
        </g>
        <Label x={15} y={6} size={8} color="#4a4741">FUNCTION</Label><Label x={15} y={7} size={8} color="#4a4741">GEN 50Ω</Label>
        <circle cx={u(13)} cy={u(10)} r={7} fill="#111" stroke="#d6452f" strokeWidth={3} /><Label x={13} y={8.8} size={8}>OUT</Label>
        <circle cx={u(16)} cy={u(10)} r={7} fill="#111" stroke="#777" strokeWidth={3} /><Label x={16} y={8.8} size={8}>COM</Label>
      </g>
    );
  },
};

export const logicProbe: PartDef<{}> = {
  type: 'logic-probe', name: 'Logic probe', category: 'Instruments', blurb: 'HIGH / LOW / PULSE pen',
  mount: 'free',
  box: () => ({ x: 0, y: -2, w: 14, h: 4 }),
  pins: () => [{ id: 'TIP', label: 'Probe tip', x: 0, y: 0 }, { id: 'VCC', label: 'VCC clip (red, to the circuit supply)', x: 13, y: -1 }, { id: 'GND', label: 'GND clip (black, to circuit ground)', x: 13, y: 1 }],
  leadColor: { TIP: '#f3c33b', VCC: '#d6452f', GND: '#1d1d1b' },
  props: [], defaults: {},
  build(ctx) {
    const tip = ctx.pin('TIP'), vcc = ctx.pin('VCC'), gnd = ctx.pin('GND');
    ctx.add(new Resistor(tip, gnd, 1e6)); ctx.add(new Resistor(vcc, gnd, 100e3));
    let level: 0 | 1 | null = null, pulseUntil = -1, t = 0;
    const levelOf = (sim: { v(n: number): number }): { vs: number; lv: 0 | 1 | null } => {
      const vs = sim.v(vcc) - sim.v(gnd), rel = vs > 1 ? (sim.v(tip) - sim.v(gnd)) / vs : 0;
      return { vs, lv: rel > 0.7 ? 1 : rel < 0.3 ? 0 : null };
    };
    return {
      sample(sim) {
        t = sim.t;
        const { lv } = levelOf(sim);
        if (lv != null && level != null && lv !== level) pulseUntil = sim.t + 0.15;
        if (lv != null) level = lv;
      },
      read(sim) {
        const { vs, lv } = levelOf(sim);
        return { powered: vs > 1, high: vs > 1 && lv === 1, low: vs > 1 && lv === 0, pulse: vs > 1 && Math.max(t, sim.t) < pulseUntil };
      },
    };
  },
  info: [
    ['Clips', 'Red clip to the circuit supply, black clip to ground'],
    ['Reading', 'HIGH above 70 % of the supply, LOW below 30 %, neither in between (bad level or floating input)'],
    ['PULSE', 'Blinks when the signal changes, even too fast to see'],
  ],
  render: ({ live }) => {
    const led = (x: number, on: unknown, c: string, t: string) => (
      <g>
        <circle cx={u(x)} cy={0} r={5.5} fill={on ? c : '#4a4741'} stroke={INK} />
        {on ? <circle cx={u(x)} cy={0} r={10} fill={c} opacity={0.35} /> : null}
        <Label x={x} y={-0.9} size={7} color={PAPER}>{t}</Label>
      </g>
    );
    return (
      <g>
        <path d={`M0,0 L${u(1.5)},${-u(0.6)} L${u(1.5)},${u(0.6)} Z`} fill="#c9ced2" stroke={INK} />
        <rect x={u(1.5)} y={-u(1.6)} width={u(11)} height={u(3.2)} rx={12} fill="#2b2d31" stroke={INK} strokeWidth={1.6} />
        {led(4, live.high, '#d6452f', 'HI')}{led(6.5, live.low, '#3fae66', 'LO')}{led(9, live.pulse, '#f3c33b', 'PLS')}
        {!live.powered && <Label x={7} y={1.3} size={7} color="#cfcab8">clip VCC + GND</Label>}
      </g>
    );
  },
};

export const instrumentParts: PartDef<any>[] = [dmm, fgen, logicProbe];
