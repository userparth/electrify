BenchParts.register({
  id: 'battery', name: 'Battery 12V 26Ah',
  specs: [['Model', 'Exide Powersafe Plus EP 26-12'], ['Type', 'SMF / VRLA, ~9 kg'], ['Usable', '~13Ah (50%)'], ['Rest voltage', '12.7 / 12.4 / 12.2 / 11.9V = 100 / 75 / 50 / 25%'], ['Short-circuit current', 'hundreds of amps (typical for this size)']],
  controls: [
    { key: 'soc', label: 'Charge', type: 'range', min: 0, max: 100, step: 1, value: 95, unit: '%' },
    { key: 'load', label: 'Load current', type: 'range', min: 0, max: 10, step: 0.1, value: 0, unit: 'A' },
  ],
  notes: 'Voltage tells you charge only at rest (no load for ~1 hour). Under load it sags, so a loaded battery looks emptier than it is. Below 12.2V (50%) SMF battery life drops fast.',
  volts(s) { return BenchParts.lerpTable([[0, 11.5], [25, 11.9], [50, 12.2], [75, 12.4], [100, 12.7]], s.soc) - 0.035 * s.load; },
  nets(s) { const v = this.volts(s); return { 'b+': { v, g: 'bat', imax: 300 }, 'b-': { v: 0, g: 'bat', imax: 300 } }; },
  resistance: () => Infinity,
  draw(I, s, o) {
    const J = BenchParts.at(I, o.at), A = BenchParts.anchor, p = o.prefix || '', v = this.volts(s);
    let out = J.box(0, 0, 0, 8, 5, 6, '#2f2f33');
    out += `<g transform="${J.faceY(0, 5, 0)}"><text x="${4 * J.S}" y="${-3.8 * J.S}" text-anchor="middle" font-size="${J.S * 0.85}" font-weight="700" fill="#eee">EXIDE</text><text x="${4 * J.S}" y="${-2.7 * J.S}" text-anchor="middle" font-size="${J.S * 0.55}" fill="#ddd">EP 26-12 · 12V 26Ah</text>`
      + `<rect x="${J.S}" y="${-1.6 * J.S}" width="${6 * J.S}" height="${J.S * 0.45}" fill="none" stroke="#ddd"/><rect x="${J.S}" y="${-1.6 * J.S}" width="${6 * J.S * s.soc / 100}" height="${J.S * 0.45}" fill="${s.soc < 50 ? '#f0a596' : '#9be3b4'}"/></g>`;
    out += J.box(1, 1, 6, 1, 1, 0.5, '#d6452f') + J.box(6, 1, 6, 1, 1, 0.5, '#262624');
    const [px, py] = J.P(1.5, 2.6, 6), [nx, ny] = J.P(6.5, 2.6, 6);
    out += `<text x="${px}" y="${py + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#eee">+</text><text x="${nx}" y="${ny + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#eee">−</text>`;
    out += A(J, p, 'b+', 'Battery +', 1.5, 1.5, 6.5) + A(J, p, 'b-', 'Battery −', 6.5, 1.5, 6.5);
    out += BenchParts.label(J, `BATTERY · ${v.toFixed(2)}V · ${s.soc}%`, [0, 5, 3], -70, 60, 'battery');
    return out;
  },
});
