'use client';
import { runner, useBench } from '../workbench/store';
import type { Check } from './types';

export function makeCheck(): Check {
  const st = useBench.getState(), b = runner.built, doc = st.doc, live = st.live;
  const parts = (type: string) => doc.parts.filter(p => p.type === type);
  const nth = (type: string, n = 0) => parts(type)[n];
  return {
    doc, live, parts,
    read: (type, key, n = 0) => { const p = nth(type, n); const v = p ? live[p.id]?.[key] : undefined; return Array.isArray(v) ? undefined : v; },
    joined: (a, c) => !!b && !!b.net.get(a) && b.net.get(a) === b.net.get(c),
    pin: (type, pin, n = 0) => `${nth(type, n)?.id ?? '?'}:${pin}`,
    v: key => { const k = b?.node.get(key); return k == null ? undefined : b!.sim.v(k); },
    glow: () => Math.max(0, ...parts('led').map(p => Number(live[p.id]?.glow ?? 0))),
    dmm: () => {
      const p = nth('dmm'), l = p && live[p.id];
      return l ? { mode: String(l.mode ?? ''), value: Number(l.value ?? 0), display: String(l.display ?? '') } : null;
    },
    serial: type => { const p = nth(type); return p ? st.serial[p.id] ?? '' : ''; },
    prop: (type, key, n = 0) => nth(type, n)?.props[key],
  };
}

const KEY = 'eb.progress.v1';
export interface LessonProgress { steps: number; quiz: Record<number, boolean>; done: boolean }

export function loadProgress(): Record<string, LessonProgress> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; }
}
export function saveProgress(id: string, p: LessonProgress) {
  const all = loadProgress();
  all[id] = p;
  localStorage.setItem(KEY, JSON.stringify(all));
}
