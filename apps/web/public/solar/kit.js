const $ = id => document.getElementById(id);
const RAD = Math.PI / 180;

function sh(hex, f) {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, n >> 8 & 255, n & 255];
  return '#' + c.map(v => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)).map(v => v.toString(16).padStart(2, '0')).join('');
}
const hhmm = t => `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function iso(S = 16, OX = 400, OY = 240) {
  const P = (x, y, z = 0) => [OX + (x - y) * 0.866 * S, OY + (x + y) * 0.5 * S - z * S];
  const pts = a => a.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ');
  const poly = (p, fill, extra = '') => `<polygon points="${pts(p)}" fill="${fill}" class="ink" ${extra}/>`;
  const box = (x, y, z, w, d, h, hex, extra = '') =>
    `<g ${extra}>` + poly([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], sh(hex, .22))
    + poly([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], hex)
    + poly([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], sh(hex, -.25)) + '</g>';
  const line = (a, b, extra = 'class="ink"') => { const [x1, y1] = P(...a), [x2, y2] = P(...b); return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" ${extra}/>`; };
  const path = p => 'M' + p.map(q => P(...q).map(n => n.toFixed(1)).join(',')).join(' L');
  // Local (u*S, -v*S) drawn inside these groups lands on the y=const (front-left) or x=const (front-right) face.
  const faceY = (x, y, z) => { const [a, b] = P(x, y, z); return `matrix(0.866 0.5 0 1 ${a.toFixed(1)} ${b.toFixed(1)})`; };
  const faceX = (x, y, z) => { const [a, b] = P(x, y, z); return `matrix(-0.866 0.5 0 1 ${a.toFixed(1)} ${b.toFixed(1)})`; };
  const faceZ = (x, y, z) => { const [a, b] = P(x, y, z); return `matrix(0.866 0.5 -0.866 0.5 ${a.toFixed(1)} ${b.toFixed(1)})`; };
  return { S, P, pts, poly, box, line, path, faceY, faceX, faceZ };
}

const wobbleDefs = scale => `<defs><filter id="wob" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4"/><feDisplacementMap id="wobMap" in="SourceGraphic" scale="${scale}"/></filter></defs>`;

function pill(x, y, text, part, ax, ay, sel) {
  const w = text.length * 6.4 + 16;
  return `<g class="lbl${sel === part ? ' sel' : ''}" data-part="${part}">${ax != null ? `<line x1="${ax}" y1="${ay}" x2="${x}" y2="${y}" stroke="#1d1d1b"/><circle cx="${ax}" cy="${ay}" r="2.5" fill="#1d1d1b"/>` : ''}<rect x="${x - w / 2}" y="${y - 10}" width="${w}" height="20" rx="10"/><text x="${x}" y="${y + 3.5}" text-anchor="middle">${text}</text></g>`;
}

function makeLog(clock = () => null) {
  return (msg, cls = '') => {
    const el = $('log'), d = document.createElement('div');
    if (cls) d.className = cls;
    const t = clock();
    d.textContent = (t != null ? `[${t}] ` : '› ') + msg;
    el.appendChild(d);
    while (el.children.length > 60) el.firstChild.remove();
    el.scrollTop = el.scrollHeight;
  };
}

function makeChecklist(items, onAll) {
  const done = new Set();
  const draw = () => $('check').innerHTML = items.map(([id, t]) => `<li class="${done.has(id) ? 'done' : ''}">${t}</li>`).join('');
  draw();
  return k => { if (done.has(k)) return; done.add(k); draw(); if (done.size === items.length && onAll) onAll(); };
}

function renderQuiz(quiz) {
  $('quiz').innerHTML = quiz.map(([q, opts], i) => `<div class="q"><p>${i + 1}. ${q}</p>${opts.map((o, j) => `<button class="chip" data-q="${i}" data-o="${j}">${o}</button>`).join('')}<div class="ans" id="ans${i}"></div></div>`).join('');
  $('quiz').querySelectorAll('[data-q]').forEach(b => b.onclick = () => {
    const [, , right, why] = quiz[+b.dataset.q], ok = +b.dataset.o === right;
    b.classList.add(ok ? 'right' : 'wrong');
    $('ans' + b.dataset.q).textContent = (ok ? '✓ Right. ' : '✗ Not quite. ') + why;
  });
}

function makeParts(parts, onSelect) {
  $('chips').innerHTML = Object.entries(parts).map(([id, p]) => `<button class="chip" data-part="${id}">${p.name}</button>`).join('');
  const select = id => {
    const p = parts[id];
    if (!p) return;
    $('partCard').innerHTML = `<div class="k">${p.name}</div><table>${p.rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>`;
    document.querySelectorAll('#chips .chip').forEach(ch => ch.classList.toggle('sel', ch.dataset.part === id));
    document.querySelectorAll('.lbl').forEach(l => l.classList.toggle('sel', l.dataset.part === id));
    if (onSelect) onSelect(id);
  };
  $('chips').querySelectorAll('.chip').forEach(ch => ch.onclick = () => select(ch.dataset.part));
  return select;
}

function bindMenus(actions, after) {
  document.querySelectorAll('[data-menu]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const m = $(b.dataset.menu), open = m.classList.contains('open');
    document.querySelectorAll('.menu').forEach(x => x.classList.remove('open'));
    m.classList.toggle('open', !open);
  });
  document.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
    actions[b.dataset.act]();
    const m = b.closest('.menu'); if (m) m.classList.remove('open');
    if (after) after();
  });
  document.addEventListener('click', () => document.querySelectorAll('.menu').forEach(x => x.classList.remove('open')));
}

function bindFigClicks(svg, select, extra) {
  svg.addEventListener('click', e => {
    if (extra && extra(e)) return;
    const part = e.target.closest('[data-part]');
    if (part) select(part.dataset.part);
  });
}
