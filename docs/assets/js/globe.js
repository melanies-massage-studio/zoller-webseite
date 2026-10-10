/* ZOLLER – 3D-Standortglobus der Standorte-Seite (Three.js)
   Landmassen als Punktraster (assets/js/globe-land.js), darüber alle
   Niederlassungen (gelb) und Vertretungen (weiß), Datenbögen vom Stammhaus
   Pleidelsheim zu jeder Niederlassung und ein Messring als Anspielung auf die
   Messtechnik. Ziehen dreht den Globus, Klick auf einen Punkt öffnet die
   Standortkarte. Die Daten kommen aus dem JSON-Block der Seite (build.py). */

import * as THREE from 'three';
import { TAU, DEG, clamp, damp, vec, arcPoints, createEarth, createMarker, YELLOW, WHITE } from './globe-core.js';

const root = document.querySelector('[data-globe]');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
// Übersetzungen der Länderseiten (window.ZI18N, deutscher Text als Schlüssel)
const T = (s) => (window.ZI18N && window.ZI18N[s]) || s;
const KIND = { hq: T('Stammhaus'), nl: T('Niederlassung'), vt: T('Vertretung') };
const REGIONS = {
  'Europa': [50, 12, 2.6], 'Asien': [24, 102, 3.6], 'Nordamerika': [38, -96, 3.3],
  'Südamerika': [-18, -62, 3.4], 'Afrika': [2, 22, 3.6], 'Australien & Neuseeland': [-30, 140, 3.4],
};
// Regionsnamen der Seite (übersetzt) -> Kameraposition
if (root && root.dataset.regions) Object.entries(JSON.parse(root.dataset.regions)).forEach(([k, v]) => { REGIONS[k] = REGIONS[v]; });

if (root) init().catch((e) => { console.warn('Standortglobus deaktiviert:', e); root.classList.add('is-static'); });

