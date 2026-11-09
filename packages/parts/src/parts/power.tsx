import { Diode, type Ctx, type Element } from '@eb/engine';
import { INK, Label, PAPER, PinDot, u } from '../draw';
import type { PartDef, PinDef } from '../types';

const OPEN = 1e-12;
const once = (fired: Set<string>, ctx: Ctx, key: string, cond: boolean, e: Parameters<Ctx['emit']>[0]) => {
  if (cond && !fired.has(key)) { fired.add(key); ctx.emit(e); } else if (!cond) fired.delete(key);
};

/* ───────────────────────── Charge controller ───────────────────────── */

type CCProps = { lvd: number; lvdOff: boolean; load: boolean };
type Mode = null | '12V' | '24V';

/** Common-positive PWM controller: PV−, LOAD− and the USB rail are switched on the negative side. */
class ControllerCore implements Element {
  readonly branches = 1;
  branch0 = 0;
  mode: Mode = null;
  chg = false;
  stage: 'bulk' | 'float' = 'bulk';
  lvdTrip = false;
  flat = false;
  loadOn = false;
  usbOn = false;
  ichg = 0;
  iload = 0;
  iusb = 0;
  vb = 0;
  vpv = 0;
  private fired = new Set<string>();
  constructor(private n: Record<string, number>, public p: CCProps) {}

  beginStep(ctx: Ctx) {
    const v = (k: string) => ctx.prev(this.n[k]!);
    const vb = v('BAT+') - v('BAT-'), vpv = v('PV+') - v('PV-');
    this.vb = vb; this.vpv = vpv;
    once(this.fired, ctx, 'rev', vb < -1, { kind: 'reverse-battery', severity: 'error', message: 'Charge controller: battery connected backwards — its protection diode conducts, the fuse should blow.' });
    const powered = vb > 8 || vpv > 8;
    if (!powered) { this.mode = null; this.chg = false; this.loadOn = false; this.usbOn = false; this.lvdTrip = false; this.flat = false; return; }
    if (!this.mode) {
      this.mode = vb > 8 && vb < 16 ? '12V' : vpv > 18 ? '24V' : '12V';
      if (this.mode === '24V') ctx.emit({ kind: 'cc-24v', severity: 'error', message: `Charge controller powered up from the panel alone (${vpv.toFixed(1)} V) and picked a 24 V system. Disconnect everything and connect the battery first.` });
    }
    if (this.mode !== '12V' || vb < 8) { this.chg = false; this.loadOn = false; this.usbOn = false; return; }
    if (vb < 12.6) this.stage = 'bulk';
    const top = this.stage === 'bulk' ? 14.4 : 13.7, resume = this.stage === 'bulk' ? 14.2 : 13.5;
    if (this.chg) {
      if (vb >= top) { this.chg = false; if (this.stage === 'bulk') this.stage = 'float'; }
      else if (this.ichg < 0.02) this.chg = false;
    } else if (vpv > vb + 0.5 && vb < resume) this.chg = true;
    if (this.p.lvdOff) this.lvdTrip = false;
    else if (!this.lvdTrip && vb < this.p.lvd) { this.lvdTrip = true; ctx.emit({ kind: 'lvd', severity: 'warn', message: `Charge controller: LVD cut the load at ${vb.toFixed(2)} V.` }); }
    else if (this.lvdTrip && vb >= 12.6) this.lvdTrip = false;
    if (!this.flat && vb < 10.8) { this.flat = true; ctx.emit({ kind: 'battery-flat', severity: 'warn', message: `Charge controller: battery is flat (${vb.toFixed(2)} V). Load and USB off until the sun recharges it.` }); }
    else if (this.flat && vb > 11.8) this.flat = false;
    this.usbOn = !this.lvdTrip && !this.flat;
    this.loadOn = this.p.load && this.usbOn;
  }

