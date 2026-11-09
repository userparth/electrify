import { IC7400, IC7402, IC7404, IC7408, IC7432, IC7447, IC7474, IC7486, IC7490, IC74138, LED, Switch, Timer555, type LogicChip } from '@eb/engine';
import { INK, Label, u } from '../draw';
import type { BuildCtx, Live, PartDef, PinDef, RenderArgs } from '../types';

const dipPos = (n: number, k: number) => k <= n / 2 ? { x: k - 1, y: 0 } : { x: n - k, y: -3 };

function dipPins(names: string[]): PinDef[] {
  const n = names.length;
  return names.map((label, i) => ({ id: String(i + 1), label: `${i + 1} · ${label}`, ...dipPos(n, i + 1) }));
}

function nodesFor(ctx: BuildCtx, n: number): number[] {
  return Array.from({ length: n + 1 }, (_, i) => i === 0 ? 0 : ctx.pin(String(i)));
}

function chipLive(chip: LogicChip): Live {
  const live: Live = { powered: chip.powered };
  for (const [pin, o] of chip.out) live[`o${pin}`] = o.level === 'z' ? -1 : o.level;
  return live;
}

function DipBody({ names, title, live, selected, accent = '#2b2d31' }: { names: string[]; title: string; live: Live; selected: boolean; accent?: string }) {
  const n = names.length, half = n / 2, w = half;
  return (
    <g>
      {names.map((_, i) => {
        const p = dipPos(n, i + 1);
        return <rect key={i} x={u(p.x) - 2.5} y={u(p.y) + (p.y === 0 ? -6 : 0)} width={5} height={6} fill="#c9ced2" stroke={INK} strokeWidth={0.6} />;
      })}
      <rect x={u(-0.5)} y={u(-2.55)} width={u(w)} height={u(2.1)} rx={3} fill={accent} stroke={INK} strokeWidth={1.4} />
      <path d={`M${u(-0.5)},${u(-1.95)} A${u(0.45)},${u(0.45)} 0 0 1 ${u(-0.5)},${u(-1.05)}`} fill="#4a4d55" stroke={INK} strokeWidth={0.8} />
      <circle cx={u(0.05)} cy={u(-0.85)} r={1.8} fill="#cfcab8" />
      <Label x={(w - 1) / 2} y={-1.25} size={9} color="#f2efe7">{title}</Label>
      {live.powered === false && <Label x={(w - 1) / 2} y={-3.9} size={8} color="#d6452f">unpowered: wire VCC + GND</Label>}
      {names.map((nm, i) => {
        const p = dipPos(n, i + 1), lv = live[`o${i + 1}`];
        const dot = live.powered && lv != null ? <circle cx={u(p.x)} cy={u(p.y === 0 ? -0.75 : -2.25)} r={1.8} fill={lv === 1 ? '#3fae66' : lv === 0 ? '#d6452f' : '#8a8577'} /> : null;
        return (
          <g key={i}>
            {dot}
            {selected && <text x={u(p.x)} y={p.y === 0 ? u(-0.95) - 1 : u(-2.05) + 5} fontSize={5.5} fill="#f2efe7" textAnchor="middle" fontFamily="ui-monospace,Menlo,monospace" style={{ pointerEvents: 'none' }}>{nm}</text>}
          </g>
        );
      })}
      {selected && names.map((_, i) => { const p = dipPos(n, i + 1); return <text key={`n${i}`} x={u(p.x)} y={p.y === 0 ? u(0.95) : u(-3.55)} fontSize={6} fill="#6b665a" textAnchor="middle" fontFamily="ui-monospace,Menlo,monospace" style={{ pointerEvents: 'none' }}>{i + 1}</text>; })}
    </g>
  );
}

type ChipCtor = new (pins: number[], name?: string) => LogicChip;

