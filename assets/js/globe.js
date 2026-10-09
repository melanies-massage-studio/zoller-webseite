/* ZOLLER – 3D-Standortglobus der Standorte-Seite (Three.js)
   Landmassen als Punktraster (assets/js/globe-land.js), darüber alle
   Niederlassungen (gelb) und Vertretungen (weiß), Datenbögen vom Stammhaus
   Pleidelsheim zu jeder Niederlassung und ein Messring als Anspielung auf die
   Messtechnik. Ziehen dreht den Globus, Klick auf einen Punkt öffnet die
   Standortkarte. Die Daten kommen aus dem JSON-Block der Seite (build.py). */

import * as THREE from 'three';
import { POINTS, LAND } from './globe-land.js';

const root = document.querySelector('[data-globe]');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const YELLOW = new THREE.Color('#f0e600'), WHITE = new THREE.Color('#ffffff');
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

function vec(lat, lng, r = 1) {
  const a = lat * DEG, b = lng * DEG;
  return new THREE.Vector3(Math.cos(a) * Math.sin(b) * r, Math.sin(a) * r, Math.cos(a) * Math.cos(b) * r);
}

function landPoints() {
  const bits = Uint8Array.from(atob(LAND), (c) => c.charCodeAt(0));
  const golden = Math.PI * (3 - Math.sqrt(5)), pos = [], seed = [];
  for (let i = 0; i < POINTS; i++) {
    if (!(bits[i >> 3] & (1 << (i & 7)))) continue;
    const y = 1 - (i + 0.5) / POINTS * 2;                 // identisch zu tools/make_globe.py
    const lat = Math.asin(y) / DEG, lng = ((i * golden) % TAU) / DEG - 180;
    const v = vec(lat, lng, 1.002); pos.push(v.x, v.y, v.z); seed.push(Math.random());
  }
  return { pos: new Float32Array(pos), seed: new Float32Array(seed) };
}

