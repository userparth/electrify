BenchParts.register({
  id: 'ina226', name: 'INA226 current sensor',
  specs: [['Measures', 'Bus voltage + shunt voltage over I2C (address 0x40 default)'], ['Shunt range', '±81.92 mV full scale'], ['Shunt', 'R002 = 0.002Ω → ~40A full scale (typical module); R100 = 0.1Ω → only ~0.8A'], ['Wiring', 'High side: battery + → fuse → IN+ → IN− → controller BAT+'], ['VCC', '3.3V from the ESP32']],
  controls: [
    { key: 'amps', label: 'Current (+ charge)', type: 'range', min: -8, max: 10, step: 0.1, value: 2.5, unit: 'A' },
    { key: 'shunt', label: 'Shunt', type: 'select', options: [['0.002', 'R002 (0.002Ω)'], ['0.01', 'R010 (0.01Ω)'], ['0.1', 'R100 (0.1Ω)']], value: '0.002' },
    { key: 'bus', label: 'Bus voltage', type: 'range', min: 11, max: 14.4, step: 0.05, value: 12.6, unit: 'V' },
  ],
  notes: 'Put the meter across IN+ and IN−: you read the tiny shunt drop (mV), and current = drop ÷ shunt ohms. That is all the INA226 does, digitally. Past ±81.92 mV it clips.',
  calc(s) { const r = +s.shunt, mv = s.amps * r * 1000, clip = Math.abs(mv) > 81.92; return { r, mv, clip, read: (clip ? Math.sign(mv) * 81.92 : mv) / 1000 / r }; },
  nets(s) {
    const { r } = this.calc(s);
    return { 'in+': { v: s.bus, g: 'bus', imax: 30 }, 'in-': { v: s.bus - s.amps * r, g: 'bus', imax: 30 }, vcc: { v: 3.3, g: 'bus', imax: 0.1 }, gnd: { v: 0, g: 'bus', imax: 0.1 }, sda: { v: 3.3, g: 'bus', imax: 0.001 }, scl: { v: 3.3, g: 'bus', imax: 0.001 } };
  },
  resistance: () => Infinity,
  draw(I, s, o) {
    const J = BenchParts.at(I, o.at), A = BenchParts.anchor, p = o.prefix || '', c = this.calc(s);
    let out = J.box(0, 0, 0, 6, 4, 0.3, '#6b3fa0');
    out += J.box(1.5, 1.2, 0.3, 1.2, 0.8, 0.3, '#222') + J.box(3.5, 1.4, 0.3, 1.6, 0.8, 0.25, c.clip ? '#d6452f' : '#cfd3d6');
    out += J.box(0.2, 0.2, 0.3, 1, 3.6, 0.9, '#2a7fc0');
    out += `<path d="${J.path([[-3, 1, 0.2], [0.2, 1, 0.8]])}" fill="none" stroke="#d6452f" stroke-width="4"/><path d="${J.path([[-3, 3, 0.2], [0.2, 3, 0.8]])}" fill="none" stroke="#d6452f" stroke-width="4"/>`;
    out += A(J, p, 'in+', 'INA226 IN+', 0.7, 1, 1.2, 4) + A(J, p, 'in-', 'INA226 IN−', 0.7, 3, 1.2, 4);
    const pin = (net, label, x) => A(J, p, net, label, x, 4, 0.3, 3.5);
    out += pin('vcc', 'INA226 VCC', 1.5) + pin('gnd', 'INA226 GND', 2.5) + pin('scl', 'INA226 SCL', 3.5) + pin('sda', 'INA226 SDA', 4.5);
    out += BenchParts.label(J, `INA226 · ${c.mv.toFixed(2)} mV → ${c.read.toFixed(2)}A${c.clip ? ' CLIPPED' : ''}`, [3, 0, 0.6], 20, -45, 'ina226');
    return out;
  },
});