  stamp(ctx: Ctx) {
    const n = this.n;
    ctx.conductance(n['PV+']!, n['BAT+']!, 100);
    ctx.conductance(n['LOAD+']!, n['BAT+']!, 100);
    ctx.conductance(n['PV-']!, n['BAT-']!, this.chg ? 1 / 0.03 : OPEN);
    ctx.conductance(n['LOAD-']!, n['BAT-']!, this.loadOn ? 50 : OPEN);
    ctx.conductance(n['USB-']!, n['BAT-']!, 200);
    ctx.conductance(n['BAT+']!, n['BAT-']!, 1 / 800);
    if (this.usbOn) {
      ctx.voltageSource(this.branch0, n['USB+']!, n['USB-']!, 5.1, 0.1);
      const pin = this.iusb * 5 / 0.85;
      if (pin > 0.01) ctx.conductance(n['BAT+']!, n['BAT-']!, pin / Math.max(this.vb, 8) ** 2);
    } else ctx.currentBranch(this.branch0, n['USB+']!, n['USB-']!, 0);
  }

  accept(ctx: Ctx) {
    const v = (k: string) => ctx.v(this.n[k]!);
    this.ichg = this.chg ? (v('BAT-') - v('PV-')) / 0.03 : 0;
    this.iload = this.loadOn ? (v('LOAD-') - v('BAT-')) * 50 : 0;
    this.iusb = this.usbOn ? Math.max(0, -ctx.branch(this.branch0)) : 0;
  }
}

const CC_PINS: PinDef[] = [
  { id: 'PV+', label: 'Solar panel +', x: 0, y: 0 }, { id: 'PV-', label: 'Solar panel −', x: 1, y: 0 },
  { id: 'BAT+', label: 'Battery +', x: 3, y: 0 }, { id: 'BAT-', label: 'Battery −', x: 4, y: 0, ground: true },
  { id: 'LOAD+', label: 'Load + (always battery +)', x: 6, y: 0 }, { id: 'LOAD-', label: 'Load − (switched)', x: 7, y: 0 },
  { id: 'USB+', label: 'USB 5 V', x: 10, y: -3 }, { id: 'USB-', label: 'USB GND', x: 10, y: -2 },
];

