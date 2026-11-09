import { VoltageSource, type Ctx, type Element } from '@eb/engine';
import { INK, Label, u } from '../draw';
import type { PartDef, PinDef } from '../types';

/** Shared GPIO block layout (Int32Array over a SharedArrayBuffer), indexed by BCM number 0..27. */
export const GPIO = {
  COUNT: 28,
  IN: 0,      // level the circuit sees: 0/1
  MODE: 28,   // 0 = input / unused, 1 = output
  OUT: 56,    // output level 0/1
  PULL: 84,   // 0 none, 1 up, 2 down
  DUTY: 112,  // PWM duty × 10000, or -1 when not PWM
  FREQ: 140,  // PWM frequency in Hz
  WAKE: 168,  // Atomics.notify target for sleep/stop
  SIZE: 176,
} as const;

export interface PythonSession {
  gpio: Int32Array;
  read(): string;
  write(text: string): void;
  status(): { running: boolean; message?: string };
}

export interface PythonHost {
  /** Start or re-attach: the same `sid` + `runId` re-attaches; a new runId restarts with `code`. */
  ensure(sid: string, code: string, runId: number): PythonSession;
  /** Interrupt the program but keep the Python runtime warm. */
  stop(sid: string): void;
  /** Shut down sessions whose ids are not in `keep` (removed parts). */
  prune(keep: string[]): void;
}

const host = (): PythonHost | undefined => (globalThis as { BenchHost?: { python?: PythonHost } }).BenchHost?.python;

const HEADER: [number, string][] = [
  [1, '3V3'], [2, '5V'], [3, 'GPIO2 · SDA'], [4, '5V'], [5, 'GPIO3 · SCL'], [6, 'GND'], [7, 'GPIO4'], [8, 'GPIO14 · TXD'],
  [9, 'GND'], [10, 'GPIO15 · RXD'], [11, 'GPIO17'], [12, 'GPIO18 · PWM0'], [13, 'GPIO27'], [14, 'GND'], [15, 'GPIO22'], [16, 'GPIO23'],
  [17, '3V3'], [18, 'GPIO24'], [19, 'GPIO10 · MOSI'], [20, 'GND'], [21, 'GPIO9 · MISO'], [22, 'GPIO25'], [23, 'GPIO11 · SCLK'], [24, 'GPIO8 · CE0'],
  [25, 'GND'], [26, 'GPIO7 · CE1'], [27, 'GPIO0 · ID_SD'], [28, 'GPIO1 · ID_SC'], [29, 'GPIO5'], [30, 'GND'], [31, 'GPIO6'], [32, 'GPIO12 · PWM0'],
  [33, 'GPIO13 · PWM1'], [34, 'GND'], [35, 'GPIO19'], [36, 'GPIO16'], [37, 'GPIO26'], [38, 'GPIO20'], [39, 'GND'], [40, 'GPIO21'],
];
const bcmOf = (name: string) => { const m = name.match(/^GPIO(\d+)/); return m ? +m[1]! : -1; };
/** Physical pin → BCM number, for every GPIO pin on the header. */
export const RPI_BCM: Record<number, number> = Object.fromEntries(HEADER.filter(([, n]) => bcmOf(n) >= 0).map(([p, n]) => [p, bcmOf(n)]));

const PINS: PinDef[] = HEADER.map(([p, name]) => ({ id: String(p), label: `${p} · ${name}`, x: (p - 1) >> 1, y: p % 2 === 1 ? 1 : 0, ground: name === 'GND' }));
const GND_PINS = HEADER.filter(([, n]) => n === 'GND').map(([p]) => String(p));

class RpiGpio implements Element {
  levels = new Array<number>(GPIO.COUNT).fill(0);
  overVolt = new Set<number>();
  private hi = new Array<boolean>(GPIO.COUNT).fill(false);
  constructor(private nodes: Map<number, number>, private rail: number, private gnd: number, public gpio: () => Int32Array | null) {}
  beginStep(ctx: Ctx) {
    const g = this.gpio(), gnd = ctx.prev(this.gnd);
    for (const [bcm, n] of this.nodes) {
      const v = ctx.prev(n) - gnd;
      if (v > 1.7) this.hi[bcm] = true; else if (v < 1.5) this.hi[bcm] = false;
      if (v > 3.6) this.overVolt.add(bcm); else this.overVolt.delete(bcm);
      this.levels[bcm] = this.hi[bcm] ? 1 : 0;
      if (g) Atomics.store(g, GPIO.IN + bcm, this.levels[bcm]!);
    }
  }
  level(bcm: number, t: number): number | null {
    const g = this.gpio();
    if (!g || Atomics.load(g, GPIO.MODE + bcm) !== 1) return null;
    const duty = Atomics.load(g, GPIO.DUTY + bcm);
    if (duty >= 0) { const f = Math.max(1, Atomics.load(g, GPIO.FREQ + bcm)); return (t * f) % 1 < duty / 10000 ? 1 : 0; }
    return Atomics.load(g, GPIO.OUT + bcm);
  }
  stamp(ctx: Ctx) {
    const g = this.gpio();
    for (const [bcm, n] of this.nodes) {
      const lv = this.level(bcm, ctx.t);
      if (lv != null) {
        ctx.conductance(this.rail, n, lv ? 1 / 40 : 1e-12);
        ctx.conductance(n, this.gnd, lv ? 1e-12 : 1 / 40);
        continue;
      }
      const pull = g ? Atomics.load(g, GPIO.PULL + bcm) : 0;
      if (pull === 1) ctx.conductance(this.rail, n, 1 / 50000);
      if (pull === 2) ctx.conductance(n, this.gnd, 1 / 50000);
    }
  }
}

