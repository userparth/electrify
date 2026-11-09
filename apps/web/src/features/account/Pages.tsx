'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MODULES } from '@/content';
import { loadProgress, type LessonProgress } from '../learn/check';
import { AccountButton } from './AccountButton';
import { classesApi, useAccount, type TeachingClass } from './api';

const ALL = MODULES.flatMap(m => m.lessons.map(l => ({ module: m, lesson: l })));

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const { user, available, loaded, signIn } = useAccount();
  return (
    <main className="home acct-page">
      <div className="acct-top"><Link href="/">← Electronics Bench</Link><AccountButton /></div>
      <h1>{title}</h1>
      {!loaded ? <p>Loading…</p>
        : !available ? <p>Accounts aren’t switched on for this server yet. Lessons still save your progress in this browser.</p>
          : !user ? <p><button className="btn on" onClick={signIn}>Sign in with Google</button> to continue.</p>
            : children}
    </main>
  );
}

function useLoaded() {
  const refresh = useAccount(s => s.refresh), loaded = useAccount(s => s.loaded);
  useEffect(() => { if (!loaded) refresh(); }, [loaded, refresh]);
}

export function AccountPage() {
  useLoaded();
  const user = useAccount(s => s.user);
  const [prog, setProg] = useState<Record<string, LessonProgress>>({});
  const [classes, setClasses] = useState<{ name: string; code: string; teacher: string }[]>([]);
  useEffect(() => { setProg(loadProgress()); if (user) classesApi.list().then(r => setClasses(r.enrolled)).catch(() => {}); }, [user]);
  const done = ALL.filter(x => prog[x.lesson.id]?.done).length;
  return (
    <Shell title="My progress">
      <p><b>{user?.name}</b> · {user?.email} · {done} of {ALL.length} lessons complete</p>
      {classes.length > 0 && <p>Classes: {classes.map(c => `${c.name} (${c.teacher})`).join(', ')}</p>}
      {MODULES.map(m => (
        <section key={m.id} className="learn-mod">
          <h2>{m.title}</h2>
          <ol>{m.lessons.map(l => { const p = prog[l.id]; return (
            <li key={l.id}><Link href={`/learn/${m.id}/${l.id}`}>{l.title}</Link> <span className="learn-prog">{p?.done ? '✓ done' : p?.steps ? `step ${p.steps}/${l.steps.length}` : ''}</span></li>
          ); })}</ol>
        </section>
      ))}
    </Shell>
  );
}

export function TeacherPage() {
  useLoaded();
  const user = useAccount(s => s.user);
  const [classes, setClasses] = useState<TeachingClass[]>([]);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const load = () => classesApi.list().then(r => setClasses(r.teaching)).catch(e => setMsg(e.message));
  useEffect(() => { if (user) load(); }, [user]);
  const create = async () => { try { const r = await classesApi.create(name); setMsg(`Class created. Join code: ${r.code}`); setName(''); load(); } catch (e) { setMsg((e as Error).message); } };
  const joinUrl = (code: string) => `${location.origin}${location.pathname.replace(/teacher\/?$/, '')}join/?code=${code}`;
  return (
    <Shell title="Teacher: my classes">
      <div className="wb-row"><input className="acct-input" placeholder="Class name, e.g. 10-B Physics" value={name} onChange={e => setName(e.target.value)} /><button className="btn on" disabled={!name.trim()} onClick={create}>Create class</button></div>
      {msg && <p>{msg}</p>}
      {classes.map(c => (
        <section key={c.code} className="learn-mod">
          <h2>{c.name} <small>code <b>{c.code}</b> · {c.students.length} students</small></h2>
          <p className="wb-muted">Students join at <code>{joinUrl(c.code)}</code></p>
          {c.students.length > 0 && (
            <div className="acct-grid-wrap"><table className="acct-grid">
              <thead><tr><th>Student</th>{ALL.map(x => <th key={x.lesson.id} title={`${x.module.title}: ${x.lesson.title}`}>{x.lesson.title.slice(0, 14)}</th>)}</tr></thead>
              <tbody>{c.students.map(s => (
                <tr key={s.email}><td title={s.email}>{s.name || s.email}</td>{ALL.map(x => { const p = s.progress[x.lesson.id]; return <td key={x.lesson.id} className={p?.done ? 'ok' : p?.steps ? 'mid' : ''}>{p?.done ? '✓' : p?.steps ? p.steps : ''}</td>; })}</tr>
              ))}</tbody>
            </table></div>
          )}
          <button className="btn" onClick={async () => { if (confirm(`Delete class ${c.name}?`)) { await classesApi.remove(c.code); load(); } }}>Delete class</button>
        </section>
      ))}
    </Shell>
  );
}

export function JoinPage() {
  useLoaded();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { const c = new URLSearchParams(location.search).get('code'); if (c) setCode(c); }, []);
  const join = async () => { try { const r = await classesApi.join(code); setMsg(`✓ You joined ${r.name}. Your teacher can now see your lesson progress.`); } catch (e) { setMsg((e as Error).message); } };
  return (
    <Shell title="Join a class">
      <div className="wb-row"><input className="acct-input" placeholder="6-letter code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={6} /><button className="btn on" disabled={code.length < 6} onClick={join}>Join</button></div>
      {msg && <p>{msg}</p>}
    </Shell>
  );
}
