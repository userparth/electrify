const Multimeter = (() => {
  const W = 180, H = 330, SOCK = { '10A': [38, 292], COM: [90, 292], VmA: [142, 292] };
  const KX = 90, KY = 205, POS = [['OFF', -120, 'OFF'], ['V', -60, 'V'], ['OHM', 0, 'Ω'], ['CONT', 60, '·))'], ['A', 120, 'A']];
  const N = 18, ROPE = 360, SEG = ROPE / (N - 1), TAIL = 90, SNAP = 26;

  const s = {
    open: false, x: 0, y: 0, knob: 'V', ac: true, red: 'VmA', hold: false, held: null,
    blown10: false, blownmA: false, drag: null, model: {}, listeners: [], lastKey: '', disp: null, dispAt: 0, flash: 0,
    probes: { red: probe('#d6452f'), black: probe('#232323') },
  };
  function probe(c) { return { c, x: 0, y: 0, tx: 0, ty: 0, ang: 0, anchor: null, el: null, rope: [], drag: null, near: null }; }

  const css = `
.mm-layer{position:absolute;left:0;top:0;width:0;height:0;z-index:60;pointer-events:none}
.mm-cables{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
.mm-body{position:absolute;width:${W}px;height:${H}px;pointer-events:auto;cursor:grab;touch-action:none;filter:drop-shadow(3px 4px 0 rgba(29,29,27,.85));user-select:none}
.mm-body.dragging{cursor:grabbing}
.mm-body .click{cursor:pointer}
.mm-knob{transition:transform .28s cubic-bezier(.3,1.5,.5,1);transform-box:view-box;transform-origin:${KX}px ${KY}px}
.mm-tip{position:absolute;width:0;height:0;pointer-events:auto;cursor:grab;touch-action:none;transform-origin:0 0}
.mm-tip svg{position:absolute;left:-15px;top:-100px;overflow:visible}
.mm-tip.dragging{cursor:grabbing}
.mm-toggle{position:fixed;right:18px;bottom:18px;z-index:70}
.mm-shake{animation:mmshake .35s linear}
@keyframes mmshake{20%{transform:translate(-4px,2px)}40%{transform:translate(4px,-2px)}60%{transform:translate(-3px,1px)}80%{transform:translate(2px,-1px)}}
.mm-spark{position:absolute;pointer-events:none;font-size:34px;transform:translate(-50%,-60%);animation:mmspark .7s ease-out forwards}
@keyframes mmspark{from{opacity:1;transform:translate(-50%,-60%) scale(.6)}to{opacity:0;transform:translate(-50%,-60%) scale(1.8)}}
body.hide-labels .mm-anchor-label{display:none}`;

  let layer, cables, body, tipEls = {}, toggleBtn, audio;

  function meterSVG() {
    const lbl = POS.map(([k, a, t]) => {
      const r = 58, x = KX + r * Math.sin(a * Math.PI / 180), y = KY - r * Math.cos(a * Math.PI / 180);
      return `<text class="click" data-knob="${k}" x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="#f2efe7">${t}</text>`;
    }).join('');
    const ridges = Array.from({ length: 12 }, (_, i) => `<line x1="${KX}" y1="${KY - 40}" x2="${KX}" y2="${KY - 34}" stroke="#555" stroke-width="2" transform="rotate(${i * 30} ${KX} ${KY})"/>`).join('');
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-monospace,Menlo,monospace">
<rect x="3" y="3" width="174" height="324" rx="24" fill="#f2c230" stroke="#1d1d1b" stroke-width="2.5"/>
<rect x="16" y="16" width="148" height="298" rx="14" fill="#2b2d31" stroke="#1d1d1b" stroke-width="1.5"/>
<rect x="26" y="26" width="128" height="74" rx="6" fill="#c7d6b3" stroke="#1d1d1b" stroke-width="1.5" class="mm-lcd"/>
<text class="mm-acdc" x="32" y="41" font-size="10" font-weight="700" fill="#1d2a18"></text>
<text x="70" y="41" font-size="8" fill="#1d2a18">AUTO</text>
<text class="mm-holdi" x="104" y="41" font-size="10" font-weight="700" fill="#1d2a18"></text>
<text class="mm-beep" x="122" y="41" font-size="10" font-weight="700" fill="#1d2a18"></text>
<text class="mm-val" x="146" y="80" text-anchor="end" font-size="31" font-weight="700" fill="#1d2a18" letter-spacing="1"></text>
<text class="mm-unit" x="146" y="95" text-anchor="end" font-size="11" font-weight="700" fill="#1d2a18"></text>
<text class="mm-msg" x="32" y="95" font-size="8" font-weight="700" fill="#b0301f"></text>
<text x="90" y="113" text-anchor="middle" font-size="9" fill="#9a9a9a" letter-spacing="1">TH-M100 · 6000</text>
<g class="click mm-func"><rect x="28" y="120" width="54" height="18" rx="9" fill="#4a4d55" stroke="#1d1d1b"/><text x="55" y="133" text-anchor="middle" font-size="9" font-weight="700" fill="#f2efe7">FUNC</text></g>
<g class="click mm-hold"><rect x="98" y="120" width="54" height="18" rx="9" fill="#4a4d55" stroke="#1d1d1b"/><text x="125" y="133" text-anchor="middle" font-size="9" font-weight="700" fill="#f2efe7">HOLD</text></g>
<circle cx="${KX}" cy="${KY}" r="48" fill="#3a3d43" stroke="#1d1d1b" stroke-width="1.5"/>
${lbl}
<g class="mm-knob click"><circle cx="${KX}" cy="${KY}" r="40" fill="#1b1c1f" stroke="#000" stroke-width="1.5"/>${ridges}<rect x="${KX - 5}" y="${KY - 38}" width="10" height="38" rx="4" fill="#33363c"/><rect x="${KX - 3}" y="${KY - 36}" width="6" height="12" rx="2" fill="#f2efe7"/></g>
<g class="click mm-fuse"><text class="mm-fuset" x="${SOCK['10A'][0]}" y="268" text-anchor="middle" font-size="8" fill="#9a9a9a"></text></g>
${Object.entries(SOCK).map(([k, [x, y]]) => `<g class="click" data-sock="${k}"><circle cx="${x}" cy="${y}" r="12" fill="#111" stroke="${k === 'COM' ? '#777' : '#d6452f'}" stroke-width="3"/><circle cx="${x}" cy="${y}" r="4" fill="#444"/><text x="${x}" y="${y + 24}" text-anchor="middle" font-size="9" font-weight="700" fill="#ddd">${k === 'VmA' ? 'VΩmA' : k}</text></g>`).join('')}
<g class="mm-plug" data-p="black"><rect x="-8" y="-12" width="16" height="22" rx="4" fill="#232323" stroke="#000"/></g>
<g class="mm-plug" data-p="red"><rect x="-8" y="-12" width="16" height="22" rx="4" fill="#d6452f" stroke="#000"/></g>
</svg>`;
  }

  const probeSVG = c => `<svg width="30" height="110"><line x1="15" y1="100" x2="15" y2="82" stroke="#c9c9c9" stroke-width="2.6" stroke-linecap="round"/><rect x="8" y="78" width="14" height="5" rx="2" fill="${c}" stroke="#1d1d1b"/><rect x="10" y="26" width="10" height="54" rx="4" fill="${c}" stroke="#1d1d1b" stroke-width="1.5"/><line x1="12" y1="40" x2="18" y2="40" stroke="#00000055"/><line x1="12" y1="46" x2="18" y2="46" stroke="#00000055"/><line x1="12" y1="52" x2="18" y2="52" stroke="#00000055"/><rect x="12" y="8" width="6" height="20" rx="2" fill="${c}" stroke="#1d1d1b"/></svg>`;

  function init() {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    layer = document.createElement('div'); layer.className = 'mm-layer'; layer.style.display = 'none';
    layer.innerHTML = `<svg class="mm-cables" width="1" height="1"><g class="mm-anchors"></g><g class="mm-ropes"></g></svg>`;
    cables = layer.querySelector('.mm-cables');
    body = document.createElement('div'); body.className = 'mm-body'; body.innerHTML = meterSVG();
    layer.appendChild(body);
    for (const k of ['black', 'red']) {
      const t = document.createElement('div'); t.className = 'mm-tip'; t.innerHTML = probeSVG(s.probes[k].c); t.dataset.p = k;
      layer.appendChild(t); tipEls[k] = t;
    }
    document.body.appendChild(layer);
    toggleBtn = document.createElement('button'); toggleBtn.className = 'btn mm-toggle'; toggleBtn.textContent = '🔧 Multimeter';
    toggleBtn.onclick = () => toggle(); document.body.appendChild(toggleBtn);
    document.addEventListener('keydown', e => { if (e.key === 'm' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) toggle(); });
    bind();
    requestAnimationFrame(frame);
  }

  function bind() {
    body.addEventListener('pointerdown', e => {
      const k = e.target.closest('[data-knob]'), sock = e.target.closest('[data-sock]');
      if (k) return setKnob(k.dataset.knob);
      if (e.target.closest('.mm-knob')) { const i = POS.findIndex(p => p[0] === s.knob); return setKnob(POS[(i + 1) % POS.length][0]); }
      if (sock) { if (sock.dataset.sock !== 'COM') { s.red = sock.dataset.sock; emit({ type: 'socket', socket: s.red }); } return; }
      if (e.target.closest('.mm-func')) { s.ac = !s.ac; return; }
      if (e.target.closest('.mm-hold')) { s.hold = !s.hold; s.held = s.hold ? s.disp : null; return; }
      if (e.target.closest('.mm-fuse')) { if (s.blown10 || s.blownmA) { s.blown10 = s.blownmA = false; emit({ type: 'fuse-replaced' }); } return; }
      s.drag = { dx: e.pageX - s.x, dy: e.pageY - s.y, id: e.pointerId };
      body.setPointerCapture(e.pointerId); body.classList.add('dragging');
    });
    body.addEventListener('pointermove', e => { if (s.drag) { s.x = e.pageX - s.drag.dx; s.y = e.pageY - s.drag.dy; } });
    const endBody = () => { s.drag = null; body.classList.remove('dragging'); };
    body.addEventListener('pointerup', endBody); body.addEventListener('pointercancel', endBody);
    body.addEventListener('wheel', e => {
      if (!e.target.closest('.mm-knob,[data-knob]')) return;
      e.preventDefault();
      const i = POS.findIndex(p => p[0] === s.knob), j = Math.max(0, Math.min(POS.length - 1, i + Math.sign(e.deltaY)));
      setKnob(POS[j][0]);
    }, { passive: false });

    for (const k of ['red', 'black']) {
      const t = tipEls[k], p = s.probes[k];
      t.addEventListener('pointerdown', e => {
        e.preventDefault();
        p.drag = { dx: p.x - e.pageX, dy: p.y - e.pageY, px: e.pageX, py: e.pageY };
        if (p.anchor) { emit({ type: 'detach', probe: k, anchor: p.anchor.dataset.anchor }); p.anchor = null; p.el = null; }
        t.setPointerCapture(e.pointerId); t.classList.add('dragging');
      });
      t.addEventListener('pointermove', e => { if (p.drag) { p.drag.px = e.pageX; p.drag.py = e.pageY; } });
      const end = () => {
        if (!p.drag) return;
        const tx = p.drag.px + p.drag.dx, ty = p.drag.py + p.drag.dy;
        p.near = nearest(tx, ty) || p.near;
        if (!p.near) { p.x = tx; p.y = ty; }
        p.drag = null; t.classList.remove('dragging');
        if (p.near) { p.anchor = p.near; emit({ type: 'attach', probe: k, anchor: p.near.dataset.anchor, node: p.near.dataset.node }); }
        p.near = null;
      };
      t.addEventListener('pointerup', end); t.addEventListener('pointercancel', end);
    }
  }

  function setKnob(k) { if (k === s.knob) return; s.knob = k; s.ac = k === 'V'; s.hold = false; s.held = null; emit({ type: 'knob', knob: k }); }

  const center = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2 + scrollX, r.top + r.height / 2 + scrollY]; };
  const anchors = () => [...document.querySelectorAll('[data-anchor]')].filter(el => el.getClientRects().length);
  const nearest = (x, y) => { let best = null, bd = SNAP; for (const el of anchors()) { const [ax, ay] = center(el), d = Math.hypot(ax - x, ay - y); if (d < bd) { bd = d; best = el; } } return best; };
  const sockPos = k => [s.x + SOCK[k][0], s.y + SOCK[k][1] - 10];

  function resolveAnchor(p) {
    if (!p.anchor) return null;
    if (!p.anchor.isConnected || !p.anchor.getClientRects().length) {
      const id = p.anchor.dataset.anchor, again = document.querySelector(`[data-anchor="${CSS.escape(id)}"]`);
      if (again && again.getClientRects().length) p.anchor = again;
      else { p.anchor = null; return null; }
    }
    return center(p.anchor);
  }

  function frame() {
    requestAnimationFrame(frame);
    if (!s.open) return;
    for (const k of ['red', 'black']) {
      const p = s.probes[k], sp = sockPos(k === 'red' ? s.red : 'COM');
      let tx = p.x, ty = p.y;
      const ac = resolveAnchor(p);
      if (ac) { tx = ac[0] + (k === 'red' ? 3 : -3); ty = ac[1]; }
      else if (p.drag) {
        tx = p.drag.px + p.drag.dx; ty = p.drag.py + p.drag.dy;
        const best = nearest(tx, ty);
        p.near = best;
        if (best) { const [ax, ay] = center(best); tx = ax; ty = ay; }
      }
      p.x += (tx - p.x) * (p.drag || ac ? 0.5 : 0.25);
      p.y += (ty - p.y) * (p.drag || ac ? 0.5 : 0.25);
      const want = Math.max(-40, Math.min(40, -(p.x - sp[0]) / 8 + (k === 'red' ? 6 : -6)));
      p.ang += (want - p.ang) * 0.12;
      const a = p.ang * Math.PI / 180, tail = [p.x + Math.sin(a) * TAIL, p.y - Math.cos(a) * TAIL];
      stepRope(p, sp, tail);
      tipEls[k].style.transform = `translate(${p.x}px,${p.y}px) rotate(${p.ang}deg)`;
    }
    body.style.transform = `translate(${s.x}px,${s.y}px)`;
    drawRopes(); drawAnchors(); drawMeter();
  }

  function stepRope(p, a, b) {
    const r = p.rope;
    if (!r.length) for (let i = 0; i < N; i++) { const t = i / (N - 1), x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t + Math.sin(t * Math.PI) * 60; r.push({ x, y, px: x, py: y }); }
    for (let i = 1; i < N - 1; i++) {
      const q = r[i], vx = (q.x - q.px) * 0.96, vy = (q.y - q.py) * 0.96;
      q.px = q.x; q.py = q.y; q.x += vx; q.y += vy + 0.55;
    }
    for (let it = 0; it < 16; it++) {
      r[0].x = a[0]; r[0].y = a[1]; r[N - 1].x = b[0]; r[N - 1].y = b[1];
      for (let i = 0; i < N - 1; i++) {
        const u = r[i], v = r[i + 1], dx = v.x - u.x, dy = v.y - u.y, d = Math.hypot(dx, dy) || 1, f = (d - SEG) / d / 2;
        const pinU = i === 0, pinV = i + 1 === N - 1;
        if (!pinU) { u.x += dx * f * (pinV ? 2 : 1); u.y += dy * f * (pinV ? 2 : 1); }
        if (!pinV) { v.x -= dx * f * (pinU ? 2 : 1); v.y -= dy * f * (pinU ? 2 : 1); }
      }
    }
  }

  function ropePath(r) {
    let d = `M${r[0].x.toFixed(1)},${r[0].y.toFixed(1)}`;
    for (let i = 1; i < r.length - 1; i++) { const mx = (r[i].x + r[i + 1].x) / 2, my = (r[i].y + r[i + 1].y) / 2; d += ` Q${r[i].x.toFixed(1)},${r[i].y.toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`; }
    return d + ` L${r[r.length - 1].x.toFixed(1)},${r[r.length - 1].y.toFixed(1)}`;
  }

  function drawRopes() {
    cables.querySelector('.mm-ropes').innerHTML = ['black', 'red'].map(k => {
      const p = s.probes[k], d = ropePath(p.rope);
      return `<path d="${d}" fill="none" stroke="#1d1d1b" stroke-width="7" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${p.c}" stroke-width="4.5" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#ffffff40" stroke-width="1.2" stroke-linecap="round" transform="translate(-1,-1)"/>`;
    }).join('');
    for (const k of ['black', 'red']) {
      const g = body.querySelector(`.mm-plug[data-p="${k}"]`), [x, y] = SOCK[k === 'red' ? s.red : 'COM'];
      g.setAttribute('transform', `translate(${x},${y})`);
    }
  }

  function drawAnchors() {
    const dragging = s.probes.red.drag || s.probes.black.drag;
    const near = [s.probes.red.near, s.probes.black.near];
    cables.querySelector('.mm-anchors').innerHTML = anchors().map(el => {
      const [x, y] = center(el), hot = near.includes(el);
      const lbl = el.dataset.label || el.dataset.anchor;
      if (hot) return `<circle cx="${x}" cy="${y}" r="11" fill="#f3c33b55" stroke="#1d1d1b" stroke-width="2"/><g class="mm-anchor-label"><rect x="${x + 14}" y="${y - 22}" width="${lbl.length * 6.6 + 12}" height="18" rx="9" fill="#1d1d1b"/><text x="${x + 20}" y="${y - 9}" font-size="10" font-weight="700" fill="#f2efe7" font-family="ui-monospace,Menlo,monospace">${lbl}</text></g>`;
      return dragging ? `<circle cx="${x}" cy="${y}" r="6" fill="#ffffffaa" stroke="#1d1d1b" stroke-width="1.2" stroke-dasharray="2 2"/>` : `<circle cx="${x}" cy="${y}" r="2.6" fill="#1d1d1b88"/>`;
    }).join('');
  }

  const fmt = v => { const a = Math.abs(v); if (a >= 6000) return 'OL'; const d = a < 6 ? 3 : a < 60 ? 2 : a < 600 ? 1 : 0; return (v < 0 ? '-' : '') + a.toFixed(d); };
  function fmtOhm(r) {
    if (!isFinite(r)) return ['OL', 'MΩ'];
    if (r < 6000) return [fmt(r), 'Ω'];
    if (r < 6e6) return [fmt(r / 1e3), 'kΩ'];
    return [fmt(r / 1e6), 'MΩ'];
  }
  const jitter = (v, k = 0.0004) => v + v * (Math.random() - 0.5) * k;

  function nets() { try { return (s.model.nets && s.model.nets()) || {}; } catch (e) { console.error('Multimeter model.nets() failed:', e); return {}; } }
  function measure() {
    const ra = s.probes.red.anchor, ba = s.probes.black.anchor;
    const n = nets(), A = ra && n[ra.dataset.node], B = ba && n[ba.dataset.node];
    const same = A && B && A.g === B.g;
    const dv = same ? (A.v || 0) - (B.v || 0) : null;
    const vac = same ? Math.abs((A.vac || 0) - (B.vac || 0)) : 0;
    const imax = same ? Math.min(A.imax ?? Infinity, B.imax ?? Infinity) : 0;
    let ohm = Infinity;
    if (ra && ba) {
      if (ra.dataset.node === ba.dataset.node) ohm = 0.1;
      else if (s.model.resistance) { const r = s.model.resistance(ra.dataset.node, ba.dataset.node); if (r != null) ohm = r; }
    }
    return { ra, ba, both: !!(ra && ba), dv, vac, imax, ohm, live: (dv != null && Math.abs(dv) > 0.2) || vac > 1 };
  }

  function compute() {
    if (s.knob === 'OFF') return { val: '', unit: '', acdc: '', msg: '' };
    const m = measure(), acdc = (s.knob === 'V' || s.knob === 'A') ? (s.ac ? 'AC' : 'DC') : '';
    const out = { acdc, msg: '', m };
    const cur = m.both && s.model.current ? s.model.current(m.ra.dataset.node, m.ba.dataset.node) : null;
    const shortI = cur != null ? Math.abs(cur) : m.dv != null || m.vac > 0 ? Math.min(m.imax, (Math.abs(m.dv || 0) + m.vac * 1.41) / 0.04) : 0;

    if (m.both && s.red === '10A' && s.knob !== 'A' && shortI > 0.5) {
      if (shortI > 10) return short(out, m, shortI);
      out.msg = 'red in 10A!';
    }
    if (s.knob === 'V') {
      if (s.red === '10A') return { ...out, val: m.both && shortI > 0 ? '0.000' : fmt(Math.random() * 0.002), unit: 'V' };
      if (!m.both || (m.dv == null && !m.vac)) return { ...out, val: fmt(Math.random() * 0.03), unit: 'V', float: true };
      const v = s.ac ? (m.vac ? jitter(m.vac) : Math.abs(m.dv) * 0.002 + Math.random() * 0.01) : (m.vac && !m.dv ? Math.random() * 0.02 : jitter(m.dv));
      return { ...out, val: fmt(v), unit: 'V', value: v };
    }
    if (s.knob === 'OHM' || s.knob === 'CONT') {
      if (!m.both) return { ...out, val: 'OL', unit: s.knob === 'CONT' ? 'Ω' : 'MΩ' };
      if (m.live) { event('ohm-live', m); return { ...out, val: 'Err', unit: '', msg: 'live circuit!' }; }
      const [v, u] = fmtOhm(isFinite(m.ohm) ? jitter(m.ohm, 0.004) : m.ohm);
      out.beep = s.knob === 'CONT' && m.ohm < 30;
      return { ...out, val: v, unit: s.knob === 'CONT' && v === 'OL' ? 'Ω' : u, value: m.ohm };
    }
    if (s.knob === 'A') {
      if (s.red === 'VmA') {
        if (s.blownmA) return { ...out, val: '0.000', unit: 'A', msg: 'mA fuse blown' };
        if (m.both && shortI > 0.4) { s.blownmA = true; event('fuse-mA', m, shortI); return { ...out, val: '0.000', unit: 'A', msg: 'mA fuse blown' }; }
        return { ...out, val: '0.000', unit: 'A', msg: 'red → 10A socket' };
      }
      if (s.blown10) return { ...out, val: '0.000', unit: 'A', msg: '10A fuse blown' };
      if (!m.both) return { ...out, val: '0.000', unit: 'A' };
      if (shortI > 10) return short(out, m, shortI);
      const i = cur != null ? cur : (m.dv || 0) < 0 ? -shortI : shortI, v = s.ac ? Math.abs(i) * 0.01 : jitter(i, 0.002);
      return { ...out, val: fmt(v), unit: 'A', value: v };
    }
    return out;
  }

  function short(out, m, amps) {
    if (!s.blown10) { s.blown10 = true; event('short', m, amps); spark(); }
    return { ...out, val: 'SHrt', unit: '', msg: '10A fuse blown' };
  }

  function spark() {
    s.flash = performance.now();
    body.classList.remove('mm-shake'); void body.offsetWidth; body.classList.add('mm-shake');
    for (const k of ['red', 'black']) {
      const p = s.probes[k], el = document.createElement('div');
      el.className = 'mm-spark'; el.textContent = '💥'; el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
      layer.appendChild(el); setTimeout(() => el.remove(), 700);
    }
  }

  function beep() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = 2700; g.gain.value = 0.04; o.connect(g); g.connect(audio.destination);
      o.start(); o.stop(audio.currentTime + 0.12);
    } catch (e) { }
  }

  function drawMeter() {
    const now = performance.now();
    if (!s.disp || now - s.dispAt > 220) { s.disp = compute(); s.dispAt = now; maybeEmit(s.disp); }
    const d = s.hold && s.held ? s.held : s.disp;
    const q = c => body.querySelector(c);
    q('.mm-knob').style.transform = `rotate(${POS.find(p => p[0] === s.knob)[1]}deg)`;
    q('.mm-val').textContent = d.val; q('.mm-unit').textContent = d.unit; q('.mm-acdc').textContent = d.acdc;
    q('.mm-msg').textContent = d.msg || ''; q('.mm-holdi').textContent = s.hold ? 'H' : '';
    q('.mm-beep').textContent = d.beep ? '·))' : '';
    q('.mm-lcd').setAttribute('fill', s.knob === 'OFF' ? '#9aa58c' : now - s.flash < 500 ? '#ffb0a0' : '#c7d6b3');
    q('.mm-fuset').textContent = s.blown10 || s.blownmA ? '✕ replace fuse' : '';
    q('.mm-fuset').setAttribute('fill', s.blown10 || s.blownmA ? '#ff8a7a' : '#9a9a9a');
    if (d.beep && !s.beeping) beep();
    s.beeping = !!d.beep;
  }

  function maybeEmit(d) {
    const m = d.m;
    if (!m || !m.both || d.float || d.value == null) { s.lastKey = ''; return; }
    const key = [s.knob, s.ac, s.red, m.ra.dataset.anchor, m.ba.dataset.anchor].join('|');
    const moved = !isFinite(d.value) ? s.lastVal !== d.value : !isFinite(s.lastVal) || Math.abs(d.value - s.lastVal) > Math.max(0.02 * Math.abs(s.lastVal), 0.05);
    if (key === s.lastKey && !moved) return;
    s.lastKey = key; s.lastVal = d.value;
    emit({ type: 'reading', knob: s.knob, ac: s.ac, socket: s.red, value: d.value, text: `${d.val} ${d.unit}`.trim(),
      red: m.ra.dataset.anchor, black: m.ba.dataset.anchor, redNode: m.ra.dataset.node, blackNode: m.ba.dataset.node });
  }
  function event(type, m, amps) {
    emit({ type, amps, red: m.ra && m.ra.dataset.anchor, black: m.ba && m.ba.dataset.anchor, redNode: m.ra && m.ra.dataset.node, blackNode: m.ba && m.ba.dataset.node });
    if (s.model.onEvent) s.model.onEvent({ type, amps, redNode: m.ra && m.ra.dataset.node, blackNode: m.ba && m.ba.dataset.node });
  }
  function emit(e) { s.listeners.forEach(f => { try { f(e); } catch (err) { console.error(err); } }); }

  function open(at) {
    if (s.open) return;
    s.open = true; layer.style.display = ''; toggleBtn.classList.add('on');
    if (!s.placed || at) {
      s.placed = true;
      s.x = Math.min(at ? at[0] : scrollX + innerWidth - W - 60, scrollX + innerWidth - W - 70); s.y = at ? at[1] : scrollY + 90;
      s.probes.red.x = Math.min(s.x + W + 30, scrollX + innerWidth - 30); s.probes.red.y = s.y + H + 40;
      s.probes.black.x = s.x - 30; s.probes.black.y = s.y + H + 40;
      s.probes.red.rope = []; s.probes.black.rope = [];
    }
    emit({ type: 'open' });
  }
  function close() { s.open = false; layer.style.display = 'none'; toggleBtn.classList.remove('on'); emit({ type: 'close' }); }
  const toggle = () => s.open ? close() : open();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  return {
    setModel(m) { s.model = m || {}; },
    on(f) { s.listeners.push(f); },
    open, close, toggle,
    state: () => ({ open: s.open, knob: s.knob, ac: s.ac, socket: s.red, blown10: s.blown10, blownmA: s.blownmA, red: s.probes.red.anchor && s.probes.red.anchor.dataset.anchor, black: s.probes.black.anchor && s.probes.black.anchor.dataset.anchor, reading: s.disp && s.disp.val }),
    attach(probeKey, anchorId) {
      const el = document.querySelector(`[data-anchor="${CSS.escape(anchorId)}"]`), p = s.probes[probeKey];
      if (!el || !p) return false;
      if (!s.open) open();
      p.anchor = el; emit({ type: 'attach', probe: probeKey, anchor: anchorId, node: el.dataset.node });
      return true;
    },
    set(o) { if (o.knob) setKnob(o.knob); if (o.ac != null) s.ac = o.ac; if (o.socket) s.red = o.socket; },
  };
})();
