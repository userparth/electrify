'use client';
// Mirrors FirmwareHost / PicoFirmware in packages/parts/src/mcu/rp2040.ts.
interface PicoFirmware { bootrom: Uint8Array; uf2: Uint8Array }
interface FirmwareHost { pico(): PicoFirmware | null; load?(): Promise<PicoFirmware | null> }

const FILES = { bootrom: '/firmware/rp2040-bootrom-b1.bin', uf2: '/firmware/micropython-rp2040.uf2' };

class BrowserFirmwareHost implements FirmwareHost {
  private fw: PicoFirmware | null = null;
  private loading: Promise<PicoFirmware | null> | null = null;

  pico() { return this.fw; }

  load() {
    this.loading ??= Promise.all(Object.values(FILES).map(async url => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status} (run \`pnpm setup\` to fetch firmware)`);
      return new Uint8Array(await res.arrayBuffer());
    })).then(([bootrom, uf2]) => (this.fw = { bootrom: bootrom!, uf2: uf2! }), err => { console.error(err); this.loading = null; return null; });
    return this.loading;
  }
}

/** Lets the Pico part fetch its bootrom and MicroPython image (served from /firmware, not bundled). */
export function registerFirmwareHost() {
  const g = globalThis as { BenchHost?: { firmware?: FirmwareHost } };
  if (g.BenchHost?.firmware) return;
  g.BenchHost = { ...g.BenchHost, firmware: new BrowserFirmwareHost() };
}
