'use client';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { COMING, LEVELS, loadStars, STARS_KEY } from '@/content/quest';
import { t } from '@/lib/i18n';
import { AccountButton } from '../account/AccountButton';
import { unlocked } from './QuestPlayer';

let cache: [string | null, Record<string, number>] | null = null;
function snapshot() {
  const raw = localStorage.getItem(STARS_KEY);
  if (!cache || cache[0] !== raw) cache = [raw, loadStars()];
  return cache[1];
}
const subscribe = (on: () => void) => { addEventListener('storage', on); return () => removeEventListener('storage', on); };

export function QuestMap() {
  const stars = useSyncExternalStore(subscribe, snapshot, () => null);
  const total = stars ? Object.values(stars).reduce((a, b) => a + b, 0) : 0;
  return (
    <main className="home qm">
      <div className="acct-top"><Link href="/" className="wb-muted">⚡ Electronics Bench</Link><AccountButton /></div>
      <h1>{t('quest.name')}</h1>
      <p>{t('quest.tagline')}</p>
      <p className="qm-total">★ {total} / {LEVELS.length * 3}</p>
      <ol className="qm-path">
        {LEVELS.map((l, i) => {
          const s = stars?.[l.id] ?? 0, open = !stars || unlocked(stars, i);
          const body = <><span className="qm-n">{i + 1}</span><span className="qm-icon" aria-hidden>{l.icon}</span><b>{l.title}</b><span className="qm-stars" aria-label={t('quest.stars', { n: s })}>{[1, 2, 3].map(k => <i key={k} className={k <= s ? 'on' : ''}>★</i>)}</span></>;
          return <li key={l.id} className={`qm-node ${s ? 'done' : ''} ${open ? '' : 'locked'}`}>{open ? <Link href={`/play/${l.id}`}>{body}</Link> : <span title={t('quest.locked')}>{body}<small>🔒</small></span>}</li>;
        })}
        {COMING.map(([icon, title], i) => <li key={title} className="qm-node soon"><span><span className="qm-n">{LEVELS.length + i + 1}</span><span className="qm-icon" aria-hidden>{icon}</span><b>{title}</b><small>{t('quest.soon')}</small></span></li>)}
      </ol>
    </main>
  );
}
