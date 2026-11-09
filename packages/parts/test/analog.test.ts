import { Circuit, Resistor, Simulator, VoltageSource } from '@eb/engine';
import { describe, expect, it } from 'vitest';
import { electrolyticCap, lamp, npn, potentiometer, psu, pushButton, zener } from '../src/parts/analog';
import type { PartDef, Props, Runtime } from '../src/types';

function mount<P extends Props>(c: Circuit, def: PartDef<P>, nodes: Record<string, number>, props: Partial<P> = {}): { rt: Runtime; p: P } {
  const nets = def.nets?.({ ...def.defaults, ...props } as P) ?? [];
  const map: Record<string, number> = { ...nodes };
  for (const g of nets) { const n = g.map(id => map[id]).find(x => x != null) ?? c.node(); for (const id of g) map[id] = n; }
  const pin = (id: string) => map[id] ?? (map[id] = c.node());
  const p = { ...def.defaults, ...props } as P;
  const rt = def.build({ circuit: c, pin, internal: () => c.node(), add: e => c.add(e) }, p);
  return { rt, p };
}

describe('analog parts', () => {
  it('potentiometer divides the supply by its knob position', () => {
    const c = new Circuit(), v = c.node(), w = c.node();
    c.add(new VoltageSource(v, 0, 10));
    const { rt } = mount(c, potentiometer, { '1': v, W: w, '2': 0 }, { position: 0.25 });
    const s = new Simulator(c); s.op();
    expect(s.v(w)).toBeCloseTo(7.5, 1);
    rt.update!({ ohms: 10000, position: 0.75 }); s.op();
    expect(s.v(w)).toBeCloseTo(2.5, 1);
  });

  it('push button connects its sides only while pressed', () => {
    const c = new Circuit(), v = c.node(), o = c.node();
    c.add(new VoltageSource(v, 0, 5)); c.add(new Resistor(o, 0, 10000));
    const { rt } = mount(c, pushButton, { '1a': v, '2b': o });
    const s = new Simulator(c); s.op();
    expect(s.v(o)).toBeLessThan(0.01);
    rt.update!({ pressed: true }); s.op();
    expect(s.v(o)).toBeGreaterThan(4.9);
  });

  it('zener clamps near 5.1 V', () => {
    const c = new Circuit(), v = c.node(), k = c.node();
    c.add(new VoltageSource(v, 0, 12)); c.add(new Resistor(v, k, 1000));
    mount(c, zener, { A: 0, K: k });
    const s = new Simulator(c); s.op();
    expect(s.v(k)).toBeGreaterThan(4.9); expect(s.v(k)).toBeLessThan(5.5);
  });

  it('NPN switches a 12 V lamp', () => {
    const c = new Circuit(), vcc = c.node(), col = c.node(), b = c.node(), drive = c.node();
    c.add(new VoltageSource(vcc, 0, 12)); const vin = c.add(new VoltageSource(drive, 0, 5)); c.add(new Resistor(drive, b, 470));
    const l = mount(c, lamp, { '1': vcc, '2': col });
    mount(c, npn, { C: col, B: b, E: 0 });
    const s = new Simulator(c); s.op();
    const read = () => l.rt.read!(s, id => s.v(({ '1': vcc, '2': col } as Record<string, number>)[id]!));
    expect(read().watts as number).toBeGreaterThan(4);
    vin.volts = 0; s.op();
    expect(read().watts as number).toBeLessThan(0.05);
  });

  it('bench supply drops into CC mode at the current limit', () => {
    const c = new Circuit(), p = c.node();
    const { rt } = mount(c, psu, { '+': p, '-': 0 }, { volts: 12, limit: 0.1 });
    c.add(new Resistor(p, 0, 10));
    const s = new Simulator(c); s.op();
    const live = rt.read!(s, id => id === '+' ? s.v(p) : 0);
    expect(live.mode).toBe('CC'); expect(live.v as number).toBeCloseTo(1, 1);
  });

  it('electrolytic flags reverse polarity', () => {
    const c = new Circuit(), v = c.node();
    c.add(new VoltageSource(v, 0, 5));
    const { rt } = mount(c, electrolyticCap, { '+': 0, '-': v });
    const s = new Simulator(c, { dt: 1e-4 }); s.op(); s.step(5);
    expect(rt.read!(s, id => id === '-' ? s.v(v) : 0).reversed).toBe(true);
  });
});
