import type { Circuit, Element, Simulator } from '@eb/engine';
import type { ReactNode } from 'react';

/** One grid unit = 0.1 inch, the breadboard pitch. Pins sit on whole units. */
export const GRID = 12;

export type Category = 'Boards' | 'Power' | 'Passive' | 'Semiconductors' | 'Switches' | 'Digital ICs' | 'Output' | 'Instruments' | 'Microcontrollers';

export interface PinDef {
  id: string;
  label: string;
  x: number;
  y: number;
  ground?: boolean;
}

export type PropDef =
  | { key: string; label: string; type: 'number'; unit?: string; min?: number; max?: number; step?: number; si?: boolean }
  | { key: string; label: string; type: 'select'; options: [string, string][] }
  | { key: string; label: string; type: 'bool' }
  | { key: string; label: string; type: 'range'; min: number; max: number; step: number; unit?: string };

export type Props = Record<string, number | string | boolean>;

export interface BuildCtx {
  circuit: Circuit;
  /** Engine node for a pin of this part. */
  pin(id: string): number;
  /** Fresh internal node, private to the part. */
  internal(): number;
  add<T extends Element>(e: T): T;
}

/** Live values a part shows while the simulation runs (LED glow, display digits, …). */
export type Live = Record<string, number | string | boolean | number[]>;

export interface Runtime {
  /** Read live state for drawing. */
  read?(sim: Simulator, v: (pin: string) => number): Live;
  /** Apply a prop change without rebuilding the circuit; return false to force a rebuild. */
  update?(props: Props): boolean;
  /** Called after every simulation step (instruments record waveforms here). Keep it cheap. */
  sample?(sim: Simulator, v: (pin: string) => number): void;
  /** Programmable boards: serial port as seen from the bench. */
  serial?: { read(): string; write(text: string): void };
  /** Programmable boards: the editor reports status changes (running, errors) through this. */
  status?(): { running: boolean; message?: string };
  /** Release workers, timers, audio … when the part is rebuilt or removed. */
  dispose?(): void;
}

export interface RenderArgs<P extends Props = Props> {
  props: P;
  live: Live;
  selected: boolean;
  /** Fires a user interaction on the part (button press, switch flip, knob turn). */
  act(patch: Partial<P>): void;
}

export interface PartDef<P extends Props = Props> {
  type: string;
  name: string;
  category: Category;
  /** Short line for the palette. */
  blurb: string;
  /** Hit box in grid units relative to the part origin (usually pin 1). */
  box: (props: P) => { x: number; y: number; w: number; h: number };
  /** 'board' parts connect when their pins sit in breadboard holes; 'free' parts connect only through wires. */
  mount?: 'board' | 'free';
  pins: (props: P) => PinDef[];
  /** Groups of pins that are wired together inside the part (breadboard strips, IC ground pins …). */
  nets?: (props: P) => string[][];
  props: PropDef[];
  defaults: P;
  build(ctx: BuildCtx, props: P): Runtime;
  /** SVG in local pixel coordinates; the origin is the part origin, 1 unit = GRID px. */
  render(args: RenderArgs<P>): ReactNode;
  /** What a student should know about this part. */
  info?: [string, string][];
  /** Default colour for a lead drawn from each pin (instrument jacks). */
  leadColor?: Record<string, string>;
  /**
   * Programmable boards. The student's source lives in props.code; for compiled languages the
   * editor compiles it and stores the result in props.binary (Intel HEX for Arduino), then rebuilds.
   */
  program?: { language: 'arduino' | 'micropython' | 'python'; template: string };
}

export const defineParts = <T extends PartDef<any>[]>(...defs: T) => defs;
