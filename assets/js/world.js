/* ZOLLER Produktumgebung 3D – Szene, Ausstellungsarchitektur und Kamera
   Rundhalle mit zentralem Platz (ZOLLER-Symbol) und sieben Themenwelten.
   Jede Themenwelt ist eine zweistufige Bühne, die zum Platz hin geöffnet ist:
   vorne die untere Reihe, versetzt dahinter die erhöhte Reihe.
   Winkel θ werden im Uhrzeigersinn von Norden (−z) gemessen. */

import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';

const YELLOW = 0xf0e600;
const FONT = '"T-Star", "Helvetica Neue", Arial, sans-serif';
// Sprachfassungen: Texte in der Szene aus window.ZI18N (deutscher Text als Schlüssel)
const tr = (s) => (globalThis.ZI18N && globalThis.ZI18N[s]) || s;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const polar = (th, r, y = 0) => new THREE.Vector3(Math.sin(th) * r, y, -Math.cos(th) * r);
const thetaOf = (x, z) => { let t = Math.atan2(x, -z); if (t < 0) t += TAU; return t; };

/* ---------------------------------------------------------------- Layout */
const ROW_GAP = 6.4;          // Abstand innere ↔ äußere Reihe
const TIER = [0.16, 0.66];    // Podesthöhen
const SECTOR_GAP = 3.4;       // Abstand zwischen Themenwelten (m, innerer Radius)
const STAGGER = 0.56;         // Versatz der Reihen (Anteil der Stellfläche)
const WALK_EYE = 1.62;

function metrics(p) {
  const a = p.aspect || 1;
  switch (p.kind) {
    case 'pedestal': { const H = p.h, W = H * a; return { H, W, base: 0.9, plinth: 0.62, foot: Math.max(W, 1.2) + 1.25 }; }
    case 'vitrine': { const H = p.h, W = H * a; return { H, W, base: 0.95, plinth: 0.9, foot: Math.max(W, 1.4) + 1.6 }; }
    case 'software': { const H = p.h, W = H * a; return { H, W, base: 0.62, plinth: 0.72, foot: W + 1.0 }; }
    case 'package': { const H = 1.05, W = 1.05; return { H, W, base: 0.62, plinth: 0.66, foot: 2.0 }; }
    case 'screen': { const W = 2.35, H = W / a; return { H, W, base: 0.95, plinth: 0, foot: W + 1.3 }; }
    default: { const H = p.h, W = H * a; return { H, W, base: 0.1, plinth: clamp(W * 0.55, 0.95, 2.15), foot: Math.max(W, 1.8) + 1.15 }; }
  }
}

function computeLayout(categories, products) {
  const groups = categories.map((c) => {
    const items = products.filter((p) => p.cat === c.id)
      .sort((a, b) => c.subs.indexOf(a.sub) - c.subs.indexOf(b.sub));
    return { cat: c, items };
  });
  products.forEach((p) => { p.m = metrics(p); });

  function place(g, rIn) {
    const it = g.items, n = it.length, twoRows = n > 3, rOut = rIn + ROW_GAP;
    const a = [];
    for (let i = 0; i < n; i++) {
      const row = twoRows ? i % 2 : 1;
      const r = row ? rOut : rIn;
      it[i]._row = row;
      if (i === 0) { a.push(0); continue; }
      const f0 = it[i - 1].m.foot, f1 = it[i].m.foot;
      let cand = a[i - 1] + (twoRows ? STAGGER : 1) * (f0 + f1) / 2 / (twoRows ? rIn : r);
      if (it[i].sub !== it[i - 1].sub) cand += 0.9 / rIn;
      const j = twoRows ? i - 2 : -1;
      if (j >= 0) cand = Math.max(cand, a[j] + (it[j].m.foot + f1) / 2 / r);
      a.push(cand);
    }
    const m0 = it[0].m.foot / 2 / rIn, m1 = it[n - 1].m.foot / 2 / rIn;
    let span = a[n - 1] + m0 + m1;
    const minSpan = 10.5 / rIn;
    const off = span < minSpan ? (minSpan - span) / 2 : 0;
    span = Math.max(span, minSpan);
    it.forEach((p, i) => { p._rel = a[i] + m0 + off; });
    return span;
  }

  let rIn = 20;
  for (let k = 0; k < 20; k++) {
    let total = 0;
    groups.forEach((g) => { g.span = place(g, rIn); total += g.span + SECTOR_GAP / rIn; });
    const s = total / TAU;
    if (Math.abs(s - 1) < 0.002) break;
    rIn *= s;
  }
  rIn = Math.max(rIn, 16);
  let total = 0;
  groups.forEach((g) => { g.span = place(g, rIn); total += g.span; });
  const gap = (TAU - total) / groups.length;

  // Erste Themenwelt mittig im Norden
  let th = -groups[0].span / 2;
  const rOut = rIn + ROW_GAP;
  const sectors = groups.map((g, i) => {
    const s = { id: g.cat.id, index: i, cat: g.cat, th0: th, th1: th + g.span, items: g.items };
    s.mid = (s.th0 + s.th1) / 2;
    g.items.forEach((p) => {
      p._th = th + p._rel;
      p._r = p._row ? rOut : rIn;
      p._y = TIER[p._row];
      p.pos = polar(p._th, p._r, p._y);
    });
    th += g.span + gap;
    return s;
  });
  return { rIn, rOut, sectors, plazaR: rIn - 6.2, wallR: rOut + 3.7, tierIn: [rIn - 3.0, rIn + ROW_GAP / 2], tierOut: [rIn + ROW_GAP / 2, rOut + 3.0] };
}

/* ------------------------------------------------------- Canvas-Helfer */
function canvasTex(canvas, renderer, opts = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...opts.repeat); }
  return t;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function labelCanvas(name, sub, badge) {
  const S = 2, c = document.createElement('canvas'), ctx = c.getContext('2d');
  const f1 = `700 ${44 * S}px ${FONT}`, f2 = `400 ${22 * S}px ${FONT}`, f3 = `700 ${17 * S}px ${FONT}`;
  ctx.font = f1; const w1 = ctx.measureText(name).width;
  ctx.font = f2; const w2 = ctx.measureText(sub).width;
  ctx.font = f3; const wb = badge ? ctx.measureText(badge.toUpperCase()).width + 22 * S : 0;
  const pad = 26 * S, W = Math.ceil(Math.max(w1 + (badge ? wb + 12 * S : 0), w2) + pad * 2 + 10 * S), H = 112 * S;
  c.width = W; c.height = H + 18 * S;
  ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 14 * S; ctx.shadowOffsetY = 4 * S;
  ctx.fillStyle = '#fff'; roundRect(ctx, 6 * S, 4 * S, W - 12 * S, H - 8 * S, 18 * S); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#f0e600'; roundRect(ctx, 6 * S, 4 * S, 10 * S, H - 8 * S, 5 * S); ctx.fill();
  ctx.fillRect(10 * S, 4 * S, 6 * S, H - 8 * S);
  // Zeiger
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(W / 2 - 13 * S, H - 5 * S); ctx.lineTo(W / 2 + 13 * S, H - 5 * S); ctx.lineTo(W / 2, H + 14 * S); ctx.fill();
  ctx.fillStyle = '#111'; ctx.font = f1; ctx.textBaseline = 'alphabetic';
  ctx.fillText(name, pad + 6 * S, 56 * S);
  if (badge) {
    const bx = pad + 6 * S + w1 + 12 * S;
    ctx.fillStyle = '#111'; roundRect(ctx, bx, 24 * S, wb, 30 * S, 15 * S); ctx.fill();
    ctx.fillStyle = '#f0e600'; ctx.font = f3; ctx.fillText(badge.toUpperCase(), bx + 11 * S, 45 * S);
  }
  ctx.fillStyle = '#6b6b6b'; ctx.font = f2; ctx.fillText(sub, pad + 6 * S, 90 * S);
  return { canvas: c, aspect: c.width / c.height };
}

function packageCanvas(tier, title) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const ctx = c.getContext('2d');
  const tones = { STARTER: ['#ffffff', '#cfd3d6', '#1a1a1a'], BRONZE: ['#e9b48a', '#9a5b2e', '#2b160a'], SILVER: ['#f4f6f8', '#9ea6ad', '#1a1d20'], GOLD: ['#fff3a6', '#c9a227', '#2a2000'] };
  const [hi, lo, ink] = tones[tier] || tones.STARTER;
  const g = ctx.createRadialGradient(200, 170, 30, 256, 256, 250);
  g.addColorStop(0, hi); g.addColorStop(1, lo);
  ctx.fillStyle = 'rgba(240,230,0,0.35)'; ctx.beginPath(); ctx.arc(256, 256, 252, 0, TAU); ctx.fill();
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(256, 256, 232, 0, TAU); ctx.fill();
  ctx.lineWidth = 10; ctx.strokeStyle = '#f0e600'; ctx.beginPath(); ctx.arc(256, 256, 214, 0, TAU); ctx.stroke();
  ctx.fillStyle = ink; ctx.textAlign = 'center';
  ctx.font = `800 30px ${FONT}`; ctx.fillText('TMS', 256, 170);
  ctx.font = `800 78px ${FONT}`; ctx.fillText(tier, 256, 268);
  ctx.font = `500 26px ${FONT}`;
  const words = title.replace(tier, '').replace(/­/g, '').trim();
  ctx.fillText(words, 256, 320);
  ctx.font = `400 20px ${FONT}`; ctx.fillText(tr('Softwarepaket'), 256, 356);
  return c;
}

function noiseFloorCanvas() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e4e5e7'; ctx.fillRect(0, 0, 512, 512);
  const img = ctx.getImageData(0, 0, 512, 512), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 7; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = 'rgba(0,0,0,0.07)'; ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 512, 512); ctx.beginPath(); ctx.moveTo(256, 0); ctx.lineTo(256, 512); ctx.moveTo(0, 256); ctx.lineTo(512, 256); ctx.stroke();
  return c;
}

function blobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.45, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return c;
}

/* Geometrie: Bogenstreifen (vertikal oder flach), u entlang θ, v quer */
function arcStrip({ r0, r1 = r0, th0, th1, y0, y1 = y0, segs = 48 }) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, th = lerp(th0, th1, t), s = Math.sin(th), c = -Math.cos(th);
    pos.push(s * r0, y0, c * r0, s * r1, y1, c * r1);
    uv.push(t, 0, t, 1);
    if (i < segs) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function sectorShape(rA, rB, th0, th1) {
  const s = new THREE.Shape();
  const p0 = Math.PI / 2 - th0, p1 = Math.PI / 2 - th1;
  s.moveTo(Math.cos(p0) * rB, Math.sin(p0) * rB);
  s.absarc(0, 0, rB, p0, p1, true);
  s.lineTo(Math.cos(p1) * rA, Math.sin(p1) * rA);
  s.absarc(0, 0, rA, p1, p0, false);
  s.closePath();
  return s;
}

function zollerSymbol(material, scale = 1, depth = 0.22) {
  const g = new THREE.Group();
  const ring = new THREE.Shape(); ring.absarc(0, 0, 1.0, 0, TAU, false);
  const hole = new THREE.Path(); hole.absarc(0, 0, 0.72, 0, TAU, true); ring.holes.push(hole);
  const ex = { depth, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 96 };
  const rm = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, ex), material); rm.position.z = -depth / 2; g.add(rm);
  const arm = new THREE.Shape(); arm.moveTo(-0.14, 0); arm.lineTo(0.14, 0); arm.lineTo(0.14, 0.64); arm.lineTo(-0.14, 0.64); arm.closePath();
  const ag = new THREE.ExtrudeGeometry(arm, ex);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2, m = new THREE.Mesh(ag, material);
    m.rotation.z = a - Math.PI / 2; m.position.set(Math.cos(a) * 0.96, Math.sin(a) * 0.96, -depth / 2); g.add(m);
  }
  g.scale.setScalar(scale);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return g;
}

function symbolFlat(scale) {
  const shapes = [];
  const ring = new THREE.Shape(); ring.absarc(0, 0, 1.0, 0, TAU, false);
  const hole = new THREE.Path(); hole.absarc(0, 0, 0.8, 0, TAU, true); ring.holes.push(hole); shapes.push(ring);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca, w = 0.09;
    const s = new THREE.Shape();
    const r0 = 0.97, r1 = 1.62;
    s.moveTo(ca * r0 + px * w, sa * r0 + py * w); s.lineTo(ca * r1 + px * w, sa * r1 + py * w);
    s.lineTo(ca * r1 - px * w, sa * r1 - py * w); s.lineTo(ca * r0 - px * w, sa * r0 - py * w); s.closePath();
    shapes.push(s);
  }
  const g = new THREE.ShapeGeometry(shapes, 96); g.scale(scale, scale, 1); g.rotateX(-Math.PI / 2);
  return g;
}

