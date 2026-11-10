import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { playDemos, playLesson } from '@/features/learn/headless';
import type { Doc } from '@/features/workbench/model';
import { BLINK_PICO, BLINK_UNO, BUTTON_UNO, FADE_UNO, POT_UNO, ADC_PICO, lastNum, micro } from './micro';

const L = (id: string) => micro.lessons.find(l => l.id === id)!;
const byType = (doc: Doc, type: string, n = 0) => doc.parts.filter(p => p.type === type)[n]!;
const wire = (doc: Doc, a: string, b: string) => doc.wires.push({ id: `t${doc.wires.length}`, a, b, color: '#d6452f' });

const hasCli = (() => { try { execFileSync('arduino-cli', ['version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const SKETCHES: Record<string, string> = {
  blink: BLINK_UNO,
  blinkFast: BLINK_UNO.replace(/delay\(500\)/g, 'delay(100)'),
  button: BUTTON_UNO,
  buttonInv: BUTTON_UNO.replace('digitalWrite(LED, pressed ? HIGH : LOW);', 'digitalWrite(LED, pressed ? LOW : HIGH);'),
  fade: FADE_UNO,
  fadeFast: FADE_UNO.replace('int step = 5;', 'int step = 15;'),
  pot: POT_UNO,
  potVolts: POT_UNO.replace('  delay(100);', '  Serial.print("Volts = ");\n  Serial.println(value * 5.0 / 1023.0);\n  delay(100);'),
};
const hex: Record<string, string> = {};

beforeAll(() => {
  if (!hasCli) return;
  const root = mkdtempSync(join(tmpdir(), 'eb-micro-'));
  for (const [name, code] of Object.entries(SKETCHES)) {
    const dir = join(root, name);
    mkdirSync(dir);
    writeFileSync(join(dir, `${name}.ino`), code);
    execFileSync('arduino-cli', ['compile', '--fqbn', 'arduino:avr:uno', '--output-dir', join(dir, 'out'), dir], { stdio: 'ignore' });
    hex[name] = readFileSync(join(dir, 'out', `${name}.ino.hex`), 'utf8');
  }
}, 300_000);

const upload = (d: Doc, name: string) => { const u = byType(d, 'arduino-uno'); u.props.code = SKETCHES[name]!; u.props.binary = hex[name]!; };

describe.skipIf(!hasCli)('micro · Arduino', () => {
  it('blink can be completed', () => {
    expect(playLesson(L('uno-blink'), [d => upload(d, 'blink'), undefined, d => upload(d, 'blinkFast')])).toBe(-1);
  });

  it('button can be completed', () => {
    expect(playLesson(L('uno-button'), [
      d => upload(d, 'button'),
      d => { byType(d, 'button').props.pressed = true; },
      d => { upload(d, 'buttonInv'); byType(d, 'button').props.pressed = false; },
    ])).toBe(-1);
  });

  it('fade can be completed', () => {
    expect(playLesson(L('uno-fade'), [d => upload(d, 'fade'), d => upload(d, 'fadeFast')])).toBe(-1);
  });

  it('analogRead can be completed', () => {
    expect(playLesson(L('uno-analog'), [
      d => upload(d, 'pot'),
      d => { byType(d, 'pot').props.position = 1; },
      d => { byType(d, 'pot').props.position = 0.5; },
      d => upload(d, 'potVolts'),
    ])).toBe(-1);
  });

  it('Show me demos solve every Arduino lesson', () => {
    expect(playDemos(L('uno-blink'), 0.3, { 0: d => upload(d, 'blink'), 2: d => upload(d, 'blinkFast') })).toBe(-1);
    expect(playDemos(L('uno-button'), 0.3, { 0: d => upload(d, 'button'), 2: d => upload(d, 'buttonInv') })).toBe(-1);
    expect(playDemos(L('uno-fade'), 0.3, { 0: d => upload(d, 'fade'), 1: d => upload(d, 'fadeFast') })).toBe(-1);
    expect(playDemos(L('uno-analog'), 0.3, { 0: d => upload(d, 'pot'), 3: d => upload(d, 'potVolts') })).toBe(-1);
  });
});

const FW = join(__dirname, '../../public/firmware');
const haveFw = existsSync(join(FW, 'rp2040-bootrom-b1.bin')) && existsSync(join(FW, 'micropython-rp2040.uf2'));

describe.skipIf(!haveFw)('micro · Pico', () => {
  beforeAll(() => {
    const fw = { bootrom: readFileSync(join(FW, 'rp2040-bootrom-b1.bin')), uf2: readFileSync(join(FW, 'micropython-rp2040.uf2')) };
    (globalThis as { BenchHost?: unknown }).BenchHost = { firmware: { pico: () => fw } };
  });
  afterAll(() => { delete (globalThis as { BenchHost?: unknown }).BenchHost; });
  const run = (d: Doc, code?: string) => { const p = byType(d, 'pico'); if (code) p.props.code = code; p.props.run = true; p.props.runId = Number(p.props.runId ?? 0) + 1; };

  it('blink can be completed', () => {
    expect(playLesson(L('pico-blink'), [
      d => run(d),
      d => run(d),
      d => run(d, BLINK_PICO.replace('DELAY = 0.5', 'DELAY = 0.1')),
    ], 0.4)).toBe(-1);
  }, 120_000);

  it('ADC can be completed', () => {
    expect(playLesson(L('pico-adc'), [
      d => run(d),
      d => { run(d); byType(d, 'pot').props.position = 1; },
      d => { run(d); byType(d, 'pot').props.position = 0.5; },
      d => run(d, ADC_PICO.replace('print("adc", value)', 'print("volts", value * 3.3 / 65535)')),
    ], 0.5)).toBe(-1);
  }, 120_000);

  it('Show me demos solve both Pico lessons', () => {
    expect(playDemos(L('pico-blink'), 0.4, { 0: d => run(d), 1: d => run(d), 2: d => run(d, BLINK_PICO.replace('DELAY = 0.5', 'DELAY = 0.1')) })).toBe(-1);
    expect(playDemos(L('pico-adc'), 0.5, { 0: d => run(d), 1: d => run(d), 2: d => run(d), 3: d => run(d, ADC_PICO.replace('print("adc", value)', 'print("volts", value * 3.3 / 65535)')) })).toBe(-1);
  }, 240_000);
});

describe('micro · Raspberry Pi 4 wiring', () => {
  it('LED lesson wiring checks pass', () => {
    expect(playLesson(L('pi-led'), [
      d => { const pi = byType(d, 'rpi4').id, r = byType(d, 'resistor').id, led = byType(d, 'led').id; wire(d, `${pi}:11`, `${r}:1`); wire(d, `${r}:2`, `${led}:A`); wire(d, `${led}:K`, `${pi}:6`); },
      undefined,
      d => { const pi = byType(d, 'rpi4').id; const w = d.wires.find(x => x.a === `${pi}:11`)!; w.a = `${pi}:13`; },
    ])).toBe(-1);
  });

  it('button lesson wiring checks pass', () => {
    expect(playLesson(L('pi-button'), [
      d => { const pi = byType(d, 'rpi4').id, b = byType(d, 'button').id; wire(d, `${pi}:13`, `${b}:1a`); wire(d, `${b}:2a`, `${pi}:14`); },
      undefined,
      d => { byType(d, 'button').props.pressed = true; },
    ])).toBe(-1);
  });

  it('Show me demos solve both Pi lessons', () => {
    expect(playDemos(L('pi-led'))).toBe(-1);
    expect(playDemos(L('pi-button'))).toBe(-1);
  });

  it('an unwired LED does not pass the first step', () => {
    expect(playLesson(L('pi-led'), [])).toBe(0);
  });
});

describe('micro · content', () => {
  it('has eight lessons with steps and a quiz each', () => {
    expect(micro.lessons).toHaveLength(8);
    for (const l of micro.lessons) { expect(l.steps.length).toBeGreaterThanOrEqual(3); expect(l.quiz.length).toBeGreaterThanOrEqual(2); }
  });
  it('lastNum reads the latest value', () => {
    expect(lastNum('A0 = 3\r\nA0 = 1020\r\n', /A0 = (\d+)/g)).toBe(1020);
    expect(lastNum('', /x (\d+)/g)).toBeNaN();
  });
});
