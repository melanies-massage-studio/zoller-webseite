/* ZOLLER – 3D-Produktbühne der Produktseiten (Three.js)
   Das freigestellte Produktfoto steht auf einem spiegelnden Boden, dahinter
   schwebt das ZOLLER-Symbol als 3D-Objekt. Kamera-Parallaxe mit Maus/Scroll,
   Lichtkante, Partikel und Einflug-Animation. Das Gerät selbst ist ein Foto
   (kein 3D-Modell) und dreht sich deshalb immer zur Kamera. */

import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';

const hero = document.querySelector('[data-product-stage]');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeOutBack = (t) => { const c = 1.5; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

if (hero && !reduced) init().catch((e) => console.warn('3D-Bühne deaktiviert:', e));

function zollerSymbol(material) {
  const g = new THREE.Group();
  const ring = new THREE.Shape(); ring.absarc(0, 0, 1.0, 0, TAU, false);
  const hole = new THREE.Path(); hole.absarc(0, 0, 0.72, 0, TAU, true); ring.holes.push(hole);
  const ex = { depth: 0.22, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 4, curveSegments: 96 };
  const rm = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, ex), material); rm.position.z = -0.11; g.add(rm);
  const arm = new THREE.Shape(); arm.moveTo(-0.15, 0); arm.lineTo(0.15, 0); arm.lineTo(0.15, 0.7); arm.lineTo(-0.15, 0.7); arm.closePath();
  const ag = new THREE.ExtrudeGeometry(arm, ex);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2, m = new THREE.Mesh(ag, material);
    m.rotation.z = a - Math.PI / 2; m.position.set(Math.cos(a) * 0.96, Math.sin(a) * 0.96, -0.11); g.add(m);
  }
  return g;
}

