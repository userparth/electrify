import { Circuit, LED, Resistor, Simulator, Switch, VoltageSource } from '@eb/engine';
import { afterEach, describe, expect, it } from 'vitest';
import { GPIO, RPI_BCM, rpi4, type PythonHost, type PythonSession } from '../src/parts/rpi';
import type { PartDef, Props, Runtime } from '../src/types';

function mount<P extends Props>(c: Circuit, def: PartDef<P>, nodes: Record<string, number>, props: Partial<P> = {}): { rt: Runtime; map: Record<string, number> } {
  const nets = def.nets?.({ ...def.defaults, ...props } as P) ?? [];
  const map: Record<string, number> = { ...nodes };
  for (const g of nets) { const n = g.map(id => map[id]).find(x => x != null) ?? c.node(); for (const id of g) map[id] = n; }
  const pin = (id: string) => map[id] ?? (map[id] = c.node());
  const rt = def.build({ circuit: c, pin, internal: () => c.node(), add: e => c.add(e) }, { ...def.defaults, ...props } as P);
  return { rt, map };
}

function fakeHost() {
  const gpio = new Int32Array(GPIO.SIZE);
  for (let b = 0; b < GPIO.COUNT; b++) gpio[GPIO.DUTY + b] = -1;
  const calls: string[] = [];
  const session: PythonSession = { gpio, read: () => 'hello\n', write: () => {}, status: () => ({ running: true, message: 'running' }) };
  const host: PythonHost = {
    ensure: (sid, _code, runId) => { calls.push(`ensure ${sid} ${runId}`); return session; },
    stop: sid => { calls.push(`stop ${sid}`); },
    prune: () => {},
  };
  (globalThis as { BenchHost?: unknown }).BenchHost = { python: host };
  return { gpio, calls };
}

afterEach(() => { delete (globalThis as { BenchHost?: unknown }).BenchHost; });

describe('Raspberry Pi 4 GPIO board', () => {
  it('has the standard 40-pin header with joined grounds', () => {
    const pins = rpi4.pins(rpi4.defaults);
    expect(pins).toHaveLength(40);
    expect(new Set(pins.map(p => p.id)).size).toBe(40);
    expect(pins.every(p => Number.isInteger(p.x) && Number.isInteger(p.y))).toBe(true);
    expect(RPI_BCM[11]).toBe(17); expect(RPI_BCM[12]).toBe(18); expect(RPI_BCM[3]).toBe(2); expect(RPI_BCM[40]).toBe(21);
    expect(Object.keys(RPI_BCM)).toHaveLength(28);
    const gnd = pins.filter(p => p.ground).map(p => p.id).sort();
    expect(gnd).toEqual(['14', '20', '25', '30', '34', '39', '6', '9'].sort());
    expect(rpi4.nets!(rpi4.defaults)[0]!.sort()).toEqual(gnd);
    expect(pins.find(p => p.id === '1')!.label).toBe('1 · 3V3');
  });

  it('works electrically without a Python host and says so', () => {
    const c = new Circuit();
    const { rt, map } = mount(c, rpi4, { '6': 0 });
    c.add(new Resistor(map['1']!, map['11'] ?? (map['11'] = c.node()), 1e9));
    const s = new Simulator(c); s.op();
    expect(s.v(map['1']!)).toBeCloseTo(3.3, 2);
    expect(rt.status!().message).toBe('Python runtime not available');
  });

  it('a GPIO output set by Python drives an LED through a resistor', () => {
    const { gpio, calls } = fakeHost();
    const c = new Circuit(), pin11 = c.node(), a = c.node();
    mount(c, rpi4, { '6': 0, '11': pin11 }, { sid: 'pi1', run: true, runId: 3 });
    expect(calls).toEqual(['ensure pi1 3']);
    c.add(new Resistor(pin11, a, 330));
    const led = c.add(new LED(a, 0, 'red'));
    gpio[GPIO.MODE + 17] = 1; gpio[GPIO.OUT + 17] = 1;
    const s = new Simulator(c, { dt: 1e-4 }); s.op(); s.step(3);
    expect(s.v(pin11)).toBeGreaterThan(3.1);
    expect(led.brightness).toBeGreaterThan(0.1);
    gpio[GPIO.OUT + 17] = 0; s.step(3);
    expect(led.brightness).toBeLessThan(0.001);
  });

  it('input with pull-up reads HIGH, a button to GND pulls it LOW', () => {
    const { gpio } = fakeHost();
    const c = new Circuit(), pin3 = c.node();
    mount(c, rpi4, { '6': 0, '3': pin3 }, { sid: 'pi2', run: true, runId: 1 });
    gpio[GPIO.PULL + 2] = 1;
    const btn = c.add(new Switch(pin3, 0, false));
    const s = new Simulator(c, { dt: 1e-4 }); s.op(); s.step(3);
    expect(gpio[GPIO.IN + 2]).toBe(1);
    btn.closed = true; s.step(3);
    expect(gpio[GPIO.IN + 2]).toBe(0);
  });

  it('PWM toggles the pin at the set frequency and duty', () => {
    const { gpio } = fakeHost();
    const c = new Circuit(), pin12 = c.node();
    mount(c, rpi4, { '6': 0, '12': pin12 }, { sid: 'pi3', run: true, runId: 1 });
    c.add(new Resistor(pin12, 0, 10000));
    gpio[GPIO.MODE + 18] = 1; gpio[GPIO.FREQ + 18] = 100; gpio[GPIO.DUTY + 18] = 2500;
    const s = new Simulator(c, { dt: 1e-4 }); s.op();
    let high = 0, n = 0;
    s.run(0.1, sim => { n++; if (sim.v(pin12) > 1.6) high++; });
    expect(high / n).toBeGreaterThan(0.2); expect(high / n).toBeLessThan(0.3);
  });

  it('warns when a GPIO sees more than 3.6 V', () => {
    fakeHost();
    const c = new Circuit(), pin11 = c.node();
    const { rt } = mount(c, rpi4, { '6': 0, '11': pin11 }, { sid: 'pi4', run: true, runId: 1 });
    c.add(new VoltageSource(pin11, 0, 5, 10));
    const s = new Simulator(c, { dt: 1e-4 }); s.op(); s.step(2);
    expect(rt.read!(s, () => 0).overVolt).toBe('GPIO17');
  });

  it('stopping asks the host to stop, and serial reads come from the session', () => {
    const { calls } = fakeHost();
    const c = new Circuit();
    mount(c, rpi4, { '6': 0 }, { sid: 'pi5', run: false });
    expect(calls).toEqual(['stop pi5']);
    const c2 = new Circuit();
    const { rt } = mount(c2, rpi4, { '6': 0 }, { sid: 'pi5', run: true, runId: 2 });
    expect(rt.serial!.read()).toBe('hello\n');
    expect(rt.update!({ ...rpi4.defaults, sid: 'pi5', run: true, runId: 2 })).toBe(true);
    expect(rt.update!({ ...rpi4.defaults, sid: 'pi5', run: true, runId: 3 })).toBe(false);
  });
});
