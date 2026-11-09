import { Circuit, Simulator, type Element } from '@eb/engine';
import { getPart, type PartDef, type PinDef, type Props, type Runtime } from '@eb/parts';

export interface Inst { id: string; type: string; x: number; y: number; rot: 0 | 1 | 2 | 3; props: Props }
export interface Wire { id: string; a: string; b: string; color: string }
export interface Doc { parts: Inst[]; wires: Wire[] }

/** A pin key is `${instId}:${pinId}`. */
export const pinKey = (inst: string, pin: string) => `${inst}:${pin}`;
export const splitKey = (k: string) => { const i = k.indexOf(':'); return [k.slice(0, i), k.slice(i + 1)] as const; };

export function rotate(x: number, y: number, rot: number): [number, number] {
  switch (rot & 3) {
    case 1: return [-y, x];
    case 2: return [-x, -y];
    case 3: return [y, -x];
    default: return [x, y];
  }
}

export interface PlacedPin { key: string; inst: Inst; def: PartDef; pin: PinDef; x: number; y: number }

export function placedPins(inst: Inst): PlacedPin[] {
  const def = getPart(inst.type);
  if (!def) return [];
  return def.pins({ ...def.defaults, ...inst.props }).map(pin => {
    const [rx, ry] = rotate(pin.x, pin.y, inst.rot);
    return { key: pinKey(inst.id, pin.id), inst, def, pin, x: inst.x + rx, y: inst.y + ry };
  });
}

class UnionFind {
  private p = new Map<string, string>();
  find(a: string): string {
    let r = this.p.get(a) ?? a;
    if (r === a) { this.p.set(a, a); return a; }
    r = this.find(r);
    this.p.set(a, r);
    return r;
  }
  union(a: string, b: string) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.p.set(ra, rb); }
}

export interface Built {
  circuit: Circuit;
  sim: Simulator;
  runtimes: Map<string, Runtime>;
  node: Map<string, number>;
  /** Net id (union root) per pin key, for highlighting what is connected. */
  net: Map<string, string>;
  /** Pins that share a net with at least one other pin. */
  connected: Set<string>;
  errors: string[];
}

export function buildCircuit(doc: Doc, dt: number): Built {
  const uf = new UnionFind(), all: PlacedPin[] = [], holes = new Map<string, string>(), errors: string[] = [];
  for (const inst of doc.parts) {
    const pins = placedPins(inst);
    all.push(...pins);
    for (const p of pins) uf.find(p.key);
    const def = getPart(inst.type);
    for (const group of def?.nets?.({ ...def.defaults, ...inst.props }) ?? []) for (let i = 1; i < group.length; i++) uf.union(pinKey(inst.id, group[0]!), pinKey(inst.id, group[i]!));
    if (inst.type === 'breadboard') for (const p of pins) holes.set(`${p.x},${p.y}`, p.key);
  }
  for (const p of all) {
    if (p.inst.type === 'breadboard' || (p.def.mount ?? 'board') !== 'board') continue;
    const hole = holes.get(`${p.x},${p.y}`);
    if (hole) uf.union(p.key, hole);
  }
  for (const w of doc.wires) uf.union(w.a, w.b);

  const net = new Map<string, string>(), members = new Map<string, number>();
  for (const p of all) { const r = uf.find(p.key); net.set(p.key, r); members.set(r, (members.get(r) ?? 0) + 1); }
  const connected = new Set(all.filter(p => (members.get(net.get(p.key)!) ?? 0) > 1).map(p => p.key));

  const circuit = new Circuit(), node = new Map<string, number>(), rootNode = new Map<string, number>();
  const groundRoots = new Set(all.filter(p => p.pin.ground).map(p => net.get(p.key)!));
  const firstGround = [...groundRoots][0];
  // Nodes are created lazily so empty breadboard strips don't grow the matrix.
  const nodeOf = (key: string) => {
    const r = net.get(key) ?? key;
    let k = rootNode.get(r);
    if (k == null) { k = r === firstGround ? 0 : circuit.node(); rootNode.set(r, k); }
    return k;
  };

  const runtimes = new Map<string, Runtime>();
  for (const inst of doc.parts) {
    const def = getPart(inst.type);
    if (!def) { errors.push(`Unknown part type ${inst.type}`); continue; }
    const props = { ...def.defaults, ...inst.props };
    try {
      runtimes.set(inst.id, def.build({
        circuit,
        pin: id => nodeOf(pinKey(inst.id, id)),
        internal: () => circuit.node(),
        add: <T extends Element>(e: T) => circuit.add(e),
      }, props));
    } catch (e) { errors.push(`${def.name}: ${(e as Error).message}`); }
  }
  for (const p of all) { const k = rootNode.get(net.get(p.key)!); if (k != null) node.set(p.key, k); }
  const sim = new Simulator(circuit, { dt });
  return { circuit, sim, runtimes, node, net, connected, errors };
}

export const uid = (p: string) => `${p}${Math.random().toString(36).slice(2, 8)}`;
