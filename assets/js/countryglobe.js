/* ZOLLER – Globus im Länderdialog (Three.js)
   Öffnet sich mit dem Länder-Knopf (Weltkugel + Flagge). Jede ZOLLER-Länderseite
   steht als gelbe Markierung mit Flagge auf dem Globus, die übrigen ZOLLER-Seiten
   als weiße Punkte. Zeigen auf ein Land blendet die Route vom aktuellen Land ein,
   ein Klick fliegt als Lichtpunkt über den Bogen dorthin, zoomt auf den Hauptsitz
   und öffnet dann die Länderseite. Wird von main.js beim ersten Öffnen geladen;
   Daten aus dem JSON-Block im Dialog (build.py, lang_dialog). */

import * as THREE from 'three';
import { DEG, TAU, clamp, damp, vec, arcPoints, createEarth, createMarker, YELLOW, WHITE } from './globe-core.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const FLY = 1.35, HOLD = 0.3;                       // Flugdauer, Halt über dem Ziel (s)

export function mount(dialog) {
  const test = document.createElement('canvas');
  if (!(test.getContext('webgl2') || test.getContext('webgl'))) { dialog.classList.add('is-static'); return null; }
  const data = JSON.parse(dialog.querySelector('[data-cglobe-data]').textContent);
  const box = dialog.querySelector('[data-cglobe]');
  const canvas = box.querySelector('canvas');
  const pinLayer = box.querySelector('[data-cglobe-pins]');
  const veil = dialog.querySelector('[data-cglobe-veil]');
  const byId = Object.fromEntries(data.sites.map((s) => [s.id, s]));
  const cur = byId[data.cur];

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  const { scene, earth, ring, uni, dotMat } = createEarth(renderer);

  // --- Markierungen: Länderseiten gelb, weitere ZOLLER-Seiten weiß
  const marks = [];
  for (const s of data.sites) {
    const mk = createMarker(s.lat, s.lng, YELLOW, 0.8);
    const size = s.id === cur.id ? 0.016 : 0.013, h = s.id === cur.id ? 0.24 : 0.16;
    mk.head.scale.setScalar(size); mk.beam.scale.set(size * 0.2, h, size * 0.2);
    earth.add(mk.g);
    marks.push({ s, ...mk, size, h, phase: Math.random(), hi: 0, screen: new THREE.Vector3(), facing: 1 });
  }
  for (const e of data.ext) {
    const mk = createMarker(e.lat, e.lng, WHITE, 0.45);
    mk.head.scale.setScalar(0.008); mk.beam.scale.set(0.0026, 0.05, 0.0026);
    earth.add(mk.g);
    marks.push({ s: e, ext: true, ...mk, size: 0.008, h: 0.05, phase: Math.random(), hi: 0, screen: new THREE.Vector3(), facing: 1 });
  }
  const markOf = Object.fromEntries(marks.filter((m) => !m.ext).map((m) => [m.s.id, m]));

  // --- Routen vom aktuellen Land zu den anderen Länderseiten
  const routes = {};
  const from = vec(cur.lat, cur.lng);
  for (const s of data.sites) {
    if (s.id === cur.id) continue;
    const pts = arcPoints(from, vec(s.lat, s.lng), 96), t = new Float32Array(pts.length);
    pts.forEach((_, i) => { t[i] = i / (pts.length - 1); });
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    geo.setAttribute('t', new THREE.BufferAttribute(t, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: uni.uTime, uOff: { value: Math.random() }, uO: { value: 1 }, uHi: { value: 0 }, uFly: { value: -1 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute float t; varying float vT; void main(){ vT = t; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: `uniform float uTime; uniform float uOff; uniform float uO; uniform float uHi; uniform float uFly; varying float vT;
        void main(){
          float a;
          if (uFly >= 0.) { float d = vT - uFly; a = d < 0. ? .25 + .75 * exp(d * 4.) : .06; }
          else { float head = fract(uTime * .2 + uOff); float d = vT - head; float trail = d < 0. ? exp(d * 9.) : 0.;
                 a = (.08 + uHi * .4 + trail * (.5 + uHi * .5)); }
          a *= smoothstep(0., .03, vT) * smoothstep(1., .97, vT);
          gl_FragColor = vec4(vec3(.94, .9, 0.), a * uO); }`,
    });
    earth.add(new THREE.Line(geo, mat));
    routes[s.id] = { pts, mat };
  }
  // Lichtpunkt für den Flug
  const comet = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfffbd0, transparent: true }));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: YELLOW, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(0.12); comet.add(glow); comet.visible = false; earth.add(comet);

  // --- HTML-Beschriftungen mit Flagge
  const pins = {};
  for (const s of data.sites) {
    const el = document.createElement('div');
    el.className = `cg-pin cg-pin--${s.side || 'ne'}${s.id === cur.id ? ' is-current' : ''}`;
    const entry = dialog.querySelector(`[data-site="${s.id}"]`);
    const flag = entry?.querySelector('.flag')?.outerHTML || '';
    const langs = s.locs.length > 1
      ? `<span class="cg-pin__langs">${s.locs.map((l) => `<a href="${l.href}" hreflang="${l.code}" lang="${l.lang}" data-site="${s.id}" data-loc="${l.code}" tabindex="-1">${l.lang.toUpperCase()}</a>`).join('')}</span>` : '';
    el.innerHTML = `<i class="cg-pin__line"></i><span class="cg-pin__card"><a class="cg-pin__main" href="${s.locs[0].href}" data-site="${s.id}" data-loc="${s.locs[0].code}" tabindex="-1">${flag}<b>${s.name}</b></a>`
      + `<small>${s.id === cur.id ? data.t.here : s.city}</small>${langs}</span>`;
    pinLayer.appendChild(el);
    pins[s.id] = el;
  }

  // ------------------------------------------------------------------ Ansicht
  const view = { rx: 0, ry: 0, dist: 7 }, goal = { rx: 0, ry: 0, dist: 3.4 };
  let W = 1, H = 1, fit = 1, running = false, raf = 0, last = 0, t0 = performance.now(), hover = null, flight = null;
  const unwrap = (ry) => { while (ry - view.ry > Math.PI) ry -= TAU; while (ry - view.ry < -Math.PI) ry += TAU; return ry; };
  const lookAt = (lat, lng, dist) => { goal.rx = clamp(lat * DEG, -1.2, 1.2); goal.ry = unwrap(-lng * DEG); if (dist) goal.dist = dist; };
  const latLng = (v) => { const n = v.clone().normalize(); return [Math.asin(n.y) / DEG, Math.atan2(n.x, n.z) / DEG]; };
  const home = () => lookAt(cur.view[0], cur.view[1], cur.view[2]);
  // Route zeigen: Mittelpunkt des Bogens, Abstand so, dass beide Enden zu sehen sind
  function preview(id) {
    if (flight) return;
    hover = id && id !== cur.id && byId[id] ? id : null;
    if (!id) { home(); return; }
    const s = byId[id] || data.ext.find((e) => e.id === id);
    if (!s) return;
    if (id === cur.id) { home(); return; }
    const b = vec(s.lat, s.lng), ang = from.angleTo(b);
    const [lat, lng] = latLng(from.clone().add(b));
    lookAt(lat, lng, clamp(2.7 + ang * 1.9, 2.8, 5.2));
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    // Schmale, hohe Flächen: Kamera weiter weg, damit der Globus nicht seitlich angeschnitten wird
    fit = camera.aspect < 1.15 ? Math.min(1.7, 1.15 / camera.aspect) : 1;
    uni.uPix.value = renderer.getPixelRatio() * Math.min(1.25, Math.max(0.8, H / 900));
  }
  new ResizeObserver(resize).observe(canvas);

  // ------------------------------------------------------------ Interaktion
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (flight) return;
    drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); box.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const k = 2.2 / H * (view.dist - 0.85) / 2.4;
    goal.ry += (e.clientX - drag.x) * k; goal.rx = clamp(goal.rx + (e.clientY - drag.y) * k, -1.2, 1.2);
    drag.x = e.clientX; drag.y = e.clientY;
  });
  const endDrag = () => { drag = null; box.classList.remove('is-dragging'); };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // Zeigen auf Länderseiten (Liste und Beschriftungen) -> Route; Klick -> Flug
  const siteOf = (el) => el?.closest('[data-site]')?.dataset.site;
  dialog.addEventListener('pointerover', (e) => { if (e.pointerType === 'mouse') { const id = siteOf(e.target); if (id) preview(id); } });
  dialog.querySelector('.lang-dialog__inner').addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') preview(null); });
  dialog.addEventListener('focusin', (e) => { const id = siteOf(e.target); if (id) preview(id); });
  dialog.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-site][data-loc]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    const s = byId[a.dataset.site], loc = s?.locs.find((l) => l.code === a.dataset.loc);
    if (!loc) return;
    e.preventDefault();
    if (loc.cur) { dialog.close(); return; }
    go(s, loc);
  });

  // ------------------------------------------------------------- Flug
  function go(s, loc) {
    if (flight) return;
    const target = markOf[s.id];
    const hint = document.createElement('link'); hint.rel = 'prefetch'; hint.href = loc.href; document.head.appendChild(hint);
    veil.innerHTML = `${pins[s.id].querySelector('.flag')?.outerHTML || ''}<span><b>ZOLLER</b><i></i>${s.country}</span><small>${loc.label}</small>`;
    dialog.classList.add('is-flying');
    pins[s.id].classList.add('is-target');
    const leave = () => {
      try { sessionStorage.setItem('zoller-arrive', JSON.stringify({ site: s.id, t: Date.now() })); } catch (err) { /* privat */ }
      location.href = loc.href;
    };
    if (reduced) { dialog.classList.add('is-leaving'); setTimeout(leave, 250); return; }
    const route = routes[s.id];
    flight = { s, route, start: performance.now(), dist0: view.dist, ang: route ? from.angleTo(target.n) : 0, leave, left: false };
    hover = null;
  }
  function fly(now) {
    const f = flight, el = (now - f.start) / 1000;
    if (f.route) {
      const t = ease(clamp(el / FLY));
      const pts = f.route.pts, x = t * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(x));
      const p = pts[i].clone().lerp(pts[i + 1], x - i);
      comet.visible = el < FLY + HOLD; comet.position.copy(p);
      f.route.mat.uniforms.uFly.value = t;
      const [lat, lng] = latLng(p);
      goal.rx = clamp(lat * DEG, -1.2, 1.2); goal.ry = unwrap(-lng * DEG);
      goal.dist = f.dist0 + (1.75 - f.dist0) * t + Math.sin(Math.PI * t) * f.ang * 0.9;
    } else {                                     // gleiche Länderseite, andere Sprache: nur heranzoomen
      const t = ease(clamp(el / 0.8));
      lookAt(f.s.lat, f.s.lng); goal.dist = f.dist0 + (1.75 - f.dist0) * t;
    }
    const dur = f.route ? FLY : 0.8;
    if (!f.left && el > dur - 0.15) { f.left = true; dialog.classList.add('is-leaving'); }
    if (el > dur + HOLD + 0.35) { flight = null; f.leave(); }
  }

  // ------------------------------------------------------------------ Loop
  const tmp = new THREE.Vector3(), cam = new THREE.Vector3();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const time = (now - t0) / 1000; uni.uTime.value = time;
    if (flight) fly(now);
    const k = reduced ? 60 : flight ? 7 : 3.2;
    view.rx = damp(view.rx, goal.rx, drag ? 18 : k, dt);
    view.ry = damp(view.ry, goal.ry, drag ? 18 : k, dt);
    view.dist = damp(view.dist, goal.dist, flight ? 6 : k * 0.8, dt);
    earth.rotation.set(view.rx, view.ry, 0);
    camera.position.set(0, 0, 1 + (view.dist - 1) * fit); camera.lookAt(0, 0, 0);
    ring.rotation.y = time * 0.03;
    const focus = flight ? flight.s.id : hover;
    if (focus) dotMat.uniforms.uFocus.value.copy(markOf[focus].n);
    dotMat.uniforms.uFocusOn.value = damp(dotMat.uniforms.uFocusOn.value, focus ? 1 : 0, 4, dt);
    earth.updateMatrixWorld(); camera.updateMatrixWorld();
    cam.copy(camera.position);
    const zoomK = clamp((view.dist - 1.4) / 3.2, 0.35, 1.05);
    for (const m of marks) {
      const on = !m.ext && (m.s.id === hover || (flight && flight.s.id === m.s.id)) ? 1 : 0;
      m.hi = damp(m.hi, on, 8, dt);
      m.head.scale.setScalar(m.size * zoomK * (1 + m.hi * 0.8));
      m.beam.scale.y = m.h * (1 + m.hi * 1.2);
      const p = (time * 0.55 + m.phase) % 1;
      m.pulse.scale.setScalar(m.size * zoomK * (1.2 + p * (m.ext ? 2.6 : 4.2) + m.hi * 2));
      m.pulse.material.opacity = (1 - p) * (m.ext ? 0.4 : 0.75);
      tmp.copy(m.n).applyMatrix4(earth.matrixWorld);
      m.facing = tmp.clone().normalize().dot(cam.clone().sub(tmp).normalize());
      tmp.project(camera);
      m.screen.set((tmp.x * 0.5 + 0.5) * W, (-tmp.y * 0.5 + 0.5) * H, 0);
    }
    for (const [id, r] of Object.entries(routes)) {
      const fl = flight && flight.s.id === id;
      r.mat.uniforms.uHi.value = damp(r.mat.uniforms.uHi.value, hover === id ? 1 : 0, 6, dt);
      r.mat.uniforms.uO.value = damp(r.mat.uniforms.uO.value, flight && !fl ? 0 : 1, 6, dt);
      if (!fl) r.mat.uniforms.uFly.value = -1;
    }
    for (const [id, el] of Object.entries(pins)) {
      const m = markOf[id];
      el.style.transform = `translate(${m.screen.x}px, ${m.screen.y}px)`;
      el.classList.toggle('is-hidden', m.facing < 0.18 || (flight && flight.s.id !== id && !el.classList.contains('is-current')));
      el.classList.toggle('is-hover', hover === id);
    }
    renderer.render(scene, camera);
  }

  function open() {
    dialog.classList.remove('is-flying', 'is-leaving');
    Object.values(pins).forEach((p) => p.classList.remove('is-target'));
    flight = null; hover = null; comet.visible = false;
    resize(); home();
    if (reduced) Object.assign(view, goal);
    else Object.assign(view, { rx: goal.rx - 0.25, ry: goal.ry + 1.1, dist: 7.5 });
    if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
    requestAnimationFrame(() => box.classList.add('is-ready'));
  }
  function close() { running = false; cancelAnimationFrame(raf); box.classList.remove('is-ready'); }
  dialog.addEventListener('close', close);
  // Zurück-Taste: Seite kommt aus dem Cache – Dialog ohne Schleier wieder schließen
  window.addEventListener('pageshow', (e) => { if (e.persisted && dialog.open) { dialog.classList.remove('is-flying', 'is-leaving'); dialog.close(); } });
  return { open };
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
