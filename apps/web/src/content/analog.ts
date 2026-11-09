import { builder } from '@/features/workbench/examples';
import type { Check, Module } from '@/features/learn/types';

const near = (v: number, want: number, tol: number) => Math.abs(v - want) <= tol;
const num = (x: unknown) => Number(x ?? 0);
/** Voltage between two pin keys (a − b), undefined if either is unconnected. */
const across = (c: Check, a: string, b: string) => { const va = c.v(a), vb = c.v(b); return va == null || vb == null ? undefined : va - vb; };
/** True if some resistor has one leg on `a`'s net and the other on `b`'s net. */
const resistorBetween = (c: Check, a: string, b: string) => c.parts('resistor').some(r =>
  (c.joined(`${r.id}:1`, a) && c.joined(`${r.id}:2`, b)) || (c.joined(`${r.id}:2`, a) && c.joined(`${r.id}:1`, b)));
const meterOn = (c: Check, red: string, black: string) => c.joined(c.pin('dmm', 'VmA'), red) && c.joined(c.pin('dmm', 'COM'), black);
const dcVolts = (c: Check) => { const m = c.dmm(); return m && m.mode === 'V DC' ? m.value : undefined; };

export const analog: Module = {
  id: 'analog', title: 'Analog electronics', level: 'School & college',
  blurb: 'Capacitors, diodes, transistors, sensors, op-amps and voltage regulators — seen on the meter and the scope.',
  lessons: [
    {
      id: 'capacitor-rc', title: 'Capacitors and the RC time constant', minutes: 15,
      summary: 'A capacitor stores charge. Through a resistor it fills and empties gradually: after one time constant τ = R × C it reaches about 63 %.',
      goals: ['See a capacitor charge on the oscilloscope', 'Calculate τ = R × C', 'Change C and predict the shape'],
      dt: 1e-5,
      build() {
        const { doc, part, wire } = builder();
        const g = part('fgen', 0, 0, { shape: 'square', freq: 1000, amplitude: 5, offset: 2.5 });
        const r = part('resistor', 24, 4, { ohms: 1000 }), cap = part('cap-ceramic', 32, 4, { farads: 100e-9 });
        const sc = part('scope', 22, 40, { timeDiv: '0.0002', ch1VDiv: '1', ch2VDiv: '1', level: 2.5 });
        wire(g('OUT'), r('1')); wire(r('2'), cap('1'), 'orange'); wire(cap('2'), g('COM'), 'black');
        wire(sc('CH1'), g('OUT'), 'yellow'); wire(sc('GND'), g('COM'), 'black');
        return doc;
      },
      steps: [
        { title: 'Look at CH1', text: 'The function generator makes a 0–5 V square wave at 1 kHz. CH1 (yellow) already shows it: the voltage jumps instantly.', check: c => num(c.read('scope', 'vpp1')) > 4.5 },
        { title: 'Probe the capacitor with CH2', text: 'Wire the scope’s CH2 jack to the capacitor’s top leg (where it meets the resistor). The blue trace curves up and down instead of jumping — the capacitor needs time to charge.', check: c => c.joined(c.pin('scope', 'CH2'), c.pin('cap-ceramic', '1')) && num(c.read('scope', 'vpp2')) > 4 },
        { title: 'Make C ten times bigger', text: 'Select the capacitor and set it to 1 µF. Now τ = 1 kΩ × 1 µF = 1 ms, longer than each half of the square wave (0.5 ms): the capacitor never finishes charging, so the blue wave gets small and triangular.', check: c => num(c.prop('cap-ceramic', 'farads')) >= 0.9e-6 && num(c.read('scope', 'vpp2')) < 2 },
        { title: 'Make C small', text: 'Set the capacitor to 10 nF (τ = 10 µs). It charges almost instantly, so CH2 looks almost like CH1 again.', check: c => num(c.prop('cap-ceramic', 'farads')) <= 2e-8 && num(c.read('scope', 'vpp2')) > 4.5 },
      ],
      tryIt: [['Set the timestep to 1 ms', 'the scope warns that the timestep is too coarse — a simulation, like a real scope, needs enough samples per division.'], ['Raise the frequency to 10 kHz with 100 nF', 'the wave gets small and triangular: the half-period is now shorter than τ.']],
      quiz: [
        { q: 'τ for 10 kΩ and 100 µF?', options: ['1 ms', '1 s', '10 s'], answer: 1, why: 'τ = R × C = 10 000 × 0.0001 = 1 s.' },
        { q: 'After one τ a charging capacitor has reached about…', options: ['37 %', '63 %', '100 %'], answer: 1, why: '1 − e⁻¹ ≈ 0.63. After about 5 τ it is practically full.' },
        { q: 'A bigger capacitor with the same resistor charges…', options: ['faster', 'slower', 'the same'], answer: 1, why: 'More capacitance means more charge to move through the same resistor.' },
      ],
    },
    {
      id: 'diodes', title: 'Diodes, the 0.7 V drop and the zener', minutes: 15,
      summary: 'A silicon diode lets current flow one way and drops about 0.6–0.7 V while doing it. A zener diode is used backwards on purpose: it holds a fixed voltage.',
      goals: ['Measure the forward drop', 'See reverse bias block current', 'Build a simple zener regulator'],
      build() {
        const { doc, part, wire } = builder();
        const psu = part('psu', 0, 0, { volts: 5, limit: 0.1 }), r = part('resistor', 16, 2, { ohms: 1000 }), d = part('diode', 24, 2);
        part('dmm', 34, -6, { knob: 'V', ac: false });
        wire(psu('+'), r('1')); wire(r('2'), d('A'), 'orange'); wire(d('K'), psu('-'), 'black');
        return doc;
      },
      steps: [
        { title: 'Measure the forward drop', text: 'Connect the meter (V DC) across the diode: red VΩmA to the anode, black COM to the cathode (the end with the stripe).', check: c => { const v = dcVolts(c); return v != null && meterOn(c, c.pin('diode', 'A'), c.pin('diode', 'K')) && v > 0.55 && v < 0.8; } },
        { title: 'Turn the diode round', text: 'Rewire it backwards: cathode to the resistor, anode to PSU −. Keep the meter leads on the same diode legs. Now almost all 5 V sits across the diode and no current flows.', check: c => { const v = dcVolts(c); return v != null && Math.abs(v) > 4.5 && Math.abs(num(c.read('diode', 'amps'))) < 1e-4; } },
        { title: 'Swap in a 5.1 V zener', text: 'Add a Zener diode, connected backwards like you just did (cathode/stripe to the resistor, anode to PSU −), remove the normal diode, and turn the PSU up to 12 V.', check: c => { if (!c.parts('zener').length || num(c.prop('psu', 'volts')) < 11) return false; const v = across(c, c.pin('zener', 'K'), c.pin('zener', 'A')); return v != null && v > 4.8 && v < 5.6; }, hint: 'Zener K → resistor lead 2, zener A → PSU −. Then delete the 1N4007.' },
        { title: 'Prove it regulates', text: 'Turn the PSU up to 15 V. The resistor takes the extra volts; the zener still holds about 5.1 V.', check: c => { if (num(c.prop('psu', 'volts')) < 14.5) return false; const v = across(c, c.pin('zener', 'K'), c.pin('zener', 'A')); return v != null && v > 4.8 && v < 5.7; } },
      ],
      tryIt: [['Remove the 1 kΩ resistor and put the zener straight across the PSU', 'the zener tries to clamp the supply: watch the PSU hit its current limit (CC). A zener always needs a series resistor.']],
      quiz: [
        { q: 'A forward-biased silicon diode drops about…', options: ['0 V', '0.7 V', '5 V'], answer: 1, why: 'Silicon junctions need ~0.6–0.7 V before they conduct well.' },
        { q: 'Which end of a diode has the stripe?', options: ['Anode', 'Cathode', 'Either'], answer: 1, why: 'The stripe marks the cathode; current flows from anode to cathode.' },
        { q: 'A zener regulator is the zener connected…', options: ['forwards, in series', 'backwards, across the output, with a series resistor', 'without any resistor'], answer: 1, why: 'Reverse-biased, the zener breaks down at its rated voltage and holds it; the resistor takes the rest.' },
      ],
    },
    {
      id: 'bjt-switch', title: 'The transistor as a switch', minutes: 15,
      summary: 'A small base current lets a much bigger collector current flow. Give an NPN transistor enough base current and it switches fully on (saturates).',
      goals: ['Add a base resistor', 'Switch an LED with a small current', 'Measure Vce on and off'],
      build() {
        const { doc, part, wire } = builder();
        const psu = part('psu', 0, 0, { volts: 9, limit: 0.5 }), sw = part('spst', 14, 14, { on: false });
        const rl = part('resistor', 16, 0, { ohms: 330 }), led = part('led', 22, 0, { color: 'green' }), q = part('2n2222', 26, 8);
        part('dmm', 34, -10, { knob: 'V', ac: false });
        wire(psu('+'), rl('1')); wire(rl('2'), led('A'), 'orange'); wire(led('K'), q('C'), 'orange'); wire(q('E'), psu('-'), 'black');
        wire(psu('+'), sw('1'));
        return doc;
      },
      steps: [
        { title: 'Add a base resistor', text: 'Put a 10 kΩ resistor between the switch’s free pin and the transistor’s base (middle leg). It keeps the base current small and safe.', check: c => resistorBetween(c, c.pin('spst', '2'), c.pin('2n2222', 'B')) },
        { title: 'Switch it on', text: 'Click the toggle switch (or tick "On"). Less than 1 mA flows into the base, but ~20 mA flows through the LED and collector.', check: c => c.prop('spst', 'on') === true && c.glow() > 0.3 },
        { title: 'Measure Vce while on', text: 'Meter (V DC) from collector (red) to emitter (black). A saturated switch has only about 0.1–0.2 V across it, so almost all the voltage goes to the load.', check: c => { const v = dcVolts(c); return v != null && meterOn(c, c.pin('2n2222', 'C'), c.pin('2n2222', 'E')) && v >= 0 && v < 0.3; } },
        { title: 'Switch it off', text: 'Turn the switch off. With no base current the transistor blocks: the LED goes out and Vce rises to several volts.', check: c => { const v = dcVolts(c); return c.prop('spst', 'on') === false && v != null && v > 5 && c.glow() < 0.05; } },
      ],
      tryIt: [['Leave out the base resistor (wire the switch straight to the base)', 'the base–emitter junction is just a diode: it takes far too much current. Always use a base resistor.']],
      quiz: [
        { q: 'With 9 V, Vbe ≈ 0.7 V and a 10 kΩ base resistor, the base current is about…', options: ['0.83 mA', '9 mA', '83 mA'], answer: 0, why: '(9 − 0.7) / 10 000 ≈ 0.00083 A.' },
        { q: 'A transistor switch that is fully on has Vce of about…', options: ['0.1–0.2 V', '0.7 V', 'the supply voltage'], answer: 0, why: 'In saturation the collector sits just above the emitter.' },
      ],
    },
    {
      id: 'mosfet', title: 'MOSFET switch vs BJT', minutes: 12,
      summary: 'A MOSFET is switched by gate voltage, not gate current. Above its threshold (~2 V for a 2N7000) it turns on; its gate takes almost no current.',
      goals: ['Turn a MOSFET on with a voltage', 'Measure the gate voltage', 'Add a gate pull-down'],
      build() {
        const { doc, part, wire } = builder();
        const psu = part('psu', 0, 0, { volts: 9, limit: 0.5 }), pot = part('pot', 14, 14, { ohms: 10000, position: 1 });
        const rl = part('resistor', 16, 0, { ohms: 330 }), led = part('led', 22, 0, { color: 'blue' }), m = part('2n7000', 26, 8);
        part('dmm', 34, -10, { knob: 'V', ac: false });
        wire(psu('+'), rl('1')); wire(rl('2'), led('A'), 'orange'); wire(led('K'), m('D'), 'orange'); wire(m('S'), psu('-'), 'black');
        wire(psu('+'), pot('1')); wire(pot('2'), psu('-'), 'black'); wire(pot('W'), m('G'), 'yellow');
        return doc;
      },
      steps: [
        { title: 'Turn the knob', text: 'The potentiometer feeds a voltage to the gate. It starts at 0 V (LED off). Turn the knob (lower "Knob position") until the LED lights.', check: c => c.glow() > 0.3 },
        { title: 'Measure the gate voltage', text: 'Meter (V DC) from gate (red) to source (black). The LED is on with only a few volts here — and the gate draws no current at all.', check: c => { const v = dcVolts(c); return v != null && meterOn(c, c.pin('2n7000', 'G'), c.pin('2n7000', 'S')) && v > 2; } },
        { title: 'Compare with the BJT', text: 'A BJT needs base current (through a resistor) the whole time it is on. A MOSFET only needs its gate charged to a voltage — great for driving from a microcontroller pin.' },
        { title: 'Add a gate pull-down', text: 'Gates that are left floating can turn on by themselves. Add a 100 kΩ resistor from gate to source so the MOSFET is definitely off when nothing drives it.', check: c => resistorBetween(c, c.pin('2n7000', 'G'), c.pin('2n7000', 'S')) },
      ],
      tryIt: [['Delete the yellow wire to the gate', 'without a pull-down a real gate floats and may stay on. With the 100 kΩ pull-down it always turns off.']],
      quiz: [
        { q: 'A MOSFET is controlled by…', options: ['gate current', 'gate voltage', 'drain current'], answer: 1, why: 'The gate is insulated; the voltage on it opens the channel.' },
        { q: 'Why add a gate pull-down resistor?', options: ['To make it faster', 'So the gate is not left floating', 'To limit drain current'], answer: 1, why: 'A floating gate can pick up charge and switch on unexpectedly.' },
      ],
    },
    {
      id: 'night-light', title: 'Sensors: an automatic night-light', minutes: 15,
      summary: 'An LDR’s resistance falls in bright light. In a voltage divider it turns light into a voltage that can switch a transistor.',
      goals: ['Use a sensor in a voltage divider', 'Switch an LED automatically', 'Measure the divider voltage'],
      build() {
        const { doc, part, wire } = builder();
        const psu = part('psu', 0, 0, { volts: 5, limit: 0.5 }), rt = part('resistor', 14, 14, { ohms: 47000 }), ldr = part('ldr', 22, 14, { light: 50 });
        const rb = part('resistor', 28, 8, { ohms: 10000 }), rl = part('resistor', 16, 0, { ohms: 150 }), led = part('led', 22, 0, { color: 'yellow' }), q = part('2n2222', 34, 8);
        part('dmm', 42, -10, { knob: 'V', ac: false });
        wire(psu('+'), rt('1')); wire(rt('2'), ldr('1'), 'orange'); wire(ldr('2'), psu('-'), 'black');
        wire(ldr('1'), rb('1'), 'yellow'); wire(rb('2'), q('B'), 'yellow'); wire(q('E'), psu('-'), 'black');
        wire(psu('+'), rl('1')); wire(rl('2'), led('A'), 'orange'); wire(led('K'), q('C'), 'orange');
        return doc;
      },
      steps: [
        { title: 'Daylight', text: 'Select the LDR and slide the light up to 90 %. Its resistance drops to a couple of kΩ, the divider voltage falls below 0.6 V, and the LED stays off.', check: c => num(c.prop('ldr', 'light')) >= 80 && c.glow() < 0.05 },
        { title: 'Night', text: 'Slide the light down to 10 %. The LDR rises towards 1 MΩ, the divider voltage climbs, the transistor turns on and the LED lights up.', check: c => num(c.prop('ldr', 'light')) <= 20 && c.glow() > 0.3 },
        { title: 'Measure the divider', text: 'With it still dark, measure the voltage at the LDR’s top leg (red) against PSU − (black). It is well above the ~0.6 V the base needs.', check: c => { const v = dcVolts(c); return v != null && meterOn(c, c.pin('ldr', '1'), c.pin('psu', '-')) && v > 1; } },
      ],
      tryIt: [['Swap the LDR and the 47 kΩ resistor', 'the light now comes on in daylight instead — the divider is upside down.'], ['Change 47 kΩ to 4.7 kΩ', 'the switching point moves: it needs to get much darker before the light turns on.']],
      quiz: [
        { q: 'In bright light an LDR’s resistance is…', options: ['high', 'low', 'unchanged'], answer: 1, why: 'More light frees more charge carriers, so resistance falls.' },
        { q: 'Why is the sensor in a voltage divider?', options: ['To turn a resistance change into a voltage change', 'To make it brighter', 'To protect the LED'], answer: 0, why: 'The transistor responds to voltage; the divider converts the LDR’s resistance into one.' },
      ],
    },
    {
      id: 'op-amp', title: 'The op-amp: follower and amplifier', minutes: 18,
      summary: 'An op-amp adjusts its output until its two inputs are equal. With feedback resistors that makes a precise amplifier: gain = 1 + Rf / Rg.',
      goals: ['Wire a voltage follower', 'Build a ×2 and ×11 amplifier', 'Check the gain with the meter'],
      build() {
        const { doc, part, wire } = builder();
        const psu = part('psu', 0, 0, { volts: 9, limit: 0.5 }), ic = part('lm358', 20, 14), pot = part('pot', 12, 20, { ohms: 10000, position: 0.89 });
        part('dmm', 34, -10, { knob: 'V', ac: false });
        wire(psu('+'), ic('8')); wire(psu('-'), ic('4'), 'black');
        wire(psu('+'), pot('1')); wire(pot('2'), psu('-'), 'black'); wire(pot('W'), ic('3'), 'yellow');
        return doc;
      },
      steps: [
        { title: 'Make a follower', text: 'The pot puts about 1 V on IN1+ (pin 3). Wire OUT1 (pin 1) straight to IN1− (pin 2). The op-amp now copies its input to its output.', check: c => { const vin = c.v(c.pin('pot', 'W')); return c.joined(c.pin('lm358', '1'), c.pin('lm358', '2')) && vin != null && vin > 0.3 && near(num(c.read('lm358', 'out1')), vin, 0.05); } },
        { title: 'Measure the output', text: 'Meter (V DC) from OUT1 (red) to PSU − (black). It matches the pot voltage.', check: c => { const v = dcVolts(c), vin = c.v(c.pin('pot', 'W')); return v != null && vin != null && meterOn(c, c.pin('lm358', '1'), c.pin('psu', '-')) && near(v, vin, 0.06); } },
        { title: 'Build a ×2 amplifier', text: 'Remove the pin 1 → pin 2 wire. Add Rf = 10 kΩ from OUT1 to IN1− and Rg = 10 kΩ from IN1− to PSU −. Gain = 1 + 10k/10k = 2.', check: c => { const vin = c.v(c.pin('pot', 'W')), out = num(c.read('lm358', 'out1')); return !c.joined(c.pin('lm358', '1'), c.pin('lm358', '2')) && vin != null && vin > 0.3 && out < 7 && Math.abs(out / vin - 2) < 0.06; } },
        { title: 'Make it ×11', text: 'Change Rf to 100 kΩ (gain 1 + 100/10 = 11). Turn the pot down so the input is about 0.5 V — otherwise the output hits the ~7.5 V ceiling of a 9 V supply.', check: c => { const vin = c.v(c.pin('pot', 'W')), out = num(c.read('lm358', 'out1')); return vin != null && vin > 0.2 && out < 7.3 && Math.abs(out / vin - 11) < 0.35; }, hint: 'Pot position about 0.94 gives ~0.5 V.' },
      ],
      tryIt: [['Turn the input up with gain 11', 'the output stops at about 7.5 V: an LM358 can’t swing to its top rail. That is clipping.'], ['Disconnect pin 8 (VCC)', 'no power, no amplifier — every chip needs its supply pins.']],
      quiz: [
        { q: 'Rf = 47 kΩ, Rg = 4.7 kΩ in a non-inverting amplifier. Gain?', options: ['10', '11', '47'], answer: 1, why: '1 + 47/4.7 = 11.' },
        { q: 'A voltage follower has a gain of…', options: ['0', '1', 'infinite'], answer: 1, why: 'Output equals input — useful as a buffer that doesn’t load the source.' },
        { q: 'Why does the output stop at ~7.5 V on a 9 V supply?', options: ['The op-amp is broken', 'Its output can’t reach the top rail', 'The resistors limit it'], answer: 1, why: 'An LM358’s output swings to about 1.5 V below its positive supply.' },
      ],
    },
    {
      id: 'regulator', title: 'A regulated 5 V supply with the 7805', minutes: 12,
      summary: 'A linear regulator turns a higher, wobbly voltage into a steady 5 V. It needs about 2 V of headroom, and burns the difference as heat.',
      goals: ['Wire a 7805', 'Add its capacitors', 'See dropout when the input is too low'],
      build() {
        const { doc, part, wire } = builder();
        const bat = part('battery', 0, 0, { volts: '9' }), reg = part('lm7805', 16, 4);
        const rl = part('resistor', 26, 0, { ohms: 330 }), led = part('led', 32, 0, { color: 'red' });
        part('cap-electrolytic', 12, 10, { farads: 10e-6 }); part('cap-ceramic', 22, 10, { farads: 100e-9 });
        wire(reg('OUT'), rl('1'), 'orange'); wire(rl('2'), led('A'), 'orange'); wire(led('K'), reg('GND'), 'black');
        return doc;
      },
      steps: [
        { title: 'Feed the input', text: 'Wire battery + to the 7805’s IN (left leg) and battery − to its GND (middle leg).', check: c => num(c.read('lm7805', 'vin')) > 7 },
        { title: 'Check the output', text: 'The LED now lights from the OUT pin. Measure OUT to GND: a steady 5.0 V even though the battery gives about 9 V.', check: c => near(num(c.read('lm7805', 'vout')), 5, 0.15) && c.glow() > 0.1 },
        { title: 'Add the capacitors', text: 'Regulators can oscillate without capacitors. Put the electrolytic (+ to IN, − to GND) on the input and the ceramic between OUT and GND.', check: c => {
          const gnd = c.pin('lm7805', 'GND'), inp = c.pin('lm7805', 'IN'), out = c.pin('lm7805', 'OUT');
          const across2 = (type: string, a: string, b: string) => c.parts(type).some(p => (c.joined(`${p.id}:${a}`, inp) || c.joined(`${p.id}:${a}`, out)) && c.joined(`${p.id}:${b}`, gnd));
          return across2('cap-electrolytic', '+', '-') && across2('cap-ceramic', '1', '2') && c.parts('cap-ceramic').some(p => c.joined(`${p.id}:1`, out) || c.joined(`${p.id}:2`, out));
        } },
        { title: 'Find the dropout', text: 'Change the battery to 2×AA (3 V). The 7805 needs about 7 V in; with 3 V it can’t make 5 V and the output sags.', check: c => c.prop('battery', 'volts') === '3' && c.read('lm7805', 'dropout') === true },
      ],
      tryIt: [['Swap to the 12 V battery and a 47 Ω load', 'the regulator dissipates (12 − 5) × current as heat — check the "watts" in its readout.']],
      quiz: [
        { q: 'Minimum input for a 7805 to give 5 V?', options: ['5 V', 'about 7 V', '12 V exactly'], answer: 1, why: 'It needs roughly 2 V of headroom (its dropout).' },
        { q: '12 V in, 5 V out at 0.5 A. Heat in the regulator?', options: ['2.5 W', '3.5 W', '6 W'], answer: 1, why: '(12 − 5) × 0.5 = 3.5 W — that needs a heatsink.' },
      ],
    },
  ],
};
