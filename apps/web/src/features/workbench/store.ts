'use client';
import type { SimEvent } from '@eb/engine';
import { getPart, type Live, type Props } from '@eb/parts';
import { create } from 'zustand';
import { GRID, prunePicos } from '@eb/parts';
import { buildCircuit, placedPins, type Built, type Doc, type Inst, type Wire, uid } from './model';

/** Zoom and pan so every part fits the visible canvas. */
function fitView(doc: Doc) {
  const el = typeof document !== 'undefined' ? document.querySelector('.wb-canvas') : null;
  const pts = doc.parts.flatMap(p => { const def = getPart(p.type), box = def?.box({ ...def.defaults, ...p.props }); return box ? [[p.x + box.x, p.y + box.y], [p.x + box.x + box.w, p.y + box.y + box.h]] : []; }).concat(doc.parts.flatMap(placedPins).map(p => [p.x, p.y]));
  if (!el || !pts.length) return null;
  const xs = pts.map(p => p[0]!), ys = pts.map(p => p[1]!), w = el.clientWidth, h = el.clientHeight;
  const x0 = Math.min(...xs) - 2, x1 = Math.max(...xs) + 2, y0 = Math.min(...ys) - 3, y1 = Math.max(...ys) + 2;
  const zoom = Math.min(3, Math.max(0.3, Math.min(w / ((x1 - x0) * GRID), h / ((y1 - y0) * GRID))));
  return { zoom, x: (w - (x1 - x0) * GRID * zoom) / 2 - x0 * GRID * zoom, y: (h - (y1 - y0) * GRID * zoom) / 2 - y0 * GRID * zoom };
}

export type Selection = { kind: 'part'; id: string } | { kind: 'wire'; id: string } | null;

interface State {
  doc: Doc;
  past: Doc[];
  future: Doc[];
  sel: Selection;
  view: { x: number; y: number; zoom: number };
  running: boolean;
  dt: number;
  live: Record<string, Live>;
  volts: Record<string, number>;
  simTime: number;
  speed: number;
  log: { t: number; e: SimEvent }[];
  wireColor: string;
  view3d: boolean;
  setView3d(v: boolean): void;
  serial: Record<string, string>;
  status: Record<string, { running: boolean; message?: string }>;
  clearSerial(id: string): void;

  commit(next: Doc): void;
  addPart(type: string, x: number, y: number): string;
  movePart(id: string, x: number, y: number, final?: boolean): void;
  rotate(id: string): void;
  setProps(id: string, patch: Props, transient?: boolean): void;
  addWire(a: string, b: string): void;
  rewire(id: string, end: 'a' | 'b', key: string, final: boolean): void;
  remove(sel: Selection): void;
  select(sel: Selection): void;
  undo(): void;
  redo(): void;
  load(doc: Doc): void;
  setView(v: Partial<State['view']>): void;
  fit(): void;
  setRunning(r: boolean): void;
  setDt(dt: number): void;
  setWireColor(c: string): void;
}

const KEY = 'eb.workbench.v1';
const empty: Doc = { parts: [], wires: [] };
const saved = (key: string): Doc | null => { try { return JSON.parse(localStorage.getItem(key) ?? '') as Doc; } catch { return null; } };

