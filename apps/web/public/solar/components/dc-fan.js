BenchParts.register({
  id: 'fan', name: '12V DC fan',
  specs: [['Power', '~10W at 12V'], ['Current', '~0.85A, ~0.85Ah per hour'], ['Where', 'Only on the controller 💡 LOAD terminals'], ['Coil resistance', '~14Ω when off (typical for a brushed 10W fan)']],
  controls: [
    { key: 'on', label: 'Powered', type: 'toggle', value: true },
    { key: 'volts', label: 'Supply', type: 'range', min: 10, max: 14.4, step: 0.1, value: 12.4, unit: 'V' },
  ],
  notes: 'A 230V AC table fan will not run on this 12V setup. Measure resistance only with the fan unplugged: on a live fan the Ω range reads garbage.',
  nets(s) { return s.on ? { 'fan+': { v: s.volts, g: 'fan', imax: 10 }, 'fan-': { v: 0, g: 'fan', imax: 10 } } : {}; },
  resistance(s, a, b) { return !s.on && new Set([a, b]).size === 2 && [a, b].every(n => n === 'fan+' || n === 'fan-') ? 14.4 : Infinity; },
  draw(I, s, o) {
    const J = BenchParts.at(I, o.at), A = BenchParts.anchor, p = o.prefix || '';
    let out = J.box(1, 2, 0, 4, 4, 0.7, '#d8d2c4');
    out += J.line([3, 4, 0.7], [3, 4, 4.2], 'class="ink" stroke-width="4"');
    const spin = s.on ? `<animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="${(0.6 * 12 / s.volts).toFixed(2)}s" repeatCount="indefinite"/>` : '';
    out += `<g transform="${J.faceY(3, 4, 6.4)}"><circle r="${2.2 * J.S}" fill="#efe9dc" class="ink"/><g>${[0, 120, 240].map(r => `<ellipse rx="${J.S}" ry="${0.4 * J.S}" cx="${J.S}" fill="#7cc6a4" class="ink" transform="rotate(${r})"/>`).join('')}${spin}</g><circle r="5" fill="#555" class="ink"/>`;
    for (let i = -3; i <= 3; i++) { const h = Math.sqrt(Math.max(0, 4.6 - (i * .6) ** 2)) * J.S; out += `<line x1="${i * 0.6 * J.S}" y1="${-h}" x2="${i * 0.6 * J.S}" y2="${h}" stroke="#555" stroke-width=".6"/>`; }
    out += `</g>`;
    out += `<path d="${J.path([[5, 3.5, 0.3], [8, 3.5, 0]])}" fill="none" stroke="#d6452f" stroke-width="3"/><path d="${J.path([[5, 4.5, 0.3], [8, 4.5, 0]])}" fill="none" stroke="#262624" stroke-width="3"/>`;
    out += A(J, p, 'fan+', 'Fan +', 8.2, 3.5, 0) + A(J, p, 'fan-', 'Fan −', 8.2, 4.5, 0);
    out += BenchParts.label(J, `12V DC FAN · ${s.on ? (s.volts / 14.4).toFixed(2) + 'A' : 'OFF'}`, [3, 4, 8.6], 40, -20, 'fan');
    return out;
  },
});
