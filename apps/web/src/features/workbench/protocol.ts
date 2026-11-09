import type { Live, Props } from '@eb/parts';
import type { SimEvent } from '@eb/engine';
import type { Doc } from './model';

export type ToSim =
  | { type: 'doc'; ver: number; doc: Doc; dt: number }
  | { type: 'props'; ver: number; doc: Doc; id: string; props: Props }
  | { type: 'running'; running: boolean }
  | { type: 'serial'; id: string; text: string }
  | { type: 'stop' };

export type LogEntry = { t: number; e: Omit<SimEvent, 'element'> };

export type FromSim =
  | { type: 'built'; ver: number; net: Map<string, string>; errors: string[] }
  | {
      type: 'frame'; ver: number; live: Record<string, Live>; volts: Record<string, number>; simTime: number;
      serial: Record<string, string>; status: Record<string, { running: boolean; message?: string }>; log: LogEntry[]; speed?: number;
    };
