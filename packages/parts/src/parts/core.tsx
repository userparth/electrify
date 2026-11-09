import { Battery, LED, LED_COLORS, Resistor, type LedColor } from '@eb/engine';
import { Glow, INK, Label, Lead, PAPER, u } from '../draw';
import type { PartDef, PinDef } from '../types';
import { formatSI, resistorBands } from '../units';

const COLS = 63;
const MAIN = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] as const;
const ROW_Y: Record<string, number> = { tn: 1, tp: 2, a: 5, b: 6, c: 7, d: 8, e: 9, f: 12, g: 13, h: 14, i: 15, j: 16, bn: 19, bp: 20 };
const RAILS = ['tn', 'tp', 'bn', 'bp'] as const;
const railHole = (col: number) => (col - 1) % 6 !== 5;

let bbPins: PinDef[] | null = null;
function breadboardPins(): PinDef[] {
  if (bbPins) return bbPins;
  const out: PinDef[] = [];
  for (let col = 1; col <= COLS; col++) {
    for (const r of MAIN) out.push({ id: `${r}${col}`, label: `${r.toUpperCase()}${col}`, x: col + 1, y: ROW_Y[r]! });
    for (const r of RAILS) if (railHole(col)) out.push({ id: `${r}${col}`, label: `${r.startsWith('t') ? 'Top' : 'Bottom'} ${r.endsWith('p') ? '+' : '−'} rail`, x: col + 1, y: ROW_Y[r]! });
  }
  return (bbPins = out);
}

export const breadboard: PartDef<{}> = {
  type: 'breadboard', name: 'Breadboard (830 holes)', category: 'Boards', blurb: '63 columns, 4 power rails',
  mount: 'free',
  box: () => ({ x: 0, y: 0, w: COLS + 3, h: 22 }),
  pins: breadboardPins,
  nets: () => {
    const nets: string[][] = [];
    for (let col = 1; col <= COLS; col++) { nets.push(['a', 'b', 'c', 'd', 'e'].map(r => `${r}${col}`)); nets.push(['f', 'g', 'h', 'i', 'j'].map(r => `${r}${col}`)); }
    for (const r of RAILS) nets.push(Array.from({ length: COLS }, (_, i) => i + 1).filter(railHole).map(c => `${r}${c}`));
    return nets;
  },
  props: [], defaults: {},
  build: () => ({}),
  info: [['Rows a–e', 'The 5 holes in each column are joined'], ['Rows f–j', 'Joined per column too, separate from a–e'], ['Centre gap', 'Chips straddle it so each pin gets its own column'], ['Rails', 'Long + (red) and − (blue) strips for power']],
  render: () => (
    <g>
      <rect x={0} y={0} width={u(COLS + 3)} height={u(22)} rx={10} fill="#f4f1ea" stroke={INK} strokeWidth={1.6} />
      <rect x={u(1)} y={u(10.2)} width={u(COLS + 1)} height={u(1.6)} rx={3} fill="#e4dfd2" />
      {[[0.35, '#3a6ed6'], [2.65, '#d6452f'], [18.35, '#3a6ed6'], [20.65, '#d6452f']].map(([y, c], i) => <line key={i} x1={u(1.5)} y1={u(y as number)} x2={u(COLS + 1.5)} y2={u(y as number)} stroke={c as string} strokeWidth={1.4} />)}
      {breadboardPins().map(p => <rect key={p.id} x={u(p.x) - 2.6} y={u(p.y) - 2.6} width={5.2} height={5.2} rx={1} fill="#4a4741" />)}
      {MAIN.map(r => <Label key={r} x={0.9} y={ROW_Y[r]! + 0.28} size={7} color="#8a8577">{r}</Label>)}
      {Array.from({ length: COLS }, (_, i) => i + 1).filter(c => c === 1 || c % 5 === 0).map(c => <Label key={c} x={c + 1} y={4.1} size={7} color="#8a8577">{c}</Label>)}
      <Label x={0.6} y={1.3} size={9} color="#3a6ed6">−</Label><Label x={0.6} y={2.3} size={9} color="#d6452f">+</Label>
      <Label x={0.6} y={19.3} size={9} color="#3a6ed6">−</Label><Label x={0.6} y={20.3} size={9} color="#d6452f">+</Label>
    </g>
  ),
};