export const chargeController: PartDef<CCProps> = {
  type: 'charge-controller', name: 'Solar charge controller 10 A PWM', category: 'Power', blurb: 'panel → battery → load, with LVD',
  mount: 'free',
  box: () => ({ x: -1, y: -8, w: 12, h: 9 }),
  pins: () => CC_PINS,
  props: [
    { key: 'load', label: 'LOAD output', type: 'bool' },
    { key: 'lvdOff', label: 'LVD off (let the battery drain to empty)', type: 'bool' },
    { key: 'lvd', label: 'LVD (low-voltage cut)', type: 'range', min: 10.5, max: 12.4, step: 0.1, unit: 'V' },
  ],
  defaults: { lvd: 12, lvdOff: true, load: true },
  build(ctx, p) {
    const n = Object.fromEntries(CC_PINS.map(pin => [pin.id, ctx.pin(pin.id)]));
    const core = ctx.add(new ControllerCore(n, { ...p }));
    ctx.add(new Diode(n['BAT-']!, n['BAT+']!, { is: 1e-8, n: 1.8 }));
    return {
      read: () => ({ vbat: core.vb, vpv: core.vpv, mode: core.mode ?? 'off', charging: core.chg, stage: core.stage, load: core.loadOn, usb: core.usbOn, lvdCut: core.lvdTrip, flat: core.flat, ichg: core.ichg, iload: core.iload }),
      update: q => { core.p = { lvd: +q.lvd!, lvdOff: !!q.lvdOff, load: !!q.load }; return true; },
    };
  },
  info: [
    ['Connect order', 'Battery first (the controller reads it to choose 12 V or 24 V), then panel, then load'],
    ['LOAD terminals', 'LOAD+ is always battery +; the controller switches LOAD−. A DC-DC IN− must go on LOAD−, not battery −'],
    ['LVD', 'Cuts the load when the battery gets low to protect it. Off = the battery may drain until it is flat'],
    ['Charging', 'Bulk up to 14.4 V, then float at ~13.6 V'],
  ],
  render: ({ live, props, act }) => {
    const on = live.mode && live.mode !== 'off', fault = live.mode === '24V';
    const sub = fault ? '24V?! WRONG' : `${live.charging ? '☀→▮ ' : ''}${live.flat ? 'FLAT' : live.lvdCut ? 'LVD CUT' : live.load ? 'LOAD ON' : 'LOAD OFF'}${props.lvdOff ? ' · NO LVD' : ''}`;
    return (
      <g>
        <rect x={u(-1)} y={u(-8)} width={u(12)} height={u(8.6)} rx={8} fill="#3a4256" stroke={INK} strokeWidth={1.6} />
        <rect x={u(0)} y={u(-7.2)} width={u(7.6)} height={u(3.8)} rx={4} fill={!on ? '#7d8573' : fault ? '#f0a596' : '#b9dca0'} stroke={INK} />
        <Label x={3.8} y={-5.2} size={16} color="#1d2a18">{on ? `${(live.vbat as number).toFixed(1)}V` : ''}</Label>
        <Label x={3.8} y={-3.9} size={8} color="#1d2a18">{on ? sub : ''}</Label>
        <g data-interactive onPointerDown={e => { e.stopPropagation(); act({ load: !props.load }); }} style={{ cursor: 'pointer' }}>
          <rect x={u(8.2)} y={u(-7.2)} width={u(2.2)} height={u(1.4)} rx={4} fill={props.load ? '#3fae66' : '#555'} stroke={INK} />
          <Label x={9.3} y={-6.2} size={7} color={PAPER}>LOAD</Label>
        </g>
        <circle cx={u(9.3)} cy={u(-4.8)} r={4} fill={live.charging ? '#3fae66' : fault ? '#d6452f' : '#555'} stroke={INK} />
        {[['☀', 0.5], ['▮', 3.5], ['💡', 6.5]].map(([g, x]) => <Label key={g as string} x={x as number} y={-1.6} size={9} color="#e9e4d6">{g as string}</Label>)}
        {CC_PINS.slice(0, 6).map((p, i) => <g key={p.id}><rect x={u(p.x) - 5} y={u(-1.1)} width={10} height={10} fill={i % 2 ? '#222' : '#c84030'} stroke={INK} /><PinDot x={p.x} y={0} /></g>)}
        <rect x={u(9.6)} y={u(-3.5)} width={u(1.2)} height={u(2)} fill="#ddd" stroke={INK} />
        <PinDot x={10} y={-3} /><PinDot x={10} y={-2} />
      </g>
    );
  },
};

/* ───────────────────────── DC-DC converter ───────────────────────── */

type DcProps = { vset: number; kind: string };
class DcdcCore implements Element {
  readonly branches = 1;
  branch0 = 0;
  vin = 0;
  vout = 0;
  pout = 0;
  iout = 0;
  private fired = new Set<string>();
  constructor(private n: Record<string, number>, public p: DcProps) {}
  beginStep(ctx: Ctx) {
    const vin = ctx.prev(this.n['IN+']!) - ctx.prev(this.n['IN-']!), vset = this.p.vset;
    this.vin = vin;
    this.vout = this.p.kind === 'buck' ? (vin > 4 ? Math.min(vset, vin - 1.5) : 0) : vin > 5 && vin < 40 ? vset : 0;
    once(this.fired, ctx, 'ol', this.iout > 3.5, { kind: 'dcdc-overload', severity: 'warn', message: `DC-DC overloaded (${this.iout.toFixed(1)} A out). These boards handle about 3 A.` });
  }
  stamp(ctx: Ctx) {
    const n = this.n;
    if (this.vout > 0) {
      ctx.voltageSource(this.branch0, n['OUT+']!, n['OUT-']!, this.vout, 0.05);
      const pin = this.pout / 0.9 + 0.15;
      ctx.conductance(n['IN+']!, n['IN-']!, pin / Math.max(this.vin, 1) ** 2);
    } else {
      ctx.currentBranch(this.branch0, n['OUT+']!, n['OUT-']!, 0);
      ctx.conductance(n['IN+']!, n['IN-']!, 1e-5);
    }
  }
  accept(ctx: Ctx) {
    this.iout = this.vout > 0 ? Math.max(0, -ctx.branch(this.branch0)) : 0;
    this.pout = this.iout * (ctx.v(this.n['OUT+']!) - ctx.v(this.n['OUT-']!));
  }
}

