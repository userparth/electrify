'use client';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t } from '@/lib/i18n';
import type { MessageKey } from '@/messages/en';
import { loadProfile, useProfile } from '@/lib/profile';
import { useBench } from '../workbench/store';

type StepId = 'add' | 'move' | 'wire' | 'select' | '3d' | 'end';
interface Step { id: StepId; text: [MessageKey, MessageKey]; anchor: [string, string] }

// [desktop, phone] for text and the element to point at.
const STEPS: Step[] = [
  { id: 'add', text: ['tour.add.desk', 'tour.add.phone'], anchor: ['.wb-palette', '.mb-tabs button:first-child'] },
  { id: 'move', text: ['tour.move.desk', 'tour.move.phone'], anchor: ['.wb-center .wb-canvas', '.mb-stage'] },
  { id: 'wire', text: ['tour.wire.desk', 'tour.wire.phone'], anchor: ['.wb-center .wb-canvas', '.mb-fab'] },
  { id: 'select', text: ['tour.select', 'tour.select'], anchor: ['.wb-center .wb-canvas', '.mb-stage'] },
  { id: '3d', text: ['tour.3d', 'tour.3d'], anchor: ['.wb-head .wb-seg', '.mb-top .wb-seg'] },
  { id: 'end', text: ['tour.end', 'tour.end'], anchor: ['.wb-head', '.mb-top'] },
];

/** Snapshot of what each step watches, so a step only counts what happened after it started. */
function snap() {
  const s = useBench.getState();
  return { parts: s.doc.parts.length, wires: s.doc.wires.length, past: s.past.length, pos: s.doc.parts.map(p => `${p.id}@${p.x},${p.y},${p.rot}`).join('|') };
}

export function BenchTour({ phone }: { phone: boolean }) {
  const loaded = useProfile(s => s.loaded), profile = useProfile(s => s.profile), setProfile = useProfile(s => s.set);
  const [i, setI] = useState(0), [rect, setRect] = useState<DOMRect | null>(null);
  const base = useRef(snap());
  useEffect(() => { loadProfile(); }, []);
  const active = loaded && profile.done && !profile.tourDone;
  const step = STEPS[i]!, k = phone ? 1 : 0;

  // The bench loads its saved circuit right after mount, so take the starting point a frame later.
  useEffect(() => { const r = requestAnimationFrame(() => { base.current = snap(); }); return () => cancelAnimationFrame(r); }, [i, active]);
  useEffect(() => {
    if (!active) return;
    return useBench.subscribe(s => {
      const b = base.current, id = STEPS[i]!.id;
      // Only edits that land in the undo history count, so loading a saved circuit never ticks a step.
      if (s.past.length < b.past) { base.current = snap(); return; }
      const edited = s.past.length > b.past;
      const ok = id === 'add' ? edited && s.doc.parts.length > b.parts
        : id === 'move' ? edited && s.doc.parts.map(p => `${p.id}@${p.x},${p.y},${p.rot}`).join('|') !== b.pos && s.doc.parts.length === b.parts
          : id === 'wire' ? edited && s.doc.wires.length > b.wires
            : id === '3d' ? s.view3d : false;
      if (ok) setI(n => n === i ? Math.min(STEPS.length - 1, n + 1) : n);
    });
  }, [active, i]);

  useLayoutEffect(() => {
    if (!active) return;
    const find = () => { const el = document.querySelector(step.anchor[k]); setRect(el ? el.getBoundingClientRect() : null); };
    find();
    const id = setInterval(find, 400);
    addEventListener('resize', find);
    return () => { clearInterval(id); removeEventListener('resize', find); };
  }, [active, step, k]);

  if (!active) return null;
  const close = () => { setProfile({ tourDone: true }); if (useBench.getState().wireMode) useBench.getState().setWireMode(false); };
  const W = Math.min(320, innerWidth - 24);
    let left = 12, top = 80;
  if (rect && rect.height > 240 && rect.width < 360 && rect.right + W + 24 < innerWidth) { left = rect.right + 12; top = rect.top + 40; }
  else if (rect) {
    const big = rect.height > 240;
    // Inside a big target the bottom-right corner is usually empty; the circuit sits in the middle and pins along the top.
    left = Math.max(12, Math.min(innerWidth - W - 12, big ? rect.right - W - 16 : rect.left));
    top = big ? Math.max(12, Math.min(innerHeight, rect.bottom) - 150) : rect.bottom + 140 > innerHeight ? Math.max(12, rect.top - 150) : rect.bottom + 12;
  }

  return (
    <>
      {rect && step.id !== 'end' && <div className="tour-ring" style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }} />}
      <div className="tour-card" style={{ left, top, width: W }} role="dialog" aria-label={t('tour.title')}>
        <div className="tour-head"><b>{t('tour.title')}</b><span className="wb-muted">{t('tour.of', { n: i + 1, total: STEPS.length })}</span></div>
        <p>{t(step.text[k])}</p>
        <div className="tour-actions">
          {step.id === 'end'
            ? <><Link className="btn on" href="/learn" onClick={close}>{t('tour.lessons')}</Link><button className="btn" onClick={close}>{t('tour.done')}</button></>
            : <>{step.id === 'select' && <button className="btn on" onClick={() => setI(n => n + 1)}>{t('ob.next')}</button>}<button className="ls-link" onClick={close}>{t('tour.skip')}</button></>}
        </div>
      </div>
    </>
  );
}