function logicChip(type: string, title: string, name: string, blurb: string, Ctor: ChipCtor, names: string[], use: string, extraInfo: [string, string][] = []): PartDef<{}> {
  const n = names.length, vcc = names.indexOf('VCC') + 1, gnd = names.indexOf('GND') + 1;
  return {
    type, name, category: 'Digital ICs', blurb,
    box: () => ({ x: -0.6, y: -3.4, w: n / 2 + 0.2, h: 3.8 }),
    pins: () => dipPins(names),
    props: [], defaults: {},
    build(ctx) {
      const chip = ctx.add(new Ctor(nodesFor(ctx, n), title));
      return { read: () => chipLive(chip) };
    },
    info: [['Power', `Needs VCC (pin ${vcc}) to +5 V and GND (pin ${gnd}) to 0 V — without them it does nothing`], ['Pin 1', 'Next to the dot / notch, numbers run anticlockwise'], ['Use', use], ...extraInfo],
    render: ({ live, selected }: RenderArgs<{}>) => <DipBody names={names} title={title} live={live} selected={selected} />,
  };
}

const QUAD = ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'];

const ic7400 = logicChip('74hc00', '74HC00', '74HC00 quad NAND', '4 × NAND gate', IC7400, QUAD, 'Y = NOT (A AND B). Any logic can be built from NANDs alone.');
const ic7402 = logicChip('74hc02', '74HC02', '74HC02 quad NOR', '4 × NOR gate', IC7402, ['1Y', '1A', '1B', '2Y', '2A', '2B', 'GND', '3A', '3B', '3Y', '4A', '4B', '4Y', 'VCC'], 'Y = NOT (A OR B). Note: the output comes first on this chip.');
const ic7404 = logicChip('74hc04', '74HC04', '74HC04 hex inverter', '6 × NOT gate', IC7404, ['1A', '1Y', '2A', '2Y', '3A', '3Y', 'GND', '4Y', '4A', '5Y', '5A', '6Y', '6A', 'VCC'], 'Y = NOT A. Flips HIGH to LOW and back.');
const ic7408 = logicChip('74hc08', '74HC08', '74HC08 quad AND', '4 × AND gate', IC7408, QUAD, 'Y is HIGH only when A and B are both HIGH.');
const ic7432 = logicChip('74hc32', '74HC32', '74HC32 quad OR', '4 × OR gate', IC7432, QUAD, 'Y is HIGH when A or B (or both) is HIGH.');
const ic7486 = logicChip('74hc86', '74HC86', '74HC86 quad XOR', '4 × XOR gate', IC7486, QUAD, 'Y is HIGH when A and B are different. Used in adders.');
const ic7474 = logicChip('74hc74', '74HC74', '74HC74 dual D flip-flop', '2 × D flip-flop', IC7474, ['1CLR', '1D', '1CLK', '1PRE', '1Q', '1Q̅', 'GND', '2Q̅', '2Q', '2PRE', '2CLK', '2D', '2CLR', 'VCC'], 'On each rising CLK edge, Q copies D. Wire Q̅ → D to divide a clock by 2.', [['PRE / CLR', 'Active LOW: tie them to VCC for normal use']]);
const ic74138 = logicChip('74hc138', '74HC138', '74HC138 3-to-8 decoder', 'one of 8 outputs goes LOW', IC74138, ['A', 'B', 'C', 'G2A', 'G2B', 'G1', 'Y7', 'GND', 'Y6', 'Y5', 'Y4', 'Y3', 'Y2', 'Y1', 'Y0', 'VCC'], 'The binary number on C B A selects which Y output goes LOW.', [['Enable', 'G1 to VCC, G2A and G2B to GND']]);
const ic7447 = logicChip('74ls47', '74LS47', '74LS47 BCD to 7-segment', 'drives a common-anode display', IC7447, ['B', 'C', 'LT', 'BI/RBO', 'RBI', 'D', 'A', 'GND', 'e', 'd', 'c', 'b', 'a', 'g', 'f', 'VCC'], 'Turns a 4-bit BCD number (D C B A) into segment signals.', [['Outputs', 'Open-collector, active LOW: use a common-anode display with a ~330 Ω resistor per segment'], ['LT, BI, RBI', 'Tie HIGH (VCC) for normal use']]);
const ic7490 = logicChip('74ls90', '74LS90', '74LS90 decade counter', 'counts 0–9 in BCD', IC7490, ['CKB', 'R0(1)', 'R0(2)', 'NC', 'VCC', 'R9(1)', 'R9(2)', 'QC', 'QB', 'GND', 'QD', 'QA', 'NC', 'CKA'], 'Counts falling clock edges. Wire QA → CKB, clock into CKA for 0–9.', [['Power pins', 'VCC is pin 5 and GND is pin 10 on this chip (not the corners!)'], ['Reset', 'Tie R0 and R9 pins to GND to let it count']]);

