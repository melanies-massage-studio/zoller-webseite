/* ZOLLER – 3D-Bühne der Startseite (Three.js)
   Prozedural modelliert: Schrumpffutter mit Steilkegel, 4-schneidiger Fräser,
   gelber Mess-Ring (Einstell- und Messgerät) und das ZOLLER-Symbol.
   Die Kamera und alle Bewegungen werden vom Scroll-Fortschritt gesteuert. */

const stage = document.querySelector('[data-stage3d]');
const canvas = stage?.querySelector('canvas');
const panels = stage ? [...stage.querySelectorAll('[data-panel]')] : [];
const bars = stage ? [...stage.querySelectorAll('.stage3d__progress i')] : [];
const readout = stage?.querySelector('[data-readout]');
const readout2 = stage?.querySelector('[data-readout2]');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEC = /^(en|es-MX)/i.test(document.documentElement.lang) ? '.' : ','; // Dezimalzeichen der Seite

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

function scrollProgress() {
  const r = stage.getBoundingClientRect();
  const total = stage.offsetHeight - window.innerHeight;
  return clamp(-r.top / Math.max(1, total));
}

/* Texte und Fortschrittsbalken (funktionieren auch ohne WebGL) */
function updatePanels(p) {
  const seg = [0, 0.34, 0.67, 1.0001];
  panels.forEach((el, i) => {
    const a = seg[i], b = seg[i + 1];
    const fadeIn = i === 0 ? 1 : smooth(a - 0.02, a + 0.08, p);
    const fadeOut = i === panels.length - 1 ? 1 : 1 - smooth(b - 0.08, b + 0.02, p);
    const o = Math.min(fadeIn, fadeOut);
    const dy = (1 - fadeIn) * 40 - (1 - fadeOut) * 40;
    el.style.opacity = o.toFixed(3);
    el.style.transform = el.classList.contains('is-mobile') ? `translate3d(0, ${dy.toFixed(1)}px, 0)` : `translate3d(0, calc(-50% + ${dy.toFixed(1)}px), 0)`;
    el.style.filter = o < 0.99 ? `blur(${((1 - o) * 8).toFixed(1)}px)` : 'none';
    el.style.visibility = o < 0.01 ? 'hidden' : 'visible';
  });
  bars.forEach((bar, i) => { bar.style.transform = `scaleX(${clamp((p - i / 3) * 3).toFixed(3)})`; });
}

if (stage) {
  if (matchMedia('(max-width: 860px)').matches) panels.forEach(p => p.classList.add('is-mobile'));
  let ticking = false;
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; updatePanels(scrollProgress()); }); } };
  window.addEventListener('scroll', onScroll, { passive: true });
  updatePanels(scrollProgress());
  if (!reduced) init3D().catch((e) => { console.warn('3D deaktiviert:', e); });
}

