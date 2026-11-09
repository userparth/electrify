'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { MODULES } from '@/content';
import { Workbench } from '../workbench/Workbench';
import { runner } from '../workbench/store';
import { loadProgress, makeCheck, saveProgress, type LessonProgress } from './check';
import type { Lesson } from './types';

function LessonPanel({ lesson, next, storageKey }: { lesson: Lesson; next?: { href: string; title: string }; storageKey: string }) {
  const [prog, setProg] = useState<LessonProgress>({ steps: 0, quiz: {}, done: false });
  const [hint, setHint] = useState(false);
  const [picked, setPicked] = useState<Record<number, number>>({});

  useEffect(() => { const p = loadProgress()[lesson.id]; if (p) setProg(p); }, [lesson.id]);
  useEffect(() => {
    const t = setInterval(() => {
      setProg(p => {
        let n = p.steps;
        while (n < lesson.steps.length) {
          const s = lesson.steps[n]!;
          if (!s.check) break;
          let ok = false;
          try { ok = s.check(makeCheck()); } catch { ok = false; }
          if (!ok) break;
          n++;
        }
        if (n === p.steps) return p;
        const next = { ...p, steps: n, done: n >= lesson.steps.length && Object.keys(p.quiz).length >= lesson.quiz.length };
        saveProgress(lesson.id, next);
        setHint(false);
        return next;
      });
    }, 300);
    return () => clearInterval(t);
  }, [lesson]);

  const answer = (qi: number, oi: number) => {
    setPicked(p => ({ ...p, [qi]: oi }));
    setProg(p => {
      const quiz = { ...p.quiz, [qi]: oi === lesson.quiz[qi]!.answer };
      const next = { ...p, quiz, done: p.steps >= lesson.steps.length && Object.keys(quiz).length >= lesson.quiz.length };
      saveProgress(lesson.id, next);
      return next;
    });
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
            {i === prog.steps && <div className="ls-text">{s.text}{s.hint && (hint ? <div className="ls-hint">💡 {s.hint}</div> : <button className="ls-link" onClick={() => setHint(true)}>Show a hint</button>)}{!s.check && <button className="btn" onClick={() => { const n = { ...prog, steps: i + 1 }; setProg(n); saveProgress(lesson.id, n); }}>Done →</button>}</div>}
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
      <div className="wb-row"><button className="btn" onClick={resetCircuit}>↺ Reset circuit</button><button className="btn" onClick={() => { const n = { steps: 0, quiz: {}, done: false }; setProg(n); setPicked({}); saveProgress(lesson.id, n); }}>Restart lesson</button></div>
    </div>
  );
}

export function LessonPlayer({ moduleId, lessonId }: { moduleId: string; lessonId: string }) {
  const mod = MODULES.find(m => m.id === moduleId), idx = mod?.lessons.findIndex(l => l.id === lessonId) ?? -1, lesson = mod?.lessons[idx];
  const nextLesson = mod && idx >= 0 ? mod.lessons[idx + 1] : undefined;
  const key = `eb.lesson.${moduleId}.${lessonId}`;
  const title = useMemo(() => mod && <><Link href="/learn" className="wb-muted">Lessons</Link><span className="wb-muted">› {mod.title}</span></>, [mod]);
  if (!mod || !lesson) return <main className="home"><h1>Lesson not found</h1><Link href="/learn">← All lessons</Link></main>;
  return (
    <Workbench
      storageKey={key} initial={lesson.build} dt={lesson.dt} title={title}
      side={<LessonPanel lesson={lesson} storageKey={key} next={nextLesson && { href: `/learn/${mod.id}/${nextLesson.id}`, title: nextLesson.title }} />}
    />
  );
}
