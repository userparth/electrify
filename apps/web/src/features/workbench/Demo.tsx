'use client';
import { GRID, getPart } from '@eb/parts';
import { t } from '@/lib/i18n';
import { actsFor, applyAct, findWire, partRef, pinPos, resolve, resolveWire, useGuide, type Act } from './guide';
import type { Doc } from './model';
import { fitView, runner, useBench } from './store';

class Stopped extends Error {}
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
let speed = 1;
async function wait(ms: number) { await sleep(ms / speed); if (useGuide.getState().stop) throw new Stopped(); }
async function settled() { for (let i = 0; i < 40 && !runner.synced(); i++) await sleep(25); }
const joined = (a: string, b: string) => !!runner.net.get(a) && runner.net.get(a) === runner.net.get(b);

function toScreen(wx: number, wy: number) {
  const r = document.querySelector('.wb-canvas')?.getBoundingClientRect(), v = useBench.getState().view;
  return { x: (r?.left ?? 0) + v.x + wx * GRID * v.zoom, y: (r?.top ?? 0) + v.y + wy * GRID * v.zoom };
}

function paletteSpot(type: string) {
  const el = document.querySelector<HTMLElement>(`.wb-pal[data-type="${type}"]`);
  if (el?.offsetParent) { el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.left + 34, y: r.top + r.height / 2 }; }
  const tab = document.querySelector('.mb-tabs button')?.getBoundingClientRect();
  return tab ? { x: tab.left + tab.width / 2, y: tab.top + 14 } : { x: innerWidth / 2, y: innerHeight - 40 };
}

async function moveHand(p: { x: number; y: number }, ms: number, extra: { down?: boolean; carry?: string } = {}) {
  const h = useGuide.getState().hand;
  useGuide.setState({ hand: { x: p.x, y: p.y, down: extra.down ?? h?.down ?? false, carry: extra.carry, ms: h ? ms / speed : 0 } });
  await wait(ms);
}
const press = (down: boolean) => useGuide.setState(s => ({ hand: s.hand && { ...s.hand, down, ms: 120 } }));

function partCenter(doc: Doc, ref: string) {
  const inst = partRef(doc, ref), def = inst && getPart(inst.type);
  if (!inst || !def) return null;
  const box = def.box({ ...def.defaults, ...inst.props });
  return toScreen(inst.x + box.x + box.w / 2, inst.y + box.y + box.h / 2);
}

function commit(doc: Doc, a: Act) {
  const next = applyAct(doc, a, joined);
  if (next !== doc) { useBench.setState({ doc: next, sel: null }); runner.rebuild(); }
  return next;
}

async function step(a: Act) {
  const doc = useBench.getState().doc;
  if ('add' in a) {
    await moveHand(paletteSpot(a.add), 500); press(true); await wait(200);
    await moveHand(toScreen(a.x, a.y), 650, { down: true, carry: getPart(a.add)?.name ?? a.add });
    commit(doc, a); press(false); await wait(300);
  } else if ('wire' in a) {
    await settled();
    const r = resolveWire(doc, a.wire), p1 = r && pinPos(doc, r[0]), p2 = r && pinPos(doc, r[1]);
    if (!r || !p1 || !p2 || joined(r[0], r[1])) return;
    const s1 = toScreen(p1.x, p1.y), s2 = toScreen(p2.x, p2.y);
    await moveHand(s1, 550); press(true); await wait(200);
    useGuide.setState({ line: { x1: s1.x, y1: s1.y, x2: s2.x, y2: s2.y, color: a.color ?? '#d6452f', ms: 600 / speed } });
    await moveHand(s2, 600, { down: true });
    commit(doc, a); useGuide.setState({ line: null }); press(false); await wait(300);
  } else if ('unwire' in a) {
    await settled();
    const w = findWire(doc, a.unwire, joined), pa = w && pinPos(doc, w.a), pb = w && pinPos(doc, w.b);
    if (!w || !pa || !pb) return;
    await moveHand(toScreen((pa.x + pb.x) / 2, (pa.y + pb.y) / 2), 550); press(true); await wait(180);
    commit(doc, a); press(false); await wait(350);
  } else if ('remove' in a || 'point' in a) {
    const ref = 'remove' in a ? a.remove : a.point, at = ref.includes(':') ? resolve(doc, ref) : null, pin = at && pinPos(doc, at);
    const c = pin ? toScreen(pin.x, pin.y) : partCenter(doc, ref);
    if (!c) return;
    await moveHand(c, 550); press(true); await wait(180); press(false);
    if ('point' in a) { useGuide.setState({ bubble: { x: c.x, y: c.y - 30, text: a.say } }); await wait(2600); useGuide.setState({ bubble: null }); }
    else { commit(doc, a); await wait(350); }
  } else {
    const inst = partRef(doc, a.set), def = inst && getPart(inst.type);
    if (!inst || !def) return;
    const box = def.box({ ...def.defaults, ...inst.props }), c = toScreen(inst.x + box.x + box.w / 2, inst.y + box.y + box.h / 2);
    await moveHand(c, 550); press(true); await wait(180); press(false);
    useGuide.setState({ bubble: { x: c.x, y: c.y - 30, text: a.say ?? Object.entries(a.props).map(([k, v]) => `${k}: ${v}`).join(', ') } });
    commit(doc, a); await wait(1400);
    useGuide.setState({ bubble: null });
  }
}