const scrollToY = (y) => (window.__lenis ? window.__lenis.scrollTo(y) : window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' }));

async function init() {
  const test = document.createElement('canvas');
  if (!(test.getContext('webgl2') || test.getContext('webgl'))) { root.classList.add('is-static'); return; }
  const sites = JSON.parse(root.querySelector('[data-globe-data]').textContent);
  const byId = Object.fromEntries(sites.map((s) => [s.id, s]));
  const hq = sites.find((s) => s.k === 'hq');
  const canvas = root.querySelector('.globe__canvas');
  const panel = root.querySelector('[data-globe-panel]');
  const tip = root.querySelector('[data-globe-tip]');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  const { scene, earth, ring, uni, dotMat } = createEarth(renderer);

  // --- Standorte: Punkt, Lichtsäule, Pulsring
  const markers = [];
  for (const s of sites) {
    const mk = createMarker(s.lat, s.lng, s.k === 'vt' ? WHITE : YELLOW, s.k === 'vt' ? 0.45 : 0.75);
    const size = s.k === 'hq' ? 0.016 : s.k === 'nl' ? 0.0105 : 0.0085;
    const h = s.k === 'hq' ? 0.32 : s.k === 'nl' ? 0.085 : 0.05;
    mk.head.scale.setScalar(size);
    const bw = size * (s.k === 'hq' ? 0.16 : 0.32); mk.beam.scale.set(bw, h, bw);
    earth.add(mk.g);
    markers.push({ s, ...mk, size, h, phase: Math.random(), hover: 0, sel: 0, vis: 1, visT: 1, screen: new THREE.Vector3() });
  }
  const markerOf = Object.fromEntries(markers.map((m) => [m.s.id, m]));

  const hqM = markerOf[hq.id];

  // --- Datenbögen Stammhaus → Niederlassungen
  const arcs = [];
  const hqV = vec(hq.lat, hq.lng);
  for (const m of markers) {
    if (m.s.k !== 'nl' || m.n.distanceTo(hqV) < 0.012) continue;
    const pts = arcPoints(hqV, m.n), t = new Float32Array(pts.length);
    pts.forEach((_, i) => { t[i] = i / (pts.length - 1); });
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    geo.setAttribute('t', new THREE.BufferAttribute(t, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: uni.uTime, uOff: { value: Math.random() }, uO: { value: 1 }, uHi: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute float t; varying float vT; void main(){ vT = t; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: `uniform float uTime; uniform float uOff; uniform float uO; uniform float uHi; varying float vT;
        void main(){ float head = fract(uTime * .16 + uOff); float d = vT - head; float trail = d < 0. ? exp(d * 9.) : 0.;
          float a = (.1 + uHi * .35 + trail * .9) * smoothstep(0., .04, vT) * smoothstep(1., .96, vT);
          gl_FragColor = vec4(vec3(.94, .9, 0.), a * uO); }`,
    });
    const line = new THREE.Line(geo, mat); earth.add(line);
    arcs.push({ m, mat });
  }

  // ------------------------------------------------------------------ Ansicht
  const view = { rx: 0.3, ry: 0, dist: 4.9, off: 0 };          // aktueller Zustand
  const goal = { rx: 0.3, ry: 0, dist: 4.9, off: 0 };          // Ziel
  let W = 1, H = 1, mobile = false, auto = !reduced, selected = null, hovered = null;
  const setGoalTo = (lat, lng, dist) => {
    goal.rx = clamp(lat * DEG, -1.2, 1.2);
    let ry = -lng * DEG;                                         // kürzester Weg um die Achse
    while (ry - view.ry > Math.PI) ry -= TAU;
    while (ry - view.ry < -Math.PI) ry += TAU;
    goal.ry = ry; if (dist) goal.dist = dist;
    if (reduced) Object.assign(view, { rx: goal.rx, ry: goal.ry, dist: goal.dist });
  };
  setGoalTo(hq.lat - 8, hq.lng + 12);
  Object.assign(view, { rx: goal.rx, ry: goal.ry + 1.4, dist: 7.5 });   // Einflug

  function resize() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height); mobile = innerWidth < 900;
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    uni.uPix.value = renderer.getPixelRatio() * Math.min(1.25, Math.max(0.8, H / 900));
  }
  resize();
  if (mobile) goal.dist = 6;
  new ResizeObserver(resize).observe(canvas);

  // ------------------------------------------------------------ Interaktion
  let drag = null, lastMove = 0, pinch = null;
  const pointers = new Map();
  const ptr = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const vel = { x: 0, y: 0 };
  // Liegt ein Bildschirmpunkt auf der Kugel? (projizierter Kugelradius plus etwas Rand für Marker und Finger)
  const ctr = new THREE.Vector3();
  const onSphere = (x, y, pad = 1.15) => {
    ctr.set(0, 0, 0).project(camera);
    const cx = (ctr.x * 0.5 + 0.5) * W, cy = (-ctr.y * 0.5 + 0.5) * H;
    const r = (H / 2) / Math.tan(camera.fov * DEG / 2) / Math.sqrt(Math.max(0.05, view.dist * view.dist - 1));
    return Math.hypot(x - cx, y - cy) < r * pad;
  };
  // Touch: Ein Finger auf der Kugel dreht nur den Globus – die Seite scrollt dabei nicht mit.
  // Außerhalb der Kugel bleibt normales Scrollen erhalten, damit man an der Bühne vorbeikommt.
  canvas.addEventListener('touchstart', (e) => {
    const p = ptr(e.touches[0]);
    if (e.touches.length > 1 || onSphere(p.x, p.y)) e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, ptr(e));
    canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: goal.dist }; drag = null; return;
    }
    const p = ptr(e);
    drag = { ...p, sx: e.clientX, sy: e.clientY, moved: false, spin: e.pointerType !== 'touch' || onSphere(p.x, p.y) };
    if (drag.spin) { auto = false; vel.x = vel.y = 0; }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = ptr(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      goal.dist = clamp(pinch.dist * pinch.d / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), 1.75, 6.5); return;
    }
    if (drag) {
      const k = 2.4 / H * (view.dist - 0.85) / 2.4;
      const dx = p.x - drag.x, dy = p.y - drag.y;
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) drag.moved = true;
      if (!drag.spin) return;
      goal.ry += dx * k * 1.4; goal.rx = clamp(goal.rx + dy * k * 1.4, -1.2, 1.2);
      vel.x = dx * k * 1.4; vel.y = dy * k * 1.4; lastMove = performance.now();
      drag.x = p.x; drag.y = p.y;
      root.classList.add('is-dragging'); hideTip();
    } else if (e.pointerType === 'mouse') {
      hoverAt(p.x, p.y);
    }
  });
  const end = (e, cancelled = false) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!drag) return;
    root.classList.remove('is-dragging');
    if (cancelled) {
      // Browser hat die Geste übernommen (Seite scrollt) – kein Klick, kein Nachschwung
    } else if (!drag.moved) {
      const p = ptr(e), m = pick(p.x, p.y, e.pointerType === 'mouse' ? 16 : 26);
      if (m) select(m.s.id); else if (selected) select(null);
    } else if (drag.spin && performance.now() - lastMove < 60) {
      glide.x = vel.x; glide.y = vel.y;
    }
    drag = null;
  };
  canvas.addEventListener('pointerup', (e) => end(e));
  canvas.addEventListener('pointercancel', (e) => end(e, true));
  canvas.addEventListener('pointerleave', () => { if (!drag) { hovered = null; hideTip(); canvas.style.cursor = ''; } });
  // Mausrad zoomt nur bei Pinch-Geste (Trackpad) oder mit Strg/⌘. Seitliches Wischen auf dem Trackpad dreht
  // den Globus; senkrechtes Scrollen bleibt immer der Seite, damit niemand auf der Bühne hängen bleibt.
  canvas.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault(); goal.dist = clamp(goal.dist * Math.exp(e.deltaY * 0.004), 1.75, 6.5); auto = false; return;
    }
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.2 && Math.abs(e.deltaX) > 1) {
      const p = ptr(e);
      if (!onSphere(p.x, p.y, 1.4)) return;
      e.preventDefault(); auto = false; glide.x = glide.y = 0;
      goal.ry -= e.deltaX * (e.deltaMode === 1 ? 16 : 1) * 0.0032 * (view.dist - 0.85) / 2.4;
    }
  }, { passive: false });
  root.querySelectorAll('[data-globe-zoom]').forEach((b) => b.addEventListener('click', () => {
    goal.dist = clamp(goal.dist * (b.dataset.globeZoom === 'in' ? 0.78 : 1.28), 1.75, 6.5); auto = false;
  }));
  const glide = { x: 0, y: 0 };

  function pick(x, y, radius) {
    let best = null, bd = radius;
    for (const m of markers) {
      if (!m.vis || m.facing < 0.12) continue;
      const d = Math.hypot(m.screen.x - x, m.screen.y - y) - (m.s.k === 'hq' ? 6 : 0);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }
  function hoverAt(x, y) {
    const m = pick(x, y, 16);
    hovered = m;
    canvas.style.cursor = m ? 'pointer' : 'grab';
    if (m) showTip(m); else hideTip();
  }
  const city = (s) => (s.a[s.a.length - 1] || '').replace(/^[A-Z]{1,3}\s?[-–]\s?/, '');
  function showTip(m) {
    tip.innerHTML = `<b>${esc(m.s.n)}</b><span>${esc(KIND[m.s.k])} · ${esc(city(m.s))}</span>`;
    tip.hidden = false; tip.dataset.k = m.s.k; tipFor = m;
  }
  let tipFor = null;
  function hideTip() { tip.hidden = true; tipFor = null; }

  // ------------------------------------------------------------- Auswahl
  const near = (s) => sites.filter((o) => o !== s).map((o) => [o, vec(o.lat, o.lng).angleTo(vec(s.lat, s.lng)) * 6371])
    .filter(([, d]) => d < 1600).sort((a, b) => a[1] - b[1]).slice(0, 4);
  function card(s) {
    const tel = s.tel.map((v) => `<a href="tel:${esc(v.replace(/[^0-9+]/g, ''))}">${esc(v)}</a>`).join('<br>');
    const mail = s.mail.map((v) => `<a href="mailto:${esc(v)}">${esc(v)}</a>`).join('<br>');
    const links = [
      ...s.web.map((w) => `<a class="btn" href="${esc(w)}" target="_blank" rel="noopener">${T('Website')}</a>`),
      ...s.map.map((w) => `<a class="btn btn--ghost" href="${esc(w)}" target="_blank" rel="noopener">${T('Route planen')}</a>`),
    ].join('');
    const nb = near(s).map(([o, d]) => `<li><button type="button" data-goto="${o.id}"><i class="dot dot--${o.k}"></i><span>${esc(o.n)}<small>${esc(city(o))} · ${Math.round(d / 10) * 10} km</small></span></button></li>`).join('');
    return `<button type="button" class="globe__close" data-close aria-label="${T('Schließen')}"></button>
      <span class="globe__badge globe__badge--${s.k}">${KIND[s.k]}</span>
      <span class="globe__region">${esc(s.r)}</span>
      <h2>${esc(s.n)}</h2>
      <p class="globe__addr">${s.a.map(esc).join('<br>')}</p>
      <dl class="globe__facts">
        ${tel ? `<div><dt>${T('Telefon')}</dt><dd>${tel}</dd></div>` : ''}
        ${s.fax.length ? `<div><dt>${T('Fax')}</dt><dd>${s.fax.map(esc).join('<br>')}</dd></div>` : ''}
        ${mail ? `<div><dt>${T('E-Mail')}</dt><dd>${mail}</dd></div>` : ''}
        <div><dt>${T('Zuständig für')}</dt><dd class="globe__chips">${s.c.map((c) => `<span>${esc(c)}</span>`).join('')}</dd></div>
      </dl>
      <div class="globe__actions">${links}</div>
      ${nb ? `<div class="globe__near"><h3>${T('In der Nähe')}</h3><ul>${nb}</ul></div>` : ''}`;
  }
  function select(id) {
    const s = id ? byId[id] : null;
    selected = s ? markerOf[id] : null;
    root.classList.toggle('has-selection', !!s);
    if (!s) { panel.hidden = true; goal.dist = Math.max(goal.dist, mobile ? 5.4 : 4.2); return; }
    if (!selected.vis) setKind(s.k, true);
    auto = false; glide.x = glide.y = 0;
    setGoalTo(s.lat, s.lng, mobile ? 3.6 : s.k === 'hq' ? 3.0 : 3.3);
    const host = mobile ? document.body : root;           // mobil als Bottom-Sheet außerhalb des Stapelkontexts
    if (panel.parentNode !== host) host.appendChild(panel);
    panel.innerHTML = card(s); panel.hidden = false; panel.scrollTop = 0;
    if (mobile) { const r = canvas.getBoundingClientRect(); if (r.top < 0 || r.top > innerHeight * 0.3) window.scrollTo({ top: r.top + scrollY - 70, behavior: 'instant' }); }
    panel.classList.remove('is-in'); void panel.offsetWidth; panel.classList.add('is-in');
    dotMat.uniforms.uFocus.value.copy(vec(s.lat, s.lng));
    hideTip();
  }
  panel.addEventListener('click', (e) => {
    const go = e.target.closest('[data-goto]');
    if (go) select(go.dataset.goto);
    if (e.target.closest('[data-close]')) select(null);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && selected) select(null); });

  // Filter nach Typ
  const kindOn = { hq: true, nl: true, vt: true };
  function setKind(k, on) {
    kindOn[k] = on;
    root.querySelector(`[data-globe-kind="${k}"]`)?.classList.toggle('is-on', on);
    markers.forEach((m) => { m.visT = kindOn[m.s.k] ? 1 : 0; });
    if (selected && !kindOn[selected.s.k]) select(null);
  }
  root.querySelectorAll('[data-globe-kind]').forEach((b) => b.addEventListener('click', () => setKind(b.dataset.globeKind, !kindOn[b.dataset.globeKind])));

  // Regionen anfliegen
  const flyRegion = (r) => {
    const v = REGIONS[r]; if (!v) return;
    if (selected) select(null);
    auto = false; setGoalTo(v[0], v[1], mobile ? v[2] + 0.5 : v[2]);
    root.querySelectorAll('[data-globe-region]').forEach((b) => b.classList.toggle('is-on', b.dataset.globeRegion === r));
  };
  root.querySelectorAll('[data-globe-region]').forEach((b) => b.addEventListener('click', () => flyRegion(b.dataset.globeRegion)));

  // Suche
  const input = root.querySelector('[data-globe-search]'), results = root.querySelector('[data-globe-results]');
  const hay = Object.fromEntries(sites.map((s) => [s.id, norm([s.n, s.r, ...s.a, ...s.c].join(' '))]));
  let hits = [], active = -1;
  const renderHits = () => {
    results.innerHTML = hits.map((s, i) => `<li><button type="button" data-goto="${s.id}" class="${i === active ? 'is-active' : ''}"><i class="dot dot--${s.k}"></i><span>${esc(s.n)}<small>${esc(city(s))}</small></span></button></li>`).join('')
      || `<li class="is-empty">${T('Kein Standort gefunden')}</li>`;
    results.hidden = !input.value.trim();
  };
  input.addEventListener('input', () => {
    const q = norm(input.value.trim());
    hits = q ? sites.filter((s) => hay[s.id].includes(q)).slice(0, 7) : []; active = -1; renderHits();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % Math.max(1, hits.length); renderHits(); }
    if (e.key === 'Enter' && hits.length) { e.preventDefault(); select(hits[Math.max(0, active)].id); results.hidden = true; input.blur(); }
    if (e.key === 'Escape') { input.value = ''; results.hidden = true; }
  });
  results.addEventListener('click', (e) => { const b = e.target.closest('[data-goto]'); if (b) { select(b.dataset.goto); results.hidden = true; } });
  document.addEventListener('click', (e) => { if (!e.target.closest('.globe__search')) results.hidden = true; });

  // Liste unterhalb: „Auf dem Globus zeigen" und Regionsfilter
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-globe-focus]'); if (!b) return;
    if (mobile) { select(b.dataset.globeFocus); return; }
    scrollToY(root.getBoundingClientRect().top + scrollY - 64);
    setTimeout(() => select(b.dataset.globeFocus), reduced ? 0 : 450);
  });
  document.querySelector('[data-loc-region]')?.addEventListener('change', (e) => { if (e.target.value) flyRegion(e.target.value); });

  // HQ-Beschriftung (HTML) folgt dem Stammhaus
  const hqLabel = document.createElement('div');
  hqLabel.className = 'globe__hqlabel'; hqLabel.innerHTML = `<b>Pleidelsheim</b><span>${T('Stammhaus')}</span>`;
  root.appendChild(hqLabel);

  // ------------------------------------------------------------------ Loop
  let running = false, raf = 0, last = performance.now(), t0 = last;
  const tmp = new THREE.Vector3(), camDir = new THREE.Vector3();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const time = (now - t0) / 1000; uni.uTime.value = time;

    if (!drag) {
      if (glide.x || glide.y) {
        goal.ry += glide.x; goal.rx = clamp(goal.rx + glide.y, -1.2, 1.2);
        glide.x *= Math.pow(0.0015, dt); glide.y *= Math.pow(0.0015, dt);
        if (Math.abs(glide.x) + Math.abs(glide.y) < 1e-5) glide.x = glide.y = 0;
      } else if (auto) goal.ry += dt * 0.05;
    }
    const kk = reduced ? 60 : 3.2;
    view.rx = damp(view.rx, goal.rx, drag ? 18 : kk, dt);
    view.ry = damp(view.ry, goal.ry, drag ? 18 : kk, dt);
    view.dist = damp(view.dist, goal.dist, kk * 0.8, dt);
    // Globus seitlich versetzen: Intro links → Globus rechts; Karte rechts → Globus links
    goal.off = mobile ? 0 : selected ? -0.2 : 0.17;
    view.off = damp(view.off, goal.off, 3, dt);
    earth.rotation.set(view.rx, view.ry, 0);
    camera.position.set(0, mobile && selected ? -0.5 * view.dist / 4.9 : 0, view.dist);
    camera.lookAt(0, camera.position.y, 0);
    camera.setViewOffset(W, H, -view.off * W, 0, W, H);
    ring.rotation.y = time * 0.03;
    ring.position.copy(earth.position);
    dotMat.uniforms.uFocusOn.value = damp(dotMat.uniforms.uFocusOn.value, selected ? 1 : 0, 4, dt);
    earth.updateMatrixWorld(); camera.updateMatrixWorld();

    camDir.copy(camera.position).normalize();
    const zoomK = clamp((view.dist - 1.6) / 3.2, 0.45, 1.05);
    for (const m of markers) {
      m.vis = m.visT > 0.5;
      const k = m.vis ? 1 : 0;
      m.hover = damp(m.hover, hovered === m || tipFor === m ? 1 : 0, 10, dt);
      m.sel = damp(m.sel, selected === m ? 1 : 0, 6, dt);
      const sc = damp(m.g.scale.x, k, 8, dt); m.g.scale.setScalar(sc); m.g.visible = sc > 0.01;
      m.head.scale.setScalar(m.size * zoomK * (1 + m.hover * 0.7 + m.sel * 0.9));
      m.beam.scale.y = m.h * (1 + m.sel * 1.4 + m.hover * 0.6);
      const p = (time * 0.55 + m.phase) % 1;
      const ps = m.size * zoomK * (1.2 + p * (m.s.k === 'hq' ? 5 : 3.2) + m.sel * 2);
      m.pulse.scale.setScalar(ps); m.pulse.material.opacity = (1 - p) * (m.s.k === 'vt' ? 0.45 : 0.75) + m.sel * 0.2;
      tmp.copy(m.n).applyMatrix4(earth.matrixWorld);
      m.facing = tmp.clone().normalize().dot(tmp.clone().sub(camera.position).negate().normalize());
      tmp.project(camera);
      m.screen.set((tmp.x * 0.5 + 0.5) * W, (-tmp.y * 0.5 + 0.5) * H, 0);
    }
    for (const a of arcs) {
      a.mat.uniforms.uO.value = damp(a.mat.uniforms.uO.value, a.m.vis && kindOn.hq ? 1 : 0, 6, dt);
      a.mat.uniforms.uHi.value = damp(a.mat.uniforms.uHi.value, selected === a.m ? 1 : 0, 6, dt);
    }
    // Tooltip & HQ-Beschriftung positionieren
    const ox = canvas.offsetLeft, oy = canvas.offsetTop;     // mobil liegt der Canvas unter dem Text
    if (tipFor) tip.style.transform = `translate(${tipFor.screen.x + ox}px, ${tipFor.screen.y + oy}px)`;
    const hs = hqM.screen, show = hqM.vis && hqM.facing > 0.25 && selected !== hqM;
    hqLabel.style.transform = `translate(${hs.x + ox}px, ${hs.y + oy}px)`;
    hqLabel.classList.toggle('is-on', show && !mobile);

    renderer.render(scene, camera);
  }
  // Shader im Hintergrund kompilieren, damit der erste Frame die Seite nicht anhält
  try { await renderer.compileAsync(scene, camera); } catch (e) { /* kompiliert dann beim ersten Bild */ }
  const start = () => { if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); } };
  const stop = () => { running = false; cancelAnimationFrame(raf); };
  new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop()), { threshold: 0.01 }).observe(root);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : root.getBoundingClientRect().bottom > 0 && start()));
  start();
  requestAnimationFrame(() => root.classList.add('is-ready'));

  // Deep-Link: #standort=<name-teil>
  const m = decodeURIComponent(location.hash).match(/^#standort=(.+)$/);
  if (m) { const q = norm(m[1]); const s = sites.find((x) => hay[x.id].includes(q)); if (s) setTimeout(() => select(s.id), 600); }
}
