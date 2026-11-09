import type { Circuit, Ctx, Element } from './core';

export type Wave = number | ((t: number) => number);
const at = (w: Wave, t: number) => typeof w === 'number' ? w : w(t);

export class Resistor implements Element {
  constructor(public a: number, public b: number, public ohms: number, public name?: string) {}
  stamp(ctx: Ctx) { ctx.conductance(this.a, this.b, 1 / Math.max(this.ohms, 1e-6)); }
  current(v: (n: number) => number) { return (v(this.a) - v(this.b)) / Math.max(this.ohms, 1e-6); }
}

export class Capacitor implements Element {
  private vPrev = 0;
  constructor(public a: number, public b: number, public farads: number, public v0 = 0, public name?: string) { this.vPrev = v0; }
  stamp(ctx: Ctx) {
    if (ctx.mode === 'dc') { ctx.conductance(this.a, this.b, 1e-12); return; }
    const g = this.farads / ctx.dt;
    ctx.conductance(this.a, this.b, g);
    ctx.current(this.a, this.b, -g * this.vPrev);
  }
  accept(ctx: Ctx) { this.vPrev = ctx.v(this.a) - ctx.v(this.b); }
  reset() { this.vPrev = this.v0; }
  get voltage() { return this.vPrev; }
}

export class Inductor implements Element {
  private i = 0;
  constructor(public a: number, public b: number, public henries: number, public i0 = 0, public name?: string) { this.i = i0; }
  stamp(ctx: Ctx) {
    if (ctx.mode === 'dc') { ctx.conductance(this.a, this.b, 1e4); return; }
    ctx.conductance(this.a, this.b, ctx.dt / this.henries);
    ctx.current(this.a, this.b, this.i);
  }
  accept(ctx: Ctx) {
    const v = ctx.v(this.a) - ctx.v(this.b);
    this.i = ctx.mode === 'dc' ? v * 1e4 : this.i + ctx.dt / this.henries * v;
  }
  reset() { this.i = this.i0; }
  get current() { return this.i; }
}

/** Ideal source with optional series resistance. `current` is what flows out of the + terminal. */
export class VoltageSource implements Element {
  readonly branches = 1;
  branch0 = 0;
  enabled = true;
  constructor(public pos: number, public neg: number, public volts: Wave, public series = 0, public name?: string) {}
  value(t: number) { return at(this.volts, t); }
  stamp(ctx: Ctx) {
    if (!this.enabled) { ctx.voltageSource(this.branch0, this.pos, this.neg, 0, 1e9); return; }
    ctx.voltageSource(this.branch0, this.pos, this.neg, this.value(ctx.t), this.series);
  }
  current(branch: (k: number) => number) { return -branch(this.branch0); }
}

/** Pushes `amps` out of `from`, through the source, into `to`. */
export class CurrentSource implements Element {
  constructor(public from: number, public to: number, public amps: Wave, public name?: string) {}
  stamp(ctx: Ctx) { ctx.current(this.from, this.to, at(this.amps, ctx.t)); }
}

export class Switch implements Element {
  constructor(public a: number, public b: number, public closed = false, public ron = 0.01, public name?: string) {}
  stamp(ctx: Ctx) { ctx.conductance(this.a, this.b, this.closed ? 1 / this.ron : 1e-12); }
}

export class Potentiometer implements Element {
  constructor(public a: number, public wiper: number, public b: number, public ohms: number, public position = 0.5, public name?: string) {}
  stamp(ctx: Ctx) {
    const p = Math.min(1, Math.max(0, this.position));
    ctx.conductance(this.a, this.wiper, 1 / Math.max(this.ohms * p, 0.5));
    ctx.conductance(this.wiper, this.b, 1 / Math.max(this.ohms * (1 - p), 0.5));
  }
}

/** Blows after its I²t budget is used up; about 10 ms at 10× the rating. */
export class Fuse implements Element {
  blown = false;
  private heat = 0;
  constructor(public a: number, public b: number, public rating: number, public ohms = 0.01, public name?: string) {}
  stamp(ctx: Ctx) { ctx.conductance(this.a, this.b, this.blown ? 1e-12 : 1 / this.ohms); }
  accept(ctx: Ctx) {
    if (this.blown) return;
    const i = Math.abs((ctx.v(this.a) - ctx.v(this.b)) / this.ohms), r = this.rating;
    const over = i > r ? (i * i - r * r) * (ctx.mode === 'dc' ? 1 : ctx.dt) : -this.heat * 0.01;
    this.heat = Math.max(0, this.heat + over);
    if (this.heat > 0.01 * (10 * r) ** 2 || (ctx.mode === 'dc' && i > 2 * r)) {
      this.blown = true;
      ctx.emit({ kind: 'fuse-blown', severity: 'error', message: `${this.name ?? 'Fuse'} (${r}A) blew at ${i.toFixed(1)}A` });
    }
  }
  reset() { this.blown = false; this.heat = 0; }
}

const OCV: [number, number][] = [[0, 11.5], [0.25, 11.9], [0.5, 12.2], [0.75, 12.4], [1, 12.7]];
const lerp = (T: [number, number][], x: number) => {
  if (x <= T[0]![0]) return T[0]![1];
  for (let i = 1; i < T.length; i++) if (x <= T[i]![0]) { const [a, va] = T[i - 1]!, [b, vb] = T[i]!; return va + (vb - va) * (x - a) / (b - a); }
  return T[T.length - 1]![1];
};

/** Lead-acid battery: open-circuit voltage from state of charge, internal resistance, Ah bookkeeping. */
export class Battery implements Element {
  readonly branches = 1;
  branch0 = 0;
  constructor(public pos: number, public neg: number, public opts: { ah: number; soc: number; rint?: number; table?: [number, number][] } = { ah: 26, soc: 0.95 }, public name?: string) {}
  /** Below ~2 % an empty cell still rests near its cut-off voltage (~10.5 V for 12 V lead-acid) but its resistance soars. */
  private get flat() { return Math.max(0, 0.02 - this.opts.soc) / 0.02; }
  get ocv() { return lerp(this.opts.table ?? OCV, this.opts.soc) * (1 - 0.08 * this.flat); }
  get rint() { return (this.opts.rint ?? 0.03) + 5 * this.flat + 50 * this.flat ** 2; }
  get empty() { return this.opts.soc <= 0.005; }
  stamp(ctx: Ctx) { ctx.voltageSource(this.branch0, this.pos, this.neg, this.ocv, this.rint); }
  accept(ctx: Ctx) {
    if (ctx.mode === 'dc') return;
    const iOut = -ctx.branch(this.branch0);
    this.opts.soc = Math.min(1, Math.max(0, this.opts.soc - iOut * ctx.dt / 3600 / this.opts.ah));
  }
  current(branch: (k: number) => number) { return -branch(this.branch0); }
}

export function series(circuit: Circuit, from: number, to: number, parts: ((a: number, b: number) => Element)[]): Element[] {
  const out: Element[] = [];
  let a = from;
  parts.forEach((mk, i) => { const b = i === parts.length - 1 ? to : circuit.node(); out.push(circuit.add(mk(a, b))); a = b; });
  return out;
}