const T555 = ['GND', 'TRIG', 'OUT', 'RESET', 'CTRL', 'THR', 'DIS', 'VCC'];
const ne555: PartDef<{}> = {
  type: 'ne555', name: 'NE555 timer', category: 'Digital ICs', blurb: 'clock / blinker / one-shot',
  box: () => ({ x: -0.6, y: -3.4, w: 4.2, h: 3.8 }),
  pins: () => dipPins(T555),
  props: [], defaults: {},
  build(ctx) {
    const t = ctx.add(new Timer555(nodesFor(ctx, 8), 'NE555'));
    return { read: (_s, v) => { const powered = v('8') - v('1') > 3; return { powered, o3: powered ? t.output : -1 }; } };
  },
  info: [['Power', 'VCC (pin 8) 4.5–15 V, GND (pin 1)'], ['Astable', 'R1 from VCC to DIS, R2 from DIS to THR, THR tied to TRIG, C from THR to GND'], ['Frequency', 'f ≈ 1.44 / ((R1 + 2·R2) · C)'], ['RESET', 'Tie pin 4 to VCC or it stays off']],
  render: ({ live, selected }) => <DipBody names={T555} title="NE555" live={live} selected={selected} />,
};

const SEG_PINS: Record<string, string> = { g: '10', f: '9', a: '7', b: '6', e: '1', d: '2', c: '4', dp: '5' };
const SEG_PATH: Record<string, string> = {
  a: 'M1.0,-5.1 L3.0,-5.1', b: 'M3.15,-4.95 L3.0,-3.15', c: 'M2.95,-2.85 L2.8,-1.05', d: 'M0.8,-0.9 L2.65,-0.9',
  e: 'M0.85,-2.85 L0.7,-1.05', f: 'M1.05,-4.95 L0.9,-3.15', g: 'M1.0,-3.0 L2.85,-3.0',
};

