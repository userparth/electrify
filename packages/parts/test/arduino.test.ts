import { Circuit, Resistor, Simulator, Switch } from '@eb/engine';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { arduinoUno } from '../src/parts/arduino';
import type { Props, Runtime } from '../src/types';

const hasCli = (() => { try { execFileSync('arduino-cli', ['version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

const SKETCHES: Record<string, string> = {
  blink: arduinoUno.defaults.code,
  button: 'void setup(){ pinMode(2, INPUT_PULLUP); pinMode(13, OUTPUT); }\nvoid loop(){ digitalWrite(13, !digitalRead(2)); }\n',
  analog: 'void setup(){ Serial.begin(115200); }\nvoid loop(){ Serial.println(analogRead(A0)); delay(5); }\n',
  hello: 'void setup(){ Serial.begin(115200); Serial.println("hello bench"); }\nvoid loop(){}\n',
  pwm: 'void setup(){ analogWrite(9, 128); }\nvoid loop(){}\n',
};
const hex: Record<string, string> = {};

beforeAll(() => {
  if (!hasCli) return;
  const root = mkdtempSync(join(tmpdir(), 'eb-uno-'));
  for (const [name, code] of Object.entries(SKETCHES)) {
    const dir = join(root, name);
    mkdirSync(dir);
    writeFileSync(join(dir, `${name}.ino`), code);
    execFileSync('arduino-cli', ['compile', '--fqbn', 'arduino:avr:uno', '--output-dir', join(dir, 'out'), dir], { stdio: 'ignore' });
    hex[name] = readFileSync(join(dir, 'out', `${name}.ino.hex`), 'utf8');
  }
}, 180_000);

function uno(c: Circuit, binary: string, nodes: Record<string, number> = {}) {
  const map: Record<string, number> = { GND: 0, GND2: 0, GND3: 0, ...nodes };
  const pin = (id: string) => map[id] ?? (map[id] = c.node());
  const p = { ...arduinoUno.defaults, binary } as Props & typeof arduinoUno.defaults;
  const rt: Runtime = arduinoUno.build({ circuit: c, pin, internal: () => c.node(), add: e => c.add(e) }, p);
  return { rt, pin };
}

describe.skipIf(!hasCli)('Arduino Uno', () => {
  it('blink toggles D13 at about 1 Hz', () => {
    const c = new Circuit(), d13 = c.node();
    c.add(new Resistor(d13, 0, 10000));
    uno(c, hex.blink!, { D13: d13 });
    const s = new Simulator(c, { dt: 1e-4 }); s.op();
    let edges = 0, last = 0;
    const t0 = performance.now();
    s.run(2.05, sim => { const h = sim.v(d13) > 2.5 ? 1 : 0; if (h && !last) edges++; last = h; });
    const wall = (performance.now() - t0) / 1000;
    console.log(`blink: 2.05 sim-s in ${wall.toFixed(2)} wall-s → ${(2.05 / wall).toFixed(2)}× real time at 100 µs`);
    expect(edges).toBeGreaterThanOrEqual(2); expect(edges).toBeLessThanOrEqual(3);
  });

  it('reads a button with INPUT_PULLUP', () => {
    const c = new Circuit(), d2 = c.node(), d13 = c.node();
    const sw = c.add(new Switch(d2, 0, false));
    uno(c, hex.button!, { D2: d2, D13: d13 });
    const s = new Simulator(c, { dt: 1e-4 }); s.op(); s.run(0.01);
    expect(s.v(d2)).toBeGreaterThan(4.5);
    expect(s.v(d13)).toBeLessThan(0.5);
    sw.closed = true; s.run(0.01);
    expect(s.v(d13)).toBeGreaterThan(4.5);
  });

  it('analogRead of a 2.5 V divider is about 512', () => {
    const c = new Circuit(), a0 = c.node(), v5 = c.node();
    c.add(new Resistor(v5, a0, 10000)); c.add(new Resistor(a0, 0, 10000));
    const { rt } = uno(c, hex.analog!, { A0: a0, '5V': v5 });
    const s = new Simulator(c, { dt: 1e-4 }); s.op(); s.run(0.1);
    const nums = rt.serial!.read().split(/\r?\n/).map(Number).filter(n => n > 0);
    expect(nums.length).toBeGreaterThan(3);
    expect(Math.abs(nums[nums.length - 1]! - 512)).toBeLessThan(6);
  });

  it('Serial.println text arrives through serial.read()', () => {
    const c = new Circuit();
    const { rt } = uno(c, hex.hello!);
    const s = new Simulator(c, { dt: 1e-4 }); s.op(); s.run(0.05);
    expect(rt.serial!.read()).toContain('hello bench');
  });

  it('analogWrite(9, 128) gives about 50 % duty', () => {
    const c = new Circuit(), d9 = c.node();
    c.add(new Resistor(d9, 0, 10000));
    uno(c, hex.pwm!, { D9: d9 });
    const s = new Simulator(c, { dt: 1e-5 }); s.op(); s.run(0.01);
    let hi = 0, n = 0;
    s.run(0.04, sim => { n++; if (sim.v(d9) > 2.5) hi++; });
    expect(hi / n).toBeGreaterThan(0.44); expect(hi / n).toBeLessThan(0.56);
  });
});

describe('Arduino Uno without a program', () => {
  it('reports no program and leaves pins floating', () => {
    const c = new Circuit(), d13 = c.node();
    c.add(new Resistor(d13, 0, 10000));
    const { rt } = uno(c, '', { D13: d13 });
    const s = new Simulator(c, { dt: 1e-4 }); s.op(); s.run(0.01);
    expect(rt.status!().running).toBe(false);
    expect(rt.status!().message).toMatch(/No program/);
    expect(s.v(d13)).toBeLessThan(0.01);
  });
});
