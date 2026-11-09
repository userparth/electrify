import { LED, LogicChip, Resistor, type Ctx, type Element, type Level } from '@eb/engine';
import { Glow, INK, Label, Lead, u } from '../draw';
import type { BuildCtx, Live, PartDef, PinDef, RenderArgs } from '../types';

const dipPos = (n: number, k: number) => k <= n / 2 ? { x: k - 1, y: 0 } : { x: n - k, y: -3 };
const dipPins = (names: string[]): PinDef[] => names.map((label, i) => ({ id: String(i + 1), label: `${i + 1} · ${label}`, ...dipPos(names.length, i + 1) }));
const nodesFor = (ctx: BuildCtx, n: number) => Array.from({ length: n + 1 }, (_, i) => i === 0 ? 0 : ctx.pin(String(i)));
const b = (x: boolean): Level => x ? 1 : 0;

function Dip({ names, title, live, selected, accent = '#2b2d31' }: { names: string[]; title: string; live: Live; selected: boolean; accent?: string }) {
  const n = names.length, w = n / 2;
  return (
    <g>
      {names.map((_, i) => { const p = dipPos(n, i + 1); return <rect key={i} x={u(p.x) - 2.5} y={u(p.y) + (p.y === 0 ? -6 : 0)} width={5} height={6} fill="#c9ced2" stroke={INK} strokeWidth={0.6} />; })}
      <rect x={u(-0.5)} y={u(-2.55)} width={u(w)} height={u(2.1)} rx={3} fill={accent} stroke={INK} strokeWidth={1.4} />
      <path d={`M${u(-0.5)},${u(-1.95)} A${u(0.45)},${u(0.45)} 0 0 1 ${u(-0.5)},${u(-1.05)}`} fill="#4a4d55" stroke={INK} strokeWidth={0.8} />
      <circle cx={u(0.05)} cy={u(-0.85)} r={1.8} fill="#cfcab8" />
      <Label x={(w - 1) / 2} y={-1.25} size={n > 8 ? 9 : 8} color="#f2efe7">{title}</Label>
      {live.powered === false && <Label x={(w - 1) / 2} y={-3.9} size={8} color="#d6452f">unpowered: wire the supply pins</Label>}
      {names.map((nm, i) => {
        const p = dipPos(n, i + 1), lv = live[`o${i + 1}`];
        return (
          <g key={`l${i}`}>
            {live.powered !== false && typeof lv === 'number' && <circle cx={u(p.x)} cy={u(p.y === 0 ? -0.75 : -2.25)} r={1.8} fill={lv === 1 ? '#3fae66' : lv === 0 ? '#d6452f' : '#8a8577'} />}
            {selected && <text x={u(p.x)} y={p.y === 0 ? u(-0.95) - 1 : u(-2.05) + 5} fontSize={5.5} fill="#f2efe7" textAnchor="middle" fontFamily="ui-monospace,Menlo,monospace" style={{ pointerEvents: 'none' }}>{nm}</text>}
            {selected && <text x={u(p.x)} y={p.y === 0 ? u(0.95) : u(-3.55)} fontSize={6} fill="#6b665a" textAnchor="middle" fontFamily="ui-monospace,Menlo,monospace" style={{ pointerEvents: 'none' }}>{i + 1}</text>}
          </g>
        );
      })}
    </g>
  );
}

function chipLive(chip: LogicChip): Live {
  const live: Live = { powered: chip.powered };
  for (const [pin, o] of chip.out) live[`o${pin}`] = o.level === 'z' ? -1 : o.level;
  return live;
}

const Q4017 = [3, 2, 4, 7, 10, 1, 5, 6, 9, 11];
class CD4017 extends LogicChip {
  readonly part = 'CD4017'; readonly pinCount = 16; readonly vccPin = 16; readonly gndPin = 8;
  protected readonly inputs = [13, 14, 15];
  protected readonly outputPins = [...Q4017, 12].map(pin => ({ pin }));
  count = 0;
  protected evaluate(get: (p: number) => Level, rose: (p: number) => boolean) {
    if (get(15)) this.count = 0;
    else if (rose(14) && !get(13)) this.count = (this.count + 1) % 10;
    const r: Record<number, Level> = { 12: b(this.count < 5) };
    Q4017.forEach((pin, i) => r[pin] = b(i === this.count));
    return r;
  }
  override reset() { super.reset(); this.count = 0; }
}

