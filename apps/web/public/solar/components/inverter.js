BenchParts.register({
  id: 'inverter', name: 'Inverter 300W pure sine',
  specs: [['Rating', '300W continuous, pure sine'], ['Wiring', 'Directly on the battery with a 30–40A fuse and 6 sq mm wire, never on controller LOAD'], ['Idle draw', '4–7W'], ['Efficiency', '~85–90% (typical)'], ['LVD', '11.8–12V cut-off needed']],
  controls: [
    { key: 'on', label: 'Switch', type: 'toggle', value: true },
    { key: 'batt', label: 'Battery', type: 'range', min: 10.5, max: 13.5, step: 0.05, value: 12.6, unit: 'V' },
    { key: 'watts', label: 'AC load', type: 'range', min: 0, max: 400, step: 5, value: 50, unit: 'W' },
  ],
  notes: 'Battery current ≈ watts ÷ 12 ÷ 0.88. A 50W fan pulls ~4.7A from the battery, so the 10A controller LOAD terminal is the wrong place. Use V with FUNC → AC on the socket; never Ω or A on 230V.',
  state(s) {
    const lvd = s.batt < 11.8, over = s.watts > 300, run = s.on && !lvd && !over;
    return { lvd, over, run, amps: run ? (s.watts / 0.88 + 5) / s.batt : 0 };
  },
  nets(s) {
    const st = this.state(s), n = { 'dc+': { v: s.batt, g: 'bat', imax: 300 }, 'dc-': { v: 0, g: 'bat', imax: 300 } };
    if (st.run) { n.L = { v: 0, vac: 230, g: 'ac', imax: 3 }; n.N = { v: 0, vac: 0, g: 'ac', imax: 3 }; }
    return n;
  },
  resistance: () => Infinity,
  draw(I, s, o) {
    const J = BenchParts.at(I, o.at), A = BenchParts.anchor, p = o.prefix || '', st = this.state(s);
    let out = J.box(0, 0, 0, 8, 4.4, 2.6, '#cfd3d6');
    for (let i = 1; i < 8; i++) out += J.line([i, 0.3, 2.6], [i, 4.1, 2.6], 'stroke="#9aa1a7" stroke-width="1.2"');
    out += `<g transform="${J.faceY(0, 4.4, 0)}"><rect x="${0.6 * J.S}" y="${-2.1 * J.S}" width="${2.4 * J.S}" height="${1.5 * J.S}" rx="3" fill="#2b2b2b"/>`;
    out += `<circle cx="${1.3 * J.S}" cy="${-1.35 * J.S}" r="${0.22 * J.S}" fill="#111"/><circle cx="${2.3 * J.S}" cy="${-1.35 * J.S}" r="${0.22 * J.S}" fill="#111"/>`;
    out += `<circle cx="${4 * J.S}" cy="${-1.4 * J.S}" r="4" fill="${st.run ? '#3fae66' : st.lvd || st.over ? '#d6452f' : '#555'}" class="ink"/>`;
    out += `<text x="${5.8 * J.S}" y="${-1.1 * J.S}" text-anchor="middle" font-size="${J.S * 0.55}" font-weight="700">${st.run ? '230V ~' : st.over ? 'OVERLOAD' : st.lvd ? 'LOW BATT' : 'OFF'}</text></g>`;
    out += J.box(8, 0.8, 0.6, 0.6, 1, 0.8, '#d6452f') + J.box(8, 2.6, 0.6, 0.6, 1, 0.8, '#262624');
    out += A(J, p, 'dc+', 'Inverter DC +', 8.6, 1.3, 1, 4) + A(J, p, 'dc-', 'Inverter DC −', 8.6, 3.1, 1, 4);
    const [lx, ly] = J.P(0.6 + 0.7, 4.4, 1.35), [nx, ny] = J.P(0.6 + 1.7, 4.4, 1.35);
    out += `<circle data-anchor="${p}L" data-node="${p}L" data-label="AC Live (L)" cx="${lx}" cy="${ly}" r="4" fill="none" stroke="#f2efe7" stroke-width="1.2"/><circle data-anchor="${p}N" data-node="${p}N" data-label="AC Neutral (N)" cx="${nx}" cy="${ny}" r="4" fill="none" stroke="#f2efe7" stroke-width="1.2"/>`;
    out += BenchParts.label(J, `INVERTER 300W · battery ${st.amps.toFixed(1)}A`, [4, 0, 2.6], 20, -40, 'inverter');
    return out;
  },
});
