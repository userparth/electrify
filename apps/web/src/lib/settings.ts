'use client';
import { create } from 'zustand';
import { asset } from './paths';

export interface Palette { id: string; name: string; note: string; bg: string; paper: string; ink: string; accent: string; mat: string }
export interface Font { id: string; name: string; note: string; ui: string }

export const PALETTES: Palette[] = [
  { id: 'paper', name: 'Paper', note: 'Warm cream, the original hand-inked look', bg: '#f2efe7', paper: '#fbf8f1', ink: '#1d1d1b', accent: '#3a6ed6', mat: '#8fc4b0' },
  { id: 'daylight', name: 'Daylight', note: 'Crisp white and electric blue', bg: '#f5f7fa', paper: '#ffffff', ink: '#14161a', accent: '#2563eb', mat: '#b8d4ef' },
  { id: 'mint', name: 'Mint', note: 'Fresh pale green, like a lab', bg: '#eef8f3', paper: '#ffffff', ink: '#10231b', accent: '#0e9f6e', mat: '#9fd8c0' },
  { id: 'sunny', name: 'Sunny', note: 'Bright butter-yellow and tomato', bg: '#fff7e3', paper: '#fffdf6', ink: '#1f1a10', accent: '#ff6b3d', mat: '#9ccfb8' },
  { id: 'sky', name: 'Sky', note: 'Calm pale blue', bg: '#edf4ff', paper: '#ffffff', ink: '#0f1b2d', accent: '#3b5bfd', mat: '#a8c8f2' },
];
export const FONTS: Font[] = [
  { id: 'atkinson', name: 'Atkinson Hyperlegible', note: 'Made for easy reading: I, l and 1 never look alike', ui: 'var(--f-atk)' },
  { id: 'inter', name: 'Inter', note: 'Clean and modern', ui: 'var(--f-inter)' },
  { id: 'plex', name: 'IBM Plex Sans', note: 'Technical, engineering feel', ui: 'var(--f-plex)' },
  { id: 'figtree', name: 'Figtree', note: 'Friendly and rounded', ui: 'var(--f-fig)' },
  { id: 'mono', name: 'Monospace', note: 'Every letter the same width, like code', ui: 'ui-monospace,Menlo,monospace' },
];

import { DEFAULT_SETTINGS, SETTINGS_KEY, type Settings } from './settings-core';
export { DEFAULT_SETTINGS, SETTINGS_KEY, type Settings } from './settings-core';

const valid = (s: Partial<Settings>): Settings => ({
  palette: PALETTES.some(p => p.id === s.palette) ? s.palette! : DEFAULT_SETTINGS.palette,
  font: FONTS.some(f => f.id === s.font) ? s.font! : DEFAULT_SETTINGS.font,
});

function apply(s: Settings) {
  document.documentElement.dataset.theme = s.palette;
  document.documentElement.dataset.font = s.font;
}

function readLocal(): Settings {
  try { return valid(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')); } catch { return DEFAULT_SETTINGS; }
}

interface SettingsState {
  settings: Settings;
  /** Where the current choice lives, for the page's note. */
  synced: 'local' | 'account' | 'saving' | 'error';
  set(patch: Partial<Settings>): void;
}

let signedIn = false;

async function push(s: Settings) {
  useSettings.setState({ synced: 'saving' });
  try {
    const res = await fetch(asset('/api/settings.php'), { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-eb': '1' }, body: JSON.stringify(s) });
    useSettings.setState({ synced: res.ok ? 'account' : 'error' });
  } catch { useSettings.setState({ synced: 'error' }); }
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: typeof window === 'undefined' ? DEFAULT_SETTINGS : readLocal(),
  synced: 'local',
  set(patch) {
    const s = valid({ ...get().settings, ...patch });
    apply(s); localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); set({ settings: s });
    if (signedIn) push(s);
  },
}));

// The account module announces the signed-in user; their saved choice wins, otherwise this browser's choice is kept for them.
if (typeof window !== 'undefined') {
  addEventListener('eb-account', e => {
    const user = (e as CustomEvent<{ settings?: Partial<Settings> | null } | null>).detail;
    signedIn = !!user;
    if (!user) { useSettings.setState({ synced: 'local' }); return; }
    if (user.settings?.palette || user.settings?.font) {
      const s = valid(user.settings);
      apply(s); localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); useSettings.setState({ settings: s, synced: 'account' });
    } else push(useSettings.getState().settings);
  });
}