const Q595 = [15, 1, 2, 3, 4, 5, 6, 7];
class HC595 extends LogicChip {
  readonly part = '74HC595'; readonly pinCount = 16; readonly vccPin = 16; readonly gndPin = 8;
  protected readonly inputs = [10, 11, 12, 13, 14];
  protected readonly outputPins = [...Q595, 9].map(pin => ({ pin }));
  sr = 0;
  latch = 0;
  protected evaluate(get: (p: number) => Level, rose: (p: number) => boolean) {
    if (!get(10)) this.sr = 0;
    // The storage register copies before the shift, so tying both clocks leaves it one step behind (as on the real chip).
    if (rose(12)) this.latch = this.sr;
    if (rose(11) && get(10)) this.sr = ((this.sr << 1) | get(14)) & 0xff;
    const r: Record<number, Level | 'z'> = { 9: b(!!(this.sr & 0x80)) };
    Q595.forEach((pin, i) => r[pin] = get(13) ? 'z' : b(!!(this.latch & (1 << i))));
    return r;
  }
  override reset() { super.reset(); this.sr = 0; this.latch = 0; }
}

class HC161 extends LogicChip {
  readonly part = '74HC161'; readonly pinCount = 16; readonly vccPin = 16; readonly gndPin = 8;
  protected readonly inputs = [1, 2, 3, 4, 5, 6, 7, 9, 10];
  protected readonly outputPins = [14, 13, 12, 11, 15].map(pin => ({ pin }));
  count = 0;
  protected evaluate(get: (p: number) => Level, rose: (p: number) => boolean) {
    if (!get(1)) this.count = 0;
    else if (rose(2)) {
      if (!get(9)) this.count = get(3) + 2 * get(4) + 4 * get(5) + 8 * get(6);
      else if (get(7) && get(10)) this.count = (this.count + 1) & 15;
    }
    const c = this.count;
    return { 14: b(!!(c & 1)), 13: b(!!(c & 2)), 12: b(!!(c & 4)), 11: b(!!(c & 8)), 15: b(!!get(10) && c === 15) };
  }
  override reset() { super.reset(); this.count = 0; }
}

const P14: [number, number][] = [[1, 2], [3, 4], [5, 6], [9, 8], [11, 10], [13, 12]];
/** The base LogicChip input stage already switches at 70 % / 30 % of VCC, which is the Schmitt hysteresis. */
class HC14 extends LogicChip {
  readonly part = '74HC14'; readonly pinCount = 14; readonly vccPin = 14; readonly gndPin = 7;
  protected readonly inputs = P14.map(([a]) => a);
  protected readonly outputPins = P14.map(([, y]) => ({ pin: y }));
  protected evaluate(get: (p: number) => Level) { const r: Record<number, Level> = {}; for (const [a, y] of P14) r[y] = b(!get(a)); return r; }
}

type ChipCtor = new (pins: number[], name?: string) => LogicChip;
function logicPart(type: string, title: string, name: string, blurb: string, Ctor: ChipCtor, names: string[], use: string, extra: [string, string][] = []): PartDef<{}> {
  const n = names.length, vcc = names.findIndex(x => x === 'VCC' || x === 'VDD') + 1, gnd = names.findIndex(x => x === 'GND' || x === 'VSS') + 1;
  return {
    type, name, category: 'Digital ICs', blurb,
    box: () => ({ x: -0.6, y: -3.4, w: n / 2 + 0.2, h: 3.8 }),
    pins: () => dipPins(names),
    props: [], defaults: {},
    build(ctx) { const chip = ctx.add(new Ctor(nodesFor(ctx, n), title)); return { read: () => chipLive(chip) }; },
    info: [['Power', `Pin ${vcc} to + supply and pin ${gnd} to 0 V — without them it does nothing`], ['Pin 1', 'Next to the dot / notch, numbers run anticlockwise'], ['Use', use], ...extra],
    render: ({ live, selected }: RenderArgs<{}>) => <Dip names={names} title={title} live={live} selected={selected} />,
  };
}

export const cd4017 = logicPart('cd4017', 'CD4017', 'CD4017 decade counter', 'LED chaser: one of 10 outputs HIGH', CD4017,
  ['Q5', 'Q1', 'Q0', 'Q2', 'Q6', 'Q7', 'Q3', 'VSS', 'Q8', 'Q4', 'Q9', 'CO', 'CLK INH', 'CLK', 'RST', 'VDD'],
  'Each rising CLK edge moves the HIGH output one step: Q0 → Q1 → … → Q9 → Q0. Feed it a 555 clock for a running light.',
  [['Supply', 'CMOS: works from 3 V to 15 V'], ['Must tie', 'CLK INH (13) and RST (15) to 0 V for counting'], ['Outputs', 'Weak — use a resistor per LED']]);
