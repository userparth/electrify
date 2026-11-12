'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadProgress } from '@/features/learn/check';
import { FontCards, PaletteCards } from '@/features/settings/ThemeCards';
import { t } from '@/lib/i18n';
import type { MessageKey } from '@/messages/en';
import { loadProfile, useProfile, type Goal, type Level, type Role } from '@/lib/profile';
import { recommend } from './recommend';

/** A circuit you can close with one tap: the very first win. */
function FirstCircuit({ on, toggle }: { on: boolean; toggle(): void }) {
  return (
    <svg viewBox="0 0 320 150" className="ob-circuit" role="img" aria-label="A battery, a switch and an LED in a loop">
      <path d="M60 40 H150 M190 40 H260 V110 H60 V40" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round" />
      {on && <path d="M60 40 H260 V110 H60 Z" fill="none" stroke="#f3c33b" strokeWidth="3" strokeDasharray="4 14" className="ob-flow" />}
      <rect x="34" y="52" width="52" height="46" rx="6" fill="#2f2f33" stroke="var(--ink)" strokeWidth="2" />
      <text x="60" y="80" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">9V</text>
      <g onClick={toggle} style={{ cursor: 'pointer' }} role="button" aria-label="Switch" tabIndex={0} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggle()}>
        <rect x="140" y="18" width="60" height="44" rx="10" fill="transparent" />
        <circle cx="150" cy="40" r="5" fill="var(--ink)" /><circle cx="190" cy="40" r="5" fill="var(--ink)" />
        <line x1="150" y1="40" x2={on ? 190 : 184} y2={on ? 40 : 20} stroke="var(--ink)" strokeWidth="4" strokeLinecap="round" style={{ transition: 'all .15s' }} />
      </g>
      <g transform="translate(260 75)">
        {on && <circle r="34" fill="url(#ob-glow)" />}
        <circle r="13" fill={on ? '#ff5a45' : '#d9a39b'} stroke="var(--ink)" strokeWidth="2" />
      </g>
      <defs><radialGradient id="ob-glow"><stop offset="0" stopColor="#fff" stopOpacity=".9" /><stop offset=".35" stopColor="#ff5a45" stopOpacity=".7" /><stop offset="1" stopColor="#ff5a45" stopOpacity="0" /></radialGradient></defs>
    </svg>
  );
}

function Choice({ on, onClick, title, desc }: { on: boolean; onClick(): void; title: string; desc?: string }) {
  return <button className={`ob-choice ${on ? 'on' : ''}`} onClick={onClick} aria-pressed={on}><b>{title}</b>{desc && <small>{desc}</small>}</button>;
}

const ROLES: Role[] = ['beginner', 'school', 'college', 'maker', 'teacher'];
const GOALS: Goal[] = ['basics', 'analog', 'digital', 'micro', 'solar', 'explore'];
const LEVELS: Level[] = ['new', 'basics', 'built'];
const STEPS = 6;

