import { Circuit, Resistor, Simulator, VoltageSource } from '@eb/engine';
import { describe, expect, it } from 'vitest';
import { solarPanel } from '../src/parts/analog';
import { battery } from '../src/parts/core';
import { chargeController, dcdcModule, inverter, router } from '../src/parts/power';
import type { PartDef, Props, Runtime } from '../src/types';

function mount<P extends Props>(c: Circuit, def: PartDef<P>, nodes: Record<string, number>, props: Partial<P> = {}): { rt: Runtime; p: P } {
  const nets = def.nets?.({ ...def.defaults, ...props } as P) ?? [];
  const map: Record<string, number> = { ...nodes };
  for (const g of nets) { const n = g.map(id => map[id]).find(x => x != null) ?? c.node(); for (const id of g) map[id] = n; }
  const pin = (id: string) => map[id] ?? (map[id] = c.node());
  const p = { ...def.defaults, ...props } as P;
  return { rt: def.build({ circuit: c, pin, internal: () => c.node(), add: e => c.add(e) }, p), p };
}
const read = (rt: Runtime, s: Simulator) => rt.read!(s, () => 0);

function solarRig(soc: number, sun: number, cc: Partial<{ lvd: number; lvdOff: boolean; load: boolean }> = {}, ah?: number) {
  const c = new Circuit(), bp = c.node(), pp = c.node(), pn = c.node(), lp = c.node(), ln = c.node();
  const bat = mount(c, battery, { '+': bp, '-': 0 }, { volts: '12' });
  const b = c.elements.at(-1) as unknown as { opts: { soc: number; ah: number } };
  b.opts.soc = soc; if (ah) b.opts.ah = ah;
  const pv = mount(c, solarPanel, { '+': pp, '-': pn }, { sun });
  const ctl = mount(c, chargeController, { 'BAT+': bp, 'BAT-': 0, 'PV+': pp, 'PV-': pn, 'LOAD+': lp, 'LOAD-': ln }, cc);
  c.add(new Resistor(lp, ln, 14.4));
  return { c, bat, pv, ctl, b };
}

describe('solar power parts', () => {
  it('panel + controller + battery charges in daylight at about the panel Isc', () => {
    const { c, ctl } = solarRig(0.5, 100);
    const s = new Simulator(c, { dt: 1e-3 }); s.op(); s.step(20);
    const lv = read(ctl.rt, s);
    expect(lv.mode).toBe('12V'); expect(lv.charging).toBe(true);
    expect(lv.ichg as number).toBeGreaterThan(2.5); expect(lv.ichg as number).toBeLessThan(2.9);
  });

  it('panel connected before the battery makes the controller pick 24 V', () => {
    const c = new Circuit(), pp = c.node(), pn = c.node(), bp = c.node();
    mount(c, solarPanel, { '+': pp, '-': pn }, { sun: 100 });
    const ctl = mount(c, chargeController, { 'BAT+': bp, 'BAT-': 0, 'PV+': pp, 'PV-': pn });
    const s = new Simulator(c, { dt: 1e-3 }); s.op(); s.step(5);
    expect(read(ctl.rt, s).mode).toBe('24V');
    expect(s.events.some(e => e.kind === 'cc-24v')).toBe(true);
  });

  it('with LVD off the battery drains until flat, then the sun brings the load back', () => {
    const { c, ctl, pv } = solarRig(0.3, 0, { lvdOff: true }, 0.05);
    const s = new Simulator(c, { dt: 1 }); s.op();
    s.run(400);
    let lv = read(ctl.rt, s);
    expect(lv.flat).toBe(true); expect(lv.load).toBe(false); expect(lv.mode).toBe('12V');
    pv.rt.update!({ sun: 100 });
    s.run(600);
    lv = read(ctl.rt, s);
    expect(lv.flat).toBe(false); expect(lv.load).toBe(true);
  });

  it('with LVD on the load is cut at the set voltage', () => {
    const { c, ctl } = solarRig(0.3, 0, { lvdOff: false, lvd: 12 });
    const s = new Simulator(c, { dt: 1e-3 }); s.op(); s.step(3);
    const lv = read(ctl.rt, s);
    expect(lv.lvdCut).toBe(true); expect(lv.load).toBe(false);
  });

  it('buck-boost DC-DC holds 12 V from an 11–14 V battery', () => {
    for (const vin of [11, 12.6, 14]) {
      const c = new Circuit(), ip = c.node(), op = c.node();
      c.add(new VoltageSource(ip, 0, vin)); mount(c, dcdcModule, { 'IN+': ip, 'IN-': 0, 'OUT+': op }); c.add(new Resistor(op, 0, 24));
      const s = new Simulator(c, { dt: 1e-4 }); s.op(); s.step(5);
      expect(s.v(op)).toBeCloseTo(12, 1);
    }
  });

  it('a 12 V router dies on 16 V and stays dead', () => {
    const c = new Circuit(), a = c.node();
    const src = c.add(new VoltageSource(a, 0, 16));
    const r = mount(c, router, { C: a, S: 0 });
    const s = new Simulator(c, { dt: 1e-3 }); s.op(); s.step(2);
    expect(read(r.rt, s).dead).toBe(true);
    src.volts = 12; s.step(3);
    expect(read(r.rt, s).dead).toBe(true);
  });

  it('inverter runs 230 V AC at 200 W and trips at 350 W', () => {
    const c = new Circuit(), p = c.node(), l = c.node(), n = c.node();
    c.add(new VoltageSource(p, 0, 12.6, 0.01)); c.add(new Resistor(l, n, 1e5));
    const inv = mount(c, inverter, { 'DC+': p, 'DC-': 0, L: l, N: n }, { watts: 200 });
    const s = new Simulator(c, { dt: 1e-4 }); s.op();
    let peak = 0;
    s.run(0.04, sim => { peak = Math.max(peak, sim.v(l) - sim.v(n)); });
    expect(read(inv.rt, s).running).toBe(true); expect(peak).toBeGreaterThan(300);
    inv.rt.update!({ on: true, watts: 350 }); s.step(3);
    expect(read(inv.rt, s).trip).toBe(true);
  });
});
