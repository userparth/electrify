import { describe, expect, it } from 'vitest';
import {
  Battery, BenchSupply, BJT, Capacitor, Circuit, Diode, FunctionGenerator, Fuse, IC7400, IC7447, IC7474, IC7490,
  Inductor, LED, MOSFET, Resistor, Simulator, SevenSegment, SolarPanel, Timer555, VoltageSource,
} from '../src';

const pinsOf = (c: Circuit, count: number, map: Record<number, number> = {}) => Array.from({ length: count + 1 }, (_, i) => i === 0 ? 0 : map[i] ?? c.node());

describe('linear circuits', () => {
  it('voltage divider', () => {
    const c = new Circuit(), a = c.node(), m = c.node();
    c.add(new VoltageSource(a, 0, 10)); c.add(new Resistor(a, m, 1000)); c.add(new Resistor(m, 0, 1000));
    const s = new Simulator(c); s.op();
    expect(s.v(m)).toBeCloseTo(5, 6);
  });

  it('RC charges to 63% in one time constant', () => {
    const c = new Circuit(), a = c.node(), m = c.node();
    c.add(new VoltageSource(a, 0, 5)); c.add(new Resistor(a, m, 1000)); const cap = c.add(new Capacitor(m, 0, 1e-6));
    const s = new Simulator(c, { dt: 1e-6 });
    s.run(1e-3);
    expect(cap.voltage / 5).toBeCloseTo(0.632, 2);
  });

  it('RL current rises with tau = L/R', () => {
    const c = new Circuit(), a = c.node(), m = c.node();
    c.add(new VoltageSource(a, 0, 10)); c.add(new Resistor(a, m, 10)); const l = c.add(new Inductor(m, 0, 0.01));
    const s = new Simulator(c, { dt: 1e-6 });
    s.run(1e-3);
    expect(l.current / 1).toBeCloseTo(0.632, 2);
  });
});

describe('semiconductors', () => {
  it('silicon diode drops ~0.6–0.75 V', () => {
    const c = new Circuit(), a = c.node(), d = c.node();
    c.add(new VoltageSource(a, 0, 5)); c.add(new Resistor(a, d, 1000)); c.add(new Diode(d, 0));
    const s = new Simulator(c); s.op();
    expect(s.v(d)).toBeGreaterThan(0.6); expect(s.v(d)).toBeLessThan(0.75);
  });

  it('red LED with 330 Ω draws ~9 mA', () => {
    const c = new Circuit(), a = c.node(), d = c.node();
    c.add(new VoltageSource(a, 0, 5)); const r = c.add(new Resistor(a, d, 330)); const led = c.add(new LED(d, 0, 'red'));
    const s = new Simulator(c); s.op(); s.step();
    const i = r.current(n => s.v(n));
    expect(i).toBeGreaterThan(0.008); expect(i).toBeLessThan(0.0105);
    expect(led.burnt).toBe(false); expect(led.brightness).toBeGreaterThan(0.3);
  });

  it('LED with no resistor on 9 V burns out', () => {
    const c = new Circuit(), a = c.node();
    c.add(new VoltageSource(a, 0, 9, 0.5)); const led = c.add(new LED(a, 0, 'green'));
    const s = new Simulator(c); s.op(); s.step(5);
    expect(led.burnt).toBe(true);
    expect(s.events.some(e => e.kind === 'led-burnt')).toBe(true);
  });

  it('NPN switch saturates with base drive and cuts off without it', () => {
    const c = new Circuit(), vcc = c.node(), b = c.node(), col = c.node(), drive = c.node();
    c.add(new VoltageSource(vcc, 0, 12)); const vin = c.add(new VoltageSource(drive, 0, 5));
    c.add(new Resistor(drive, b, 1000)); c.add(new Resistor(vcc, col, 1000)); c.add(new BJT(col, b, 0));
    const s = new Simulator(c); s.op();
    expect(s.v(col)).toBeLessThan(0.3);
    vin.volts = 0; s.op();
    expect(s.v(col)).toBeGreaterThan(11.9);
  });

  it('PNP high-side switch turns on with base pulled low', () => {
    const c = new Circuit(), vcc = c.node(), b = c.node(), col = c.node();
    c.add(new VoltageSource(vcc, 0, 12)); c.add(new Resistor(b, 0, 10000)); c.add(new Resistor(col, 0, 1000));
    c.add(new BJT(col, b, vcc, { type: 'pnp', is: 1e-14, bf: 100, br: 1 }));
    const s = new Simulator(c); s.op();
    expect(s.v(col)).toBeGreaterThan(11.5);
  });

  it('N-MOSFET low-side switch', () => {
    const c = new Circuit(), vcc = c.node(), g = c.node(), d = c.node();
    c.add(new VoltageSource(vcc, 0, 12)); const vg = c.add(new VoltageSource(g, 0, 5)); c.add(new Resistor(vcc, d, 100)); c.add(new MOSFET(d, g, 0));
    const s = new Simulator(c); s.op();
    expect(s.v(d)).toBeLessThan(1.5);
    vg.volts = 0; s.op();
    expect(s.v(d)).toBeGreaterThan(11.9);
  });
});

