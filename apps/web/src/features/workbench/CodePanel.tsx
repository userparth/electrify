'use client';
import { getPart } from '@eb/parts';
import { useEffect, useRef, useState } from 'react';
import { runner, useBench } from './store';

export function CodePanel() {
  const sel = useBench(s => s.sel), doc = useBench(s => s.doc), serial = useBench(s => s.serial), status = useBench(s => s.status);
  const inst = sel?.kind === 'part' ? doc.parts.find(p => p.id === sel.id) : undefined, def = inst && getPart(inst.type);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ ok: boolean; text: string } | null>(null);
  const [line, setLine] = useState('');
  const out = useRef<HTMLPreElement>(null);

  useEffect(() => { if (out.current) out.current.scrollTop = out.current.scrollHeight; }, [serial, inst?.id]);
  if (!inst || !def?.program) return null;

  const lang = def.program.language, saved = String(inst.props.code ?? def.program.template), code = draft[inst.id] ?? saved, st = status[inst.id];
  const save = () => { if (code !== saved) useBench.getState().setProps(inst.id, { code }); };

  const upload = async () => {
    save(); setBusy(true); setLog(null);
    try {
      if (lang === 'arduino') {
        const res = await fetch('/api/compile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, board: 'uno' }) });
        const r = await res.json() as { ok: boolean; hex?: string; log: string; cached?: boolean };
        setLog({ ok: r.ok, text: r.ok ? `✓ Compiled${r.cached ? ' (cached)' : ''} and uploaded.\n${r.log}` : r.log });
        if (r.ok && r.hex) { useBench.getState().clearSerial(inst.id); useBench.getState().setProps(inst.id, { code, binary: r.hex }); }
      } else {
        useBench.getState().clearSerial(inst.id);
        useBench.getState().setProps(inst.id, { code, run: true, runId: Number(inst.props.runId ?? 0) + 1 });
        setLog({ ok: true, text: '▶ Running…' });
      }
    } catch (e) { setLog({ ok: false, text: `Could not reach the compiler: ${(e as Error).message}` }); }
    setBusy(false);
  };
  const stop = () => useBench.getState().setProps(inst.id, { run: false });
  const send = () => { runner.built?.runtimes.get(inst.id)?.serial?.write(line + '\n'); setLine(''); };

  return (
    <section className="wb-code">
      <div className="wb-code-head">
        <b>{def.name}</b>
        <span className="wb-muted">{lang === 'arduino' ? 'Arduino C++' : lang === 'micropython' ? 'MicroPython' : 'Python 3'}</span>
        <span className={`wb-pill ${st?.running ? 'on' : ''}`}>{st?.running ? '● running' : '○ stopped'}{st?.message ? ` · ${st.message}` : ''}</span>
        <span className="wb-grow" />
        <button className="btn on" disabled={busy} onClick={upload}>{busy ? 'Compiling…' : lang === 'arduino' ? '⬆ Compile & upload' : '▶ Run'}</button>
        {lang !== 'arduino' && <button className="btn" onClick={stop}>■ Stop</button>}
        <button className="btn" onClick={() => { setDraft(d => ({ ...d, [inst.id]: def.program!.template })); }}>Reset code</button>
      </div>
      <div className="wb-code-body">
        <textarea
          className="wb-editor" spellCheck={false} value={code}
          onChange={e => setDraft(d => ({ ...d, [inst.id]: e.target.value }))}
          onBlur={save}
          onKeyDown={e => {
            if (e.key === 'Tab') {
              e.preventDefault();
              const t = e.currentTarget, a = t.selectionStart, b = t.selectionEnd, next = code.slice(0, a) + '  ' + code.slice(b);
              setDraft(d => ({ ...d, [inst.id]: next }));
              requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = a + 2; });
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); upload(); }
          }}
        />
        <div className="wb-serial">
          {log && <pre className={`wb-compile ${log.ok ? '' : 'bad'}`}>{log.text}</pre>}
          <div className="wb-k">Serial monitor</div>
          <pre ref={out} className="wb-log wb-serial-out">{serial[inst.id] || '(nothing yet)'}</pre>
          <div className="wb-row" style={{ marginTop: 6 }}>
            <input className="wb-serial-in" value={line} placeholder="Send to the board…" onChange={e => setLine(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} />
            <button className="btn" onClick={send}>Send</button>
            <button className="btn" onClick={() => useBench.getState().clearSerial(inst.id)}>Clear</button>
          </div>
        </div>
      </div>
    </section>
  );
}
