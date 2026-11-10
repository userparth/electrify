import { builder } from '@/features/workbench/examples';
import type { Module } from '@/features/learn/types';

const near = (v: number, want: number, tol: number) => Math.abs(v - want) <= tol;

export const basics: Module = {
  id: 'basics', title: 'Basics: voltage, current, resistance', level: 'School',
  blurb: 'Build your first circuit, light an LED, and measure with a real multimeter.',
  lessons: [
    {
      id: 'first-circuit', title: 'Your first circuit: light an LED', minutes: 10,
      summary: 'A battery pushes current round a loop. An LED lights when current flows through it the right way, and a resistor keeps that current safe.',
      goals: ['Use a breadboard', 'Place a resistor and an LED', 'See why the resistor matters'],
      build() {
        const { doc, part, wire } = builder();
        const bb = part('breadboard', 0, 0), bat = part('battery', -9, 6, { volts: '9' });
        wire(bat('+'), bb('tp3')); wire(bat('-'), bb('tn3'), 'black');
        return doc;
      },
      steps: [
        { title: 'Meet the breadboard', text: 'The 5 holes in each short column (a–e, and f–j) are joined inside. The long red (+) and blue (−) rails along the edges carry power. The 9 V battery is already wired to the top rails.' },
        { title: 'Place a resistor', text: 'Drag a Resistor from the parts list onto the board so its two legs sit in two different columns.', check: c => c.parts('resistor').length > 0, demo: [{ add: 'resistor', x: 11, y: 7 }], hint: 'Parts are on the left under "Passive". Drop it anywhere on the holes.' },
        { title: 'Place an LED', text: 'Drag an LED onto the board. Its long leg (+, anode) must connect to the resistor, its short leg (−, cathode) towards the − rail.', check: c => c.parts('led').length > 0, demo: [{ add: 'led', x: 15, y: 8 }] },
        { title: 'Make the LED light', text: 'Complete the loop: + rail → resistor → LED → − rail. Drag wires from hole to hole (jumper wires) to join things up.', check: c => c.glow() > 0.25, demo: [{ wire: ['breadboard#0:tp*', 'resistor#0:1'] }, { wire: ['resistor#0:2', 'led#0:A'] }, { wire: ['led#0:K', 'breadboard#0:tn*'], color: '#1d1d1b' }], hint: 'Hover a hole to see which holes it is joined to. Put the resistor and the LED anode in the same column, then wire the resistor’s other leg to the + rail and the LED cathode column to the − rail.' },
        { title: 'Try a bigger resistor', text: 'Select the resistor and change it to 1 kΩ or more. The LED gets dimmer: more resistance, less current.', check: c => Number(c.prop('resistor', 'ohms')) >= 1000 && c.glow() > 0.01, demo: [{ set: 'resistor#0', props: { ohms: 1000 }, say: 'Tap the resistor → Selected → 1k' }] },
      ],
      tryIt: [['Turn the LED round', 'it stays dark — current only flows one way through an LED.'], ['Remove the resistor and wire the LED straight across 9 V', 'it burns out. That is why every LED needs a resistor.']],
      quiz: [
        { q: 'Which leg of an LED goes towards +?', options: ['The short leg', 'The long leg (anode)', 'Either'], answer: 1, why: 'The long leg is the anode; current flows from anode to cathode.' },
        { q: 'Why does the LED need a resistor?', options: ['To limit the current', 'To change the colour', 'To store charge'], answer: 0, why: 'Without it the LED draws far too much current and burns out.' },
        { q: 'A bigger resistor makes the LED…', options: ['brighter', 'dimmer', 'no change'], answer: 1, why: 'More resistance → less current → less light.' },
      ],
    },
    {
      id: 'ohms-law', title: "Ohm's law with a multimeter", minutes: 15,
      summary: 'Voltage (V), current (I) and resistance (R) are linked: V = I × R. Measure them yourself.',
      goals: ['Measure voltage in parallel', 'Measure current in series', 'Check V = I × R'],
      dt: 1e-4,
      build() {
        const { doc, part, wire } = builder();
        const psu = part('psu', 0, 0, { volts: 5, limit: 0.1 }), r = part('resistor', 24, 4, { ohms: 1000 });
        part('dmm', 34, -8, { knob: 'V', ac: true });
        wire(psu('+'), r('1')); wire(r('2'), psu('-'), 'black');
        return doc;
      },
      steps: [
        { title: 'Switch the meter to DC volts', text: 'The meter starts on AC (like the real one). Click FUNC on the meter (or untick AC in its settings) so the display says DC.', check: c => c.dmm()?.mode === 'V DC', demo: [{ set: 'dmm#0', props: { ac: false }, say: 'Tap FUNC on the meter → DC' }] },
        { title: 'Measure the voltage across the resistor', text: 'Voltage is measured across a part. Wire the meter’s red VΩmA jack to one resistor leg and the black COM jack to the other.', check: c => { const m = c.dmm(); return !!m && m.mode === 'V DC' && near(Math.abs(m.value), 5, 0.15); }, hint: 'Drag from the meter’s COM jack to resistor lead 2, and from VΩmA to resistor lead 1.', demo: [{ wire: ['dmm#0:COM', 'resistor#0:2'], color: '#1d1d1b' }, { wire: ['dmm#0:VmA', 'resistor#0:1'] }] },
        { title: 'Measure the current', text: 'Current is measured through a part, so the meter must be IN the loop. Turn the knob to A, move the red lead to the 10A jack, take out the wire from PSU + to the resistor, and let the current pass through the meter instead.', check: c => { const m = c.dmm(); return !!m && m.mode === 'A DC' && near(Math.abs(m.value), 0.005, 0.0007); }, hint: 'PSU + → meter 10A jack, meter COM → resistor lead 1. The reading should be about 0.005 A = 5 mA.', demo: [{ set: 'dmm#0', props: { knob: 'A' }, say: 'Turn the knob to A' }, { unwire: ['dmm#0:VmA', 'resistor#0:1'] }, { unwire: ['dmm#0:COM', 'resistor#0:2'] }, { unwire: ['psu#0:+', 'resistor#0:1'] }, { wire: ['psu#0:+', 'dmm#0:10A'] }, { wire: ['dmm#0:COM', 'resistor#0:1'], color: '#1d1d1b' }] },
        { title: 'Double the voltage', text: 'Turn the power supply up to 10 V. What does the current do?', check: c => { const m = c.dmm(); return Number(c.prop('psu', 'volts')) >= 9.8 && !!m && m.mode === 'A DC' && near(Math.abs(m.value), 0.01, 0.0012); }, demo: [{ set: 'psu#0', props: { volts: 10 }, say: 'Turn the supply up to 10 V' }] },
      ],
      tryIt: [['Leave the red lead in 10A and measure voltage across the power supply', 'that is a short circuit through the meter: its fuse blows. Always move the lead back to VΩmA.']],
      quiz: [
        { q: '5 V across 1 kΩ gives what current?', options: ['5 A', '5 mA', '0.5 mA'], answer: 1, why: 'I = V / R = 5 / 1000 = 0.005 A.' },
        { q: 'To measure current, the meter goes…', options: ['across the part', 'in series, in the loop', 'anywhere'], answer: 1, why: 'All the current must flow through the meter.' },
        { q: 'If the voltage doubles and R stays the same, the current…', options: ['halves', 'doubles', 'stays the same'], answer: 1, why: 'I = V / R, so I is proportional to V.' },
      ],
    },
    {
      id: 'divider', title: 'Series circuits and the voltage divider', minutes: 12,
      summary: 'In a series circuit the same current flows through every part, and the supply voltage is shared between them in proportion to their resistance.',
      goals: ['Measure voltage across each resistor', 'Predict a divider’s output', 'Change the ratio'],
      build() {
        const { doc, part, wire } = builder();
        const bat = part('battery', 0, 0, { volts: '9' }), r1 = part('resistor', 10, 2, { ohms: 1000 }), r2 = part('resistor', 18, 2, { ohms: 2000 });
        part('dmm', 8, 8, { knob: 'V', ac: false });
        wire(bat('+'), r1('1')); wire(r1('2'), r2('1'), 'orange'); wire(r2('2'), bat('-'), 'black');
        return doc;
      },
      steps: [
        { title: 'Predict', text: 'R1 = 1 kΩ and R2 = 2 kΩ share about 9 V. R2 has two thirds of the resistance, so it should get about two thirds of the voltage: ~6 V. (A real 9 V battery measures a bit more.)' },
        { title: 'Measure across R2', text: 'Connect the meter (V DC) across R2: COM to R2 lead 2, VΩmA to R2 lead 1.', check: c => { const m = c.dmm(); return !!m && m.mode === 'V DC' && Math.abs(m.value) > 5.6 && Math.abs(m.value) < 6.6; }, demo: [{ wire: ['dmm#0:COM', 'resistor#1:2'], color: '#1d1d1b' }, { wire: ['dmm#0:VmA', 'resistor#1:1'] }] },
        { title: 'Measure across R1', text: 'Move the leads across R1. You should see about 3 V — and R1 + R2 adds up to the battery voltage.', check: c => { const m = c.dmm(); return !!m && m.mode === 'V DC' && Math.abs(m.value) > 2.8 && Math.abs(m.value) < 3.4; }, hint: 'Drag the ends of the meter leads to move them; they snap to the nearest pin.', demo: [{ unwire: ['dmm#0:COM', 'resistor#1:2'] }, { unwire: ['dmm#0:VmA', 'resistor#1:1'] }, { wire: ['dmm#0:COM', 'resistor#0:2'], color: '#1d1d1b' }, { wire: ['dmm#0:VmA', 'resistor#0:1'] }] },
        { title: 'Make them equal', text: 'Change R2 to 1 kΩ. Now both resistors get half: measure ~4.6 V across either one.', check: c => { const m = c.dmm(); return Number(c.prop('resistor', 'ohms', 1)) === 1000 && !!m && m.mode === 'V DC' && Math.abs(m.value) > 4.3 && Math.abs(m.value) < 4.9; }, demo: [{ set: 'resistor#1', props: { ohms: 1000 }, say: 'Tap R2 → Selected → 1k' }] },
      ],
      quiz: [
        { q: 'In a series circuit the current through each resistor is…', options: ['the same', 'split between them', 'bigger in the bigger resistor'], answer: 0, why: 'There is only one path, so the same current flows everywhere.' },
        { q: '12 V across 1 kΩ + 3 kΩ in series: voltage across the 3 kΩ?', options: ['3 V', '9 V', '12 V'], answer: 1, why: '3 kΩ is three quarters of 4 kΩ, so it gets three quarters of 12 V.' },
      ],
    },
  ],
};