describe('digital chips', () => {
  it('74HC00 NAND truth table, powered from its pins', () => {
    for (const [x, y, want] of [[0, 0, 1], [0, 1, 1], [1, 0, 1], [1, 1, 0]] as const) {
      const c = new Circuit(), vcc = c.node(), pins = pinsOf(c, 14, { 7: 0, 14: vcc });
      c.add(new VoltageSource(vcc, 0, 5)); c.add(new VoltageSource(pins[1]!, 0, x * 5)); c.add(new VoltageSource(pins[2]!, 0, y * 5));
      c.add(new Resistor(pins[3]!, 0, 10000));
      c.add(new IC7400(pins));
      const s = new Simulator(c); s.op();
      expect(s.v(pins[3]!) > 2.5 ? 1 : 0).toBe(want);
    }
  });

  it('an unpowered chip does not drive its outputs', () => {
    const c = new Circuit(), pins = pinsOf(c, 14, { 7: 0 });
    c.add(new VoltageSource(pins[1]!, 0, 0)); c.add(new VoltageSource(pins[2]!, 0, 0)); c.add(new Resistor(pins[3]!, 0, 10000));
    c.add(new IC7400(pins));
    const s = new Simulator(c); s.op();
    expect(s.v(pins[3]!)).toBeLessThan(0.1);
  });

  it('74HC74 wired as toggle divides the clock by 2', () => {
    const c = new Circuit(), vcc = c.node(), pins = pinsOf(c, 14, { 7: 0, 14: vcc, 1: vcc, 4: vcc });
    c.add(new VoltageSource(vcc, 0, 5));
    pins[2] = pins[6]!;
    c.add(new FunctionGenerator(pins[3]!, 0, { shape: 'square', freq: 1000, amplitude: 5, offset: 2.5 }, 1));
    c.add(new IC7474(pins));
    const s = new Simulator(c, { dt: 1e-5 });
    let edges = 0, last = 0;
    s.run(0.01, sim => { const q = sim.v(pins[5]!) > 2.5 ? 1 : 0; if (q && !last) edges++; last = q; });
    expect(edges).toBeGreaterThanOrEqual(4); expect(edges).toBeLessThanOrEqual(6);
  });

  it('7490 counts falling edges in BCD', () => {
    const c = new Circuit(), vcc = c.node(), pins = pinsOf(c, 14, { 5: vcc, 10: 0, 2: 0, 3: 0, 6: 0, 7: 0 });
    pins[1] = pins[12]!;
    c.add(new VoltageSource(vcc, 0, 5));
    c.add(new FunctionGenerator(pins[14]!, 0, { shape: 'square', freq: 100, amplitude: 5, offset: 2.5 }, 1));
    const ic = c.add(new IC7490(pins));
    const s = new Simulator(c, { dt: 1e-4 });
    s.run(0.0705);
    expect(ic.count).toBe(7);
  });

  it('7447 drives a common-anode display to show 5', () => {
    const c = new Circuit(), vcc = c.node(), pins = pinsOf(c, 16, { 16: vcc, 8: 0, 3: vcc, 4: vcc, 5: vcc });
    c.add(new VoltageSource(vcc, 0, 5));
    c.add(new VoltageSource(pins[7]!, 0, 5)); c.add(new VoltageSource(pins[1]!, 0, 0)); c.add(new VoltageSource(pins[2]!, 0, 5)); c.add(new VoltageSource(pins[6]!, 0, 0));
    c.add(new IC7447(pins));
    const segs = { a: c.node(), b: c.node(), c: c.node(), d: c.node(), e: c.node(), f: c.node(), g: c.node(), dp: c.node() };
    const map = { a: 13, b: 12, c: 11, d: 10, e: 9, f: 15, g: 14 } as const;
    for (const [k, pin] of Object.entries(map)) c.add(new Resistor(segs[k as keyof typeof segs], pins[pin]!, 330));
    const disp = new SevenSegment(c, segs, vcc, 'anode');
    c.add(disp);
    const s = new Simulator(c); s.op(); s.step(2);
    expect(disp.lit).toBe('acdfg');
  });

  it('555 astable runs at 1.44 / ((R1 + 2·R2)·C)', () => {
    const c = new Circuit(), vcc = c.node(), pins = pinsOf(c, 8, { 1: 0, 8: vcc, 4: vcc });
    pins[2] = pins[6]!;
    c.add(new VoltageSource(vcc, 0, 9));
    c.add(new Resistor(vcc, pins[7]!, 1000)); c.add(new Resistor(pins[7]!, pins[6]!, 10000)); c.add(new Capacitor(pins[6]!, 0, 10e-6));
    c.add(new Capacitor(pins[5]!, 0, 10e-9)); c.add(new Resistor(pins[3]!, 0, 10000));
    c.add(new Timer555(pins));
    const s = new Simulator(c, { dt: 2e-5 });
    const rises: number[] = []; let last = 0;
    s.run(1.0, sim => { const o = sim.v(pins[3]!) > 4.5 ? 1 : 0; if (o && !last) rises.push(sim.t); last = o; });
    const period = (rises[rises.length - 1]! - rises[1]!) / (rises.length - 2);
    expect(1 / period).toBeGreaterThan(6.86 * 0.93); expect(1 / period).toBeLessThan(6.86 * 1.07);
  });
});