const DC_PINS: PinDef[] = [
  { id: 'IN+', label: 'IN + (8–40 V)', x: 0, y: 0 }, { id: 'IN-', label: 'IN − (to controller LOAD−)', x: 0, y: 2 },
  { id: 'OUT+', label: 'OUT +', x: 8, y: 0 }, { id: 'OUT-', label: 'OUT −', x: 8, y: 2 },
];
export const dcdcModule: PartDef<DcProps> = {
  type: 'dcdc-module', name: 'DC-DC converter module', category: 'Power', blurb: 'buck-boost or LM2596 buck',
  mount: 'free',
  box: () => ({ x: -1, y: -2, w: 10, h: 5 }),
  pins: () => DC_PINS,
  nets: () => [['IN-', 'OUT-']],
  props: [
    { key: 'kind', label: 'Board', type: 'select', options: [['bb', 'Buck-boost (8–40 V in)'], ['buck', 'LM2596 buck (step-down only)']] },
    { key: 'vset', label: 'Output (trim pot)', type: 'range', min: 1.5, max: 24, step: 0.1, unit: 'V' },
  ],
  defaults: { vset: 12, kind: 'bb' },
  build(ctx, p) {
    const core = ctx.add(new DcdcCore(Object.fromEntries(DC_PINS.map(q => [q.id, ctx.pin(q.id)])), { ...p }));
    return {
      read: () => ({ vin: core.vin, vout: core.vout, iout: core.iout, mode: core.vout <= 0 ? 'off' : core.p.kind === 'buck' ? (core.vout < core.p.vset ? 'dropout' : 'buck') : core.vin > core.p.vset ? 'buck' : 'boost' }),
      update: q => { core.p = { vset: +q.vset!, kind: String(q.kind) }; return true; },
    };
  },
  info: [['Buck-boost', 'Keeps the output steady while the battery swings 11–14.4 V'], ['LM2596', 'Step-down only: needs ~1.5 V more in than out'], ['Set it first', 'Measure OUT with a meter before connecting the router'], ['IN− and OUT−', 'Joined on the board — so IN− must sit on the controller LOAD−']],
  render: ({ live, props }) => (
    <g>
      <rect x={u(-1)} y={u(-2)} width={u(10)} height={u(5)} rx={4} fill="#2f8a55" stroke={INK} strokeWidth={1.4} />
      <rect x={u(2)} y={u(-1.2)} width={u(2.4)} height={u(2.4)} rx={2} fill="#555d66" stroke={INK} />
      <rect x={u(5.2)} y={u(-0.9)} width={u(1.2)} height={u(1.2)} fill="#3a6ed6" stroke={INK} />
      <Label x={4} y={2.4} size={8} color={PAPER}>{props.kind === 'buck' ? 'LM2596' : 'BUCK-BOOST'} · {live.vout ? `${(live.vout as number).toFixed(1)}V` : 'OFF'}</Label>
      {DC_PINS.map(q => <PinDot key={q.id} x={q.x} y={q.y} />)}
    </g>
  ),
};

/* ───────────────────────── Loads ───────────────────────── */

