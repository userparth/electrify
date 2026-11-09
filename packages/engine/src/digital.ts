import type { Circuit, Ctx, Element } from './core';
import { LED, type LedColor } from './semis';

export type Level = 0 | 1;
type Out = { level: Level | 'z'; kind: 'push' | 'oc' };

/**
 * A DIP logic chip powered from its own VCC/GND pins (74HC-style thresholds).
 * `pins[n]` is the circuit node on physical pin n (1-based).
 */
export abstract class LogicChip implements Element {
  abstract readonly part: string;
  abstract readonly pinCount: number;
  abstract readonly vccPin: number;
  abstract readonly gndPin: number;
  protected abstract readonly inputs: number[];
  protected abstract readonly outputPins: { pin: number; kind?: 'push' | 'oc' }[];
  readonly out = new Map<number, Out>();
  private inLevel = new Map<number, Level>();
  private lastIn = new Map<number, Level>();
  powered = false;
  rout = 40;

  constructor(public pins: number[], public name?: string) {}

  protected abstract evaluate(get: (pin: number) => Level, rose: (pin: number) => boolean, fell: (pin: number) => boolean): Record<number, Level | 'z'>;

  level(pin: number): Level { return this.inLevel.get(pin) ?? 0; }
  node(pin: number): number { return this.pins[pin] ?? 0; }

  beginStep(ctx: Ctx) {
    const vcc = ctx.prev(this.node(this.vccPin)), gnd = ctx.prev(this.node(this.gndPin)), vs = vcc - gnd;
    this.powered = vs > 2;
    for (const p of this.inputs) {
      const rel = vs > 0.5 ? (ctx.prev(this.node(p)) - gnd) / vs : 0;
      const prev = this.inLevel.get(p) ?? 0;
      this.lastIn.set(p, prev);
      this.inLevel.set(p, rel > 0.7 ? 1 : rel < 0.3 ? 0 : prev);
    }
    if (!this.powered) { for (const o of this.outputPins) this.out.set(o.pin, { level: 'z', kind: o.kind ?? 'push' }); return; }
    const res = this.evaluate(p => this.level(p), p => this.lastIn.get(p) === 0 && this.level(p) === 1, p => this.lastIn.get(p) === 1 && this.level(p) === 0);
    for (const o of this.outputPins) {
      const lv = res[o.pin] ?? this.out.get(o.pin)?.level ?? 0;
      this.out.set(o.pin, { level: o.kind === 'oc' && lv === 1 ? 'z' : lv, kind: o.kind ?? 'push' });
    }
  }

  stamp(ctx: Ctx) {
    const vcc = this.node(this.vccPin), gnd = this.node(this.gndPin);
    ctx.conductance(vcc, gnd, 1 / 20000);
    for (const o of this.outputPins) {
      const s = this.out.get(o.pin), n = this.node(o.pin);
      const hi = s?.level === 1 && s.kind === 'push', lo = s?.level === 0;
      ctx.conductance(vcc, n, hi ? 1 / this.rout : 1e-12);
      ctx.conductance(n, gnd, lo ? 1 / (s?.kind === 'oc' ? 15 : this.rout) : 1e-12);
    }
  }

  reset() { this.out.clear(); this.inLevel.clear(); this.lastIn.clear(); }
}

type Gate = (a: Level, b: Level) => Level;
const b = (x: boolean): Level => x ? 1 : 0;

abstract class QuadGate extends LogicChip {
  readonly pinCount = 14; readonly vccPin = 14; readonly gndPin = 7;
  protected readonly gates: [number, number, number][] = [[1, 2, 3], [4, 5, 6], [9, 10, 8], [12, 13, 11]];
  protected abstract fn: Gate;
  protected get inputs() { return this.gates.flatMap(([a, c]) => [a, c]); }
  protected get outputPins() { return this.gates.map(([, , y]) => ({ pin: y })); }
  protected evaluate(get: (p: number) => Level) {
    const r: Record<number, Level> = {};
    for (const [a, c, y] of this.gates) r[y] = this.fn(get(a), get(c));
    return r;
  }
}