type RProps = { ohms: number; span: number };
export const resistor: PartDef<RProps> = {
  type: 'resistor', name: 'Resistor', category: 'Passive', blurb: 'limits current, ¼ W',
  box: p => ({ x: -0.4, y: -0.6, w: p.span + 0.8, h: 1.2 }),
  pins: p => [{ id: '1', label: 'Lead 1', x: 0, y: 0 }, { id: '2', label: 'Lead 2', x: p.span, y: 0 }],
  props: [{ key: 'ohms', label: 'Resistance', type: 'number', unit: 'Ω', min: 0.1, si: true }, { key: 'span', label: 'Lead spacing', type: 'select', options: [['3', '0.3 in'], ['4', '0.4 in'], ['5', '0.5 in']] }],
  defaults: { ohms: 330, span: 4 },
  build(ctx, p) {
    const r = ctx.add(new Resistor(ctx.pin('1'), ctx.pin('2'), p.ohms));
    return {
      read: (_s, v) => ({ amps: (v('1') - v('2')) / r.ohms, watts: (v('1') - v('2')) ** 2 / r.ohms }),
      update: q => { r.ohms = +q.ohms!; return true; },
    };
  },
  info: [['Colour code', 'Bands: digit, digit, multiplier, tolerance'], ['Power', '¼ W max — it gets hot above that']],
  render: ({ props, live }) => {
    const span = +props.span, body = Math.min(2.6, span - 1), x0 = (span - body) / 2, hot = Math.min(1, ((live.watts as number) || 0) / 0.5);
    const bands = resistorBands(+props.ohms);
    return (
      <g>
        <Lead x1={0} y1={0} x2={span} y2={0} />
        <rect x={u(x0)} y={-5.5} width={u(body)} height={11} rx={5} fill={hot > 0.5 ? '#e8a07a' : '#e3cfa3'} stroke={INK} strokeWidth={1.2} />
        {bands.map((c, i) => <rect key={i} x={u(x0) + 5 + i * (u(body) - 12) / 3.2 + (i === 3 ? 4 : 0)} y={-5.3} width={3.2} height={10.6} fill={c} />)}
        {hot > 0.5 && <text x={u(span / 2)} y={-9} fontSize={10} textAnchor="middle">💨</text>}
        <Label x={span / 2} y={1.35} size={8} color="#6b665a">{formatSI(+props.ohms, 'Ω')}</Label>
      </g>
    );
  },
};

type LProps = { color: LedColor };
const LED_FILL: Record<LedColor, string> = { red: '#e0453a', yellow: '#f2c230', green: '#3fae66', blue: '#3a6ed6', white: '#f4f4f4' };
export const led: PartDef<LProps> = {
  type: 'led', name: 'LED (5 mm)', category: 'Output', blurb: 'long leg = anode (+)',
  box: () => ({ x: -0.6, y: -1.8, w: 2.2, h: 2.3 }),
  pins: () => [{ id: 'A', label: 'Anode (+, long leg)', x: 0, y: 0 }, { id: 'K', label: 'Cathode (−, flat side)', x: 1, y: 0 }],
  props: [{ key: 'color', label: 'Colour', type: 'select', options: Object.keys(LED_COLORS).map(c => [c, c] as [string, string]) }],
  defaults: { color: 'red' },
  build(ctx, p) {
    const d = ctx.add(new LED(ctx.pin('A'), ctx.pin('K'), p.color));
    return { read: () => ({ glow: d.brightness, burnt: d.burnt }), update: () => false };
  },
  info: [['Forward voltage', 'Red ~1.9 V, green ~2.1 V, blue/white ~3 V'], ['Always', 'Use a series resistor: R = (Vsupply − Vf) / 0.01 A'], ['Polarity', 'Backwards it simply stays dark']],
  render: ({ props, live }) => {
    const fill = LED_FILL[props.color], g = live.burnt ? 0 : (live.glow as number) || 0;
    return (
      <g>
        <Lead x1={0} y1={0} x2={0} y2={-0.9} /><Lead x1={1} y1={0} x2={1} y2={-0.9} />
        <Glow cx={u(0.5)} cy={u(-1.2)} r={9} color={fill} amount={g} />
        <path d={`M${u(-0.25)},${u(-0.85)} L${u(-0.25)},${u(-1.35)} A${u(0.75)},${u(0.75)} 0 0 1 ${u(1.25)},${u(-1.35)} L${u(1.25)},${u(-0.85)} Z`} fill={live.burnt ? '#5a5650' : fill} fillOpacity={0.55 + 0.45 * g} stroke={INK} strokeWidth={1.2} />
        <line x1={u(1.25)} y1={u(-0.85)} x2={u(1.25)} y2={u(-1.35)} stroke={INK} strokeWidth={2.4} />
        {live.burnt && <Label x={0.5} y={-1.0} size={10} color="#fff">✕</Label>}
        <Label x={-0.05} y={0.95} size={8} color="#d6452f">+</Label>
      </g>
    );
  },
};