export function Onboarding({ onClose }: { onClose(): void }) {
  const profile = useProfile(s => s.profile), set = useProfile(s => s.set);
  const [step, setStep] = useState(0), [lit, setLit] = useState(false);
  const router = useRouter();
  const path = useMemo(() => { const p = loadProgress(); return recommend(profile.goals, profile.level, id => !!p[id]?.done); }, [profile.goals, profile.level]);
  const finish = () => { set({ done: true }); onClose(); };
  const next = () => setStep(s => Math.min(STEPS - 1, s + 1));
  const toggleGoal = (g: Goal) => set({ goals: profile.goals.includes(g) ? profile.goals.filter(x => x !== g) : [...profile.goals, g] });
  const canNext = step === 1 ? !!profile.role && profile.under13 != null : step === 2 ? profile.goals.length > 0 : step === 3 ? !!profile.level : true;

  let body: ReactNode;
  if (step === 0) body = (
    <>
      <h1>{t('ob.welcome.title')}</h1>
      <p>{t('ob.welcome.body')}</p>
      <FirstCircuit on={lit} toggle={() => setLit(l => !l)} />
      <p className={`ob-hint ${lit ? 'ok' : ''}`}>{lit ? t('ob.welcome.lit') : t('ob.welcome.try')}</p>
    </>
  );
  else if (step === 1) body = (
    <>
      <h1>{t('ob.who.title')}</h1>
      <div className="ob-grid roles">{ROLES.map(r => <Choice key={r} on={profile.role === r} onClick={() => set(r === 'beginner' ? { role: r, level: 'new', goals: profile.goals.length ? profile.goals : ['basics'] } : { role: r })} title={t(`ob.who.${r}` as MessageKey)} />)}</div>
      <h2>{t('ob.age.q')}</h2>
      <div className="ob-grid two">
        <Choice on={profile.under13 === false} onClick={() => set({ under13: false })} title={t('ob.age.yes')} />
        <Choice on={profile.under13 === true} onClick={() => set({ under13: true })} title={t('ob.age.no')} />
      </div>
      {profile.under13 && <p className="ob-note">{t('ob.age.note')}</p>}
    </>
  );
  else if (step === 2) body = (
    <>
      <h1>{t('ob.goals.title')}</h1>
      <p className="wb-muted">{t('ob.goals.hint')}</p>
      <div className="ob-grid">{GOALS.map(g => <Choice key={g} on={profile.goals.includes(g)} onClick={() => toggleGoal(g)} title={t(`ob.goals.${g}` as MessageKey)} desc={t(`ob.goals.${g}.d` as MessageKey)} />)}</div>
    </>
  );
  else if (step === 3) body = (
    <>
      <h1>{t('ob.level.title')}</h1>
      <div className="ob-list">{LEVELS.map(l => <Choice key={l} on={profile.level === l} onClick={() => set({ level: l })} title={t(`ob.level.${l}` as MessageKey)} desc={t(`ob.level.${l}.d` as MessageKey)} />)}</div>
    </>
  );
  else if (step === 4) body = (
    <>
      <h1>{t('ob.look.title')}</h1>
      <p className="wb-muted">{t('ob.look.body')}</p>
      <div className="ob-look"><PaletteCards /><FontCards /></div>
    </>
  );
  else {
    const first = path[0];
    body = (
      <>
        <h1>{t('ob.path.title')}</h1>
        <p>{t('ob.path.body')}</p>
        {path.length > 0 && (
          <ol className="ob-path">
            {path.slice(0, 4).map(({ module, lesson }) => <li key={lesson.id}><b>{lesson.title}</b><small>{module.title} · {t('ob.path.min', { n: lesson.minutes })}</small></li>)}
          </ol>
        )}
        <div className="ob-actions">
          {profile.role === 'beginner' && <button className="btn on ob-big" onClick={() => { finish(); router.push('/play'); }}>{t('ob.path.start', { title: t('quest.name') })}</button>}
          {first && <button className={`btn ${profile.role === 'beginner' ? '' : 'on ob-big'}`} onClick={() => { finish(); router.push(`/learn/${first.module.id}/${first.lesson.id}`); }}>{t('ob.path.start', { title: first.lesson.title })}</button>}
          <button className={`btn ${first ? '' : 'on ob-big'}`} onClick={() => { finish(); router.push('/workbench'); }}>{t('ob.path.bench')}</button>
          <Link className="btn" href="/learn" onClick={finish}>{t('ob.path.all')}</Link>
        </div>
      </>
    );
  }

  return (
    <div className="ob" role="dialog" aria-modal="true" aria-label={t('ob.welcome.title')}>
      <div className="ob-card">
        <div className="ob-top">
          <div className="ob-dots" aria-label={t('ob.step', { n: step + 1, total: STEPS })}>{Array.from({ length: STEPS }, (_, i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
          <button className="ls-link" onClick={finish}>{t('ob.skip')}</button>
        </div>
        <div className="ob-body">{body}</div>
        {step < STEPS - 1 && (
          <div className="ob-nav">
            {step > 0 ? <button className="btn" onClick={() => setStep(s => s - 1)}>{t('ob.back')}</button> : <span />}
            <button className="btn on" disabled={!canNext} onClick={next}>{step === 0 ? t('ob.welcome.go') : t('ob.next')}</button>
          </div>
        )}
        {step === STEPS - 1 && <div className="ob-nav"><button className="btn" onClick={() => setStep(s => s - 1)}>{t('ob.back')}</button><span /></div>}
      </div>
    </div>
  );
}

const GATED = new Set(['/', '/learn', '/learn/', '/workbench', '/workbench/']);

/** Shows onboarding once, on the entry pages; a lesson opened straight from a link is never interrupted. */
export function OnboardingGate() {
  const pathname = usePathname(), loaded = useProfile(s => s.loaded), done = useProfile(s => s.profile.done);
  const [closed, setClosed] = useState(false);
  useEffect(() => { loadProfile(); }, []);
  if (!loaded || done || closed || !GATED.has(pathname)) return null;
  return <Onboarding onClose={() => setClosed(true)} />;
}