/* Großkreis-Bogen zwischen zwei Punkten, Höhe wächst mit der Entfernung */
function arcPoints(a, b, n = 64) {
  const angle = a.angleTo(b), lift = 0.03 + angle * 0.14, pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = new THREE.Vector3().copy(a).lerp(b, t).normalize();
    pts.push(p.multiplyScalar(1 + Math.sin(Math.PI * t) * lift));
  }
  return pts;
}

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
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  const earth = new THREE.Group(); scene.add(earth);
  const uni = { uTime: { value: 0 }, uPix: { value: renderer.getPixelRatio() } };

  // --- Kugel: dunkler Kern mit heller Kante (Fresnel)
  earth.add(new THREE.Mesh(new THREE.SphereGeometry(0.995, 96, 64), new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(1. - max(dot(vN, vV), 0.), 3.); vec3 c = mix(vec3(.035), vec3(.2), f); gl_FragColor = vec4(c, 1.); }`,
  })));

  // --- Atmosphäre: zarter Lichtsaum hinter der Kugel
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.16, 64, 48), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV;
      void main(){ float d = dot(vN, vV); float i = pow(clamp(d + .62, 0., 1.), 5.) * .9; gl_FragColor = vec4(vec3(1., .98, .78), i * .32); }`,
  })));

  // --- Landmassen als Punktraster
  const lp = landPoints();
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute('position', new THREE.BufferAttribute(lp.pos, 3));
  dotGeo.setAttribute('seed', new THREE.BufferAttribute(lp.seed, 1));
  const dotMat = new THREE.ShaderMaterial({
    uniforms: { ...uni, uFocus: { value: new THREE.Vector3(0, 0, 1) }, uFocusOn: { value: 0 } },
    transparent: true, depthWrite: false,
    vertexShader: `attribute float seed; uniform float uTime; uniform float uPix; uniform vec3 uFocus; uniform float uFocusOn;
      varying float vA; varying float vHi;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.);
        vec3 n = normalize(normalMatrix * position);
        float facing = dot(n, normalize(-mv.xyz));
        vA = smoothstep(-.05, .35, facing) * (.55 + .45 * sin(uTime * .6 + seed * 6.283));
        vHi = uFocusOn * smoothstep(.9965, .99995, dot(normalize(position), uFocus));
        gl_PointSize = (2.1 + vHi * 1.6) * uPix * (3.4 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vA; varying float vHi;
      void main(){ vec2 p = gl_PointCoord - .5; float d = length(p); if (d > .5) discard;
        vec3 c = mix(vec3(.52), vec3(.94, .9, 0.), vHi);
        gl_FragColor = vec4(c, (1. - smoothstep(.32, .5, d)) * max(vA, vHi) * .95); }`,
  });
  earth.add(new THREE.Points(dotGeo, dotMat));

  // --- Gradnetz (alle 30°), sehr dezent
  const grat = [];
  for (let lat = -60; lat <= 60; lat += 30) for (let lng = 0; lng < 360; lng += 3) grat.push(vec(lat, lng, 1.001), vec(lat, lng + 3, 1.001));
  for (let lng = 0; lng < 360; lng += 30) for (let lat = -84; lat < 84; lat += 3) grat.push(vec(lat, lng, 1.001), vec(lat + 3, lng, 1.001));
  earth.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(grat),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.045, depthWrite: false })));

  // --- Messring mit Skala (wie an einem Einstell- und Messgerät)
  const ring = new THREE.Group(); scene.add(ring);
  const ticks = [], major = [];
  for (let i = 0; i < 360; i += 2) {
    const a = i * DEG, big = i % 30 === 0, mid = i % 10 === 0, r0 = 1.3, r1 = r0 + (big ? 0.07 : mid ? 0.04 : 0.02);
    (big ? major : ticks).push(new THREE.Vector3(Math.cos(a) * r0, 0, Math.sin(a) * r0), new THREE.Vector3(Math.cos(a) * r1, 0, Math.sin(a) * r1));
  }
  ring.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ticks), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 })));
  ring.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(major), new THREE.LineBasicMaterial({ color: YELLOW, transparent: true, opacity: 0.85 })));
  const circ = []; for (let i = 0; i <= 256; i++) { const a = i / 256 * TAU; circ.push(new THREE.Vector3(Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3)); }
  ring.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(circ), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 })));
  ring.rotation.set(1.18, 0, -0.32);

  // --- Standorte: Punkt, Lichtsäule, Pulsring
  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0);
  const beamMat = (color, o) => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color }, uO: { value: o } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uO; varying float vY; void main(){ gl_FragColor = vec4(uColor, (1. - vY) * uO); }',
  });
  const headGeo = new THREE.SphereGeometry(1, 16, 12);
  const ringGeo = new THREE.RingGeometry(0.72, 1, 48);
  const UP = new THREE.Vector3(0, 1, 0);
  const markers = [];
  for (const s of sites) {
    const col = s.k === 'vt' ? WHITE : YELLOW;
    const n = vec(s.lat, s.lng), g = new THREE.Group();
    g.position.copy(n); g.quaternion.setFromUnitVectors(UP, n);
    const size = s.k === 'hq' ? 0.016 : s.k === 'nl' ? 0.0105 : 0.0085;
    const h = s.k === 'hq' ? 0.32 : s.k === 'nl' ? 0.085 : 0.05;
    const head = new THREE.Mesh(headGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true }));
    head.scale.setScalar(size); head.position.y = 0.002; g.add(head);
    const beam = new THREE.Mesh(beamGeo, beamMat(col, s.k === 'vt' ? 0.45 : 0.75));
    const bw = size * (s.k === 'hq' ? 0.16 : 0.32); beam.scale.set(bw, h, bw); g.add(beam);
    const pulse = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    pulse.rotation.x = -Math.PI / 2; pulse.position.y = 0.003; g.add(pulse);
    earth.add(g);
    markers.push({ s, g, head, beam, pulse, n, size, h, phase: Math.random(), hover: 0, sel: 0, vis: 1, visT: 1, screen: new THREE.Vector3() });
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