const clear = { playing: null, stop: false, hand: null, line: null, bubble: null } as const;
const paletteTop = () => document.querySelector('.wb-palette')?.scrollTo({ top: 0, behavior: 'smooth' });

async function enter2d() {
  const st = useBench.getState(), was3d = st.view3d;
  st.setWireMode(false); st.select(null);
  if (was3d) { st.setView3d(false); for (let i = 0; i < 20 && !document.querySelector('.wb-canvas svg'); i++) await sleep(30); await sleep(60); }
  return was3d;
}

/** Plays a lesson step on the real bench, then puts the student's circuit back. */
export async function showMe(acts: Act[]) {
  if (useGuide.getState().playing) return;
  const st = useBench.getState(), snap = { doc: st.doc, past: st.past, future: st.future, view: st.view };
  useGuide.setState({ playing: 'demo', stop: false, banner: null });
  speed = 1;
  const was3d = await enter2d();
  const added = acts.flatMap(a => 'add' in a ? [{ id: `demo${a.x},${a.y}`, type: a.add, x: a.x, y: a.y, rot: a.rot ?? 0, props: { ...getPart(a.add)?.defaults, ...a.props } }] : []);
  if (added.length) { const v = fitView({ ...snap.doc, parts: [...snap.doc.parts, ...added] }); if (v) useBench.setState({ view: v }); }
  try { for (const a of acts) await step(a); await wait(900); } catch (e) { if (!(e instanceof Stopped)) throw e; }
  useBench.setState({ doc: snap.doc, past: snap.past, future: snap.future, sel: null, view: snap.view }); runner.rebuild();
  if (was3d) useBench.getState().setView3d(true);
  paletteTop();
  useGuide.setState({ ...clear, banner: t('demo.yourTurn') });
  await sleep(1800);
  if (!useGuide.getState().playing) useGuide.setState({ banner: null });
}

/** Loads a circuit by building it in front of the student, part by part. */
export async function buildAnimated(final: Doc, dt?: number) {
  if (useGuide.getState().playing) return;
  const st = useBench.getState();
  if (dt) st.setDt(dt);
  useGuide.setState({ playing: 'build', stop: false, banner: null });
  speed = 2.2;
  const was3d = await enter2d();
  useBench.setState({ doc: { parts: [], wires: [] }, past: [], future: [], sel: null, log: [] }); runner.rebuild();
  const v = fitView(final); if (v) useBench.setState({ view: v });
  try { for (const a of actsFor(final)) await step(a); await wait(500); } catch (e) { if (!(e instanceof Stopped)) throw e; }
  useGuide.setState(clear);
  paletteTop();
  useBench.getState().load(final);
  if (was3d) useBench.getState().setView3d(true);
}

export function DemoLayer() {
  const { playing, hand, line, bubble, banner } = useGuide();
  if (!playing && !banner) return null;
  const len = line ? Math.hypot(line.x2 - line.x1, line.y2 - line.y1) : 0;
  return (
    <div className="demo" aria-live="polite">
      {line && <svg className="demo-svg"><line key={`${line.x1},${line.y1},${line.x2}`} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke={line.color} strokeWidth={4} strokeLinecap="round" strokeDasharray={len} style={{ ['--len' as string]: len, animationDuration: `${line.ms}ms` }} /></svg>}
      {hand && (
        <div className={`demo-hand ${hand.down ? 'down' : ''}`} style={{ transform: `translate(${hand.x}px,${hand.y}px)`, transitionDuration: `${hand.ms}ms` }}>
          <i className="demo-dot" /><span className="demo-finger" aria-hidden>👆</span>{hand.carry && <b className="demo-carry">{hand.carry}</b>}
        </div>
      )}
      {bubble && <div className="demo-bubble" style={{ left: bubble.x, top: bubble.y }}>{bubble.text}</div>}
      <div className="demo-bar">
        {playing ? <><span>{playing === 'demo' ? t('demo.watching') : t('demo.building')}</span><button className="btn" onClick={() => useGuide.setState({ stop: true })}>{playing === 'demo' ? t('demo.stop') : t('demo.skip')}</button></> : <span>{banner}</span>}
      </div>
    </div>
  );
}