export const useBench = create<State>((set, get) => ({
  doc: empty, past: [], future: [], sel: null,
  view: { x: 40, y: 40, zoom: 1 },
  running: true, dt: 1e-4, live: {}, volts: {}, simTime: 0, speed: 1, log: [], wireColor: '#d6452f', serial: {}, status: {}, view3d: false,
  setView3d(v) { set({ view3d: v }); },
  clearSerial(id) { set(s => ({ serial: { ...s.serial, [id]: '' } })); },

  commit(next) { set(s => ({ doc: next, past: [...s.past.slice(-80), s.doc], future: [] })); runner.rebuild(); },
  addPart(type, x, y) {
    const def = getPart(type)!, id = uid(type.slice(0, 3));
    get().commit({ ...get().doc, parts: [...get().doc.parts, { id, type, x, y, rot: 0, props: { ...def.defaults, ...(def.program?.language === 'python' || def.program?.language === 'micropython' ? { sid: id } : {}) } }] });
    set({ sel: { kind: 'part', id } });
    return id;
  },
  movePart(id, x, y, final) {
    const doc = get().doc, before = doc.parts.find(p => p.id === id);
    if (!before) return;
    const next = { ...doc, parts: doc.parts.map(p => p.id === id ? { ...p, x, y } : p) };
    if (final) get().commit(next); else { set({ doc: next }); runner.rebuild(); }
  },
  rotate(id) { const d = get().doc; get().commit({ ...d, parts: d.parts.map(p => p.id === id ? { ...p, rot: ((p.rot + 1) % 4) as Inst['rot'] } : p) }); },
  setProps(id, patch, transient) {
    const d = get().doc, inst = d.parts.find(p => p.id === id);
    if (!inst) return;
    const props = { ...inst.props, ...patch } as Props;
    const next = { ...d, parts: d.parts.map(p => p.id === id ? { ...p, props } : p) };
    const rt = runner.built?.runtimes.get(id), def = getPart(inst.type);
    const applied = rt?.update?.({ ...def?.defaults, ...props }) ?? false;
    if (transient) set({ doc: next }); else set(s => ({ doc: next, past: [...s.past.slice(-80), s.doc], future: [] }));
    if (!applied) runner.rebuild();
  },
  addWire(a, b) {
    const d = get().doc;
    if (a === b || d.wires.some(w => (w.a === a && w.b === b) || (w.a === b && w.b === a))) return;
    const lead = (k: string) => { const inst = d.parts.find(p => k.startsWith(p.id + ':')); return inst && getPart(inst.type)?.leadColor?.[k.slice(inst.id.length + 1)]; };
    const w: Wire = { id: uid('w'), a, b, color: lead(a) ?? lead(b) ?? get().wireColor };
    get().commit({ ...d, wires: [...d.wires, w] });
  },
  rewire(id, end, key, final) {
    const d = get().doc, w = d.wires.find(x => x.id === id);
    if (!w || w[end] === key || w[end === 'a' ? 'b' : 'a'] === key) return;
    const next = { ...d, wires: d.wires.map(x => x.id === id ? { ...x, [end]: key } : x) };
    if (final) get().commit(next); else { set({ doc: next }); runner.rebuild(); }
  },
  remove(sel) {
    if (!sel) return;
    const d = get().doc;
    if (sel.kind === 'wire') get().commit({ ...d, wires: d.wires.filter(w => w.id !== sel.id) });
    else get().commit({ parts: d.parts.filter(p => p.id !== sel.id), wires: d.wires.filter(w => !w.a.startsWith(sel.id + ':') && !w.b.startsWith(sel.id + ':')) });
    set({ sel: null });
  },
  select(sel) { set({ sel }); },
  undo() { const { past, doc, future } = get(); if (!past.length) return; set({ doc: past[past.length - 1]!, past: past.slice(0, -1), future: [doc, ...future], sel: null }); runner.rebuild(); },
  redo() { const { past, doc, future } = get(); if (!future.length) return; set({ doc: future[0]!, past: [...past, doc], future: future.slice(1), sel: null }); runner.rebuild(); },
  load(doc) { set({ doc, past: [], future: [], sel: null, log: [] }); runner.rebuild(); get().fit(); },
  fit() {
    const v = fitView(get().doc);
    if (v) set({ view: v });
  },
  setView(v) { set(s => ({ view: { ...s.view, ...v } })); },
  setRunning(r) { set({ running: r }); },
  setDt(dt) { set({ dt }); runner.rebuild(); },
  setWireColor(c) { set({ wireColor: c }); },
}));

/** Owns the engine instance and steps it inside a per-frame time budget. */
class Runner {
  built: Built | null = null;
  private dirty = true;
  private raf = 0;
  private lastWall = 0;
  private lastPublish = 0;
  private stepsThisSecond = 0;
  private secondStart = 0;

  rebuild() { this.dirty = true; }

  private unsub: (() => void) | null = null;