export const hc595 = logicPart('74hc595', '74HC595', '74HC595 shift register', '3 wires in, 8 outputs', HC595,
  ['QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH', 'GND', "QH'", 'SRCLR', 'SRCLK', 'RCLK', 'OE', 'SER', 'QA', 'VCC'],
  'Put a bit on SER, pulse SRCLK to shift it in; after 8 bits pulse RCLK to show them on QA–QH.',
  [['Tie', 'SRCLR (10) to VCC, OE (13) to GND'], ["QH'", 'Chain to the next 595’s SER for 16, 24 … outputs'], ['Arduino', 'shiftOut(dataPin, clockPin, MSBFIRST, value) drives it']]);
export const hc161 = logicPart('74hc161', '74HC161', '74HC161 4-bit counter', 'counts 0–15 in binary', HC161,
  ['CLR', 'CLK', 'A', 'B', 'C', 'D', 'ENP', 'GND', 'LOAD', 'ENT', 'QD', 'QC', 'QB', 'QA', 'RCO', 'VCC'],
  'Counts rising CLK edges in binary on QA (1s), QB (2s), QC (4s), QD (8s).',
  [['Tie', 'CLR, LOAD, ENP and ENT to VCC to count'], ['RCO', 'Goes HIGH at 15 — connect to the next counter for 8 bits']]);
export const hc14 = logicPart('74hc14', '74HC14', '74HC14 Schmitt inverter', '6 × NOT with hysteresis', HC14,
  ['1A', '1Y', '2A', '2Y', '3A', '3Y', 'GND', '4Y', '4A', '5Y', '5A', '6Y', '6A', 'VCC'],
  'Cleans up slow or noisy signals: switches HIGH only above ~70 % and LOW only below ~30 % of VCC.',
  [['Oscillator', 'Resistor from output to input + capacitor from input to GND = square-wave clock (≈ 1/(1.7·R·C) Hz)']]);

const smin = (a: number, c: number) => (a + c - Math.sqrt((a - c) ** 2 + 1e-4)) / 2;
const smax = (a: number, c: number) => (a + c + Math.sqrt((a - c) ** 2 + 1e-4)) / 2;

/** Stamps a multi-terminal device from its terminal-current function with a finite-difference Jacobian. */
function stampNumeric(ctx: Ctx, nodes: number[], f: (v: number[]) => number[]) {
  const v = nodes.map(n => ctx.v(n)), i0 = f(v), J = nodes.map(() => nodes.map(() => 0));
  for (let c = 0; c < nodes.length; c++) {
    const w = v.slice(); w[c]! += 1e-6;
    const i1 = f(w);
    for (let r = 0; r < nodes.length; r++) J[r]![c] = (i1[r]! - i0[r]!) / 1e-6;
  }
  ctx.jacobian(nodes, i0, J);
}

/** One op-amp: very high gain, output swing limited inside the rails, ~20 mA current limit. */
export class OpAmp implements Element {
  nonlinear = true;
  constructor(public inP: number, public inN: number, public out: number, public vPos: number, public vNeg: number, public gain = 1e5, public rout = 50, public ilimit = 0.02, public name?: string) {}
  // Currents into the device at [out, in+, in−, V+, V−]; output current is drawn from the rail it flows through.
  f = (v: number[]) => {
    const [vo, vp, vn, vpos, vneg] = v as [number, number, number, number, number];
    const lo = vneg + 0.02, hi = Math.max(lo, vpos - 1.5), half = (hi - lo) / 2, mid = (hi + lo) / 2;
    const target = half > 1e-6 ? mid + half * Math.tanh(this.gain * (vp - vn) / half) : lo;
    const raw = (target - vo) / this.rout, io = this.ilimit * Math.tanh(raw / this.ilimit) + 1e-3 * raw;
    return [-io, 0, 0, io > 0 ? io : 0, io < 0 ? io : 0];
  };
  private xLast = 0;
  private voLast = NaN;
  stamp(ctx: Ctx) {
    const nodes = [this.out, this.inP, this.inN, this.vPos, this.vNeg], v = nodes.map(n => ctx.v(n));
    const half = Math.max(1e-3, (v[3]! - 1.5 - v[4]! - 0.02) / 2), x = this.gain * (v[1]! - v[2]!) / half;
    // Like SPICE junction limiting: walk the huge-gain stage through its linear region instead of jumping rail to rail.
    let xs = x;
    if (!(Math.abs(x) > 4 && Math.abs(this.xLast) > 4 && Math.sign(x) === Math.sign(this.xLast))) xs = this.xLast + Math.max(-2, Math.min(2, x - this.xLast));
    if (xs !== x) ctx.limited();
    this.xLast = xs;
    const lin = v.slice(); lin[2] = lin[1]! - xs * half / this.gain;
    // The current limit is flat far from target, so an unloaded output would bounce; walk it there in 1 V steps.
    if (Number.isFinite(this.voLast) && Math.abs(v[0]! - this.voLast) > 1) { lin[0] = this.voLast + Math.sign(v[0]! - this.voLast); ctx.limited(); }
    this.voLast = lin[0]!;
    const i0 = this.f(lin), J = nodes.map(() => nodes.map(() => 0));
    for (let c = 0; c < nodes.length; c++) { const w = lin.slice(); w[c]! += 1e-6; const i1 = this.f(w); for (let r = 0; r < nodes.length; r++) J[r]![c] = (i1[r]! - i0[r]!) / 1e-6; }
    const adj = i0.map((iv, r) => iv + J[r]!.reduce((acc, g, c) => acc + g * (v[c]! - lin[c]!), 0));
    ctx.jacobian(nodes, adj, J);
  }
  reset() { this.xLast = 0; this.voLast = NaN; }
}

