import { Resistor, type Simulator } from '@eb/engine';
import type { PointerEvent as RPointerEvent } from 'react';
import { INK, Label, PAPER, u } from '../draw';
import type { Live, PartDef, Runtime } from '../types';
import { formatSI } from '../units';

const stop = (e: RPointerEvent) => e.stopPropagation();
const TIME_DIVS = [1e-5, 2e-5, 5e-5, 1e-4, 2e-4, 5e-4, 1e-3, 2e-3, 5e-3, 1e-2, 2e-2, 5e-2, 0.1, 0.2, 0.5, 1];
const VOLT_DIVS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10];
const opt = (vals: number[], unit: string): [string, string][] => vals.map(v => [String(v), `${formatSI(v, unit)}/div`]);
const step = (vals: number[], cur: number, d: number) => { const i = vals.findIndex(v => Math.abs(v - cur) < cur * 1e-6); return String(vals[Math.max(0, Math.min(vals.length - 1, (i < 0 ? 0 : i) + d))]); };
const MAX_PTS = 600;
const CAP = 20000;

/** Fixed-size ring of (t, ch…) samples, oldest overwritten first. */
class Ring {
  t = new Float64Array(CAP);
  ch: Float64Array[];
  n = 0;
  head = 0;
  constructor(channels: number) { this.ch = Array.from({ length: channels }, () => new Float64Array(CAP)); }
  push(t: number, vals: number[]) {
    this.t[this.head] = t;
    for (let k = 0; k < vals.length; k++) this.ch[k]![this.head] = vals[k]!;
    this.head = (this.head + 1) % CAP;
    if (this.n < CAP) this.n++;
  }
  idx(i: number) { return (this.head - this.n + i + CAP) % CAP; }
  clear() { this.n = 0; this.head = 0; }
  get last() { return this.n ? this.t[this.idx(this.n - 1)]! : -Infinity; }
}

/** Index of the newest edge crossing on `data` that still leaves `after` seconds of data. */
function findTrigger(r: Ring, k: number, level: number, rising: boolean, latest: number): number {
  for (let i = r.n - 1; i > 0; i--) {
    const j = r.idx(i), p = r.idx(i - 1);
    if (r.t[j]! > latest) continue;
    const a = r.ch[k]![p]!, b = r.ch[k]![j]!;
    if (rising ? a < level && b >= level : a > level && b <= level) return i;
  }
  return -1;
}

function edgesFreq(ts: number[], vs: number[], level: number) {
  const rises: number[] = [];
  for (let i = 1; i < vs.length; i++) if (vs[i - 1]! < level && vs[i]! >= level) {
    const f = (level - vs[i - 1]!) / (vs[i]! - vs[i - 1]! || 1);
    rises.push(ts[i - 1]! + f * (ts[i]! - ts[i - 1]!));
  }
  return { count: rises.length, freq: rises.length >= 2 ? (rises.length - 1) / (rises[rises.length - 1]! - rises[0]!) : 0 };
}

type ScopeProps = { timeDiv: string; ch1VDiv: string; ch2VDiv: string; ch1Pos: number; ch2Pos: number; trigSrc: string; edge: string; level: number; mode: string; run: boolean; ch2: boolean };

const SX = 1, SY = -19.5, SW = 20, SH = 16;

