import { Capacitor, Circuit, FunctionGenerator, Resistor, Simulator, VoltageSource } from '@eb/engine';
import { describe, expect, it } from 'vitest';
import { cd4017, cd4511, hc112, hc14, hc151, hc193, hc283, hc595, icParts, ldr, lm358, lm393, lm7805, relay } from '../src/parts/ics';
import type { PartDef, Props, Runtime } from '../src/types';

function mount<P extends Props>(c: Circuit, def: PartDef<P>, nodes: Record<string, number>, props: Partial<P> = {}): { rt: Runtime; pin: (id: string) => number } {
  const nets = def.nets?.({ ...def.defaults, ...props } as P) ?? [];
  const map: Record<string, number> = { ...nodes };
  for (const g of nets) { const n = g.map(id => map[id]).find(x => x != null) ?? c.node(); for (const id of g) map[id] = n; }
  const pin = (id: string) => map[id] ?? (map[id] = c.node());
  const rt = def.build({ circuit: c, pin, internal: () => c.node(), add: e => c.add(e) }, { ...def.defaults, ...props } as P);
  return { rt, pin };
}

describe('IC and sensor parts', () => {
  it('every part has unique whole-unit pins and info', () => {
    for (const d of icParts) {
      const pins = d.pins(d.defaults);
      expect(new Set(pins.map(p => p.id)).size).toBe(pins.length);
      for (const p of pins) { expect(Number.isInteger(p.x)).toBe(true); expect(Number.isInteger(p.y)).toBe(true); }
      expect(d.info?.length).toBeGreaterThan(0);
    }
  });

  it('CD4017 moves the HIGH output one step per clock', () => {
    const c = new Circuit(), vdd = c.node(), clk = c.node();
    c.add(new VoltageSource(vdd, 0, 9));
    c.add(new FunctionGenerator(clk, 0, { shape: 'square', freq: 100, amplitude: 9, offset: 4.5 }, 1));
    const { pin } = mount(c, cd4017, { '16': vdd, '8': 0, '13': 0, '15': 0, '14': clk });
    const s = new Simulator(c, { dt: 1e-4 }); s.op();
    const qs = [3, 2, 4, 7, 10, 1, 5, 6, 9, 11].map(p => pin(String(p)));
    const high = () => qs.findIndex(n => s.v(n) > 4.5);
    s.run(0.0055);
    const h0 = high();
    s.run(0.01);
    expect(high()).toBe((h0 + 1) % 10);
    s.run(0.03);
    expect(high()).toBe((h0 + 4) % 10);
  });

  it('74HC595 shifts in a byte and shows it after the latch pulse', () => {
    const c = new Circuit(), vcc = c.node();
    c.add(new VoltageSource(vcc, 0, 5));
    const ser = c.add(new VoltageSource(c.node(), 0, 0)), sck = c.add(new VoltageSource(c.node(), 0, 0)), rck = c.add(new VoltageSource(c.node(), 0, 0));
    const { pin } = mount(c, hc595, { '16': vcc, '8': 0, '10': vcc, '13': 0, '14': ser.pos, '11': sck.pos, '12': rck.pos });
    const s = new Simulator(c, { dt: 1e-4 }); s.op();
    const value = 0b10110010;
    for (let i = 7; i >= 0; i--) {
      ser.volts = (value >> i) & 1 ? 5 : 0; s.step(2);
      sck.volts = 5; s.step(2); sck.volts = 0; s.step(2);
    }
    const q = [15, 1, 2, 3, 4, 5, 6, 7].map(p => pin(String(p)));
    expect(q.every(n => s.v(n) < 0.5)).toBe(true);
    rck.volts = 5; s.step(2); rck.volts = 0; s.step(2);
    const got = q.reduce((acc, n, i) => acc | ((s.v(n) > 2.5 ? 1 : 0) << i), 0);
    expect(got).toBe(value);
  });

  it('74HC14 with an RC oscillates', () => {
    const c = new Circuit(), vcc = c.node();
    c.add(new VoltageSource(vcc, 0, 5));
    const { pin } = mount(c, hc14, { '14': vcc, '7': 0 });
    c.add(new Resistor(pin('2'), pin('1'), 10000)); c.add(new Capacitor(pin('1'), 0, 1e-6));
    const s = new Simulator(c, { dt: 5e-5 }); s.op();
    let edges = 0, last = s.v(pin('2')) > 2.5;
    s.run(0.2, sim => { const now = sim.v(pin('2')) > 2.5; if (now && !last) edges++; last = now; });
    expect(edges).toBeGreaterThan(8);
    expect(edges).toBeLessThan(16);
  });

  it('LM358 non-inverting amplifier has gain 11', () => {
    const c = new Circuit(), vcc = c.node(), vin = c.node();
    c.add(new VoltageSource(vcc, 0, 12)); c.add(new VoltageSource(vin, 0, 0.5));
    const { pin } = mount(c, lm358, { '8': vcc, '4': 0, '3': vin });
    c.add(new Resistor(pin('1'), pin('2'), 10000)); c.add(new Resistor(pin('2'), 0, 1000));
    const s = new Simulator(c); s.op();
    expect(s.v(pin('1')) / 0.5).toBeGreaterThan(11 * 0.98);
    expect(s.v(pin('1')) / 0.5).toBeLessThan(11 * 1.02);
  });

  it('LM358 follower tracks and saturates below the top rail', () => {
    const c = new Circuit(), vcc = c.node(), vin = c.node();
    c.add(new VoltageSource(vcc, 0, 9)); const src = c.add(new VoltageSource(vin, 0, 3));
    const { pin } = mount(c, lm358, { '8': vcc, '4': 0, '5': vin });
    c.add(new Resistor(pin('7'), pin('6'), 1)); c.add(new Resistor(pin('7'), 0, 10000));
    const s = new Simulator(c); s.op();
    expect(s.v(pin('7'))).toBeCloseTo(3, 2);
    src.volts = 9; s.op();
    expect(s.v(pin('7'))).toBeGreaterThan(7.2); expect(s.v(pin('7'))).toBeLessThan(7.6);
  });

  it('LM358 with an unused half still converges every step', () => {
    const c = new Circuit(), vcc = c.node();
    c.add(new VoltageSource(vcc, 0, 9));
    const { pin } = mount(c, lm358, { '8': vcc, '4': 0, '3': 0, '2': 0 });
    const s = new Simulator(c, { dt: 1e-4 });
    expect(s.op()).toBe(true);
    for (let i = 0; i < 50; i++) expect(s.step()).toBe(true);
    expect(s.v(pin('7'))).toBeGreaterThan(0); expect(s.v(pin('7'))).toBeLessThan(7.5);
  });

  it('LM393 output is released only when IN+ is above IN−', () => {
    const c = new Circuit(), vcc = c.node(), ref = c.node();
    c.add(new VoltageSource(vcc, 0, 5)); c.add(new VoltageSource(ref, 0, 2.5));
    const inp = c.add(new VoltageSource(c.node(), 0, 1));
    const { pin } = mount(c, lm393, { '8': vcc, '4': 0, '3': inp.pos, '2': ref });
    c.add(new Resistor(vcc, pin('1'), 10000));
    const s = new Simulator(c); s.op();
    expect(s.v(pin('1'))).toBeLessThan(0.5);
    inp.volts = 4; s.op();
    expect(s.v(pin('1'))).toBeGreaterThan(4.8);
  });

  it('LM7805 gives 5 V from 9 V and drops out at 6 V', () => {
    const c = new Circuit(), vin = c.node();
    const src = c.add(new VoltageSource(vin, 0, 9));
    const { pin } = mount(c, lm7805, { IN: vin, GND: 0 });
    c.add(new Resistor(pin('OUT'), 0, 50));
    const s = new Simulator(c); s.op();
    expect(s.v(pin('OUT'))).toBeCloseTo(5, 1);
    src.volts = 6; s.op();
    expect(s.v(pin('OUT'))).toBeLessThan(4.2);
  });

  it('LDR divider voltage rises with light', () => {
    const c = new Circuit(), vcc = c.node(), mid = c.node();
    c.add(new VoltageSource(vcc, 0, 5)); c.add(new Resistor(mid, 0, 10000));
    const { rt } = mount(c, ldr, { '1': vcc, '2': mid }, { light: 0 });
    const s = new Simulator(c); s.op();
    const dark = s.v(mid);
    rt.update!({ light: 100 }); s.op();
    expect(dark).toBeLessThan(0.1); expect(s.v(mid)).toBeGreaterThan(4.4);
  });

  it('relay switches COM from NC to NO above the pull-in voltage', () => {
    const c = new Circuit(), coil = c.node(), vcc = c.node();
    const drive = c.add(new VoltageSource(coil, 0, 2)); c.add(new VoltageSource(vcc, 0, 12));
    const { pin } = mount(c, relay, { C1: coil, C2: 0, COM: vcc });
    c.add(new Resistor(pin('NO'), 0, 1000)); c.add(new Resistor(pin('NC'), 0, 1000));
    const s = new Simulator(c); s.op();
    expect(s.v(pin('NC'))).toBeGreaterThan(11.5); expect(s.v(pin('NO'))).toBeLessThan(0.1);
    drive.volts = 5; s.op();
    expect(s.v(pin('NO'))).toBeGreaterThan(11.5); expect(s.v(pin('NC'))).toBeLessThan(0.1);
  });
});

