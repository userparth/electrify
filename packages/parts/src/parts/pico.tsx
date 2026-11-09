import { VoltageSource, type Ctx, type Element } from '@eb/engine';
import { INK, Label, u } from '../draw';
import { firmwareHost, picoMachine, prunePicos, type PicoMachine } from '../mcu/rp2040';
import type { PartDef, PinDef } from '../types';

export { prunePicos };

const PINOUT: [number, string][] = [
  [1, 'GP0'], [2, 'GP1'], [3, 'GND'], [4, 'GP2'], [5, 'GP3'], [6, 'GP4'], [7, 'GP5'], [8, 'GND'], [9, 'GP6'], [10, 'GP7'],
  [11, 'GP8'], [12, 'GP9'], [13, 'GND'], [14, 'GP10'], [15, 'GP11'], [16, 'GP12'], [17, 'GP13'], [18, 'GND'], [19, 'GP14'], [20, 'GP15'],
  [21, 'GP16'], [22, 'GP17'], [23, 'GND'], [24, 'GP18'], [25, 'GP19'], [26, 'GP20'], [27, 'GP21'], [28, 'GND'], [29, 'GP22'], [30, 'RUN'],
  [31, 'GP26 · ADC0'], [32, 'GP27 · ADC1'], [33, 'AGND'], [34, 'GP28 · ADC2'], [35, 'ADC_VREF'], [36, '3V3(OUT)'], [37, '3V3_EN'], [38, 'GND'], [39, 'VSYS'], [40, 'VBUS'],
];
const gpOf = (name: string) => { const m = name.match(/^GP(\d+)/); return m ? +m[1]! : -1; };
/** Physical pin → GP number for every GPIO on the edge. */
export const PICO_GP: Record<number, number> = Object.fromEntries(PINOUT.filter(([, n]) => gpOf(n) >= 0).map(([p, n]) => [p, gpOf(n)]));
const PINS: PinDef[] = PINOUT.map(([p, name]) => ({
  id: String(p), label: `${p} · ${name}`,
  x: p <= 20 ? p - 1 : 40 - p, y: p <= 20 ? 0 : -7,
  ground: name === 'GND' || name === 'AGND',
}));
const GND_PINS = PINOUT.filter(([, n]) => n === 'GND' || n === 'AGND').map(([p]) => String(p));

/** Couples the emulated RP2040 pads to circuit nodes and steps the CPU with circuit time. */
class PicoBridge implements Element {
  levels = new Array<number>(30).fill(0);
  private hi = new Array<boolean>(30).fill(false);
  private target = 0;
  constructor(private nodes: Map<number, number>, private rail: number, private gnd: number, private run: number, public machine: () => PicoMachine | null) {}

  beginStep(ctx: Ctx) {
    const m = this.machine();
    const gnd = ctx.prev(this.gnd);
    for (const [gp, n] of this.nodes) {
      const v = ctx.prev(n) - gnd;
      if (v > 1.8) this.hi[gp] = true; else if (v < 1.2) this.hi[gp] = false;
      this.levels[gp] = this.hi[gp] ? 1 : 0;
      if (m) m.mcu.gpio[gp]!.setInputValue(!!this.hi[gp]);
    }
    if (!m || ctx.mode !== 'tran') return;
    const adc = m.mcu.adc.channelValues, code = (v: number) => Math.max(0, Math.min(4095, Math.round(v / 3.3 * 4095)));
    adc[0] = code(ctx.prev(this.nodes.get(26)!) - gnd); adc[1] = code(ctx.prev(this.nodes.get(27)!) - gnd); adc[2] = code(ctx.prev(this.nodes.get(28)!) - gnd);
    adc[3] = code(4.8 / 3); adc[4] = code(0.706);
    if (ctx.prev(this.run) - gnd < 0.8) return;
    const dtNs = ctx.dt * 1e9;
    this.target = Math.max(this.target, m.nanos) + dtNs;
    m.account(m.runUntil(this.target, 20), dtNs);
    if (m.nanos < this.target && !m.yieldReq) this.target = m.nanos;
  }

  stamp(ctx: Ctx) {
    const m = this.machine();
    if (!m) return;
    for (const [gp, n] of this.nodes) {
      const pin = m.mcu.gpio[gp]!;
      if (pin.outputEnable) {
        const hi = pin.outputValue;
        ctx.conductance(this.rail, n, hi ? 1 / 40 : 1e-12);
        ctx.conductance(n, this.gnd, hi ? 1e-12 : 1 / 40);
        continue;
      }
      if (pin.pullupEnabled) ctx.conductance(this.rail, n, 1 / 50000);
      if (pin.pulldownEnabled) ctx.conductance(n, this.gnd, 1 / 50000);
    }
  }
}