/** Open-collector comparator: pulls OUT to V− when in− is above in+. */
export class Comparator implements Element {
  nonlinear = true;
  constructor(public inP: number, public inN: number, public out: number, public vNeg: number, public name?: string) {}
  f = (v: number[]) => {
    const [vo, vp, vn, vneg] = v as [number, number, number, number];
    const x = Math.max(-40, Math.min(40, (vn - vp) / 0.002)), g = (1 / 15) / (1 + Math.exp(-x)) + 1e-9;
    const i = 0.016 * Math.tanh(g * (vo - vneg) / 0.016);
    return [i, 0, 0, -i];
  };
  stamp(ctx: Ctx) { stampNumeric(ctx, [this.out, this.inP, this.inN, this.vNeg], this.f); }
}

/** 78xx: holds OUT at `volts` above GND, needs ~2 V of headroom, current-limited, cannot sink. */
/** Linear regulator: a 50 mΩ voltage source at min(set, Vin − dropout), switching to constant current at the limit; the input supplies the output current. */
export class LinearRegulator implements Element {
  readonly branches = 1;
  branch0 = 0;
  mode: 'CV' | 'CC' = 'CV';
  target = 0;
  iout = 0;
  constructor(public input: number, public gnd: number, public out: number, public volts = 5, public dropout = 2, public ilimit = 1.5, public name?: string) {}
  beginStep(ctx: Ctx) {
    const vin = ctx.prev(this.input) - ctx.prev(this.gnd), vout = ctx.prev(this.out) - ctx.prev(this.gnd);
    this.target = Math.max(0, Math.min(this.volts, vin - this.dropout));
    this.iout = Math.max(0, -ctx.branch(this.branch0));
    if (this.mode === 'CV' && this.iout > this.ilimit) this.mode = 'CC';
    else if (this.mode === 'CC' && vout > this.target) this.mode = 'CV';
  }
  stamp(ctx: Ctx) {
    ctx.conductance(this.input, this.gnd, 1 / 2000);
    ctx.current(this.input, this.gnd, Math.min(this.iout, this.ilimit));
    if (this.mode === 'CC') ctx.currentBranch(this.branch0, this.out, this.gnd, this.ilimit);
    else ctx.voltageSource(this.branch0, this.out, this.gnd, this.target, 0.05);
  }
  reset() { this.mode = 'CV'; this.iout = 0; }
}

const OPAMP_NAMES = ['OUT1', 'IN1−', 'IN1+', 'GND', 'IN2+', 'IN2−', 'OUT2', 'VCC'];

export const lm358: PartDef<{}> = {
  type: 'lm358', name: 'LM358 dual op-amp', category: 'Digital ICs', blurb: 'amplifier, buffer, comparator',
  box: () => ({ x: -0.6, y: -3.4, w: 4.2, h: 3.8 }),
  pins: () => dipPins(OPAMP_NAMES),
  props: [], defaults: {},
  build(ctx) {
    const n = nodesFor(ctx, 8);
    ctx.add(new Resistor(n[8]!, n[4]!, 9000));
    ctx.add(new OpAmp(n[3]!, n[2]!, n[1]!, n[8]!, n[4]!, 1e5, 50, 0.02, 'op-amp A'));
    ctx.add(new OpAmp(n[5]!, n[6]!, n[7]!, n[8]!, n[4]!, 1e5, 50, 0.02, 'op-amp B'));
    return { read: (_s, v) => ({ powered: v('8') - v('4') > 3, out1: v('1') - v('4'), out2: v('7') - v('4') }) };
  },
  info: [['Power', 'Pin 8 to + (3–30 V), pin 4 to 0 V'], ['Golden rules', 'With feedback, it makes IN+ and IN− equal, and its inputs draw no current'],
    ['Non-inverting gain', '1 + R2/R1 (R2 from OUT to IN−, R1 from IN− to GND)'], ['Output swing', 'From about 0 V up to VCC − 1.5 V; it cannot reach the top rail'],
    ['As comparator', 'Without feedback the output slams to a rail: HIGH when IN+ > IN−']],
  render: ({ live, selected }) => <Dip names={OPAMP_NAMES} title="LM358" live={{ powered: live.powered as boolean }} selected={selected} />,
};

