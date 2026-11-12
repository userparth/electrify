import { builder } from '@/features/workbench/examples';
import type { Act } from '@/features/workbench/guide';
import type { Doc } from '@/features/workbench/model';
import type { Check } from '@/features/learn/types';

export interface Level {
  id: string;
  title: string;
  /** The one idea this level teaches, shown when it is won. */
  idea: string;
  /** Picture of the goal: emoji, big. */
  icon: string;
  goal: string;
  /** Parts the student may add; the tray shows only these. */
  tray: string[];
  build(): Doc;
  /** `mem` lives for one attempt, for goals that need two moments (on, then off). */
  win(c: Check, mem: Record<string, boolean>): boolean;
  /** A friendly nudge when the circuit is close but not right. */
  nudge?(c: Check): string | null;
  hints: string[];
  demo: Act[];
}

/** Levels written but not built yet, shown locked on the map. */
export const COMING: [string, string][] = [
  ['💡💡', 'Make them bright'], ['↔️', 'Which way?'], ['🛡️', 'Save the LED'], ['🔔', 'Doorbell'], ['🌀', 'Fan'],
  ['🎚️', 'Brighter, dimmer'], ['🌙', 'Night lamp'], ['🧩', 'Meet the breadboard'], ['👑', 'Boss level'],
];

const glow = (c: Check, n = 0) => Number(c.read('lamp', 'glow', n) ?? 0);

export const LEVELS: Level[] = [
  {
    id: 'close-the-loop', title: 'Close the loop', icon: '💡',
    idea: 'Electricity needs a full loop: out of the battery, through the bulb, and back in. That loop is a circuit.',
    goal: 'Make the bulb glow.',
    tray: [],
    build() {
      const { doc, part } = builder();
      part('battery', 0, 4); part('lamp', 12, 0);
      return doc;
    },
    win: c => glow(c) > 0.2,
    nudge: c => c.doc.wires.length === 1 ? 'One wire is not enough. The electricity has to come back to the battery.' : null,
    hints: ['Join each end of the battery to an end of the bulb.', 'Two wires: battery + to one bulb pin, battery − to the other.'],
    demo: [{ wire: ['battery#0:+', 'lamp#0:1'] }, { wire: ['battery#0:-', 'lamp#0:2'], color: '#1d1d1b' }],
  },
  {
    id: 'light-switch', title: 'Light switch', icon: '🔦',
    idea: 'A switch opens and closes the loop. Open loop: no current, no light.',
    goal: 'Add a switch so you can turn the bulb on and off.',
    tray: ['spst'],
    build() {
      const { doc, part, wire } = builder();
      const bat = part('battery', 0, 4), lamp = part('lamp', 14, 0);
      wire(bat('-'), lamp('2'), 'black');
      return doc;
    },
    win(c, mem) {
      const sw = c.parts('spst').length > 0, on = !!c.prop('spst', 'on');
      if (sw && on && glow(c) > 0.2) mem.lit = true;
      if (sw && mem.lit && !on && glow(c) < 0.02) mem.dark = true;
      return !!(mem.lit && mem.dark);
    },
    nudge(c) {
      if (!c.parts('spst').length) return null;
      if (glow(c) > 0.2 && !c.prop('spst', 'on')) return 'The bulb stays on even with the switch off. Put the switch in the loop, between the battery and the bulb.';
      if (c.prop('spst', 'on') && glow(c) > 0.2) return 'Now tap the switch to turn it off.';
      return null;
    },
    hints: ['The loop is broken at the top. Put the switch in the gap.', 'Wire battery + to one switch pin, and the other switch pin to the bulb. Then tap the switch.'],
    demo: [
      { add: 'spst', x: 7, y: -2 },
      { wire: ['battery#0:+', 'spst#0:1'] }, { wire: ['spst#0:2', 'lamp#0:1'] },
      { set: 'spst#0', props: { on: true }, say: 'Tap the switch: ON' },
      { set: 'spst#0', props: { on: false }, say: 'Tap again: OFF' },
    ],
  },
  {
    id: 'two-bulbs', title: 'Two bulbs, one battery', icon: '💡💡',
    idea: 'In one loop (series), both bulbs share the battery, so each one is dimmer than a single bulb.',
    goal: 'Light both bulbs, with one path through both.',
    tray: ['lamp'],
    build() {
      const { doc, part, wire } = builder();
      const bat = part('battery', 0, 4), lamp = part('lamp', 9, 0);
      wire(bat('+'), lamp('1'));
      return doc;
    },
    win: c => c.parts('lamp').length >= 2 && glow(c, 0) > 0.03 && glow(c, 1) > 0.03 && glow(c, 0) < 0.3 && glow(c, 1) < 0.3,
    nudge(c) {
      if (c.parts('lamp').length < 2) return null;
      if (glow(c, 0) > 0.3 && glow(c, 1) > 0.3) return 'Both bright! That is a different trick (next level). Here, make ONE path: battery → bulb → bulb → battery.';
      if (glow(c, 0) > 0.3 || glow(c, 1) > 0.3) return 'Only one bulb is in the loop. The current must go through both, one after the other.';
      return null;
    },
    hints: ['Chain them: the end of the first bulb goes to the start of the second.', 'Bulb 1 pin 2 → bulb 2 pin 1, then bulb 2 pin 2 → battery −.'],
    demo: [
      { add: 'lamp', x: 18, y: 0 },
      { wire: ['lamp#0:2', 'lamp#1:1'] }, { wire: ['lamp#1:2', 'battery#0:-'], color: '#1d1d1b' },
    ],
  },
];

export const STARS_KEY = 'eb.quest.v1';
export function loadStars(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(STARS_KEY) ?? '{}'); } catch { return {}; }
}
export function saveStars(id: string, stars: number) {
  const all = loadStars();
  if ((all[id] ?? 0) >= stars) return;
  all[id] = stars;
  localStorage.setItem(STARS_KEY, JSON.stringify(all));
}
