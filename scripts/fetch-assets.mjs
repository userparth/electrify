import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = [
  {
    name: 'MicroPython v1.29.0 for RP2040 (MIT)',
    url: 'https://micropython.org/resources/firmware/RPI_PICO-20260824-v1.29.0.uf2',
    out: 'apps/web/public/firmware/micropython-rp2040.uf2',
    sha256: 'e1160e602e277d85920adb5fe741435edccba9ba6ecadc85fdab75252eeff4e9',
  },
  {
    name: 'RP2040 bootrom B1 (Raspberry Pi, BSD-3-Clause)',
    url: 'https://github.com/raspberrypi/pico-bootrom-rp2040/releases/download/b1/b1.elf',
    out: 'apps/web/public/firmware/rp2040-bootrom-b1.bin',
    sha256: '53b2723b590207c678c5a52c095e9150d2afa60e7f66a1c26d188ff59d29c778',
    outSha256: '8e933262ab2faa7b332f7cc5f9feaf50a8c36092977f95f9871344f6366c2a76',
    extract: 'elf-rom',
  },
];

/** Pulls the 16 KB ROM image (the PT_LOAD segment at address 0) out of the official bootrom ELF. */
function extractRom(elf) {
  const phoff = elf.readUInt32LE(0x1c), phentsize = elf.readUInt16LE(0x2a), phnum = elf.readUInt16LE(0x2c);
  for (let i = 0; i < phnum; i++) {
    const o = phoff + i * phentsize;
    if (elf.readUInt32LE(o) === 1 && elf.readUInt32LE(o + 12) === 0) return elf.subarray(elf.readUInt32LE(o + 4), elf.readUInt32LE(o + 4) + elf.readUInt32LE(o + 16));
  }
  throw new Error('bootrom ELF has no segment at address 0');
}

for (const a of ASSETS) {
  const out = join(root, a.out);
  try {
    const have = createHash('sha256').update(await readFile(out)).digest('hex'), want = a.extract ? a.outSha256 : a.sha256;
    if (!want || have === want) { console.log(`✓ ${a.name} already present`); continue; }
  } catch {}
  console.log(`↓ ${a.name}`);
  const res = await fetch(a.url);
  if (!res.ok) throw new Error(`${a.url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer()), sum = createHash('sha256').update(buf).digest('hex');
  if (a.sha256 && sum !== a.sha256) throw new Error(`${a.name}: checksum mismatch (${sum})`);
  const data = a.extract === 'elf-rom' ? extractRom(buf) : buf, outSum = createHash('sha256').update(data).digest('hex');
  if (a.extract && a.outSha256 && outSum !== a.outSha256) throw new Error(`${a.name}: extracted image checksum mismatch (${outSum})`);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, data);
  console.log(`  saved ${a.out} (${(data.length / 1024).toFixed(0)} KB, download sha256 ${sum}${a.extract ? `, image sha256 ${outSum}` : ''})`);
}

const COPY = [
  { name: 'Pyodide runtime (MPL-2.0)', pkg: 'pyodide', from: 'apps/web', out: 'apps/web/public/pyodide/v314.0.7', only: /\.(mjs|js|wasm|zip|json)$/, skip: /^(package\.json|.*\.map)$/ },
];

for (const c of COPY) {
  const pkgDir = dirname(createRequire(join(root, c.from, 'package.json')).resolve(`${c.pkg}/package.json`));
  const out = join(root, c.out);
  await mkdir(out, { recursive: true });
  let total = 0, n = 0;
  for (const f of await readdir(pkgDir)) {
    if (!c.only.test(f) || c.skip.test(f)) continue;
    const src = join(pkgDir, f), dst = join(out, f), size = (await stat(src)).size;
    const same = await stat(dst).then(s => s.size === size, () => false);
    if (!same) await copyFile(src, dst);
    total += size; n++;
  }
  console.log(`✓ ${c.name}: ${n} files, ${(total / 1048576).toFixed(1)} MB in ${c.out}`);
}
