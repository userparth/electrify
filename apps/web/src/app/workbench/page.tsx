import type { Metadata } from 'next';
import { Workbench } from '@/features/workbench/Workbench';

export const metadata: Metadata = { title: 'Workbench · Electronics Bench' };

export default function WorkbenchPage() {
  return <Workbench />;
}