type BProps = { volts: string };
const BAT_TABLE: Record<string, [number, number][]> = {
  '9': [[0, 7.2], [0.5, 8.4], [1, 9.4]],
  '3': [[0, 2.0], [0.5, 2.5], [1, 3.2]],
  '12': [[0, 11.5], [0.25, 11.9], [0.5, 12.2], [0.75, 12.4], [1, 12.7]],
};
export const battery: PartDef<BProps> = {
  type: 'battery', name: 'Battery', category: 'Power', blurb: '9 V, 2×AA or 12 V lead-acid',
  mount: 'free',
  box: () => ({ x: -0.5, y: -0.5, w: 6, h: 9 }),
  pins: () => [{ id: '+', label: 'Battery +', x: 1, y: 0 }, { id: '-', label: 'Battery −', x: 4, y: 0, ground: true }],
  props: [{ key: 'volts', label: 'Type', type: 'select', options: [['9', '9 V PP3'], ['3', '2×AA (3 V)'], ['12', '12 V 26 Ah lead-acid']] }],
  defaults: { volts: '9' },
  build(ctx, p) {
    const ah = p.volts === '12' ? 26 : p.volts === '9' ? 0.5 : 2.5, rint = p.volts === '12' ? 0.03 : p.volts === '9' ? 1.5 : 0.3;
    const b = ctx.add(new Battery(ctx.pin('+'), ctx.pin('-'), { ah, soc: 0.95, rint, table: BAT_TABLE[p.volts] }));
    return { read: (s, v) => ({ v: v('+') - v('-'), soc: b.opts.soc, amps: b.current(k => s.branch(k)) }), update: () => false };
  },
  info: [['Internal resistance', 'A 9 V battery sags hard above ~100 mA'], ['Short circuit', 'Never wire + straight to −']],
  render: ({ props, live }) => {
    const big = props.volts === '12', col = big ? '#2f2f33' : props.volts === '9' ? '#2b2d31' : '#3a6ed6';
    return (
      <g>
        <rect x={u(-0.3)} y={u(0.4)} width={u(5.6)} height={u(8)} rx={6} fill={col} stroke={INK} strokeWidth={1.6} />
        <rect x={u(0.4)} y={u(-0.4)} width={u(1.2)} height={u(0.9)} rx={2} fill="#d6452f" stroke={INK} />
        <rect x={u(3.4)} y={u(-0.4)} width={u(1.2)} height={u(0.9)} rx={2} fill="#262624" stroke={INK} />
        <Label x={2.5} y={3.6} size={14} color={PAPER}>{props.volts === '3' ? '2×AA' : `${props.volts}V`}</Label>
        <Label x={2.5} y={5} size={8} color="#cfcab8">{big ? 'EXIDE 26Ah' : props.volts === '9' ? 'PP3' : '1.5V ×2'}</Label>
        <rect x={u(0.6)} y={u(6.4)} width={u(3.8)} height={u(0.6)} fill="none" stroke="#cfcab8" />
        <rect x={u(0.6)} y={u(6.4)} width={u(3.8 * (((live.soc as number) ?? 0.95)))} height={u(0.6)} fill="#9be3b4" />
        <Label x={2.5} y={8} size={8} color={PAPER}>{live.v != null ? `${(live.v as number).toFixed(2)} V` : ''}</Label>
      </g>
    );
  },
};
