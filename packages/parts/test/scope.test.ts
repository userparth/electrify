import { Circuit, FunctionGenerator, Simulator } from '@eb/engine';
import { describe, expect, it } from 'vitest';
import { logicAnalyzer, scope } from '../src/parts/scope';
import type { PartDef, Props, Runtime } from '../src/types';

function mount<P extends Props>(c: Circuit, def: PartDef<P>, nodes: Record<string, number>, props: Partial<P> = {}): Runtime {
  const map: Record<string, number> = { ...nodes };
  const pin = (id: string) => map[id] ?? (map[id] = c.node());
  return def.build({ circuit: c, pin, internal: () => c.node(), add: e => c.add(e) }, { ...def.defaults, ...props } as P);
}

function run(sim: Simulator, rt: Runtime, nodes: Record<string, number>, seconds: number) {
  const v = (id: string) => sim.v(nodes[id] ?? 0);
  const n = Math.round(seconds / sim.dt);
  for (let i = 0; i < n; i++) { sim.step(); rt.sample!(sim, v); }
}

describe('oscilloscope', () => {
  const setup = (dt: number, props: Record<string, unknown> = {}) => {
    const c = new Circuit(), o = c.node();
    c.add(new FunctionGenerator(o, 0, { shape: 'sine', freq: 1000, amplitude: 2, offset: 0 }));
    const nodes = { CH1: o, CH2: 0, GND: 0 };
    const rt = mount(c, scope, nodes, { timeDiv: '0.0002', ...props } as never);
    const sim = new Simulator(c, { dt }); sim.op();
    return { sim, rt, nodes };
  };

  it('measures a 1 kHz, 2 Vpp sine', () => {
    const { sim, rt, nodes } = setup(1e-6);
    run(sim, rt, nodes, 0.01);
    const l = rt.read!(sim, () => 0);
    expect(l.vpp1 as number).toBeGreaterThan(1.9); expect(l.vpp1 as number).toBeLessThan(2.1);
    expect(l.f1 as number).toBeGreaterThan(970); expect(l.f1 as number).toBeLessThan(1030);
    expect(l.triggered).toBe(true);
    expect((l.x as number[]).length).toBeLessThanOrEqual(600);
    expect(l.warn).toBe('');
  });

  it('triggered display starts at the same phase every sweep', () => {
    const { sim, rt, nodes } = setup(1e-6);
    run(sim, rt, nodes, 0.01);
    const a = (rt.read!(sim, () => 0).a as number[]).slice(0, 40);
    run(sim, rt, nodes, 0.00137);
    const b = (rt.read!(sim, () => 0).a as number[]).slice(0, 40);
    for (let i = 0; i < a.length; i++) expect(Math.abs(a[i]! - b[i]!)).toBeLessThan(0.08);
  });

  it('warns when the timestep is too coarse for time/div', () => {
    const { sim, rt, nodes } = setup(1e-4, { timeDiv: '0.00001' });
    run(sim, rt, nodes, 0.01);
    expect(String(rt.read!(sim, () => 0).warn)).toMatch(/smaller timestep/);
  });

  it('stop freezes recording', () => {
    const { sim, rt, nodes } = setup(1e-6);
    run(sim, rt, nodes, 0.005);
    rt.update!({ ...scope.defaults, timeDiv: '0.0002', run: false });
    const before = rt.read!(sim, () => 0).a;
    run(sim, rt, nodes, 0.00137);
    expect(rt.read!(sim, () => 0).a).toEqual(before);
  });
});

describe('logic analyzer', () => {
  it('captures a 500 Hz square wave on D0', () => {
    const c = new Circuit(), o = c.node();
    c.add(new FunctionGenerator(o, 0, { shape: 'square', freq: 500, amplitude: 5, offset: 2.5 }, 1));
    const nodes = { D0: o, GND: 0 };
    const rt = mount(c, logicAnalyzer, nodes, { timeDiv: '0.001' });
    const sim = new Simulator(c, { dt: 1e-5 }); sim.op();
    run(sim, rt, nodes, 0.05);
    const l = rt.read!(sim, () => 0);
    expect(l.freq as number).toBeGreaterThan(480); expect(l.freq as number).toBeLessThan(520);
    expect((l.c0 as number[]).length / 2).toBeGreaterThanOrEqual(8);
    expect(l.pulses as number).toBeGreaterThanOrEqual(24);
    expect(l.triggered).toBe(true);
    expect(String(l.levels)).toHaveLength(8);
  });
});