  /** `key` is where the circuit autosaves; `initial` seeds it the first time (lessons use their own key). */
  start(opts: { key?: string; initial?: () => Doc; dt?: number } = {}) {
    if (this.raf) this.stop();
    const key = opts.key ?? KEY;
    useBench.setState({ doc: saved(key) ?? opts.initial?.() ?? empty, past: [], future: [], sel: null, log: [], serial: {}, status: {}, ...(opts.dt ? { dt: opts.dt } : {}) });
    this.dirty = true;
    requestAnimationFrame(() => useBench.getState().fit());
    this.unsub = useBench.subscribe((s, prev) => { if (s.doc !== prev.doc) localStorage.setItem(key, JSON.stringify(s.doc)); });
    const loop = (now: number) => { this.raf = requestAnimationFrame(loop); this.frame(now); };
    this.raf = requestAnimationFrame(loop);
  }

  stop() { cancelAnimationFrame(this.raf); this.raf = 0; this.unsub?.(); this.unsub = null; }

  private frame(now: number) {
    const st = useBench.getState();
    if (this.dirty) {
      this.dirty = false;
      const old = this.built;
      this.built = buildCircuit(st.doc, st.dt);
      if (old) for (const [id, rt] of old.runtimes) if (this.built.runtimes.get(id) !== rt) rt.dispose?.();
      const py = (globalThis as { BenchHost?: { python?: { prune(keep: string[]): void } } }).BenchHost?.python;
      py?.prune(st.doc.parts.filter(p => p.type === 'rpi4').map(p => String(p.props.sid ?? p.id)));
      prunePicos(st.doc.parts.filter(p => p.type === 'pico').map(p => String(p.props.sid ?? p.id)));
      this.built.sim.onEvent = e => useBench.setState(s => ({ log: [...s.log.slice(-60), { t: this.built!.sim.t, e }] }));
      this.built.sim.op();
      this.bindSamplers(st);
      for (const msg of this.built.errors) useBench.setState(s => ({ log: [...s.log, { t: 0, e: { kind: 'build', severity: 'error', message: msg } }] }));
      this.publish(st);
    }
    const b = this.built!;
    const wall = Math.min(0.05, (now - (this.lastWall || now)) / 1000);
    this.lastWall = now;
    if (st.running && wall > 0) {
      const want = Math.max(1, Math.round(wall / b.sim.dt)), t0 = performance.now();
      let n = 0;
      while (n < want && performance.now() - t0 < 9) {
        b.sim.step(); n++;
        for (const [fn, v] of this.samplers) fn(b.sim, v);
      }
      this.stepsThisSecond += n;
    }
    if (now - this.secondStart > 1000) {
      useBench.setState({ speed: this.stepsThisSecond * b.sim.dt / ((now - this.secondStart) / 1000 || 1) });
      this.stepsThisSecond = 0; this.secondStart = now;
    }
    if (now - this.lastPublish > 60) { this.lastPublish = now; this.publish(st); }
  }

  private samplers: [NonNullable<import('@eb/parts').Runtime['sample']>, (pin: string) => number][] = [];

  private bindSamplers(st: State) {
    const b = this.built!;
    this.samplers = [];
    for (const inst of st.doc.parts) {
      const rt = b.runtimes.get(inst.id);
      if (!rt?.sample) continue;
      const cache = new Map<string, number>();
      const v = (pin: string) => { let n = cache.get(pin); if (n == null) { n = b.node.get(`${inst.id}:${pin}`) ?? 0; cache.set(pin, n); } return b.sim.v(n); };
      this.samplers.push([rt.sample.bind(rt), v]);
    }
  }

  private publish(st: State) {
    const b = this.built;
    if (!b) return;
    const v = (k: string) => b.sim.v(b.node.get(k) ?? 0), live: Record<string, Live> = {}, volts: Record<string, number> = {};
    for (const inst of st.doc.parts) {
      const rt = b.runtimes.get(inst.id);
      if (rt?.read) live[inst.id] = rt.read(b.sim, pin => v(`${inst.id}:${pin}`));
    }
    for (const [k, n] of b.node) if (b.connected.has(k)) volts[k] = b.sim.v(n);
    let serial = st.serial, status = st.status;
    for (const [id, rt] of b.runtimes) {
      const text = rt.serial?.read();
      if (text) serial = { ...serial, [id]: ((serial[id] ?? '') + text).slice(-20000) };
      const s = rt.status?.();
      if (s && (s.running !== status[id]?.running || s.message !== status[id]?.message)) status = { ...status, [id]: s };
    }
    useBench.setState({ live, volts, simTime: b.sim.t, serial, status });
  }
}

export const runner = new Runner();