export const scope: PartDef<ScopeProps> = {
  type: 'scope', name: 'Oscilloscope (2 channel)', category: 'Instruments', blurb: 'see voltages change over time',
  mount: 'free',
  box: () => ({ x: -0.5, y: -21, w: 31, h: 22 }),
  pins: () => [{ id: 'CH1', label: 'CH1 probe', x: 6, y: 0 }, { id: 'CH2', label: 'CH2 probe', x: 12, y: 0 }, { id: 'GND', label: 'Probe ground clip', x: 18, y: 0 }],
  leadColor: { CH1: '#f3c33b', CH2: '#3fc6d6', GND: '#1d1d1b' },
  props: [
    { key: 'timeDiv', label: 'Time / div', type: 'select', options: opt(TIME_DIVS, 's') },
    { key: 'ch1VDiv', label: 'CH1 volts / div', type: 'select', options: opt(VOLT_DIVS, 'V') },
    { key: 'ch1Pos', label: 'CH1 position (div)', type: 'range', min: -4, max: 4, step: 0.5 },
    { key: 'ch2', label: 'CH2 on', type: 'bool' },
    { key: 'ch2VDiv', label: 'CH2 volts / div', type: 'select', options: opt(VOLT_DIVS, 'V') },
    { key: 'ch2Pos', label: 'CH2 position (div)', type: 'range', min: -4, max: 4, step: 0.5 },
    { key: 'trigSrc', label: 'Trigger source', type: 'select', options: [['1', 'CH1'], ['2', 'CH2']] },
    { key: 'edge', label: 'Trigger edge', type: 'select', options: [['rise', 'Rising ↑'], ['fall', 'Falling ↓']] },
    { key: 'level', label: 'Trigger level', type: 'number', unit: 'V' },
    { key: 'mode', label: 'Trigger mode', type: 'select', options: [['auto', 'Auto'], ['normal', 'Normal'], ['single', 'Single']] },
    { key: 'run', label: 'Running', type: 'bool' },
  ],
  defaults: { timeDiv: '0.001', ch1VDiv: '1', ch2VDiv: '1', ch1Pos: 0, ch2Pos: 0, trigSrc: '1', edge: 'rise', level: 0, mode: 'auto', run: true, ch2: true },
  info: [
    ['Volts / div', 'How many volts one grid square is tall. Smaller = bigger trace.'],
    ['Time / div', 'How much time one grid square is wide. 10 squares = one screen.'],
    ['Trigger', 'Starts each sweep where the signal crosses the level, so a repeating wave stands still.'],
    ['GND clip', 'Must go to the circuit ground, or the trace floats and means nothing.'],
    ['Timestep', 'The simulation needs ≥ 20 steps per division to draw a wave properly.'],
  ],
  build(ctx, p0) {
    let p = { ...p0 };
    ctx.add(new Resistor(ctx.pin('CH1'), ctx.pin('GND'), 1e6));
    ctx.add(new Resistor(ctx.pin('CH2'), ctx.pin('GND'), 1e6));
    const ring = new Ring(2);
    let dt = 0, frozen: Live | null = null, armed = true;
    const rt: Runtime = {
      update(q) {
        const prev = p;
        p = { ...p, ...(q as Partial<ScopeProps>) };
        if (p.run && !prev.run) { frozen = null; armed = true; }
        if (p.timeDiv !== prev.timeDiv) ring.clear();
        return true;
      },
      sample(sim: Simulator, v) {
        dt = sim.dt;
        if (!p.run) return;
        if (sim.t < ring.last) ring.clear();
        const minGap = (+p.timeDiv * 10) / 2000;
        if (sim.t - ring.last < minGap * 0.999) return;
        const g = v('GND');
        ring.push(sim.t, [v('CH1') - g, v('CH2') - g]);
      },
      read() {
        if (frozen) return frozen;
        const td = +p.timeDiv, span = td * 10, now = ring.last, src = p.trigSrc === '2' ? 1 : 0;
        const warn = dt > 0 && td / dt < 20 ? `Timestep too coarse for ${formatSI(td, 's')}/div — pick a smaller timestep (≤ ${formatSI(td / 20, 's')})` : '';
        let start = now - span, triggered = false;
        const ti = ring.n > 1 ? findTrigger(ring, src, p.level, p.edge !== 'fall', now - span * 0.9) : -1;
        if (ti >= 0) { start = ring.t[ring.idx(ti)]! - span * 0.1; triggered = true; }
        else if (p.mode !== 'auto') return { x: [], a: [], b: [], waiting: true, warn, triggered: false };
        const ts: number[] = [], a: number[] = [], b: number[] = [];
        for (let i = 0; i < ring.n; i++) {
          const j = ring.idx(i), t = ring.t[j]!;
          if (t < start || t > start + span) continue;
          ts.push(t); a.push(ring.ch[0]![j]!); b.push(ring.ch[1]![j]!);
        }
        const every = Math.max(1, Math.ceil(ts.length / MAX_PTS));
        const x: number[] = [], da: number[] = [], db: number[] = [];
        for (let i = 0; i < ts.length; i += every) { x.push((ts[i]! - start) / span); da.push(a[i]!); db.push(b[i]!); }
        const stats = (vs: number[]) => {
          if (!vs.length) return { vpp: 0, avg: 0, freq: 0 };
          const lo = Math.min(...vs), hi = Math.max(...vs), avg = vs.reduce((s, q) => s + q, 0) / vs.length;
          return { vpp: hi - lo, avg, freq: hi - lo > 0.02 ? edgesFreq(ts, vs, (hi + lo) / 2).freq : 0 };
        };
        const s1 = stats(a), s2 = stats(b);
        const out: Live = { x, a: da, b: db, triggered, warn, vpp1: s1.vpp, avg1: s1.avg, f1: s1.freq, vpp2: s2.vpp, avg2: s2.avg, f2: s2.freq, startPhase: da[0] ?? 0 };
        if (p.mode === 'single' && triggered && armed) { armed = false; frozen = { ...out, held: true }; }
        return out;
      },
    };
    return rt;
  },
  render({ props: p, live, act }) {
    const td = +p.timeDiv, gx = u(SX), gy = u(SY), gw = u(SW), gh = u(SH), dv = gw / 10, dh = gh / 8;
    const trace = (ys: number[] | undefined, vdiv: number, pos: number, color: string) => {
      const xs = live.x as number[] | undefined;
      if (!xs?.length || !ys?.length) return null;
      const pts = xs.map((f, i) => `${(gx + f * gw).toFixed(1)},${Math.max(gy - 3, Math.min(gy + gh + 3, gy + gh / 2 - (ys[i]! / vdiv + pos) * dh)).toFixed(1)}`).join(' ');
      return <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />;
    };
    const btn = (x: number, y: number, w: number, label: string, patch: Partial<ScopeProps>, on = false) => (
      <g data-interactive onPointerDown={e => { stop(e); act(patch); }} style={{ cursor: 'pointer' }}>
        <rect x={u(x)} y={u(y)} width={u(w)} height={u(1.5)} rx={6} fill={on ? INK : PAPER} stroke={INK} strokeWidth={1.2} />
        <Label x={x + w / 2} y={y + 1.08} size={8} color={on ? PAPER : INK}>{label}</Label>
      </g>
    );
    const lvlY = gy + gh / 2 - (p.level / +(p.trigSrc === '2' ? p.ch2VDiv : p.ch1VDiv) + (p.trigSrc === '2' ? p.ch2Pos : p.ch1Pos)) * dh;
    const m = (k: string) => (live[k] as number | undefined) ?? 0;
    return (
      <g>
        <rect x={u(-0.5)} y={u(-21)} width={u(31)} height={u(21.6)} rx={12} fill="#cfd3d6" stroke={INK} strokeWidth={1.6} />
        <rect x={gx - 6} y={gy - 6} width={gw + 12} height={gh + 12} rx={8} fill="#1f2a27" stroke={INK} strokeWidth={1.2} />
        {Array.from({ length: 11 }, (_, i) => <line key={'v' + i} x1={gx + i * dv} y1={gy} x2={gx + i * dv} y2={gy + gh} stroke={i === 5 ? '#4f6b62' : '#33463f'} strokeWidth={i === 5 ? 1 : 0.6} />)}
        {Array.from({ length: 9 }, (_, i) => <line key={'h' + i} x1={gx} y1={gy + i * dh} x2={gx + gw} y2={gy + i * dh} stroke={i === 4 ? '#4f6b62' : '#33463f'} strokeWidth={i === 4 ? 1 : 0.6} />)}
        {p.ch2 && trace(live.b as number[], +p.ch2VDiv, p.ch2Pos, '#3fc6d6')}
        {trace(live.a as number[], +p.ch1VDiv, p.ch1Pos, '#f3c33b')}
        <line x1={gx + gw * 0.1} y1={gy} x2={gx + gw * 0.1} y2={gy + 6} stroke="#ff8a7a" strokeWidth={2} />
        <path d={`M${gx + gw + 2},${lvlY} l6,-4 l0,8 z`} fill="#ff8a7a" />
        <text x={gx + 4} y={gy + 10} fontSize={8} fill="#f3c33b" fontFamily="ui-monospace,Menlo,monospace">CH1 {formatSI(+p.ch1VDiv, 'V')}/div</text>
        {p.ch2 && <text x={gx + 76} y={gy + 10} fontSize={8} fill="#3fc6d6" fontFamily="ui-monospace,Menlo,monospace">CH2 {formatSI(+p.ch2VDiv, 'V')}/div</text>}
        <text x={gx + gw - 4} y={gy + 10} fontSize={8} fill="#9be3b4" textAnchor="end" fontFamily="ui-monospace,Menlo,monospace">{formatSI(td, 's')}/div {!p.run ? 'STOP' : live.held ? 'HELD' : live.waiting ? 'WAIT' : live.triggered ? 'TRIG' : 'AUTO'}</text>
        {!!live.warn && <text x={gx + gw / 2} y={gy + gh - 6} fontSize={7.5} fill="#ff8a7a" textAnchor="middle" fontFamily="ui-monospace,Menlo,monospace">⚠ {String(live.warn).slice(0, 62)}</text>}
        <Label x={22} y={-19} size={8} anchor="start">CH1 Vpp {formatSI(m('vpp1'), 'V')}</Label>
        <Label x={22} y={-18} size={8} anchor="start">avg {formatSI(m('avg1'), 'V')}</Label>
        <Label x={22} y={-17} size={8} anchor="start">f {m('f1') ? formatSI(m('f1'), 'Hz') : '—'}</Label>
        {p.ch2 && <><Label x={22} y={-15.6} size={8} anchor="start" color="#1c7f8a">CH2 Vpp {formatSI(m('vpp2'), 'V')}</Label>
          <Label x={22} y={-14.6} size={8} anchor="start" color="#1c7f8a">f {m('f2') ? formatSI(m('f2'), 'Hz') : '—'}</Label></>}
        {btn(22, -13, 7.5, p.run ? '■ STOP' : '▶ RUN', { run: !p.run }, p.run)}
        {btn(22, -11, 3.6, 'T −', { timeDiv: step(TIME_DIVS, td, -1) })}{btn(25.9, -11, 3.6, 'T +', { timeDiv: step(TIME_DIVS, td, 1) })}
        {btn(22, -9, 3.6, '1V−', { ch1VDiv: step(VOLT_DIVS, +p.ch1VDiv, -1) })}{btn(25.9, -9, 3.6, '1V+', { ch1VDiv: step(VOLT_DIVS, +p.ch1VDiv, 1) })}
        {btn(22, -7, 3.6, '2V−', { ch2VDiv: step(VOLT_DIVS, +p.ch2VDiv, -1) })}{btn(25.9, -7, 3.6, '2V+', { ch2VDiv: step(VOLT_DIVS, +p.ch2VDiv, 1) })}
        {btn(22, -5, 7.5, p.mode === 'single' ? 'SINGLE (re-arm)' : `TRIG ${p.mode.toUpperCase()}`, p.mode === 'single' ? { run: true } : { mode: p.mode === 'auto' ? 'normal' : p.mode === 'normal' ? 'single' : 'auto' })}
        {([['CH1', 6, '#f3c33b'], ['CH2', 12, '#3fc6d6'], ['GND', 18, INK]] as const).map(([l, x, c]) => (
          <g key={l}><circle cx={u(x)} cy={0} r={6} fill="#2b2b2b" stroke={c} strokeWidth={2.4} /><Label x={x} y={-0.9} size={8}>{l}</Label></g>
        ))}
        <Label x={1} y={-0.9} size={9} anchor="start">SCOPE</Label>
      </g>
    );
  },
};

