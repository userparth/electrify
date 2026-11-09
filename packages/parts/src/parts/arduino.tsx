import { PinState } from 'avr8js';
import { Glow, INK, Label, u } from '../draw';
import { UnoBridge } from '../mcu/avr';
import type { PartDef, PinDef } from '../types';

const TOP: [string, number][] = [['SCL', 8], ['SDA', 9], ['AREF', 10], ['GND', 11], ['D13', 12], ['D12', 13], ['D11', 14], ['D10', 15], ['D9', 16], ['D8', 17],
  ['D7', 19], ['D6', 20], ['D5', 21], ['D4', 22], ['D3', 23], ['D2', 24], ['D1', 25], ['D0', 26]];
const BOTTOM: [string, number][] = [['IOREF', 11], ['RESET', 12], ['3V3', 13], ['5V', 14], ['GND2', 15], ['GND3', 16], ['VIN', 17],
  ['A0', 20], ['A1', 21], ['A2', 22], ['A3', 23], ['A4', 24], ['A5', 25]];
const LABEL: Record<string, string> = {
  D0: 'D0 · RX', D1: 'D1 · TX', D3: 'D3 · PWM~', D5: 'D5 · PWM~', D6: 'D6 · PWM~', D9: 'D9 · PWM~', D10: 'D10 · PWM~', D11: 'D11 · PWM~', D13: 'D13 · on-board L LED',
  GND: 'GND', GND2: 'GND', GND3: 'GND', '5V': '5V out (USB)', '3V3': '3.3V out (50 mA max)', VIN: 'VIN (unused on USB power)', AREF: 'AREF (analog reference)',
  RESET: 'RESET (pull LOW to reset)', IOREF: 'IOREF (= 5V)', SDA: 'SDA (same as A4)', SCL: 'SCL (same as A5)',
};
const IO = [...Array.from({ length: 14 }, (_, i) => `D${i}`), ...Array.from({ length: 6 }, (_, i) => `A${i}`)];

const PINS: PinDef[] = [
  ...TOP.map(([id, x]) => ({ id, label: LABEL[id] ?? id, x, y: 1, ground: id === 'GND' })),
  ...BOTTOM.map(([id, x]) => ({ id, label: LABEL[id] ?? (id.startsWith('A') ? `${id} · analog in` : id), x, y: 20, ground: id.startsWith('GND') })),
];

const TEMPLATE = `// Blink: the "hello world" of Arduino.
// The on-board LED "L" is wired to pin 13.

void setup() {
  pinMode(13, OUTPUT);      // pin 13 drives the LED
  Serial.begin(9600);       // open the Serial monitor to see messages
}

void loop() {
  digitalWrite(13, HIGH);   // LED on (5 V)
  Serial.println("LED on");
  delay(500);               // wait half a second
  digitalWrite(13, LOW);    // LED off (0 V)
  Serial.println("LED off");
  delay(500);
}
`;

type UProps = { code: string; binary: string };

