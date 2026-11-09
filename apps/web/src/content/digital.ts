import { builder } from '@/features/workbench/examples';
import type { Check, Module } from '@/features/learn/types';

const out = (c: Check, type: string, pin: number, n = 0) => c.read(type, `o${pin}`, n);
const freq = (c: Check) => Number(c.read('logic-analyzer', 'freq') ?? 0);
const ledOn = (c: Check, n: number) => Number(c.read('led', 'glow', n) ?? 0) > 0.2;
const sw = (c: Check, n: number) => c.prop('logic-switch', 'on', n) === true;
const lit = (c: Check) => ['a', 'b', 'c', 'd', 'e', 'f', 'g'].filter(k => Number(c.read('seven-segment', k) ?? 0) > 0.15).join('');
const code = (c: Check) => [0, 1, 2, 3].reduce((acc, i) => acc + (sw(c, i) ? 8 >> i : 0), 0);

export const digital: Module = {
  id: 'digital', title: 'Digital electronics: logic, clocks and counters', level: 'School & college',
  blurb: 'HIGH and LOW, logic gates, the 555 clock, flip-flops, counters and shift registers — on real 74-series chips.',
  lessons: [
    {
      id: 'logic-levels', title: 'HIGH, LOW and the logic probe', minutes: 10,
      summary: 'Digital circuits only care about two levels: HIGH (near the supply voltage) and LOW (near 0 V). A logic probe tells you which one a pin is at.',
      goals: ['Power a logic probe from the circuit', 'Read HIGH and LOW', 'See what a switch output does'],
      build() {
        const { doc, part, wire } = builder();
        const bat = part('battery', 0, 0, { volts: '3' }), sw = part('logic-switch', 12, 8, { on: false });
        part('logic-probe', 22, 14);
        wire(sw('VCC'), bat('+')); wire(sw('GND'), bat('-'), 'black');
        return doc;
      },
      steps: [
        { title: 'Power the probe', text: 'A logic probe judges HIGH and LOW relative to the circuit’s own supply. Clip its red VCC lead to battery + and its black GND lead to battery −.', check: c => c.read('logic-probe', 'powered') === true, hint: 'Drag from the probe’s VCC pin to the battery + terminal, and from GND to −.' },
        { title: 'Probe the switch', text: 'Touch the probe tip (TIP) to the switch’s OUT pin. The switch is at LOW, so the LO light comes on.', check: c => c.joined(c.pin('logic-probe', 'TIP'), c.pin('logic-switch', 'OUT')) && c.read('logic-probe', 'low') === true },
        { title: 'Flip it HIGH', text: 'Click the switch (or tick HIGH in its settings). The probe should show HI. Flip it a few times and watch PLS (pulse) blink too.', check: c => c.read('logic-probe', 'high') === true },
      ],
      tryIt: [['Unclip the probe’s GND lead', 'it can’t tell HIGH from LOW any more — every measurement needs a reference.'], ['Touch the tip to nothing', 'neither HI nor LO lights: a floating pin is not a valid logic level.']],
      quiz: [
        { q: 'On a 3 V circuit, which is a clean HIGH?', options: ['0.2 V', '1.5 V', '2.9 V'], answer: 2, why: 'HIGH is close to the supply; 1.5 V is in the undefined middle.' },
        { q: 'Why does the probe need VCC and GND?', options: ['To light its LEDs and to know what HIGH means here', 'It doesn’t', 'To make the circuit work'], answer: 0, why: 'HIGH/LOW are fractions of the supply, so the probe must see the supply.' },
      ],
    },
    {
      id: 'gates', title: 'Logic gates and truth tables', minutes: 15,
      summary: 'A gate looks at its inputs and sets its output by a fixed rule. Write the rule as a truth table: every input combination and the output it gives.',
      goals: ['Wire an AND gate', 'Fill in its truth table', 'Compare with OR'],
      build() {
        const { doc, part, wire } = builder();
        const bat = part('battery', 0, 0, { volts: '3' }), and = part('74hc08', 14, 10), or = part('74hc32', 28, 10);
        const a = part('logic-switch', 8, 16), b = part('logic-switch', 14, 16), r = part('resistor', 22, 3, { ohms: 100 }), led = part('led', 28, 3, { color: 'red' });
        for (const ic of [and, or]) { wire(bat('+'), ic('14')); wire(bat('-'), ic('7'), 'black'); }
        for (const s of [a, b]) { wire(s('VCC'), bat('+')); wire(s('GND'), bat('-'), 'black'); }
        wire(a('OUT'), and('1'), 'yellow'); wire(b('OUT'), and('2'), 'yellow');
        wire(and('3'), r('1'), 'blue'); wire(r('2'), led('A'), 'blue'); wire(led('K'), bat('-'), 'black');
        return doc;
      },
      steps: [
        { title: 'A = 1, B = 0', text: 'The left switch is input A, the right one is B. Set A HIGH and B LOW. The AND gate’s LED stays off: AND needs both.', check: c => c.prop('logic-switch', 'on', 0) === true && c.prop('logic-switch', 'on', 1) === false && out(c, '74hc08', 3) === 0 },
        { title: 'A = 1, B = 1', text: 'Now set B HIGH too. Only now does the AND output go HIGH and the LED light.', check: c => c.prop('logic-switch', 'on', 0) === true && c.prop('logic-switch', 'on', 1) === true && c.glow() > 0.2 },
        { title: 'Switch to OR', text: 'Move the two switch wires to the 74HC32 (pins 1 and 2) and the resistor wire to its pin 3. Then set only one switch HIGH: OR lights the LED when either input is HIGH.', check: c => c.joined(c.pin('logic-switch', 'OUT', 0), c.pin('74hc32', '1')) && c.joined(c.pin('logic-switch', 'OUT', 1), c.pin('74hc32', '2')) && c.joined(c.pin('resistor', '1'), c.pin('74hc32', '3')) && c.prop('logic-switch', 'on', 0) !== c.prop('logic-switch', 'on', 1) && c.glow() > 0.2, hint: 'Drag the end of each yellow wire from the 74HC08 pin to the same pin number on the 74HC32. Pin 1 is next to the notch.' },
      ],
      tryIt: [['Remove a chip’s VCC wire', 'the outputs stop driving: a chip with no power does nothing.'], ['Take a switch wire off an input', 'a floating CMOS input can read HIGH or LOW at random — always tie unused inputs.']],
      quiz: [
        { q: 'AND output is HIGH when…', options: ['any input is HIGH', 'all inputs are HIGH', 'inputs are different'], answer: 1, why: 'AND = all of them.' },
        { q: 'OR output is LOW when…', options: ['both inputs are LOW', 'one input is LOW', 'never'], answer: 0, why: 'OR is HIGH if any input is HIGH, so it is LOW only when none are.' },
        { q: 'How many rows does a 2-input truth table have?', options: ['2', '4', '8'], answer: 1, why: '2 inputs × 2 levels each = 4 combinations.' },
      ],
    },
    {
      id: 'nand-universal', title: 'NAND can build anything', minutes: 15,
      summary: 'NAND is AND followed by NOT. With nothing but NAND gates you can make NOT, AND, OR — any logic at all. That is why it is called a universal gate.',
      goals: ['See NAND’s truth table', 'Make NOT from a NAND', 'Make AND from two NANDs'],
      build() {
        const { doc, part, wire } = builder();
        const bat = part('battery', 0, 0, { volts: '3' }), ic = part('74hc00', 14, 10);
        const a = part('logic-switch', 8, 16), b = part('logic-switch', 14, 16), r = part('resistor', 22, 3, { ohms: 100 }), led = part('led', 28, 3, { color: 'green' });
        wire(bat('+'), ic('14')); wire(bat('-'), ic('7'), 'black');
        for (const s of [a, b]) { wire(s('VCC'), bat('+')); wire(s('GND'), bat('-'), 'black'); }
        wire(a('OUT'), ic('1'), 'yellow'); wire(b('OUT'), ic('2'), 'yellow');
        wire(ic('3'), r('1'), 'blue'); wire(r('2'), led('A'), 'blue'); wire(led('K'), bat('-'), 'black');
        return doc;
      },
      steps: [
        { title: 'NAND’s odd row', text: 'With both switches LOW the LED is on. Set both switches HIGH: NAND is the only combination that gives LOW.', check: c => c.prop('logic-switch', 'on', 0) === true && c.prop('logic-switch', 'on', 1) === true && c.glow() < 0.05 },
        { title: 'Make a NOT', text: 'Tie both inputs of gate 2 (pins 4 and 5) to switch A, and move the resistor wire to gate 2’s output (pin 6). A NAND with its inputs joined is an inverter: A HIGH → LED off, A LOW → LED on.', check: c => c.joined(c.pin('74hc00', '4'), c.pin('logic-switch', 'OUT', 0)) && c.joined(c.pin('74hc00', '5'), c.pin('logic-switch', 'OUT', 0)) && c.joined(c.pin('resistor', '1'), c.pin('74hc00', '6')) && (c.prop('logic-switch', 'on', 0) === true ? c.glow() < 0.05 : c.glow() > 0.2) },
        { title: 'Make an AND', text: 'Feed gate 1’s output (pin 3) into both inputs of gate 2 (pins 4 and 5) instead (remove switch A’s wires from pins 4 and 5), with A and B on gate 1 (pins 1 and 2). NAND then NOT = AND: the LED lights only when both switches are HIGH.', check: c => c.joined(c.pin('74hc00', '3'), c.pin('74hc00', '4')) && c.joined(c.pin('74hc00', '3'), c.pin('74hc00', '5')) && !c.joined(c.pin('74hc00', '4'), c.pin('logic-switch', 'OUT', 0)) && c.joined(c.pin('logic-switch', 'OUT', 0), c.pin('74hc00', '1')) && c.joined(c.pin('logic-switch', 'OUT', 1), c.pin('74hc00', '2')) && c.joined(c.pin('resistor', '1'), c.pin('74hc00', '6')) && c.prop('logic-switch', 'on', 0) === true && c.prop('logic-switch', 'on', 1) === true && c.glow() > 0.2, hint: 'Pin 3 → pin 4, pin 3 → pin 5 (Shift-drag to start a second wire from pin 3). Switch A → pin 1, switch B → pin 2.' },
      ],
      tryIt: [['Leave gate 2’s pin 5 unconnected', 'the inverter misbehaves: every gate input must go somewhere.']],
      quiz: [
        { q: 'NAND gives LOW only when…', options: ['both inputs are HIGH', 'both are LOW', 'they differ'], answer: 0, why: 'It is NOT(AND): the AND row that is HIGH becomes the only LOW.' },
        { q: 'NAND with both inputs tied together acts as…', options: ['a buffer', 'NOT', 'OR'], answer: 1, why: 'A NAND A = NOT A.' },
        { q: 'How many NAND gates make an AND?', options: ['1', '2', '4'], answer: 1, why: 'One NAND, then one NAND wired as NOT.' },
      ],
    },
    {
      id: '555-clock', title: 'The 555 clock', minutes: 15, dt: 1e-5,
      summary: 'A 555 in astable mode charges a capacitor through R1 + R2 and discharges it through R2, again and again. Its output is a square wave at f ≈ 1.44 / ((R1 + 2·R2) · C).',
      goals: ['Watch a 555 oscillate', 'Change the frequency with R2', 'Change it with C'],
      build() {
        const { doc, part, wire } = builder();
        const bat = part('battery', 0, 0, { volts: '9' }), ic = part('ne555', 14, 12);
        const r1 = part('resistor', 22, 2, { ohms: 1000 }), r2 = part('resistor', 22, 6, { ohms: 10000 });
        const c = part('cap-ceramic', 10, 18, { farads: 1e-6 }), c5 = part('cap-ceramic', 20, 18, { farads: 10e-9 });
        const la = part('logic-analyzer', 6, 50, { timeDiv: '0.01', threshold: '2.5' });
        wire(bat('+'), ic('8')); wire(bat('+'), ic('4')); wire(bat('-'), ic('1'), 'black');
        wire(ic('8'), r1('1')); wire(r1('2'), ic('7'), 'orange'); wire(ic('7'), r2('1'), 'orange'); wire(r2('2'), ic('6'), 'yellow');
        wire(ic('6'), ic('2'), 'yellow'); wire(ic('6'), c('1'), 'yellow'); wire(c('2'), bat('-'), 'black');
        wire(ic('5'), c5('1'), 'blue'); wire(c5('2'), bat('-'), 'black');
        wire(la('D0'), ic('3'), 'green'); wire(la('GND'), bat('-'), 'black');
        return doc;
      },
      steps: [
        { title: 'Watch it run', text: 'R1 = 1 kΩ, R2 = 10 kΩ, C = 1 µF gives 1.44 / (21 kΩ × 1 µF) ≈ 69 Hz. The logic analyzer on pin 3 shows the square wave and measures it.', check: c => freq(c) > 55 && freq(c) < 85 },
        { title: 'Faster: smaller R2', text: 'Change R2 to 4.7 kΩ. Now R1 + 2·R2 ≈ 10.4 kΩ, so the frequency roughly doubles to ~140 Hz.', check: c => Number(c.prop('resistor', 'ohms', 1)) < 10000 && freq(c) > 110 && freq(c) < 175 },
        { title: 'Slower: bigger C', text: 'Keep R2 at 4.7 kΩ and change the timing capacitor (the one on pins 2/6) to 2.2 µF. More capacitance takes longer to charge, so the frequency drops to ~63 Hz.', check: c => Number(c.prop('cap-ceramic', 'farads', 0)) > 1.5e-6 && freq(c) > 50 && freq(c) < 80 },
      ],
      tryIt: [['Disconnect pin 4 (RESET) from +', 'a floating or LOW reset stops the 555.'], ['Change C to 100 µF', 'it slows to a visible blink — that is how LED flashers are made.']],
      quiz: [
        { q: 'Doubling C does what to the frequency?', options: ['doubles it', 'halves it', 'nothing'], answer: 1, why: 'f is proportional to 1/C.' },
        { q: 'Which pins are tied together in astable mode?', options: ['2 and 6', '3 and 7', '1 and 8'], answer: 0, why: 'TRIGGER (2) and THRESHOLD (6) both watch the capacitor voltage.' },
      ],
    },
    {
      id: 'adder', title: 'Adding in binary: the half adder', minutes: 15,
      summary: 'Adding two bits gives a sum bit and a carry bit: 0+0 = 00, 0+1 = 01, 1+1 = 10. The sum is XOR of the inputs and the carry is AND. Chain these and you get the 74HC283, which adds whole 4-bit numbers.',
      goals: ['See XOR make the sum bit', 'Build the carry with AND', 'Add 1 + 1 in binary'],
      build() {
        const { doc, part, wire } = builder();
        const bat = part('battery', 0, 0, { volts: '3' }), xor = part('74hc86', 14, 10), and = part('74hc08', 28, 10);
        const a = part('logic-switch', 8, 16), b = part('logic-switch', 14, 16);
        const r1 = part('resistor', 16, 2, { ohms: 100 }), sum = part('led', 22, 2, { color: 'green' });
        const r2 = part('resistor', 30, 2, { ohms: 100 }), carry = part('led', 36, 2, { color: 'red' });
        for (const ic of [xor, and]) { wire(bat('+'), ic('14')); wire(bat('-'), ic('7'), 'black'); }
        for (const s of [a, b]) { wire(s('VCC'), bat('+')); wire(s('GND'), bat('-'), 'black'); }
        wire(a('OUT'), xor('1'), 'yellow'); wire(b('OUT'), xor('2'), 'yellow');
        wire(xor('3'), r1('1'), 'blue'); wire(r1('2'), sum('A'), 'blue'); wire(sum('K'), bat('-'), 'black');
        wire(r2('2'), carry('A'), 'blue'); wire(carry('K'), bat('-'), 'black');
        return doc;
      },
      steps: [
        { title: '1 + 0 = 1', text: 'Switch A (left) and B feed a 74HC86 XOR gate whose output drives the green SUM LED. Set A HIGH and B LOW: one plus nothing is one, so SUM lights.', check: c => sw(c, 0) && !sw(c, 1) && ledOn(c, 0) },
        { title: 'Build the carry', text: 'The carry is HIGH only when both bits are 1 — that is an AND gate. Wire switch A → 74HC08 pin 1, switch B → pin 2, and pin 3 → the red CARRY LED’s resistor.', check: c => c.joined(c.pin('logic-switch', 'OUT', 0), c.pin('74hc08', '1')) && c.joined(c.pin('logic-switch', 'OUT', 1), c.pin('74hc08', '2')) && c.joined(c.pin('74hc08', '3'), c.pin('resistor', '1', 1)), hint: 'Shift-drag from a switch OUT pin to start a second wire from it.' },
        { title: '1 + 1 = 10', text: 'Set both switches HIGH. SUM goes out and CARRY lights: the answer is binary 10, which is two. You just built a half adder.', check: c => sw(c, 0) && sw(c, 1) && !ledOn(c, 0) && ledOn(c, 1) },
      ],
      tryIt: [['Set both switches LOW', '0 + 0 = 00: both LEDs off.'], ['Swap the XOR for an OR (74HC32)', '1 + 1 would light SUM as well — wrong! OR is not the same as XOR.']],
      quiz: [
        { q: 'Which gate gives the sum bit of a half adder?', options: ['AND', 'OR', 'XOR'], answer: 2, why: 'The sum is 1 when exactly one input is 1 — that is XOR.' },
        { q: '1 + 1 in binary is…', options: ['2', '10', '11'], answer: 1, why: 'Sum 0, carry 1: “one-zero”, which means two.' },
        { q: 'A 74HC283 adds 0111 + 0101. The answer is…', options: ['1100', '1010', '0010'], answer: 0, why: '7 + 5 = 12 = 1100 in binary.' },
      ],
    },
    {
      id: 'seven-seg', title: 'Show a digit: the CD4511 decoder', minutes: 15,
      summary: 'A 7-segment display needs the right 7 segments for each digit. The CD4511 does that for you: give it a 4-bit BCD number (0–9) and it lights the matching segments of a common-cathode display.',
      goals: ['Power the decoder and tie its control pins', 'Set a BCD number with switches', 'See what happens above 9'],
      build() {
        const { doc, part, wire } = builder();
        const psu = part('psu', 0, 0, { volts: 5, limit: 0.5 }), ic = part('cd4511', 16, 14), disp = part('seven-segment', 40, 10, { common: 'cathode' });
        const segs: [string, string, string][] = [['a', '13', '7'], ['b', '12', '6'], ['c', '11', '4'], ['d', '10', '2'], ['e', '9', '1'], ['f', '15', '9'], ['g', '14', '10']];
        segs.forEach(([, from, to], i) => { const r = part('resistor', 28, i * 2 - 2, { ohms: 220 }); wire(ic(from), r('1'), 'blue'); wire(r('2'), disp(to), 'blue'); });
        wire(disp('3'), psu('-'), 'black');
        ['6', '2', '1', '7'].forEach((pin, i) => {
          const s = part('logic-switch', 6 + i * 5, 20);
          wire(s('VCC'), psu('+')); wire(s('GND'), psu('-'), 'black'); wire(s('OUT'), ic(pin), 'yellow');
        });
        return doc;
      },
      steps: [
        { title: 'Power and tie it up', text: 'The four switches are D C B A (D on the left is worth 8, A is worth 1). Wire VDD (16) to PSU +, VSS (8) to PSU −. Then tie LT̅ (3) and BI̅ (4) to + and LE (5) to −. With all switches LOW the display shows 0.', check: c => c.joined(c.pin('cd4511', '16'), c.pin('psu', '+')) && c.joined(c.pin('cd4511', '8'), c.pin('psu', '-')) && c.joined(c.pin('cd4511', '3'), c.pin('psu', '+')) && c.joined(c.pin('cd4511', '4'), c.pin('psu', '+')) && c.joined(c.pin('cd4511', '5'), c.pin('psu', '-')) && lit(c) === 'abcdef', hint: 'Select the chip to see its pin names; pin 1 is next to the notch.' },
        { title: 'Show 5', text: 'Five is 0101 in binary: set C and A HIGH, D and B LOW.', check: c => code(c) === 5 && lit(c) === 'acdfg' },
        { title: 'Show 9', text: 'Nine is 1001: D and A HIGH.', check: c => code(c) === 9 && lit(c) === 'abcfg' },
        { title: 'Past 9', text: 'BCD only goes to 9. Set 1100 (twelve): the CD4511 blanks the display instead of showing nonsense.', check: c => code(c) === 12 && lit(c) === '' },
      ],
      tryIt: [['Set LT̅ (pin 3) LOW', 'every segment lights: the lamp test checks that no segment is dead.'], ['Wire LE (pin 5) HIGH, then change the switches', 'the digit stays frozen: LE latches the number.']],
      quiz: [
        { q: 'BCD 0111 is the digit…', options: ['7', '11', '3'], answer: 0, why: '4 + 2 + 1 = 7.' },
        { q: 'The CD4511 drives which kind of display?', options: ['Common cathode', 'Common anode', 'Either'], answer: 0, why: 'Its outputs go HIGH to light a segment, so the common pin goes to 0 V. (The 74LS47 is for common anode.)' },
        { q: 'Why one resistor per segment, not one shared?', options: ['The brightness would change with the number of lit segments', 'Shared is fine', 'To save power'], answer: 0, why: 'A shared resistor splits its current between however many segments are on.' },
      ],
    },
    {
      id: 'flip-flop', title: 'Flip-flops: memory and divide-by-2', minutes: 15,
      summary: 'A D flip-flop remembers one bit. On each rising clock edge, Q copies D. Feed Q̅ back into D and it toggles every clock — the output is half the clock frequency.',
      goals: ['Power a 74HC74', 'Release PRE and CLR', 'Build a divide-by-2'],
      build() {
        const { doc, part, wire } = builder();
        const bat = part('battery', 0, 0, { volts: '3' }), g = part('fgen', 8, -14, { shape: 'square', freq: 100, amplitude: 3, offset: 1.5 });
        const ic = part('74hc74', 30, 10), la = part('logic-analyzer', 10, 45, { timeDiv: '0.01' });
        wire(g('OUT'), ic('3'), 'yellow'); wire(g('COM'), bat('-'), 'black');
        wire(la('D0'), ic('5'), 'green'); wire(la('D1'), ic('3'), 'yellow'); wire(la('GND'), bat('-'), 'black');
        return doc;
      },
      steps: [
        { title: 'Power the chip', text: 'Wire pin 14 (VCC) to battery + and pin 7 (GND) to battery −.', check: c => c.read('74hc74', 'powered') === true },
        { title: 'Release PRE and CLR', text: 'PRE (pin 4) and CLR (pin 1) are active LOW: while they float LOW, Q and Q̅ are both forced HIGH. Tie both to VCC.', check: c => c.joined(c.pin('74hc74', '1'), c.pin('74hc74', '14')) && c.joined(c.pin('74hc74', '4'), c.pin('74hc74', '14')) && out(c, '74hc74', 5) !== out(c, '74hc74', 6) },
        { title: 'Divide by 2', text: 'Wire Q̅ (pin 6) to D (pin 2). Each clock edge now flips Q. On the analyzer, D0 (Q) runs at half the clock on D1: 100 Hz in, 50 Hz out.', check: c => c.joined(c.pin('74hc74', '6'), c.pin('74hc74', '2')) && freq(c) > 40 && freq(c) < 60 },
      ],
      tryIt: [['Leave PRE floating', 'Q and Q̅ are both HIGH and nothing changes — the chip is held in preset.'], ['Chain the second flip-flop from Q', 'you get ÷4: that is the start of a binary counter.']],
      quiz: [
        { q: 'When does a 74HC74 copy D into Q?', options: ['whenever D changes', 'on the rising clock edge', 'when CLK is LOW'], answer: 1, why: 'It is edge-triggered: only the moment the clock rises.' },
        { q: '1 kHz into a ÷2 flip-flop gives…', options: ['2 kHz', '500 Hz', '1 kHz'], answer: 1, why: 'It toggles once per clock, so one full output cycle takes two clocks.' },
      ],
    },
    {
      id: 'counter', title: 'Counting with the CD4017', minutes: 15,
      summary: 'The CD4017 moves a single HIGH along ten outputs, one step per clock: the classic LED chaser. Its carry-out (CO) runs at one tenth of the clock.',
      goals: ['Power a CMOS counter', 'Enable it', 'Measure the ÷10 carry output'],
      build() {
        const { doc, part, wire } = builder();
        const bat = part('battery', 0, 0, { volts: '9' }), g = part('fgen', 8, -14, { shape: 'square', freq: 200, amplitude: 9, offset: 4.5 });
        const ic = part('cd4017', 30, 10), la = part('logic-analyzer', 10, 45, { timeDiv: '0.02', threshold: '2.5' });
        const pins = ['3', '2', '4', '7'];
        pins.forEach((p, k) => { const r = part('resistor', 44 + k * 6, 2, { ohms: 1000 }), led = part('led', 44 + k * 6, 6, { color: 'red' }); wire(ic(p), r('1'), 'orange'); wire(r('2'), led('A'), 'orange'); wire(led('K'), bat('-'), 'black'); });
        wire(g('OUT'), ic('14'), 'yellow'); wire(g('COM'), bat('-'), 'black');
        wire(la('D0'), ic('12'), 'green'); wire(la('GND'), bat('-'), 'black');
        return doc;
      },
      steps: [
        { title: 'Power it', text: 'The CD4017 uses VDD (pin 16) for + and VSS (pin 8) for 0 V. Wire them to the battery.', check: c => c.read('cd4017', 'powered') === true },
        { title: 'Enable counting', text: 'Tie CLK INH (pin 13) and RST (pin 15) to VSS. Now each clock edge moves the HIGH to the next output, and CO (pin 12) goes up and down once every ten clocks: 200 Hz in, 20 Hz on the analyzer.', check: c => c.joined(c.pin('cd4017', '13'), c.pin('cd4017', '8')) && c.joined(c.pin('cd4017', '15'), c.pin('cd4017', '8')) && freq(c) > 15 && freq(c) < 25, hint: 'RST HIGH holds the counter at Q0; CLK INH HIGH ignores the clock.' },
        { title: 'Slow it down', text: 'Set the function generator to 2 Hz and watch the four LEDs chase one after another.', check: c => Number(c.prop('fgen', 'freq')) <= 5 },
      ],
      tryIt: [['Leave RST floating', 'the counter may reset at random — CMOS inputs must never float.'], ['Wire Q4 (pin 10) to RST', 'it counts 0–3 only: a ÷4 counter.']],
      quiz: [
        { q: 'How many CD4017 outputs are HIGH at once?', options: ['one', 'all', 'it depends on the count'], answer: 0, why: 'It is a one-hot counter: exactly one Q is HIGH.' },
        { q: 'With a 100 Hz clock, CO runs at…', options: ['100 Hz', '10 Hz', '1 kHz'], answer: 1, why: 'CO completes one cycle per ten clocks.' },
      ],
    },
    {
      id: 'shift-register', title: 'Shift register: 8 outputs from 3 wires', minutes: 15,
      summary: 'A 74HC595 takes bits one at a time on SER, shifts them along on each SRCLK edge, and shows all eight on QA–QH when RCLK pulses. Microcontrollers use it to drive many LEDs from few pins.',
      goals: ['Power and enable a 74HC595', 'Shift in 1s', 'Shift in 0s'],
      build() {
        const { doc, part, wire } = builder();
        const bat = part('battery', 0, 0, { volts: '3' }), g = part('fgen', 8, -14, { shape: 'square', freq: 200, amplitude: 3, offset: 1.5 });
        const ic = part('74hc595', 30, 10);
        ['15', '1', '2', '3'].forEach((p, k) => { const r = part('resistor', 44 + k * 6, 2, { ohms: 220 }), led = part('led', 44 + k * 6, 6, { color: 'yellow' }); wire(ic(p), r('1'), 'orange'); wire(r('2'), led('A'), 'orange'); wire(led('K'), bat('-'), 'black'); });
        wire(g('OUT'), ic('11'), 'yellow'); wire(ic('11'), ic('12'), 'yellow'); wire(g('COM'), bat('-'), 'black');
        return doc;
      },
      steps: [
        { title: 'Power and enable', text: 'Wire VCC (pin 16) to + and GND (pin 8) to −. Then tie SRCLR (pin 10) to VCC so it isn’t cleared, and OE (pin 13) to GND so the outputs are switched on.', check: c => c.read('74hc595', 'powered') === true && c.joined(c.pin('74hc595', '10'), c.pin('74hc595', '16')) && c.joined(c.pin('74hc595', '13'), c.pin('74hc595', '8')) },
        { title: 'Shift in 1s', text: 'The clock already drives SRCLK (11) and RCLK (12). Wire SER (pin 14) to VCC: each clock pushes a 1 in, and after eight clocks QA–QH are all HIGH.', check: c => c.joined(c.pin('74hc595', '14'), c.pin('74hc595', '16')) && out(c, '74hc595', 15) === 1 && out(c, '74hc595', 7) === 1 },
        { title: 'Shift in 0s', text: 'Move SER to GND. Zeros march in: the LEDs go out one after another.', check: c => c.joined(c.pin('74hc595', '14'), c.pin('74hc595', '8')) && out(c, '74hc595', 15) === 0 && out(c, '74hc595', 7) === 0 },
      ],
      tryIt: [['Tie OE (13) HIGH', 'all outputs go high-impedance and the LEDs go dark, whatever is stored.'], ['Set the clock to 1 Hz', 'watch each bit walk from QA to QH.']],
      quiz: [
        { q: 'Which pin makes the stored bits appear on QA–QH?', options: ['SRCLK', 'RCLK (latch)', 'SER'], answer: 1, why: 'SRCLK shifts inside; RCLK copies the shifted byte to the outputs.' },
        { q: 'How many clock pulses load a full byte?', options: ['1', '8', '16'], answer: 1, why: 'One bit per SRCLK edge.' },
        { q: 'How do you get 16 outputs?', options: ['Use two 595s, QH′ into the next SER', 'Clock it twice as fast', 'You can’t'], answer: 0, why: 'QH′ carries the bit falling off the end into the next chip.' },
      ],
    },
  ],
};
