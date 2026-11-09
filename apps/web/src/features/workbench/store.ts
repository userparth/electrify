'use client';
import { getPart, GRID, type Live, type Props } from '@eb/parts';
import { create } from 'zustand';
import { placedPins, type Doc, type Inst, type Wire, uid } from './model';
import type { FromSim, LogEntry, ToSim } from './protocol';

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
  log: LogEntry[];
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
    if (transient) set({ doc: next }); else set(s => ({ doc: next, past: [...s.past.slice(-80), s.doc], future: [] }));
    runner.setProps(id, props);
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

/** Drives the simulation worker: sends it the circuit and mirrors what it reports into the store. */
class Runner {
  /** Net id per pin key, from the last circuit the worker built. */
  net = new Map<string, string>();
  private worker: Worker | null = null;
  private dirty = false;
  private raf = 0;
  private sentVer = 0;
  private frameVer = -1;
  private unsub: (() => void) | null = null;

  /** True once the worker has simulated the doc currently in the store. */
  // The worker posts `built` before the first frame of a rebuild; in-place prop updates only send a frame.
  synced() { return !this.dirty && this.frameVer === this.sentVer; }

  rebuild() { this.dirty = true; }

  private send(m: ToSim) { this.worker?.postMessage(m); }

  private ensureWorker() {
    if (this.worker) return;
    const w = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<FromSim>) => this.receive(e.data);
    w.onerror = e => useBench.setState(s => ({ log: [...s.log, { t: s.simTime, e: { kind: 'worker', severity: 'error', message: `Simulator crashed: ${e.message}` } }] }));
    this.worker = w;
  }

  /** `key` is where the circuit autosaves; `initial` seeds it the first time (lessons use their own key). */
  start(opts: { key?: string; initial?: () => Doc; dt?: number } = {}) {
    if (this.raf) this.stop();
    this.ensureWorker();
    const key = opts.key ?? KEY;
    useBench.setState({ doc: saved(key) ?? opts.initial?.() ?? empty, past: [], future: [], sel: null, log: [], serial: {}, status: {}, live: {}, volts: {}, ...(opts.dt ? { dt: opts.dt } : {}) });
    this.net = new Map();
    this.dirty = true;
    this.send({ type: 'running', running: useBench.getState().running });
    requestAnimationFrame(() => useBench.getState().fit());
    this.unsub = useBench.subscribe((s, prev) => {
      if (s.doc !== prev.doc) localStorage.setItem(key, JSON.stringify(s.doc));
      if (s.running !== prev.running) this.send({ type: 'running', running: s.running });
    });
    const loop = () => { this.raf = requestAnimationFrame(loop); this.flush(); };
    this.flush();
    this.raf = requestAnimationFrame(loop);
  }

  stop() { cancelAnimationFrame(this.raf); this.raf = 0; this.unsub?.(); this.unsub = null; this.dirty = false; this.send({ type: 'stop' }); }

  private flush() {
    if (!this.dirty) return;
    this.dirty = false;
    const st = useBench.getState();
    this.send({ type: 'doc', ver: ++this.sentVer, doc: st.doc, dt: st.dt });
  }

  /** Applies a prop change in place when the part supports it, else the worker rebuilds. */
  setProps(id: string, props: Props) {
    if (this.dirty) return;
    this.send({ type: 'props', ver: ++this.sentVer, doc: useBench.getState().doc, id, props });
  }

  serialWrite(id: string, text: string) { this.send({ type: 'serial', id, text }); }

  private receive(m: FromSim) {
    if (m.type === 'built') {
      this.net = m.net;
      if (m.errors.length) useBench.setState(s => ({ log: [...s.log, ...m.errors.map(message => ({ t: 0, e: { kind: 'build', severity: 'error' as const, message } }))] }));
      return;
    }
    this.frameVer = m.ver;
    useBench.setState(s => {
      let serial = s.serial;
      for (const [id, text] of Object.entries(m.serial)) serial = { ...serial, [id]: ((serial[id] ?? '') + text).slice(-20000) };
      return {
        live: m.live, volts: m.volts, simTime: m.simTime, serial,
        ...(Object.keys(m.status).length ? { status: { ...s.status, ...m.status } } : {}),
        ...(m.log.length ? { log: [...s.log, ...m.log].slice(-60) } : {}),
        ...(m.speed != null ? { speed: m.speed } : {}),
      };
    });
  }
}

export const runner = new Runner();