async function init3D() {
  const test = document.createElement('canvas');
  if (!(test.getContext('webgl2') || test.getContext('webgl'))) return;
  const THREE = await import('three');
  const { RoomEnvironment } = await import('../vendor/RoomEnvironment.js');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping ?? THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

  /* ---------------- Materialien ---------------- */
  const steel = new THREE.MeshPhysicalMaterial({ color: 0xd9dde2, metalness: 1, roughness: 0.16, clearcoat: 0.4, clearcoatRoughness: 0.2 });
  const steelDark = new THREE.MeshPhysicalMaterial({ color: 0x8a8f96, metalness: 1, roughness: 0.32 });
  const carbide = new THREE.MeshPhysicalMaterial({ color: 0x6f747b, metalness: 0.9, roughness: 0.24, clearcoat: 0.6, clearcoatRoughness: 0.15 });
  const coating = new THREE.MeshPhysicalMaterial({ color: 0x3a2f5c, metalness: 0.95, roughness: 0.2, iridescence: 0.9, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 700] });
  const yellow = new THREE.MeshPhysicalMaterial({ color: 0xf0e600, metalness: 0.35, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xf0e600, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });

  /* ---------------- Werkzeughalter (Lathe-Profil) ---------------- */
  // Profil (Radius, Höhe) – von unten (Steilkegel) nach oben (Schrumpfnase)
  const P = (r, y) => new THREE.Vector2(r, y);
  const holderProfile = [
    P(0.0, -2.30), P(0.30, -2.30), P(0.34, -2.25),            // Anzugsbolzen
    P(0.34, -2.02), P(0.26, -1.98), P(0.26, -1.88), P(0.36, -1.84),
    P(0.42, -1.80), P(0.66, -0.62),                            // Steilkegel 7:24
    P(0.70, -0.60), P(0.70, -0.52), P(0.96, -0.50),            // Bund
    P(1.00, -0.46), P(1.00, -0.36), P(0.88, -0.27), P(1.00, -0.18), // V-Nut
    P(1.00, -0.06), P(0.96, -0.02), P(0.62, 0.0),
    P(0.56, 0.12), P(0.40, 1.30), P(0.36, 1.36), P(0.30, 1.38), // Schrumpfnase
    P(0.22, 1.38), P(0.0, 1.38),
  ];
  const holderGeo = new THREE.LatheGeometry(holderProfile, 160);
  holderGeo.computeVertexNormals();
  const holder = new THREE.Mesh(holderGeo, steel);

  // Nut-Ringe & Datenträger-Bohrung (Details)
  const groove = new THREE.Mesh(new THREE.TorusGeometry(0.985, 0.012, 12, 160), steelDark);
  groove.rotation.x = Math.PI / 2; groove.position.y = -0.42;
  const chip = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 32), yellow);
  chip.rotation.z = Math.PI / 2; chip.position.set(0.99, -0.24, 0);

  /* ---------------- Fräser (4 Schneiden, Drall) ---------------- */
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.1, 64), carbide);
  shank.position.y = 1.9;

  const fluteShape = new THREE.Shape();
  const N = 4, R = 0.2;
  for (let i = 0; i <= N * 36; i++) {
    const a = (i / (N * 36)) * Math.PI * 2;
    const k = (a * N / (Math.PI * 2)) % 1;            // Position innerhalb einer Schneide
    const r = k < 0.35 ? R : R * (1 - 0.42 * Math.sin(Math.PI * (k - 0.35) / 0.65));
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i === 0 ? fluteShape.moveTo(x, y) : fluteShape.lineTo(x, y);
  }
  const fluteLen = 1.25;
  const fluteGeo = new THREE.ExtrudeGeometry(fluteShape, { depth: fluteLen, steps: 120, bevelEnabled: false, curveSegments: 4 });
  // Drall: Querschnitt entlang Z verdrehen, Spitze leicht verjüngen
  const pos = fluteGeo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = v.z / fluteLen;
    const ang = t * Math.PI * 1.15;
    const taper = t > 0.94 ? 1 - (t - 0.94) * 4 : 1;
    const x = (v.x * Math.cos(ang) - v.y * Math.sin(ang)) * taper;
    const y = (v.x * Math.sin(ang) + v.y * Math.cos(ang)) * taper;
    pos.setXYZ(i, x, y, v.z);
  }
  fluteGeo.computeVertexNormals();
  const flutes = new THREE.Mesh(fluteGeo, coating);
  flutes.rotation.x = -Math.PI / 2;
  flutes.position.y = 2.45;

  const tool = new THREE.Group();
  tool.add(holder, groove, chip, shank, flutes);
  tool.position.y = -0.55;
  const toolPivot = new THREE.Group();
  toolPivot.add(tool);
  scene.add(toolPivot);

  /* ---------------- Mess-Ring + Fadenkreuz ---------------- */
  const scan = new THREE.Group();
  const ringGeo = new THREE.TorusGeometry(0.34, 0.006, 8, 200);
  const ring = new THREE.Mesh(ringGeo, glow);
  ring.rotation.x = Math.PI / 2;
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.0025, 6, 200), glow.clone());
  ring2.material.opacity = 0.45; ring2.rotation.x = Math.PI / 2;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.42, 96), new THREE.MeshBasicMaterial({ color: 0xf0e600, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  disc.rotation.x = -Math.PI / 2;
  const tickGeo = new THREE.BoxGeometry(0.004, 0.004, 0.09);
  for (let i = 0; i < 4; i++) {
    const tk = new THREE.Mesh(tickGeo, glow);
    const a = i * Math.PI / 2;
    tk.position.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5);
    tk.rotation.y = -a;
    scan.add(tk);
  }
  scan.add(ring, ring2, disc);
  scan.visible = false;
  tool.add(scan);

  // Messpunkte entlang der Schneide
  const dots = new THREE.Group();
  const dotGeo = new THREE.SphereGeometry(0.018, 16, 16);
  for (let i = 0; i < 9; i++) {
    const d = new THREE.Mesh(dotGeo, glow);
    const t = i / 8;
    const a = t * Math.PI * 1.15;
    d.position.set(Math.cos(a) * 0.205, 2.45 + t * fluteLen, -Math.sin(a) * 0.205);
    d.userData.t = t;
    dots.add(d);
  }
  tool.add(dots);

  /* ---------------- ZOLLER-Symbol (Ring mit vier Armen) ---------------- */
  const symbol = new THREE.Group();
  const ringShape = new THREE.Shape();
  ringShape.absarc(0, 0, 1.0, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.74, 0, Math.PI * 2, true);
  ringShape.holes.push(hole);
  const extr = { depth: 0.22, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 4, curveSegments: 96 };
  const ringMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(ringShape, extr), yellow);
  ringMesh.position.z = -0.11;
  symbol.add(ringMesh);
  const armShape = new THREE.Shape();
  armShape.moveTo(-0.13, 0); armShape.lineTo(0.13, 0); armShape.lineTo(0.13, 0.62); armShape.lineTo(-0.13, 0.62); armShape.closePath();
  const armGeo = new THREE.ExtrudeGeometry(armShape, extr);
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Mesh(armGeo, yellow);
    const a = Math.PI / 4 + i * Math.PI / 2;
    arm.rotation.z = a - Math.PI / 2;
    arm.position.set(Math.cos(a) * 0.98, Math.sin(a) * 0.98, -0.11);
    symbol.add(arm);
  }
  symbol.scale.setScalar(0.9);
  symbol.position.set(0, 0.2, -1.5);
  scene.add(symbol);

  /* ---------------- Licht ---------------- */
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 5, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xfff6a0, 2.4); rim.position.set(-4, 2, -3); scene.add(rim);
  const fill = new THREE.HemisphereLight(0xffffff, 0x111111, 0.35); scene.add(fill);
  const spot = new THREE.PointLight(0xf0e600, 0, 4, 2); scene.add(spot);

  /* ---------------- Größe & Rendering ---------------- */
  let W = 0, H = 0, mobile = false;
  function resize() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    mobile = W < 860;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('pointermove', (e) => { mouse.tx = (e.clientX / innerWidth - 0.5) * 2; mouse.ty = (e.clientY / innerHeight - 0.5) * 2; }, { passive: true });

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { rootMargin: '100px' }).observe(stage);

  let sp = scrollProgress();
  const camPos = new THREE.Vector3(), look = new THREE.Vector3();
  const clock = new THREE.Clock();
  stage.classList.add('is-3d');

  function frame() {
    requestAnimationFrame(frame);
    if (!visible) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    sp += (scrollProgress() - sp) * Math.min(1, dt * 6);
    mouse.x += (mouse.tx - mouse.x) * dt * 3; mouse.y += (mouse.ty - mouse.y) * dt * 3;

    const p1 = smooth(0.18, 0.42, sp);   // Zoom auf die Schneide
    const p2 = smooth(0.40, 0.66, sp);   // Messung läuft
    const p3 = smooth(0.66, 0.95, sp);   // System / Symbol

    // Werkzeug: Rotation & Position
    const side = mobile ? 0 : 1;
    toolPivot.rotation.y = t * 0.25 + sp * Math.PI * 2.2;
    toolPivot.rotation.z = lerp(-0.16, 0, p1) * side - p3 * 0.5 * side;
    toolPivot.position.x = lerp(1.55 * side, 0.0, p1) + lerp(0, -0.6, p3) * side;
    toolPivot.position.y = lerp(mobile ? 1.35 : -0.05, mobile ? 0.55 : 0, p1) - smooth(0.66, 0.85, sp) * 4.2;
    toolPivot.scale.setScalar(lerp(mobile ? 0.42 : 0.6, mobile ? 0.8 : 1.0, p1) * lerp(1, 0.55, p3));

    // Kamera
    const camStart = new THREE.Vector3(0, 0.5, 9.6);
    const camClose = new THREE.Vector3(0.6, 2.1, 3.6);
    const camEnd = new THREE.Vector3(0, 0.3, 8.4);
    camPos.copy(camStart).lerp(camClose, p1).lerp(camEnd, p3);
    camPos.x += mouse.x * 0.25; camPos.y += -mouse.y * 0.15;
    camera.position.copy(camPos);
    look.set(lerp(0, 0.1, p1), lerp(0.4, 1.95, p1) - p3 * 1.8, 0);
    camera.lookAt(look);

    // Mess-Ring fährt die Schneide ab
    scan.visible = p1 > 0.05 && p3 < 0.95;
    const scanY = 2.45 + fluteLen * (0.5 + 0.5 * Math.sin(t * 1.3)) * (0.3 + 0.7 * p2);
    scan.position.y = lerp(1.9, scanY, p1);
    const sc = lerp(0.2, 1, p1) * (1 - p3);
    scan.scale.setScalar(Math.max(0.001, sc));
    ring.material.opacity = 0.9 * (1 - p3) * p1;
    disc.rotation.z = t;
    dots.children.forEach(d => {
      const on = clamp((p2 * 1.2 - d.userData.t) * 6);
      d.scale.setScalar(on * (1 + 0.25 * Math.sin(t * 6 + d.userData.t * 10)));
      d.visible = on > 0.01 && p3 < 0.9;
    });
    spot.intensity = 3 * p1 * (1 - p3);
    spot.position.set(0.8, scan.position.y - 0.55, 0.8);

    // Symbol erscheint im Hintergrund und kommt nach vorne
    const symIn = smooth(0.0, 0.1, sp) * (1 - smooth(0.1, 0.3, sp)) * 0.9 + p3;
    symbol.visible = symIn > 0.01;
    symbol.position.x = mobile ? 0 : lerp(-2.2, 1.35, p3);
    symbol.position.y = lerp(0.9, mobile ? 0.7 : 0.25, p3);
    symbol.position.z = lerp(-4.5, 0.4, p3);
    symbol.rotation.y = lerp(0.7 + mouse.x * 0.1, -0.35 + mouse.x * 0.2, p3) + Math.sin(t * 0.4) * 0.08;
    symbol.rotation.x = lerp(0.3, 0.1, p3) - mouse.y * 0.08;
    symbol.rotation.z = sp * Math.PI * 0.5;
    symbol.scale.setScalar(lerp(0.9, mobile ? 0.5 : 1.0, p3) * clamp(symIn, 0.001, 1));

    // Anzeige
    if (readout && p1 > 0.02) {
      const jitter = (Math.sin(t * 13.7) * 0.0012 + Math.sin(t * 7.1) * 0.0008);
      readout.textContent = `Ø ${(20 + jitter * (1 - p2)).toFixed(3).replace('.', DEC)} mm`;
      readout2.textContent = `L ${(112 + (scanY - 2.45) * 0.8 * p2).toFixed(3).replace('.', DEC)} mm`;
    }
    renderer.render(scene, camera);
  }
  frame();
}