type PicoProps = { code: string; run: boolean; runId: number; sid: string };

const TEMPLATE = `# Blink the Pico's own LED (GP25) and an LED on GP15.
# Wire: GP15 (pin 20) -> 330 ohm resistor -> LED (+) -> LED (-) -> GND (pin 18).
from machine import Pin
import time

onboard = Pin(25, Pin.OUT)
led = Pin(15, Pin.OUT)

for i in range(10):
    onboard.toggle()
    led.toggle()
    print("blink", i, "LED is", "on" if led.value() else "off")
    time.sleep(0.5)
print("done")
`;

export const pico: PartDef<PicoProps> = {
  type: 'pico', name: 'Raspberry Pi Pico', category: 'Microcontrollers', blurb: 'RP2040, 3.3 V, MicroPython',
  mount: 'free',
  box: () => ({ x: -3, y: -8.2, w: 24, h: 9.4 }),
  pins: () => PINS,
  nets: () => [GND_PINS],
  props: [],
  defaults: { code: TEMPLATE, run: false, runId: 0, sid: '' },
  program: { language: 'micropython', template: TEMPLATE },
  info: [
    ['3.3 V logic', 'GPIO pins give and accept 3.3 V. Never feed 5 V into a GP pin'],
    ['Numbering', 'Code uses GP numbers: Pin(15) is GP15, which is physical pin 20'],
    ['On-board LED', 'Pin(25) is the little green LED next to the USB socket'],
    ['Analog in', 'GP26, GP27, GP28 are ADC0–2: machine.ADC(26).read_u16() gives 0–65535 for 0–3.3 V'],
    ['Power', 'Powered by USB here: 3V3(OUT) can supply small parts; share GND with them'],
    ['LEDs', 'Always add a resistor (220–330 Ω) between a pin and an LED'],
  ],
  build(ctx, p) {
    const gnd = ctx.pin('38'), v33 = ctx.pin('36'), vbus = ctx.pin('40'), vsys = ctx.pin('39'), runPin = ctx.pin('30');
    ctx.add(new VoltageSource(v33, gnd, 3.3, 0.1));
    ctx.add(new VoltageSource(vbus, gnd, 5.0, 0.1));
    ctx.add(new VoltageSource(vsys, gnd, 4.8, 0.3));
    ctx.add(new VoltageSource(ctx.pin('35'), gnd, 3.3, 200));
    ctx.add(new VoltageSource(runPin, gnd, 3.3, 50000));
    ctx.add(new VoltageSource(ctx.pin('37'), gnd, 3.3, 50000));
    const nodes = new Map<number, number>(Object.entries(PICO_GP).map(([phys, gp]) => [gp, ctx.pin(phys)]));
    const host = firmwareHost();
    let m: PicoMachine | null = null, loading = false;
    const machine = () => {
      if (m || !p.sid || !host) return m;
      const fw = host.pico();
      if (!fw) { if (!loading && host.load) { loading = true; host.load().catch(() => {}); } return null; }
      m = picoMachine(p.sid, fw);
      if (p.run && p.runId !== m.lastRunId) m.run(p.code, p.runId);
      else if (!p.run && m.running) m.stop();
      return m;
    };
    const el = ctx.add(new PicoBridge(nodes, v33, gnd, runPin, machine));
    const status = () => {
      const mm = machine();
      if (!host) return { running: false, message: 'MicroPython firmware not available' };
      if (!mm) return { running: false, message: p.sid ? 'loading MicroPython firmware…' : 'starting…' };
      if (!mm.ready) return { running: false, message: 'booting MicroPython…' };
      if (mm.running) return { running: true, message: mm.speed < 0.95 ? `CPU at ${Math.round(mm.speed * 100)}% speed` : undefined };
      const err = mm.error.trim().split('\n').pop();
      return { running: false, message: err || (p.run ? 'finished' : 'stopped — REPL ready') };
    };
    return {
      read: () => {
        const mm = machine(), outs = new Array<number>(30).fill(-1);
        if (mm) for (const [gp] of nodes) { const pin = mm.mcu.gpio[gp]!; if (pin.outputEnable) outs[gp] = pin.outputValue ? 1 : 0; }
        const led = mm ? mm.mcu.gpio[25]!.outputEnable && mm.mcu.gpio[25]!.outputValue : false;
        const st = status();
        return { running: st.running, message: st.message ?? '', outs, levels: el.levels.slice(), led };
      },
      serial: { read: () => machine()?.read() ?? '', write: (t: string) => machine()?.write(t) },
      status,
      update: q => q.code === p.code && q.run === p.run && q.runId === p.runId && q.sid === p.sid,
    };
  },
  render: ({ props, live, selected, act }) => {
    if (!props.sid) queueMicrotask(() => act({ sid: `pico-${Math.random().toString(36).slice(2, 10)}` }));
    const outs = (live.outs as number[] | undefined) ?? [], lv = (live.levels as number[] | undefined) ?? [];
    return (
      <g>
        <rect x={u(-1)} y={u(-7.8)} width={u(21)} height={u(8.6)} rx={6} fill="#2f7d4a" stroke={INK} strokeWidth={1.6} />
        <rect x={u(-3)} y={u(-5)} width={u(2.6)} height={u(3)} rx={2} fill="#c9ced2" stroke={INK} />
        <Label x={-1.7} y={-1.2} size={6} color="#e6f2e8">USB</Label>
        <circle cx={u(1.6)} cy={u(-5.6)} r={5} fill={live.led ? '#7cf29a' : '#2e5a3c'} stroke={INK} />
        {live.led ? <circle cx={u(1.6)} cy={u(-5.6)} r={11} fill="#7cf29a" opacity={0.35} style={{ filter: 'blur(3px)' }} /> : null}
        <Label x={1.6} y={-4.2} size={6} color="#e6f2e8">GP25</Label>
        <rect x={u(1)} y={u(-2.8)} width={u(1.8)} height={u(1.3)} rx={2} fill="#f2efe7" stroke={INK} />
        <Label x={1.9} y={-0.9} size={5} color="#e6f2e8">BOOTSEL</Label>
        <rect x={u(7)} y={u(-5.4)} width={u(4.2)} height={u(4.2)} rx={2} fill="#262624" stroke={INK} />
        <Label x={9.1} y={-3} size={7} color="#cfcab8">RP2040</Label>
        <rect x={u(13.2)} y={u(-5)} width={u(2.4)} height={u(3.4)} rx={1} fill="#262624" stroke={INK} />
        <Label x={17.6} y={-3.6} size={10} color="#e6f2e8">Pico</Label>
        <Label x={17.6} y={-2.4} size={6} color="#cfe6d4">Raspberry Pi</Label>
        {PINS.map(pin => {
          const gp = PICO_GP[+pin.id], name = PINOUT[+pin.id - 1]![1];
          const fill = name === 'GND' || name === 'AGND' ? '#4a4741' : name.startsWith('3V3') ? '#ef8a2b' : name === 'VBUS' || name === 'VSYS' ? '#d6452f'
            : gp != null && outs[gp] === 1 ? '#7cf29a' : gp != null && outs[gp] === 0 ? '#3a6ed6' : gp != null && lv[gp] ? '#f3c33b' : '#c9a23a';
          return <g key={pin.id}><path d={`M${u(pin.x) - 4.5},${u(pin.y)} a4.5,4.5 0 0 ${pin.y ? 1 : 0} 9,0`} fill={fill} stroke={INK} strokeWidth={0.7} transform={pin.y ? undefined : `rotate(180 ${u(pin.x)} ${u(pin.y)})`} /><circle cx={u(pin.x)} cy={u(pin.y)} r={2.2} fill="#1d1d1b" /></g>;
        })}
        {selected && PINS.map(pin => <text key={'t' + pin.id} x={u(pin.x)} y={pin.y ? u(pin.y) + 13 : u(pin.y) - 8} fontSize={5.5} textAnchor="middle" fill="#fbf8f1" fontFamily="ui-monospace,Menlo,monospace" style={{ pointerEvents: 'none' }}>{PINOUT[+pin.id - 1]![1].split(' ')[0]}</text>)}
        <Label x={-0.2} y={1.6} size={6} color="#6b665a" anchor="start">pin 1</Label>
        {live.message ? <Label x={10} y={2.6} size={7} color="#6b665a">{String(live.message).slice(0, 56)}</Label> : null}
      </g>
    );
  },
};

export const picoParts: PartDef<any>[] = [pico];