type LaProps = { timeDiv: string; threshold: string; customV: number; trigCh: string; edge: string; run: boolean };
const LA_W = 20, LA_X = 4, LA_Y = -17, ROW = 1.6;

export const logicAnalyzer: PartDef<LaProps> = {
  type: 'logic-analyzer', name: 'Logic analyzer (8 ch)', category: 'Instruments', blurb: 'see HIGH/LOW on 8 pins over time',
  mount: 'free',
  box: () => ({ x: -0.5, y: -18.5, w: 30, h: 19 }),
  pins: () => [...Array.from({ length: 8 }, (_, k) => ({ id: `D${k}`, label: `Channel D${k}`, x: 2 + k * 2, y: 0 })), { id: 'GND', label: 'Ground clip', x: 19, y: 0 }],
  leadColor: { D0: '#1d1d1b', D1: '#7a4b22', D2: '#d6452f', D3: '#ef8a2b', D4: '#f3c33b', D5: '#3fae66', D6: '#3a6ed6', D7: '#8b5cc7', GND: '#1d1d1b' },
  props: [
    { key: 'timeDiv', label: 'Time / div', type: 'select', options: opt(TIME_DIVS, 's') },
    { key: 'threshold', label: 'Threshold', type: 'select', options: [['1.4', 'TTL 1.4 V'], ['2.5', 'CMOS 5 V (2.5 V)'], ['1.65', 'CMOS 3.3 V (1.65 V)'], ['custom', 'Custom']] },
    { key: 'customV', label: 'Custom threshold', type: 'number', unit: 'V' },
    { key: 'trigCh', label: 'Trigger channel', type: 'select', options: [['none', 'None (free run)'], ...Array.from({ length: 8 }, (_, k) => [String(k), `D${k}`] as [string, string])] },
    { key: 'edge', label: 'Trigger edge', type: 'select', options: [['rise', 'Rising ↑'], ['fall', 'Falling ↓']] },
    { key: 'run', label: 'Running', type: 'bool' },
  ],
  defaults: { timeDiv: '0.001', threshold: '1.4', customV: 1.4, trigCh: '0', edge: 'rise', run: true },
  info: [
    ['What it shows', 'Each row is one wire: up = HIGH, down = LOW, over time'],
    ['Threshold', 'Voltages above it count as HIGH. Match it to your chip family.'],
    ['Trigger', 'Lines the picture up on an edge of one channel so it stands still'],
    ['GND clip', 'Connect it to circuit ground, or every channel reads nonsense'],
  ],
  build(ctx, p0) {
    let p = { ...p0 };
    const pins = Array.from({ length: 8 }, (_, k) => `D${k}`);
    for (const id of pins) ctx.add(new Resistor(ctx.pin(id), ctx.pin('GND'), 1e6));
    const ring = new Ring(8);
    let dt = 0, pulses = 0, lastD0 = 0, now: number[] = new Array(8).fill(0);
    const thr = () => p.threshold === 'custom' ? p.customV : +p.threshold;
    return {
      update(q) { const prev = p; p = { ...p, ...(q as Partial<LaProps>) }; if (p.timeDiv !== prev.timeDiv) ring.clear(); return true; },
      sample(sim, v) {
        dt = sim.dt;
        const g = v('GND'), th = thr();
        now = pins.map(id => v(id) - g > th ? 1 : 0);
        if (now[0] && !lastD0) pulses++;
        lastD0 = now[0]!;
        if (!p.run) return;
        if (sim.t < ring.last) ring.clear();
        if (sim.t - ring.last < (+p.timeDiv * 10) / 2000 * 0.999) return;
        ring.push(sim.t, now);
      },
      read() {
        const td = +p.timeDiv, span = td * 10, end = ring.last;
        let start = end - span, triggered = false;
        if (p.trigCh !== 'none' && ring.n > 1) {
          const ti = findTrigger(ring, +p.trigCh, 0.5, p.edge !== 'fall', end - span * 0.9);
          if (ti >= 0) { start = ring.t[ring.idx(ti)]! - span * 0.1; triggered = true; }
        }
        const out: Live = { triggered, levels: now.join(''), pulses, warn: dt > 0 && td / dt < 20 ? 'Timestep too coarse for this time/div — pick a smaller timestep' : '' };
        const d0t: number[] = [], d0v: number[] = [];
        for (let k = 0; k < 8; k++) {
          const tr: number[] = [];
          let prev = -1;
          for (let i = 0; i < ring.n; i++) {
            const j = ring.idx(i), t = ring.t[j]!;
            if (t < start || t > start + span) continue;
            const lv = ring.ch[k]![j]!;
            if (k === 0) { d0t.push(t); d0v.push(lv); }
            if (lv !== prev && tr.length < MAX_PTS) { tr.push((t - start) / span, lv); prev = lv; }
          }
          out[`c${k}`] = tr;
        }
        out.freq = edgesFreq(d0t, d0v, 0.5).freq;
        return out;
      },
    };
  },
  render({ props: p, live, act }) {
    const gx = u(LA_X), gy = u(LA_Y), gw = u(LA_W), rowH = u(ROW);
    const row = (k: number) => {
      const tr = (live[`c${k}`] as number[] | undefined) ?? [];
      if (!tr.length) return null;
      const yHi = gy + k * rowH + 3, yLo = gy + (k + 1) * rowH - 3;
      let d = '', lastY = 0;
      for (let i = 0; i < tr.length; i += 2) {
        const x = gx + tr[i]! * gw, y = tr[i + 1] ? yHi : yLo;
        d += i === 0 ? `M${x.toFixed(1)},${y}` : ` L${x.toFixed(1)},${lastY} L${x.toFixed(1)},${y}`;
        lastY = y;
      }
      d += ` L${gx + gw},${lastY}`;
      return <path key={k} d={d} fill="none" stroke="#9be3b4" strokeWidth={1.4} />;
    };
    const levels = String(live.levels ?? '00000000');
    return (
      <g>
        <rect x={u(-0.5)} y={u(-18.5)} width={u(30)} height={u(19)} rx={12} fill="#cfd3d6" stroke={INK} strokeWidth={1.6} />
        <rect x={u(1)} y={gy - 6} width={gw + u(3) + 10} height={8 * rowH + 12} rx={8} fill="#1f2a27" stroke={INK} strokeWidth={1.2} />
        {Array.from({ length: 11 }, (_, i) => <line key={i} x1={gx + i * gw / 10} y1={gy} x2={gx + i * gw / 10} y2={gy + 8 * rowH} stroke="#33463f" strokeWidth={0.6} />)}
        {Array.from({ length: 8 }, (_, k) => (
          <g key={k}>
            <text x={u(1.3)} y={gy + k * rowH + rowH / 2 + 3} fontSize={8} fill="#cfd3d6" fontFamily="ui-monospace,Menlo,monospace">D{k}</text>
            <text x={u(3.2)} y={gy + k * rowH + rowH / 2 + 3} fontSize={8} fill={levels[k] === '1' ? '#9be3b4' : '#5a6f68'} fontFamily="ui-monospace,Menlo,monospace">{levels[k]}</text>
          </g>
        ))}
        {Array.from({ length: 8 }, (_, k) => row(k))}
        <Label x={25.5} y={-16} size={8} anchor="start">{formatSI(+p.timeDiv, 's')}/div</Label>
        <Label x={25.5} y={-15} size={8} anchor="start">{p.threshold === 'custom' ? formatSI(p.customV, 'V') : `${p.threshold} V`}</Label>
        <Label x={25.5} y={-13.6} size={8} anchor="start">D0 f</Label>
        <Label x={25.5} y={-12.6} size={8} anchor="start">{(live.freq as number) ? formatSI(live.freq as number, 'Hz') : '—'}</Label>
        <Label x={25.5} y={-11.2} size={8} anchor="start">pulses</Label>
        <Label x={25.5} y={-10.2} size={8} anchor="start">{String(live.pulses ?? 0)}</Label>
        <g data-interactive onPointerDown={e => { stop(e); act({ run: !p.run }); }} style={{ cursor: 'pointer' }}>
          <rect x={u(25.2)} y={u(-8.5)} width={u(4)} height={u(1.5)} rx={6} fill={p.run ? INK : PAPER} stroke={INK} strokeWidth={1.2} />
          <Label x={27.2} y={-7.42} size={8} color={p.run ? PAPER : INK}>{p.run ? '■ STOP' : '▶ RUN'}</Label>
        </g>
        {!!live.warn && <text x={gx + gw / 2} y={gy + 8 * rowH + 14} fontSize={7.5} fill="#b0301f" textAnchor="middle" fontFamily="ui-monospace,Menlo,monospace">⚠ {String(live.warn)}</text>}
        {Array.from({ length: 8 }, (_, k) => (
          <g key={k}><circle cx={u(2 + k * 2)} cy={0} r={5} fill="#2b2b2b" stroke={logicAnalyzer.leadColor![`D${k}`]} strokeWidth={2.4} /><Label x={2 + k * 2} y={-0.8} size={7}>D{k}</Label></g>
        ))}
        <circle cx={u(19)} cy={0} r={5} fill="#2b2b2b" stroke={INK} strokeWidth={2.4} /><Label x={19} y={-0.8} size={7}>GND</Label>
        <Label x={21} y={0.3} size={9} anchor="start">LOGIC</Label>
      </g>
    );
  },
};

export const scopeParts: PartDef<any>[] = [scope, logicAnalyzer];