class SwitchedLoad implements Element {
  r = 1e9;
  constructor(public a: number, public b: number, public decide: (v: number, ctx: Ctx) => number) {}
  beginStep(ctx: Ctx) { this.r = this.decide(ctx.prev(this.a) - ctx.prev(this.b), ctx); }
  stamp(ctx: Ctx) { ctx.conductance(this.a, this.b, 1 / this.r); }
}

export const dcFan: PartDef<{}> = {
  type: 'dc-fan', name: '12 V DC fan (10 W)', category: 'Output', blurb: 'spins on 12 V DC, ~0.85 A',
  mount: 'free',
  box: () => ({ x: -3, y: -8, w: 8, h: 9 }),
  pins: () => [{ id: '+', label: 'Fan + (red)', x: 0, y: 0 }, { id: '-', label: 'Fan − (black)', x: 2, y: 0 }],
  props: [], defaults: {},
  build(ctx) {
    const a = ctx.pin('+'), b = ctx.pin('-');
    const load = ctx.add(new SwitchedLoad(a, b, v => v > 0 ? 14.4 : 1e9));
    let angle = 0, last = 0;
    return {
      read: (s, v) => { const volts = v('+') - v('-'); angle = (angle + Math.max(0, volts) / 12 * 1800 * (s.t - last)) % 360; last = s.t; return { volts, amps: volts / load.r, angle }; },
    };
  },
  info: [['Power', '~10 W, ~0.85 A per hour of running'], ['Polarity', 'A brushless DC fan will not spin backwards — it just stays still'], ['Mains fans', 'A 230 V table fan needs an inverter, not this']],
  render: ({ live }) => (
    <g>
      <circle cx={u(1)} cy={u(-4)} r={u(3.6)} fill="#efe9dc" stroke={INK} strokeWidth={1.4} />
      <g transform={`translate(${u(1)},${u(-4)}) rotate(${(live.angle as number) || 0})`}>
        {[0, 120, 240].map(r => <ellipse key={r} rx={u(1.6)} ry={u(0.6)} cx={u(1.6)} fill="#7cc6a4" stroke={INK} transform={`rotate(${r})`} />)}
        <circle r={5} fill="#555" />
      </g>
      <PinDot x={0} y={0} /><PinDot x={2} y={0} />
    </g>
  ),
};

type RouterProps = { volts: string };
export const router: PartDef<RouterProps> = {
  type: 'router', name: 'WiFi router (barrel jack)', category: 'Output', blurb: '12 V router, ~7 W',
  mount: 'free',
  box: () => ({ x: -1, y: -6, w: 12, h: 7 }),
  pins: () => [{ id: 'C', label: 'Barrel centre pin', x: 0, y: 0 }, { id: 'S', label: 'Barrel outer sleeve', x: 1, y: 0 }],
  props: [{ key: 'volts', label: 'Rated input', type: 'select', options: [['12', '12 V'], ['9', '9 V'], ['5', '5 V']] }],
  defaults: { volts: '12' },
  build(ctx, p) {
    const vr = +p.volts, fired = new Set<string>();
    let dead = false, v = 0;
    ctx.add(new SwitchedLoad(ctx.pin('C'), ctx.pin('S'), (volts, c) => {
      v = volts;
      if (!dead && volts > vr * 1.3) { dead = true; c.emit({ kind: 'router-dead', severity: 'error', message: `Router: ${volts.toFixed(1)} V on a ${vr} V input. It is dead.` }); }
      once(fired, c, 'rev', volts < -1, { kind: 'router-reverse', severity: 'warn', message: 'Router: barrel polarity reversed. Its protection diode blocks it, so it stays off.' });
      return dead || volts < -0.5 ? 1e9 : vr * vr / 7;
    }));
    return { read: () => ({ volts: v, dead, ok: !dead && v >= 0.85 * vr && v <= 1.15 * vr, rebooting: !dead && v > 1 && v < 0.85 * vr }) };
  },
  info: [['Polarity', '⊖–◉–⊕ on the adapter label means centre positive'], ['Voltage', 'Too low → keeps rebooting; much too high → destroyed'], ['From a battery', 'Use a buck-boost DC-DC set to exactly the rated voltage']],
  render: ({ live }) => (
    <g>
      <rect x={u(-1)} y={u(-4.5)} width={u(12)} height={u(4)} rx={6} fill="#eceae4" stroke={INK} strokeWidth={1.4} />
      <line x1={u(1)} y1={u(-4.5)} x2={u(0)} y2={u(-6)} stroke={INK} strokeWidth={3} /><line x1={u(9)} y1={u(-4.5)} x2={u(10)} y2={u(-6)} stroke={INK} strokeWidth={3} />
      {[0, 1, 2, 3].map(i => <circle key={i} cx={u(4 + i * 1.3)} cy={u(-2.5)} r={3} fill={live.dead ? '#555' : live.ok ? (i === 3 && Math.random() > 0.5 ? '#999' : '#3fae66') : live.rebooting && i === 0 ? '#f3c33b' : '#999'} />)}
      {live.dead && <Label x={5} y={-1.2} size={8} color="#d6452f">DEAD</Label>}
      <PinDot x={0} y={0} /><PinDot x={1} y={0} />
    </g>
  ),
};

