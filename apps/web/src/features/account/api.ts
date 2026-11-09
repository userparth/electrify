'use client';
import { create } from 'zustand';
import { asset } from '@/lib/paths';
import { loadProgress, type LessonProgress } from '../learn/check';

export interface User { id: number; email: string; name: string; picture: string; role: 'student' | 'teacher' }
export interface StudentRow { name: string; email: string; picture: string; progress: Record<string, { steps: number; done: boolean }> }
export interface TeachingClass { name: string; code: string; created_at: string; students: StudentRow[] }

const api = (file: string) => asset(`/api/${file}`);

async function call<T>(file: string, body?: unknown): Promise<T> {
  const res = await fetch(api(file), body === undefined ? { credentials: 'same-origin' } : {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-eb': '1' }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

interface AccountState {
  user: User | null;
  /** false when the server has no accounts backend (local dev, or not configured yet). */
  available: boolean;
  loaded: boolean;
  refresh(): Promise<void>;
  signIn(): void;
  signOut(): Promise<void>;
}

export const useAccount = create<AccountState>((set, get) => ({
  user: null, available: false, loaded: false,
  async refresh() {
    try {
      const r = await call<{ user: User | null; configured: boolean }>('me.php');
      set({ user: r.user, available: r.configured, loaded: true });
      if (r.user) await syncProgress();
    } catch { set({ user: null, available: false, loaded: true }); }
  },
  signIn() { location.href = `${api('auth.php')}?action=start&return=${encodeURIComponent(location.pathname + location.search)}`; },
  async signOut() { await call('auth.php?action=logout', {}); set({ user: null }); },
}));

/** Pushes local progress up, pulls the merged result down. */
export async function syncProgress() {
  if (!useAccount.getState().user) return;
  const local = loadProgress();
  await call('progress.php', { items: local });
  const { progress } = await call<{ progress: Record<string, LessonProgress> }>('progress.php');
  const merged = { ...local };
  for (const [id, p] of Object.entries(progress)) {
    const l = merged[id];
    merged[id] = !l ? p : { steps: Math.max(l.steps, p.steps), quiz: { ...p.quiz, ...l.quiz }, done: l.done || p.done };
  }
  localStorage.setItem('eb.progress.v1', JSON.stringify(merged));
}

let timer: ReturnType<typeof setTimeout> | null = null;
/** Called whenever a lesson saves progress; batches uploads. */
export function queueSync() {
  if (!useAccount.getState().user) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { syncProgress().catch(() => {}); }, 1500);
}

export const classesApi = {
  list: () => call<{ teaching: TeachingClass[]; enrolled: { name: string; code: string; teacher: string }[] }>('classes.php'),
  create: (name: string) => call<{ ok: true; code: string }>('classes.php', { action: 'create', name }),
  join: (code: string) => call<{ ok: true; name: string }>('classes.php', { action: 'join', code }),
  remove: (code: string) => call<{ ok: true }>('classes.php', { action: 'delete', code }),
};

if (typeof window !== 'undefined') addEventListener('eb-progress', queueSync);
