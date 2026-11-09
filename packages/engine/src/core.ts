export type Mode = 'dc' | 'tran';

export interface SimEvent { kind: string; message: string; element?: Element; severity: 'info' | 'warn' | 'error' }

export interface Ctx {
  mode: Mode;
  t: number;
  dt: number;
  v(node: number): number;
  prev(node: number): number;
  branch(k: number): number;
  conductance(a: number, b: number, g: number): void;
  current(a: number, b: number, i: number): void;
  voltageSource(k: number, a: number, b: number, volts: number, series?: number): void;
  /** Forces branch k to deliver `amps` out of `a` and back in at `b`. */
  currentBranch(k: number, a: number, b: number, amps: number): void;
  jacobian(nodes: number[], i0: number[], j: number[][]): void;
  emit(e: Omit<SimEvent, 'element'>): void;
  /** A non-linear part clamped its junction voltage this iteration, so Newton must not stop yet. */
  limited(): void;
}

export interface Element {
  name?: string;
  readonly branches?: number;
  branch0?: number;
  nonlinear?: boolean;
  init?(circuit: Circuit): void;
  beginStep?(ctx: Ctx): void;
  stamp(ctx: Ctx): void;
  accept?(ctx: Ctx): void;
  reset?(): void;
}

export class Circuit {
  readonly gnd = 0;
  private names = new Map<string, number>([['gnd', 0]]);
  nodeCount = 1;
  elements: Element[] = [];

  node(name?: string): number {
    if (name != null) {
      const k = this.names.get(name);
      if (k != null) return k;
      this.names.set(name, this.nodeCount);
    }
    return this.nodeCount++;
  }

  nodeName(id: number): string | undefined {
    for (const [k, v] of this.names) if (v === id) return k;
    return undefined;
  }

  add<T extends Element>(e: T): T {
    this.elements.push(e);
    e.init?.(this);
    return e;
  }

  remove(e: Element) { this.elements = this.elements.filter(x => x !== e); }
}

function luSolve(A: Float64Array, b: Float64Array, n: number): boolean {
  for (let c = 0; c < n; c++) {
    let p = c, best = Math.abs(A[c * n + c]!);
    for (let r = c + 1; r < n; r++) { const a = Math.abs(A[r * n + c]!); if (a > best) { best = a; p = r; } }
    if (best < 1e-30) return false;
    if (p !== c) {
      for (let k = 0; k < n; k++) { const t = A[c * n + k]!; A[c * n + k] = A[p * n + k]!; A[p * n + k] = t; }
      const t = b[c]!; b[c] = b[p]!; b[p] = t;
    }
    const piv = A[c * n + c]!;
    for (let r = c + 1; r < n; r++) {
      const f = A[r * n + c]! / piv;
      if (f === 0) continue;
      for (let k = c; k < n; k++) A[r * n + k]! -= f * A[c * n + k]!;
      b[r]! -= f * b[c]!;
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r]!;
    for (let k = r + 1; k < n; k++) s -= A[r * n + k]! * b[k]!;
    b[r] = s / A[r * n + r]!;
  }
  return true;
}

export interface SimOptions { dt?: number; gmin?: number; maxIter?: number; reltol?: number; abstol?: number }

export class Simulator {
  t = 0;
  dt: number;
  converged = true;
  events: SimEvent[] = [];
  onEvent?: (e: SimEvent) => void;
  private x = new Float64Array(0);
  private xPrev = new Float64Array(0);
  private size = 0;
  private nNodes = 0;
  private opts: Required<SimOptions>;

  constructor(public circuit: Circuit, opts: SimOptions = {}) {
    this.opts = { dt: 1e-5, gmin: 1e-12, maxIter: 150, reltol: 1e-6, abstol: 1e-9, ...opts };
    this.dt = this.opts.dt;
    this.layout();
  }

  private layout() {
    const c = this.circuit;
    let k = c.nodeCount - 1;
    for (const e of c.elements) if (e.branches) { e.branch0 = k; k += e.branches; }
    if (k !== this.size || c.nodeCount - 1 !== this.nNodes) {
      const old = this.x, oldN = this.nNodes;
      this.size = k; this.nNodes = c.nodeCount - 1;
      this.x = new Float64Array(k); this.xPrev = new Float64Array(k);
      for (let i = 0; i < Math.min(oldN, this.nNodes); i++) { this.x[i] = old[i]!; this.xPrev[i] = old[i]!; }
    }
  }

  /** Call after adding or removing elements/nodes. */
  rebuild() { this.layout(); }

  v(node: number): number { return node <= 0 ? 0 : this.x[node - 1] ?? 0; }
  vd(a: number, b: number): number { return this.v(a) - this.v(b); }
  branch(k: number): number { return this.x[k] ?? 0; }

  private limitedFlag = false;

