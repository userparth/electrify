BenchParts.register({
  id: 'phone', name: 'Phone on USB',
  specs: [['Port', 'Controller USB, 5V'], ['Phone full charge', '~1.5Ah from the 12V battery'], ['Power bank 10k / 20k mAh', '~4Ah / ~8Ah'], ['Habit', 'Charge in daytime, while the panel is also charging']],
  controls: [
    { key: 'on', label: 'USB powered', type: 'toggle', value: true },
    { key: 'draw', label: 'Phone draw', type: 'range', min: 0, max: 2.1, step: 0.1, value: 1.2, unit: 'A' },
  ],
  notes: 'USB VBUS sags a little under load. 5V × 1.2A ≈ 6W on the phone side becomes ~0.6A from the 12V battery after the controller USB converter.',
  vbus(s) { return s.on ? 5.15 - 0.12 * s.draw : 0; },
  nets(s) { return s.on ? { vbus: { v: this.vbus(s), g: 'usb', imax: 2.4 }, gnd: { v: 0, g: 'usb', imax: 2.4 } } : {}; },
  resistance: () => Infinity,
  draw(I, s, o) {
    const J = BenchParts.at(I, o.at), A = BenchParts.anchor, p = o.prefix || '', chg = s.on && s.draw > 0;
    let out = J.box(0, 0, 0, 3, 5.6, 0.4, '#1f1f22');
    out += J.poly([J.P(0.25, 0.3, 0.41), J.P(2.75, 0.3, 0.41), J.P(2.75, 5.3, 0.41), J.P(0.25, 5.3, 0.41)], chg ? '#5a7fd6' : '#3a3f4a');
    if (chg) { const [bx, by] = J.P(1.5, 2.8, 0.4); out += `<text x="${bx}" y="${by + 6}" text-anchor="middle" font-size="18" fill="#f3c33b">⚡</text>`; }
    out += `<path d="${J.path([[3, 4.5, 0.2], [5, 5, 0], [7, 5, 0]])}" fill="none" stroke="#555" stroke-width="4"/>`;
    out += J.box(7, 4.3, 0, 2.2, 1.4, 0.7, '#cfd3d6');
    out += A(J, p, 'vbus', 'USB VBUS (5V)', 9.2, 4.6, 0.35, 4) + A(J, p, 'gnd', 'USB GND', 9.2, 5.4, 0.35, 4);
    out += BenchParts.label(J, `PHONE · ${chg ? (s.draw * this.vbus(s)).toFixed(1) + 'W' : 'idle'}`, [1.5, 0, 0.4], -30, -40, 'phone');
    return out;
  },
});