type PhoneProps = { draw: number };
export const usbPhone: PartDef<PhoneProps> = {
  type: 'usb-phone', name: 'Phone / power bank (USB)', category: 'Output', blurb: 'charges from 5 V USB',
  mount: 'free',
  box: () => ({ x: -1, y: -10, w: 6, h: 11 }),
  pins: () => [{ id: 'VBUS', label: 'USB VBUS (5 V)', x: 1, y: 0 }, { id: 'GND', label: 'USB GND', x: 3, y: 0 }],
  props: [{ key: 'draw', label: 'Charging current', type: 'range', min: 0.1, max: 2.1, step: 0.1, unit: 'A' }],
  defaults: { draw: 1 },
  build(ctx, p) {
    let v = 0, draw = p.draw;
    const fired = new Set<string>();
    ctx.add(new SwitchedLoad(ctx.pin('VBUS'), ctx.pin('GND'), (volts, c) => {
      v = volts;
      once(fired, c, 'hv', volts >= 5.7, { kind: 'usb-overvolt', severity: 'error', message: `Phone: ${volts.toFixed(1)} V on USB! It refuses to charge (a cheap one could be damaged).` });
      return volts > 4.4 && volts < 5.7 ? 5 / draw : volts >= 5.7 ? 1e9 : 50;
    }));
    return { read: () => ({ volts: v, charging: v > 4.4 && v < 5.7 }), update: q => { draw = +q.draw!; return true; } };
  },
  info: [['USB', '5 V, up to ~2 A'], ['Battery cost', 'A full phone charge ≈ 1.5 Ah from a 12 V battery'], ['Tip', 'Charge in daytime, while the panel is also charging the battery']],
  render: ({ live }) => (
    <g>
      <rect x={u(-1)} y={u(-10)} width={u(6)} height={u(9.4)} rx={8} fill="#1f1f22" stroke={INK} strokeWidth={1.4} />
      <rect x={u(-0.4)} y={u(-9.2)} width={u(4.8)} height={u(7.6)} rx={4} fill={live.charging ? '#5a7fd6' : '#3a3f4a'} />
      {live.charging && <Label x={2} y={-5} size={18} color="#f3c33b">⚡</Label>}
      <PinDot x={1} y={0} /><PinDot x={3} y={0} />
    </g>
  ),
};

/* ───────────────────────── Inverter ───────────────────────── */

