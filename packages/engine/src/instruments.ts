import type { Ctx, Element } from './core';

export type Shape = 'sine' | 'square' | 'triangle' | 'saw';

/** Function generator with a 50 Ω output. `amplitude` is peak-to-peak. */
export class FunctionGenerator implements Element {
  readonly branches = 1;
  branch0 = 0;
  on = true;
  constructor(public out: number, public com: number, public s: { shape: Shape; freq: number; amplitude: number; offset: number; duty?: number } = { shape: 'sine', freq: 1000, amplitude: 2, offset: 0 }, public rout = 50, public name?: string) {}
  value(t: number): number {
    if (!this.on) return 0;
    const { shape, freq, amplitude, offset, duty = 0.5 } = this.s, ph = (t * freq) % 1, a = amplitude / 2;
    const w = shape === 'sine' ? Math.sin(2 * Math.PI * ph) : shape === 'square' ? (ph < duty ? 1 : -1) : shape === 'triangle' ? (ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph) : 2 * ph - 1;
    return offset + a * w;
  }
  stamp(ctx: Ctx) { ctx.voltageSource(this.branch0, this.out, this.com, this.value(ctx.t), this.rout); }
}

/** Lab DC supply: constant voltage until the current limit, then constant current. */
export class BenchSupply implements Element {
  readonly branches = 1;
  branch0 = 0;
  on = true;
  mode: 'CV' | 'CC' = 'CV';
  constructor(public pos: number, public neg: number, public volts = 5, public limit = 1, public name?: string) {}
  beginStep(ctx: Ctx) {
    if (!this.on) return;
    const iOut = -ctx.branch(this.branch0), v = ctx.v(this.pos) - ctx.v(this.neg);
    if (this.mode === 'CV' && iOut > this.limit * 1.001) this.mode = 'CC';
    else if (this.mode === 'CC' && v > this.volts) this.mode = 'CV';
  }
  stamp(ctx: Ctx) {
    if (!this.on) { ctx.currentBranch(this.branch0, this.pos, this.neg, 0); return; }
    if (this.mode === 'CC') ctx.currentBranch(this.branch0, this.pos, this.neg, this.limit);
    else ctx.voltageSource(this.branch0, this.pos, this.neg, this.volts, 0.005);
  }
  current(branch: (k: number) => number) { return -branch(this.branch0); }
  reset() { this.mode = 'CV'; }
}
