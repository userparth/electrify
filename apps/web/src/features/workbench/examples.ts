import { getPart, type Props } from '@eb/parts';
import type { Doc, Inst } from './model';

const COLORS = { red: '#d6452f', black: '#1d1d1b', blue: '#3a6ed6', green: '#3fae66', yellow: '#f3c33b', orange: '#ef8a2b' };

export function builder() {
  const doc: Doc = { parts: [], wires: [] };
  let n = 0;
  const part = (type: string, x: number, y: number, props: Props = {}, rot: Inst['rot'] = 0) => {
    const id = `${type.replace(/[^a-z0-9]/gi, '').slice(0, 4)}${++n}`;
    doc.parts.push({ id, type, x, y, rot, props: { ...getPart(type)?.defaults, ...props } });
    return (pin: string) => `${id}:${pin}`;
  };
  const wire = (a: string, b: string, color: keyof typeof COLORS = 'red') => doc.wires.push({ id: `w${++n}`, a, b, color: COLORS[color] });
  return { doc, part, wire };
}

export interface Example { id: string; name: string; dt?: number; build(): Doc }

export const EXAMPLES: Example[] = [
  {
    id: 'led', name: '1 · LED + resistor on a breadboard',
    build() {
      const { doc, part, wire } = builder();
      const bb = part('breadboard', 0, 0), bat = part('battery', -9, 6, { volts: '9' });
      part('resistor', 11, 7, { ohms: 470 });
      part('led', 15, 8, { color: 'red' });
      wire(bat('+'), bb('tp3')); wire(bat('-'), bb('tn3'), 'black');
      wire(bb('tp10'), bb('a10')); wire(bb('a15'), bb('tn15'), 'black');
      return doc;
    },
  },
  {
    id: 'nand', name: '2 · NAND gate with two switches',
    build() {
      const { doc, part, wire } = builder();
      const bat = part('battery', 0, 0, { volts: '3' }), ic = part('74hc00', 12, 10);
      const s1 = part('logic-switch', 6, 16), s2 = part('logic-switch', 12, 16);
      const r = part('resistor', 20, 4, { ohms: 220 }), led = part('led', 26, 4, { color: 'green' });
      wire(bat('+'), ic('14')); wire(bat('-'), ic('7'), 'black');
      for (const s of [s1, s2]) { wire(s('VCC'), bat('+')); wire(s('GND'), bat('-'), 'black'); }
      wire(s1('OUT'), ic('1'), 'yellow'); wire(s2('OUT'), ic('2'), 'yellow');
      wire(ic('3'), r('1'), 'blue'); wire(r('2'), led('A'), 'blue'); wire(led('K'), bat('-'), 'black');
      return doc;
    },
  },
  {
    id: '555', name: '3 · 555 blinker (≈1.5 Hz)',
    build() {
      const { doc, part, wire } = builder();
      const bat = part('battery', 0, 0, { volts: '9' }), ic = part('ne555', 14, 12);
      const r1 = part('resistor', 22, 2, { ohms: 1000 }), r2 = part('resistor', 22, 6, { ohms: 10000 });
      const c = part('cap-electrolytic', 10, 18, { farads: 47e-6 }), c5 = part('cap-ceramic', 20, 18, { farads: 10e-9 });
      const r3 = part('resistor', 26, 12, { ohms: 470 }), led = part('led', 32, 12, { color: 'red' });
      wire(bat('+'), ic('8')); wire(bat('+'), ic('4')); wire(bat('-'), ic('1'), 'black');
      wire(ic('8'), r1('1')); wire(r1('2'), ic('7'), 'orange'); wire(ic('7'), r2('1'), 'orange'); wire(r2('2'), ic('6'), 'yellow');
      wire(ic('6'), ic('2'), 'yellow'); wire(ic('6'), c('+'), 'yellow'); wire(c('-'), bat('-'), 'black');
      wire(ic('5'), c5('1'), 'blue'); wire(c5('2'), bat('-'), 'black');
      wire(ic('3'), r3('1'), 'green'); wire(r3('2'), led('A'), 'green'); wire(led('K'), bat('-'), 'black');
      return doc;
    },
  },
  {
    id: 'npn', name: '4 · Transistor switches a 12 V lamp',
    build() {
      const { doc, part, wire } = builder();
      const psu = part('psu', 0, 0, { volts: 12, limit: 1 }), lamp = part('lamp', 16, 2), q = part('2n2222', 20, 12);
      const btn = part('button', 6, 14), rb = part('resistor', 12, 18, { ohms: 1000 });
      wire(psu('+'), lamp('1')); wire(lamp('2'), q('C'), 'orange'); wire(q('E'), psu('-'), 'black');
      wire(psu('+'), btn('1a')); wire(btn('2a'), rb('1'), 'yellow'); wire(rb('2'), q('B'), 'yellow');
      return doc;
    },
  },
  {
    id: 'dmm', name: '5 · Multimeter on a voltage divider', dt: 1e-4,
    build() {
      const { doc, part, wire } = builder();
      const bat = part('battery', 0, 0, { volts: '9' }), r1 = part('resistor', 10, 2, { ohms: 1000 }), r2 = part('resistor', 18, 2, { ohms: 1000 });
      const m = part('dmm', 8, 8, { knob: 'V', ac: false });
      wire(bat('+'), r1('1')); wire(r1('2'), r2('1'), 'orange'); wire(r2('2'), bat('-'), 'black');
      wire(m('COM'), bat('-'), 'black'); wire(m('VmA'), r1('2'), 'red');
      return doc;
    },
  },
  {
    id: 'rc', name: '6 · Scope: RC filter on a square wave', dt: 1e-5,
    build() {
      const { doc, part, wire } = builder();
      const g = part('fgen', 0, 0, { shape: 'square', freq: 1000, amplitude: 5, offset: 2.5 });
      const r = part('resistor', 24, 4, { ohms: 1000 }), c = part('cap-ceramic', 32, 4, { farads: 100e-9 });
      const sc = part('scope', 22, 40, { timeDiv: '0.0002', ch1VDiv: '1', ch2VDiv: '1', level: 2.5 });
      wire(g('OUT'), r('1')); wire(r('2'), c('1'), 'orange'); wire(c('2'), g('COM'), 'black');
      wire(sc('CH1'), g('OUT'), 'yellow'); wire(sc('CH2'), r('2'), 'blue'); wire(sc('GND'), g('COM'), 'black');
      return doc;
    },
  },
  {
    id: 'la', name: '7 · Logic analyzer on a flip-flop divider', dt: 1e-5,
    build() {
      const { doc, part, wire } = builder();
      const bat = part('battery', 0, 0, { volts: '3' }), g = part('fgen', 8, -14, { shape: 'square', freq: 1000, amplitude: 3, offset: 1.5 });
      const ic = part('74hc74', 30, 10), la = part('logic-analyzer', 10, 45);
      wire(bat('+'), ic('14')); wire(bat('+'), ic('1')); wire(bat('+'), ic('4')); wire(bat('-'), ic('7'), 'black');
      wire(g('OUT'), ic('3'), 'yellow'); wire(g('COM'), bat('-'), 'black'); wire(ic('6'), ic('2'), 'orange');
      wire(la('D0'), ic('3'), 'yellow'); wire(la('D1'), ic('5'), 'green'); wire(la('GND'), bat('-'), 'black');
      return doc;
    },
  },
  {
    id: 'uno', name: '8 · Arduino: blink an LED + Serial', dt: 1e-4,
    build() {
      const { doc, part, wire } = builder();
      const code = `// Blink an LED on pin 9 and report over Serial.
void setup() {
  pinMode(9, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  digitalWrite(9, HIGH);
  Serial.println("LED on");
  delay(500);
  digitalWrite(9, LOW);
  Serial.println("LED off");
  delay(500);
}
`;
      const uno = part('arduino-uno', 0, 0, { code, binary: '' }), r = part('resistor', 40, -6, { ohms: 220 }), led = part('led', 46, -6, { color: 'green' });
      wire(uno('D9'), r('1'), 'yellow'); wire(r('2'), led('A'), 'yellow'); wire(led('K'), uno('GND'), 'black');
      return doc;
    },
  },
  {
    id: 'rpi', name: '9 · Raspberry Pi: Python blinks an LED', dt: 1e-4,
    build() {
      const { doc, part, wire } = builder();
      const code = `from gpiozero import LED
from time import sleep

led = LED(17)          # GPIO17 = physical pin 11

for i in range(20):
    led.toggle()
    print("LED is", "on" if led.is_lit else "off")
    sleep(0.5)
print("done")
`;
      const pi = part('rpi4', 0, 0, { code, run: false, runId: 0 });
      doc.parts[doc.parts.length - 1]!.props.sid = doc.parts[doc.parts.length - 1]!.id;
      const r = part('resistor', 40, -8, { ohms: 330 }), led = part('led', 46, -8, { color: 'red' });
      wire(pi('11'), r('1'), 'yellow'); wire(r('2'), led('A'), 'yellow'); wire(led('K'), pi('6'), 'black');
      return doc;
    },
  },
  {
    id: 'pico', name: '10 · Raspberry Pi Pico: MicroPython blink', dt: 1e-4,
    build() {
      const { doc, part, wire } = builder();
      const code = `from machine import Pin
import time

led = Pin(15, Pin.OUT)       # GP15 = physical pin 20
board_led = Pin(25, Pin.OUT) # the LED on the Pico itself

for i in range(10):
    led.toggle()
    board_led.toggle()
    print("blink", i)
    time.sleep(0.5)
print("done")
`;
      const pico = part('pico', 0, 0, { code, run: false, runId: 0 });
      doc.parts[doc.parts.length - 1]!.props.sid = doc.parts[doc.parts.length - 1]!.id;
      const r = part('resistor', 30, 6, { ohms: 330 }), led = part('led', 36, 6, { color: 'blue' });
      wire(pico('20'), r('1'), 'yellow'); wire(r('2'), led('A'), 'yellow'); wire(led('K'), pico('18'), 'black');
      return doc;
    },
  },
];