type SegProps = { common: string; color: string };
const sevenSeg: PartDef<SegProps> = {
  type: 'seven-segment', name: '7-segment display', category: 'Output', blurb: 'common cathode or anode',
  box: () => ({ x: -0.6, y: -6.4, w: 5.2, h: 6.8 }),
  pins: p => {
    const com = p.common === 'anode' ? 'COM (+)' : 'COM (−)';
    const top: [string, string][] = [['10', 'g'], ['9', 'f'], ['8', com], ['7', 'a'], ['6', 'b']];
    const bot: [string, string][] = [['1', 'e'], ['2', 'd'], ['3', com], ['4', 'c'], ['5', 'dp']];
    return [...bot.map(([id, l], i) => ({ id, label: `${id} · ${l}`, x: i, y: 0 })), ...top.map(([id, l], i) => ({ id, label: `${id} · ${l}`, x: i, y: -6 }))];
  },
  nets: () => [['3', '8']],
  props: [{ key: 'common', label: 'Type', type: 'select', options: [['cathode', 'Common cathode (COM to GND)'], ['anode', 'Common anode (COM to +V)']] }, { key: 'color', label: 'Colour', type: 'select', options: [['red', 'red'], ['green', 'green'], ['blue', 'blue']] }],
  defaults: { common: 'cathode', color: 'red' },
  build(ctx, p) {
    const com = ctx.pin('3'), leds: Record<string, LED> = {};
    for (const [s, pin] of Object.entries(SEG_PINS)) {
      const n = ctx.pin(pin);
      leds[s] = ctx.add(p.common === 'anode' ? new LED(com, n, p.color as 'red', 0.05, `segment ${s}`) : new LED(n, com, p.color as 'red', 0.05, `segment ${s}`));
    }
    return { read: () => { const live: Live = {}; for (const [s, l] of Object.entries(leds)) { live[s] = l.brightness; if (l.burnt) live.burnt = true; } return live; } };
  },
  info: [['Common cathode', 'COM pins to GND; a segment lights when its pin is HIGH'], ['Common anode', 'COM pins to +V; a segment lights when its pin is pulled LOW'], ['Resistors', 'One ~330 Ω resistor per segment, never one shared']],
  render: ({ props, live, selected }) => {
    const col = props.color === 'green' ? '#3fae66' : props.color === 'blue' ? '#3a6ed6' : '#e0453a';
    const segs = Object.entries(SEG_PATH);
    return (
      <g>
        {[0, 1, 2, 3, 4].map(i => <g key={i}><rect x={u(i) - 2.5} y={-6} width={5} height={6} fill="#c9ced2" stroke={INK} strokeWidth={0.6} /><rect x={u(i) - 2.5} y={u(-6)} width={5} height={6} fill="#c9ced2" stroke={INK} strokeWidth={0.6} /></g>)}
        <rect x={u(-0.5)} y={u(-5.6)} width={u(5)} height={u(5.2)} rx={3} fill="#1f1f22" stroke={INK} strokeWidth={1.4} />
        {segs.map(([s, d]) => {
          const g = (live[s] as number) || 0;
          const path = d.replace(/(-?\d+\.?\d*),(-?\d+\.?\d*)/g, (_, x, y) => `${u(+x)},${u(+y)}`);
          return <g key={s}>{g > 0.05 && <path d={path} stroke={col} strokeWidth={9} opacity={0.25 * g} strokeLinecap="round" style={{ filter: 'blur(3px)' }} />}<path d={path} stroke={g > 0.05 ? col : '#3a3a3e'} strokeOpacity={g > 0.05 ? 0.5 + 0.5 * g : 1} strokeWidth={4.5} strokeLinecap="round" /></g>;
        })}
        <circle cx={u(3.6)} cy={u(-0.95)} r={2.6} fill={((live.dp as number) || 0) > 0.05 ? col : '#3a3a3e'} />
        {live.burnt && <Label x={2} y={-2.6} size={10} color="#fff">✕</Label>}
        {selected && <Label x={2} y={1.0} size={7} color="#6b665a">{props.common === 'anode' ? 'CA' : 'CC'} · COM = 3, 8</Label>}
      </g>
    );
  },
};

type LsProps = { on: boolean };
const logicSwitch: PartDef<LsProps> = {
  type: 'logic-switch', name: 'Logic switch', category: 'Switches', blurb: 'click: OUT = VCC or GND',
  box: () => ({ x: -0.6, y: -1.9, w: 3.2, h: 2.4 }),
  pins: () => [{ id: 'VCC', label: 'VCC (to +5 V)', x: 0, y: 0 }, { id: 'OUT', label: 'OUT (to a gate input)', x: 1, y: 0 }, { id: 'GND', label: 'GND (to 0 V)', x: 2, y: 0 }],
  props: [{ key: 'on', label: 'HIGH', type: 'bool' }],
  defaults: { on: false },
  build(ctx, p) {
    const hi = ctx.add(new Switch(ctx.pin('OUT'), ctx.pin('VCC'), !!p.on)), lo = ctx.add(new Switch(ctx.pin('OUT'), ctx.pin('GND'), !p.on));
    return { update: q => { hi.closed = !!q.on; lo.closed = !q.on; return true; } };
  },
  info: [['Wiring', 'VCC pin to +5 V, GND pin to 0 V, OUT to the input you want to drive'], ['Why', 'A gate input left floating reads random values — always tie it HIGH or LOW']],
  render: ({ props, act }: RenderArgs<LsProps>) => {
    const on = !!props.on;
    return (
      <g style={{ cursor: 'pointer' }} onPointerDown={e => { e.stopPropagation(); act({ on: !on }); }}>
        {[0, 1, 2].map(i => <rect key={i} x={u(i) - 2.5} y={-5} width={5} height={5} fill="#c9ced2" stroke={INK} strokeWidth={0.6} />)}
        <rect x={u(-0.5)} y={u(-1.6)} width={u(3)} height={u(1.2)} rx={3} fill="#3a4256" stroke={INK} strokeWidth={1.3} />
        <rect x={u(on ? 0.05 : 1.05)} y={u(-1.45)} width={u(0.9)} height={u(0.9)} rx={2} fill={on ? '#3fae66' : '#cfcab8'} stroke={INK} />
        <Label x={on ? 0.5 : 1.5} y={-0.8} size={7}>{on ? '1' : '0'}</Label>
        <Label x={2.75} y={-0.75} size={7} color={on ? '#3fae66' : '#8a8577'} anchor="start">{on ? 'HIGH' : 'LOW'}</Label>
      </g>
    );
  },
};

