const Circuit = (() => {
  const GMIN = 1e-9;

  function gauss(A, b) {
    const n = b.length;
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-18) continue;
      if (p !== c) { [A[p], A[c]] = [A[c], A[p]]; [b[p], b[c]] = [b[c], b[p]]; }
      for (let r = c + 1; r < n; r++) {
        const f = A[r][c] / A[c][c];
        if (!f) continue;
        for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
      let s = b[r];
      for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k];
      x[r] = Math.abs(A[r][r]) < 1e-18 ? 0 : s / A[r][r];
    }
    return x;
  }

  // Elements: {t:'R',a,b,r} | {t:'I',a,b,i} pushes i out of a into b | {t:'N',a,b,f:v=>[i,g]} current a→b at v=Va-Vb.
  function solve(n, elems, guess) {
    let V = guess && guess.length === n ? guess.slice() : new Array(n).fill(0);
    for (let it = 0; it < 80; it++) {
      const G = Array.from({ length: n }, () => new Array(n).fill(0)), J = new Array(n).fill(0);
      for (let i = 0; i < n; i++) G[i][i] += GMIN;
      const cond = (a, b, g) => { G[a][a] += g; G[b][b] += g; G[a][b] -= g; G[b][a] -= g; };
      const src = (a, b, i) => { J[a] -= i; J[b] += i; };
      for (const e of elems) {
        if (e.a === e.b) continue;
        if (e.t === 'R') cond(e.a, e.b, 1 / Math.max(e.r, 1e-6));
        else if (e.t === 'I') src(e.a, e.b, e.i);
        else if (e.t === 'N') {
          const v = V[e.a] - V[e.b], [i, g] = e.f(v), gg = Math.max(g, 1e-12);
          cond(e.a, e.b, gg); src(e.a, e.b, i - gg * v);
        }
      }
      const X = gauss(G, J);
      let d = 0;
      for (let i = 0; i < n; i++) { let dv = X[i] - V[i]; if (Math.abs(dv) > 3) dv = Math.sign(dv) * 3; V[i] += dv; d = Math.max(d, Math.abs(dv)); }
      if (d < 1e-7) break;
    }
    return V;
  }

  function current(e, V) {
    if (e.a === e.b) return 0;
    const v = V[e.a] - V[e.b];
    if (e.t === 'R') return v / Math.max(e.r, 1e-6);
    if (e.t === 'I') return -e.i;
    return e.f(v)[0];
  }

  function groups(n, elems) {
    const p = Array.from({ length: n }, (_, i) => i), f = x => p[x] === x ? x : (p[x] = f(p[x]));
    for (const e of elems) if (e.a !== e.b && !(e.t === 'R' && e.r > 1e8)) p[f(e.a)] = f(e.b);
    return Array.from({ length: n }, (_, i) => f(i));
  }

  const diode = (is = 1e-9, nvt = 0.05) => v => {
    const x = Math.min(v / nvt, 40), ex = Math.exp(x), i = is * (ex - 1), g = is * ex / nvt;
    return v / nvt > 40 ? [i + g * (v - 40 * nvt), g] : [i, g];
  };

  return { solve, current, groups, diode };
})();
