import Link from 'next/link';

const MODULES = [
  { href: '/learn', title: 'Lessons', text: 'Guided lessons with a live circuit: steps tick themselves when you get them right, with hints, mistakes to try and a quiz.' },
  { href: '/workbench', title: 'Workbench', text: 'Build real circuits on a virtual breadboard: batteries, resistors, LEDs, transistors, logic chips, the 555, Arduino and Raspberry Pi — with a multimeter, oscilloscope and logic analyzer.' },
  { href: '/solar', title: 'Solar module', text: 'A complete off-grid solar setup in ten figures: panel, charge controller, battery, wiring, DC-DC, monitoring and upgrades.' },
];

export default function Home() {
  return (
    <main className="home">
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
    </main>
  );
}
