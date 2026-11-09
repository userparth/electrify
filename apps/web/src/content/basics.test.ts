import { describe, expect, it } from 'vitest';
import { playLesson } from '@/features/learn/headless';
import type { Doc } from '@/features/workbench/model';
import { basics } from './basics';

const L = (id: string) => basics.lessons.find(l => l.id === id)!;
const byType = (doc: Doc, type: string, n = 0) => doc.parts.filter(p => p.type === type)[n]!;
const wire = (doc: Doc, a: string, b: string) => doc.wires.push({ id: `t${doc.wires.length}`, a, b, color: '#d6452f' });

describe('basics', () => {
  it('first circuit can be completed', () => {
    const fail = playLesson(L('first-circuit'), [
      undefined,
      d => d.parts.push({ id: 'r1', type: 'resistor', x: 11, y: 7, rot: 0, props: { ohms: 470, span: 4 } }),
      d => d.parts.push({ id: 'l1', type: 'led', x: 15, y: 8, rot: 0, props: { color: 'red' } }),
      d => { const bb = byType(d, 'breadboard').id; wire(d, `${bb}:tp10`, `${bb}:a10`); wire(d, `${bb}:a15`, `${bb}:tn15`); },
      d => { byType(d, 'resistor').props.ohms = 1000; },
    ]);
    expect(fail).toBe(-1);
  });

  it("ohm's law can be completed", () => {
    const fail = playLesson(L('ohms-law'), [
      d => { byType(d, 'dmm').props.ac = false; },
      d => { const m = byType(d, 'dmm').id, r = byType(d, 'resistor').id; wire(d, `${m}:COM`, `${r}:2`); wire(d, `${m}:VmA`, `${r}:1`); },
      d => {
        const m = byType(d, 'dmm'), r = byType(d, 'resistor').id, p = byType(d, 'psu').id;
        m.props.knob = 'A'; m.props.ac = false;
        d.wires = d.wires.filter(w => !(w.a === `${p}:+` && w.b === `${r}:1`) && !w.a.startsWith(`${m.id}:`));
        wire(d, `${p}:+`, `${m.id}:10A`); wire(d, `${m.id}:COM`, `${r}:1`);
      },
      d => { byType(d, 'psu').props.volts = 10; },
    ]);
    expect(fail).toBe(-1);
  });

  it('divider can be completed', () => {
    const fail = playLesson(L('divider'), [
      undefined,
      d => { const m = byType(d, 'dmm').id, r2 = byType(d, 'resistor', 1).id; wire(d, `${m}:COM`, `${r2}:2`); wire(d, `${m}:VmA`, `${r2}:1`); },
      d => { const m = byType(d, 'dmm').id, r1 = byType(d, 'resistor', 0).id; d.wires = d.wires.filter(w => !w.a.startsWith(`${m}:`)); wire(d, `${m}:COM`, `${r1}:2`); wire(d, `${m}:VmA`, `${r1}:1`); },
      d => { byType(d, 'resistor', 1).props.ohms = 1000; },
    ]);
    expect(fail).toBe(-1);
  });
});
