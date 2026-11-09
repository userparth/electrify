import { Capacitor, Circuit, FunctionGenerator, Resistor, Simulator, VoltageSource } from '@eb/engine';
import { describe, expect, it } from 'vitest';
import { digitalParts } from '../src/parts/digital';
import { led } from '../src/parts/core';
import type { PartDef, Props, Runtime } from '../src/types';

const part = (type: string) => digitalParts.find(p => p.type === type)!;

function place(c: Circuit, def: PartDef<any>, wiring: Record<string, number>, props: Props = def.defaults): { rt: Runtime; node: (pin: string) => number } {
  const map = new Map<string, number>(Object.entries(wiring));
  for (const net of def.nets?.(props) ?? []) {
    const shared = net.map(p => map.get(p)).find(n => n != null) ?? c.node();
    net.forEach(p => map.set(p, shared));
  }
  const node = (pin: string) => { if (!map.has(pin)) map.set(pin, c.node()); return map.get(pin)!; };
  const rt = def.build({ circuit: c, pin: node, internal: () => c.node(), add: e => c.add(e) }, props);
  return { rt, node };
}

const live = (sim: Simulator, p: { rt: Runtime; node: (pin: string) => number }) => p.rt.read!(sim, pin => sim.v(p.node(pin)));

describe('digital parts', () => {
  it('74HC00 NAND truth table driven by logic switches', () => {
    for (const [a, b, want] of [[false, false, 1], [false, true, 1], [true, false, 1], [true, true, 0]] as const) {
      const c = new Circuit(), vcc = c.node(), ina = c.node(), inb = c.node(), y = c.node();
      c.add(new VoltageSource(vcc, 0, 5));
      place(c, part('logic-switch'), { VCC: vcc, GND: 0, OUT: ina }, { on: a });
      place(c, part('logic-switch'), { VCC: vcc, GND: 0, OUT: inb }, { on: b });
      const chip = place(c, part('74hc00'), { '1': ina, '2': inb, '3': y, '7': 0, '14': vcc });
      c.add(new Resistor(y, 0, 10000));
      const s = new Simulator(c); s.op();
      expect(s.v(y) > 2.5 ? 1 : 0).toBe(want);
      expect(live(s, chip).o3).toBe(want);
    }
  });

  it('logic switch flips live through update()', () => {
    const c = new Circuit(), vcc = c.node(), out = c.node();
    c.add(new VoltageSource(vcc, 0, 5));
    const sw = place(c, part('logic-switch'), { VCC: vcc, GND: 0, OUT: out }, { on: false });
    const s = new Simulator(c); s.op();
    expect(s.v(out)).toBeLessThan(0.1);
    expect(sw.rt.update!({ on: true })).toBe(true);
    s.op();
    expect(s.v(out)).toBeGreaterThan(4.9);
  });

  it('74HC74 with Q̅ → D toggles at half the clock rate', () => {
    const c = new Circuit(), vcc = c.node(), clk = c.node(), nq = c.node(), q = c.node();
    c.add(new VoltageSource(vcc, 0, 5));
    c.add(new FunctionGenerator(clk, 0, { shape: 'square', freq: 1000, amplitude: 5, offset: 2.5 }, 1));
    place(c, part('74hc74'), { '1': vcc, '2': nq, '3': clk, '4': vcc, '5': q, '6': nq, '7': 0, '14': vcc });
    const s = new Simulator(c, { dt: 1e-5 });
    let rises = 0, last = 0;
    s.run(0.01, sim => { const l = sim.v(q) > 2.5 ? 1 : 0; if (l && !last) rises++; last = l; });
    expect(rises).toBeGreaterThanOrEqual(4); expect(rises).toBeLessThanOrEqual(6);
  });

  it('NE555 astable blinks an LED', () => {
    const c = new Circuit(), vcc = c.node(), th = c.node(), dis = c.node(), out = c.node(), ctrl = c.node(), a = c.node();
    c.add(new VoltageSource(vcc, 0, 9));
    const t = place(c, part('ne555'), { '1': 0, '2': th, '3': out, '4': vcc, '5': ctrl, '6': th, '7': dis, '8': vcc });
    c.add(new Resistor(vcc, dis, 1000)); c.add(new Resistor(dis, th, 10000)); c.add(new Capacitor(th, 0, 10e-6)); c.add(new Capacitor(ctrl, 0, 10e-9));
    c.add(new Resistor(out, a, 470));
    const l = place(c, led, { A: a, K: 0 });
    const s = new Simulator(c, { dt: 2e-5 });
    let flips = 0, last: unknown = null, sawOn = false;
    s.run(1.0, sim => {
      const g = (live(sim, l).glow as number) > 0.2;
      if (g) sawOn = true;
      if (last !== null && g !== last) flips++;
      last = g;
    });
    expect(sawOn).toBe(true);
    expect(flips).toBeGreaterThanOrEqual(10);
    expect([0, 1]).toContain(live(s, t).o3);
  });

  it('74LS47 drives a common-anode display to show the BCD digit 3', () => {
    const c = new Circuit(), vcc = c.node();
    c.add(new VoltageSource(vcc, 0, 5));
    const bit = (v: number) => { const n = c.node(); c.add(new VoltageSource(n, 0, v)); return n; };
    const drv = place(c, part('74ls47'), { '7': bit(5), '1': bit(5), '2': bit(0), '6': bit(0), '3': vcc, '4': vcc, '5': vcc, '8': 0, '16': vcc });
    const segPin: Record<string, string> = { a: '7', b: '6', c: '4', d: '2', e: '1', f: '9', g: '10' };
    const drvPin: Record<string, string> = { a: '13', b: '12', c: '11', d: '10', e: '9', f: '15', g: '14' };
    const wiring: Record<string, number> = { '3': vcc };
    for (const s of Object.keys(segPin)) { const n = c.node(); wiring[segPin[s]!] = n; c.add(new Resistor(n, drv.node(drvPin[s]!), 330)); }
    const disp = place(c, part('seven-segment'), wiring, { common: 'anode', color: 'red' });
    const s = new Simulator(c); s.op(); s.step(2);
    const lv = live(s, disp), lit = 'abcdefg'.split('').filter(k => (lv[k] as number) > 0.15).join('');
    expect(lit).toBe('abcdg');
  });

  it('a chip without VCC drives nothing and reports unpowered', () => {
    const c = new Circuit(), hi = c.node(), y = c.node();
    c.add(new VoltageSource(hi, 0, 5));
    const chip = place(c, part('74hc08'), { '1': hi, '2': hi, '3': y, '7': 0 });
    c.add(new Resistor(y, 0, 10000));
    const s = new Simulator(c); s.op();
    expect(s.v(y)).toBeLessThan(0.1);
    expect(live(s, chip).powered).toBe(false);
  });

  it('DIP switch joins its pin pairs', () => {
    const c = new Circuit(), vcc = c.node(), o = c.node();
    c.add(new VoltageSource(vcc, 0, 5));
    const sw = place(c, part('dip-switch-8'), { '16': vcc, '1': o }, { bits: '00000000' });
    c.add(new Resistor(o, 0, 10000));
    const s = new Simulator(c); s.op();
    expect(s.v(o)).toBeLessThan(0.1);
    sw.rt.update!({ bits: '10000000' }); s.op();
    expect(s.v(o)).toBeGreaterThan(4.9);
  });

  it('every part has consistent pins, box and info', () => {
    for (const d of digitalParts) {
      const pins = d.pins(d.defaults);
      expect(new Set(pins.map(p => p.id)).size).toBe(pins.length);
      for (const p of pins) { expect(Number.isInteger(p.x)).toBe(true); expect(Number.isInteger(p.y)).toBe(true); }
      expect(d.info?.length).toBeGreaterThan(0);
    }
  });
});
