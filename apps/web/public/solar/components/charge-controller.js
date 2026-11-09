BenchParts.register({
  id: 'controller', name: 'Charge controller 10A PWM',
  specs: [['Model', 'MagiDeal 10A PWM, 12/24V auto, LCD, 2× USB'], ['Battery type', 'Set SLD (sealed)'], ['LVD / reconnect', '11.8–12.0V / ~12.6V'], ['LOAD switching', 'Negative side (LOAD+ is tied to BAT+, typical for cheap PWM)'], ['Self draw', '~10–20 mA'], ['Open item', 'Max PV input: 50V safe, 25V risky']],
  controls: [
    { key: 'batt', label: 'Battery voltage', type: 'range', min: 10.5, max: 14.4, step: 0.05, value: 12.6, unit: 'V' },
    { key: 'pv', label: 'Panel in sun', type: 'toggle', value: true },
    { key: 'load', label: 'LOAD switch', type: 'toggle', value: true },
    { key: 'lvd', label: 'LVD', type: 'range', min: 10.5, max: 12.4, step: 0.1, value: 12, unit: 'V' },
    { key: 'lvdOff', label: 'LVD off (drain to 0%)', type: 'toggle', value: true },
  ],
  notes: 'Measure LOAD+ to LOAD− and LOAD+ to BAT−: when the LVD cuts, only LOAD− floats. LOAD+ always stays at battery voltage. That is why the DC-DC IN− must go on LOAD−, never battery −.',
  state(s) {
    const cut = s.lvdOff === false && s.batt < s.lvd;
    return { cut, loadOn: s.load && !cut, charging: s.pv && s.batt < 14.4 };
  },
  nets(s) {
    const { loadOn, charging } = this.state(s), n = {
      'bat+': { v: s.batt, g: 'sys', imax: 300 }, 'bat-': { v: 0, g: 'sys', imax: 300 },
      'load+': { v: s.batt, g: 'sys', imax: 10 }, 'usb+': { v: 5.1, g: 'sys', imax: 2 }, 'usb-': { v: 0, g: 'sys', imax: 2 },
    };
    if (loadOn) n['load-'] = { v: 0, g: 'sys', imax: 10 };
    if (s.pv) { n['pv+'] = { v: charging ? s.batt + 0.25 : 21.5, g: 'sys', imax: 2.8 }; n['pv-'] = { v: 0, g: 'sys', imax: 2.8 }; }
    return n;
  },
  resistance: () => Infinity,
  draw(I, s, o) {
    const J = BenchParts.at(I, o.at), A = BenchParts.anchor, p = o.prefix || '', st = this.state(s);
    let out = J.box(0, 0, 0, 9, 2.2, 7, '#3a4256');
    out += `<g transform="${J.faceY(0, 2.2, 0)}">`;
    out += `<rect x="${1.4 * J.S}" y="${-6.4 * J.S}" width="${6.2 * J.S}" height="${2.8 * J.S}" rx="3" fill="${st.cut ? '#f0a596' : '#b9dca0'}" class="ink"/>`;
    out += `<text x="${4.5 * J.S}" y="${-4.8 * J.S}" text-anchor="middle" font-size="${J.S}" font-weight="700" fill="#1d2a18">${s.batt.toFixed(1)}V</text>`;
    out += `<text x="${4.5 * J.S}" y="${-3.9 * J.S}" text-anchor="middle" font-size="${J.S * 0.5}" font-weight="700" fill="#1d2a18">${st.charging ? '☀→▮ ' : ''}${st.cut ? 'LVD CUT' : st.loadOn ? 'LOAD ON' : 'LOAD OFF'}</text>`;
    [['☀', 1.5], ['▮', 4.5], ['💡', 7.5]].forEach(([g, u]) => out += `<text x="${u * J.S}" y="${-2.6 * J.S}" text-anchor="middle" font-size="${J.S * 0.7}" fill="#e9e4d6">${g}</text>`);
    [1, 2, 4, 5, 7, 8].forEach((u, i) => out += `<rect x="${u * J.S - 6}" y="${-1.8 * J.S}" width="12" height="12" fill="${i % 2 ? '#222' : '#c84030'}" class="ink"/>`);
    out += `</g>`;
    out += `<g transform="${J.faceX(9, 0, 0)}"><rect x="${0.4 * J.S}" y="${-4.6 * J.S}" width="10" height="6" fill="#ddd" class="ink"/><rect x="${1.3 * J.S}" y="${-4.6 * J.S}" width="10" height="6" fill="#ddd" class="ink"/></g>`;
    const T = (net, label, u) => A(J, p, net, label, u, 2.2, 1.6);
    out += T('pv+', 'PV +', 1) + T('pv-', 'PV −', 2) + T('bat+', 'BAT +', 4) + T('bat-', 'BAT −', 5) + T('load+', 'LOAD +', 7) + T('load-', 'LOAD −', 8);
    out += A(J, p, 'usb+', 'USB 5V', 9, 0.6, 4.4, 4) + A(J, p, 'usb-', 'USB GND', 9, 1.5, 4.4, 4);
    out += BenchParts.label(J, 'CHARGE CONTROLLER 10A PWM', [4.5, 0, 7], 0, -40, 'controller');
    return out;
  },
});
