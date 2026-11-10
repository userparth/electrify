import { describe, expect, it } from 'vitest';
import { playDemos, simulate } from '@/features/learn/headless';
import { applyAct, type Act } from '@/features/workbench/guide';
import { buildCircuit, type Doc } from '@/features/workbench/model';
import { basics } from './basics';
import { MODULES } from '.';

function play(doc: Doc, acts: Act[]) {
  for (const a of acts) { const net = buildCircuit(doc, 1e-4).net; doc = applyAct(doc, a, (x, y) => !!net.get(x) && net.get(x) === net.get(y)); }
  return doc;
}

describe('Show me demos', () => {
  for (const l of basics.lessons) it(`solve every step of basics/${l.id}`, () => expect(playDemos(l)).toBe(-1));

  it('cover every checked step of every lesson', () => {
    const missing = MODULES.flatMap(m => m.lessons.flatMap(l => l.steps.flatMap((s, i) => s.check && !s.demo?.length ? [`${m.id}/${l.id} step ${i + 1}`] : [])));
    expect(missing).toEqual([]);
  });

  it('wire up the LED wherever the student put the parts', () => {
    const lesson = basics.lessons.find(l => l.id === 'first-circuit')!;
    const doc = play(lesson.build(), [{ add: 'resistor', x: 22, y: 3 }, { add: 'led', x: 34, y: 8 }]);
    const wiring = lesson.steps[3]!;
    expect(wiring.check!(simulate(play(doc, wiring.demo!)))).toBe(true);
  });
});
