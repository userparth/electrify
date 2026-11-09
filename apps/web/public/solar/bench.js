const BENCH_FIGS = [
  { grp: 'Start here' },
  { n: '01', t: 'Full setup', s: 'panel → controller → battery → load', href: 'index.html' },
  { grp: 'Week 1 · Know the parts' },
  { n: '02', t: 'Solar panel', s: 'sun, tilt, shade, Voc/Isc', href: 'fig-02-panel.html' },
  { n: '03', t: 'Charge controller', s: 'PWM, LVD, 12/24V detect', href: 'fig-03-controller.html' },
  { n: '04', t: 'Battery', s: 'voltage to %, cycle life', href: 'fig-04-battery.html' },
  { grp: 'Week 2 · Measure + wiring' },
  { n: '05', t: 'Multimeter', s: 'V, A and the 10A socket trap', href: 'fig-05-multimeter.html' },
  { n: '06', t: 'Wire + fuse', s: 'sq mm, ring lug, 10A fuse', href: 'fig-06-wiring.html' },
  { n: '07', t: 'DC-DC + router', s: 'buck-boost, barrel polarity', href: 'fig-07-dcdc-router.html' },
  { grp: 'Week 3 · Monitoring' },
  { n: '08', t: 'ESP32 + INA226', s: 'shunt, I2C, your own app', href: 'fig-08-monitor.html' },
  { grp: 'Feb 2027 · Upgrade' },
  { n: '09', t: 'Second panel', s: 'parallel vs series', href: 'fig-09-second-panel.html' },
  { n: '10', t: 'Inverter', s: '300W sine, 30–40A fuse', href: 'fig-10-inverter.html' },
  { grp: 'Tools' },
  { n: 'board', tool: '🛠 Build board', s: 'place parts, wire, run', href: 'board.html' },
  { n: 'mm', tool: '🔧 Multimeter lab', s: 'drag probes, read anything', href: 'multimeter.html' },
  { n: 'parts', tool: '🧩 Component gallery', s: 'every part on its own', href: 'components.html' },
];

const BENCH_VIEW = [['labels', 'Labels', 'hide-labels'], ['off', 'Disconnected wires', 'hide-off']];

(function renderSidebar() {
  const side = document.getElementById('side'), cur = side.dataset.cur;
  side.innerHTML = '<a class="fig" href="../" style="margin-bottom:10px"><b>← Electronics Bench</b><small>home · workbench</small></a><h1>Solar module</h1><p>A hand-inked solar setup you wire, run and break on screen first. Then on real hardware.</p>'
    + BENCH_FIGS.map(f => f.grp ? `<div class="grp">${f.grp}</div>`
      : `<a class="fig${f.n === cur ? ' on' : ''}${f.href ? '' : ' soon'}"${f.href ? ` href="${f.href}"` : ''}><b>${f.tool || `Fig. ${f.n} ${f.t}`}</b><small>${f.s}</small></a>`).join('')
    + '<div class="grp">View</div>'
    + BENCH_VIEW.map(([k, t]) => `<label class="viewopt"><input type="checkbox" data-view="${k}"> ${t}</label>`).join('');
  const apply = () => BENCH_VIEW.forEach(([k, , cls]) => document.body.classList.toggle(cls, localStorage.getItem('bench.view.' + k) === 'off'));
  side.querySelectorAll('[data-view]').forEach(cb => {
    cb.checked = localStorage.getItem('bench.view.' + cb.dataset.view) !== 'off';
    cb.onchange = () => { localStorage.setItem('bench.view.' + cb.dataset.view, cb.checked ? 'on' : 'off'); apply(); };
  });
  apply();
})();
