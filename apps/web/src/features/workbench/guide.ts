import { getPart, type Props } from '@eb/parts';
import { create } from 'zustand';
import { placedPins, uid, type Doc, type Inst, type Wire } from './model';

/** A pin reference: `type#n:pin`, the nth part of a type; a pin ending in `*` means the nearest pin with that prefix. */
export type Ref = string;
export type Act =
  | { add: string; x: number; y: number; props?: Props; rot?: Inst['rot'] }
  | { wire: [Ref, Ref]; color?: string }
  | { unwire: [Ref, Ref] }
  | { set: string; props: Props; say?: string };

export interface Hand { x: number; y: number; down: boolean; carry?: string; ms: number }
interface GuideState {
  /** What the current lesson step demonstrates; drives the glows and the "Show me" button. */
  acts: Act[] | null;
  base: Doc | null;
  playing: 'demo' | 'build' | null;
  stop: boolean;
  hand: Hand | null;
  line: { x1: number; y1: number; x2: number; y2: number; color: string; ms: number } | null;
  bubble: { x: number; y: number; text: string } | null;
  banner: string | null;
}

export const useGuide = create<GuideState>(() => ({ acts: null, base: null, playing: null, stop: false, hand: null, line: null, bubble: null, banner: null }));

export function partRef(doc: Doc, ref: string): Inst | undefined {
  const [type, n] = ref.split('#');
  return doc.parts.filter(p => p.type === type)[Number(n ?? 0)];
}

export function pinPos(doc: Doc, key: string) {
  const id = key.slice(0, key.indexOf(':')), inst = doc.parts.find(p => p.id === id);
  return inst && placedPins(inst).find(p => p.key === key);
}

/** Resolves a ref to a pin key; wildcards pick the pin nearest `near`. */
export function resolve(doc: Doc, ref: Ref, near?: { x: number; y: number }): string | null {
  const i = ref.lastIndexOf(':'), inst = partRef(doc, ref.slice(0, i)), pin = ref.slice(i + 1);
  if (!inst) return null;
  if (!pin.endsWith('*')) return `${inst.id}:${pin}`;
  const pre = pin.slice(0, -1), pins = placedPins(inst).filter(p => p.pin.id.startsWith(pre) && /^\d+$/.test(p.pin.id.slice(pre.length)));
  if (!pins.length) return null;
  const d = (p: { x: number; y: number }) => near ? (p.x - near.x) ** 2 + (p.y - near.y) ** 2 : 0;
  return pins.reduce((a, b) => d(b) < d(a) ? b : a).key;
}

export function resolveWire(doc: Doc, [a, b]: [Ref, Ref]): [string, string] | null {
  const wild = (r: Ref) => r.endsWith('*');
  const [first, second] = wild(a) && !wild(b) ? [b, a] : [a, b];
  const k1 = resolve(doc, first), p1 = k1 ? pinPos(doc, k1) : undefined, k2 = resolve(doc, second, p1);
  if (!k1 || !k2) return null;
  return first === a ? [k1, k2] : [k2, k1];
}

/** Part types still to add and pins still to join for this step, for highlighting. */
export function pending(acts: Act[] | null, base: Doc | null, doc: Doc, joined: (a: string, b: string) => boolean) {
  const types: string[] = [], pins: string[] = [];
  if (!acts) return { types, pins };
  const want = new Map<string, number>();
  for (const a of acts) if ('add' in a) want.set(a.add, (want.get(a.add) ?? 0) + 1);
  for (const [type, n] of want) {
    const had = base?.parts.filter(p => p.type === type).length ?? 0;
    if (doc.parts.filter(p => p.type === type).length < had + n) types.push(type);
  }
  if (!types.length) for (const a of acts) {
    if (!('wire' in a)) continue;
    const r = resolveWire(doc, a.wire);
    if (r && !joined(r[0], r[1])) { pins.push(...r); break; }
  }
  return { types, pins };
}

/** The acts that build a whole circuit, part by part and then wire by wire. */
export function actsFor(doc: Doc): Act[] {
  const ref = new Map<string, string>(), count = new Map<string, number>();
  const acts: Act[] = doc.parts.map(p => {
    const n = count.get(p.type) ?? 0;
    count.set(p.type, n + 1); ref.set(p.id, `${p.type}#${n}`);
    return { add: p.type, x: p.x, y: p.y, props: p.props, rot: p.rot };
  });
  const r = (k: string) => { const i = k.indexOf(':'); return `${ref.get(k.slice(0, i))}:${k.slice(i + 1)}`; };
  for (const w of doc.wires) acts.push({ wire: [r(w.a), r(w.b)], color: w.color });
  return acts;
}

/** The wire an `unwire` act removes: an exact match, or one from the first pin into the second pin's net. */
export function findWire(doc: Doc, [ra, rb]: [Ref, Ref], joined: (a: string, b: string) => boolean): Wire | undefined {
  const ka = resolve(doc, ra), kb = resolve(doc, rb);
  if (!ka || !kb) return undefined;
  return doc.wires.find(x => (x.a === ka && x.b === kb) || (x.a === kb && x.b === ka))
    ?? doc.wires.find(x => (x.a === ka && joined(x.b, kb)) || (x.b === ka && joined(x.a, kb)));
}

/** The circuit after one act; the demo player animates exactly this edit. */
export function applyAct(doc: Doc, a: Act, joined: (a: string, b: string) => boolean): Doc {
  if ('add' in a) {
    const def = getPart(a.add);
    return { ...doc, parts: [...doc.parts, { id: uid(a.add.slice(0, 3)), type: a.add, x: a.x, y: a.y, rot: a.rot ?? 0, props: { ...def?.defaults, ...a.props } }] };
  }
  if ('wire' in a) {
    const r = resolveWire(doc, a.wire);
    if (!r || joined(r[0], r[1])) return doc;
    return { ...doc, wires: [...doc.wires, { id: uid('w'), a: r[0], b: r[1], color: a.color ?? '#d6452f' }] };
  }
  if ('unwire' in a) { const w = findWire(doc, a.unwire, joined); return w ? { ...doc, wires: doc.wires.filter(x => x !== w) } : doc; }
  const inst = partRef(doc, a.set);
  return inst ? { ...doc, parts: doc.parts.map(p => p === inst ? { ...p, props: { ...p.props, ...a.props } } : p) } : doc;
}
