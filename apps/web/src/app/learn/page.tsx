import Link from 'next/link';
import { MODULES } from '@/content';
import { Progress } from '@/features/learn/Progress';

export const metadata = { title: 'Lessons · Electronics Bench' };

export default function LearnPage() {
  return (
    <main className="home learn">
      <p><Link href="/">← Electronics Bench</Link></p>
      <h1>Lessons</h1>
      <p>Each lesson opens a live circuit. Steps tick themselves when you get them right.</p>
      {MODULES.map(m => (
        <section key={m.id} className="learn-mod">
          <h2>{m.title} <small>{m.level}</small></h2>
          <p>{m.blurb}</p>
          <ol>
            {m.lessons.map(l => (
              <li key={l.id}><Link href={`/learn/${m.id}/${l.id}`} prefetch={false}><b>{l.title}</b></Link> <span className="wb-muted">· {l.minutes} min</span> <Progress id={l.id} /></li>
            ))}
          </ol>
        </section>
      ))}
    </main>
  );
}
