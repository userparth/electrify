'use client';
import { useEffect, useState } from 'react';
import { loadProgress } from './check';

export function Progress({ id }: { id: string }) {
  const [p, setP] = useState<string>('');
  useEffect(() => { const x = loadProgress()[id]; setP(x?.done ? '✓ done' : x?.steps ? `step ${x.steps}` : ''); }, [id]);
  return p ? <span className="learn-prog">{p}</span> : null;
}
