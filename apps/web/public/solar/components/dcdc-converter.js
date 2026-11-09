BenchParts.register({
  id: 'dcdc', name: 'DC-DC buck-boost',
  specs: [['Input', '8–40V'], ['Output', 'Set with the trim pot; fixed 12V for the router'], ['Current', '2–3A'], ['Alternative', 'LM2596 buck only: needs input ~1.5V above output (typical)'], ['Wiring', 'IN− on controller LOAD−, not battery −']],
  controls: [
    { key: 'vin', label: 'Input', type: 'range', min: 0, max: 40, step: 0.1, value: 12.6, unit: 'V' },
    { key: 'vset', label: 'Trim pot (output)', type: 'range', min: 3, max: 24, step: 0.1, value: 12, unit: 'V' },
    { key: 'type', label: 'Board', type: 'select', options: [['bb', 'Buck-boost'], ['buck', 'LM2596 buck']], value: 'bb' },
  ],
  notes: 'Always set the output with a meter before plugging the router in. Buck-boost holds 12V whether the battery is at 11V or 14.4V; a buck-only board drops out when the input sinks below output + ~1.5V.',
  out(s) {
    if (s.vin < (s.type === 'bb' ? 8 : 4)) return { v: 0, mode: 'OFF' };
    if (s.type === 'buck') { const v = Math.min(s.vset, s.vin - 1.5); return { v: Math.max(0, v), mode: v < s.vset ? 'DROPOUT' : 'BUCK' }; }
    return { v: s.vset, mode: s.vin > s.vset + 0.3 ? 'BUCK' : s.vin < s.vset - 0.3 ? 'BOOST' : 'PASS' };
  },
  nets(s) { const { v } = this.out(s); return { 'in+': { v: s.vin, g: 'dc', imax: 10 }, 'in-': { v: 0, g: 'dc', imax: 10 }, 'out+': { v, g: 'dc', imax: 3 }, 'out-': { v: 0, g: 'dc', imax: 3 } }; },
  resistance: () => Infinity,
  draw(I, s, o) {
    const J = BenchParts.at(I, o.at), A = BenchParts.anchor, p = o.prefix || '', r = this.out(s);
    let out = J.box(0, 0, 0, 8, 4.5, 0.4, '#2f8a55');
    out += J.box(2.5, 1, 0.4, 2, 2, 1.6, '#555d66') + J.box(5.2, 1.4, 0.4, 1, 1, 1.2, '#3a6ed6');
    const [kx, ky] = J.P(5.7, 1.9, 1.6);
    out += `<g transform="translate(${kx},${ky}) rotate(${(s.vset - 3) / 21 * 300 - 150})"><circle r="4" fill="#f0c13a" stroke="#1d1d1b"/><line x1="0" y1="0" x2="0" y2="-4" stroke="#1d1d1b" stroke-width="1.5"/></g>`;
    out += J.box(0.2, 0.4, 0.4, 1.2, 1.6, 0.9, '#2a7fc0') + J.box(6.6, 2.5, 0.4, 1.2, 1.6, 0.9, '#2a7fc0');
    out += A(J, p, 'in+', 'DC-DC IN +', 0.8, 0.8, 1.3, 4) + A(J, p, 'in-', 'DC-DC IN −', 0.8, 1.7, 1.3, 4);
    out += A(J, p, 'out+', 'DC-DC OUT +', 7.2, 2.9, 1.3, 4) + A(J, p, 'out-', 'DC-DC OUT −', 7.2, 3.8, 1.3, 4);
    out += BenchParts.label(J, `${s.type === 'bb' ? 'BUCK-BOOST' : 'LM2596'} · ${r.mode} · OUT ${r.v.toFixed(1)}V`, [4, 0, 2], 10, -45, 'dcdc');
    return out;
  },
});
