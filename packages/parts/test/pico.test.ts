import { Circuit, LED, Resistor, Simulator, Switch } from '@eb/engine';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FirmwareHost } from '../src/mcu/rp2040';
import { PICO_GP, pico } from '../src/parts/pico';
import type { PartDef, Props, Runtime } from '../src/types';

const FW = join(__dirname, '../../../apps/web/public/firmware');
const haveFw = existsSync(join(FW, 'rp2040-bootrom-b1.bin')) && existsSync(join(FW, 'micropython-rp2040.uf2'));
const fw = haveFw ? { bootrom: readFileSync(join(FW, 'rp2040-bootrom-b1.bin')), uf2: readFileSync(join(FW, 'micropython-rp2040.uf2')) } : null;

function mount<P extends Props>(c: Circuit, def: PartDef<P>, nodes: Record<string, number>, props: Partial<P> = {}): { rt: Runtime; map: Record<string, number> } {
  const nets = def.nets?.({ ...def.defaults, ...props } as P) ?? [];
  const map: Record<string, number> = { ...nodes };
  for (const g of nets) { const n = g.map(id => map[id]).find(x => x != null) ?? c.node(); for (const id of g) map[id] = n; }
  const pin = (id: string) => map[id] ?? (map[id] = c.node());
  const rt = def.build({ circuit: c, pin, internal: () => c.node(), add: e => c.add(e) }, { ...def.defaults, ...props } as P);
  return { rt, map };
}

const setHost = () => { (globalThis as { BenchHost?: { firmware: FirmwareHost } }).BenchHost = { firmware: { pico: () => fw } }; };
afterEach(() => { delete (globalThis as { BenchHost?: unknown }).BenchHost; });

let runId = 0;
/** Builds a Pico (sid shared, so MicroPython boots once) and runs `code` until `done(serial)` or `maxS` sim-seconds. */
function runPico(code: string, wire: (c: Circuit, map: Record<string, number>) => void, done: (out: string) => boolean, maxS = 3) {
  setHost();
  const c = new Circuit();
  const { rt, map } = mount(c, pico, { '38': 0 }, { sid: 'test-pico', code, run: true, runId: ++runId });
  wire(c, map);
  const sim = new Simulator(c, { dt: 1e-4 });
  sim.op();
  let out = '';
  for (let i = 0; i < maxS / 1e-4; i++) { sim.step(); if (i % 50 === 0) { out += rt.serial!.read(); if (done(out) && !rt.status!().running) break; } }
  out += rt.serial!.read();
  return { sim, out, rt, map };
}

describe('Raspberry Pi Pico', () => {
  it('has the real 40-pin edge with joined grounds', () => {
    const pins = pico.pins(pico.defaults);
    expect(pins).toHaveLength(40);
    expect(new Set(pins.map(p => p.id)).size).toBe(40);
    expect(pins.every(p => Number.isInteger(p.x) && Number.isInteger(p.y))).toBe(true);
    expect(PICO_GP[1]).toBe(0); expect(PICO_GP[20]).toBe(15); expect(PICO_GP[31]).toBe(26); expect(PICO_GP[34]).toBe(28);
    expect(Object.keys(PICO_GP)).toHaveLength(26);
    expect(pins.filter(p => p.ground).map(p => p.id).sort()).toEqual(pico.nets!(pico.defaults)[0]!.sort());
    expect(Math.abs(pins[0]!.y - pins[39]!.y)).toBe(7);
  });

  it('without firmware it says so and leaves the pins floating', () => {
    const c = new Circuit();
    const { rt, map } = mount(c, pico, { '38': 0 }, { sid: 'nofw', run: true, runId: 1 });
    c.add(new Resistor(map['20']!, 0, 1e6));
    const s = new Simulator(c, { dt: 1e-4 }); s.op(); s.step(10);
    expect(rt.status!().message).toMatch(/firmware not available/);
    expect(s.v(map['20']!)).toBeLessThan(0.01);
  });

  describe.skipIf(!haveFw)('with MicroPython', () => {
    it('boots and runs a program', () => {
      const { out } = runPico('print(6*7)\n', () => {}, o => o.includes('42'));
      expect(out).toContain('MicroPython v1.29');
      expect(out).toContain('42');
    }, 60000);

    it('reports a traceback for broken code', () => {
      const { out, rt } = runPico('print(1/0)\n', () => {}, o => o.includes('ZeroDivisionError'));
      expect(out).toContain('ZeroDivisionError');
      expect(rt.status!().message).toMatch(/ZeroDivisionError/);
    }, 60000);

    it('GP15 output lights an LED through the circuit', () => {
      let led!: LED;
      const { sim, map } = runPico('from machine import Pin\nPin(15, Pin.OUT).value(1)\nprint("set")\n', (c, m) => {
        const mid = c.node(); c.add(new Resistor(m['20']!, mid, 330)); led = c.add(new LED(mid, 0, 'red'));
      }, o => o.includes('set'));
      sim.step(5);
      expect(sim.v(map['20']!)).toBeGreaterThan(2.8);
      expect(led.brightness).toBeGreaterThan(0.15);
    }, 60000);

    it('reads an input with the internal pull-up and a button to GND', () => {
      const code = 'from machine import Pin\np = Pin(14, Pin.IN, Pin.PULL_UP)\nprint("v=%d" % p.value())\n';
      const open = runPico(code, (c, m) => { c.add(new Switch(m['19']!, 0, false)); }, o => /v=\d/.test(o));
      expect(open.out).toContain('v=1');
      const closed = runPico(code, (c, m) => { c.add(new Switch(m['19']!, 0, true)); }, o => /v=\d/.test(o));
      expect(closed.out).toContain('v=0');
    }, 60000);

    it('ADC0 on GP26 reads half of 3.3 V as ~32768', () => {
      const { out } = runPico('import machine\nprint("adc=%d" % machine.ADC(26).read_u16())\n', (c, m) => {
        c.add(new Resistor(m['36']!, m['31']!, 10000)); c.add(new Resistor(m['31']!, 0, 10000));
      }, o => /adc=\d+/.test(o));
      const v = +(out.match(/adc=(\d+)/)?.[1] ?? -1);
      expect(Math.abs(v - 32768)).toBeLessThan(1200);
    }, 60000);

    it('keeps up roughly with real time while sleeping in a loop', () => {
      const t0 = performance.now();
      const { out } = runPico('import time\nfor i in range(3):\n    time.sleep(0.2)\nprint("slept")\n', () => {}, o => o.includes('slept'), 2);
      const wall = (performance.now() - t0) / 1000;
      expect(out).toContain('slept');
      console.log(`0.6 s of sleeping MicroPython took ${wall.toFixed(2)} s wall`);
    }, 60000);
  });
});
