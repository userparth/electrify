import type { Live } from '@eb/parts';
import { buildCircuit, type Doc } from '../workbench/model';
import { applyAct } from '../workbench/guide';
import type { Check, Lesson } from './types';

/** Runs a circuit without the browser and exposes the same Check API the lesson player uses. */
export function simulate(doc: Doc, seconds = 0.3, dt = 1e-4) {
  const b = buildCircuit(doc, dt);
  b.sim.op();
  const samplers = [...b.runtimes.entries()].filter(([, rt]) => rt.sample);
  const vOf = (id: string) => (pin: string) => b.sim.v(b.node.get(`${id}:${pin}`) ?? 0);
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) { b.sim.step(); for (const [id, rt] of samplers) rt.sample!(b.sim, vOf(id)); }
  const live: Record<string, Live> = {}, serial: Record<string, string> = {};
  for (const [id, rt] of b.runtimes) { if (rt.read) live[id] = rt.read(b.sim, vOf(id)); const s = rt.serial?.read(); if (s) serial[id] = s; }
  const parts = (type: string) => doc.parts.filter(p => p.type === type);
  const nth = (type: string, n = 0) => parts(type)[n];
  const check: Check = {
    doc, live, parts,
    read: (type, key, n = 0) => { const p = nth(type, n); const v = p ? live[p.id]?.[key] : undefined; return Array.isArray(v) ? undefined : v; },
    joined: (a, c) => !!b.net.get(a) && b.net.get(a) === b.net.get(c),
    pin: (type, pin, n = 0) => `${nth(type, n)?.id ?? '?'}:${pin}`,
    v: key => { const k = b.node.get(key); return k == null ? undefined : b.sim.v(k); },
    glow: () => Math.max(0, ...parts('led').map(p => Number(live[p.id]?.glow ?? 0))),
    dmm: () => { const p = nth('dmm'), l = p && live[p.id]; return l ? { mode: String(l.mode ?? ''), value: Number(l.value ?? 0), display: String(l.display ?? '') } : null; },
    serial: type => { const p = nth(type); return p ? serial[p.id] ?? '' : ''; },
    prop: (type, key, n = 0) => nth(type, n)?.props[key],
  };
  for (const rt of b.runtimes.values()) rt.dispose?.();
  return check;
}

/**
 * Plays a lesson: for each step, `solve[i]` edits the doc the way a student would, then the step's
 * check must pass. Returns the index of the first failing step, or -1.
 */
export function playLesson(lesson: Lesson, solve: (((doc: Doc) => void) | undefined)[], seconds = 0.3): number {
  const doc = lesson.build();
  for (let i = 0; i < lesson.steps.length; i++) {
    solve[i]?.(doc);
    const s = lesson.steps[i]!;
    if (s.check && !s.check(simulate(doc, seconds, lesson.dt ?? 1e-4))) return i;
  }
  return -1;
}

/**
 * Plays every step's "Show me" demo in order and checks the step after it. `extra[i]` finishes a step the demo
 * only points at (code edits). Returns the index of the first failing step, or -1.
 */
export function playDemos(lesson: Lesson, seconds = 0.3, extra: Record<number, (doc: Doc) => void> = {}): number {
  let doc = lesson.build();
  for (let i = 0; i < lesson.steps.length; i++) {
    const s = lesson.steps[i]!;
    for (const a of s.demo ?? []) { const net = buildCircuit(doc, lesson.dt ?? 1e-4).net; doc = applyAct(doc, a, (x, y) => !!net.get(x) && net.get(x) === net.get(y)); }
    if (extra[i]) { doc = structuredClone(doc); extra[i]!(doc); }
    if (s.check && !s.check(simulate(doc, seconds, lesson.dt ?? 1e-4))) return i;
  }
  return -1;
}
