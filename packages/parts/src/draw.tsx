import type { ReactNode } from 'react';
import { GRID } from './types';

export const INK = '#1d1d1b';
export const PAPER = '#fbf8f1';
export const u = (n: number) => n * GRID;

export function Lead({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return <line x1={u(x1)} y1={u(y1)} x2={u(x2)} y2={u(y2)} stroke="#9aa1a7" strokeWidth={2.2} strokeLinecap="round" />;
}

export function PinDot({ x, y }: { x: number; y: number }) {
  return <circle cx={u(x)} cy={u(y)} r={2.6} fill="#c9ced2" stroke={INK} strokeWidth={0.8} />;
}

export function Label({ x, y, children, size = 9, color = INK, anchor = 'middle' }: { x: number; y: number; children: ReactNode; size?: number; color?: string; anchor?: 'start' | 'middle' | 'end' }) {
  return <text x={u(x)} y={u(y)} fontSize={size} fill={color} textAnchor={anchor} fontFamily="ui-monospace,Menlo,monospace" fontWeight={700} style={{ pointerEvents: 'none', userSelect: 'none' }}>{children}</text>;
}

export function Glow({ cx, cy, r, color, amount }: { cx: number; cy: number; r: number; color: string; amount: number }) {
  if (amount <= 0.02) return null;
  return <circle cx={cx} cy={cy} r={r * (1.4 + amount)} fill={color} opacity={0.15 + 0.45 * amount} style={{ filter: 'blur(4px)' }} />;
}
