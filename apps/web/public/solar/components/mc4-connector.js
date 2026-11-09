BenchParts.register({
  id: 'mc4', name: 'MC4 connector pair',
  specs: [['Use', 'Panel leads, 4 sq mm solar cable'], ['Mated', 'Click-lock, ~0.5 mΩ contact (typical)'], ['Bad crimp', 'Adds resistance; heats up under current'], ['Y-branch', 'For 2 panels in parallel']],
  controls: [
    { key: 'mated', label: 'Mated (clicked)', type: 'toggle', value: true },
    { key: 'crimp', label: 'Crimp', type: 'select', options: [['good', 'Good crimp'], ['bad', 'Bad crimp (pliers)']], value: 'good' },
  ],
  notes: 'Continuity from one cable end to the other should beep and read near 0Ω. A bad crimp still beeps but reads higher; at 2.8A that loss turns into heat at the joint.',
  nets: () => ({}),
  resistance(s, a, b) {
    if (!((a === 'c1' && b === 'c2') || (a === 'c2' && b === 'c1'))) return Infinity;
    return s.mated ? (s.crimp === 'good' ? 0.05 : 1.8) : Infinity;
  },
  draw(I, s, o) {
    const J = BenchParts.at(I, o.at), A = BenchParts.anchor, p = o.prefix || '', gap = s.mated ? 0 : 1.8;
    let out = `<path d="${J.path([[0, 2, 0.5], [2.4, 2, 0.5]])}" fill="none" stroke="#262624" stroke-width="5"/>`;
    out += J.box(2.4, 1.5, 0.1, 2.4, 1, 0.8, '#2b2b2b') + J.box(4.8, 1.7, 0.25, 0.8, 0.6, 0.5, '#3a3a3a');
    out += J.box(5.6 + gap, 1.45, 0.05, 2.6, 1.1, 0.9, '#2b2b2b');
    out += `<path d="${J.path([[8.2 + gap, 2, 0.5], [10.6 + gap, 2, 0.5]])}" fill="none" stroke="#262624" stroke-width="5"/>`;
    if (s.crimp === 'bad') { const [x, y] = J.P(3.2, 2, 1.2); out += `<text x="${x}" y="${y}" font-size="13" text-anchor="middle">⚠</text>`; }
    out += J.line([0, 2, 0.5], [-0.5, 2, 0.5], 'stroke="#c27c3a" stroke-width="3"') + J.line([10.6 + gap, 2, 0.5], [11.1 + gap, 2, 0.5], 'stroke="#c27c3a" stroke-width="3"');
    out += A(J, p, 'c1', 'MC4 cable end A', -0.5, 2, 0.5) + A(J, p, 'c2', 'MC4 cable end B', 11.1 + gap, 2, 0.5);
    out += BenchParts.label(J, `MC4 · ${s.mated ? 'clicked' : 'open'} · ${s.crimp} crimp`, [5.5, 1.5, 1], 0, -45, 'mc4');
    return out;
  },
});