type InvProps = { on: boolean; watts: number };
class InverterCore implements Element {
  readonly branches = 1;
  branch0 = 0;
  run = false;
  trip = false;
  vin = 0;
  idc = 0;
  constructor(private n: Record<string, number>, public p: InvProps) {}
  beginStep(ctx: Ctx) {
    this.vin = ctx.prev(this.n['DC+']!) - ctx.prev(this.n['DC-']!);
    if (!this.p.on) { this.run = false; this.trip = false; return; }
    if (this.p.watts > 300 && this.run && !this.trip) { this.trip = true; ctx.emit({ kind: 'inverter-overload', severity: 'error', message: `Inverter: OVERLOAD (${this.p.watts} W > 300 W). Shut down — switch it off and on.` }); }
    if (this.trip) { this.run = false; return; }
    const was = this.run;
    this.run = this.vin >= (was ? 11.8 : 12.2);
    if (was && !this.run) ctx.emit({ kind: 'inverter-lvd', severity: 'warn', message: `Inverter: low-voltage cutoff at ${this.vin.toFixed(2)} V.` });
  }
  stamp(ctx: Ctx) {
    const n = this.n, pdc = 5 + this.p.watts / 0.88;
    ctx.conductance(n['DC+']!, n['DC-']!, this.run ? pdc / Math.max(this.vin, 6) ** 2 : this.p.on ? 1 / 1500 : OPEN);
    if (this.run) ctx.voltageSource(this.branch0, n['L']!, n['N']!, 325 * Math.sin(2 * Math.PI * 50 * ctx.t), 1);
    else ctx.currentBranch(this.branch0, n['L']!, n['N']!, 0);
  }
  accept(ctx: Ctx) { this.idc = (ctx.v(this.n['DC+']!) - ctx.v(this.n['DC-']!)) * (this.run ? (5 + this.p.watts / 0.88) / Math.max(this.vin, 6) ** 2 : 0); }
}

const INV_PINS: PinDef[] = [
  { id: 'DC+', label: 'DC + (straight to battery +, via a 30–40 A fuse)', x: 0, y: 0 }, { id: 'DC-', label: 'DC − (battery −)', x: 2, y: 0 },
  { id: 'L', label: 'AC Live (230 V)', x: 12, y: 0 }, { id: 'N', label: 'AC Neutral', x: 14, y: 0 },
];
export const inverter: PartDef<InvProps> = {
  type: 'inverter', name: 'Inverter 300 W pure sine', category: 'Power', blurb: '12 V DC → 230 V AC',
  mount: 'free',
  box: () => ({ x: -1, y: -7, w: 17, h: 8 }),
  pins: () => INV_PINS,
  props: [{ key: 'on', label: 'Switch', type: 'bool' }, { key: 'watts', label: 'AC load', type: 'range', min: 0, max: 400, step: 5, unit: 'W' }],
  defaults: { on: true, watts: 50 },
  build(ctx, p) {
    const core = ctx.add(new InverterCore(Object.fromEntries(INV_PINS.map(q => [q.id, ctx.pin(q.id)])), { ...p }));
    return {
      read: () => ({ vin: core.vin, running: core.run, trip: core.trip, vac: core.run ? 230 : 0, idc: core.idc }),
      update: q => { if (!!q.on !== core.p.on) return false; core.p = { on: !!q.on, watts: +q.watts! }; return true; },
    };
  },
  info: [['Wiring', 'Directly on the battery with a 30–40 A fuse and 6 sq mm wire — never on the controller LOAD'], ['Idle draw', '4–7 W even with nothing plugged in'], ['Won’t run', 'Fridge, iron, kettle, mixer, cooler (too many watts or a big start surge)']],
  render: ({ live, props, act }) => (
    <g>
      <rect x={u(-1)} y={u(-7)} width={u(17)} height={u(7.6)} rx={6} fill="#cfd3d6" stroke={INK} strokeWidth={1.4} />
      {Array.from({ length: 10 }, (_, i) => <line key={i} x1={u(1 + i)} y1={u(-6.5)} x2={u(1 + i)} y2={u(-3)} stroke="#9aa1a7" />)}
      <g data-interactive onPointerDown={e => { e.stopPropagation(); act({ on: !props.on }); }} style={{ cursor: 'pointer' }}>
        <rect x={u(12)} y={u(-6.5)} width={u(2.6)} height={u(1.6)} rx={4} fill={props.on ? '#3fae66' : '#555'} stroke={INK} />
        <Label x={13.3} y={-5.4} size={7} color={PAPER}>{props.on ? 'ON' : 'OFF'}</Label>
      </g>
      <Label x={13.3} y={-3} size={8} color={live.trip ? '#d6452f' : INK}>{live.trip ? 'OVERLOAD' : live.running ? '230V~' : props.on ? 'LOW BATT' : ''}</Label>
      {INV_PINS.map(q => <PinDot key={q.id} x={q.x} y={q.y} />)}
    </g>
  ),
};

