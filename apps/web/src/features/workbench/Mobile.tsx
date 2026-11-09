'use client';
import dynamic from 'next/dynamic';
import { getPart } from '@eb/parts';
import { useEffect, useState, type ReactNode } from 'react';
import { AccountButton } from '../account/AccountButton';
import { Canvas } from './Canvas';
import { CodePanel } from './CodePanel';
import { EventLog, Inspector, Palette, Toolbar } from './Panels';
import { useBench } from './store';
import { asset } from '@/lib/paths';

const IsoView = dynamic(() => import('./iso/IsoView'), { ssr: false, loading: () => <div className="wb-canvas wb-3d-loading">Loading…</div> });

/** Phones get their own shell: full-screen bench, a tab bar, and bottom sheets for everything else. */
export function useIsPhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const m = matchMedia('(max-width: 760px)'), on = () => setPhone(m.matches);
    on(); m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return phone;
}

type Tab = 'parts' | 'lesson' | 'part' | 'code' | 'log' | 'menu';

export function MobileWorkbench({ side, peek, heading }: { side?: ReactNode; peek?: ReactNode; heading?: string }) {
  const view3d = useBench(s => s.view3d), running = useBench(s => s.running), sel = useBench(s => s.sel), doc = useBench(s => s.doc), logN = useBench(s => s.log.length);
  const [tab, setTab] = useState<Tab | null>(null);
  const b = useBench.getState();
  const inst = sel?.kind === 'part' ? doc.parts.find(p => p.id === sel.id) : undefined, def = inst && getPart(inst.type);
  const hasCode = !!def?.program;
  useEffect(() => { const r = requestAnimationFrame(() => useBench.getState().fit()); return () => cancelAnimationFrame(r); }, [view3d]);
  useEffect(() => { if ((tab === 'part' && !sel) || (tab === 'code' && !hasCode)) setTab(null); }, [sel, hasCode, tab]);
  const toggle = (t: Tab) => setTab(cur => cur === t ? null : t);
  const tabs: [Tab, string, string][] = [['parts', '＋', 'Parts'], ...(side ? [['lesson', '✎', 'Lesson'] as [Tab, string, string]] : []), ['part', '⚙', 'Selected'], ...(hasCode ? [['code', '⌨', 'Code'] as [Tab, string, string]] : []), ['log', '≡', `Log${logN ? ` ·${logN}` : ''}`]];
  const title: Record<Tab, string> = { parts: 'Add a part', lesson: 'Lesson', part: def ? def.name : 'Selected', code: 'Code', log: 'Events', menu: 'Bench' };

  return (
    <div className="mb">
      <header className="mb-top">
        <a href={asset('/')} className="mb-brand" aria-label="Home">⚡</a>
        <div className="mb-title">{heading ?? 'Workbench'}</div>
        <button className={`mb-icon ${running ? 'on' : ''}`} onClick={() => b.setRunning(!running)} aria-label={running ? 'Pause' : 'Run'}>{running ? '❚❚' : '▶'}</button>
        <div className="wb-seg"><button className={`btn ${!view3d ? 'on' : ''}`} onClick={() => b.setView3d(false)}>2D</button><button className={`btn ${view3d ? 'on' : ''}`} onClick={() => b.setView3d(true)}>3D</button></div>
        <button className={`mb-icon ${tab === 'menu' ? 'on' : ''}`} onClick={() => toggle('menu')} aria-label="More">⋯</button>
      </header>
      <div className="mb-stage">
        {view3d ? <IsoView /> : <Canvas />}
        {peek && !tab && <button className="mb-peek" onClick={() => setTab('lesson')}>{peek}</button>}
        {sel && tab !== 'part' && (
          <div className="mb-actions">
            {sel.kind === 'part' && <button className="btn" onClick={() => b.rotate(sel.id)}>⟳ Rotate</button>}
            <button className="btn" onClick={() => b.remove(sel)}>🗑 Delete</button>
            {sel.kind === 'part' && <button className="btn" onClick={() => setTab('part')}>⚙ Settings</button>}
            {hasCode && <button className="btn" onClick={() => setTab('code')}>⌨ Code</button>}
            <button className="btn" onClick={() => b.select(null)} aria-label="Deselect">✕</button>
          </div>
        )}
        {tab && (
          <section className={`mb-sheet ${tab === 'code' ? 'tall' : ''}`}>
            <button className="mb-grab" onClick={() => setTab(null)} aria-label="Close" />
            <div className="mb-sheet-head"><b>{title[tab]}</b><button className="mb-icon" onClick={() => setTab(null)} aria-label="Close">✕</button></div>
            <div className="mb-sheet-body">
              {tab === 'parts' && <Palette onPick={() => setTab(null)} />}
              {tab === 'lesson' && side}
              {tab === 'part' && <Inspector />}
              {tab === 'code' && <CodePanel />}
              {tab === 'log' && <EventLog />}
              {tab === 'menu' && <div className="mb-menu"><Toolbar /><div className="mb-acct"><AccountButton /></div><a className="btn" href={asset('/learn/')}>All lessons</a></div>}
            </div>
          </section>
        )}
      </div>
      <nav className="mb-tabs">
        {tabs.map(([t, icon, label]) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => toggle(t)}><span>{icon}</span>{label}</button>)}
      </nav>
    </div>
  );
}
