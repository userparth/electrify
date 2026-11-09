import { Suspense } from 'react';
import { MODULES } from '@/content';
import { LessonPlayer } from '@/features/learn/LessonPlayer';

export function generateStaticParams() {
  return MODULES.flatMap(m => m.lessons.map(l => ({ module: m.id, lesson: l.id })));
}

export default function LessonPage({ params }: { params: Promise<{ module: string; lesson: string }> }) {
  return (
    <Suspense fallback={<main className="home">Loading lesson…</main>}>
      {params.then(({ module, lesson }) => <LessonPlayer moduleId={module} lessonId={lesson} />)}
    </Suspense>
  );
}