export class IC7400 extends QuadGate { readonly part = '74HC00 quad NAND'; protected fn: Gate = (x, y) => b(!(x && y)); }
export class IC7408 extends QuadGate { readonly part = '74HC08 quad AND'; protected fn: Gate = (x, y) => b(!!(x && y)); }
export class IC7432 extends QuadGate { readonly part = '74HC32 quad OR'; protected fn: Gate = (x, y) => b(!!(x || y)); }
export class IC7486 extends QuadGate { readonly part = '74HC86 quad XOR'; protected fn: Gate = (x, y) => b(x !== y); }
export class IC7402 extends QuadGate {
  readonly part = '74HC02 quad NOR';
  protected override readonly gates: [number, number, number][] = [[2, 3, 1], [5, 6, 4], [8, 9, 10], [11, 12, 13]];
  protected fn: Gate = (x, y) => b(!(x || y));
}

export class IC7404 extends LogicChip {
  readonly part = '74HC04 hex inverter'; readonly pinCount = 14; readonly vccPin = 14; readonly gndPin = 7;
  private pairs: [number, number][] = [[1, 2], [3, 4], [5, 6], [9, 8], [11, 10], [13, 12]];
  protected get inputs() { return this.pairs.map(([a]) => a); }
  protected get outputPins() { return this.pairs.map(([, y]) => ({ pin: y })); }
  protected evaluate(get: (p: number) => Level) { const r: Record<number, Level> = {}; for (const [a, y] of this.pairs) r[y] = b(!get(a)); return r; }
}

/** Dual D flip-flop, rising-edge clocked, active-low preset/clear. */
export class IC7474 extends LogicChip {
  readonly part = '74HC74 dual D flip-flop'; readonly pinCount = 14; readonly vccPin = 14; readonly gndPin = 7;
  private ff = [{ clr: 1, d: 2, clk: 3, pre: 4, q: 5, nq: 6 }, { clr: 13, d: 12, clk: 11, pre: 10, q: 9, nq: 8 }];
  private state: Level[] = [0, 0];
  protected get inputs() { return this.ff.flatMap(f => [f.clr, f.d, f.clk, f.pre]); }
  protected get outputPins() { return this.ff.flatMap(f => [{ pin: f.q }, { pin: f.nq }]); }
  protected evaluate(get: (p: number) => Level, rose: (p: number) => boolean) {
    const r: Record<number, Level> = {};
    this.ff.forEach((f, i) => {
      if (!get(f.pre) && !get(f.clr)) { r[f.q] = 1; r[f.nq] = 1; return; }
      if (!get(f.pre)) this.state[i] = 1;
      else if (!get(f.clr)) this.state[i] = 0;
      else if (rose(f.clk)) this.state[i] = get(f.d);
      r[f.q] = this.state[i]!; r[f.nq] = b(!this.state[i]);
    });
    return r;
  }
  override reset() { super.reset(); this.state = [0, 0]; }
}

/** Decade counter: ÷2 on CKA (QA), ÷5 on CKB (QB–QD), falling edges. Tie QA→CKB for BCD. */
export class IC7490 extends LogicChip {
  readonly part = '74LS90 decade counter'; readonly pinCount = 14; readonly vccPin = 5; readonly gndPin = 10;
  protected readonly inputs = [14, 1, 2, 3, 6, 7];
  protected readonly outputPins = [{ pin: 12 }, { pin: 9 }, { pin: 8 }, { pin: 11 }];
  private a: Level = 0;
  private bcd = 0;
  protected evaluate(get: (p: number) => Level, _r: (p: number) => boolean, fell: (p: number) => boolean) {
    if (get(6) && get(7)) { this.a = 1; this.bcd = 4; }
    else if (get(2) && get(3)) { this.a = 0; this.bcd = 0; }
    else {
      if (fell(14)) this.a = b(!this.a);
      if (fell(1)) this.bcd = (this.bcd + 1) % 5;
    }
    return { 12: this.a, 9: b(!!(this.bcd & 1)), 8: b(!!(this.bcd & 2)), 11: b(!!(this.bcd & 4)) };
  }
  get count() { return this.a + 2 * this.bcd; }
  override reset() { super.reset(); this.a = 0; this.bcd = 0; }
}

