/* ZOLLER – gemeinsame Teile der 3D-Globen (Three.js)
   Erde als dunkle Kugel mit Fresnel-Kante, Atmosphäre, Landmassen als Punktraster
   (assets/js/globe-land.js), Gradnetz und der Messring mit Skala. Genutzt vom
   Standortglobus (globe.js) und vom Globus im Länderdialog (countryglobe.js). */

import * as THREE from 'three';
import { POINTS, LAND } from './globe-land.js';

export const TAU = Math.PI * 2, DEG = Math.PI / 180;
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const YELLOW = new THREE.Color('#f0e600'), WHITE = new THREE.Color('#ffffff');

export function vec(lat, lng, r = 1) {
  const a = lat * DEG, b = lng * DEG;
  return new THREE.Vector3(Math.cos(a) * Math.sin(b) * r, Math.sin(a) * r, Math.cos(a) * Math.cos(b) * r);
}

export function landPoints() {
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
export function arcPoints(a, b, n = 64) {
  const angle = a.angleTo(b), lift = 0.03 + angle * 0.14, pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = new THREE.Vector3().copy(a).lerp(b, t).normalize();
    pts.push(p.multiplyScalar(1 + Math.sin(Math.PI * t) * lift));
  }
  return pts;
}

/* Erde, Atmosphäre, Landpunkte, Gradnetz und Messring in eine neue Szene setzen.
   dotMat.uniforms.uFocus/uFocusOn heben die Landpunkte rund um einen Ort gelb hervor. */
export function createEarth(renderer) {
  const scene = new THREE.Scene();
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

  return { scene, earth, ring, uni, dotMat };
}

/* Standort-Markierung: Punkt, Lichtsäule und Pulsring (Gruppe steht senkrecht auf der Kugel) */
const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0);
const headGeo = new THREE.SphereGeometry(1, 16, 12);
const ringGeo = new THREE.RingGeometry(0.72, 1, 48);
const UP = new THREE.Vector3(0, 1, 0);
const beamMat = (color, o) => new THREE.ShaderMaterial({
  uniforms: { uColor: { value: color }, uO: { value: o } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: 'uniform vec3 uColor; uniform float uO; varying float vY; void main(){ gl_FragColor = vec4(uColor, (1. - vY) * uO); }',
});
export function createMarker(lat, lng, color, beamOpacity) {
  const n = vec(lat, lng), g = new THREE.Group();
  g.position.copy(n); g.quaternion.setFromUnitVectors(UP, n);
  const head = new THREE.Mesh(headGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
  head.position.y = 0.002; g.add(head);
  const beam = new THREE.Mesh(beamGeo, beamMat(color, beamOpacity)); g.add(beam);
  const pulse = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  pulse.rotation.x = -Math.PI / 2; pulse.position.y = 0.003; g.add(pulse);
  return { g, head, beam, pulse, n };
}