export const lm393: PartDef<{}> = {
  type: 'lm393', name: 'LM393 dual comparator', category: 'Digital ICs', blurb: 'is IN+ above IN−? (open collector)',
  box: () => ({ x: -0.6, y: -3.4, w: 4.2, h: 3.8 }),
  pins: () => dipPins(OPAMP_NAMES),
  props: [], defaults: {},
  build(ctx) {
    const n = nodesFor(ctx, 8);
    ctx.add(new Resistor(n[8]!, n[4]!, 12000));
    const a = ctx.add(new Comparator(n[3]!, n[2]!, n[1]!, n[4]!, 'comparator A')), c = ctx.add(new Comparator(n[5]!, n[6]!, n[7]!, n[4]!, 'comparator B'));
    return { read: (_s, v) => ({ powered: v('8') - v('4') > 2, o1: a.f(['1', '3', '2', '4'].map(v))[0]! > 5e-4 ? 0 : -1, o7: c.f(['7', '5', '6', '4'].map(v))[0]! > 5e-4 ? 0 : -1 }) };
  },
  info: [['Power', 'Pin 8 to + (2–36 V), pin 4 to 0 V'], ['Output', 'Open collector: it can only pull LOW. Add a pull-up resistor (e.g. 10 kΩ) to your logic supply'],
    ['Logic', 'Output released (HIGH via pull-up) when IN+ > IN−, pulled LOW otherwise'], ['Use', 'Light/dark switch with an LDR, battery-low alarm, thermostat']],
  render: ({ live, selected }) => <Dip names={OPAMP_NAMES} title="LM393" live={live} selected={selected} />,
};

export const lm7805: PartDef<{}> = {
  type: 'lm7805', name: 'LM7805 5 V regulator', category: 'Power', blurb: '7–25 V in → steady 5 V out',
  box: () => ({ x: -0.6, y: -4.6, w: 3.2, h: 5 }),
  pins: () => [{ id: 'IN', label: 'IN (7–25 V)', x: 0, y: 0 }, { id: 'GND', label: 'GND', x: 1, y: 0 }, { id: 'OUT', label: 'OUT (5 V)', x: 2, y: 0 }],
  props: [], defaults: {},
  build(ctx) {
    const reg = ctx.add(new LinearRegulator(ctx.pin('IN'), ctx.pin('GND'), ctx.pin('OUT')));
    return {
      read: (_s, v) => {
        const vin = v('IN') - v('GND'), vout = v('OUT') - v('GND'), i = reg.iout;
        return { vin, vout, amps: i, watts: Math.max(0, (vin - vout) * i), dropout: vin > 0.5 && vin < 7 };
      },
    };
  },
  info: [['Pins (facing the label)', 'IN · GND · OUT'], ['Headroom', 'Needs about 2 V more in than out: below ~7 V in, the output sags'],
    ['Heat', '(Vin − 5 V) × current is burned as heat — 12 V at 0.5 A is 3.5 W, it needs a heatsink'], ['Capacitors', 'Real circuits put 0.33 µF on IN and 0.1 µF on OUT']],
  render: ({ live }) => {
    const hot = Math.min(1, ((live.watts as number) || 0) / 2);
    return (
      <g>
        {[0, 1, 2].map(x => <Lead key={x} x1={x} y1={0} x2={x} y2={-1.2} />)}
        <rect x={u(-0.5)} y={u(-4.4)} width={u(3)} height={u(1.4)} rx={2} fill="#b9bec3" stroke={INK} strokeWidth={1.2} />
        <circle cx={u(1)} cy={u(-3.7)} r={3.5} fill="#efeadd" stroke={INK} strokeWidth={0.8} />
        <rect x={u(-0.5)} y={u(-3.1)} width={u(3)} height={u(2)} rx={2} fill={hot > 0.5 ? '#5a2a22' : '#2b2b2b'} stroke={INK} strokeWidth={1.2} />
        <Label x={1} y={-1.8} size={7} color="#f2efe7">7805</Label>
        {live.dropout === true && <Label x={1} y={-5.2} size={7} color="#d6452f">input too low</Label>}
        {hot > 0.5 && <text x={u(2.6)} y={u(-3.2)} fontSize={11}>🔥</text>}
      </g>
    );
  },
};

