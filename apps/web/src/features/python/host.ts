'use client';
import { BOARD_TO_BCM, GPIO } from './layout';
import { PY_BOOT, PY_FILES } from './shims';
import { createPythonWorker } from './worker';
import { asset } from '@/lib/paths';

interface Session {
  worker: Worker | null;
  gpio: Int32Array;
  interrupt: Uint8Array;
  out: string;
  running: boolean;
  ready: boolean;
  message?: string;
  runId: number;
  code: string;
  queued: string | null;
  api: { gpio: Int32Array; read(): string; write(t: string): void; status(): { running: boolean; message?: string } };
}

// Versioned folder so a new Pyodide never meets stale CDN/browser caches.
const INDEX_URL = asset('/pyodide/v314.0.7/');
const MAX_OUT = 20000;

function resetPins(g: Int32Array) {
  for (let b = 0; b < GPIO.COUNT; b++) {
    Atomics.store(g, GPIO.MODE + b, 0); Atomics.store(g, GPIO.OUT + b, 0);
    Atomics.store(g, GPIO.PULL + b, 0); Atomics.store(g, GPIO.DUTY + b, -1);
  }
}

class PythonHostImpl {
  private sessions = new Map<string, Session>();

  private create(sid: string): Session {
    const isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
    const gpio = new Int32Array(isolated ? new SharedArrayBuffer(GPIO.SIZE * 4) : new ArrayBuffer(GPIO.SIZE * 4));
    const interrupt = new Uint8Array(isolated ? new SharedArrayBuffer(1) : new ArrayBuffer(1));
    resetPins(gpio);
    const s: Session = {
      worker: null, gpio, interrupt, out: '', running: false, ready: false, runId: -1, code: '', queued: null,
      api: {
        gpio,
        read: () => { const t = s.out; s.out = ''; return t; },
        write: () => {},
        status: () => ({ running: s.running, message: s.message }),
      },
    };
    if (!isolated) { s.message = 'Python needs a cross-origin isolated page (COOP/COEP headers).'; this.sessions.set(sid, s); return s; }
    s.message = 'loading Python…';
    const w = createPythonWorker(INDEX_URL);
    w.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === 'ready') { s.ready = true; s.message = undefined; if (s.queued != null) this.launch(s, s.queued); }
      if (m.type === 'started') { s.running = true; s.message = 'running'; }
      if (m.type === 'out') s.out = (s.out + m.text).slice(-MAX_OUT);
      if (m.type === 'done') { s.running = false; s.message = m.message; resetPins(gpio); }
      if (m.type === 'error') { s.running = false; s.message = String(m.message).split('\n').filter(Boolean).pop(); s.out = (s.out + m.message + '\n').slice(-MAX_OUT); resetPins(gpio); }
    };
    w.onerror = e => { s.running = false; s.message = `Python worker crashed: ${e.message}`; };
    w.postMessage({ type: 'init', gpio: gpio.buffer, interrupt: interrupt.buffer, board: BOARD_TO_BCM, files: PY_FILES, boot: PY_BOOT });
    s.worker = w;
    this.sessions.set(sid, s);
    return s;
  }

  private interrupt(s: Session) {
    Atomics.store(s.interrupt, 0, 2);
    Atomics.add(s.gpio, GPIO.WAKE, 1);
    Atomics.notify(s.gpio, GPIO.WAKE);
  }

  private launch(s: Session, code: string) {
    if (!s.worker) return;
    if (!s.ready) { s.queued = code; return; }
    s.queued = null;
    if (s.running) this.interrupt(s);
    // Clear the interrupt only after the worker has picked up the stop; the run message queues behind it.
    setTimeout(() => {
      Atomics.store(s.interrupt, 0, 0);
      Atomics.store(s.gpio, GPIO.WAKE, 0);
      resetPins(s.gpio);
      s.message = 'starting…';
      s.worker!.postMessage({ type: 'run', code });
    }, s.running ? 30 : 0);
  }

  ensure(sid: string, code: string, runId: number) {
    const s = this.sessions.get(sid) ?? this.create(sid);
    if (s.runId !== runId) { s.runId = runId; s.code = code; this.launch(s, code); }
    return s.api;
  }

  stop(sid: string) {
    const s = this.sessions.get(sid);
    if (!s) return;
    s.queued = null;
    if (s.running) this.interrupt(s);
    s.runId = -1;
  }

  prune(keep: string[]) {
    for (const [sid, s] of this.sessions) if (!keep.includes(sid)) { s.worker?.terminate(); this.sessions.delete(sid); }
  }
}

/** Call once on the client (e.g. in the workbench's mount effect) so `rpi4` parts can run Python. */
export function registerPythonHost() {
  const g = globalThis as { BenchHost?: { python?: unknown } };
  if (g.BenchHost?.python) return;
  g.BenchHost = { ...g.BenchHost, python: new PythonHostImpl() };
}