describe('more logic chips', () => {
  // Every input pin is driven by its own source so a test can set levels and step the clock.
  function rig(def: PartDef<{}>, inputs: string[], vccPin: string, gndPin: string) {
    const c = new Circuit(), vcc = c.node();
    c.add(new VoltageSource(vcc, 0, 5));
    const src: Record<string, VoltageSource> = {}, nodes: Record<string, number> = { [vccPin]: vcc, [gndPin]: 0 };
    for (const p of inputs) { const n = c.node(); src[p] = c.add(new VoltageSource(n, 0, 0)); nodes[p] = n; }
    const { pin } = mount(c, def, nodes);
    const s = new Simulator(c, { dt: 1e-5 }); s.op();
    const set = (lv: Record<string, 0 | 1>) => { for (const [p, v] of Object.entries(lv)) src[p]!.volts = v * 5; s.step(3); };
    const hi = (p: string) => s.v(pin(p)) > 2.5;
    return { set, hi };
  }

  it('74HC283 adds two 4-bit numbers with carry', () => {
    const A = ['5', '3', '14', '12'], B = ['6', '2', '15', '11'], S = ['4', '1', '13', '10'];
    const { set, hi } = rig(hc283, [...A, ...B, '7'], '16', '8');
    for (const [a, bb, cin] of [[5, 3, 0], [9, 9, 1], [15, 1, 0], [0, 0, 0]] as const) {
      const lv: Record<string, 0 | 1> = { '7': cin };
      A.forEach((p, i) => lv[p] = ((a >> i) & 1) as 0 | 1); B.forEach((p, i) => lv[p] = ((bb >> i) & 1) as 0 | 1);
      set(lv);
      const sum = S.reduce((acc, p, i) => acc + (hi(p) ? 1 << i : 0), 0) + (hi('9') ? 16 : 0);
      expect(sum, `${a}+${bb}+${cin}`).toBe(a + bb + cin);
    }
  });

  it('74HC151 routes the selected input to Y', () => {
    const D = ['4', '3', '2', '1', '15', '14', '13', '12'];
    const { set, hi } = rig(hc151, [...D, '7', '9', '10', '11'], '16', '8');
    const base: Record<string, 0 | 1> = { '7': 0 }; D.forEach((p, i) => base[p] = (i === 5 ? 1 : 0));
    set({ ...base, '11': 1, '10': 0, '9': 1 });
    expect(hi('5')).toBe(true); expect(hi('6')).toBe(false);
    set({ '11': 0 });
    expect(hi('5')).toBe(false);
    set({ '11': 1, '7': 1 });
    expect(hi('5')).toBe(false);
  });

  it('CD4511 lights the right segments and blanks above 9', () => {
    const { set, hi } = rig(cd4511, ['7', '1', '2', '6', '3', '4', '5'], '16', '8');
    const seg = { a: '13', b: '12', c: '11', d: '10', e: '9', f: '15', g: '14' };
    const lit = () => Object.entries(seg).filter(([, p]) => hi(p)).map(([k]) => k).join('');
    const code = (n: number) => ({ '7': (n & 1) as 0 | 1, '1': ((n >> 1) & 1) as 0 | 1, '2': ((n >> 2) & 1) as 0 | 1, '6': ((n >> 3) & 1) as 0 | 1 });
    set({ '3': 1, '4': 1, '5': 0, ...code(5) }); expect(lit()).toBe('acdfg');
    set(code(8)); expect(lit()).toBe('abcdefg');
    set(code(12)); expect(lit()).toBe('');
    set(code(1)); set({ '5': 1 }); set(code(7)); expect(lit()).toBe('bc');
    set({ '3': 0 }); expect(lit()).toBe('abcdefg');
  });

  it('74HC112 sets, resets and toggles on the falling edge', () => {
    const { set, hi } = rig(hc112, ['1', '2', '3', '4', '15'], '16', '8');
    const clock = () => { set({ '1': 1 }); set({ '1': 0 }); };
    set({ '4': 1, '15': 1, '3': 1, '2': 0, '1': 0 }); clock(); expect(hi('5')).toBe(true);
    set({ '3': 0, '2': 1 }); set({ '1': 1 }); expect(hi('5')).toBe(true); set({ '1': 0 }); expect(hi('5')).toBe(false);
    set({ '3': 1, '2': 1 }); clock(); expect(hi('5')).toBe(true); clock(); expect(hi('5')).toBe(false);
    set({ '15': 0 }); expect(hi('5')).toBe(false); expect(hi('6')).toBe(true);
  });

  it('74HC193 counts up and down with borrow', () => {
    const { set, hi } = rig(hc193, ['5', '4', '11', '14', '15', '1', '10', '9'], '16', '8');
    const q = () => (hi('3') ? 1 : 0) + (hi('2') ? 2 : 0) + (hi('6') ? 4 : 0) + (hi('7') ? 8 : 0);
    set({ '5': 1, '4': 1, '11': 1, '14': 1 }); set({ '14': 0 });
    for (let i = 0; i < 3; i++) { set({ '5': 0 }); set({ '5': 1 }); }
    expect(q()).toBe(3);
    for (let i = 0; i < 4; i++) { set({ '4': 0 }); set({ '4': 1 }); }
    expect(q()).toBe(15);
    set({ '15': 0, '1': 1, '10': 0, '9': 0, '11': 0 }); set({ '11': 1 }); expect(q()).toBe(2);
    set({ '4': 0 }); set({ '4': 1 }); set({ '4': 0 }); set({ '4': 1 }); set({ '4': 0 }); expect(q()).toBe(0); expect(hi('13')).toBe(false);
  });
});