type DipSwProps = { bits: string };
const dipSwitch: PartDef<DipSwProps> = {
  type: 'dip-switch-8', name: 'DIP switch ×8', category: 'Switches', blurb: '8 tiny on/off switches',
  box: () => ({ x: -0.6, y: -3.4, w: 8.2, h: 3.8 }),
  pins: () => Array.from({ length: 16 }, (_, i) => ({ id: String(i + 1), label: `${i + 1} · switch ${i < 8 ? i + 1 : 16 - i}`, ...dipPos(16, i + 1) })),
  props: [{ key: 'bits', label: 'Switches (1 = on)', type: 'select', options: [['00000000', 'all off'], ['11111111', 'all on']] }],
  defaults: { bits: '00000000' },
  build(ctx, p) {
    const sw = Array.from({ length: 8 }, (_, k) => ctx.add(new Switch(ctx.pin(String(k + 1)), ctx.pin(String(16 - k)), p.bits[k] === '1')));
    return { update: q => { sw.forEach((s, k) => s.closed = String(q.bits)[k] === '1'); return true; } };
  },
  info: [['Each switch', 'Joins pin k (bottom) to the pin straight above it when ON'], ['Use', 'Set a binary number on chip inputs, with pull-down resistors']],
  render: ({ props, act }: RenderArgs<DipSwProps>) => {
    const bits = (props.bits || '00000000').padEnd(8, '0');
    return (
      <g>
        {Array.from({ length: 16 }, (_, i) => { const p = dipPos(16, i + 1); return <rect key={i} x={u(p.x) - 2.5} y={u(p.y) + (p.y === 0 ? -6 : 0)} width={5} height={6} fill="#c9ced2" stroke={INK} strokeWidth={0.6} />; })}
        <rect x={u(-0.5)} y={u(-2.55)} width={u(8)} height={u(2.1)} rx={3} fill="#c8402f" stroke={INK} strokeWidth={1.4} />
        {Array.from({ length: 8 }, (_, k) => {
          const on = bits[k] === '1';
          return (
            <g key={k} style={{ cursor: 'pointer' }} onPointerDown={e => { e.stopPropagation(); act({ bits: bits.slice(0, k) + (on ? '0' : '1') + bits.slice(k + 1) }); }}>
              <rect x={u(k) - 4} y={u(-2.3)} width={8} height={u(1.6)} rx={1.5} fill="#f2efe7" stroke={INK} strokeWidth={0.8} />
              <rect x={u(k) - 3} y={on ? u(-2.2) : u(-1.4)} width={6} height={u(0.6)} rx={1} fill={INK} />
            </g>
          );
        })}
        <Label x={-0.2} y={-2.65} size={6} color="#f2efe7" anchor="start">ON ↑</Label>
      </g>
    );
  },
};

export const digitalParts: PartDef<any>[] = [ic7400, ic7402, ic7404, ic7408, ic7432, ic7486, ic7474, ic74138, ic7447, ic7490, ne555, sevenSeg, logicSwitch, dipSwitch];
