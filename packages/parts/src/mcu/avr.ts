import type { Ctx, Element } from '@eb/engine';
import {
  AVRADC, AVRIOPort, AVRTimer, AVRUSART, CPU, PinState, adcConfig, avrInstruction,
  portBConfig, portCConfig, portDConfig, timer0Config, timer1Config, timer2Config, usart0Config,
} from 'avr8js';

export const AVR_HZ = 16e6;

/** Parses Intel HEX into flash bytes (Uno sketches never need extended addressing). */
export function loadHex(hex: string, flash: Uint8Array): number {
  let top = 0;
  for (const raw of hex.split('\n')) {
    const line = raw.trim();
    if (line[0] !== ':') continue;
    const len = parseInt(line.slice(1, 3), 16), addr = parseInt(line.slice(3, 7), 16), type = parseInt(line.slice(7, 9), 16);
    if (type !== 0) continue;
    for (let i = 0; i < len; i++) flash[addr + i] = parseInt(line.slice(9 + 2 * i, 11 + 2 * i), 16);
    top = Math.max(top, addr + len);
  }
  return top;
}

/** The 20 Uno I/O pins in Arduino order D0–D13, A0–A5, as [port, bit]. */
const PIN_MAP: [0 | 1 | 2, number][] = [
  ...Array.from({ length: 8 }, (_, i) => [2, i] as [2, number]),
  ...Array.from({ length: 6 }, (_, i) => [0, i] as [0, number]),
  ...Array.from({ length: 6 }, (_, i) => [1, i] as [1, number]),
];

export interface UnoNodes { io: number[]; v5: number; v3: number; gnd: number; reset: number }

/** Runs an ATmega328P and ties its pins, rails and ADC into the circuit. */
export class UnoBridge implements Element {
  readonly branches = 2;
  branch0 = 0;
  readonly cpu: CPU | null;
  private ports: AVRIOPort[] = [];
  private usart: AVRUSART | null = null;
  private adc: AVRADC | null = null;
  private state = new Uint8Array(20).fill(PinState.Input);
  private level = new Uint8Array(20);
  private cycleDebt = 0;
  private rxQueue: number[] = [];
  private out = '';
  lastTx = -1;
  lastRx = -1;
  private t = 0;
  inReset = false;

  constructor(public nodes: UnoNodes, hex: string) {
    if (!hex.trim()) { this.cpu = null; return; }
    const flash = new Uint8Array(0x8000);
    loadHex(hex, flash);
    const cpu = (this.cpu = new CPU(new Uint16Array(flash.buffer)));
    new AVRTimer(cpu, timer0Config); new AVRTimer(cpu, timer1Config); new AVRTimer(cpu, timer2Config);
    this.ports = [new AVRIOPort(cpu, portBConfig), new AVRIOPort(cpu, portCConfig), new AVRIOPort(cpu, portDConfig)];
    this.usart = new AVRUSART(cpu, usart0Config, AVR_HZ);
    this.usart.onByteTransmit = b => { this.out += String.fromCharCode(b); this.lastTx = this.t; };
    this.adc = new AVRADC(cpu, adcConfig);
  }

  pinState(i: number): PinState { return this.state[i] as PinState; }
  get running() { return !!this.cpu && !this.inReset; }

  beginStep(ctx: Ctx) {
    this.t = ctx.t;
    if (!this.cpu) return;
    const n = this.nodes, gnd = ctx.prev(n.gnd), v5 = Math.max(0.1, ctx.prev(n.v5) - gnd);
    const held = ctx.prev(n.reset) - gnd < 1;
    if (held && !this.inReset) this.cpu.reset();
    this.inReset = held;
    for (let i = 0; i < 20; i++) {
      const [p, bit] = PIN_MAP[i]!, port = this.ports[p]!, v = ctx.prev(n.io[i]!) - gnd;
      const st = port.pinState(bit);
      if (st === PinState.Input || st === PinState.InputPullUp) {
        const lv = this.level[i]!, next = v > 0.6 * v5 ? 1 : v < 0.3 * v5 ? 0 : lv;
        if (next !== lv) { this.level[i] = next; port.setPin(bit, !!next); }
      }
      if (i >= 14) this.adc!.channelValues[i - 14] = Math.max(0, v);
    }
    this.adc!.avcc = v5;
    if (ctx.mode !== 'tran' || this.inReset) { this.capture(); return; }
    const u = this.usart!;
    if (this.rxQueue.length && u.rxEnable && !u.rxBusy) { u.writeByte(this.rxQueue.shift()!); this.lastRx = ctx.t; }
    this.cycleDebt += ctx.dt * AVR_HZ;
    const cpu = this.cpu, end = cpu.cycles + Math.floor(this.cycleDebt);
    this.cycleDebt -= Math.floor(this.cycleDebt);
    while (cpu.cycles < end) { avrInstruction(cpu); cpu.tick(); }
    this.capture();
  }

  private capture() {
    for (let i = 0; i < 20; i++) { const [p, bit] = PIN_MAP[i]!; this.state[i] = this.ports[p]!.pinState(bit); }
  }

  stamp(ctx: Ctx) {
    const n = this.nodes;
    ctx.voltageSource(this.branch0, n.v5, n.gnd, 5, 0.05);
    ctx.voltageSource(this.branch0 + 1, n.v3, n.gnd, 3.3, 0.5);
    ctx.conductance(n.reset, n.v5, 1 / 10000);
    if (!this.cpu) return;
    for (let i = 0; i < 20; i++) {
      const s = this.state[i], node = n.io[i]!;
      if (s === PinState.High) ctx.conductance(n.v5, node, 1 / 25);
      else if (s === PinState.Low) ctx.conductance(node, n.gnd, 1 / 25);
      else if (s === PinState.InputPullUp) ctx.conductance(n.v5, node, 1 / 35000);
    }
  }

  readSerial() { const s = this.out; this.out = ''; return s; }
  writeSerial(text: string) { for (const ch of text) this.rxQueue.push(ch.charCodeAt(0) & 0xff); }
}
