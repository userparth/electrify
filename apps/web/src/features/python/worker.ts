import { GPIO } from './layout';

type Pyodide = {
  FS: { mkdirTree(p: string): void; writeFile(p: string, d: string): void };
  registerJsModule(name: string, mod: object): void;
  setInterruptBuffer(b: Uint8Array): void;
  setStdout(o: { batched: (s: string) => void }): void;
  setStderr(o: { batched: (s: string) => void }): void;
  runPythonAsync(code: string): Promise<unknown>;
  runPython(code: string): unknown;
};
type Layout = typeof GPIO;

/** Runs inside the worker. Must be self-contained: it is serialised with toString(). */
function workerMain(loadPyodide: (o: { indexURL: string }) => Promise<Pyodide>, G: Layout, indexURL: string) {
  const post = (m: unknown) => (self as unknown as { postMessage(m: unknown): void }).postMessage(m);
  let py: Pyodide | null = null;
  let gpio: Int32Array;

  async function init(board: [number, number][], files: [string, string][], boot: string) {
    const p = await loadPyodide({ indexURL });
    p.setStdout({ batched: s => post({ type: 'out', text: s + '\n' }) });
    p.setStderr({ batched: s => post({ type: 'out', text: s + '\n' }) });
    p.registerJsModule('_benchgpio', {
      setup(b: number, mode: number, pull: number) {
        Atomics.store(gpio, G.MODE + b, mode);
        Atomics.store(gpio, G.PULL + b, pull);
        Atomics.store(gpio, G.DUTY + b, -1);
        if (!mode) Atomics.store(gpio, G.OUT + b, 0);
      },
      write(b: number, v: number) { Atomics.store(gpio, G.OUT + b, v ? 1 : 0); },
      read(b: number) { return Atomics.load(gpio, G.IN + b); },
      is_output(b: number) { return Atomics.load(gpio, G.MODE + b) === 1; },
      pwm(b: number, freq: number, duty: number) {
        Atomics.store(gpio, G.FREQ + b, Math.max(1, Math.round(freq)));
        Atomics.store(gpio, G.DUTY + b, Math.round(Math.min(1, Math.max(0, duty)) * 10000));
      },
      nopwm(b: number) { Atomics.store(gpio, G.DUTY + b, -1); },
      now: () => performance.now(),
      wait(ms: number) { Atomics.wait(gpio, G.WAKE, 0, ms); },
      board_map: () => board,
    });
    p.FS.mkdirTree('/home/pyodide/gpiozero');
    p.FS.mkdirTree('/home/pyodide/RPi');
    for (const [path, src] of files) p.FS.writeFile(`/home/pyodide/${path}`, src);
    p.runPython(boot);
    py = p;
  }

  self.onmessage = async (e: MessageEvent) => {
    const m = e.data;
    try {
      if (m.type === 'init') {
        gpio = new Int32Array(m.gpio);
        await init(m.board, m.files, m.boot);
        py!.setInterruptBuffer(new Uint8Array(m.interrupt));
        post({ type: 'ready' });
      }
      if (m.type === 'run' && py) {
        post({ type: 'started' });
        try {
          await py.runPythonAsync(m.code);
          post({ type: 'done', message: 'finished' });
        } catch (err) {
          const msg = String((err as Error).message ?? err);
          if (/KeyboardInterrupt/.test(msg)) post({ type: 'done', message: 'stopped' });
          else post({ type: 'error', message: msg });
        }
      }
    } catch (err) {
      post({ type: 'error', message: `Python runtime failed to load: ${String((err as Error).message ?? err)}` });
    }
  };
}

/** A real module worker built from a Blob, so the bundler can't turn it into a classic worker (Pyodide refuses those). */
export function createPythonWorker(indexURL: string): Worker {
  const base = new URL(indexURL, location.origin).href;
  const src = `import { loadPyodide } from ${JSON.stringify(base + 'pyodide.mjs')};\n(${workerMain.toString()})(loadPyodide, ${JSON.stringify(GPIO)}, ${JSON.stringify(base)});\n`;
  return new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), { type: 'module' });
}
