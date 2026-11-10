import { describe, expect, it } from 'vitest';
import { simulate } from '@/features/learn/headless';
import type { Lesson } from '@/features/learn/types';
import { applyAct, type Act } from '@/features/workbench/guide';
import { buildCircuit, type Doc } from '@/features/workbench/model';
import { MODULES } from '.';

function play(doc: Doc, acts: Act[]) {
  for (const a of acts) {
    const net = buildCircuit(doc, 1e-4).net;
    doc = applyAct(doc, a, (x, y) => !!net.get(x) && net.get(x) === net.get(y));
  }
  return doc;
}

/** Runs every step's "Show me" demo in order; returns the first step whose check then fails, or -1. */
function playDemos(lesson: Lesson, start = lesson.build()) {
  let doc = start;
  for (let i = 0; i < lesson.steps.length; i++) {
    const s = lesson.steps[i]!;
    doc = play(doc, s.demo ?? []);
    if (s.check && !s.check(simulate(doc, 0.3, lesson.dt ?? 1e-4))) return i;
  }
  return -1;
}

const withDemos = MODULES.flatMap(m => m.lessons.filter(l => l.steps.some(s => s.demo)).map(l => [`${m.id}/${l.id}`, l] as const));

describe('Show me demos', () => {
  it('exist for the first lessons', () => expect(withDemos.length).toBeGreaterThanOrEqual(3));

  for (const [name, lesson] of withDemos) it(`solve every step of ${name}`, () => expect(playDemos(lesson)).toBe(-1));

  it('wire up the LED wherever the student put the parts', () => {
    const lesson = MODULES.find(m => m.id === 'basics')!.lessons.find(l => l.id === 'first-circuit')!;
    const doc = play(lesson.build(), [{ add: 'resistor', x: 22, y: 3 }, { add: 'led', x: 34, y: 8 }]);
    const wiring = lesson.steps[3]!;
    expect(wiring.check!(simulate(play(doc, wiring.demo!)))).toBe(true);
  });
});
