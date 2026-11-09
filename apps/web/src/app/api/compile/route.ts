import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = process.env.ARDUINO_CLI ?? 'arduino-cli';
const BOARDS: Record<string, string> = { uno: 'arduino:avr:uno', nano: 'arduino:avr:nano' };
const MAX_SOURCE = 64 * 1024;
const MAX_PARALLEL = 2;

const cache = new Map<string, { ok: boolean; hex: string; log: string }>();
let active = 0;
const queue: (() => void)[] = [];
const slot = () => new Promise<void>(res => { if (active < MAX_PARALLEL) { active++; res(); } else queue.push(() => { active++; res(); }); });
const release = () => { active--; queue.shift()?.(); };

function run(args: string[], cwd: string) {
  return new Promise<{ code: number; out: string }>(res => {
    execFile(CLI, args, { cwd, timeout: 60_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      res({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, out: `${stdout}\n${stderr}`.trim() });
    });
  });
}

export async function POST(request: Request) {
  let body: { code?: unknown; board?: unknown };
  try { body = await request.json(); } catch { return Response.json({ ok: false, log: 'Bad request' }, { status: 400 }); }
  const code = typeof body.code === 'string' ? body.code : '', board = typeof body.board === 'string' && BOARDS[body.board] ? body.board : 'uno';
  if (!code.trim()) return Response.json({ ok: false, log: 'The sketch is empty.' }, { status: 400 });
  if (code.length > MAX_SOURCE) return Response.json({ ok: false, log: 'The sketch is too large (64 KB max).' }, { status: 413 });

  const key = createHash('sha256').update(board + '\0' + code).digest('hex');
  const hit = cache.get(key);
  if (hit) return Response.json({ ...hit, cached: true });

  await slot();
  const dir = join(await realpath(tmpdir()), `eb-compile-${randomUUID()}`), sketch = join(dir, 'sketch');
  try {
    await mkdir(sketch, { recursive: true });
    await writeFile(join(sketch, 'sketch.ino'), code);
    const r = await run(['compile', '--no-color', '--fqbn', BOARDS[board]!, '--output-dir', join(dir, 'out'), sketch], dir);
    const log = r.out.split(sketch + '/').join('').split(dir).join('').replace(/\x1b\[[0-9;]*m/g, '')
      .split('\n').filter(l => !/^(Used (platform|library)|arduino:avr\s)/.test(l.trim())).join('\n').trim();
    if (r.code !== 0) {
      const missing = /ENOENT|not found/.test(log) && !/error:/.test(log);
      return Response.json({ ok: false, log: missing ? 'The Arduino compiler (arduino-cli) is not installed on this server.' : log });
    }
    const hex = await readFile(join(dir, 'out', 'sketch.ino.hex'), 'utf8');
    const result = { ok: true, hex, log };
    cache.set(key, result);
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    return Response.json(result);
  } finally {
    release();
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
