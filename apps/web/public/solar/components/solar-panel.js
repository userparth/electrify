BenchParts.register({
  id: 'panel', name: 'Solar panel 55W',
  specs: [['Model', 'Loom 55W Mono PERC, half-cut'], ['Vmp / Imp', '21V / 2.62A'], ['Voc / Isc', '24.5V / 2.83A (STC: 1000 W/m², 25°C)'], ['Voc temp coeff', '≈ −0.28%/°C (typical PERC)'], ['Size', '405×775×30 mm']],
  controls: [
    { key: 'sun', label: 'Sun', type: 'range', min: 0, max: 100, step: 1, value: 90, unit: '%' },
    { key: 'temp', label: 'Cell temp', type: 'range', min: 0, max: 70, step: 1, value: 40, unit: '°C' },
  ],
  notes: 'Open-circuit voltage barely drops in weak light but falls as the panel heats up. Current scales with sunlight, so a panel can never push more than ~2.83A: that is why measuring Isc through the 10A socket is safe here.',
  calc(s) {
    const g = s.sun / 100;
    const voc = g > 0.005 ? 24.5 * (1 - 0.0028 * (s.temp - 25)) + 0.5 * Math.log(g) : 0.2;
    return { voc: Math.max(0.2, voc), isc: 2.83 * g };
  },
  nets(s) { const { voc, isc } = this.calc(s); return { 'pv+': { v: voc, g: 'pv', imax: isc }, 'pv-': { v: 0, g: 'pv', imax: isc } }; },
  resistance: () => Infinity,
  draw(I, s, o) {
    const J = BenchParts.at(I, o.at), A = BenchParts.anchor, p = o.prefix || '', g = s.sun / 100, { voc, isc } = this.calc(s);
    let out = '';
    [[1, 0], [8, 0]].forEach(([x, y]) => out += J.line([x, y, 0], [x, y, 5.6], 'class="ink" stroke-width="2.5"'));
    const c = [[0, 0, 6], [9, 0, 6], [9, 5, 1.5], [0, 5, 1.5]];
    out += J.poly([J.P(9, 0, 6), J.P(9, 5, 1.5), J.P(9, 5, 1.1), J.P(9, 0, 5.6)], '#a3a9ae');
    out += J.poly([J.P(0, 5, 1.5), J.P(9, 5, 1.5), J.P(9, 5, 1.1), J.P(0, 5, 1.1)], '#bfc4c8');
    out += J.poly(c.map(q => J.P(...q)), '#c9ced2');
    const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t), at = (u, w) => lerp(lerp(c[0], c[1], u), lerp(c[3], c[2], u), w);
    out += J.poly([at(.04, .07), at(.96, .07), at(.96, .93), at(.04, .93)].map(q => J.P(...q)), g > 0.05 ? '#2c4a96' : '#22345f');
    for (let i = 1; i < 6; i++) out += J.line(at(.04 + .92 * i / 6, .07), at(.04 + .92 * i / 6, .93), 'stroke="#8fb0ea" stroke-width=".8"');
    for (let j = 1; j < 3; j++) out += J.line(at(.04, .07 + .86 * j / 3), at(.96, .07 + .86 * j / 3), 'stroke="#8fb0ea" stroke-width=".8"');
    out += `<polygon points="${J.pts([at(.1, .1), at(.3, .1), at(.12, .5)].map(q => J.P(...q)))}" fill="#fff" opacity="${0.1 + 0.35 * g}"/>`;
    [[1, 1, 0], [8, 1, 0]].forEach(([x]) => out += J.line([x, 5, 0], [x, 5, 1.2], 'class="ink" stroke-width="2.5"'));
    out += `<path d="${J.path([[6, 5, 1.1], [7, 6.35, 0], [10, 6.35, 0]])}" fill="none" stroke="#d6452f" stroke-width="3"/>`;
    out += `<path d="${J.path([[6.6, 5, 1.1], [7.4, 7.35, 0], [10, 7.35, 0]])}" fill="none" stroke="#262624" stroke-width="3"/>`;
    out += J.box(10, 6, 0, 1.3, 0.7, 0.5, '#d6452f') + J.box(10, 7, 0, 1.3, 0.7, 0.5, '#262624');
    if (g > 0) { const [sx, sy] = J.P(-2, -3, 11); out += `<circle cx="${sx}" cy="${sy}" r="${10 + 8 * g}" fill="#f3c33b" class="ink" opacity="${0.3 + 0.7 * g}"/>`; }
    out += A(J, p, 'pv+', 'Panel MC4 +', 11.4, 6.35, 0.25) + A(J, p, 'pv-', 'Panel MC4 −', 11.4, 7.35, 0.25);
    out += BenchParts.label(J, `SOLAR PANEL · Voc ${voc.toFixed(1)}V · Isc ${isc.toFixed(2)}A`, [4.5, 0, 6], -20, -40, 'panel');
    return out;
  },
});
