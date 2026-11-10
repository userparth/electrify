'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { MODULES } from '@/content';
import { t } from '@/lib/i18n';
import { Workbench } from '../workbench/Workbench';
import { showMe } from '../workbench/Demo';
import { useGuide } from '../workbench/guide';
import { runner } from '../workbench/store';
import { loadProgress, makeCheck, saveProgress, type LessonProgress } from './check';
import type { Lesson } from './types';

const EMPTY: LessonProgress = { steps: 0, quiz: {}, done: false };
const useLesson = create<{ prog: LessonProgress; hint: boolean }>(() => ({ prog: EMPTY, hint: false }));

function save(lesson: Lesson, prog: LessonProgress) { useLesson.setState({ prog, hint: false }); saveProgress(lesson.id, prog); }
function advance(lesson: Lesson, i: number) { const p = useLesson.getState().prog; if (p.steps === i) save(lesson, { ...p, steps: i + 1, done: i + 1 >= lesson.steps.length && Object.keys(p.quiz).length >= lesson.quiz.length }); }

/** Ticks steps off while the lesson is open, whether or not its panel is on screen. */
function useLessonTicker(lesson: Lesson) {
  const steps = useLesson(s => s.prog.steps);
  useEffect(() => {
    useLesson.setState({ prog: loadProgress()[lesson.id] ?? EMPTY, hint: false });
    useGuide.setState({ base: lesson.build() });
    const id = setInterval(() => {
      if (!runner.synced() || useGuide.getState().playing) return;
      const p = useLesson.getState().prog;
      let n = p.steps;
      while (n < lesson.steps.length) {
        const s = lesson.steps[n]!;
        if (!s.check) break;
        let ok = false;
        try { ok = s.check(makeCheck()); } catch { ok = false; }
        if (!ok) break;
        n++;
      }
      if (n !== p.steps) save(lesson, { ...p, steps: n, done: n >= lesson.steps.length && Object.keys(p.quiz).length >= lesson.quiz.length });
    }, 300);
    return () => { clearInterval(id); useGuide.setState({ acts: null, base: null }); };
  }, [lesson]);
  useEffect(() => { useGuide.setState({ acts: lesson.steps[steps]?.demo ?? null }); }, [lesson, steps]);
}

function ShowMe({ step }: { step: Lesson['steps'][number] }) {
  const playing = useGuide(s => !!s.playing);
  return step.demo ? <button className="btn on ls-show" disabled={playing} onClick={() => showMe(step.demo!)}>▶ {t('demo.showMe')}</button> : null;
}

function LessonPanel({ lesson, next, storageKey }: { lesson: Lesson; next?: { href: string; title: string }; storageKey: string }) {
  const prog = useLesson(s => s.prog), hint = useLesson(s => s.hint);
  const [picked, setPicked] = useState<Record<number, number>>({});
  const answer = (qi: number, oi: number) => {
    setPicked(p => ({ ...p, [qi]: oi }));
    const p = useLesson.getState().prog, quiz = { ...p.quiz, [qi]: oi === lesson.quiz[qi]!.answer };
    save(lesson, { ...p, quiz, done: p.steps >= lesson.steps.length && Object.keys(quiz).length >= lesson.quiz.length });
  };
  const resetCircuit = () => { localStorage.removeItem(storageKey); runner.start({ key: storageKey, initial: lesson.build, dt: lesson.dt }); };
  const cur = lesson.steps[prog.steps];

  return (
    <div className="ls">
      <div className="ls-k">Lesson · {lesson.minutes} min</div>
      <h2 className="ls-title">{lesson.title}</h2>
      <p className="ls-sum">{lesson.summary}</p>
      <ol className="ls-steps">
        {lesson.steps.map((s, i) => (
          <li key={i} className={i < prog.steps ? 'done' : i === prog.steps ? 'cur' : 'todo'}>
            <b>{s.title}</b>
            {i === prog.steps && (
              <div className="ls-text">
                {s.text}
                {s.hint && (hint ? <div className="ls-hint">💡 {s.hint}</div> : <button className="ls-link" onClick={() => useLesson.setState({ hint: true })}>{t('demo.hint')}</button>)}
                <div className="ls-do"><ShowMe step={s} />{!s.check && <button className="btn" onClick={() => advance(lesson, i)}>{t('demo.gotIt')}</button>}</div>
              </div>
            )}
          </li>
        ))}
      </ol>
      {!cur && <div className="ls-good">✓ All steps done.</div>}
      {lesson.tryIt && <><h3>Try a mistake</h3><ul className="ls-try">{lesson.tryIt.map(([a, b]) => <li key={a}><b>{a}</b> — {b}</li>)}</ul></>}
      {!cur && lesson.quiz.length > 0 && (
        <>
          <h3>Check yourself</h3>
          {lesson.quiz.map((q, qi) => (
            <div key={qi} className="ls-q">
              <p>{qi + 1}. {q.q}</p>
              {q.options.map((o, oi) => <button key={oi} className={`chip ${picked[qi] === oi ? (oi === q.answer ? 'right' : 'wrong') : ''}`} onClick={() => answer(qi, oi)}>{o}</button>)}
              {picked[qi] != null && <div className="ls-why">{picked[qi] === q.answer ? '✓ Right. ' : '✗ Not quite. '}{q.why}</div>}
            </div>
          ))}
        </>
      )}
      {prog.done && <div className="ls-good">🎉 Lesson complete!{next && <> <Link href={next.href}>Next: {next.title} →</Link></>}</div>}
      <div className="wb-row"><button className="btn" onClick={resetCircuit}>↺ Reset circuit</button><button className="btn" onClick={() => { setPicked({}); save(lesson, EMPTY); }}>Restart lesson</button></div>
    </div>
  );
}

