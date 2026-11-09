'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { AccountButton } from '../account/AccountButton';
import { useAccount } from '../account/api';
import { FontCards, PaletteCards } from './ThemeCards';
import { useSettings } from '@/lib/settings';
import { loadProfile, useProfile } from '@/lib/profile';
import { t } from '@/lib/i18n';
import { asset } from '@/lib/paths';

export function SettingsPage() {
  const synced = useSettings(s => s.synced);
  const { user, available, loaded, refresh, signIn } = useAccount();
  const profile = useProfile(s => s.profile), setProfile = useProfile(s => s.set), resetProfile = useProfile(s => s.reset);
  useEffect(() => { loadProfile(); if (!loaded) refresh(); }, [loaded, refresh]);
  const where = user
    ? synced === 'saving' ? 'Saving to your account…' : synced === 'error' ? 'Could not save to your account — kept in this browser.' : 'Saved to your account, so it follows you to every device.'
    : 'Saved in this browser.';

  return (
    <main className="home st">
      <div className="acct-top"><Link href="/">← Electronics Bench</Link><AccountButton /></div>
      <h1>Settings</h1>
      <p className="wb-muted">{where} {!user && available && !profile.under13 && <button className="ls-link" onClick={signIn}>Sign in to keep it everywhere.</button>}</p>

      <h2>Colours</h2>
      <PaletteCards />

      <h2>Font</h2>
      <FontCards />
      <p className="wb-muted">Readings, code and the serial monitor always use the matching fixed-width font, so numbers line up.</p>

      <h2>{t('settings.learning')}</h2>
      <div className="wb-row">
        <button className="btn" onClick={() => { resetProfile(); location.href = asset('/'); }}>{t('settings.redo')}</button>
        <button className="btn" onClick={() => { setProfile({ tourDone: false }); location.href = asset('/workbench/'); }}>{t('settings.tour')}</button>
      </div>
      {profile.under13 && <p className="wb-muted">{t('settings.under13')} <button className="ls-link" onClick={() => setProfile({ under13: false })}>{t('settings.under13.change')}</button></p>}
    </main>
  );
}
