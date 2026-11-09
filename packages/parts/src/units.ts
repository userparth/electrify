const PREFIX: [number, string][] = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];

export function formatSI(v: number, unit = '', digits = 3): string {
  if (v === 0 || !isFinite(v)) return `${v}${unit}`;
  const a = Math.abs(v);
  for (const [m, p] of PREFIX) if (a >= m * 0.9995) return `${+(v / m).toPrecision(digits)}${p}${unit}`;
  return `${v.toExponential(2)}${unit}`;
}

export function parseSI(text: string): number | null {
  const m = text.trim().replace(/Ω|ohm|F|H|V|A/gi, '').match(/^(-?\d*\.?\d+)\s*([GMkKmuµnp]?)$/);
  if (!m) return null;
  const mult: Record<string, number> = { G: 1e9, M: 1e6, k: 1e3, K: 1e3, '': 1, m: 1e-3, u: 1e-6, µ: 1e-6, n: 1e-9, p: 1e-12 };
  return parseFloat(m[1]!) * (mult[m[2]!] ?? 1);
}

const BAND = ['#1d1d1b', '#7a4b22', '#d6452f', '#ef8a2b', '#f3c33b', '#3fae66', '#3a6ed6', '#8b5cc7', '#8a8577', '#f6f4ee'];

/** 4-band colour code: two digits, multiplier, gold tolerance. */
export function resistorBands(ohms: number): string[] {
  if (!(ohms > 0)) return [BAND[0]!, BAND[0]!, BAND[0]!, '#c9a23a'];
  let exp = Math.floor(Math.log10(ohms)) - 1;
  let sig = Math.round(ohms / 10 ** exp);
  if (sig >= 100) { sig = Math.round(sig / 10); exp++; }
  const mult = exp < 0 ? (exp === -1 ? '#c9a23a' : '#c0c0c0') : BAND[Math.min(exp, 9)]!;
  return [BAND[Math.floor(sig / 10)]!, BAND[sig % 10]!, mult, '#c9a23a'];
}
