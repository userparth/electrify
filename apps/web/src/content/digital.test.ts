import { describe, expect, it } from 'vitest';
import { playLesson } from '@/features/learn/headless';
import type { Doc } from '@/features/workbench/model';
import { digital } from './digital';

const L = (id: string) => digital.lessons.find(l => l.id === id)!;
const nth = (doc: Doc, type: string, n = 0) => doc.parts.filter(p => p.type === type)[n]!;
const pin = (doc: Doc, type: string, p: string, n = 0) => `${nth(doc, type, n).id}:${p}`;
let k = 0;
const wire = (doc: Doc, a: string, b: string) => doc.wires.push({ id: `t${k++}`, a, b, color: '#d6452f' });
const unwire = (doc: Doc, a: string, b: string) => { doc.wires = doc.wires.filter(w => !((w.a === a && w.b === b) || (w.a === b && w.b === a))); };
const bat = (doc: Doc, t: '+' | '-') => pin(doc, 'battery', t);

describe('digital', () => {
  it('adder', () => {
    expect(playLesson(L('adder'), [
      d => { nth(d, 'logic-switch', 0).props.on = true; },
      d => { wire(d, pin(d, 'logic-switch', 'OUT', 0), pin(d, '74hc08', '1')); wire(d, pin(d, 'logic-switch', 'OUT', 1), pin(d, '74hc08', '2')); wire(d, pin(d, '74hc08', '3'), pin(d, 'resistor', '1', 1)); },
      d => { nth(d, 'logic-switch', 1).props.on = true; },
    ])).toBe(-1);
  });

  it('seven-segment decoder', () => {
    const ps = (d: Doc, t: '+' | '-') => pin(d, 'psu', t);
    const setCode = (d: Doc, n: number) => [0, 1, 2, 3].forEach(i => { nth(d, 'logic-switch', i).props.on = !!(n & (8 >> i)); });
    expect(playLesson(L('seven-seg'), [
      d => { wire(d, pin(d, 'cd4511', '16'), ps(d, '+')); wire(d, pin(d, 'cd4511', '8'), ps(d, '-')); wire(d, pin(d, 'cd4511', '3'), ps(d, '+')); wire(d, pin(d, 'cd4511', '4'), ps(d, '+')); wire(d, pin(d, 'cd4511', '5'), ps(d, '-')); },
      d => setCode(d, 5),
      d => setCode(d, 9),
      d => setCode(d, 12),
    ])).toBe(-1);
  });

  it('new digital lessons are not passed by doing nothing', () => {
    for (const id of ['adder', 'seven-seg']) { const l = L(id); expect(playLesson(l, []), id).toBe(l.steps.findIndex(s => s.check)); }
  });

  it('logic levels', () => {
    expect(playLesson(L('logic-levels'), [
      d => { wire(d, pin(d, 'logic-probe', 'VCC'), bat(d, '+')); wire(d, pin(d, 'logic-probe', 'GND'), bat(d, '-')); },
      d => wire(d, pin(d, 'logic-probe', 'TIP'), pin(d, 'logic-switch', 'OUT')),
      d => { nth(d, 'logic-switch').props.on = true; },
    ])).toBe(-1);
  });

  it('gates', () => {
    expect(playLesson(L('gates'), [
      d => { nth(d, 'logic-switch', 0).props.on = true; },
      d => { nth(d, 'logic-switch', 1).props.on = true; },
      d => {
        unwire(d, pin(d, 'logic-switch', 'OUT', 0), pin(d, '74hc08', '1')); unwire(d, pin(d, 'logic-switch', 'OUT', 1), pin(d, '74hc08', '2')); unwire(d, pin(d, '74hc08', '3'), pin(d, 'resistor', '1'));
        wire(d, pin(d, 'logic-switch', 'OUT', 0), pin(d, '74hc32', '1')); wire(d, pin(d, 'logic-switch', 'OUT', 1), pin(d, '74hc32', '2')); wire(d, pin(d, '74hc32', '3'), pin(d, 'resistor', '1'));
        nth(d, 'logic-switch', 1).props.on = false;
      },
    ])).toBe(-1);
  });

  it('nand universal', () => {
    expect(playLesson(L('nand-universal'), [
      d => { nth(d, 'logic-switch', 0).props.on = true; nth(d, 'logic-switch', 1).props.on = true; },
      d => {
        const a = pin(d, 'logic-switch', 'OUT', 0);
        wire(d, a, pin(d, '74hc00', '4')); wire(d, a, pin(d, '74hc00', '5'));
        unwire(d, pin(d, '74hc00', '3'), pin(d, 'resistor', '1')); wire(d, pin(d, '74hc00', '6'), pin(d, 'resistor', '1'));
      },
      d => {
        const a = pin(d, 'logic-switch', 'OUT', 0);
        unwire(d, a, pin(d, '74hc00', '4')); unwire(d, a, pin(d, '74hc00', '5'));
        wire(d, pin(d, '74hc00', '3'), pin(d, '74hc00', '4')); wire(d, pin(d, '74hc00', '3'), pin(d, '74hc00', '5'));
      },
    ])).toBe(-1);
  });

  it('555 clock', () => {
    expect(playLesson(L('555-clock'), [
      undefined,
      d => { nth(d, 'resistor', 1).props.ohms = 4700; },
      d => { nth(d, 'cap-ceramic', 0).props.farads = 2.2e-6; },
    ])).toBe(-1);
  });

  it('flip-flop', () => {
    expect(playLesson(L('flip-flop'), [
      d => { wire(d, pin(d, '74hc74', '14'), bat(d, '+')); wire(d, pin(d, '74hc74', '7'), bat(d, '-')); },
      d => { wire(d, pin(d, '74hc74', '1'), pin(d, '74hc74', '14')); wire(d, pin(d, '74hc74', '4'), pin(d, '74hc74', '14')); },
      d => wire(d, pin(d, '74hc74', '6'), pin(d, '74hc74', '2')),
    ])).toBe(-1);
  });

  it('counter', () => {
    expect(playLesson(L('counter'), [
      d => { wire(d, pin(d, 'cd4017', '16'), bat(d, '+')); wire(d, pin(d, 'cd4017', '8'), bat(d, '-')); },
      d => { wire(d, pin(d, 'cd4017', '13'), pin(d, 'cd4017', '8')); wire(d, pin(d, 'cd4017', '15'), pin(d, 'cd4017', '8')); },
      d => { nth(d, 'fgen').props.freq = 2; },
    ])).toBe(-1);
  });

  it('shift register', () => {
    expect(playLesson(L('shift-register'), [
      d => { wire(d, pin(d, '74hc595', '16'), bat(d, '+')); wire(d, pin(d, '74hc595', '8'), bat(d, '-')); wire(d, pin(d, '74hc595', '10'), pin(d, '74hc595', '16')); wire(d, pin(d, '74hc595', '13'), pin(d, '74hc595', '8')); },
      d => wire(d, pin(d, '74hc595', '14'), pin(d, '74hc595', '16')),
      d => { unwire(d, pin(d, '74hc595', '14'), pin(d, '74hc595', '16')); wire(d, pin(d, '74hc595', '14'), pin(d, '74hc595', '8')); },
    ])).toBe(-1);
  });
});

describe('digital checks are not free', () => {
  for (const l of digital.lessons) it(`${l.id} does not pass without the student`, () => {
    expect(playLesson(l, [])).not.toBe(-1);
  });
});
