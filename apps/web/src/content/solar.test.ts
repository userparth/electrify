import { describe, expect, it } from 'vitest';
import { playLesson } from '@/features/learn/headless';
import type { Doc } from '@/features/workbench/model';
import { solar } from './solar';

const L = (id: string) => solar.lessons.find(l => l.id === id)!;
const one = (doc: Doc, type: string, n = 0) => doc.parts.filter(p => p.type === type)[n]!;
const pin = (doc: Doc, type: string, p: string, n = 0) => `${one(doc, type, n).id}:${p}`;
const wire = (doc: Doc, a: string, b: string) => doc.wires.push({ id: `t${doc.wires.length}${Math.random()}`, a, b, color: '#d6452f' });
const unwire = (doc: Doc, key: string) => { doc.wires = doc.wires.filter(w => w.a !== key && w.b !== key); };
const run = (id: string, solve: (((d: Doc) => void) | undefined)[]) => expect(playLesson(L(id), solve, 0.5)).toBe(-1);

describe('solar module', () => {
  it('checks are not vacuous: doing nothing fails at the first checked step', () => {
    for (const l of solar.lessons) expect(playLesson(l, [], 0.5), l.id).toBe(l.steps.findIndex(s => s.check));
  });

  it('full setup', () => run('full-setup', [
    d => { wire(d, pin(d, 'solar', '+'), pin(d, 'charge-controller', 'PV+')); wire(d, pin(d, 'solar', '-'), pin(d, 'charge-controller', 'PV-')); },
    d => {
      unwire(d, pin(d, 'solar', '+')); unwire(d, pin(d, 'solar', '-'));
      wire(d, pin(d, 'battery', '+'), pin(d, 'fuse', '1')); wire(d, pin(d, 'fuse', '2'), pin(d, 'charge-controller', 'BAT+')); wire(d, pin(d, 'battery', '-'), pin(d, 'charge-controller', 'BAT-'));
    },
    d => { wire(d, pin(d, 'solar', '+'), pin(d, 'charge-controller', 'PV+')); wire(d, pin(d, 'solar', '-'), pin(d, 'charge-controller', 'PV-')); },
    d => { wire(d, pin(d, 'charge-controller', 'LOAD+'), pin(d, 'dc-fan', '+')); wire(d, pin(d, 'charge-controller', 'LOAD-'), pin(d, 'dc-fan', '-')); },
  ]));

  it('panel', () => run('panel', [
    d => { wire(d, pin(d, 'dmm', 'VmA'), pin(d, 'solar', '+')); wire(d, pin(d, 'dmm', 'COM'), pin(d, 'solar', '-')); },
    d => { unwire(d, pin(d, 'dmm', 'VmA')); one(d, 'dmm').props.knob = 'A'; one(d, 'dmm').props.ac = false; wire(d, pin(d, 'dmm', '10A'), pin(d, 'solar', '+')); },
    d => { one(d, 'solar').props.sun = 50; },
  ]));

  it('monitor', () => run('monitor', [
    undefined,
    d => { wire(d, pin(d, 'dmm', 'VmA'), pin(d, 'resistor', '2')); wire(d, pin(d, 'dmm', 'COM'), pin(d, 'resistor', '1')); },
    d => { wire(d, pin(d, 'dc-fan', '+', 1), pin(d, 'dc-fan', '+', 0)); wire(d, pin(d, 'dc-fan', '-', 1), pin(d, 'dc-fan', '-', 0)); },
  ]));

  it('second panel', () => run('second-panel', [
    undefined,
    d => { wire(d, pin(d, 'solar', '+', 1), pin(d, 'charge-controller', 'PV+')); wire(d, pin(d, 'solar', '-', 1), pin(d, 'charge-controller', 'PV-')); },
    d => { one(d, 'solar', 1).props.sun = 20; },
    d => {
      one(d, 'solar', 1).props.sun = 90;
      unwire(d, pin(d, 'solar', '-', 0)); unwire(d, pin(d, 'solar', '+', 1));
      wire(d, pin(d, 'solar', '-', 0), pin(d, 'solar', '+', 1));
    },
  ]));

  it('second panel: a shorted panel does not pass the series step', () => {
    const solve = [undefined, (d: Doc) => { wire(d, pin(d, 'solar', '+', 1), pin(d, 'charge-controller', 'PV+')); wire(d, pin(d, 'solar', '-', 1), pin(d, 'charge-controller', 'PV-')); }, (d: Doc) => { one(d, 'solar', 1).props.sun = 20; },
      (d: Doc) => { one(d, 'solar', 1).props.sun = 90; unwire(d, pin(d, 'solar', '-', 0)); wire(d, pin(d, 'solar', '-', 0), pin(d, 'solar', '+', 1)); }];
    expect(playLesson(L('second-panel'), solve, 0.5)).toBe(3);
  });

  it('controller', () => run('controller', [
    d => { one(d, 'charge-controller').props.lvdOff = false; },
    d => { one(d, 'psu').props.volts = 11.8; },
    d => { one(d, 'psu').props.volts = 12.7; },
    d => { one(d, 'charge-controller').props.lvdOff = true; one(d, 'psu').props.volts = 11; },
    d => { one(d, 'psu').props.volts = 10.6; },
  ]));

  it('state of charge', () => run('state-of-charge', [
    d => { one(d, 'dmm').props.ac = false; },
    d => { wire(d, pin(d, 'dmm', 'VmA'), pin(d, 'psu', '+')); wire(d, pin(d, 'dmm', 'COM'), pin(d, 'psu', '-')); },
    d => { one(d, 'psu').props.volts = 12.2; },
    d => { one(d, 'psu').props.volts = 11.9; },
  ]));

  it('meter safety', () => run('meter-safety', [
    d => { wire(d, pin(d, 'dmm', 'VmA'), pin(d, 'battery', '+')); wire(d, pin(d, 'dmm', 'COM'), pin(d, 'battery', '-')); },
    d => { unwire(d, pin(d, 'dmm', 'VmA')); wire(d, pin(d, 'dmm', '10A'), pin(d, 'battery', '+')); },
    d => { unwire(d, pin(d, 'dmm', '10A')); one(d, 'dmm').props.fuseFix = 1; wire(d, pin(d, 'dmm', 'VmA'), pin(d, 'battery', '+')); },
  ]));

  it('fuse', () => run('fuse', [
    undefined,
    d => wire(d, pin(d, 'fuse', '2'), pin(d, 'battery', '-')),
    d => { d.wires = d.wires.filter(w => !(w.a === pin(d, 'fuse', '2') && w.b === pin(d, 'battery', '-'))); one(d, 'fuse').props.rating = '2'; },
  ]));

  it('router', () => run('router', [
    d => { wire(d, pin(d, 'charge-controller', 'LOAD+'), pin(d, 'dcdc-module', 'IN+')); wire(d, pin(d, 'charge-controller', 'LOAD-'), pin(d, 'dcdc-module', 'IN-')); },
    d => { wire(d, pin(d, 'dcdc-module', 'OUT+'), pin(d, 'router', 'C')); wire(d, pin(d, 'dcdc-module', 'OUT-'), pin(d, 'router', 'S')); },
    d => { one(d, 'charge-controller').props.load = false; },
  ]));

  it('inverter', () => run('inverter', [
    d => wire(d, pin(d, 'fuse', '2'), pin(d, 'inverter', 'DC+')),
    d => { one(d, 'inverter').props.watts = 50; },
    d => { one(d, 'inverter').props.watts = 350; },
  ]));
});
