BenchParts.register({
  id: 'router', name: 'WiFi router (barrel jack)',
  specs: [['Power', '6–8W, ~0.5–0.65Ah per hour'], ['Plug', 'Barrel 5.5×2.1 mm'], ['Polarity symbol', '⊖–◉–⊕ = centre positive'], ['Check', 'Red on centre pin, black on sleeve: positive reading = centre +']],
  controls: [
    { key: 'on', label: 'Adapter plugged in', type: 'toggle', value: true },
    { key: 'volts', label: 'Adapter output', type: 'select', options: [['12', '12V'], ['9', '9V'], ['5', '5V']], value: '12' },
    { key: 'pol', label: 'Polarity', type: 'select', options: [['+', 'Centre +'], ['-', 'Centre −']], value: '+' },
  ],
  notes: 'Put the red probe inside the plug (centre pin) and black on the outer sleeve. A minus sign means centre negative: wiring the DC-DC that way round can kill the router.',
  nets(s) {
    if (!s.on) return {};
    const v = +s.volts;
    return { centre: { v: s.pol === '+' ? v : 0, g: 'rt', imax: 1.5 }, sleeve: { v: s.pol === '+' ? 0 : v, g: 'rt', imax: 1.5 } };
  },
  resistance: () => Infinity,
  draw(I, s, o) {
    const J = BenchParts.at(I, o.at), A = BenchParts.anchor, p = o.prefix || '';
    let out = J.box(0, 0, 0, 6, 4, 1.4, '#eceae4');
    [[1, 0.6], [5, 0.6]].forEach(([x, y]) => out += J.line([x, y, 1.4], [x, y, 4.6], 'class="ink" stroke-width="3"'));
    out += `<g transform="${J.faceY(0, 4, 0)}">` + [1, 2, 3, 4].map((u, i) => `<circle cx="${u * J.S}" cy="${-0.7 * J.S}" r="3" fill="${s.on && (i < 3 || s.volts === '12') ? '#3fae66' : '#999'}"/>`).join('') + `</g>`;
    out += `<path d="${J.path([[6, 2, 0.6], [8, 2.5, 0], [9.6, 4.5, 0]])}" fill="none" stroke="#262624" stroke-width="3.5"/>`;
    out += J.box(9.2, 4.3, 0, 1.4, 1.6, 1, '#2b2b2b');
    const [cx, cy] = J.P(9.9, 5.9, 0.5);
    out += `<circle cx="${cx}" cy="${cy}" r="6" fill="#999" stroke="#1d1d1b"/><circle cx="${cx}" cy="${cy}" r="2.2" fill="#555"/>`;
    out += A(J, p, 'centre', 'Barrel centre pin', 9.9, 5.9, 0.5, 3) + A(J, p, 'sleeve', 'Barrel outer sleeve', 10.6, 5.9, 0.15, 4);
    out += BenchParts.label(J, `ROUTER · ${s.on ? s.volts + 'V ' + (s.pol === '+' ? '⊖–◉–⊕' : '⊕–◉–⊖') : 'unplugged'}`, [3, 0, 1.4], -10, -45, 'router');
    return out;
  },
});
