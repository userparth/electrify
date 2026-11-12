'use client';
import dynamic from 'next/dynamic';
import { useEffect, type ReactNode } from 'react';
import { Canvas } from './Canvas';
import { AccountButton } from '../account/AccountButton';
import { CodePanel } from './CodePanel';
import { EventLog, Inspector, Palette, Toolbar } from './Panels';
import type { Doc } from './model';
import { runner, useBench } from './store';
import { asset } from '@/lib/paths';
import { MobileWorkbench, useIsPhone } from './Mobile';
import { BenchTour } from '../onboarding/Tour';
import { DemoLayer } from './Demo';

const IsoView = dynamic(() => import('./iso/IsoView'), { ssr: false, loading: () => <div className="wb-canvas wb-3d-loading">Loading…</div> });

/** `tray` turns on puzzle mode: only those parts, 2D only, no menus. */
export function Workbench({ storageKey, initial, dt, side, title, peek, heading, tray }: { storageKey?: string; initial?: () => Doc; dt?: number; side?: ReactNode; title?: ReactNode; peek?: (open: () => void) => ReactNode; heading?: string; tray?: string[] } = {}) {
  const view3d = useBench(s => s.view3d) && !tray, phone = useIsPhone();
  useEffect(() => {
    runner.start({ key: storageKey, initial, dt });
    const key = (e: KeyboardEvent) => {
      if (/INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement).tagName)) return;
      const s = useBench.getState(), mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) s.redo(); else s.undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); s.redo(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); s.remove(s.sel); }
      if (e.key.toLowerCase() === 'r' && s.sel?.kind === 'part') s.rotate(s.sel.id);
      if (e.key === 'Escape') s.select(null);
      if (e.key === ' ') { e.preventDefault(); s.setRunning(!s.running); }
      if (e.key.toLowerCase() === 'v' && !mod) s.setView3d(!s.view3d);
    };
    addEventListener('keydown', key);
    return () => { removeEventListener('keydown', key); runner.stop(); };
  }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const tour = !storageKey && <BenchTour phone={phone} />;
  if (phone) return <>{tour}<MobileWorkbench side={side} peek={peek} heading={heading} tray={tray} /><DemoLayer /></>;
  if (tray) return (
    <div className="wb puzzle">
      <DemoLayer />
      <header className="wb-head"><a href={asset('/')} className="wb-brand"><b>⚡ Electronics Bench</b></a>{title}<span className="wb-grow" /><AccountButton /></header>
      <Palette only={tray} />
      <div className="wb-center"><Canvas /></div>
      <aside className="wb-side">{side}</aside>
    </div>
  );
  return (
    <div className="wb">
      {tour}
      <DemoLayer />
      <header className="wb-head"><a href={asset('/')} className="wb-brand"><b>⚡ Electronics Bench</b></a>{title ?? <><a href={asset('/learn/')} className="wb-muted">Lessons</a><a href={asset('/learn/#solar')} className="wb-muted">Solar module</a></>}<Toolbar /><AccountButton /></header>
      <Palette />
      <div className="wb-center">{view3d ? <IsoView /> : <Canvas />}<CodePanel /></div>
      <aside className="wb-side">
        {side}
        <h3>Selected</h3>
        <Inspector />
        <h3>Events</h3>
        <EventLog />
      </aside>
    </div>
  );
}