describe('instruments and power', () => {
  it('bench supply limits current (CC mode)', () => {
    const c = new Circuit(), p = c.node();
    const psu = c.add(new BenchSupply(p, 0, 12, 1)); c.add(new Resistor(p, 0, 1));
    const s = new Simulator(c); s.op();
    expect(psu.mode).toBe('CC'); expect(s.v(p)).toBeCloseTo(1, 2);
  });

  it('bench supply holds voltage below the limit (CV mode)', () => {
    const c = new Circuit(), p = c.node();
    const psu = c.add(new BenchSupply(p, 0, 12, 1)); c.add(new Resistor(p, 0, 100));
    const s = new Simulator(c); s.op();
    expect(psu.mode).toBe('CV'); expect(s.v(p)).toBeCloseTo(12, 1);
  });

  it('function generator gives 2 Vpp into a high-impedance load', () => {
    const c = new Circuit(), o = c.node();
    c.add(new FunctionGenerator(o, 0, { shape: 'sine', freq: 1000, amplitude: 2, offset: 0 })); c.add(new Resistor(o, 0, 1e6));
    const s = new Simulator(c, { dt: 1e-6 });
    let lo = 0, hi = 0;
    s.run(0.002, sim => { lo = Math.min(lo, sim.v(o)); hi = Math.max(hi, sim.v(o)); });
    expect(hi - lo).toBeCloseTo(2, 1);
  });

  it('solar panel charges a 12 V battery at about Isc', () => {
    const c = new Circuit(), p = c.node();
    const pv = c.add(new SolarPanel(p, 0)); const bat = c.add(new Battery(p, 0, { ah: 26, soc: 0.5 }));
    const s = new Simulator(c); s.op();
    expect(-bat.current(k => s.branch(k))).toBeGreaterThan(2.7);
    pv.sun = 0; s.op();
    expect(Math.abs(bat.current(k => s.branch(k)))).toBeLessThan(0.01);
  });

  it('a short across a battery blows the fuse', () => {
    const c = new Circuit(), p = c.node(), f = c.node();
    c.add(new Battery(p, 0, { ah: 26, soc: 0.9 })); const fuse = c.add(new Fuse(p, f, 10, 0.01, 'Main fuse')); c.add(new Resistor(f, 0, 0.01));
    const s = new Simulator(c, { dt: 1e-4 }); s.op(); s.step(20);
    expect(fuse.blown).toBe(true);
    expect(s.events.some(e => e.kind === 'fuse-blown')).toBe(true);
  });
});

describe('solver', () => {
  it('a linear circuit settles in one step even after a big jump', () => {
    const c = new Circuit(), a = c.node();
    const src = c.add(new VoltageSource(a, 0, 0)); c.add(new Resistor(a, 0, 1000));
    const s = new Simulator(c); s.op();
    src.volts = 230; s.step();
    expect(s.v(a)).toBeCloseTo(230, 6);
  });
});

describe('battery', () => {
  it('a fully drained battery stops powering its load', () => {
    const c = new Circuit(), p = c.node();
    const bat = c.add(new Battery(p, 0, { ah: 0.01, soc: 0.05 })); c.add(new Resistor(p, 0, 14.4));
    const s = new Simulator(c, { dt: 1 }); s.op();
    s.run(120);
    expect(bat.empty).toBe(true);
    expect(s.v(p)).toBeLessThan(3);
    expect(bat.ocv).toBeGreaterThan(10.3);
    expect(bat.ocv).toBeLessThan(11);
  });
});
