'use client';
import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { LEVELS, loadStars, saveStars, type Level } from '@/content/quest';
import { t } from '@/lib/i18n';
import { Workbench } from '../workbench/Workbench';
import { showMe } from '../workbench/Demo';
import { useGuide } from '../workbench/guide';
import { useIsPhone } from '../workbench/Mobile';
import { runner, useBench } from '../workbench/store';
import { makeCheck } from '../learn/check';

interface Attempt { mem: Record<string, boolean>; hints: number; showed: boolean; won: number | null; nudge: string | null }
const fresh = (): Attempt => ({ mem: {}, hints: 0, showed: false, won: null, nudge: null });
const useAttempt = create<Attempt>(fresh);

const storageKey = (l: Level) => `eb.quest.${l.id}`;
function startOver(l: Level) {
  localStorage.removeItem(storageKey(l));
  runner.start({ key: storageKey(l), initial: l.build });
  useAttempt.setState(fresh());
}

function useWinTicker(level: Level) {
  useEffect(() => {
    useAttempt.setState(fresh());
    useGuide.setState({ base: level.build(), acts: level.demo });
    const id = setInterval(() => {
      const a = useAttempt.getState();
      if (a.won != null || a.mem.done || !runner.synced() || useGuide.getState().playing) return;
      let c;
      try { c = makeCheck(); } catch { return; }
      if (level.win(c, a.mem)) {
        const stars = 3 - (a.hints > 0 ? 1 : 0) - (a.showed ? 1 : 0);
        saveStars(level.id, stars);
        useAttempt.setState({ nudge: null, mem: { ...a.mem, done: true } });
        // Let the student see the bulb light up before the popup covers it.
        setTimeout(() => { if (useAttempt.getState().mem.done) useAttempt.setState({ won: stars }); }, 1500);
        return;
      }
      const nudge = level.nudge?.(c) ?? null;
      if (nudge !== a.nudge) useAttempt.setState({ nudge });
    }, 300);
    return () => { clearInterval(id); useGuide.setState({ acts: null, base: null }); };
  }, [level]);
}

function Help({ level }: { level: Level }) {
  const hints = useAttempt(s => s.hints), playing = useGuide(s => !!s.playing);
  return (
    <>
      {level.hints.slice(0, hints).map(h => <div key={h} className="qp-hint">💡 {h}</div>)}
      <div className="qp-do">
        <button className="btn on ls-show" disabled={playing} onClick={() => { useAttempt.setState({ showed: true }); showMe(level.demo); }}>▶ {t('demo.showMe')}</button>
        {hints < level.hints.length && <button className="btn" onClick={() => useAttempt.setState({ hints: hints + 1 })}>💡 {hints ? t('quest.moreHelp') : t('quest.stuck')}</button>}
      </div>
    </>
  );
}

function Nudge() {
  const nudge = useAttempt(s => s.nudge);
  return nudge ? <div className="qp-nudge" role="status">{nudge}</div> : null;
}

function GoalPanel({ level, n }: { level: Level; n: number }) {
  const phone = useIsPhone(), past = useBench(s => s.past.length);
  return (
    <div className="qp">
      <div className="ls-k">{t('quest.level', { n })}</div>
      <h2 className="ls-title">{level.title}</h2>
      <div className="qp-goal"><span className="qp-icon" aria-hidden>{level.icon}</span><b>{level.goal}</b></div>
      <p className="wb-muted">{phone ? t('quest.wireTipPhone') : t('quest.wireTip')}</p>
      <Nudge />
      <Help level={level} />
      <div className="wb-row">
        <button className="btn" disabled={!past} onClick={() => useBench.getState().undo()}>↶ {t('quest.undo')}</button>
        <button className="btn" onClick={() => startOver(level)}>↺ {t('quest.reset')}</button>
      </div>
      <p className="qp-rule">{t('quest.starRule')}</p>
    </div>
  );
}

function GoalCard({ level, n, open }: { level: Level; n: number; open(): void }) {
  const playing = useGuide(s => !!s.playing);
  if (playing) return null;
  return (
    <div className="mb-peek mb-step qp-card">
      <button className="mb-step-main" onClick={open} aria-label={level.title}>
        <b className="qp-icon">{level.icon}</b><span><strong>{t('quest.level', { n })} · {level.title}</strong><small>{level.goal}</small></span>
      </button>
      <Nudge />
      <Help level={level} />
    </div>
  );
}

const CONFETTI = Array.from({ length: 28 }, (_, i) => ({ left: `${(i * 37) % 100}%`, delay: `${(i % 7) * 0.12}s`, color: ['#f3c33b', '#d6452f', '#3a6ed6', '#3fae66', '#8b5cc7'][i % 5] }));

function Win({ level, next }: { level: Level; next?: string }) {
  const won = useAttempt(s => s.won);
  if (won == null) return null;
  return (
    <div className="qp-win" role="dialog" aria-modal="true" aria-label={t('quest.won')}>
      <div className="qp-confetti" aria-hidden>{CONFETTI.map((c, i) => <i key={i} style={{ left: c.left, animationDelay: c.delay, background: c.color }} />)}</div>
      <div className="qp-win-card">
        <div className="qp-big" aria-hidden>{level.icon}</div>
        <h2>{t('quest.won')}</h2>
        <div className="qp-stars" aria-label={t('quest.stars', { n: won })}>{[1, 2, 3].map(i => <span key={i} className={i <= won ? 'on' : ''} style={{ animationDelay: `${0.2 + i * 0.25}s` }}>★</span>)}</div>
        <div className="qp-learned"><b>{t('quest.learned')}</b><p>{level.idea}</p></div>
        {!next && <p className="wb-muted">{t('quest.allDone')}</p>}
        <div className="qp-win-do">
          {next ? <Link className="btn on ob-big" href={`/play/${next}`}>{t('quest.next')}</Link> : <Link className="btn on ob-big" href="/learn/basics/first-circuit">{t('quest.firstLesson')}</Link>}
          <button className="btn" onClick={() => startOver(level)}>{t('quest.again')}</button>
          <Link className="btn" href="/play">{t('quest.map')}</Link>
        </div>
      </div>
    </div>
  );
}

export function QuestPlayer({ levelId }: { levelId: string }) {
  const idx = LEVELS.findIndex(l => l.id === levelId), level = LEVELS[idx];
  const title = useMemo(() => <><Link href="/play" className="wb-muted">{t('quest.name')}</Link><span className="wb-muted">› {level?.title}</span></>, [level]);
  if (!level) return <main className="home"><h1>Level not found</h1><Link href="/play">← {t('quest.map')}</Link></main>;
  return <QuestBench level={level} n={idx + 1} next={LEVELS[idx + 1]?.id} title={title} />;
}

function QuestBench({ level, n, next, title }: { level: Level; n: number; next?: string; title: React.ReactNode }) {
  useWinTicker(level);
  return (
    <>
      <Workbench
        storageKey={storageKey(level)} initial={level.build} title={title} heading={`${n}. ${level.title}`} tray={level.tray}
        side={<GoalPanel level={level} n={n} />} peek={open => <GoalCard level={level} n={n} open={open} />}
      />
      <Win level={level} next={next} />
    </>
  );
}

/** A level is open once the one before it has at least one star. */
export function unlocked(stars: Record<string, number>, i: number) { return i === 0 || (stars[LEVELS[i - 1]!.id] ?? 0) > 0; }
export { loadStars };
