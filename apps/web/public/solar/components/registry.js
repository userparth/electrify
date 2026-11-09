const BenchParts = (() => {
  const parts = [];
  const lerpTable = (T, x) => {
    if (x <= T[0][0]) return T[0][1];
    for (let i = 1; i < T.length; i++) if (x <= T[i][0]) { const [a, va] = T[i - 1], [b, vb] = T[i]; return va + (vb - va) * (x - a) / (b - a); }
    return T[T.length - 1][1];
  };
  return {
    register(def) { parts.push(def); },
    list: () => parts.slice(),
    get: id => parts.find(p => p.id === id),
    initState(def) { const s = {}; (def.controls || []).forEach(c => s[c.key] = c.value); return s; },
    // Offsets an iso() so each part can draw around its own local origin.
    at(I, at = [0, 0, 0]) { const [ox, oy] = I.P(...at); return iso(I.S, ox, oy); },
    anchor(J, prefix, net, label, x, y, z, r = 5) {
      const [a, b] = J.P(x, y, z);
      return `<circle data-anchor="${prefix}${net}" data-node="${prefix}${net}" data-label="${label}" cx="${a.toFixed(1)}" cy="${b.toFixed(1)}" r="${r}" fill="#f2efe7" stroke="#1d1d1b" stroke-width="1.5"/>`;
    },
    compact: false,
    label(J, text, at, dx, dy, part) { if (this.compact) return ''; const [x, y] = J.P(...at); return pill(x + dx, y + dy, text, part || '', x, y); },
    lerpTable,
  };
})();
