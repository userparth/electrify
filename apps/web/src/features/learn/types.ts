import type { Live } from '@eb/parts';
import type { Doc, Inst } from '../workbench/model';

/** What a step's check can look at: the circuit and the live simulation. */
export interface Check {
  doc: Doc;
  live: Record<string, Live>;
  /** All parts of a type, in the order they were added. */
  parts(type: string): Inst[];
  /** Live value `key` of the first part of `type` (or of part `n`). */
  read(type: string, key: string, n?: number): number | string | boolean | undefined;
  /** True when the two pin keys (`partId:pinId`) are on the same net. */
  joined(a: string, b: string): boolean;
  /** Pin key of part `n` of `type`, e.g. pin('led', 'A'). */
  pin(type: string, pin: string, n?: number): string;
  /** Voltage of a pin key relative to ground (undefined if not connected). */
  v(key: string): number | undefined;
  /** Brightest LED glow 0..1. */
  glow(): number;
  /** The first multimeter's reading. */
  dmm(): { mode: string; value: number; display: string } | null;
  serial(type: string): string;
  /** Last value of a numeric prop on part `n` of `type`. */
  prop(type: string, key: string, n?: number): unknown;
}

export interface Step {
  title: string;
  text: string;
  hint?: string;
  check?: (c: Check) => boolean;
}

export interface Quiz { q: string; options: string[]; answer: number; why: string }

export interface Lesson {
  id: string;
  title: string;
  minutes: number;
  summary: string;
  goals: string[];
  dt?: number;
  build: () => Doc;
  steps: Step[];
  /** Mistakes worth trying on purpose, and what they teach. */
  tryIt?: [string, string][];
  quiz: Quiz[];
}

export interface Module {
  id: string;
  title: string;
  blurb: string;
  level: 'School' | 'College' | 'School & college';
  lessons: Lesson[];
}
