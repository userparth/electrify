'use client';
import { useEffect, useState } from 'react';
import { asset } from '@/lib/paths';
import { useAccount } from './api';
import { loadProfile, useProfile } from '@/lib/profile';

export function AccountButton() {
  const { user, available, loaded, refresh, signIn, signOut } = useAccount();
  const [open, setOpen] = useState(false), under13 = useProfile(s => s.profile.under13);
  useEffect(() => { loadProfile(); if (!loaded) refresh(); }, [loaded, refresh]);
  if (!loaded || !available) return <a className="btn acct-gear" href={asset('/settings/')} title="Settings" aria-label="Settings">⚙</a>;
  if (!user && under13) return <a className="btn acct-gear" href={asset('/settings/')} title="Settings" aria-label="Settings">⚙</a>;
  if (!user) return <span className="acct-pair"><a className="btn acct-gear" href={asset('/settings/')} title="Settings" aria-label="Settings">⚙</a><button className="btn" onClick={signIn}>Sign in with Google</button></span>;
  return (
    <div className="acct">
      <button className="acct-me" onClick={() => setOpen(o => !o)} title={user.email}>
        {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" crossOrigin="anonymous" /> : <span className="acct-dot">{user.name[0]}</span>}
        <span>{user.name.split(' ')[0]}</span>
      </button>
      {open && (
        <div className="acct-menu" onMouseLeave={() => setOpen(false)}>
          <a href={asset('/account/')}>My progress</a>
          <a href={asset('/teacher/')}>Teacher: my classes</a>
          <a href={asset('/join/')}>Join a class</a>
          <a href={asset('/settings/')}>Settings</a>
          <button onClick={() => { signOut(); setOpen(false); }}>Sign out</button>
        </div>
      )}
    </div>
  );
}