  private ctx(mode: Mode, A: Float64Array, z: Float64Array): Ctx {
    const n = this.size, x = this.x, xp = this.xPrev, self = this;
    const at = (r: number, c: number, val: number) => { if (r > 0 && c > 0) A[(r - 1) * n + (c - 1)]! += val; };
    return {
      mode, t: this.t, dt: this.dt,
      v: node => node <= 0 ? 0 : x[node - 1]!,
      prev: node => node <= 0 ? 0 : xp[node - 1]!,
      branch: k => x[k]!,
      conductance(a, b, g) { at(a, a, g); at(b, b, g); at(a, b, -g); at(b, a, -g); },
      current(a, b, i) { if (a > 0) z[a - 1]! -= i; if (b > 0) z[b - 1]! += i; },
      voltageSource(k, a, b, volts, series = 0) {
        const kk = k;
        if (a > 0) { A[(a - 1) * n + kk]! += 1; A[kk * n + (a - 1)]! += 1; }
        if (b > 0) { A[(b - 1) * n + kk]! -= 1; A[kk * n + (b - 1)]! -= 1; }
        if (series) A[kk * n + kk]! -= series;
        z[kk]! += volts;
      },
      currentBranch(k, a, b, amps) {
        if (a > 0) A[(a - 1) * n + k]! += 1;
        if (b > 0) A[(b - 1) * n + k]! -= 1;
        A[k * n + k]! += 1;
        z[k]! += -amps;
      },
      jacobian(nodes, i0, j) {
        for (let r = 0; r < nodes.length; r++) {
          const nr = nodes[r]!;
          if (nr <= 0) continue;
          let lin = i0[r]!;
          for (let c = 0; c < nodes.length; c++) {
            const nc = nodes[c]!, g = j[r]![c]!;
            if (nc > 0) { A[(nr - 1) * n + (nc - 1)]! += g; lin -= g * x[nc - 1]!; }
          }
          z[nr - 1]! -= lin;
        }
      },
      emit(e) { const ev = { ...e } as SimEvent; self.events.push(ev); self.onEvent?.(ev); },
      limited() { self.limitedFlag = true; },
    } as Ctx;
  }

  private solveNewton(mode: Mode, gmin = this.opts.gmin): boolean {
    const n = this.size;
    if (n === 0) return true;
    const A = new Float64Array(n * n), z = new Float64Array(n);
    const els = this.circuit.elements;
    const nonlinear = els.some(e => e.nonlinear);
    for (let it = 0; it < this.opts.maxIter; it++) {
      A.fill(0); z.fill(0); this.limitedFlag = false;
      for (let i = 0; i < this.nNodes; i++) A[i * n + i]! += gmin;
      const ctx = this.ctx(mode, A, z);
      for (const e of els) e.stamp(ctx);
      if (!luSolve(A, z, n)) return false;
      let ok = true;
      for (let i = 0; i < n; i++) {
        let nv = z[i]!;
        const d = nv - this.x[i]!;
        if (nonlinear && i < this.nNodes && Math.abs(d) > 5) nv = this.x[i]! + Math.sign(d) * 5;
        if (Math.abs(nv - this.x[i]!) > this.opts.reltol * Math.max(Math.abs(nv), Math.abs(this.x[i]!)) + this.opts.abstol) ok = false;
        this.x[i] = nv;
      }
      if (!nonlinear || (ok && it > 0 && !this.limitedFlag)) return true;
    }
    return false;
  }

  /** DC operating point: capacitors open, inductors shorted, digital parts settled. */
  op(): boolean {
    this.layout();
    let ok = false;
    for (let pass = 0; pass < 40; pass++) {
      const ctx = this.ctx('dc', new Float64Array(0), new Float64Array(0));
      for (const e of this.circuit.elements) e.beginStep?.(ctx);
      const before = this.x.slice();
      ok = this.solveNewton('dc');
      this.xPrev.set(this.x);
      let changed = false;
      for (let i = 0; i < this.nNodes; i++) if (Math.abs(this.x[i]! - before[i]!) > 1e-6) changed = true;
      if (!changed && pass > 0) break;
    }
    if (!ok) { const keep = this.x.slice(); ok = this.gminStep('dc'); if (!ok) this.x.set(keep); this.xPrev.set(this.x); }
    const ctx = this.ctx('dc', new Float64Array(0), new Float64Array(0));
    for (const e of this.circuit.elements) e.accept?.(ctx);
    this.converged = ok;
    return ok;
  }

  /** Continuation for stubborn circuits: solve with a large conductance to ground on every node, then shrink it. */
  private gminStep(mode: Mode): boolean {
    if (mode === 'dc') this.x.fill(0);
    for (let g = 1e-2; g > this.opts.gmin; g /= 10) if (!this.solveNewton(mode, g)) return false;
    return this.solveNewton(mode);
  }

  step(count = 1): boolean {
    this.layout();
    for (let s = 0; s < count; s++) {
      this.t += this.dt;
      const pre = this.ctx('tran', new Float64Array(0), new Float64Array(0));
      for (const e of this.circuit.elements) e.beginStep?.(pre);
      const ok = this.solveNewton('tran');
      this.converged = ok;
      if (!ok) this.x.set(this.xPrev);
      const post = this.ctx('tran', new Float64Array(0), new Float64Array(0));
      for (const e of this.circuit.elements) e.accept?.(post);
      this.xPrev.set(this.x);
    }
    return this.converged;
  }

  run(seconds: number, sample?: (sim: Simulator) => void): void {
    const n = Math.round(seconds / this.dt);
    for (let i = 0; i < n; i++) { this.step(); sample?.(this); }
  }

  reset() {
    this.t = 0; this.x.fill(0); this.xPrev.fill(0); this.events = [];
    for (const e of this.circuit.elements) e.reset?.();
  }

  /** Raw MNA solution: node voltages then branch currents. */
  get solution(): Float64Array { return this.x; }
}

export const VT = 0.025852;

export function pnjlim(vnew: number, vold: number, vt: number, vcrit: number): number {
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * vt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / vt;
      return arg > 0 ? vold + vt * Math.log(arg) : vcrit;
    }
    return vt * Math.log(vnew / vt);
  }
  return vnew;
}
