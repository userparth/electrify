'use client';
import { create } from 'zustand';
import { asset } from './paths';

export type Role = 'beginner' | 'school' | 'college' | 'maker' | 'teacher';
export type Goal = 'basics' | 'analog' | 'digital' | 'micro' | 'solar' | 'explore';
export type Level = 'new' | 'basics' | 'built';

export interface Profile {
  role?: Role;
  under13?: boolean;
  goals: Goal[];
  level?: Level;
  /** Onboarding finished or skipped. */
  done: boolean;
  tourDone: boolean;
}

const KEY = 'eb.profile.v1';
const EMPTY: Profile = { goals: [], done: false, tourDone: false };

function read(): Profile {
  try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return EMPTY; }
}

interface ProfileState {
  profile: Profile;
  loaded: boolean;
  set(patch: Partial<Profile>): void;
  reset(): void;
}

let signedIn = false, timer: ReturnType<typeof setTimeout> | null = null;
// Under-13 answers never leave the device: they have no account to sync to.
function push(p: Profile) {
  if (!signedIn || p.under13) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const { role, goals, level, done, tourDone } = p;
    fetch(asset('/api/settings.php'), { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-eb': '1' }, body: JSON.stringify({ profile: { role, goals, level, done, tourDone } }) }).catch(() => {});
  }, 600);
}

export const useProfile = create<ProfileState>((set, get) => ({
  profile: EMPTY,
  loaded: false,
  set(patch) { const p = { ...get().profile, ...patch }; localStorage.setItem(KEY, JSON.stringify(p)); set({ profile: p }); push(p); },
  reset() { const p = { ...EMPTY, tourDone: get().profile.tourDone }; localStorage.setItem(KEY, JSON.stringify(p)); set({ profile: p }); },
}));

// Read after mount so the server-rendered page and the first client render match.
export function loadProfile() { if (!useProfile.getState().loaded) useProfile.setState({ profile: read(), loaded: true }); }

/** Under-13 students use everything without an account (COPPA, GDPR-K). */
export const canSignIn = () => !useProfile.getState().profile.under13;

// A signed-in student keeps their onboarding answers on every device; a finished local profile is uploaded once.
if (typeof window !== 'undefined') {
  addEventListener('eb-account', e => {
    const user = (e as CustomEvent<{ settings?: { profile?: Partial<Profile> } | null } | null>).detail;
    signedIn = !!user;
    if (!user) return;
    loadProfile();
    const local = useProfile.getState().profile, remote = user.settings?.profile;
    if (remote?.done && !local.done) {
      const p = { ...local, ...remote, under13: false };
      localStorage.setItem(KEY, JSON.stringify(p)); useProfile.setState({ profile: p });
    } else if (local.done && !remote?.done) push(local);
  });
}