const ldrOhms = (light: number) => 1e6 * Math.pow(1e3 / 1e6, Math.max(0, Math.min(100, light)) / 100);
const ntcOhms = (c: number) => 10000 * Math.exp(3950 * (1 / (c + 273.15) - 1 / 298.15));

function Slider({ value, min, max, onChange, y, color }: { value: number; min: number; max: number; onChange: (v: number) => void; y: number; color: string }) {
  const set = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    onChange(Math.round(min + t * (max - min)));
  };
  const t = (value - min) / (max - min);
  return (
    <g data-interactive>
      <rect x={u(-0.3)} y={u(y) - 3} width={u(2.6)} height={6} rx={3} fill="#e4dfd2" stroke={INK} strokeWidth={0.8} />
      <circle cx={u(-0.3) + u(2.6) * t} cy={u(y)} r={4.5} fill={color} stroke={INK} strokeWidth={1} />
      <rect x={u(-0.3)} y={u(y) - 7} width={u(2.6)} height={14} fill="transparent" style={{ cursor: 'ew-resize' }}
        onPointerDown={e => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); set(e); }}
        onPointerMove={e => { if (e.buttons) set(e); }} />
    </g>
  );
}

type LdrProps = { light: number };
export const ldr: PartDef<LdrProps> = {
  type: 'ldr', name: 'LDR (light sensor)', category: 'Passive', blurb: 'resistance falls in bright light',
  box: () => ({ x: -0.5, y: -2.4, w: 3, h: 3.6 }),
  pins: () => [{ id: '1', label: 'Lead 1', x: 0, y: 0 }, { id: '2', label: 'Lead 2', x: 2, y: 0 }],
  props: [{ key: 'light', label: 'Light level', type: 'range', min: 0, max: 100, step: 1, unit: '%' }],
  defaults: { light: 50 },
  build(ctx, p) {
    const r = ctx.add(new Resistor(ctx.pin('1'), ctx.pin('2'), ldrOhms(p.light)));
    return { read: () => ({ ohms: r.ohms }), update: q => { r.ohms = ldrOhms(Number(q.light)); return true; } };
  },
  info: [['Dark', 'About 1 MΩ'], ['Bright', 'About 1 kΩ'], ['Use', 'With a fixed resistor it makes a voltage that follows the light — feed it to analogRead or a comparator']],
  render: ({ props, act }) => (
    <g>
      <Lead x1={0} y1={0} x2={0.6} y2={-1} /><Lead x1={2} y1={0} x2={1.4} y2={-1} />
      <circle cx={u(1)} cy={u(-1.2)} r={u(0.95)} fill="#e8d9a8" stroke={INK} strokeWidth={1.2} />
      <path d={`M${u(0.4)},${u(-1.5)} h${u(1.2)} M${u(0.4)},${u(-1.2)} h${u(1.2)} M${u(0.4)},${u(-0.9)} h${u(1.2)}`} stroke="#b0301f" strokeWidth={1.4} />
      <circle cx={u(1)} cy={u(-1.2)} r={u(0.95)} fill="#f3c33b" opacity={props.light / 250} />
      <Slider value={props.light} min={0} max={100} y={0.8} color="#f3c33b" onChange={light => act({ light })} />
    </g>
  ),
};