function radialTexture(stops, size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'), g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

async function init() {
  const test = document.createElement('canvas');
  if (!(test.getContext('webgl2') || test.getContext('webgl'))) return;
  const holder = hero.querySelector('[data-product-img]');
  const canvas = hero.querySelector('.product-hero__canvas');
  if (!holder || !canvas) return;
  const kind = hero.dataset.kind || 'machine';
  const aspect = parseFloat(hero.dataset.aspect) || 1.2;

  const tex = await new THREE.TextureLoader().loadAsync(hero.dataset.cutout);
  tex.colorSpace = THREE.SRGBColorSpace;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping ?? THREE.ACESFilmicToneMapping;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);

  // Größen: Produkt ist H hoch, steht auf y = 0
  const H = 2.2, W = H * aspect;
  const center = new THREE.Vector3(0, H * 0.5, 0);

  /* Boden: heller Glanzfleck, Kontaktschatten, gelber Lichtring */
  const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: radialTexture([[0, 'rgba(255,255,255,0.95)'], [0.55, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]), transparent: true, depthWrite: false, toneMapped: false }));
  floorGlow.scale.set(W * 2.6, 1, W * 1.6); floorGlow.position.y = -0.002; scene.add(floorGlow);

  const pivot = new THREE.Group(); scene.add(pivot);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: radialTexture([[0, 'rgba(0,0,0,0.42)'], [0.5, 'rgba(0,0,0,0.16)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false }));
  shadow.scale.set(W * 1.05, 1, Math.max(0.5, W * 0.3)); shadow.position.y = 0.001; pivot.add(shadow);

  const ringMat = new THREE.MeshBasicMaterial({ color: 0xf0e600, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.025, 128).rotateX(-Math.PI / 2), ringMat);
  ring.scale.set(W * 0.62, 1, W * 0.62); ring.position.y = 0.004; scene.add(ring);

  /* Produkt, Spiegelung und Lichtkante */
  const prodGeo = new THREE.PlaneGeometry(W, H); prodGeo.translate(0, H / 2, 0);
  const prodMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
  const lift = new THREE.Group(); pivot.add(lift);
  const product = new THREE.Mesh(prodGeo, prodMat); product.renderOrder = 3; lift.add(product);

  const reflGeo = new THREE.PlaneGeometry(W, H); reflGeo.translate(0, -H / 2, 0);
  const reflMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { map: { value: tex }, uStrength: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D map; uniform float uStrength; varying vec2 vUv; void main(){ vec4 c = texture2D(map, vec2(vUv.x, 1.0 - vUv.y)); float f = pow(vUv.y, 5.0); gl_FragColor = vec4(c.rgb, c.a * f * uStrength);\n#include <colorspace_fragment>\n}',
  });
  const reflection = new THREE.Mesh(reflGeo, reflMat); reflection.renderOrder = 1; pivot.add(reflection);

  const sweepMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { map: { value: tex }, uPos: { value: -1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D map; uniform float uPos; varying vec2 vUv; void main(){ float a = texture2D(map, vUv).a; float d = vUv.x * 0.7 + vUv.y * 0.3 - uPos; float band = smoothstep(-0.09, 0.0, d) * (1.0 - smoothstep(0.0, 0.09, d)); gl_FragColor = vec4(vec3(0.62), band * a); }',
  });
  const sweep = new THREE.Mesh(prodGeo, sweepMat); sweep.renderOrder = 4; lift.add(sweep);

  /* ZOLLER-Symbol (bzw. Leuchtscheibe bei Software) */
  const symMat = new THREE.MeshStandardMaterial({ color: 0xf0e600, metalness: 0.38, roughness: 0.3, emissive: 0x2e2a00 });
  const symbol = zollerSymbol(symMat);
  const symScale = Math.min(H * 0.43, W * 0.56);
  symbol.position.set(0, H * 0.5, -1.7); symbol.scale.setScalar(0.001);
  if (kind !== 'software') scene.add(symbol);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: radialTexture([[0, 'rgba(240,230,0,0.55)'], [0.45, 'rgba(240,230,0,0.18)'], [1, 'rgba(240,230,0,0)']]), transparent: true, depthWrite: false, toneMapped: false }));
  halo.scale.setScalar(H * 1.9); halo.position.set(0, H * 0.55, -2.2); scene.add(halo);

  /* Partikel */
  const N = 70, pos = new Float32Array(N * 3), speed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * W * 2.2; pos[i * 3 + 1] = Math.random() * H * 1.4; pos[i * 3 + 2] = (Math.random() - 0.5) * 2.4;
    speed[i] = 0.05 + Math.random() * 0.12;
  }
  const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dot = radialTexture([[0, 'rgba(255,250,170,1)'], [0.35, 'rgba(240,230,0,0.55)'], [1, 'rgba(240,230,0,0)']], 64);
  const pMat = new THREE.PointsMaterial({ size: 0.06, map: dot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  const particles = new THREE.Points(pGeo, pMat); scene.add(particles);

  /* Licht für das Metall-Symbol */
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9dce0, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(3, 5, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xfff3a0, 1.6); rim.position.set(-5, 3, -4); scene.add(rim);

  /* Größe */
  let cw = 1, ch = 1, baseD = 10;
  function resize() {
    cw = canvas.clientWidth; ch = canvas.clientHeight;
    if (!cw || !ch) return;
    renderer.setSize(cw, ch, false);
    camera.aspect = cw / ch; camera.updateProjectionMatrix();
    const t = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    // gleiche Bildfläche wie das statische Foto (82 % Höhe / 86 % Breite des Bildbereichs)
    baseD = Math.max(H / (0.64 * t), W / (0.67 * t * camera.aspect));
  }
  resize();
  new ResizeObserver(resize).observe(canvas);

  /* Eingabe */
  const touch = matchMedia('(hover: none)').matches;
  let tx = 0, ty = 0, mx = 0, my = 0;
  hero.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const r = hero.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - 0.5) * 2; ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  });
  hero.addEventListener('pointerleave', () => { tx = 0; ty = 0; });

  let visible = true;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { rootMargin: '80px' }).observe(hero);

  // Shader im Hintergrund kompilieren, bevor die Bühne sichtbar wird – sonst stockt der erste Frame die Seite
  try { await renderer.compileAsync(scene, camera); } catch (e) { /* kompiliert dann beim ersten Bild */ }
  const clock = new THREE.Clock();
  let t0 = -1, nextSweep = 1.0;
  holder.classList.add('is-3d');

  function frame() {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) { clock.getDelta(); return; }
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    if (t0 < 0) t0 = t;
    const it = t - t0;

    if (touch) { tx = Math.sin(t * 0.35) * 0.55; ty = Math.sin(t * 0.27) * 0.2; }
    mx += (tx - mx) * Math.min(1, dt * 3); my += (ty - my) * Math.min(1, dt * 3);

    const r = hero.getBoundingClientRect();
    const s = clamp(-r.top / Math.max(1, r.height));

    // Einflug
    const e1 = easeOutExpo(clamp(it / 1.7));
    const e2 = easeOutBack(clamp((it - 0.2) / 1.5));
    const introYaw = (1 - e1) * -0.5;

    const yaw = mx * 0.2 + introYaw;
    const pitch = 0.07 - my * 0.05 + s * 0.12;
    const D = baseD * (1 + (1 - e1) * 0.16 + s * 0.22);
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * D, center.y + Math.sin(pitch) * D, Math.cos(yaw) * Math.cos(pitch) * D);
    camera.lookAt(center.x, center.y + s * 0.25, 0);

    pivot.rotation.y = yaw;                               // Foto bleibt zur Kamera gedreht
    lift.position.y = kind === 'software' ? Math.sin(t * 1.3) * 0.05 : 0;
    prodMat.opacity = clamp(it / 0.25);
    reflMat.uniforms.uStrength.value = 0.32 * e1;
    shadow.material.opacity = e1;

    symbol.scale.setScalar(symScale * Math.max(0.001, e2));
    symbol.rotation.z = (1 - e2) * -1.4 + Math.sin(t * 0.25) * 0.06 + s * 1.2;
    symbol.rotation.y = -mx * 0.35 + Math.sin(t * 0.4) * 0.05;
    symbol.rotation.x = my * 0.12;
    halo.material.opacity = 0.9 * e1;

    const rp = clamp((it - 0.4) / 1.4);
    ringMat.opacity = rp < 1 ? Math.sin(rp * Math.PI) * 0.9 : 0.35 + Math.sin(t * 1.6) * 0.1;
    const rs = 1 + (1 - easeOutExpo(rp)) * 0.6;
    ring.scale.set(W * 0.62 * rs, 1, W * 0.62 * rs);

    if (it > nextSweep) { sweepMat.uniforms.uPos.value += dt * 0.9; if (sweepMat.uniforms.uPos.value > 1.3) { sweepMat.uniforms.uPos.value = -0.3; nextSweep = it + 7; } }
    else if (sweepMat.uniforms.uPos.value > -0.3) sweepMat.uniforms.uPos.value = -0.3;

    const p = pGeo.attributes.position.array;
    for (let i = 0; i < N; i++) { p[i * 3 + 1] += speed[i] * dt; if (p[i * 3 + 1] > H * 1.45) p[i * 3 + 1] = 0; }
    pGeo.attributes.position.needsUpdate = true;
    pMat.opacity = 0.75 * e1 * (1 - s);

    renderer.render(scene, camera);
  }
  frame();
}
