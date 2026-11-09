import { Battery, Circuit, Resistor, Simulator, VoltageSource } from '@eb/engine';
import { describe, expect, it } from 'vitest';
import { dmm, fgen, logicProbe } from '../src/parts/instruments';
import type { PartDef, Props, Runtime } from '../src/types';

function mount<P extends Props>(c: Circuit, def: PartDef<P>, nodes: Record<string, number>, props: Partial<P> = {}): { rt: Runtime; p: P } {
  const map: Record<string, number> = { ...nodes };
  const pin = (id: string) => map[id] ?? (map[id] = c.node());
  const p = { ...def.defaults, ...props } as P;
  return { rt: def.build({ circuit: c, pin, internal: () => c.node(), add: e => c.add(e) }, p), p };
}

const run = (s: Simulator, rt: Runtime, steps: number, nodes: (n: number) => number = n => s.v(n)) => {
  for (let i = 0; i < steps; i++) { s.step(); rt.sample?.(s, () => 0); }
  void nodes;
};

describe('multimeter', () => {
  it('reads a 9 V battery on DC and ~0 on AC', () => {
    const c = new Circuit(), b = c.node();
    c.add(new VoltageSource(b, 0, 9));
    const { rt, p } = mount(c, dmm, { COM: 0, VmA: b }, { knob: 'V', ac: false });
    const s = new Simulator(c, { dt: 1e-3 }); s.op(); run(s, rt, 400);
    expect(rt.read!(s, () => 0).value as number).toBeCloseTo(9, 2);
    expect(rt.read!(s, () => 0).display).toBe('9.00');
    rt.update!({ ...p, ac: true }); run(s, rt, 300);
    expect(Math.abs(rt.read!(s, () => 0).value as number)).toBeLessThan(0.05);
  });

  it('shows a minus sign with reversed leads', () => {
    const c = new Circuit(), b = c.node();
    c.add(new VoltageSource(b, 0, 9));
    const { rt } = mount(c, dmm, { COM: b, VmA: 0 }, { knob: 'V', ac: false });
    const s = new Simulator(c, { dt: 1e-3 }); s.op(); run(s, rt, 50);
    expect(rt.read!(s, () => 0).display).toBe('-9.00');
  });

  it('measures a 220 Ω resistor', () => {
    const c = new Circuit(), a = c.node();
    c.add(new Resistor(a, 0, 220));
    const { rt } = mount(c, dmm, { COM: 0, VmA: a }, { knob: 'OHM' });
    const s = new Simulator(c); s.op();
    const r = rt.read!(s, () => 0);
    expect(r.value as number).toBeCloseTo(220, 0); expect(r.unit).toBe('Ω');
  });

  it('reads OL on an open circuit and beeps on a short in continuity', () => {
    const c = new Circuit(), a = c.node(), b = c.node();
    const { rt } = mount(c, dmm, { COM: b, VmA: a }, { knob: 'CONT' });
    const s = new Simulator(c); s.op();
    expect(rt.read!(s, () => 0).display).toBe('OL');
    c.add(new Resistor(a, b, 0.05)); s.rebuild(); s.op();
    expect(rt.read!(s, () => 0).beep).toBe(true);
  });

  it('10A jack across a battery blows the meter fuse', () => {
    const c = new Circuit(), b = c.node();
    c.add(new Battery(b, 0, { ah: 26, soc: 0.9, rint: 0.03 }));
    const { rt } = mount(c, dmm, { COM: 0, '10A': b }, { knob: 'V', ac: false });
    const s = new Simulator(c, { dt: 1e-4 }); s.op(); run(s, rt, 20);
    expect(rt.read!(s, () => 0).fuseBlown).toBe(true);
    expect(s.events.some(e => e.kind === 'fuse-blown')).toBe(true);
  });

  it('reads ~9 mA in series with 1 kΩ from 9 V', () => {
    const c = new Circuit(), b = c.node(), m = c.node();
    c.add(new VoltageSource(b, 0, 9)); c.add(new Resistor(b, m, 1000));
    const { rt } = mount(c, dmm, { '10A': m, COM: 0 }, { knob: 'A', ac: false });
    const s = new Simulator(c, { dt: 1e-3 }); s.op(); run(s, rt, 50);
    expect(rt.read!(s, () => 0).value as number).toBeCloseTo(0.009, 4);
  });
});

describe('function generator', () => {
  it('gives the set peak-to-peak voltage into 1 MΩ', () => {
    const c = new Circuit(), o = c.node();
    c.add(new Resistor(o, 0, 1e6));
    mount(c, fgen, { OUT: o, COM: 0 }, { freq: 1000, amplitude: 3, shape: 'square' });
    const s = new Simulator(c, { dt: 1e-5 });
    let lo = 0, hi = 0;
    s.run(0.003, sim => { lo = Math.min(lo, sim.v(o)); hi = Math.max(hi, sim.v(o)); });
    expect(hi - lo).toBeCloseTo(3, 1);
  });
});

describe('logic probe', () => {
  it('shows HIGH, LOW and PULSE', () => {
    const c = new Circuit(), vcc = c.node(), t = c.node();
    c.add(new VoltageSource(vcc, 0, 5)); const sig = c.add(new VoltageSource(t, 0, 5));
    const { rt } = mount(c, logicProbe, { TIP: t, VCC: vcc, GND: 0 });
    const s = new Simulator(c, { dt: 1e-3 }); s.op(); run(s, rt, 5);
    let r = rt.read!(s, () => 0);
    expect(r.high).toBe(true); expect(r.pulse).toBe(false);
    sig.volts = 0; run(s, rt, 5);
    r = rt.read!(s, () => 0);
    expect(r.low).toBe(true); expect(r.pulse).toBe(true);
    run(s, rt, 300);
    expect(rt.read!(s, () => 0).pulse).toBe(false);
  });
});