export const arduinoUno: PartDef<UProps> = {
  type: 'arduino-uno', name: 'Arduino Uno R3', category: 'Microcontrollers', blurb: 'ATmega328P, 5 V, write C++ sketches',
  mount: 'free',
  box: () => ({ x: -1.5, y: 0, w: 29, h: 21 }),
  pins: () => PINS,
  nets: () => [['GND', 'GND2', 'GND3'], ['A4', 'SDA'], ['A5', 'SCL'], ['5V', 'IOREF']],
  props: [],
  defaults: { code: TEMPLATE, binary: '' },
  program: { language: 'arduino', template: TEMPLATE },
  build(ctx, p) {
    const br = ctx.add(new UnoBridge({ io: IO.map(id => ctx.pin(id)), v5: ctx.pin('5V'), v3: ctx.pin('3V3'), gnd: ctx.pin('GND'), reset: ctx.pin('RESET') }, p.binary));
    const binary = p.binary;
    return {
      read: sim => {
        const d13 = br.pinState(13);
        return {
          L: d13 === PinState.High ? 1 : 0,
          tx: sim.t - br.lastTx < 0.06 ? 1 : 0,
          rx: sim.t - br.lastRx < 0.06 ? 1 : 0,
          running: br.running,
          loaded: !!br.cpu,
          levels: IO.map((_, i) => br.pinState(i)),
        };
      },
      update: q => q.binary === binary,
      serial: { read: () => br.readSerial(), write: t => br.writeSerial(t) },
      status: () => !br.cpu ? { running: false, message: 'No program uploaded yet. Write a sketch and press Upload.' }
        : br.inReset ? { running: false, message: 'Held in reset (RESET pin is LOW).' } : { running: true },
    };
  },
  info: [
    ['Logic level', '5 V: HIGH is about 5 V, LOW is 0 V'],
    ['Current', 'Max ~20 mA per pin. Always put a 220–470 Ω resistor in series with an LED'],
    ['PWM pins', '~3, 5, 6, 9, 10, 11 can fake an analog output with analogWrite()'],
    ['Analog in', 'A0–A5 read 0–5 V as 0–1023 with analogRead()'],
    ['Power', 'Powered by USB here: 5V and 3.3V pins supply other parts; share GND with them'],
    ['Serial', 'Serial.println() text appears in the Serial monitor; pins 0/1 are RX/TX'],
  ],
  render: ({ live }) => {
    const L = (live.L as number) || 0, lv = (live.levels as number[] | undefined) ?? [];
    const pinDot = (id: string, x: number, y: number) => {
      const i = IO.indexOf(id), s = i >= 0 ? lv[i] : undefined;
      const c = s === PinState.High ? '#3fae66' : s === PinState.Low ? '#d6452f' : undefined;
      return <g key={id}><rect x={u(x) - 4.5} y={u(y) - 4.5} width={9} height={9} fill="#1b1b1b" /><rect x={u(x) - 2} y={u(y) - 2} width={4} height={4} fill="#c9a23a" />{c && <circle cx={u(x)} cy={u(y) + (y < 10 ? 9 : -9)} r={2} fill={c} />}</g>;
    };
    const led = (x: number, y: number, color: string, on: number, label: string) => (
      <g><Glow cx={u(x)} cy={u(y)} r={4} color={color} amount={on} /><rect x={u(x) - 4} y={u(y) - 2.5} width={8} height={5} rx={1} fill={on ? color : '#d9d4c4'} stroke={INK} strokeWidth={0.6} /><Label x={x} y={y + 1.1} size={6} color="#dff5f2">{label}</Label></g>
    );
    return (
      <g>
        <path d={`M${u(0)},${u(0.3)} h${u(26.5)} l${u(1)},${u(1)} v${u(18.4)} l${u(-1)},${u(1)} h${u(-26.5)} z`} fill="#1a7f8e" stroke={INK} strokeWidth={1.6} />
        {[[1.2, 1.4], [26, 1.4], [1.2, 19.6], [26, 19.6]].map(([x, y], k) => <circle key={k} cx={u(x!)} cy={u(y!)} r={4} fill="#f2efe7" stroke={INK} strokeWidth={0.8} />)}
        <rect x={u(-1.5)} y={u(3)} width={u(5)} height={u(4.6)} rx={2} fill="#c9ced2" stroke={INK} strokeWidth={1.2} />
        <rect x={u(-1.5)} y={u(4.2)} width={u(1.4)} height={u(2.2)} fill="#9aa1a7" />
        <rect x={u(-1)} y={u(13.6)} width={u(5)} height={u(3.6)} rx={2} fill="#1f1f22" stroke={INK} strokeWidth={1.2} />
        <rect x={u(3.4)} y={u(1.6)} width={u(1.6)} height={u(1.6)} rx={2} fill="#d9d4c4" stroke={INK} /><circle cx={u(4.2)} cy={u(2.4)} r={5} fill="#d6452f" stroke={INK} />
        <rect x={u(12)} y={u(12.6)} width={u(13.5)} height={u(3.6)} rx={2} fill="#1d1d1b" stroke={INK} />
        <circle cx={u(12.7)} cy={u(14.4)} r={3} fill="#3a3a3a" />
        <Label x={18.8} y={14.8} size={9} color="#e9e4d6">ATMEGA328P</Label>
        <Label x={8.5} y={11} size={15} color="#f2efe7">UNO</Label>
        <Label x={8.5} y={12.5} size={7} color="#bfe6e1">ARDUINO</Label>
        <rect x={u(7.4)} y={u(0.4)} width={u(10.2)} height={u(1.2)} fill="#111" />
        <rect x={u(18.4)} y={u(0.4)} width={u(8.2)} height={u(1.2)} fill="#111" />
        <rect x={u(10.4)} y={u(19.4)} width={u(7.2)} height={u(1.2)} fill="#111" />
        <rect x={u(19.4)} y={u(19.4)} width={u(6.2)} height={u(1.2)} fill="#111" />
        {TOP.map(([id, x]) => pinDot(id, x, 1))}
        {BOTTOM.map(([id, x]) => pinDot(id, x, 20))}
        {TOP.map(([id, x]) => <text key={'t' + id} x={u(x)} y={u(2.6)} fontSize={5.5} fill="#dff5f2" textAnchor="middle" fontFamily="ui-monospace,Menlo,monospace" transform={`rotate(-90 ${u(x)} ${u(2.6)})`} dominantBaseline="middle" style={{ pointerEvents: 'none' }}>{id.replace(/^D/, '')}</text>)}
        {BOTTOM.map(([id, x]) => <text key={'b' + id} x={u(x)} y={u(18.3)} fontSize={5.5} fill="#dff5f2" textAnchor="middle" fontFamily="ui-monospace,Menlo,monospace" transform={`rotate(-90 ${u(x)} ${u(18.3)})`} dominantBaseline="middle" style={{ pointerEvents: 'none' }}>{id.replace(/GND\d/, 'GND')}</text>)}
        <Label x={21} y={3.9} size={6} color="#dff5f2">DIGITAL (PWM~)</Label>
        <Label x={14} y={17.3} size={6} color="#dff5f2">POWER</Label>
        <Label x={22.5} y={17.3} size={6} color="#dff5f2">ANALOG IN</Label>
        {led(12.5, 5.5, '#f3c33b', L, 'L')}
        {led(12.5, 7.6, '#f3c33b', (live.tx as number) || 0, 'TX')}
        {led(12.5, 9.7, '#f3c33b', (live.rx as number) || 0, 'RX')}
        {led(24.5, 9, '#3fae66', 1, 'ON')}
        {!live.loaded && <Label x={18.8} y={11.4} size={7} color="#f6c56b">{'no program — press Upload'}</Label>}
      </g>
    );
  },
};

export const arduinoParts: PartDef<any>[] = [arduinoUno];