/* ───────────────────────── INA226 ───────────────────────── */

type InaProps = { shunt: string };
const INA_PINS: PinDef[] = [
  { id: 'IN+', label: 'IN+ (shunt, battery side)', x: 0, y: 0 }, { id: 'IN-', label: 'IN− (shunt, load side) · VBUS', x: 0, y: 2 },
  { id: 'VCC', label: 'VCC (3.3 V)', x: 5, y: 0 }, { id: 'GND', label: 'GND', x: 5, y: 1 }, { id: 'SDA', label: 'SDA (I2C data)', x: 5, y: 2 }, { id: 'SCL', label: 'SCL (I2C clock)', x: 5, y: 3 },
];
export const ina226Module: PartDef<InaProps> = {
  type: 'ina226-module', name: 'INA226 current/voltage sensor', category: 'Power', blurb: 'shunt + I2C power monitor',
  mount: 'free',
  box: () => ({ x: -1, y: -1, w: 7, h: 5 }),
  pins: () => INA_PINS,
  props: [{ key: 'shunt', label: 'Shunt', type: 'select', options: [['0.002', 'R002 (0.002 Ω, ~20 A)'], ['0.01', 'R010 (0.01 Ω)'], ['0.1', 'R100 (0.1 Ω, ~0.8 A)']] }],
  defaults: { shunt: '0.002' },
  build(ctx, p) {
    const a = ctx.pin('IN+'), b = ctx.pin('IN-'), vcc = ctx.pin('VCC'), gnd = ctx.pin('GND'), r = +p.shunt;
    ctx.add({ stamp: c => c.conductance(a, b, 1 / r) } as Element);
    ctx.add(new SwitchedLoad(vcc, gnd, v => v > 2.7 && v < 5.6 ? 3300 : 1e9));
    return {
      read: (_s, v) => {
        const powered = v('VCC') - v('GND') > 2.7, i = (v('IN+') - v('IN-')) / r;
        return { powered, amps: powered ? i : 0, shuntmV: powered ? (v('IN+') - v('IN-')) * 1000 : 0, bus: powered ? v('IN-') - v('GND') : 0, clip: Math.abs(i * r) > 0.08192 };
      },
    };
  },
  info: [['How it measures', 'Current makes a tiny voltage across the shunt: V = I × R'], ['High side', 'Put the shunt in the battery + line'], ['Range', '±81.92 mV across the shunt — pick the shunt for your current'], ['I2C', 'Talks to an ESP32/Arduino on SDA/SCL (not simulated yet)']],
  render: ({ live }) => (
    <g>
      <rect x={u(-1)} y={u(-1)} width={u(7)} height={u(5)} rx={4} fill="#6b3fa0" stroke={INK} strokeWidth={1.4} />
      <rect x={u(1.2)} y={u(0.4)} width={u(2)} height={u(0.8)} fill={live.clip ? '#d6452f' : '#cfd3d6'} stroke={INK} />
      <Label x={2.2} y={3.2} size={7} color={PAPER}>{live.powered ? `${(live.amps as number).toFixed(2)}A` : 'INA226'}</Label>
      {INA_PINS.map(q => <PinDot key={q.id} x={q.x} y={q.y} />)}
    </g>
  ),
};

export const powerParts: PartDef<any>[] = [chargeController, dcdcModule, dcFan, router, usbPhone, inverter, ina226Module];