type NtcProps = { temp: number };
export const ntc: PartDef<NtcProps> = {
  type: 'ntc', name: 'NTC thermistor 10 kΩ', category: 'Passive', blurb: 'resistance falls when warm',
  box: () => ({ x: -0.5, y: -2.4, w: 3, h: 3.6 }),
  pins: () => [{ id: '1', label: 'Lead 1', x: 0, y: 0 }, { id: '2', label: 'Lead 2', x: 2, y: 0 }],
  props: [{ key: 'temp', label: 'Temperature', type: 'range', min: -20, max: 100, step: 1, unit: '°C' }],
  defaults: { temp: 25 },
  build(ctx, p) {
    const r = ctx.add(new Resistor(ctx.pin('1'), ctx.pin('2'), ntcOhms(p.temp)));
    return { read: () => ({ ohms: r.ohms }), update: q => { r.ohms = ntcOhms(Number(q.temp)); return true; } };
  },
  info: [['At 25 °C', '10 kΩ'], ['Beta', '3950 (typical): about 4 % less resistance per °C'], ['Use', 'Thermometers and fan controllers: put it in a divider and measure the voltage']],
  render: ({ props, act }) => {
    const warm = Math.max(0, Math.min(1, (props.temp + 20) / 120));
    return (
      <g>
        <Lead x1={0} y1={0} x2={0.7} y2={-1} /><Lead x1={2} y1={0} x2={1.3} y2={-1} />
        <ellipse cx={u(1)} cy={u(-1.3)} rx={u(0.8)} ry={u(0.7)} fill={`rgb(${Math.round(60 + 180 * warm)},${Math.round(90 + 40 * (1 - warm))},${Math.round(200 * (1 - warm))})`} stroke={INK} strokeWidth={1.2} />
        <Label x={1} y={-1.05} size={6} color="#fff">{`${props.temp}°`}</Label>
        <Slider value={props.temp} min={-20} max={100} y={0.8} color="#d6452f" onChange={temp => act({ temp })} />
      </g>
    );
  },
};

/** 5 V relay: ~70 Ω coil, pulls in above 3.5 V, drops out below 1.5 V, SPDT contacts. */
class RelayElement implements Element {
  energized = false;
  clicks = 0;
  constructor(public c1: number, public c2: number, public com: number, public no: number, public nc: number, public name?: string) {}
  beginStep(ctx: Ctx) {
    const v = Math.abs(ctx.prev(this.c1) - ctx.prev(this.c2)), was = this.energized;
    if (!this.energized && v > 3.5) this.energized = true;
    else if (this.energized && v < 1.5) this.energized = false;
    if (was !== this.energized) this.clicks++;
  }
  stamp(ctx: Ctx) {
    ctx.conductance(this.c1, this.c2, 1 / 70);
    ctx.conductance(this.com, this.no, this.energized ? 1 / 0.05 : 1e-12);
    ctx.conductance(this.com, this.nc, this.energized ? 1e-12 : 1 / 0.05);
  }
  reset() { this.energized = false; }
}

export const relay: PartDef<{}> = {
  type: 'relay', name: 'Relay 5 V (SPDT)', category: 'Switches', blurb: 'a small current switches a big one',
  box: () => ({ x: -0.6, y: -4.4, w: 6.2, h: 4.8 }),
  pins: () => [{ id: 'C1', label: 'Coil +', x: 0, y: 0 }, { id: 'C2', label: 'Coil −', x: 1, y: 0 }, { id: 'COM', label: 'COM (common)', x: 3, y: 0 }, { id: 'NO', label: 'NO (normally open)', x: 4, y: 0 }, { id: 'NC', label: 'NC (normally closed)', x: 5, y: 0 }],
  props: [], defaults: {},
  build(ctx) {
    const r = ctx.add(new RelayElement(ctx.pin('C1'), ctx.pin('C2'), ctx.pin('COM'), ctx.pin('NO'), ctx.pin('NC')));
    return { read: (_s, v) => ({ energized: r.energized, clicks: r.clicks, coilV: v('C1') - v('C2') }) };
  },
  info: [['Coil', 'About 70 Ω: 5 V draws ~70 mA — too much for an Arduino pin, drive it through a transistor'],
    ['Flyback diode', 'Real coils kick back a voltage spike when switched off: put a diode across the coil (cathode to +)'],
    ['Contacts', 'COM connects to NC when off and to NO when the coil is on'], ['Isolation', 'The contacts are a separate circuit — that is how a 5 V signal can switch mains (with care!)']],
  render: ({ live }) => (
    <g>
      {[0, 1, 3, 4, 5].map(x => <Lead key={x} x1={x} y1={0} x2={x} y2={-0.6} />)}
      <rect x={u(-0.5)} y={u(-4.2)} width={u(6)} height={u(3.7)} rx={3} fill="#3a6ed6" stroke={INK} strokeWidth={1.4} />
      <Label x={2.5} y={-2.9} size={8} color="#f2efe7">5V RELAY</Label>
      <Label x={2.5} y={-1.8} size={7} color={live.energized ? '#9be3b4' : '#cfd7f2'}>{live.energized ? 'ON · COM→NO' : 'off · COM→NC'}</Label>
      {live.energized === true && <text x={u(5.1)} y={u(-3.4)} fontSize={10}>🔊</text>}
    </g>
  ),
};

