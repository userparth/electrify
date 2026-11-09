import { type Ctx, type Element, VT, pnjlim } from './core';

const GMIN = 1e-12;
const expl = (x: number) => x > 80 ? Math.exp(80) * (1 + x - 80) : Math.exp(x);

export interface DiodeParams { is: number; n: number; bv?: number; ibv?: number }

export class Diode implements Element {
  nonlinear = true;
  protected vd = 0;
  protected vcrit: number;
  constructor(public anode: number, public cathode: number, public p: DiodeParams = { is: 2.52e-9, n: 1.752 }, public name?: string) {
    this.vcrit = p.n * VT * Math.log(p.n * VT / (Math.SQRT2 * p.is));
  }
  protected iv(vd: number): [number, number] {
    const nvt = this.p.n * VT, { is } = this.p;
    let i = is * (expl(vd / nvt) - 1), g = is * expl(vd / nvt) / nvt;
    if (this.p.bv != null && vd < -this.p.bv + 1) {
      const ibv = this.p.ibv ?? 1e-3, x = (-vd - this.p.bv) / VT;
      i -= ibv * expl(x); g += ibv * expl(x) / VT;
    }
    return [i + GMIN * vd, g + GMIN];
  }
  stamp(ctx: Ctx) {
    const raw = ctx.v(this.anode) - ctx.v(this.cathode);
    let v = pnjlim(raw, this.vd, this.p.n * VT, this.vcrit);
    if (this.p.bv != null && v < -this.p.bv) v = -pnjlim(-v, -this.vd, VT, this.vcrit);
    if (Math.abs(v - raw) > 1e-9) ctx.limited();
    this.vd = v;
    const [i, g] = this.iv(v);
    ctx.conductance(this.anode, this.cathode, g);
    ctx.current(this.anode, this.cathode, i - g * v);
  }
  current(v: (n: number) => number) { return this.iv(v(this.anode) - v(this.cathode))[0]; }
}

export const LED_COLORS = { red: 1.9, yellow: 2.0, green: 2.1, blue: 3.0, white: 3.1 } as const;
export type LedColor = keyof typeof LED_COLORS;

/** Forward voltage is set at 10 mA; dies above `imax` (amps). */
export class LED extends Diode {
  burnt = false;
  brightness = 0;
  constructor(anode: number, cathode: number, public color: LedColor = 'red', public imax = 0.05, name?: string) {
    super(anode, cathode, { is: 0.01 / Math.exp(LED_COLORS[color] / (2 * VT)), n: 2 }, name);
  }
  override stamp(ctx: Ctx) {
    if (this.burnt) { ctx.conductance(this.anode, this.cathode, 1e-12); return; }
    super.stamp(ctx);
  }
  accept(ctx: Ctx) {
    if (this.burnt) { this.brightness = 0; return; }
    const i = this.iv(ctx.v(this.anode) - ctx.v(this.cathode))[0];
    this.brightness = Math.max(0, Math.min(1, i / 0.02));
    if (i > this.imax) {
      this.burnt = true;
      ctx.emit({ kind: 'led-burnt', severity: 'error', message: `${this.name ?? 'LED'} burnt out at ${(i * 1000).toFixed(0)} mA (needs a series resistor)` });
    }
  }
  reset() { this.burnt = false; this.brightness = 0; }
}

export interface BjtParams { type: 'npn' | 'pnp'; is: number; bf: number; br: number }

/** Ebers–Moll transport model. */
export class BJT implements Element {
  nonlinear = true;
  private vbe = 0;
  private vbc = 0;
  constructor(public c: number, public b: number, public e: number, public p: BjtParams = { type: 'npn', is: 1e-14, bf: 100, br: 1 }, public name?: string) {}
  stamp(ctx: Ctx) {
    const s = this.p.type === 'npn' ? 1 : -1, { is, bf, br } = this.p;
    const vcrit = VT * Math.log(VT / (Math.SQRT2 * is));
    const rbe = s * (ctx.v(this.b) - ctx.v(this.e)), rbc = s * (ctx.v(this.b) - ctx.v(this.c));
    const vbe = pnjlim(rbe, this.vbe, VT, vcrit), vbc = pnjlim(rbc, this.vbc, VT, vcrit);
    if (Math.abs(vbe - rbe) > 1e-9 || Math.abs(vbc - rbc) > 1e-9) ctx.limited();
    this.vbe = vbe; this.vbc = vbc;
    const ef = expl(vbe / VT), er = expl(vbc / VT);
    const icc = is * (ef - 1), iec = is * (er - 1), gf = is * ef / VT + GMIN, gr = is * er / VT + GMIN;
    const ic = icc - iec * (1 + 1 / br), ib = icc / bf + iec / br;
    // Partials w.r.t. node voltages [c, b, e]; vbe = Vb-Ve, vbc = Vb-Vc (times s for PNP).
    const dIc = [gr * (1 + 1 / br), gf - gr * (1 + 1 / br), -gf];
    const dIb = [-gr / br, gf / bf + gr / br, -gf / bf];
    const dIe = dIc.map((d, k) => -(d + dIb[k]!));
    const nodes = [this.c, this.b, this.e];
    const i0 = [s * ic, s * ib, -s * (ic + ib)];
    const vNow = nodes.map(n => ctx.v(n));
    const vLin = [ctx.v(this.b) - s * vbc, ctx.v(this.b), ctx.v(this.b) - s * vbe];
    const J = [dIc, dIb, dIe];
    // Re-centre the linearisation on the limited junction voltages.
    const adj = i0.map((iv, r) => iv + J[r]!.reduce((acc, g, c) => acc + g * (vNow[c]! - vLin[c]!), 0));
    ctx.jacobian(nodes, adj, J);
  }
  accept() {}
}

