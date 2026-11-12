import { describe, expect, it } from 'vitest';
import { simulate } from '@/features/learn/headless';
import { applyAct, type Act } from '@/features/workbench/guide';
import { buildCircuit, type Doc } from '@/features/workbench/model';
import { LEVELS } from './quest';

const level = (id: string) => LEVELS.find(l => l.id === id)!;
function apply(doc: Doc, a: Act) { const net = buildCircuit(doc, 1e-4).net; return applyAct(doc, a, (x, y) => !!net.get(x) && net.get(x) === net.get(y)); }

describe('Spark Quest', () => {
  for (const l of LEVELS) it(`is not won at the start: ${l.id}`, () => expect(l.win(simulate(l.build()), {})).toBe(false));

  for (const l of LEVELS) it(`the Show me demo wins ${l.id}`, () => {
    let doc = l.build(), won = false;
    const mem = {};
    for (const a of l.demo) { doc = apply(doc, a); won ||= l.win(simulate(doc), mem); }
    expect(won).toBe(true);
  });

  it('a switch beside the loop does not win "Light switch"', () => {
    const l = level('light-switch'), mem = {};
    let doc = l.build();
    for (const a of [{ add: 'spst', x: 7, y: -2 }, { wire: ['battery#0:+', 'lamp#0:1'] }, { set: 'spst#0', props: { on: true } }, { set: 'spst#0', props: { on: false } }] as Act[]) { doc = apply(doc, a); expect(l.win(simulate(doc), mem)).toBe(false); }
    expect(l.nudge!(simulate(doc))).toMatch(/in the loop/);
  });

  it('two bulbs side by side (parallel) do not win "Two bulbs"', () => {
    const l = level('two-bulbs');
    let doc = l.build();
    for (const a of [{ add: 'lamp', x: 18, y: 0 }, { wire: ['lamp#0:2', 'battery#0:-'] }, { wire: ['lamp#1:1', 'lamp#0:1'] }, { wire: ['lamp#1:2', 'lamp#0:2'] }] as Act[]) doc = apply(doc, a);
    const c = simulate(doc);
    expect(l.win(c, {})).toBe(false);
    expect(l.nudge!(c)).toMatch(/Both bright/);
  });
});