/** 3-to-8 decoder with active-low outputs. */
export class IC74138 extends LogicChip {
  readonly part = '74HC138 3-to-8 decoder'; readonly pinCount = 16; readonly vccPin = 16; readonly gndPin = 8;
  protected readonly inputs = [1, 2, 3, 4, 5, 6];
  private ys = [15, 14, 13, 12, 11, 10, 9, 7];
  protected get outputPins() { return this.ys.map(pin => ({ pin })); }
  protected evaluate(get: (p: number) => Level) {
    const en = get(6) && !get(4) && !get(5), k = get(1) + 2 * get(2) + 4 * get(3), r: Record<number, Level> = {};
    this.ys.forEach((pin, i) => r[pin] = b(!(en && i === k)));
    return r;
  }
}

const SEG: Record<number, string> = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };

/** BCD to 7-segment driver, open-collector active-low outputs (common-anode displays). */
export class IC7447 extends LogicChip {
  readonly part = '74LS47 BCD to 7-segment'; readonly pinCount = 16; readonly vccPin = 16; readonly gndPin = 8;
  protected readonly inputs = [7, 1, 2, 6, 3, 4, 5];
  private segPins: Record<string, number> = { a: 13, b: 12, c: 11, d: 10, e: 9, f: 15, g: 14 };
  protected get outputPins() { return Object.values(this.segPins).map(pin => ({ pin, kind: 'oc' as const })); }
  protected evaluate(get: (p: number) => Level) {
    const k = get(7) + 2 * get(1) + 4 * get(2) + 8 * get(6), lamp = !get(3), blank = !get(4);
    const on = lamp ? 'abcdefg' : blank ? '' : SEG[k] ?? '';
    const r: Record<number, Level> = {};
    for (const [s, pin] of Object.entries(this.segPins)) r[pin] = b(!on.includes(s));
    return r;
  }
}

/** NE555: internal 5k divider, two comparators, SR latch, discharge transistor. Pins 1–8. */
export class Timer555 implements Element {
  readonly part = 'NE555 timer';
  private q: Level = 0;
  private mid = 0;
  constructor(public pins: number[], public name?: string) {}
  init(c: Circuit) { this.mid = c.node(); }
  private n(p: number) { return this.pins[p] ?? 0; }
  beginStep(ctx: Ctx) {
    const v = (p: number) => ctx.prev(this.n(p)), gnd = v(1), ctrl = v(5) - gnd;
    if (v(8) - gnd < 3) { this.q = 0; return; }
    if (v(4) - gnd < 0.7) { this.q = 0; return; }
    const trig = v(2) - gnd < ctrl / 2, thr = v(6) - gnd > ctrl;
    if (trig) this.q = 1; else if (thr) this.q = 0;
  }
  stamp(ctx: Ctx) {
    const vcc = this.n(8), gnd = this.n(1), ctrl = this.n(5), out = this.n(3), dis = this.n(7);
    ctx.conductance(vcc, ctrl, 1 / 5000); ctx.conductance(ctrl, this.mid, 1 / 5000); ctx.conductance(this.mid, gnd, 1 / 5000);
    ctx.conductance(vcc, gnd, 1 / 1500);
    ctx.conductance(vcc, out, this.q ? 1 / 10 : 1e-12);
    ctx.conductance(out, gnd, this.q ? 1e-12 : 1 / 10);
    ctx.conductance(dis, gnd, this.q ? 1e-12 : 1 / 10);
  }
  get output(): Level { return this.q; }
  reset() { this.q = 0; }
}

/** Seven LEDs plus decimal point sharing a common pin. */
export class SevenSegment implements Element {
  readonly segments: Record<string, LED> = {};
  constructor(c: Circuit, segNodes: Record<'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'dp', number>, public common: number, public kind: 'anode' | 'cathode' = 'cathode', color: LedColor = 'red', public name?: string) {
    for (const [s, n] of Object.entries(segNodes)) this.segments[s] = c.add(kind === 'cathode' ? new LED(n, common, color, 0.05, `segment ${s}`) : new LED(common, n, color, 0.05, `segment ${s}`));
  }
  stamp() {}
  get lit(): string { return Object.entries(this.segments).filter(([, l]) => l.brightness > 0.15).map(([s]) => s).join(''); }
}
