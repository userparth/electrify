import { getPart, prunePicos, type Live, type Runtime } from '@eb/parts';
import { registerFirmwareHost } from '../firmware/host';
import { registerPythonHost } from '../python/host';
import { buildCircuit, type Built, type Doc } from './model';
import type { FromSim, LogEntry, ToSim } from './protocol';

registerPythonHost();
registerFirmwareHost();

const post = (m: FromSim) => (self as unknown as Worker).postMessage(m);
const SLICE_MS = 12, MAX_LAG_S = 0.05, PUBLISH_MS = 33;

let built: Built | null = null, doc: Doc = { parts: [], wires: [] }, dt = 1e-4, ver = 0, running = true;
let samplers: [NonNullable<Runtime['sample']>, (pin: string) => number][] = [];
let log: LogEntry[] = [], serial: Record<string, string> = {}, lastStatus: Record<string, { running: boolean; message?: string }> = {};
let owed = 0, lastWall = 0, lastPublish = 0, stepsAcc = 0, secondStart = 0, speed: number | undefined;
let pendingRebuild = false;

function rebuild() {
  pendingRebuild = false;
  const old = built;
  built = buildCircuit(doc, dt);
  if (old) for (const [id, rt] of old.runtimes) if (built.runtimes.get(id) !== rt) rt.dispose?.();
  const py = (globalThis as { BenchHost?: { python?: { prune(keep: string[]): void } } }).BenchHost?.python;
  py?.prune(doc.parts.filter(p => p.type === 'rpi4').map(p => String(p.props.sid ?? p.id)));
  prunePicos(doc.parts.filter(p => p.type === 'pico').map(p => String(p.props.sid ?? p.id)));
  const b = built;
  b.sim.onEvent = e => { log.push({ t: b.sim.t, e: { kind: e.kind, message: e.message, severity: e.severity } }); if (log.length > 60) log = log.slice(-60); };
  b.sim.op();
  samplers = [];
  for (const inst of doc.parts) {
    const rt = b.runtimes.get(inst.id);
    if (!rt?.sample) continue;
    const cache = new Map<string, number>();
    const v = (pin: string) => { let n = cache.get(pin); if (n == null) { n = b.node.get(`${inst.id}:${pin}`) ?? 0; cache.set(pin, n); } return b.sim.v(n); };
    samplers.push([rt.sample.bind(rt), v]);
  }
  owed = 0;
  post({ type: 'built', ver, net: b.net, errors: b.errors });
  publish();
}

function publish() {
  const b = built;
  if (!b) return;
  lastPublish = performance.now();
  const v = (k: string) => b.sim.v(b.node.get(k) ?? 0), live: Record<string, Live> = {}, volts: Record<string, number> = {};
  for (const inst of doc.parts) {
    const rt = b.runtimes.get(inst.id);
    if (rt?.read) live[inst.id] = rt.read(b.sim, pin => v(`${inst.id}:${pin}`));
  }
  for (const [k, n] of b.node) if (b.connected.has(k)) volts[k] = b.sim.v(n);
  const status: typeof lastStatus = {};
  for (const [id, rt] of b.runtimes) {
    const text = rt.serial?.read();
    if (text) serial[id] = (serial[id] ?? '') + text;
    const s = rt.status?.();
    if (s && (s.running !== lastStatus[id]?.running || s.message !== lastStatus[id]?.message)) status[id] = s;
  }
  Object.assign(lastStatus, status);
  post({ type: 'frame', ver, live, volts, simTime: b.sim.t, serial, status, log, speed });
  serial = {}; log = []; speed = undefined;
}

function tick() {
  if (pendingRebuild) rebuild();
  const now = performance.now(), b = built;
  if (b && running) {
    owed = Math.min(owed + Math.min(MAX_LAG_S, (now - (lastWall || now)) / 1000) / b.sim.dt, MAX_LAG_S / b.sim.dt);
    let n = 0;
    while (owed >= 1 && performance.now() - now < SLICE_MS) {
      b.sim.step(); n++; owed--;
      for (const [fn, v] of samplers) fn(b.sim, v);
    }
    stepsAcc += n;
  }
  lastWall = now;
  if (now - secondStart > 1000) {
    if (b) speed = running ? stepsAcc * b.sim.dt / ((now - secondStart) / 1000 || 1) : 1;
    stepsAcc = 0; secondStart = now;
  }
  if (now - lastPublish > PUBLISH_MS) publish();
  schedule(b && running && owed >= 1 ? 0 : 4);
}

const chan = new MessageChannel();
chan.port1.onmessage = tick;
let timer: ReturnType<typeof setTimeout> | null = null, active = false;
function schedule(ms: number) {
  if (!active) return;
  if (ms === 0) chan.port2.postMessage(null);
  else timer = setTimeout(tick, ms);
}
function start() { if (active) return; active = true; lastWall = 0; secondStart = performance.now(); schedule(0); }

self.onmessage = (e: MessageEvent<ToSim>) => {
  const m = e.data;
  if (m.type === 'doc') { doc = m.doc; dt = m.dt; ver = m.ver; pendingRebuild = true; serial = {}; lastStatus = {}; start(); }
  else if (m.type === 'props') {
    doc = m.doc; ver = m.ver;
    const rt = built?.runtimes.get(m.id), inst = doc.parts.find(p => p.id === m.id), def = inst && getPart(inst.type);
    if (!rt?.update?.({ ...def?.defaults, ...m.props })) pendingRebuild = true;
    else publish();
  }
  else if (m.type === 'running') running = m.running;
  else if (m.type === 'serial') built?.runtimes.get(m.id)?.serial?.write(m.text);
  else if (m.type === 'stop') {
    active = false;
    if (timer) clearTimeout(timer);
    if (built) for (const rt of built.runtimes.values()) rt.dispose?.();
    built = null;
  }
};