type RpiProps = { code: string; run: boolean; runId: number; sid: string };

const TEMPLATE = `# Blink an LED on GPIO17 (physical pin 11).
# Wire: pin 11 -> 330 ohm resistor -> LED (+, long leg) -> LED (-) -> GND (pin 9).
from gpiozero import LED, Button
from time import sleep

led = LED(17)
button = Button(2)          # GPIO2 (pin 3) to GND through a push button

while True:
    if button.is_pressed:
        led.on()
    else:
        led.toggle()
        sleep(0.5)
`;

export const rpi4: PartDef<RpiProps> = {
  type: 'rpi4', name: 'Raspberry Pi 4 (GPIO)', category: 'Microcontrollers', blurb: '40-pin header, Python 3',
  mount: 'free',
  box: () => ({ x: -4.5, y: -2.5, w: 34, h: 23 }),
  pins: () => PINS,
  nets: () => [GND_PINS, ['1', '17'], ['2', '4']],
  props: [],
  defaults: { code: TEMPLATE, run: false, runId: 0, sid: '' },
  program: { language: 'python', template: TEMPLATE },
  info: [
    ['3.3 V logic', 'GPIO pins give and accept 3.3 V. Never connect 5 V to a GPIO: it can kill a real Pi'],
    ['Numbering', 'gpiozero and GPIO.BCM use GPIO numbers (GPIO17); GPIO.BOARD uses physical pins (11)'],
    ['LEDs', 'Always add a resistor (330 Ω) between the pin and the LED'],
    ['Buttons', 'Button(n) turns on the internal pull-up: wire the button from the pin to GND'],
    ['Current', 'A GPIO can safely give about 16 mA — drive motors through a transistor'],
  ],
  build(ctx, p) {
    const gnd = ctx.pin('6'), v3 = ctx.pin('1'), v5 = ctx.pin('2');
    ctx.add(new VoltageSource(v3, gnd, 3.3, 0.05));
    ctx.add(new VoltageSource(v5, gnd, 5.0, 0.05));
    const nodes = new Map<number, number>(Object.entries(RPI_BCM).map(([phys, bcm]) => [bcm, ctx.pin(phys)]));
    const h = host();
    let session: PythonSession | null = null;
    if (h && p.sid) {
      if (p.run) session = h.ensure(p.sid, p.code, p.runId);
      else h.stop(p.sid);
    }
    const el = ctx.add(new RpiGpio(nodes, v3, gnd, () => session?.gpio ?? null));
    return {
      read: (sim) => {
        const outs = new Array<number>(GPIO.COUNT).fill(-1);
        for (const [bcm] of nodes) { const lv = el.level(bcm, sim.t); if (lv != null) outs[bcm] = lv; }
        const st = session?.status();
        return {
          running: !!st?.running,
          message: !h ? 'Python runtime not available' : !p.sid ? 'starting…' : st?.message ?? (p.run ? '' : 'stopped'),
          outs,
          levels: el.levels.slice(),
          overVolt: el.overVolt.size ? [...el.overVolt].map(b => `GPIO${b}`).join(', ') : '',
        };
      },
      serial: { read: () => session?.read() ?? '', write: (t: string) => session?.write(t) },
      status: () => session?.status() ?? { running: false, message: h ? (p.run ? 'starting…' : 'stopped') : 'Python runtime not available' },
      update: q => q.code === p.code && q.run === p.run && q.runId === p.runId && q.sid === p.sid,
    };
  },
  render: ({ props, live, selected, act }) => {
    if (!props.sid) queueMicrotask(() => act({ sid: `rpi-${Math.random().toString(36).slice(2, 10)}` }));
    const outs = (live.outs as number[] | undefined) ?? [], lv = (live.levels as number[] | undefined) ?? [], warn = live.overVolt as string | undefined;
    return (
      <g>
        <rect x={u(-4.5)} y={u(-2.5)} width={u(34)} height={u(23)} rx={10} fill="#2f7d4a" stroke={INK} strokeWidth={1.6} />
        {[[-3.5, -1.5], [25.5, -1.5], [-3.5, 18.5], [25.5, 18.5]].map(([x, y], i) => <circle key={i} cx={u(x! + 0.5)} cy={u(y! + 0.5)} r={7} fill="#f2efe7" stroke="#c9a23a" strokeWidth={2} />)}
        <rect x={u(-0.7)} y={u(-0.7)} width={u(20.4)} height={u(2.4)} rx={3} fill="#1d1d1b" />
        <rect x={u(4)} y={u(6)} width={u(6)} height={u(6)} rx={3} fill="#b8bec4" stroke={INK} strokeWidth={1.2} />
        <Label x={7} y={9.3} size={9}>BCM2711</Label>
        <rect x={u(11.5)} y={u(6.5)} width={u(5)} height={u(5)} rx={2} fill="#262624" stroke={INK} />
        <Label x={14} y={9.4} size={7} color="#cfcab8">4GB RAM</Label>
        <rect x={u(22)} y={u(2)} width={u(8.5)} height={u(4.5)} rx={2} fill="#c9ced2" stroke={INK} />
        <rect x={u(22)} y={u(7.5)} width={u(8.5)} height={u(4.5)} rx={2} fill="#c9ced2" stroke={INK} />
        <rect x={u(22)} y={u(13)} width={u(8.5)} height={u(5.5)} rx={2} fill="#c9ced2" stroke={INK} />
        <Label x={26.2} y={4.6} size={7}>USB 2</Label><Label x={26.2} y={10.1} size={7}>USB 3</Label><Label x={26.2} y={16.1} size={7}>ETHERNET</Label>
        {[[-1, 19.4, 'USB-C'], [4, 19.4, 'µHDMI'], [8.5, 19.4, 'µHDMI']].map(([x, y, t], i) => <g key={i}><rect x={u(+x!)} y={u(+y! - 0.8)} width={u(3.4)} height={u(1.6)} rx={2} fill="#c9ced2" stroke={INK} /><Label x={+x! + 1.7} y={+y! - 1.2} size={6} color="#e6f2e8">{t as string}</Label></g>)}
        <Label x={8} y={15.5} size={12} color="#e6f2e8">Raspberry Pi 4</Label>
        <circle cx={u(-2.5)} cy={u(14)} r={4} fill="#e0453a" stroke={INK} />
        <circle cx={u(-2.5)} cy={u(15.6)} r={4} fill={live.running ? '#7cf29a' : '#2e5a3c'} stroke={INK} />
        <Label x={-1.4} y={14.3} size={6} color="#e6f2e8" anchor="start">PWR</Label><Label x={-1.4} y={15.9} size={6} color="#e6f2e8" anchor="start">ACT</Label>
        {PINS.map(p => {
          const bcm = RPI_BCM[+p.id], name = HEADER[+p.id - 1]![1];
          const fill = name === 'GND' ? '#4a4741' : name === '3V3' ? '#ef8a2b' : name === '5V' ? '#d6452f' : bcm != null && outs[bcm] === 1 ? '#7cf29a' : bcm != null && outs[bcm] === 0 ? '#3a6ed6' : bcm != null && lv[bcm] ? '#f3c33b' : '#c9a23a';
          return <rect key={p.id} x={u(p.x) - 4} y={u(p.y) - 4} width={8} height={8} rx={1} fill={fill} stroke={INK} strokeWidth={0.6} />;
        })}
        {selected && PINS.map(p => <text key={'t' + p.id} x={u(p.x)} y={p.y ? u(p.y) + 14 : u(p.y) - 9} fontSize={6} textAnchor="middle" fill="#fbf8f1" fontFamily="ui-monospace,Menlo,monospace" style={{ pointerEvents: 'none' }}>{HEADER[+p.id - 1]![1].split(' ')[0]!.replace('GPIO', '')}</text>)}
        <Label x={-0.4} y={3.2} size={7} color="#e6f2e8" anchor="start">pin 1</Label>
        {warn && <g><rect x={u(-4)} y={u(-6)} width={u(33)} height={u(2.6)} rx={6} fill="#d6452f" /><Label x={12.5} y={-4.2} size={8} color="#fff">⚠ {warn} above 3.6 V — this would damage a real Pi</Label></g>}
        {live.message ? <Label x={12.5} y={17.6} size={7} color="#ffe9a8">{String(live.message).slice(0, 60)}</Label> : null}
      </g>
    );
  },
};

export const rpiParts: PartDef<any>[] = [rpi4];
