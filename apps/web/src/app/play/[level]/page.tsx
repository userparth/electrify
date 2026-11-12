import { Suspense } from 'react';
import { LEVELS } from '@/content/quest';
import { QuestPlayer } from '@/features/quest/QuestPlayer';

export function generateStaticParams() {
  return LEVELS.map(l => ({ level: l.id }));
}

export default function LevelPage({ params }: { params: Promise<{ level: string }> }) {
  return (
    <Suspense fallback={<main className="home">Loading…</main>}>
      {params.then(({ level }) => <QuestPlayer levelId={level} />)}
    </Suspense>
  );
}
