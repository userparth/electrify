import { builder } from '@/features/workbench/examples';
import type { Check, Module } from '@/features/learn/types';

/** Last number captured by `re` (group 1) in a board's serial output, or NaN. */
export const lastNum = (text: string, re: RegExp) => { const m = [...text.matchAll(re)]; return m.length ? Number(m[m.length - 1]![1]) : NaN; };
const either = (c: Check, a: string, b1: string, b2: string) => c.joined(a, b1) || c.joined(a, b2);

export const BLINK_UNO = `// Blink an LED on pin 9 and report over Serial.
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

export const BUTTON_UNO = `// Read a push button with the internal pull-up resistor.
const int BUTTON = 2;
const int LED = 8;
int last = -1;

void setup() {
  pinMode(BUTTON, INPUT_PULLUP);  // pin reads HIGH until the button pulls it to GND
  pinMode(LED, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int pressed = digitalRead(BUTTON) == LOW;
  digitalWrite(LED, pressed ? HIGH : LOW);
  if (pressed != last) {
    Serial.println(pressed ? "pressed" : "released");
    last = pressed;
  }
  delay(10);
}
`;

export const FADE_UNO = `// Fade an LED with PWM (analogWrite) on pin 9.
const int LED = 9;   // must be a PWM pin (marked ~)
int brightness = 0;
int step = 5;

void setup() {
  pinMode(LED, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  analogWrite(LED, brightness);   // 0 = off … 255 = full on
  Serial.print("brightness: ");
  Serial.println(brightness);
  brightness += step;
  if (brightness <= 0 || brightness >= 255) step = -step;
  delay(30);
}
`;

export const POT_UNO = `// Read a potentiometer on A0.
void setup() {
  Serial.begin(9600);
}

void loop() {
  int value = analogRead(A0);   // 0 … 1023 for 0 … 5 V
  Serial.print("A0 = ");
  Serial.println(value);
  delay(100);
}
`;

export const BLINK_PICO = `from machine import Pin
import time

DELAY = 0.5                  # seconds between toggles
led = Pin(15, Pin.OUT)       # GP15 = physical pin 20
board_led = Pin(25, Pin.OUT) # the LED on the Pico itself

for i in range(40):
    on = i % 2 == 0          # on, off, on, off …
    led.value(on)
    board_led.value(on)
    print("blink", i, "delay", DELAY)
    time.sleep(DELAY)
print("done")
`;

export const ADC_PICO = `from machine import ADC
import time

pot = ADC(26)                # GP26 = ADC0 = physical pin 31
while True:
    value = pot.read_u16()   # 0 … 65535 for 0 … 3.3 V
    print("adc", value)
    time.sleep(0.2)
`;

const LED_PI = `from gpiozero import LED
from time import sleep

led = LED(17)          # GPIO17 = physical pin 11

while True:
    led.on()
    print("on")
    sleep(0.5)
    led.off()
    print("off")
    sleep(0.5)
`;

const BUTTON_PI = `from gpiozero import LED, Button
from signal import pause

led = LED(17)          # GPIO17 = physical pin 11
button = Button(27)    # GPIO27 = physical pin 13, internal pull-up is on

button.when_pressed = led.on
button.when_released = led.off
print("press the button")
pause()
`;

export const micro: Module = {
  id: 'micro', title: 'Microcontrollers: Arduino, Pico and Raspberry Pi', level: 'School & college',
  blurb: 'Write real code that blinks LEDs, reads buttons and knobs, and talks over Serial — on an Arduino Uno, a Raspberry Pi Pico and a Raspberry Pi 4.',
  lessons: [
    {
      id: 'uno-blink', title: 'Arduino: blink an LED and print to Serial', minutes: 12, dt: 1e-4,
      summary: 'A microcontroller runs your program over and over. digitalWrite turns a pin into 5 V (HIGH) or 0 V (LOW), and Serial.println sends text back to your computer.',
      goals: ['Compile and upload a sketch', 'Read the Serial monitor', 'Change the timing'],
      build() {
        const { doc, part, wire } = builder();
        const uno = part('arduino-uno', 0, 0, { code: BLINK_UNO, binary: '' }), r = part('resistor', 40, -6, { ohms: 220 }), led = part('led', 46, -6, { color: 'green' });
        wire(uno('D9'), r('1'), 'yellow'); wire(r('2'), led('A'), 'yellow'); wire(led('K'), uno('GND'), 'black');
        return doc;
      },
      steps: [
        { title: 'Upload the sketch', text: 'Click the Arduino, read the code below the bench, then press "Compile & upload". The compiler turns your C++ into machine code for the ATmega328P chip.', check: c => /LED (on|off)/.test(c.serial('arduino-uno')), hint: 'The upload button is in the code panel that opens when the Arduino is selected.' },
        { title: 'Watch it blink', text: 'The green LED on pin 9 blinks once a second, and the Serial monitor prints "LED on" / "LED off".', check: c => c.glow() > 0.25 },
        { title: 'Blink faster', text: 'Change both delay(500) lines to delay(100) and upload again. The LED should flash five times faster.', check: c => /delay\(\s*100\s*\)/.test(String(c.prop('arduino-uno', 'code'))) && c.prop('arduino-uno', 'binary') !== '' && /LED (on|off)/.test(c.serial('arduino-uno')), hint: 'Edit the code, then press "Compile & upload" again — the board only runs what was uploaded.' },
      ],
      tryIt: [['Remove the 220 Ω resistor and wire the LED straight to pin 9', 'the LED (and in real life the pin) is overloaded. An Arduino pin should give at most ~20 mA.'], ['Change pinMode(9, …) to pin 10 but leave the wire on 9', 'nothing blinks: the code and the wiring must use the same pin number.']],
      quiz: [
        { q: 'What does digitalWrite(9, HIGH) do on an Uno?', options: ['Puts 5 V on pin 9', 'Puts 3.3 V on pin 9', 'Reads pin 9'], answer: 0, why: 'The Uno is a 5 V board: HIGH means 5 V, LOW means 0 V.' },
        { q: 'Which function runs again and again forever?', options: ['setup()', 'loop()', 'main()'], answer: 1, why: 'setup() runs once at power-up, then loop() repeats.' },
        { q: 'delay(500) waits for…', options: ['500 seconds', '500 milliseconds', '500 microseconds'], answer: 1, why: 'delay() takes milliseconds: 500 ms = half a second.' },
      ],
    },
    {
      id: 'uno-button', title: 'Arduino: read a button with INPUT_PULLUP', minutes: 12, dt: 1e-4,
      summary: 'An input pin reads HIGH or LOW. With INPUT_PULLUP, a resistor inside the chip holds the pin HIGH until a button connects it to GND — so "pressed" reads LOW.',
      goals: ['Use INPUT_PULLUP', 'React to a button press', 'Invert the logic in code'],
      build() {
        const { doc, part, wire } = builder();
        const uno = part('arduino-uno', 0, 0, { code: BUTTON_UNO, binary: '' }), btn = part('button', 34, -10);
        const r = part('resistor', 42, -6, { ohms: 220 }), led = part('led', 48, -6, { color: 'red' });
        wire(uno('D2'), btn('1a'), 'yellow'); wire(btn('2a'), uno('GND'), 'black');
        wire(uno('D8'), r('1'), 'blue'); wire(r('2'), led('A'), 'blue'); wire(led('K'), uno('GND'), 'black');
        return doc;
      },
      steps: [
        { title: 'Upload the sketch', text: 'Select the Arduino and press "Compile & upload". The Serial monitor prints "released".', check: c => c.serial('arduino-uno').includes('released') },
        { title: 'Press the button', text: 'Press and hold the push button. Pin 2 is pulled to GND, digitalRead returns LOW, and the LED on pin 8 lights.', check: c => c.prop('button', 'pressed') === true && c.glow() > 0.25, hint: 'Hold the mouse button down on the push button.' },
        { title: 'Invert it', text: 'Change the code so the LED is ON when the button is NOT pressed (swap HIGH and LOW in the digitalWrite line), upload, and let go of the button.', check: c => c.prop('button', 'pressed') !== true && c.glow() > 0.25 && c.prop('arduino-uno', 'binary') !== '' },
      ],
      tryIt: [['Change INPUT_PULLUP to INPUT', 'the pin floats when the button is open and reads random values — that is why the pull-up exists.']],
      quiz: [
        { q: 'With INPUT_PULLUP, a pressed button (to GND) reads…', options: ['HIGH', 'LOW', 'it depends on the code'], answer: 1, why: 'The button connects the pin to 0 V, overpowering the weak internal pull-up.' },
        { q: 'Why not leave an input pin unconnected?', options: ['It reads a steady LOW', 'It floats and picks up noise', 'It damages the chip'], answer: 1, why: 'A floating input has no defined voltage, so readings jump around.' },
      ],
    },
    {
      id: 'uno-fade', title: 'Arduino: fade an LED with PWM', minutes: 12, dt: 1e-4,
      summary: 'Pins marked ~ can do PWM: they switch on and off hundreds of times a second. analogWrite(pin, 0…255) sets how much of the time the pin is on, so the LED looks dimmer or brighter.',
      goals: ['Use analogWrite on a PWM pin', 'Read values in the Serial monitor', 'Change the fade speed'],
      build() {
        const { doc, part, wire } = builder();
        const uno = part('arduino-uno', 0, 0, { code: FADE_UNO, binary: '' }), r = part('resistor', 40, -6, { ohms: 220 }), led = part('led', 46, -6, { color: 'blue' });
        wire(uno('D9'), r('1'), 'yellow'); wire(r('2'), led('A'), 'yellow'); wire(led('K'), uno('GND'), 'black');
        return doc;
      },
      steps: [
        { title: 'Upload the fade', text: 'Upload the sketch. The LED breathes in and out, and the Serial monitor shows brightness going 0, 5, 10 … 255 and back.', check: c => /brightness: \d+/.test(c.serial('arduino-uno')) },
        { title: 'Fade faster', text: 'Change step from 5 to 15 and upload again. The numbers now jump 0, 15, 30 …', check: c => { const s = c.serial('arduino-uno'); return /brightness: 30\r?\n/.test(s) && !/brightness: 5\r?\n/.test(s); }, hint: 'Look for "int step = 5;" near the top.' },
        { title: 'See the PWM on a scope (optional)', text: 'Drag an oscilloscope onto the bench and connect CH1 to pin 9 and GND to GND: the pin is a square wave whose width changes with brightness.' },
      ],
      tryIt: [['Move the LED to pin 8 (not a ~ PWM pin) and set LED = 8', 'analogWrite on a non-PWM pin can only switch fully on or off.']],
      quiz: [
        { q: 'analogWrite(9, 128) keeps pin 9 on for about…', options: ['12.8 % of the time', '50 % of the time', '128 ms'], answer: 1, why: '128 / 255 ≈ 50 % duty cycle.' },
        { q: 'Which pins can do PWM on an Uno?', options: ['All of them', 'Only those marked ~ (3, 5, 6, 9, 10, 11)', 'Only A0–A5'], answer: 1, why: 'PWM comes from the chip’s timers, which are wired to those pins.' },
      ],
    },
    {
      id: 'uno-analog', title: 'Arduino: read a knob with analogRead', minutes: 12, dt: 1e-4,
      summary: 'Analog pins measure a voltage. analogRead turns 0–5 V into a number from 0 to 1023. A potentiometer is a voltage divider you can turn by hand.',
      goals: ['Wire a potentiometer as a divider', 'Read it with analogRead', 'Convert the reading to volts'],
      build() {
        const { doc, part, wire } = builder();
        const uno = part('arduino-uno', 0, 0, { code: POT_UNO, binary: '' }), pot = part('pot', 30, 26, { ohms: 10000, position: 0.5 });
        wire(pot('1'), uno('GND2'), 'black'); wire(pot('2'), uno('5V')); wire(pot('W'), uno('A0'), 'yellow');
        return doc;
      },
      steps: [
        { title: 'Upload and read', text: 'Upload the sketch. The Serial monitor prints A0 = … ten times a second.', check: c => /A0 = \d+/.test(c.serial('arduino-uno')) },
        { title: 'Turn it all the way up', text: 'Turn the knob fully clockwise (drag it, scroll on it, or set Knob position to 1). The wiper reaches 5 V and the reading goes above 1000.', check: c => lastNum(c.serial('arduino-uno'), /A0 = (\d+)/g) > 1000 },
        { title: 'Find the middle', text: 'Turn the knob to the middle. You should read about 512 — half of 1023, because the wiper is at 2.5 V.', check: c => { const n = lastNum(c.serial('arduino-uno'), /A0 = (\d+)/g); return n > 420 && n < 600; } },
        { title: 'Print volts', text: 'Add a line that prints the voltage: Serial.print("Volts = "); Serial.println(value * 5.0 / 1023.0); then upload.', check: c => /Volts = \d\.\d\d/.test(c.serial('arduino-uno')), hint: 'Put it inside loop(), after the analogRead line.' },
      ],
      tryIt: [['Wire the potentiometer ends to 5V and VIN instead of 5V and GND', 'the wiper never gets near 0 V, so the reading never goes low.']],
      quiz: [
        { q: 'analogRead returns 1023 when the pin is at…', options: ['0 V', '2.5 V', '5 V'], answer: 2, why: 'The 10-bit ADC maps 0–5 V to 0–1023.' },
        { q: 'A reading of 256 is about…', options: ['1.25 V', '2.5 V', '0.25 V'], answer: 0, why: '256 / 1023 × 5 V ≈ 1.25 V.' },
      ],
    },
    {
      id: 'pico-blink', title: 'Raspberry Pi Pico: blink with MicroPython', minutes: 12, dt: 1e-4,
      summary: 'The Pico runs MicroPython: Python made small enough for a microcontroller. Pin(15, Pin.OUT) makes GP15 an output; value(1) puts 3.3 V on it and value(0) puts 0 V.',
      goals: ['Run MicroPython on the Pico', 'Blink an external LED and the on-board LED', 'Change the timing'],
      build() {
        const { doc, part, wire } = builder();
        const pico = part('pico', 0, 0, { code: BLINK_PICO, run: false, runId: 0, sid: 'micro-pico-blink' });
        const r = part('resistor', 30, 6, { ohms: 330 }), led = part('led', 36, 6, { color: 'blue' });
        wire(pico('20'), r('1'), 'yellow'); wire(r('2'), led('A'), 'yellow'); wire(led('K'), pico('18'), 'black');
        return doc;
      },
      steps: [
        { title: 'Run the program', text: 'Select the Pico and press ▶ Run. MicroPython starts the first time (a moment), then the Serial monitor prints "blink 0 …".', check: c => /blink \d+/.test(c.serial('pico')) },
        { title: 'Watch the LEDs', text: 'The blue LED on GP15 (physical pin 20) and the little LED on the Pico flash together.', check: c => c.glow() > 0.2 || c.read('pico', 'led') === true },
        { title: 'Blink faster', text: 'Change DELAY = 0.5 to DELAY = 0.1 and press Run again.', check: c => c.serial('pico').includes('delay 0.1') },
      ],
      tryIt: [['Change Pin(15 …) to Pin(14 …) without moving the wire', 'the LED stays dark: GP14 is physical pin 19, not 20. GP numbers and physical pin numbers are different.']],
      quiz: [
        { q: 'A Pico GPIO pin outputs…', options: ['5 V', '3.3 V', '12 V'], answer: 1, why: 'The RP2040 is a 3.3 V chip.' },
        { q: 'Which pin number does Pin(15) use?', options: ['Physical pin 15', 'GP15, which is physical pin 20', 'Either'], answer: 1, why: 'MicroPython uses GP numbers; check the pinout for the physical pin.' },
      ],
    },
    {
      id: 'pico-adc', title: 'Raspberry Pi Pico: read a knob with the ADC', minutes: 12, dt: 1e-4,
      summary: 'GP26, GP27 and GP28 can measure voltage. ADC(26).read_u16() turns 0–3.3 V into a number from 0 to 65535.',
      goals: ['Wire a potentiometer to an ADC pin', 'Read it in MicroPython', 'Convert to volts'],
      build() {
        const { doc, part, wire } = builder();
        const pico = part('pico', 0, 0, { code: ADC_PICO, run: false, runId: 0, sid: 'micro-pico-adc' }), pot = part('pot', 26, 10, { ohms: 10000, position: 0.5 });
        wire(pot('1'), pico('33'), 'black'); wire(pot('2'), pico('36')); wire(pot('W'), pico('31'), 'yellow');
        return doc;
      },
      steps: [
        { title: 'Run it', text: 'Press ▶ Run. The Serial monitor prints "adc …" five times a second.', check: c => /adc \d+/.test(c.serial('pico')) },
        { title: 'Turn it all the way up', text: 'Turn the knob fully clockwise: the wiper is at 3.3 V and the reading is above 60000.', check: c => lastNum(c.serial('pico'), /adc (\d+)/g) > 60000 },
        { title: 'Find the middle', text: 'Turn the knob to the middle: about 32768, half of 65535.', check: c => { const n = lastNum(c.serial('pico'), /adc (\d+)/g); return n > 24000 && n < 42000; } },
        { title: 'Print volts', text: 'Change the print line to print("volts", value * 3.3 / 65535) and press Run again.', check: c => /volts \d\.\d+/.test(c.serial('pico')) },
      ],
      tryIt: [['Wire the potentiometer to VBUS (5 V) instead of 3V3(OUT)', 'that puts more than 3.3 V on an ADC pin — on a real Pico this can damage it.']],
      quiz: [
        { q: 'read_u16() returns 65535 at…', options: ['3.3 V', '5 V', '1.65 V'], answer: 0, why: 'The ADC’s full scale is the 3.3 V supply.' },
        { q: 'Which pins are ADC inputs on a Pico?', options: ['Any GP pin', 'GP26, GP27, GP28', 'Only GP25'], answer: 1, why: 'Only those three pins are wired to the ADC.' },
      ],
    },
    {
      id: 'pi-led', title: 'Raspberry Pi 4: blink an LED with gpiozero', minutes: 12, dt: 1e-4,
      summary: 'A Raspberry Pi runs full Python. The gpiozero library makes GPIO simple: LED(17).on() puts 3.3 V on GPIO17, which is physical pin 11 on the header.',
      goals: ['Wire an LED to a GPIO safely', 'Run a Python program on the Pi', 'Map GPIO numbers to header pins'],
      build() {
        const { doc, part } = builder();
        part('rpi4', 0, 0, { code: LED_PI, run: false, runId: 0, sid: 'micro-pi-led' });
        part('resistor', 40, -8, { ohms: 330 }); part('led', 46, -8, { color: 'red' });
        return doc;
      },
      steps: [
        { title: 'Wire the LED', text: 'Wire GPIO17 (header pin 11) → resistor → LED long leg (anode), and the LED short leg (cathode) → a GND pin (e.g. pin 6). Hover header pins to see their names.', check: c => {
          const pi = (n: string) => c.pin('rpi4', n), r1 = c.pin('resistor', '1'), r2 = c.pin('resistor', '2'), a = c.pin('led', 'A');
          const series = (c.joined(pi('11'), r1) && c.joined(r2, a)) || (c.joined(pi('11'), r2) && c.joined(r1, a));
          return series && c.joined(c.pin('led', 'K'), pi('6'));
        }, hint: 'Pin 11 is the 6th pin of the inner row; all GND pins are joined, so any of them works.' },
        { title: 'Run the program', text: 'Select the Pi and press ▶ Run. Python loads in your browser (a few seconds the first time), then the LED blinks and the Serial monitor prints "on" / "off".' },
        { title: 'Use another pin', text: 'Move the wire from pin 11 to pin 13 (GPIO27), change LED(17) to LED(27) and Run again.', check: c => either(c, c.pin('rpi4', '13'), c.pin('resistor', '1'), c.pin('resistor', '2')) },
      ],
      tryIt: [['Wire the 5V pin (pin 2) to a GPIO', 'the board flags over-voltage: a real Pi’s GPIO pins are 3.3 V only and 5 V can destroy them.'], ['Use LED(11)', 'gpiozero uses GPIO numbers, not header pin numbers — GPIO11 is a different pin.']],
      quiz: [
        { q: 'LED(17) in gpiozero refers to…', options: ['Header pin 17', 'GPIO17, which is header pin 11', 'The 17th LED'], answer: 1, why: 'gpiozero uses BCM (GPIO) numbering.' },
        { q: 'Maximum safe voltage on a Pi GPIO pin?', options: ['3.3 V', '5 V', '12 V'], answer: 0, why: 'The Pi’s GPIOs are 3.3 V logic with no 5 V tolerance.' },
      ],
    },
    {
      id: 'pi-button', title: 'Raspberry Pi 4: react to a button', minutes: 12, dt: 1e-4,
      summary: 'gpiozero’s Button turns on a pull-up inside the Pi, so you only need to wire the button between the GPIO pin and GND. when_pressed runs a function the moment it is pressed.',
      goals: ['Wire a button to a GPIO', 'Use when_pressed / when_released', 'Understand pull-ups on the Pi'],
      build() {
        const { doc, part, wire } = builder();
        const pi = part('rpi4', 0, 0, { code: BUTTON_PI, run: false, runId: 0, sid: 'micro-pi-button' });
        const r = part('resistor', 40, -8, { ohms: 330 }), led = part('led', 46, -8, { color: 'green' });
        part('button', 40, 4);
        wire(pi('11'), r('1'), 'yellow'); wire(r('2'), led('A'), 'yellow'); wire(led('K'), pi('6'), 'black');
        return doc;
      },
      steps: [
        { title: 'Wire the button', text: 'Wire one side of the button to GPIO27 (header pin 13) and the other side to GND (e.g. pin 14).', check: c => {
          const p13 = c.pin('rpi4', '13'), gnd = c.pin('rpi4', '6'), a = c.pin('button', '1a'), b = c.pin('button', '2a');
          return (c.joined(p13, a) && c.joined(b, gnd)) || (c.joined(p13, b) && c.joined(a, gnd));
        } },
        { title: 'Run the program', text: 'Select the Pi and press ▶ Run. The Serial monitor says "press the button".' },
        { title: 'Press it', text: 'Press and hold the button: GPIO27 is pulled to 0 V and the LED turns on. Let go and it turns off.', check: c => c.prop('button', 'pressed') === true && (c.v(c.pin('rpi4', '13')) ?? 9) < 0.5 },
      ],
      tryIt: [['Wire the button between pin 13 and the 3.3 V pin instead of GND', 'with the pull-up already holding it HIGH, pressing changes nothing.']],
      quiz: [
        { q: 'With gpiozero’s Button, the other side of the button goes to…', options: ['3.3 V', 'GND', '5 V'], answer: 1, why: 'The internal pull-up holds the pin HIGH; the button pulls it LOW to GND.' },
        { q: 'when_pressed = led.on means…', options: ['the LED is on right now', 'led.on runs whenever the button is pressed', 'the button turns on by itself'], answer: 1, why: 'It registers a callback that runs on each press.' },
      ],
    },
  ],
};
