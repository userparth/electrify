import { describe, expect, it } from 'vitest';
import { playDemos, playLesson } from '@/features/learn/headless';
import type { Doc, Inst } from '@/features/workbench/model';
import { analog } from './analog';

const L = (id: string) => analog.lessons.find(l => l.id === id)!;
const P = (doc: Doc, type: string, n = 0) => doc.parts.filter(p => p.type === type)[n]!;
const k = (doc: Doc, type: string, pin: string, n = 0) => `${P(doc, type, n).id}:${pin}`;
let seq = 0;
const wire = (doc: Doc, a: string, b: string) => doc.wires.push({ id: `t${++seq}`, a, b, color: '#d6452f' });
const unwire = (doc: Doc, a: string, b: string) => { doc.wires = doc.wires.filter(w => !((w.a === a && w.b === b) || (w.a === b && w.b === a))); };
const add = (doc: Doc, id: string, type: string, props: Inst['props'] = {}) => { doc.parts.push({ id, type, x: 40, y: 20 + doc.parts.length * 3, rot: 0, props }); return id; };
const meter = (doc: Doc, red: string, black: string) => { const m = P(doc, 'dmm').id; doc.wires = doc.wires.filter(w => !w.a.startsWith(`${m}:`) && !w.b.startsWith(`${m}:`)); wire(doc, `${m}:VmA`, red); wire(doc, `${m}:COM`, black); };

describe('analog module', () => {
  it('capacitor-rc', () => {
    expect(playLesson(L('capacitor-rc'), [
      undefined,
      d => wire(d, k(d, 'scope', 'CH2'), k(d, 'cap-ceramic', '1')),
      d => { P(d, 'cap-ceramic').props.farads = 1e-6; },
      d => { P(d, 'cap-ceramic').props.farads = 10e-9; },
    ], 0.012)).toBe(-1);
  });

  it('diodes', () => {
    expect(playLesson(L('diodes'), [
      d => meter(d, k(d, 'diode', 'A'), k(d, 'diode', 'K')),
      d => {
        const a = k(d, 'diode', 'A'), kk = k(d, 'diode', 'K'), r2 = k(d, 'resistor', '2'), neg = k(d, 'psu', '-');
        unwire(d, r2, a); unwire(d, kk, neg); wire(d, r2, kk); wire(d, a, neg);
      },
      d => {
        const r2 = k(d, 'resistor', '2'), neg = k(d, 'psu', '-'), did = P(d, 'diode').id;
        d.parts = d.parts.filter(p => p.id !== did); d.wires = d.wires.filter(w => !w.a.startsWith(`${did}:`) && !w.b.startsWith(`${did}:`));
        const z = add(d, 'z1', 'zener'); wire(d, r2, `${z}:K`); wire(d, `${z}:A`, neg);
        P(d, 'psu').props.volts = 12;
      },
      d => { P(d, 'psu').props.volts = 15; },
    ])).toBe(-1);
  });

  it('bjt-switch', () => {
    expect(playLesson(L('bjt-switch'), [
      d => { const r = add(d, 'rb', 'resistor', { ohms: 10000, span: 4 }); wire(d, k(d, 'spst', '2'), `${r}:1`); wire(d, `${r}:2`, k(d, '2n2222', 'B')); },
      d => { P(d, 'spst').props.on = true; },
      d => meter(d, k(d, '2n2222', 'C'), k(d, '2n2222', 'E')),
      d => { P(d, 'spst').props.on = false; },
    ])).toBe(-1);
  });

  it('mosfet', () => {
    expect(playLesson(L('mosfet'), [
      d => { P(d, 'pot').props.position = 0.5; },
      d => meter(d, k(d, '2n7000', 'G'), k(d, '2n7000', 'S')),
      undefined,
      d => { const r = add(d, 'rpd', 'resistor', { ohms: 100000, span: 4 }); wire(d, `${r}:1`, k(d, '2n7000', 'G')); wire(d, `${r}:2`, k(d, '2n7000', 'S')); },
    ])).toBe(-1);
  });

  it('night-light', () => {
    expect(playLesson(L('night-light'), [
      d => { P(d, 'ldr').props.light = 90; },
      d => { P(d, 'ldr').props.light = 10; },
      d => meter(d, k(d, 'ldr', '1'), k(d, 'psu', '-')),
    ])).toBe(-1);
  });

  it('op-amp', () => {
    expect(playLesson(L('op-amp'), [
      d => wire(d, k(d, 'lm358', '1'), k(d, 'lm358', '2')),
      d => meter(d, k(d, 'lm358', '1'), k(d, 'psu', '-')),
      d => {
        unwire(d, k(d, 'lm358', '1'), k(d, 'lm358', '2'));
        const rf = add(d, 'rf', 'resistor', { ohms: 10000, span: 4 }), rg = add(d, 'rg', 'resistor', { ohms: 10000, span: 4 });
        wire(d, `${rf}:1`, k(d, 'lm358', '1')); wire(d, `${rf}:2`, k(d, 'lm358', '2'));
        wire(d, `${rg}:1`, k(d, 'lm358', '2')); wire(d, `${rg}:2`, k(d, 'psu', '-'));
      },
      d => { d.parts.find(p => p.id === 'rf')!.props.ohms = 100000; P(d, 'pot').props.position = 0.944; },
    ])).toBe(-1);
  });

  // Blocked by an LM7805 model bug in packages/parts/src/parts/ics.tsx (output sags to ~3.5 V or diverges with an LED load).
  it('regulator', () => {
    expect(playLesson(L('regulator'), [
      d => { wire(d, k(d, 'battery', '+'), k(d, 'lm7805', 'IN')); wire(d, k(d, 'battery', '-'), k(d, 'lm7805', 'GND')); },
      undefined,
      d => {
        const gnd = k(d, 'lm7805', 'GND');
        wire(d, k(d, 'cap-electrolytic', '+'), k(d, 'lm7805', 'IN')); wire(d, k(d, 'cap-electrolytic', '-'), gnd);
        wire(d, k(d, 'cap-ceramic', '1'), k(d, 'lm7805', 'OUT')); wire(d, k(d, 'cap-ceramic', '2'), gnd);
      },
      d => { P(d, 'battery').props.volts = '3'; },
    ])).toBe(-1);
  });

  describe('Show me demos', () => {
    for (const [id, seconds] of [['capacitor-rc', 0.012], ['diodes', 0.3], ['bjt-switch', 0.3], ['mosfet', 0.3], ['night-light', 0.3], ['op-amp', 0.3], ['regulator', 0.3]] as const) {
      it(id, () => expect(playDemos(L(id), seconds)).toBe(-1));
    }
  });
});
