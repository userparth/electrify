'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { t } from '@/lib/i18n';
import { useAccount } from './api';

/** One dialog for both ways in: Google, or a 6-digit code sent by email. */
export function SignInDialog() {
  const { signInOpen, closeSignIn, signInGoogle, sendCode, verifyCode, methods } = useAccount();
  const [email, setEmail] = useState(''), [code, setCode] = useState(''), [stage, setStage] = useState<'start' | 'code'>('start');
  const [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const codeRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!signInOpen) { setStage('start'); setCode(''); setErr(''); setBusy(false); } }, [signInOpen]);
  useEffect(() => { if (stage === 'code') codeRef.current?.focus(); }, [stage]);
  useEffect(() => {
    if (!signInOpen) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && closeSignIn();
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [signInOpen, closeSignIn]);
  if (!signInOpen) return null;

  const run = async (f: () => Promise<void>) => { setBusy(true); setErr(''); try { await f(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const send = () => run(async () => { await sendCode(email.trim()); setStage('code'); setCode(''); });
  const verify = () => run(() => verifyCode(email.trim(), code));

  return (
    <div className="si" role="dialog" aria-modal="true" aria-label={t('signin.title')} onMouseDown={e => e.target === e.currentTarget && closeSignIn()}>
      <div className="si-card">
        <div className="si-head"><b>{stage === 'start' ? t('signin.title') : t('signin.code.title')}</b><button className="mb-icon" onClick={closeSignIn} aria-label={t('signin.close')}>✕</button></div>
        {stage === 'start' ? (
          <>
            <p className="wb-muted">{t('signin.why')}</p>
            {methods.google && <button className="btn si-google" onClick={signInGoogle}><span aria-hidden>G</span> {t('signin.google')}</button>}
            {methods.google && methods.email && <div className="si-or"><span>{t('signin.or')}</span></div>}
            {methods.email && (
              <form onSubmit={e => { e.preventDefault(); if (!busy) send(); }}>
                <label className="si-label">{t('signin.email.label')}
                  <input className="si-input" type="email" inputMode="email" autoComplete="email" required placeholder={t('signin.email.placeholder')} value={email} onChange={e => setEmail(e.target.value)} />
                </label>
                <button className="btn on si-wide" disabled={busy || !email.includes('@')}>{busy ? t('signin.email.sending') : t('signin.email.send')}</button>
              </form>
            )}
          </>
        ) : (
          <form onSubmit={e => { e.preventDefault(); if (!busy) verify(); }}>
            <p>{t('signin.code.body', { email: email.trim() })}</p>
            <label className="si-label">{t('signin.code.label')}
              <input ref={codeRef} className="si-input si-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            </label>
            <button className="btn on si-wide" disabled={busy || code.length !== 6}>{busy ? t('signin.code.checking') : t('signin.code.verify')}</button>
            <p className="wb-muted si-small">{t('signin.code.spam')}</p>
            <div className="si-links"><button type="button" className="ls-link" disabled={busy} onClick={send}>{t('signin.code.again')}</button><button type="button" className="ls-link" onClick={() => { setStage('start'); setErr(''); }}>{t('signin.code.change')}</button></div>
          </form>
        )}
        {err && <p className="si-err" role="alert">{err}</p>}
        <p className="wb-muted si-small"><Link href="/terms" onClick={closeSignIn}>{t('signin.terms')}</Link></p>
      </div>
    </div>
  );
}