export interface MosParams { type: 'n' | 'p'; vth: number; k: number; lambda: number }

/** Level-1 square-law MOSFET, body tied to source. */
export class MOSFET implements Element {
  nonlinear = true;
  constructor(public d: number, public g: number, public s: number, public p: MosParams = { type: 'n', vth: 2.1, k: 0.1, lambda: 0.01 }, public name?: string) {}
  private ids(vgs: number, vds: number): [number, number, number] {
    const { vth, k, lambda } = this.p, vov = vgs - vth;
    if (vov <= 0) return [0, 0, 0];
    if (vds < vov) {
      const id = k * (2 * vov * vds - vds * vds) * (1 + lambda * vds);
      return [id, 2 * k * vds * (1 + lambda * vds), k * (2 * vov - 2 * vds) * (1 + lambda * vds) + k * (2 * vov * vds - vds * vds) * lambda];
    }
    const id = k * vov * vov * (1 + lambda * vds);
    return [id, 2 * k * vov * (1 + lambda * vds), k * vov * vov * lambda];
  }
  stamp(ctx: Ctx) {
    const sg = this.p.type === 'n' ? 1 : -1;
    let d = this.d, s = this.s;
    if (sg * (ctx.v(d) - ctx.v(s)) < 0) [d, s] = [s, d];
    const vgs = sg * (ctx.v(this.g) - ctx.v(s)), vds = sg * (ctx.v(d) - ctx.v(s));
    const [id, gm, gds] = this.ids(Math.min(vgs, 50), vds);
    const nodes = [d, this.g, s];
    const dId = [gds + GMIN, gm, -(gm + gds) - GMIN];
    const i0 = [sg * id + GMIN * (ctx.v(d) - ctx.v(s)), 0, -sg * id - GMIN * (ctx.v(d) - ctx.v(s))];
    ctx.jacobian(nodes, i0, [dId, [0, 0, 0], dId.map(x => -x)]);
  }
  drainCurrent(v: (n: number) => number) {
    const sg = this.p.type === 'n' ? 1 : -1;
    const vds = sg * (v(this.d) - v(this.s)), vgs = sg * (v(this.g) - v(vds >= 0 ? this.s : this.d));
    return sg * Math.sign(vds || 1) * this.ids(vgs, Math.abs(vds))[0];
  }
}

/** Photovoltaic module: current source shaped by an exponential knee, with a bypass diode. */
export class SolarPanel implements Element {
  nonlinear = true;
  sun = 1;
  constructor(public pos: number, public neg: number, public p = { isc: 2.83, voc: 24.5, knee: 1.45 }, public name?: string) {}
  get isc() { return this.p.isc * this.sun; }
  get voc() { return this.sun > 0.005 ? this.p.voc + 0.5 * Math.log(this.sun) : 0; }
  iv(v: number): [number, number] {
    const isc = this.isc, voc = this.voc, a = this.p.knee;
    const ex = expl((v - voc) / a);
    let i = isc * (1 - ex), g = isc / a * ex;
    if (v < 0) { const e2 = expl(-v / 0.05); i += 1e-9 * (e2 - 1); g += 1e-9 * e2 / 0.05; }
    return [i, g + GMIN];
  }
  stamp(ctx: Ctx) {
    const v = ctx.v(this.pos) - ctx.v(this.neg), [i, g] = this.iv(v);
    ctx.conductance(this.pos, this.neg, g);
    ctx.current(this.neg, this.pos, i + g * v);
  }
}
