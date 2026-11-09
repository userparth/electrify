import { LogLevel, ConsoleLogger, Simulator, USBCDC, type RP2040 } from 'rp2040js';

export interface PicoFirmware { bootrom: Uint8Array; uf2: Uint8Array }

/** Browser/Node hook that supplies the bootrom + MicroPython UF2 (they are fetched assets, not bundled). */
export interface FirmwareHost {
  pico(): PicoFirmware | null;
  /** Kicks off loading; resolves when `pico()` can return data (or null on failure). */
  load?(): Promise<PicoFirmware | null>;
}

export const firmwareHost = (): FirmwareHost | undefined => (globalThis as { BenchHost?: { firmware?: FirmwareHost } }).BenchHost?.firmware;

const CYCLE_NS = 1e9 / 125e6;
const quiet = new ConsoleLogger(LogLevel.Error);
quiet.error = () => {};

type Mode = 'boot' | 'repl' | 'raw-wait' | 'raw-out' | 'raw-err' | 'leave-raw';

/** One emulated Pico running MicroPython, stepped in lockstep with the circuit. */
export class PicoMachine {
  readonly sim = new Simulator();
  readonly mcu: RP2040 = this.sim.rp2040;
  private cdc: USBCDC;
  private tx: number[] = [];
  private out = '';
  private mode: Mode = 'boot';
  private pending: { code: string; runId: number } | null = null;
  private banner = '';
  lastRunId = -1;
  running = false;
  error = '';
  /** Emulated-time / circuit-time over the last second. */
  speed = 1;
  private spAcc = [0, 0];
  /** Set when firmware changes a pad's pulls, so the circuit re-solves before the CPU reads that pin. */
  yieldReq = false;

  constructor(fw: PicoFirmware) {
    this.mcu.logger = quiet;
    const b = fw.bootrom;
    this.mcu.loadBootrom(new Uint32Array(b.buffer.slice(b.byteOffset, b.byteOffset + (b.length & ~3))));
    for (let o = 0; o + 512 <= fw.uf2.length; o += 512) {
      const v = new DataView(fw.uf2.buffer, fw.uf2.byteOffset + o, 512);
      if (v.getUint32(0, true) !== 0x0a324655) continue;
      const addr = v.getUint32(12, true), size = v.getUint32(16, true);
      if (addr >= 0x10000000 && addr < 0x10000000 + this.mcu.flash.length) this.mcu.flash.set(fw.uf2.subarray(o + 32, o + 32 + size), addr - 0x10000000);
    }
    this.cdc = new USBCDC(this.mcu.usbCtrl);
    this.cdc.onDeviceConnected = () => this.send('\r');
    this.cdc.onSerialData = d => this.receive(d);
    this.mcu.core.PC = 0x10000000;
    for (const pin of this.mcu.gpio) pin.addListener((st, old) => { if (st >= 2 && old >= 2 && st !== old) this.yieldReq = true; });
  }

  get ready() { return this.mode !== 'boot'; }
  get nanos() { return this.sim.clock.nanos; }

  /** Runs the CPU until its clock reaches `targetNs` or `budgetMs` of wall time is used. */
  runUntil(targetNs: number, budgetMs: number) {
    const { core } = this.mcu, clock = this.sim.clock, t0 = performance.now(), start = clock.nanos;
    let n = 0;
    this.yieldReq = false;
    while (clock.nanos < targetNs && !this.yieldReq) {
      this.pump();
      if (core.waiting) { const step = Math.min(clock.nanosToNextAlarm, targetNs - clock.nanos); clock.tick(step > 0 ? step : CYCLE_NS); }
      else clock.tick(core.executeInstruction() * CYCLE_NS);
      if ((++n & 1023) === 0 && performance.now() - t0 > budgetMs) break;
    }
    return clock.nanos - start;
  }

  /** Accounts how fast the CPU keeps up with the circuit (for the status line). */
  account(cpuNs: number, circuitNs: number) {
    this.spAcc[0]! += cpuNs; this.spAcc[1]! += circuitNs;
    if (this.spAcc[1]! > 1e9) { this.speed = this.spAcc[0]! / this.spAcc[1]!; this.spAcc = [0, 0]; }
  }

  private pump() {
    const f = this.cdc.txFIFO;
    while (this.tx.length && !f.full) f.push(this.tx.shift()!);
  }

  send(text: string) { for (let i = 0; i < text.length; i++) this.tx.push(text.charCodeAt(i) & 0xff); }

  read(): string { const s = this.out.replace(/\r\n/g, '\n'); this.out = ''; return s; }

  write(text: string) { this.send(text.replace(/\n/g, '\r')); }

  /** Runs a program through the raw REPL; output (and any traceback) streams to `read()`. */
  run(code: string, runId: number) {
    this.lastRunId = runId;
    this.pending = { code, runId };
    if (this.mode !== 'boot') this.startPending();
  }

  stop() {
    this.pending = null;
    if (this.running || this.mode.startsWith('raw')) this.send('\x03\x03');
    this.running = false;
  }

  private startPending() {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    this.running = true; this.error = '';
    this.mode = 'raw-wait';
    this.send('\x03\x03\x01');
    this.send(p.code.replace(/\r\n?/g, '\n'));
    this.send('\x04');
  }

  private receive(d: Uint8Array) {
    let s = '';
    for (const c of d) s += String.fromCharCode(c);
    if (this.mode === 'boot') {
      this.banner += s;
      if (this.banner.includes('>>> ')) {
        this.mode = 'repl';
        this.out += this.banner.slice(this.banner.indexOf('MicroPython'));
        this.banner = '';
        this.startPending();
      }
      return;
    }
    if (this.mode === 'repl') { this.out += s; return; }
    if (this.mode === 'leave-raw') {
      this.banner += s;
      if (this.banner.includes('>>> ')) { this.mode = 'repl'; this.banner = ''; this.out += '>>> '; }
      return;
    }
    for (const ch of s) {
      if (this.mode === 'raw-wait') {
        this.banner += ch;
        if (this.banner.endsWith('OK')) { this.mode = 'raw-out'; this.banner = ''; }
        continue;
      }
      if (this.mode === 'raw-out') {
        if (ch === '\x04') { this.mode = 'raw-err'; continue; }
        this.out += ch;
        continue;
      }
      if (this.mode === 'raw-err') {
        if (ch === '\x04') {
          this.running = false;
          this.mode = 'leave-raw'; this.banner = '';
          this.send('\x02');
          continue;
        }
        this.out += ch;
        this.error += ch;
      }
    }
  }
}

const machines = new Map<string, PicoMachine>();

export function picoMachine(sid: string, fw: PicoFirmware): PicoMachine {
  let m = machines.get(sid);
  if (!m) { m = new PicoMachine(fw); machines.set(sid, m); }
  return m;
}

/** Drops emulated Picos whose parts were removed from the bench. */
export function prunePicos(keep: string[]) {
  const k = new Set(keep);
  for (const id of machines.keys()) if (!k.has(id)) machines.delete(id);
}
