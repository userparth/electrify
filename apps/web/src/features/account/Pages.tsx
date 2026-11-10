'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MODULES } from '@/content';
import { loadProgress, type LessonProgress } from '../learn/check';
import { AccountButton } from './AccountButton';
import { classesApi, useAccount, type EnrolledClass, type TeachingClass } from './api';
import { useProfile } from '@/lib/profile';
import { t } from '@/lib/i18n';

const ALL = MODULES.flatMap(m => m.lessons.map(l => ({ module: m, lesson: l })));
const BY_ID = new Map(ALL.map(x => [x.lesson.id, x]));
const status = (p: LessonProgress | undefined, steps: number) => p?.done ? '✓ done' : p?.steps ? `step ${p.steps}/${steps}` : 'not started';

function DeleteAccount() {
  const deleteAccount = useAccount(s => s.deleteAccount);
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState('');
  const go = async () => { try { await deleteAccount(); setMsg('Your account, progress and classes were deleted. Progress saved in this browser stays here.'); } catch (e) { setMsg((e as Error).message); } };
  return (
    <section className="learn-mod acct-danger">
      <h2>Delete my account</h2>
      {msg ? <p>{msg}</p> : !ask ? <button className="btn" onClick={() => setAsk(true)}>Delete my account…</button> : (
        <>
          <p>This permanently deletes your account, your saved progress on the server and any classes you teach. It cannot be undone.</p>
          <div className="wb-row"><button className="btn danger" onClick={go}>Yes, delete everything</button><button className="btn" onClick={() => setAsk(false)}>Cancel</button></div>
        </>
      )}
    </section>
  );
}

function AssignLessons({ c, onSaved }: { c: TeachingClass; onSaved(assigned: string[]): void }) {
  const [pick, setPick] = useState(() => new Set(c.assigned));
  const [msg, setMsg] = useState('');
  const toggle = (id: string) => setPick(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const save = async () => { try { const r = await classesApi.assign(c.code, ALL.map(x => x.lesson.id).filter(id => pick.has(id))); onSaved(r.assigned); setMsg(`Saved: ${r.assigned.length} lessons assigned.`); } catch (e) { setMsg((e as Error).message); } };
  return (
    <details className="acct-assign">
      <summary>Assign lessons ({c.assigned.length} assigned)</summary>
      {MODULES.map(m => (
        <fieldset key={m.id}><legend>{m.title}</legend>
          {m.lessons.map(l => <label key={l.id}><input type="checkbox" checked={pick.has(l.id)} onChange={() => toggle(l.id)} /> {l.title}</label>)}
        </fieldset>
      ))}
      <div className="wb-row"><button className="btn on" onClick={save}>Save assignments</button>{msg && <span className="wb-muted">{msg}</span>}</div>
    </details>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const { user, available, loaded, signIn } = useAccount(), under13 = useProfile(s => s.profile.under13);
  return (
    <main className="home acct-page">
      <div className="acct-top"><Link href="/">← Electronics Bench</Link><AccountButton /></div>
      <h1>{title}</h1>
      {!loaded ? <p>Loading…</p>
        : !available ? <p>Accounts aren’t switched on for this server yet. Lessons still save your progress in this browser.</p>
          : !user && under13 ? <p>{t('account.under13')}</p>
          : !user ? <p><button className="btn on" onClick={signIn}>{t('signin.button')}</button> to continue.</p>
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
  const [classes, setClasses] = useState<EnrolledClass[]>([]);
  useEffect(() => { setProg(loadProgress()); if (user) classesApi.list().then(r => setClasses(r.enrolled)).catch(() => {}); }, [user]);
  const done = ALL.filter(x => prog[x.lesson.id]?.done).length;
  return (
    <Shell title="My progress">
      <p><b>{user?.name}</b> · {user?.email} · {done} of {ALL.length} lessons complete</p>
      {classes.length > 0 && <p>Classes: {classes.map(c => `${c.name} (${c.teacher})`).join(', ')}</p>}
      {classes.filter(c => c.assigned.length).map(c => (
        <section key={c.code} className="learn-mod acct-assigned">
          <h2>Assigned in {c.name} <small>by {c.teacher}</small></h2>
          <ol>{c.assigned.map(id => BY_ID.get(id)).filter(x => !!x).map(x => (
            <li key={x!.lesson.id}><Link href={`/learn/${x!.module.id}/${x!.lesson.id}`}>{x!.lesson.title}</Link> <span className="learn-prog">{status(prog[x!.lesson.id], x!.lesson.steps.length)}</span></li>
          ))}</ol>
        </section>
      ))}
      {MODULES.map(m => (
        <section key={m.id} className="learn-mod">
          <h2>{m.title}</h2>
          <ol>{m.lessons.map(l => { const p = prog[l.id]; return (
            <li key={l.id}><Link href={`/learn/${m.id}/${l.id}`}>{l.title}</Link> <span className="learn-prog">{p?.done ? '✓ done' : p?.steps ? `step ${p.steps}/${l.steps.length}` : ''}</span></li>
          ); })}</ol>
        </section>
      ))}
      <DeleteAccount />
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
          <AssignLessons c={c} onSaved={assigned => setClasses(cs => cs.map(x => x.code === c.code ? { ...x, assigned } : x))} />
          {c.students.length > 0 && (() => {
            const cols = c.assigned.length ? [...c.assigned.map(id => BY_ID.get(id)!).filter(Boolean), ...ALL.filter(x => !c.assigned.includes(x.lesson.id))] : ALL;
            const set = new Set(c.assigned);
            return (
              <div className="acct-grid-wrap"><table className="acct-grid">
                <thead><tr><th>Student</th>{set.size > 0 && <th>Assigned done</th>}{cols.map(x => <th key={x.lesson.id} className={set.has(x.lesson.id) ? 'asg' : ''} title={`${x.module.title}: ${x.lesson.title}`}>{set.has(x.lesson.id) ? '★ ' : ''}{x.lesson.title.slice(0, 14)}</th>)}</tr></thead>
                <tbody>{c.students.map(s => (
                  <tr key={s.email}><td title={s.email}>{s.name || s.email}</td>{set.size > 0 && <td>{c.assigned.filter(id => s.progress[id]?.done).length}/{set.size}</td>}{cols.map(x => { const p = s.progress[x.lesson.id]; return <td key={x.lesson.id} className={p?.done ? 'ok' : p?.steps ? 'mid' : ''}>{p?.done ? '✓' : p?.steps ? p.steps : ''}</td>; })}</tr>
                ))}</tbody>
              </table></div>
            );
          })()}
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