/** The phone's step card: always on screen, so the next thing to do is never hidden behind a tab. */
function StepCard({ lesson, open }: { lesson: Lesson; open(): void }) {
  const prog = useLesson(s => s.prog), hint = useLesson(s => s.hint), playing = useGuide(s => !!s.playing);
  if (playing) return null;
  const n = prog.steps, cur = lesson.steps[n];
  if (prog.done || !cur) return <button className="mb-peek" onClick={open}><b>✓</b> {prog.done ? t('demo.lessonDone') : t('demo.quizNext')}</button>;
  return (
    <div className="mb-peek mb-step">
      <button className="mb-step-main" onClick={open} aria-label={t('demo.openLesson')}>
        <b>{n + 1}/{lesson.steps.length}</b><span><strong>{cur.title}</strong><small>{cur.text}</small></span>
      </button>
      {hint && cur.hint && <div className="mb-step-hint">💡 {cur.hint}</div>}
      <div className="mb-step-row">
        <ShowMe step={cur} />
        {cur.hint && !hint && <button className="btn" onClick={() => useLesson.setState({ hint: true })}>💡 {t('demo.hintShort')}</button>}
        {!cur.check && <button className="btn on" onClick={() => advance(lesson, n)}>{t('demo.gotIt')}</button>}
      </div>
    </div>
  );
}

export function LessonPlayer({ moduleId, lessonId }: { moduleId: string; lessonId: string }) {
  const mod = MODULES.find(m => m.id === moduleId), idx = mod?.lessons.findIndex(l => l.id === lessonId) ?? -1, lesson = mod?.lessons[idx];
  const nextLesson = mod && idx >= 0 ? mod.lessons[idx + 1] : undefined;
  const key = `eb.lesson.${moduleId}.${lessonId}`;
  const title = useMemo(() => mod && <><Link href="/learn" className="wb-muted">Lessons</Link><span className="wb-muted">› {mod.title}</span></>, [mod]);
  if (!mod || !lesson) return <main className="home"><h1>Lesson not found</h1><Link href="/learn">← All lessons</Link></main>;
  return <LessonBench lesson={lesson} storageKey={key} title={title} next={nextLesson && { href: `/learn/${mod.id}/${nextLesson.id}`, title: nextLesson.title }} />;
}

function LessonBench({ lesson, storageKey, title, next }: { lesson: Lesson; storageKey: string; title: React.ReactNode; next?: { href: string; title: string } }) {
  useLessonTicker(lesson);
  return (
    <Workbench
      storageKey={storageKey} initial={lesson.build} dt={lesson.dt} title={title} heading={lesson.title} peek={open => <StepCard lesson={lesson} open={open} />}
      side={<LessonPanel lesson={lesson} storageKey={storageKey} next={next} />}
    />
  );
}
