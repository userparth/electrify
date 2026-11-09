import Link from 'next/link';
import { asset } from '@/lib/paths';
import { AccountButton } from '@/features/account/AccountButton';

const MODULES = [
  { href: '/learn', title: 'Lessons', text: 'Guided lessons with a live circuit: steps tick themselves when you get them right, with hints, mistakes to try and a quiz.' },
  { href: '/workbench', title: 'Workbench', text: 'Build real circuits on a virtual breadboard: batteries, resistors, LEDs, transistors, logic chips, the 555, Arduino and Raspberry Pi — with a multimeter, oscilloscope and logic analyzer.' },
  { href: '/learn#solar', title: 'Solar module', text: 'A real off-grid 12 V system in ten lessons: panel, charge controller, battery, meter safety, fuses, DC-DC, current monitoring, a second panel and an inverter.' },
];

export default function Home() {
  return (
    <main className="home">
      <div className="acct-top"><span /><AccountButton /></div>
      <h1>⚡ Electronics Bench</h1>
      <p>Learn electronics by building, running and breaking circuits on screen — then do it on real hardware.</p>
      <div className="home-grid">
        {MODULES.map(m => (
          <Link key={m.href} className="home-card" href={m.href} prefetch={false}>
            <b>{m.title} →</b>
            <span>{m.text}</span>
          </Link>
        ))}
      </div>
      <footer className="home-foot"><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · <a href="https://github.com/userparth/electrify">Source (AGPL-3.0)</a></footer>
    </main>
  );
}
