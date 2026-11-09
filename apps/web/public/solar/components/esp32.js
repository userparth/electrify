BenchParts.register({
  id: 'esp32', name: 'ESP32 dev board',
  specs: [['Radio', 'WiFi + Bluetooth'], ['Logic', '3.3V; GPIO pins are not 5V tolerant'], ['Power', '5V over USB (from the controller USB port)'], ['I2C', 'SDA GPIO21, SCL GPIO22 (default pins)'], ['Price', '₹350–450']],
  controls: [
    { key: 'on', label: 'USB power', type: 'toggle', value: true },
    { key: 'led', label: 'GPIO2 (blue LED)', type: 'toggle', value: true },
    { key: 'pullups', label: 'I2C pull-ups present', type: 'toggle', value: true },
  ],
  notes: 'The 3V3 pin comes from an on-board regulator. Idle I2C lines sit high (3.3V) through pull-up resistors; with no pull-ups they float and the bus does not work.',
  nets(s) {
    if (!s.on) return {};
    const n = { vin: { v: 5.0, g: 'esp', imax: 1 }, '3v3': { v: 3.3, g: 'esp', imax: 0.6 }, gnd: { v: 0, g: 'esp', imax: 1 }, gpio2: { v: s.led ? 3.3 : 0, g: 'esp', imax: 0.04 } };
    if (s.pullups) { n.sda = { v: 3.3, g: 'esp', imax: 0.001 }; n.scl = { v: 3.3, g: 'esp', imax: 0.001 }; }
    return n;
  },
  resistance: () => Infinity,
  draw(I, s, o) {
    const J = BenchParts.at(I, o.at), A = BenchParts.anchor, p = o.prefix || '';
    let out = J.box(0, 0, 0, 9, 3.2, 0.35, '#1d2b3a');
    out += J.box(2.2, 0.7, 0.35, 3.6, 1.8, 0.5, '#b8bec4') + J.box(6.4, 1, 0.35, 1, 1.2, 0.3, '#222');
    out += J.box(-0.6, 1, 0.35, 1, 1.2, 0.5, '#cfd3d6');
    const [lx, ly] = J.P(7.6, 2.6, 0.4);
    out += `<circle cx="${lx}" cy="${ly}" r="3.5" fill="${s.on && s.led ? '#4aa3ff' : '#555'}" stroke="#1d1d1b"/>`;
    const pin = (net, label, x, y) => A(J, p, net, label, x, y, 0.4, 3.5);
    out += pin('vin', 'ESP32 VIN (5V)', 1, 0.3) + pin('gnd', 'ESP32 GND', 2, 0.3) + pin('3v3', 'ESP32 3V3', 3, 0.3);
    out += pin('sda', 'GPIO21 (SDA)', 5, 2.9) + pin('scl', 'GPIO22 (SCL)', 6, 2.9) + pin('gpio2', 'GPIO2 (LED)', 7, 2.9);
    out += BenchParts.label(J, `ESP32 · ${s.on ? 'powered' : 'no power'}`, [4.5, 0, 0.8], -20, -40, 'esp32');
    return out;
  },
});