export const rgbLed: PartDef<{}> = {
  type: 'rgb-led', name: 'RGB LED (common cathode)', category: 'Output', blurb: 'mix red, green and blue',
  box: () => ({ x: -0.6, y: -2.6, w: 4.2, h: 3.1 }),
  pins: () => [{ id: 'R', label: 'Red anode', x: 0, y: 0 }, { id: 'K', label: 'Common cathode (−, longest leg)', x: 1, y: 0 }, { id: 'G', label: 'Green anode', x: 2, y: 0 }, { id: 'B', label: 'Blue anode', x: 3, y: 0 }],
  props: [], defaults: {},
  build(ctx) {
    const k = ctx.pin('K'), r = ctx.add(new LED(ctx.pin('R'), k, 'red')), g = ctx.add(new LED(ctx.pin('G'), k, 'green')), bl = ctx.add(new LED(ctx.pin('B'), k, 'blue'));
    return { read: () => ({ r: r.brightness, g: g.brightness, b: bl.brightness, burnt: r.burnt || g.burnt || bl.burnt }) };
  },
  info: [['Pins', 'R · cathode (longest) · G · B'], ['Resistors', 'One per colour (blue/green need less, ~3 V; red ~2 V)'], ['Colours', 'Red + green = yellow, all three = white; PWM each pin for any colour']],
  render: ({ live }) => {
    const r = Number(live.r ?? 0), g = Number(live.g ?? 0), bl = Number(live.b ?? 0), on = Math.max(r, g, bl);
    const col = `rgb(${Math.round(90 + 165 * r)},${Math.round(90 + 165 * g)},${Math.round(90 + 165 * bl)})`;
    return (
      <g>
        {[0, 1, 2, 3].map(x => <Lead key={x} x1={x} y1={0} x2={x} y2={-0.9} />)}
        <Glow cx={u(1.5)} cy={u(-1.6)} r={10} color={col} amount={on} />
        <path d={`M${u(0.2)},${u(-0.85)} L${u(0.2)},${u(-1.5)} A${u(1.3)},${u(1)} 0 0 1 ${u(2.8)},${u(-1.5)} L${u(2.8)},${u(-0.85)} Z`} fill={live.burnt ? '#5a5650' : col} fillOpacity={0.6 + 0.4 * on} stroke={INK} strokeWidth={1.2} />
      </g>
    );
  },
};

const BAR_N = 10;
export const barGraph: PartDef<{}> = {
  type: 'bar-graph', name: 'LED bar graph (10)', category: 'Output', blurb: '10 LEDs in one package',
  box: () => ({ x: -0.6, y: -3.4, w: BAR_N + 0.2, h: 3.8 }),
  pins: () => Array.from({ length: BAR_N * 2 }, (_, i) => {
    const k = i + 1, seg = k <= BAR_N ? k : BAR_N * 2 + 1 - k;
    return { id: String(k), label: `${k} · ${k <= BAR_N ? 'anode' : 'cathode'} ${seg}`, ...dipPos(BAR_N * 2, k) };
  }),
  props: [], defaults: {},
  build(ctx) {
    const leds = Array.from({ length: BAR_N }, (_, i) => ctx.add(new LED(ctx.pin(String(i + 1)), ctx.pin(String(BAR_N * 2 - i)), 'red', 0.05, `bar ${i + 1}`)));
    return { read: () => Object.fromEntries(leds.map((l, i) => [`s${i}`, l.burnt ? -1 : l.brightness])) };
  },
  info: [['Pins', 'Bottom row (1–10) are anodes, top row (20–11) the matching cathodes'], ['Resistors', 'One per bar, like 10 separate LEDs'], ['Use', 'Level meters: drive it with a 4017, 595 or Arduino pins']],
  render: ({ live }) => (
    <g>
      <rect x={u(-0.5)} y={u(-2.55)} width={u(BAR_N)} height={u(2.1)} rx={2} fill="#2b2b2b" stroke={INK} strokeWidth={1.4} />
      {Array.from({ length: BAR_N }, (_, i) => {
        const s = Number(live[`s${i}`] ?? 0);
        return <rect key={i} x={u(i) - 3.5} y={u(-2.3)} width={7} height={u(1.6)} rx={1} fill={s < 0 ? '#4a4741' : s > 0.05 ? '#ff5a3c' : '#5a2a22'} opacity={s < 0 ? 1 : 0.55 + 0.45 * Math.max(0, s)} />;
      })}
    </g>
  ),
};

export const icParts: PartDef<any>[] = [cd4017, hc595, hc161, hc14, lm358, lm393, lm7805, ldr, ntc, relay, rgbLed, barGraph];
