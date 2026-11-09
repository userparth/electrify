BenchParts.register({
  id: 'fuse', name: 'Blade fuse + holder',
  specs: [['Type', 'Inline blade holder, ATC/ATO fuse'], ['Battery fuse', '10A, on battery + near the battery'], ['Router line', '2A'], ['Good fuse', '~0.01Ω (typical): continuity beeps'], ['Blown fuse', 'OL: no beep']],
  controls: [
    { key: 'rating', label: 'Rating', type: 'select', options: [['2', '2A'], ['5', '5A'], ['10', '10A'], ['15', '15A'], ['20', '20A']], value: '10' },
    { key: 'amps', label: 'Current through it', type: 'range', min: 0, max: 30, step: 0.5, value: 3, unit: 'A' },
    { key: 'blown', label: 'Blown', type: 'toggle', value: false },
  ],
  notes: 'A fuse protects the wire, not the device. Size it below what the wire can carry and put it as close to the battery as possible: any short between battery and fuse is unprotected. Test fuses out of the circuit with continuity.',
  update(s, log) { if (!s.blown && s.amps > +s.rating) { s.blown = true; log && log(`💥 ${s.amps}A through a ${s.rating}A fuse: it blew.`, 'e'); } },
  nets: () => ({}),
  resistance(s, a, b) { return (a === 'f1' && b === 'f2') || (a === 'f2' && b === 'f1') ? (s.blown ? Infinity : 0.01) : Infinity; },
  draw(I, s, o) {
    const J = BenchParts.at(I, o.at), A = BenchParts.anchor, p = o.prefix || '';
    const COL = { 2: '#9aa3ad', 5: '#e0a35a', 10: '#d6452f', 15: '#3a6ed6', 20: '#f0c13a' };
    let out = `<path d="${J.path([[0, 2, 0.4], [3, 2, 0.4]])}" fill="none" stroke="#d6452f" stroke-width="4"/><path d="${J.path([[7, 2, 0.4], [10, 2, 0.4]])}" fill="none" stroke="#d6452f" stroke-width="4"/>`;
    out += J.box(3, 1.2, 0, 4, 1.6, 1.4, '#2b2b2b');
    out += J.box(4.2, 1.6, 1.4, 1.6, 0.6, 1.8, s.blown ? '#b9b4a8' : COL[s.rating]);
    out += `<g transform="${J.faceY(4.2, 2.2, 1.4)}"><text x="${0.8 * J.S}" y="${-0.9 * J.S}" text-anchor="middle" font-size="${J.S * 0.6}" font-weight="700" fill="${s.blown ? '#b0301f' : '#1d1d1b'}">${s.blown ? '✕' : s.rating}</text></g>`;
    if (!s.blown && s.amps > +s.rating * 0.8) { const [hx, hy] = J.P(5, 1.9, 3.6); out += `<text x="${hx}" y="${hy}" font-size="16" text-anchor="middle">🔥</text>`; }
    out += A(J, p, 'f1', 'Fuse wire end 1', 0, 2, 0.4) + A(J, p, 'f2', 'Fuse wire end 2', 10, 2, 0.4);
    out += BenchParts.label(J, `FUSE ${s.rating}A · ${s.blown ? 'BLOWN' : 'OK'}`, [5, 1.2, 3.2], 20, -45, 'fuse');
    return out;
  },
});