/* =================================================================== */
export async function createWorld(canvas, data, { onProgress = () => {}, mobile = false, base = '', cinematic = false } = {}) {
  // cinematic: Kamera folgt setProgress() (z. B. Scroll), keine Maus-/Tastatursteuerung
  if (cinematic) canvas.style.pointerEvents = 'none';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.6 : (cinematic ? 1.5 : 2)));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping ?? THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  const BG = new THREE.Color(0xe7e9ec);
  scene.background = BG;
  scene.fog = new THREE.Fog(BG, 70, 230);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);

  const { categories, products } = data;
  const L = computeLayout(categories, products);
  const byId = new Map(products.map((p) => [p.id, p]));
  const secById = new Map(L.sectors.map((s) => [s.id, s]));

  /* ---------------- Materialien ---------------- */
  const M = {
    floor: new THREE.MeshStandardMaterial({ color: 0xd2d5d9, roughness: 0.4, metalness: 0, map: canvasTex(noiseFloorCanvas(), renderer, { repeat: [150, 150] }) }),
    plaza: new THREE.MeshStandardMaterial({ color: 0xf4f4f3, roughness: 0.3, metalness: 0 }),
    tierTop: new THREE.MeshStandardMaterial({ color: 0xf6f6f5, roughness: 0.62 }),
    riser: new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.55 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.45, metalness: 0.1 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf7f7f6, roughness: 0.5 }),
    led: new THREE.MeshBasicMaterial({ color: YELLOW, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    yellowInlay: new THREE.MeshStandardMaterial({ color: YELLOW, roughness: 0.38, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    gold: new THREE.MeshStandardMaterial({ color: YELLOW, roughness: 0.22, metalness: 0.45, emissive: 0x332f00 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }),
    cable: new THREE.LineBasicMaterial({ color: 0x8a8d92, transparent: true, opacity: 0.55 }),
  };
  M.floor.map.anisotropy = maxAniso;

  /* ---------------- Boden & Platz ---------------- */
  const pickFloor = [];
  // Hallenboden innerhalb der Zone, außen dunklerer Boden mit gelber Grenzlinie
  const zoneR = L.wallR + 1.3;
  const floor = new THREE.Mesh(new THREE.RingGeometry(L.plazaR - 0.05, zoneR, 160, 4).rotateX(-Math.PI / 2), M.floor);
  floor.receiveShadow = true; scene.add(floor); pickFloor.push(floor);
  M.floor.map.repeat.set(zoneR * 2 / 3.2, zoneR * 2 / 3.2);
  const outMap = M.floor.map.clone(); outMap.repeat.set(520 / 3.2, 520 / 3.2); outMap.needsUpdate = true;
  const outside = new THREE.Mesh(new THREE.RingGeometry(zoneR, 260, 160, 6).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xb4b8be, roughness: 0.85, map: outMap }));
  outside.receiveShadow = true; scene.add(outside);
  const zoneLine = new THREE.Mesh(new THREE.RingGeometry(zoneR, zoneR + 0.22, 200).rotateX(-Math.PI / 2), M.yellowInlay);
  scene.add(zoneLine);

  const plaza = new THREE.Mesh(new THREE.CircleGeometry(L.plazaR, 128).rotateX(-Math.PI / 2), M.plaza);
  plaza.position.y = 0; plaza.receiveShadow = true; scene.add(plaza); pickFloor.push(plaza);
  const ringEdge = new THREE.Mesh(new THREE.RingGeometry(L.plazaR - 0.16, L.plazaR, 160).rotateX(-Math.PI / 2), M.yellowInlay);
  ringEdge.position.y = 0.007; scene.add(ringEdge);
  const inlay = new THREE.Mesh(symbolFlat(Math.min(6.6, L.plazaR * 0.42)), M.yellowInlay);
  inlay.position.y = 0.008; inlay.receiveShadow = true; scene.add(inlay);

  // Zentrales Podest mit schwebendem 3D-Symbol
  const daisR = 3.1;
  const daisTex = (() => {
    const c = document.createElement('canvas'); c.width = 4096; c.height = 128;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#17181b'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#f0e600'; ctx.font = `700 64px ${FONT}`; ctx.textBaseline = 'middle';
    const txt = tr('ZOLLER  ·  PRODUKTUMGEBUNG 3D  ·  ');
    const w = ctx.measureText(txt).width; for (let x = 0; x < c.width; x += w) ctx.fillText(txt, x, 68);
    return canvasTex(c, renderer);
  })();
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(daisR, daisR + 0.15, 0.55, 96, 1), [
    new THREE.MeshStandardMaterial({ map: daisTex, roughness: 0.5 }), M.dark, M.dark]);
  dais.position.y = 0.275; dais.castShadow = dais.receiveShadow = true; scene.add(dais);
  const daisLed = new THREE.Mesh(new THREE.TorusGeometry(daisR - 0.25, 0.035, 8, 128).rotateX(Math.PI / 2), M.led);
  daisLed.position.y = 0.56; scene.add(daisLed);
  const symbol = zollerSymbol(M.gold, 1.45, 0.3);
  symbol.position.y = 3.6; scene.add(symbol);
  const symbolLight = new THREE.PointLight(0xfff6b0, 25, 9, 2); symbolLight.position.set(0, 2.2, 0); scene.add(symbolLight);

  /* ---------------- Themenwelten ---------------- */
  const signs = [];
  const signGroups = [];
  const flowLines = [];
  const sectorObjs = [];
  const wallTexLoads = [];
  const texLoader = new THREE.TextureLoader();

  function tierMesh(r0, r1, th0, th1, h) {
    const g = new THREE.ExtrudeGeometry(sectorShape(r0, r1, th0, th1), { depth: h, bevelEnabled: false, curveSegments: 72 });
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, [M.tierTop, M.riser]);
    m.castShadow = m.receiveShadow = true;
    return m;
  }

  function floorText(text, sub, r0, r1, th, maxArc) {
    const S = 2, c = document.createElement('canvas'), ctx = c.getContext('2d');
    const f1 = `800 ${120 * S}px ${FONT}`, f2 = `500 ${46 * S}px ${FONT}`;
    ctx.font = f1; const w1 = ctx.measureText(text).width;
    ctx.font = f2; const w2 = ctx.measureText(sub).width;
    c.width = Math.ceil(Math.max(w1, w2) + 40 * S); c.height = 220 * S;
    ctx.fillStyle = 'rgba(23,24,27,0.86)'; ctx.font = f1; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
    ctx.fillText(text, c.width / 2, 130 * S);
    ctx.fillStyle = 'rgba(23,24,27,0.55)'; ctx.font = f2; ctx.fillText(sub, c.width / 2, 200 * S);
    const tex = canvasTex(c, renderer);
    const depth = r1 - r0, arc = Math.min(maxArc, depth * c.width / c.height);
    const half = arc / 2 / ((r0 + r1) / 2);
    const mesh = new THREE.Mesh(arcStrip({ r0, r1, th0: th - half, th1: th + half, y0: 0.011, segs: 40 }),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    mesh.renderOrder = 1;
    return mesh;
  }

  function riserText(text, r, th0, th1, y0, y1) {
    const S = 2, c = document.createElement('canvas'), ctx = c.getContext('2d');
    const H = 64 * S, arc = r * (th1 - th0), h = y1 - y0;
    c.height = H; c.width = Math.min(4096, Math.ceil(H * arc / h));
    ctx.font = `700 ${30 * S}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    let label = text.toUpperCase();
    ctx.letterSpacing = `${3 * S}px`;
    const tw = ctx.measureText(label).width;
    if (tw > c.width - 20) { ctx.font = `700 ${Math.floor(30 * S * (c.width - 20) / tw)}px ${FONT}`; }
    ctx.fillText(label, c.width / 2, H / 2 + 2);
    ctx.fillStyle = '#f0e600'; ctx.fillRect(c.width / 2 - 30 * S, H - 6 * S, 60 * S, 3 * S);
    const tex = canvasTex(c, renderer);
    const m = new THREE.Mesh(arcStrip({ r0: r - 0.012, th0, th1, y0, y1, segs: 32 }),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    return m;
  }

  function wallPoster(sec, r, th0, th1, H, img) {
    const arc = r * (th1 - th0);
    const c = document.createElement('canvas'), ctx = c.getContext('2d');
    c.width = 2048; c.height = Math.round(2048 * H / arc);
    if (c.height > 1024) { c.height = 1024; c.width = Math.round(1024 * arc / H); }
    const W = c.width, Hc = c.height;
    ctx.fillStyle = '#16171a'; ctx.fillRect(0, 0, W, Hc);
    if (img) {
      const s = Math.max(W / img.width, Hc / img.height);
      const iw = img.width * s, ih = img.height * s;
      ctx.globalAlpha = 0.55; ctx.drawImage(img, (W - iw) / 2, (Hc - ih) / 2, iw, ih); ctx.globalAlpha = 1;
    }
    const g = ctx.createLinearGradient(0, 0, 0, Hc);
    g.addColorStop(0, 'rgba(14,15,17,0.85)'); g.addColorStop(0.45, 'rgba(14,15,17,0.35)'); g.addColorStop(1, 'rgba(14,15,17,0.88)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, Hc);
    const unit = Hc / 10;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f0e600'; ctx.font = `800 ${unit * 0.95}px ${FONT}`;
    ctx.fillText(String(sec.index + 1).padStart(2, '0'), W / 2, unit * 1.75);
    let fs = unit * 1.45; ctx.font = `800 ${fs}px ${FONT}`;
    const nw = ctx.measureText(sec.cat.name).width; if (nw > W * 0.9) { fs *= W * 0.9 / nw; ctx.font = `800 ${fs}px ${FONT}`; }
    ctx.fillStyle = '#ffffff'; ctx.fillText(sec.cat.name, W / 2, unit * 1.75 + fs * 1.05);
    let ts = unit * 0.42; ctx.font = `400 ${ts}px ${FONT}`;
    const tw = ctx.measureText(sec.cat.text).width; if (tw > W * 0.9) { ts *= W * 0.9 / tw; ctx.font = `400 ${ts}px ${FONT}`; }
    ctx.fillStyle = 'rgba(255,255,255,0.78)'; ctx.fillText(sec.cat.text, W / 2, unit * 1.75 + fs * 1.05 + ts * 1.7);
    ctx.fillStyle = '#f0e600'; ctx.fillRect(0, Hc - unit * 0.08, W, unit * 0.08);
    const tex = canvasTex(c, renderer);
    const mesh = new THREE.Mesh(arcStrip({ r0: r, th0, th1, y0: 0.0, y1: H, segs: Math.max(24, Math.round(arc)) }),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 }));
    mesh.receiveShadow = true;
    return mesh;
  }

  function hangingSign(sec, r, th, y) {
    const S = 2, c = document.createElement('canvas'), ctx = c.getContext('2d');
    const num = String(sec.index + 1).padStart(2, '0');
    ctx.font = `800 ${86 * S}px ${FONT}`; const w1 = ctx.measureText(sec.cat.name).width;
    const pad = 60 * S, wn = 140 * S;
    c.width = Math.ceil(w1 + wn + pad * 2); c.height = 200 * S;
    ctx.fillStyle = '#17181b'; roundRect(ctx, 0, 0, c.width, c.height, 26 * S); ctx.fill();
    ctx.fillStyle = '#f0e600'; ctx.font = `800 ${86 * S}px ${FONT}`; ctx.textBaseline = 'middle';
    ctx.fillText(num, pad, c.height / 2 + 6 * S);
    ctx.fillStyle = '#ffffff'; ctx.fillText(sec.cat.name, pad + wn, c.height / 2 + 6 * S);
    ctx.fillStyle = '#f0e600'; ctx.fillRect(0, c.height - 10 * S, c.width, 10 * S);
    const tex = canvasTex(c, renderer);
    const h = 1.35, w = h * c.width / c.height;
    const grp = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide, transparent: true });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    grp.add(front);
    const back = front.clone(); back.rotation.y = Math.PI; back.position.z = -0.01; grp.add(back);
    const p = polar(th, r, y); grp.position.copy(p);
    grp.lookAt(0, y, 0);
    const pts = [];
    for (const sx of [-w * 0.42, w * 0.42]) { pts.push(new THREE.Vector3(sx, h / 2, 0), new THREE.Vector3(sx, h / 2 + 7, 0)); }
    grp.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), M.cable));
    grp.userData = { type: 'sign', sector: sec.id };
    front.userData = back.userData = grp.userData;
    signs.push(front, back);
    signGroups.push({ grp, mat, cable: grp.children[2] });
    return grp;
  }

  for (const sec of L.sectors) {
    const pad = 0.9 / L.rIn;
    const a0 = sec.th0 - pad, a1 = sec.th1 + pad;
    const g = new THREE.Group(); g.userData.sector = sec.id;
    const tIn = tierMesh(L.tierIn[0], L.tierIn[1], a0, a1, TIER[0]);
    const tOut = tierMesh(L.tierOut[0], L.tierOut[1], a0 - 0.15 / L.rIn, a1 + 0.15 / L.rIn, TIER[1]);
    g.add(tIn, tOut); pickFloor.push(tIn, tOut);
    for (const [rr, y] of [[L.tierIn[0] + 0.07, TIER[0]], [L.tierOut[0] + 0.07, TIER[1]]]) {
      const led = new THREE.Mesh(new THREE.RingGeometry(rr - 0.03, rr + 0.03, 128, 1, Math.PI / 2 - a1, a1 - a0).rotateX(-Math.PI / 2), M.led);
      led.position.y = y + 0.003; g.add(led);
    }
    // Unterkategorien auf der Stufe zur oberen Reihe
    const subs = sec.cat.subs;
    if (sec.items.length > 3 || subs.length > 1) {
      subs.forEach((sub) => {
        const its = sec.items.filter((p) => p.sub === sub);
        const t0 = Math.min(...its.map((p) => p._th)) - 0.9 / L.rIn, t1 = Math.max(...its.map((p) => p._th)) + 0.9 / L.rIn;
        const mid = (t0 + t1) / 2, half = Math.max((t1 - t0) / 2, 2.4 / L.rIn);
        g.add(riserText(sub, L.tierOut[0] - 0.006, mid - half, mid + half, TIER[0] + 0.05, TIER[1] - 0.04));
      });
    } else {
      g.add(riserText(subs[0], L.tierOut[0] - 0.006, sec.mid - 3 / L.rIn, sec.mid + 3 / L.rIn, TIER[0] + 0.05, TIER[1] - 0.04));
    }
    // Bodenbeschriftung am Platz
    const num = String(sec.index + 1).padStart(2, '0');
    g.add(floorText(`${num}  ${sec.cat.name.toUpperCase()}`, `${sec.items.length} ${sec.items.length === 1 ? tr('Produkt') : tr('Produkte')}`,
      L.rIn - 5.6, L.rIn - 3.6, sec.mid, (sec.th1 - sec.th0) * (L.rIn - 4.6) * 0.92));
    // Rückwand mit Motiv
    const wallH = 6.4;
    const wall = wallPoster(sec, L.wallR, a0 - 0.2 / L.rIn, a1 + 0.2 / L.rIn, wallH, null);
    g.add(wall);
    if (sec.cat.wall) {
      wallTexLoads.push(new Promise((res) => {
        const im = new Image(); im.decoding = 'async';
        im.onload = () => { const nw = wallPoster(sec, L.wallR, a0 - 0.2 / L.rIn, a1 + 0.2 / L.rIn, wallH, im); wall.material.map.dispose(); wall.material.dispose(); wall.material = nw.material; nw.geometry.dispose(); res(); };
        im.onerror = res; im.src = base + sec.cat.wall;
      }));
    }
    const wallBack = new THREE.Mesh(arcStrip({ r0: L.wallR + 0.35, th0: a0 - 0.2 / L.rIn, th1: a1 + 0.2 / L.rIn, y0: 0, y1: wallH, segs: 48 }), new THREE.MeshStandardMaterial({ color: 0xdcdee1, roughness: 0.9, side: THREE.DoubleSide }));
    wallBack.castShadow = true; g.add(wallBack);
    const wallCap = new THREE.Mesh(new THREE.RingGeometry(L.wallR, L.wallR + 0.35, 96, 1, Math.PI / 2 - (a1 + 0.2 / L.rIn), (a1 - a0) + 0.4 / L.rIn).rotateX(-Math.PI / 2), M.led);
    wallCap.position.y = wallH; g.add(wallCap);
    // Hängendes Schild
    g.add(hangingSign(sec, L.rIn + ROW_GAP * 0.5, sec.mid, 7.3));
    scene.add(g);
    sectorObjs.push(g);
  }

  // Glasbrüstungen zwischen den Rückwänden schließen den Ausstellungsbereich
  L.sectors.forEach((sec, i) => {
    const next = L.sectors[(i + 1) % L.sectors.length];
    const g0 = sec.th1 + 1.15 / L.rIn;
    let g1 = next.th0 - 1.15 / L.rIn; if (g1 < g0) g1 += TAU;
    if (g1 - g0 < 0.002) return;
    const glass = new THREE.Mesh(arcStrip({ r0: L.wallR + 0.15, th0: g0, th1: g1, y0: 0, y1: 1.1, segs: 12 }), M.glass);
    const rail = new THREE.Mesh(arcStrip({ r0: L.wallR + 0.05, r1: L.wallR + 0.25, th0: g0, th1: g1, y0: 1.1, segs: 12 }),
      new THREE.MeshBasicMaterial({ color: YELLOW, toneMapped: false, side: THREE.DoubleSide }));
    scene.add(glass, rail);
    for (const th of [g0, g1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.14, 0.12), M.dark);
      post.position.copy(polar(th, L.wallR + 0.15, 0.57)); post.castShadow = true; scene.add(post);
    }
  });

  /* ---------------- Wegweiser-Stelen am Platz ---------------- */
  const dashTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 16;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#f0e600'; ctx.fillRect(0, 0, 40, 16);
    const t = canvasTex(c, renderer); t.wrapS = THREE.RepeatWrapping; return t;
  })();
  for (const sec of L.sectors) {
    const S = 2, c = document.createElement('canvas'), ctx = c.getContext('2d');
    c.width = 300 * S; c.height = 640 * S;
    ctx.fillStyle = '#17181b'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#f0e600'; ctx.fillRect(0, 0, c.width, 14 * S);
    ctx.font = `800 ${150 * S}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(sec.index + 1).padStart(2, '0'), 30 * S, 190 * S);
    ctx.fillStyle = '#ffffff';
    const words = sec.cat.name.split(/\s+/); let lines = [], cur = '';
    let fs = 50 * S; ctx.font = `800 ${fs}px ${FONT}`;
    for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (ctx.measureText(t).width > c.width - 60 * S && cur) { lines.push(cur); cur = w; } else cur = t; }
    lines.push(cur);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (widest > c.width - 60 * S) { fs *= (c.width - 60 * S) / widest; ctx.font = `800 ${fs}px ${FONT}`; }
    lines.forEach((l, i) => ctx.fillText(l, 30 * S, 290 * S + i * fs * 1.1));
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = `500 ${30 * S}px ${FONT}`;
    ctx.fillText(`${sec.items.length} ${sec.items.length === 1 ? tr('Produkt') : tr('Produkte')}`, 30 * S, 300 * S + lines.length * fs * 1.1 + 30 * S);
    ctx.strokeStyle = '#f0e600'; ctx.lineWidth = 10 * S; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const ax = c.width / 2, ay = 560 * S;
    ctx.beginPath(); ctx.moveTo(ax, ay + 40 * S); ctx.lineTo(ax, ay - 40 * S); ctx.moveTo(ax - 30 * S, ay - 10 * S); ctx.lineTo(ax, ay - 40 * S); ctx.lineTo(ax + 30 * S, ay - 10 * S); ctx.stroke();
    const tex = canvasTex(c, renderer);
    const pw = 1.05, ph = pw * c.height / c.width;
    const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, 0.22), [M.dark, M.dark, M.led, M.dark, face, face]);
    const pr = daisR + 3.4, pos = polar(sec.mid, pr, ph / 2 + 0.02);
    box.position.copy(pos); box.lookAt(0, pos.y, 0); box.castShadow = true;
    box.userData = { type: 'sign', sector: sec.id }; signs.push(box);
    scene.add(box);
    const len = L.plazaR - pr - 1.4;
    const line = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: dashTex.clone(), transparent: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    line.material.map.repeat.set(len / 0.9, 1); line.material.map.needsUpdate = true;
    const mid = polar(sec.mid, pr + 0.9 + len / 2, 0.012); line.position.copy(mid); line.rotation.y = Math.PI / 2 - sec.mid; line.renderOrder = 1;
    scene.add(line); flowLines.push(line);
  }

  /* ---------------- Exponate ---------------- */
  const blobTex = canvasTex(blobTexture(), renderer);
  const proxies = [];
  const exhibits = [];
  const ringGeo = new THREE.RingGeometry(1, 1.06, 96).rotateX(-Math.PI / 2);
  const loadQueue = [];
  const hd = new Map();

  function makeExhibit(p) {
    const m = p.m;
    const root = new THREE.Group(); root.position.copy(p.pos); root.userData.product = p.id;
    const faceIn = Math.atan2(-p.pos.x, -p.pos.z); // Blick zur Mitte
    const ex = { p, root, hover: 0, sel: 0, dim: 0, bob: Math.random() * TAU, ringMat: M.led.clone(), labelScale: 1 };
    ex.ringMat.transparent = true; ex.ringMat.opacity = 0.75;

    let baseY = 0;
    if (p.kind === 'machine') {
      const pl = new THREE.Mesh(new THREE.CylinderGeometry(m.plinth, m.plinth + 0.03, 0.1, 64), M.white);
      pl.position.y = 0.05; pl.castShadow = pl.receiveShadow = true; root.add(pl);
      const ring = new THREE.Mesh(ringGeo, ex.ringMat); ring.scale.setScalar(m.plinth + 0.05); ring.position.y = 0.004; root.add(ring);
      ex.ring = ring; baseY = 0.1;
    } else if (p.kind === 'pedestal' || p.kind === 'vitrine') {
      const top = Math.max(0.8, m.W * 0.8), col = new THREE.Mesh(new THREE.BoxGeometry(top, m.base, top * 0.75), M.white);
      col.position.y = m.base / 2; col.rotation.y = faceIn; col.castShadow = col.receiveShadow = true; root.add(col);
      const capG = new THREE.BoxGeometry(top + 0.04, 0.035, top * 0.75 + 0.04);
      const cap = new THREE.Mesh(capG, M.dark); cap.position.y = m.base - 0.017; cap.rotation.y = faceIn; root.add(cap);
      const ring = new THREE.Mesh(ringGeo, ex.ringMat); ring.scale.setScalar(top * 0.78); ring.position.y = 0.004; root.add(ring);
      ex.ring = ring; baseY = m.base;
      if (p.kind === 'vitrine') {
        const gw = top + 0.02, gh = m.H + 0.25;
        const box = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, top * 0.75 + 0.02), M.glass);
        box.position.y = m.base + gh / 2; box.rotation.y = faceIn; root.add(box);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: 0x9aa0a6 }));
        edges.position.copy(box.position); edges.rotation.y = faceIn; root.add(edges);
      }
    } else if (p.kind === 'software' || p.kind === 'package') {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(m.plinth, m.plinth + 0.04, 0.06, 64), M.dark);
      disc.position.y = 0.03; disc.castShadow = disc.receiveShadow = true; root.add(disc);
      const ring = new THREE.Mesh(ringGeo, ex.ringMat); ring.scale.setScalar(m.plinth - 0.08); ring.position.y = 0.062; root.add(ring);
      ex.ring = ring;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(m.plinth * 0.55, m.plinth * 0.85, m.base + m.H * 0.4, 48, 1, true), beamMaterial());
      beam.position.y = (m.base + m.H * 0.4) / 2 + 0.06; root.add(beam); ex.beam = beam;
      baseY = m.base;
    } else if (p.kind === 'screen') {
      const frameW = m.W + 0.12, frameH = m.H + 0.12;
      const holder = new THREE.Group(); holder.rotation.y = faceIn; root.add(holder);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.7), M.dark); foot.position.y = 0.03; foot.castShadow = true; holder.add(foot);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, m.base + frameH * 0.5, 0.12), M.dark); post.position.set(0, (m.base + frameH * 0.5) / 2, -0.08); post.castShadow = true; holder.add(post);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(frameW, frameH, 0.08), M.dark); frame.position.set(0, m.base + frameH / 2, 0); frame.castShadow = true; holder.add(frame);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(m.W, m.H), new THREE.MeshBasicMaterial({ color: 0x222222, toneMapped: false }));
      scr.position.set(0, m.base + frameH / 2, 0.041); holder.add(scr);
      const ring = new THREE.Mesh(ringGeo, ex.ringMat); ring.scale.setScalar(1.25); ring.position.y = 0.004; root.add(ring);
      ex.ring = ring; ex.screen = scr; ex.holder = holder;
      loadQueue.push({ ex, url: `${base}img/p/${p.id}.webp`, screen: true });
    }

    if (p.kind !== 'screen') {
      const yaw = new THREE.Group(); yaw.position.y = baseY; root.add(yaw);
      const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, opacity: p.kind === 'software' || p.kind === 'package' ? 0 : 0.85 }));
      blob.scale.set(m.W * 0.95, 1, Math.max(0.5, m.W * 0.32)); blob.position.y = 0.003; blob.renderOrder = 1; yaw.add(blob);
      const tilt = new THREE.Group(); yaw.add(tilt);
      const geo = new THREE.PlaneGeometry(m.W, m.H); geo.translate(0, m.H / 2, 0);
      const mat = new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false, opacity: 0, side: THREE.DoubleSide });
      const card = new THREE.Mesh(geo, mat); card.renderOrder = 2; tilt.add(card);
      ex.yaw = yaw; ex.tilt = tilt; ex.card = card; ex.blob = blob;
      if (p.kind === 'package') {
        const t = canvasTex(packageCanvas(p.tier, p.name), renderer);
        mat.map = t; mat.opacity = 1; mat.needsUpdate = true;
      } else {
        loadQueue.push({ ex, url: `${base}img/p/${p.id}.webp` });
      }
    }

    // Beschriftung
    const lc = labelCanvas(p.name.replace(/­/g, ''), p.sub, p.badge);
    const lt = canvasTex(lc.canvas, renderer);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: lt, transparent: true, depthWrite: false, toneMapped: false, sizeAttenuation: true }));
    const lh = 0.46; label.scale.set(lh * lc.aspect, lh, 1); label.center.set(0.5, 0);
    const topY = (p.kind === 'screen' ? m.base + m.H + 0.12 : baseY + m.H) + 0.22;
    label.position.y = topY; label.renderOrder = 5; root.add(label);
    ex.label = label; ex.labelBase = { w: lh * lc.aspect, h: lh, y: topY };

    // Trefferfläche
    const pr = Math.max(m.W / 2, m.plinth || 0.6) + 0.15;
    const prH = (p.kind === 'screen' ? m.base + m.H + 0.12 : baseY + m.H) + 0.2;
    const proxy = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr, prH, 16), new THREE.MeshBasicMaterial({ visible: false }));
    proxy.position.y = prH / 2; proxy.userData = { type: 'product', id: p.id }; root.add(proxy);
    proxies.push(proxy);
    ex.radius = pr; ex.topY = prH;

    scene.add(root);
    exhibits.push(ex);
    p.ex = ex;
    return ex;
  }

  function beamMaterial() {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(YELLOW) }, uStrength: { value: 0.28 }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 uColor; uniform float uStrength; uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float edge=1.0-abs(dot(vN,vV)); float fade=pow(1.0-vUv.y,1.4); float scan=0.85+0.15*sin(vUv.y*40.0-uTime*3.0); gl_FragColor=vec4(uColor*uStrength*fade*(0.35+edge)*scan,1.0); }',
    });
  }

  products.forEach(makeExhibit);

  // Auswahl-Lichtkegel
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 1.0, 1, 48, 1, true), beamMaterial());
  cone.material.uniforms.uColor.value.set(0xfff8c8); cone.material.uniforms.uStrength.value = 0;
  scene.add(cone);
  const spot = new THREE.SpotLight(0xfff6d0, 0, 18, 0.42, 0.65, 1.6); spot.position.set(0, 9, 0); scene.add(spot, spot.target);

  /* ---------------- Licht ---------------- */
  const hemi = new THREE.HemisphereLight(0xffffff, 0xcfd2d6, 1.55); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.65);
  sun.position.set(24, 46, 30); sun.castShadow = true;
  const sr = L.wallR + 3;
  Object.assign(sun.shadow.camera, { left: -sr, right: sr, top: sr, bottom: -sr, near: 5, far: 140 });
  sun.shadow.mapSize.set(mobile ? 2048 : 4096, mobile ? 2048 : 4096);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; sun.shadow.radius = 4;
  scene.add(sun);

  /* ---------------- Texturen laden ---------------- */
  const total = loadQueue.length + wallTexLoads.length;
  let done = 0;
  const tick = () => { done++; onProgress(done / total); };
  wallTexLoads.forEach((p) => p.then(tick));
  function applyTex(job, tex) {
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Math.min(8, maxAniso);
    if (job.screen) { job.ex.screen.material.map = tex; job.ex.screen.material.color.set(0xffffff); job.ex.screen.material.needsUpdate = true; }
    else { job.ex.card.material.map = tex; job.ex.card.material.needsUpdate = true; job.ex.lowTex = tex; }
  }
  await Promise.all([...loadQueue.map((job) => texLoader.loadAsync(job.url).then((t) => { applyTex(job, t); tick(); }).catch(tick)), ...wallTexLoads]);

  renderer.shadowMap.needsUpdate = true;

  /* ---------------- Hochauflösende Texturen bei Fokus ---------------- */
  async function loadHD(p) {
    if (!p || p.kind === 'package' || !p.ex) return;
    if (hd.has(p.id)) { const e = hd.get(p.id); hd.delete(p.id); hd.set(p.id, e); return; }
    hd.set(p.id, null);
    try {
      const t = await texLoader.loadAsync(`${base}img/hd/${p.id}.webp`);
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
      if (!hd.has(p.id)) { t.dispose(); return; }
      hd.set(p.id, t);
      const target = p.kind === 'screen' ? p.ex.screen.material : p.ex.card.material;
      target.map = t; target.needsUpdate = true;
      while (hd.size > 8) {
        const [oldId, oldT] = hd.entries().next().value; hd.delete(oldId);
        const op = byId.get(oldId);
        if (op && oldT) {
          const om = op.kind === 'screen' ? op.ex.screen.material : op.ex.card.material;
          if (op.ex.lowTex || op.kind === 'screen') { om.map = op.ex.lowTex || om.map; om.needsUpdate = true; }
          if (om.map !== oldT) oldT.dispose();
        }
      }
    } catch (e) { hd.delete(p.id); }
  }
  products.filter((p) => p.kind === 'screen').forEach((p) => { p.ex.lowTex = p.ex.screen.material.map; });

  /* =================================================================
     Kamera-Steuerung: Orbit (Standard) und Begehen (Ego-Perspektive)
     ================================================================= */
  const ctl = {
    mode: 'orbit',
    target: new THREE.Vector3(0, 0, -2), r: 120, th: 0.0, ph: 0.9,       // aktueller Zustand
    tTarget: new THREE.Vector3(0, 0, -2), tR: 120, tTh: 0.0, tPh: 0.9,   // Ziel (gedämpft)
    walk: { pos: new THREE.Vector3(0, WALK_EYE, L.plazaR - 2), yaw: 0, pitch: -0.05, tYaw: 0, tPitch: -0.05, goal: null, vel: new THREE.Vector3() },
    flight: null,
    vo: { x: 0, y: 0 }, tvo: { x: 0, y: 0 },
  };
  const keys = new Set();
  let W = 1, H = 1;

  const overviewPose = () => {
    const aw = W - Math.abs(ctl.tvo.x), ah = H - ctl.tvo.y, aspect = aw / ah;
    const vfov = THREE.MathUtils.degToRad(camera.fov), hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    if (aspect < 1) {
      const r = (L.wallR + 2) / Math.tan(hfov / 2) * 1.16;
      return { target: new THREE.Vector3(0, 0, -3), r, th: 0, ph: 0.5 };
    }
    return { target: new THREE.Vector3(0, 0, 1.5), r: L.wallR * 2.45 * Math.max(1, 1.3 / aspect), th: 0, ph: 0.7 };
  };

  let stopsCache = null, stopsKey = '';
  function cinemaStops() {
    const key = `${W}x${H}x${ctl.tvo.x}x${ctl.tvo.y}`;
    if (stopsCache && stopsKey === key) return stopsCache;
    const ov = overviewPose();
    const stops = [{ target: ov.target.clone(), r: ov.r * 1.02, th: 0, ph: 0.62 }];
    L.sectors.forEach((sec) => {
      const p = poseForSector(sec);
      stops.push({ target: p.target, r: p.r * 0.9, th: -sec.mid, ph: 1.2 });
    });
    stops.push({ target: ov.target.clone(), r: ov.r * 1.02, th: -TAU, ph: 0.72 });
    stopsCache = stops; stopsKey = key;
    return stops;
  }

  function orbitPos(target, r, th, ph, out = new THREE.Vector3()) {
    return out.set(target.x + r * Math.sin(ph) * Math.sin(th), target.y + r * Math.cos(ph), target.z + r * Math.sin(ph) * Math.cos(th));
  }

  function poseForSector(sec) {
    const span = sec.th1 - sec.th0;
    const few = sec.items.length <= 3;
    const arcW = few ? sec.items.reduce((a, p) => a + p.m.foot, 0) + 2.5 : 2 * Math.sin(Math.min(span, Math.PI * 0.9) / 2) * (L.rOut + 1.5) + 3;
    const fovH = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * Math.max(0.6, (W - Math.abs(ctl.tvo.x)) / (H - ctl.tvo.y)));
    const dist = clamp((arcW / 2) / Math.tan(fovH / 2) * 0.95 + (few ? 0 : span * 4), few ? 8.5 : 13, 36);
    const target = polar(sec.mid, few ? L.rOut - 1.2 : L.rIn + ROW_GAP * 0.45, few ? 1.6 : 1.3);
    return { target, r: dist, th: -sec.mid, ph: 1.12 };
  }

  function poseForProduct(p) {
    const m = p.m, base = p.kind === 'screen' ? m.base : (p.kind === 'machine' ? 0.1 : m.base);
    const target = p.pos.clone(); target.y += base + m.H * 0.55;
    const aspect = Math.max(0.55, (W - Math.abs(ctl.tvo.x)) / (H - ctl.tvo.y));
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const hFrac = (H - ctl.tvo.y) / H;
    const needH = (m.H + 1.7) / (2 * Math.tan(vfov / 2) * hFrac);
    const needW = (m.W + 2.4) / (2 * Math.tan(vfov / 2) * aspect * hFrac);
    const dist = clamp(Math.max(needH, needW) * 1.18, 4.2, 16);
    return { target, r: dist, th: -p._th, ph: 1.32 };
  }

  function startFlight(to, dur) {
    const from = { target: ctl.target.clone(), r: ctl.r, th: ctl.th, ph: ctl.ph };
    const dist = from.target.distanceTo(to.target);
    const dth = angDiff(from.th, to.th);
    dur = dur ?? clamp(0.9 + dist * 0.025 + Math.abs(dth) * 0.25, 1.0, 2.6);
    ctl.flight = { from, to, dth, t: 0, dur, bump: clamp(dist * 0.32, 0, 30) * (Math.abs(dth) > 0.9 ? 1 : 0.6) };
  }

  function updateFlight(dt) {
    const f = ctl.flight; if (!f) return;
    f.t = Math.min(1, f.t + dt / f.dur);
    const e = easeInOut(f.t);
    ctl.target.lerpVectors(f.from.target, f.to.target, e);
    ctl.r = lerp(f.from.r, f.to.r, e) + Math.sin(Math.PI * e) * f.bump;
    ctl.th = f.from.th + f.dth * e;
    ctl.ph = lerp(f.from.ph, f.to.ph, e) - Math.sin(Math.PI * e) * 0.12;
    ctl.tTarget.copy(ctl.target); ctl.tR = ctl.r; ctl.tTh = ctl.th; ctl.tPh = ctl.ph;
    if (f.t >= 1) { ctl.flight = null; ctl.tR = f.to.r; ctl.tPh = f.to.ph; f.onEnd?.(); }
  }

  // Übergang Orbit ↔ Begehen über Kamerapose
  let poseFlight = null;
  function flyPose(toPos, toLook, dur, onEnd) {
    const fromPos = camera.position.clone();
    const fromLook = new THREE.Vector3(); camera.getWorldDirection(fromLook); fromLook.multiplyScalar(10).add(fromPos);
    poseFlight = { fromPos, fromLook, toPos, toLook, t: 0, dur, onEnd };
  }

  function enterWalk(at) {
    if (ctl.mode === 'walk') return;
    ctl.flight = null;
    let pos, look;
    if (at) { pos = at.pos; look = at.look; }
    else {
      const sel = selected ? byId.get(selected) : null;
      if (sel) {
        const dir = sel.pos.clone().setY(0).normalize();
        pos = sel.pos.clone().setY(0).sub(dir.clone().multiplyScalar(sel.m.foot * 0.5 + 3.2));
        look = sel.pos.clone().setY(1.2);
      } else {
        const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0;
        if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
        fwd.normalize();
        pos = fwd.clone().multiplyScalar(-(L.plazaR - 3.5)); pos.y = 0;
        look = fwd.clone().multiplyScalar(L.rIn).setY(1.4);
      }
    }
    pos.y = groundAt(pos.x, pos.z) + WALK_EYE;
    ctl.mode = 'walk-in';
    flyPose(pos, look, 1.8, () => {
      ctl.mode = 'walk';
      ctl.walk.pos.copy(pos);
      const d = look.clone().sub(pos);
      ctl.walk.yaw = ctl.walk.tYaw = Math.atan2(-d.x, -d.z);
      ctl.walk.pitch = ctl.walk.tPitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
      ctl.walk.goal = null;
    });
    emit('mode', 'walk');
  }

  function exitWalk(toPose) {
    if (ctl.mode === 'orbit') return;
    const pose = toPose || (() => {
      const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
      const t = camera.position.clone().add(fwd.multiplyScalar(9)); t.y = 1.2;
      const o = camera.position.clone().sub(t);
      return { target: t, r: 16, th: Math.atan2(o.x, o.z), ph: 1.05 };
    })();
    ctl.mode = 'walk-out';
    const pos = orbitPos(pose.target, pose.r, pose.th, pose.ph);
    flyPose(pos, pose.target.clone(), 1.5, () => {
      ctl.mode = 'orbit';
      ctl.target.copy(pose.target); ctl.tTarget.copy(pose.target);
      ctl.r = ctl.tR = pose.r; ctl.th = ctl.tTh = pose.th; ctl.ph = ctl.tPh = pose.ph;
    });
    emit('mode', 'orbit');
  }

  function groundAt(x, z) {
    const r = Math.hypot(x, z), th = thetaOf(x, z);
    for (const s of L.sectors) {
      const pad = 0.9 / L.rIn;
      if (angDiff(s.th0 - pad, th) >= 0 && angDiff(th, s.th1 + pad) >= 0) {
        if (r >= L.tierOut[0] && r <= L.tierOut[1]) return TIER[1];
        if (r >= L.tierIn[0] && r < L.tierIn[1]) return TIER[0];
      }
    }
    return 0;
  }

  function collide(pos) {
    const r = Math.hypot(pos.x, pos.z);
    if (r < daisR + 0.7) { const k = (daisR + 0.7) / Math.max(r, 1e-3); pos.x *= k; pos.z *= k; }
    if (r > ZONE.walk) { const k = ZONE.walk / r; pos.x *= k; pos.z *= k; if (ctl.mode === 'walk') hitLimit('walk'); }
    for (const ex of exhibits) {
      const dx = pos.x - ex.root.position.x, dz = pos.z - ex.root.position.z, d = Math.hypot(dx, dz), min = ex.radius + 0.45;
      if (d < min && d > 1e-4) { pos.x = ex.root.position.x + dx / d * min; pos.z = ex.root.position.z + dz / d * min; }
    }
  }

  /* ---------------- Eingabe ---------------- */
  const pointers = new Map();
  let dragDist = 0, pinch0 = 0, lastPinchMid = null;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hovered = null, selected = null, hoverDirty = false, lastPointer = null;

  function setNdc(x, y) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
  }

  function pick(x, y, withFloor = false) {
    setNdc(x, y);
    raycaster.setFromCamera(ndc, camera);
    const list = withFloor ? [...proxies, ...signs, ...pickFloor] : [...proxies, ...signs];
    const hits = raycaster.intersectObjects(list, false);
    for (const h of hits) {
      const ud = h.object.userData;
      if (ud.type === 'product') {
        const p = byId.get(ud.id);
        if (p.ex.dim > 0.5) continue;
        return { type: 'product', id: ud.id, point: h.point };
      }
      if (ud.type === 'sign') return { type: 'sign', sector: ud.sector, point: h.point };
      if (withFloor) return { type: 'floor', point: h.point };
    }
    return null;
  }

  function cancelAutomation() {
    if (ctl.flight) { ctl.flight = null; }
    emit('interact');
  }

  canvas.addEventListener('pointerdown', (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetisches Ereignis */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, shift: e.shiftKey });
    dragDist = 0;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y); lastPinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    lastPointer = { x: e.clientX, y: e.clientY };
    const pt = pointers.get(e.pointerId);
    if (!pt) { hoverDirty = true; return; }
    const dx = e.clientX - pt.x, dy = e.clientY - pt.y;
    pt.x = e.clientX; pt.y = e.clientY;
    dragDist += Math.abs(dx) + Math.abs(dy);
    if (dragDist > 4) { cancelAutomation(); canvas.classList.add('is-dragging'); }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (ctl.mode === 'orbit') {
        if (pinch0 > 0) zoomBy(pinch0 / d, mid.x, mid.y);
        pan(mid.x - lastPinchMid.x, mid.y - lastPinchMid.y);
      } else if (ctl.mode === 'walk' && pinch0 > 0) {
        const fwd = new THREE.Vector3(-Math.sin(ctl.walk.yaw), 0, -Math.cos(ctl.walk.yaw));
        ctl.walk.pos.addScaledVector(fwd, (d - pinch0) * 0.03); ctl.walk.goal = null;
      }
      pinch0 = d; lastPinchMid = mid;
      return;
    }
    if (ctl.mode === 'orbit') {
      if (pt.button === 2 || pt.button === 1 || pt.shift) pan(dx, dy);
      else { ctl.tTh -= dx * 0.0052; ctl.tPh = clamp(ctl.tPh - dy * 0.0042, 0.18, 1.5); }
    } else if (ctl.mode === 'walk') {
      ctl.walk.tYaw += dx * 0.0042; ctl.walk.tPitch = clamp(ctl.walk.tPitch + dy * 0.0036, -1.1, 1.1);
      ctl.walk.goal = null;
    }
  });

  function endPointer(e) {
    const pt = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch0 = 0;
    canvas.classList.remove('is-dragging');
    if (!pt || dragDist > 6 || e.type === 'pointercancel') return;
    if (pt.button !== 0) return;
    const hit = pick(e.clientX, e.clientY, ctl.mode === 'walk');
    if (!hit) { emit('background'); return; }
    if (hit.type === 'product') emit('select', hit.id);
    else if (hit.type === 'sign') emit('sector', hit.sector);
    else if (hit.type === 'floor' && ctl.mode === 'walk') {
      const g = hit.point.clone(); g.y = 0;
      ctl.walk.goal = g; emit('interact');
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => { lastPointer = null; hoverDirty = true; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    cancelAutomation();
    let dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
    dy = clamp(dy, -260, 260);
    if (ctl.mode === 'orbit') {
      // ctrlKey = Trackpad-Pinch (kleine Werte) → stärker gewichten
      zoomBy(Math.exp(dy * (e.ctrlKey ? 0.012 : 0.0019)), e.clientX, e.clientY);
    } else if (ctl.mode === 'walk') {
      walkStep(-dy * (e.ctrlKey ? 0.06 : 0.014));
    }
  }, { passive: false });

  canvas.addEventListener('dblclick', (e) => {
    if (ctl.mode !== 'orbit') return;
    const hit = pick(e.clientX, e.clientY, true);
    if (!hit || hit.type !== 'floor') return;
    const t = hit.point.clone(); t.y = clamp(t.y + 1, 0.8, 2);
    clampTarget(t);
    startFlight({ target: t, r: clamp(ctl.r * 0.45, 7, 30), th: ctl.th, ph: Math.min(ctl.ph, 1.2) }, 1.1);
  });

  /* ---------------- Zoom & Zone ---------------- */
  const ZONE = { target: L.wallR - 2.5, walk: L.wallR - 0.9, rMin: 2.6 };
  const rMax = () => overviewPose().r * 1.18;
  let lastLimit = 0;
  function hitLimit(kind) {
    const now = performance.now();
    if (now - lastLimit > 2200) { lastLimit = now; emit('limit', kind); }
  }
  function clampTarget(v) {
    const r = Math.hypot(v.x, v.z);
    v.y = clamp(v.y, 0, 4);
    if (r > ZONE.target) { v.x *= ZONE.target / r; v.z *= ZONE.target / r; return true; }
    return false;
  }
  function floorPoint(x, y) {
    setNdc(x, y);
    raycaster.setFromCamera(ndc, camera);
    const h = raycaster.intersectObjects([...proxies, ...pickFloor], false)[0];
    return h ? h.point : null;
  }
  function zoomBy(f, x, y) {
    if (ctl.mode !== 'orbit') return;
    const old = ctl.tR, max = rMax();
    const nr = clamp(old * f, ZONE.rMin, max);
    if (f > 1 && old >= max - 0.05) { hitLimit('zoom'); return; }
    if (Math.abs(nr - old) < 1e-4) return;
    if (x != null) {
      const pt = floorPoint(x, y);
      if (pt) {
        const k = 1 - nr / old; // >0 beim Hineinzoomen: Ziel wandert zum Mauszeiger
        ctl.tTarget.x += (pt.x - ctl.tTarget.x) * k;
        ctl.tTarget.z += (pt.z - ctl.tTarget.z) * k;
        if (k > 0) ctl.tTarget.y += (clamp(pt.y + 0.8, 0, 3) - ctl.tTarget.y) * k;
      }
    }
    ctl.tR = nr;
    if (clampTarget(ctl.tTarget)) hitLimit('pan');
  }
  function walkStep(d) {
    const fwd = new THREE.Vector3(-Math.sin(ctl.walk.yaw), 0, -Math.cos(ctl.walk.yaw));
    ctl.walk.pos.addScaledVector(fwd, d); ctl.walk.goal = null;
  }

  function pan(dx, dy) {
    const k = ctl.tR * 0.0016;
    const right = new THREE.Vector3(Math.cos(ctl.th), 0, -Math.sin(ctl.th));
    const fwd = new THREE.Vector3(-Math.sin(ctl.th), 0, -Math.cos(ctl.th));
    ctl.tTarget.addScaledVector(right, -dx * k).addScaledVector(fwd, dy * k);
    if (clampTarget(ctl.tTarget)) hitLimit('pan');
  }

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof Element && e.target.closest('input, select, textarea')) return;
    const k = e.key.toLowerCase();
    if (ctl.mode === 'walk' && ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'q', 'e'].includes(k)) {
      keys.add(k); ctl.walk.goal = null; emit('interact'); e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  /* ---------------- Ereignisse ---------------- */
  const listeners = {};
  function emit(type, ...args) { (listeners[type] || []).forEach((f) => f(...args)); }

  /* ---------------- Größe ---------------- */
  function resize() {
    W = canvas.clientWidth || window.innerWidth; H = canvas.clientHeight || window.innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.fov = W < 700 ? 58 : 50;
    applyViewOffset();
  }
  function applyViewOffset() {
    if (Math.abs(ctl.vo.x) > 0.5 || Math.abs(ctl.vo.y) > 0.5) camera.setViewOffset(W, H, ctl.vo.x / 2, ctl.vo.y / 2, W, H);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  /* ---------------- Auswahl & Hervorhebung ---------------- */
  let filterSet = null;
  function setSelected(id) {
    selected = id;
    const p = id ? byId.get(id) : null;
    if (p) loadHD(p);
  }

  /* ---------------- Render-Schleife ---------------- */
  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3();
  let started = false;
  let activeSector = null;

  let running = true, looping = false;
  function frame() {
    if (!running) { looping = false; return; }
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;

    // Kamera
    if (poseFlight) {
      const f = poseFlight; f.t = Math.min(1, f.t + dt / f.dur); const e = easeInOut(f.t);
      camera.position.lerpVectors(f.fromPos, f.toPos, e); camera.position.y += Math.sin(Math.PI * e) * 2.5 * (f.toPos.distanceTo(f.fromPos) > 8 ? 1 : 0);
      tmp.lerpVectors(f.fromLook, f.toLook, e); camera.lookAt(tmp);
      if (f.t >= 1) { poseFlight = null; f.onEnd?.(); }
    } else if (ctl.mode === 'orbit') {
      updateFlight(dt);
      if (!ctl.flight) {
        const kd = cinematic ? 3.2 : 7, ka = cinematic ? 3.2 : 9;
        ctl.target.x = damp(ctl.target.x, ctl.tTarget.x, kd, dt); ctl.target.y = damp(ctl.target.y, ctl.tTarget.y, kd, dt); ctl.target.z = damp(ctl.target.z, ctl.tTarget.z, kd, dt);
        ctl.r = damp(ctl.r, ctl.tR, kd, dt); ctl.th = damp(ctl.th, ctl.tTh, ka, dt); ctl.ph = damp(ctl.ph, ctl.tPh, ka, dt);
      }
      orbitPos(ctl.target, ctl.r, ctl.th, ctl.ph, camera.position);
      if (camera.position.y < 0.6) camera.position.y = 0.6;
      camera.lookAt(ctl.target);
    } else if (ctl.mode === 'walk') {
      const w = ctl.walk;
      let fx = 0, sx = 0;
      if (keys.has('w') || keys.has('arrowup')) fx += 1;
      if (keys.has('s') || keys.has('arrowdown')) fx -= 1;
      if (keys.has('a')) sx -= 1;
      if (keys.has('d')) sx += 1;
      if (keys.has('arrowleft') || keys.has('q')) w.tYaw += dt * 1.6;
      if (keys.has('arrowright') || keys.has('e')) w.tYaw -= dt * 1.6;
      const speed = keys.has('shift') ? 9 : 4.6;
      const fwd = new THREE.Vector3(-Math.sin(w.yaw), 0, -Math.cos(w.yaw)), right = new THREE.Vector3(Math.cos(w.yaw), 0, -Math.sin(w.yaw));
      const want = new THREE.Vector3().addScaledVector(fwd, fx).addScaledVector(right, sx);
      if (want.lengthSq() > 0) want.normalize().multiplyScalar(speed);
      if (w.goal) {
        const d = w.goal.clone().sub(tmp.set(w.pos.x, 0, w.pos.z)); const dist = d.length();
        if (dist < 0.25) w.goal = null;
        else {
          want.copy(d.normalize().multiplyScalar(Math.min(5.5, dist * 2.2)));
          const gy = Math.atan2(-d.x, -d.z); w.tYaw = w.yaw + angDiff(w.yaw, gy) * 0.6;
        }
      }
      w.vel.lerp(want, 1 - Math.exp(-10 * dt));
      w.pos.addScaledVector(w.vel, dt);
      collide(w.pos);
      w.pos.y = damp(w.pos.y, groundAt(w.pos.x, w.pos.z) + WALK_EYE + Math.sin(t * 9) * 0.012 * Math.min(1, w.vel.length() / 4), 10, dt);
      w.yaw = damp(w.yaw, w.tYaw, 12, dt); w.pitch = damp(w.pitch, w.tPitch, 12, dt);
      camera.position.copy(w.pos);
      tmp.set(-Math.sin(w.yaw) * Math.cos(w.pitch), Math.sin(w.pitch), -Math.cos(w.yaw) * Math.cos(w.pitch)).add(w.pos);
      camera.lookAt(tmp);
    }
    if (Math.abs(ctl.vo.x - ctl.tvo.x) > 0.5 || Math.abs(ctl.vo.y - ctl.tvo.y) > 0.5) { ctl.vo.x = damp(ctl.vo.x, ctl.tvo.x, 6, dt); ctl.vo.y = damp(ctl.vo.y, ctl.tvo.y, 6, dt); applyViewOffset(); }
    else if (ctl.vo.x !== ctl.tvo.x || ctl.vo.y !== ctl.tvo.y) { ctl.vo.x = ctl.tvo.x; ctl.vo.y = ctl.tvo.y; applyViewOffset(); }

    // Hover
    if (hoverDirty && pointers.size === 0) {
      hoverDirty = false;
      const h = lastPointer ? pick(lastPointer.x, lastPointer.y) : null;
      const id = h?.type === 'product' ? h.id : null;
      const sec = h?.type === 'sign' ? h.sector : null;
      canvas.style.cursor = id || sec ? 'pointer' : (ctl.mode === 'walk' ? 'crosshair' : '');
      if (id !== hovered) { hovered = id; }
      emit('hover', id, lastPointer, sec);
    }
    if (lastPointer && pointers.size === 0 && (ctl.flight || poseFlight || ctl.mode === 'walk')) hoverDirty = true;

    // Exponate
    const camPos = camera.position;
    for (const ex of exhibits) {
      const p = ex.p, rp = ex.root.position;
      const dx = camPos.x - rp.x, dz = camPos.z - rp.z, dist = Math.hypot(dx, dz);
      const isSel = selected === p.id, isHov = hovered === p.id;
      ex.hover = damp(ex.hover, isHov ? 1 : 0, 12, dt);
      ex.sel = damp(ex.sel, isSel ? 1 : 0, 6, dt);
      const dimT = filterSet && !filterSet.has(p.id) ? 1 : 0;
      ex.dim = damp(ex.dim, dimT, 6, dt);
      if (ex.yaw) {
        ex.yaw.rotation.y = Math.atan2(dx, dz);
        const el = Math.atan2(camPos.y - (rp.y + ex.topY * 0.5), Math.max(dist, 0.01));
        ex.tilt.rotation.x = -clamp((el - 0.3) * 0.7, 0, 0.7);
        const s = 1 + ex.hover * 0.035;
        ex.tilt.scale.setScalar(s);
        if (p.kind === 'software' || p.kind === 'package') ex.yaw.position.y = p.m.base + Math.sin(t * 1.4 + ex.bob) * 0.06;
        const op = ex.card.material.map ? 1 - ex.dim * 0.85 : 0;
        ex.card.material.opacity = damp(ex.card.material.opacity, op, 8, dt);
        ex.blob.material.opacity = (p.kind === 'software' || p.kind === 'package' ? 0 : 0.85) * (1 - ex.dim * 0.8);
      }
      if (ex.screen) ex.screen.material.color.setScalar(1 - ex.dim * 0.75);
      if (ex.beam) { ex.beam.material.uniforms.uTime.value = t; ex.beam.material.uniforms.uStrength.value = (0.22 + ex.hover * 0.25 + ex.sel * 0.2) * (1 - ex.dim); }
      // Ring
      const pulse = filterSet && !ex.dim ? 0.5 + 0.5 * Math.sin(t * 4) : 0;
      ex.ringMat.opacity = clamp(0.55 + ex.hover * 0.45 + ex.sel * 0.45 + pulse * 0.4 - ex.dim * 0.5, 0.05, 1);
      ex.ring.scale.y = 1;
      const rs = 1 + ex.hover * 0.05 + ex.sel * 0.08;
      ex.ring.scale.x = ex.ring.scale.z = (ex.ringBase ??= ex.ring.scale.x) * rs;
      // Beschriftung: Größe wächst leicht mit Entfernung, blendet in der Ferne aus
      const d3 = camPos.distanceTo(rp);
      const sc = clamp(d3 / 13, 1, 1.55) * (1 + ex.hover * 0.12);
      ex.label.scale.set(ex.labelBase.w * sc, ex.labelBase.h * sc, 1);
      let lo = 1 - clamp((d3 - 25) / 10, 0, 1);
      if (ctl.mode === 'walk') lo = 1 - clamp((d3 - 18) / 8, 0, 1);
      lo = Math.max(lo, ex.hover, ex.sel) * (1 - ex.dim);
      ex.label.material.opacity = damp(ex.label.material.opacity, lo, 10, dt);
      ex.label.visible = ex.label.material.opacity > 0.02;
      const hl = Math.max(ex.hover, ex.sel);
      ex.label.material.color.setRGB(1, 1, 1).lerp(new THREE.Color(0xfff9b0), hl);
    }

    // Auswahl-Kegel
    const sp = selected ? byId.get(selected) : null;
    const coneOn = sp && ctl.mode !== 'walk' ? 1 : (sp ? 0.5 : 0);
    if (sp) {
      const top = 7.5, base = sp.pos.y + 0.02;
      cone.position.set(sp.pos.x, (top + base) / 2, sp.pos.z);
      const rad = Math.max(sp.ex.radius, 1.1);
      cone.scale.set(rad, top - base, rad);
      spot.position.set(sp.pos.x, top + 2, sp.pos.z); spot.target.position.copy(sp.pos);
    }
    cone.material.uniforms.uTime.value = t;
    cone.material.uniforms.uStrength.value = damp(cone.material.uniforms.uStrength.value, coneOn * 0.32, 5, dt);
    spot.intensity = damp(spot.intensity, sp ? 110 : 0, 5, dt);
    cone.visible = cone.material.uniforms.uStrength.value > 0.005;

    for (const sg of signGroups) {
      const d = camPos.distanceTo(sg.grp.position);
      const o = clamp((d - 42) / 12, 0, 1);
      sg.mat.opacity = o; sg.grp.visible = o > 0.02;
    }
    for (const fl of flowLines) fl.material.map.offset.x = -t * 0.6;
    symbol.rotation.y = t * 0.35;
    symbol.position.y = 3.6 + Math.sin(t * 0.9) * 0.12;

    // Aktive Themenwelt (für UI / Minikarte)
    const look = ctl.mode === 'orbit' ? ctl.target : camPos;
    const lr = Math.hypot(look.x, look.z);
    let sec = null;
    if (lr > L.plazaR * 0.7) { const th = thetaOf(look.x, look.z); sec = L.sectors.find((s) => angDiff(s.th0 - 0.12, th) >= 0 && angDiff(th, s.th1 + 0.12) >= 0)?.id || null; }
    if (ctl.mode === 'orbit' && ctl.r > L.wallR * 1.4) sec = null;
    if (sec !== activeSector) { activeSector = sec; emit('active', sec); }

    const near = ctl.mode === 'orbit' ? clamp(ctl.r * 0.015, 0.1, 1.2) : 0.1;
    const camDist = camPos.length();
    scene.fog.near = Math.max(70, camDist * 0.9); scene.fog.far = Math.max(230, camDist * 2.4);
    if (Math.abs(camera.near - near) > 0.02) { camera.near = near; camera.updateProjectionMatrix(); }
    renderer.render(scene, camera);
    emit('frame');
  }

  /* ---------------- Öffentliche API ---------------- */
  const api = {
    layout: L, products, byId, camera,
    on(type, f) { (listeners[type] ||= []).push(f); return api; },
    start() {
      if (started) return; started = true; looping = true;
      if (cinematic) {
        const s0 = cinemaStops()[0];
        ctl.target.copy(s0.target); ctl.r = s0.r; ctl.th = s0.th; ctl.ph = s0.ph;
        api.setProgress(0);
        frame();
        return;
      }
      const ov = overviewPose();
      ctl.target.copy(ov.target); ctl.r = ov.r * 1.8; ctl.th = -0.9; ctl.ph = 0.5;
      ctl.tTarget.copy(ctl.target); ctl.tR = ctl.r; ctl.tTh = ctl.th; ctl.tPh = ctl.ph;
      startFlight(ov, 3.2);
      frame();
    },
    overview() { setSelected(null); if (ctl.mode !== 'orbit') { exitWalk(overviewPose()); return; } startFlight(overviewPose()); },
    sector(id) {
      const s = secById.get(id); if (!s) return;
      const pose = poseForSector(s);
      if (ctl.mode === 'walk') {
        const pos = polar(s.mid, L.rIn - 6.5, 0); pos.y = WALK_EYE;
        flyPose(pos, polar(s.mid, L.rIn + 3, 1.4), 1.6, () => { ctl.mode = 'walk'; ctl.walk.pos.copy(pos); ctl.walk.yaw = ctl.walk.tYaw = Math.atan2(-Math.sin(s.mid), Math.cos(s.mid)); ctl.walk.pitch = ctl.walk.tPitch = -0.02; });
        ctl.mode = 'walk-in';
        return;
      }
      if (ctl.mode !== 'orbit') return;
      startFlight(pose);
    },
    focus(id, { fly = true } = {}) {
      const p = byId.get(id); if (!p) return;
      setSelected(id);
      if (!fly) return;
      if (ctl.mode === 'walk') {
        const dir = p.pos.clone().setY(0).normalize();
        const pos = p.pos.clone().setY(0).sub(dir.multiplyScalar(p.m.foot * 0.45 + 2.6));
        collide(pos); pos.y = groundAt(pos.x, pos.z) + WALK_EYE;
        const look = p.pos.clone(); look.y += (p.kind === 'machine' ? 0.1 : p.m.base) + p.m.H * 0.5;
        ctl.mode = 'walk-in';
        flyPose(pos, look, 1.4, () => {
          ctl.mode = 'walk'; ctl.walk.pos.copy(pos);
          const d = look.clone().sub(pos);
          ctl.walk.yaw = ctl.walk.tYaw = Math.atan2(-d.x, -d.z);
          ctl.walk.pitch = ctl.walk.tPitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
        });
        return;
      }
      if (ctl.mode !== 'orbit') return;
      startFlight(poseForProduct(p));
    },
    clearSelection() { setSelected(null); },
    zoom(f) {
      cancelAutomation();
      if (ctl.mode === 'walk') { walkStep(f < 1 ? 2.5 : -2.5); return; }
      zoomBy(f);
    },
    zone: () => ({ target: ZONE.target, walk: ZONE.walk, wallR: L.wallR }),
    // Kamera gezielt setzen, z. B. für Vorschaubilder: { target: [x, y, z], r, th, ph }
    // Kino-Modus: p = 0 … 1 → Übersicht, sieben Themenwelten, Übersicht
    setProgress(p) {
      const st = cinemaStops(), n = st.length - 1;
      const u = clamp(p, 0, 1) * n, i = Math.min(n - 1, Math.floor(u)), f = u - i;
      const e = f < 0.32 ? 0 : f > 0.9 ? 1 : (() => { const x = (f - 0.32) / 0.58; return x * x * (3 - 2 * x); })();
      const a = st[i], b = st[i + 1];
      ctl.tTarget.lerpVectors(a.target, b.target, e);
      ctl.tR = lerp(a.r, b.r, e) + Math.sin(Math.PI * e) * 7;
      ctl.tTh = lerp(a.th, b.th, e) - 0.07 * (f < 0.32 ? f / 0.32 : 1 - e);
      ctl.tPh = lerp(a.ph, b.ph, e) - Math.sin(Math.PI * e) * 0.1;
      return { index: Math.round(u), sector: i + (e > 0.5 ? 1 : 0) - 1 };
    },
    setRunning(on) {
      running = on;
      if (on && started && !looping) { looping = true; clock.getDelta(); requestAnimationFrame(frame); }
    },
    view(v, dur = 1.6) {
      if (ctl.mode !== 'orbit') return;
      const t = new THREE.Vector3(...v.target); clampTarget(t);
      startFlight({ target: t, r: clamp(v.r, ZONE.rMin, rMax()), th: v.th, ph: clamp(v.ph, 0.18, 1.5) }, dur);
    },
    setFilter(ids) { filterSet = ids ? new Set(ids) : null; },
    setWalk(on) { on ? enterWalk() : exitWalk(); },
    get mode() { return ctl.mode.startsWith('walk') ? 'walk' : 'orbit'; },
    setInset(x = 0, y = 0) { ctl.tvo.x = x; ctl.tvo.y = y; },
    resize,
    state() {
      const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
      return { x: camera.position.x, z: camera.position.z, yaw: Math.atan2(fwd.x, -fwd.z), hovered, selected, activeSector,
        target: ctl.mode === 'orbit' ? { x: ctl.target.x, z: ctl.target.z } : null };
    },
    flyToPoint(x, z) {
      if (ctl.mode === 'walk') { ctl.walk.goal = new THREE.Vector3(x, 0, z); return; }
      const t = new THREE.Vector3(x, 1.2, z); clampTarget(t);
      startFlight({ target: t, r: Math.min(ctl.r, 26), th: ctl.th, ph: Math.min(ctl.ph, 1.15) });
    },
    screenOf(id) {
      const p = byId.get(id); if (!p) return null;
      const v = p.pos.clone(); v.y += p.ex.topY; v.project(camera);
      return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, visible: v.z < 1 };
    },
  };
  return api;
}
