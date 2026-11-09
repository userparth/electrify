import { MODULES } from '@/content';
import type { Lesson, Module } from '@/features/learn/types';
import type { Goal, Level } from '@/lib/profile';

export interface PathItem { module: Module; lesson: Lesson }

const GOAL_MODULE: Record<Exclude<Goal, 'explore'>, string> = { basics: 'basics', analog: 'analog', digital: 'digital', micro: 'micro', solar: 'solar' };

/** Lessons in the order this student should take them, skipping finished ones. */
export function recommend(goals: Goal[], level: Level | undefined, done: (id: string) => boolean): PathItem[] {
  const want = goals.filter((g): g is Exclude<Goal, 'explore'> => g !== 'explore').map(g => GOAL_MODULE[g]);
  // Newcomers always get the basics first; people who have built circuits skip them unless they asked.
  if (level === 'new' && !want.includes('basics')) want.unshift('basics');
  if (level === 'built' && !goals.includes('basics')) { const i = want.indexOf('basics'); if (i >= 0) want.splice(i, 1); }
  const order = want.length ? want : goals.includes('explore') ? [] : ['basics'];
  const out: PathItem[] = [];
  for (const id of order) {
    const module = MODULES.find(m => m.id === id);
    for (const lesson of module?.lessons ?? []) if (!done(lesson.id)) out.push({ module: module!, lesson });
  }
  return out;
}
