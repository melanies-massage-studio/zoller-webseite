/* ZOLLER – Startseite: Kamerafahrt durch den Showroom.
   Gerendertes Video (Blender/Cycles, CAD-Daten der Geräte) als nahtlose Schleife – quer oder hochkant je nach
   Seitenverhältnis. Die Text-Panels wechseln beim Scrollen, die Beschriftungen folgen den Geräten im Video
   (Bildposition pro Frame aus Blender: assets/video/home/track-<land|port>.json). */

const stage = document.querySelector('[data-homefilm]');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

if (stage) init();

function init() {
  const sticky = stage.querySelector('.homefilm__sticky');
  const video = stage.querySelector('video');
  const panels = [...stage.querySelectorAll('[data-panel]')];
  const bars = [...stage.querySelectorAll('.homefilm__progress i')];
  const shadeL = stage.querySelector('.homefilm__shade--l');
  const shadeR = stage.querySelector('.homefilm__shade--r');
  const ctrl = stage.querySelector('.homefilm__ctrl');
  const tags = Object.fromEntries([...stage.querySelectorAll('[data-dev]')].map(el => [el.dataset.dev, el]));
  const base = video.dataset.base, ver = video.dataset.ver ? `?v=${video.dataset.ver}` : '';
  const mobileLayout = () => matchMedia('(max-width: 860px)').matches;

  /* ---------- Text-Panels per Scroll ---------- */
  let panelVis = [1, 0, 0];
  const progress = () => {
    const r = stage.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, stage.offsetHeight - innerHeight));
  };
  function updatePanels() {
    const p = progress();
    const seg = [0, 0.34, 0.67, 1.0001];
    const mob = mobileLayout();
    panels.forEach((el, i) => {
      const a = seg[i], b = seg[i + 1];
      const fadeIn = i === 0 ? 1 : smooth(a - 0.02, a + 0.08, p);
      const fadeOut = i === panels.length - 1 ? 1 : 1 - smooth(b - 0.08, b + 0.02, p);
      const o = Math.min(fadeIn, fadeOut);
      const dy = (1 - fadeIn) * 40 - (1 - fadeOut) * 40;
      panelVis[i] = o;
      el.style.opacity = o.toFixed(3);
      el.style.transform = mob ? `translate3d(0, ${dy.toFixed(1)}px, 0)` : `translate3d(0, calc(-50% + ${dy.toFixed(1)}px), 0)`;
      el.style.filter = o < 0.99 ? `blur(${((1 - o) * 8).toFixed(1)}px)` : 'none';
      el.style.visibility = o < 0.01 ? 'hidden' : 'visible';
    });
    bars.forEach((bar, i) => { bar.style.transform = `scaleX(${clamp((p - i / 3) * 3).toFixed(3)})`; });
    // Abdunklung auf der Seite des Textes (Panel 1 steht rechts, 0 und 2 links)
    if (shadeL) shadeL.style.opacity = Math.max(panelVis[0], panelVis[2] || 0).toFixed(3);
    if (shadeR) shadeR.style.opacity = (panelVis[1] || 0).toFixed(3);
  }
  let ticking = false;
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; updatePanels(); }); } }, { passive: true });
  addEventListener('resize', () => { updatePanels(); Object.values(tags).forEach(t => { t._w = 0; }); });
  updatePanels();

  /* ---------- Video: Fassung wählen ---------- */
  const saveData = navigator.connection && navigator.connection.saveData;
  let variant = '', track = null, trackFor = '';
  function pick() {
    const portrait = innerWidth / innerHeight < 0.9 && 'port' in video.dataset;
    const px = Math.max(innerWidth, innerHeight) * Math.min(devicePixelRatio || 1, 2);
    if (portrait) return { v: 'port', file: innerWidth < 600 ? 'port-720.mp4' : 'port-864.mp4' };
    return { v: 'land', file: px > 1300 && innerWidth >= 600 ? 'land-1080.mp4' : 'land-720.mp4' };
  }
  function load() {
    const c = pick();
    if (c.file === video.dataset.file) return;
    const t = video.currentTime || 0, wasNew = !video.dataset.file;
    video.dataset.file = c.file; variant = c.v;
    stage.classList.remove('is-playing');
    video.src = base + c.file + ver;
    video.poster = base + `poster-${c.v}.jpg${ver}`;
    if (!wasNew) video.addEventListener('loadedmetadata', () => { video.currentTime = t % (video.duration || 20); }, { once: true });
    if (trackFor !== c.v) {
      trackFor = c.v; track = null;
      fetch(base + `track-${c.v}.json${ver}`).then(r => r.json()).then(j => { if (trackFor === c.v) track = j; }).catch(() => {});
    }
    if (wantPlay()) play();
  }

  /* ---------- Abspielen / Anhalten ---------- */
  let userPaused = reduced || saveData, visible = true;
  const wantPlay = () => !userPaused && visible && !document.hidden;
  function play() { const pr = video.play(); if (pr && pr.catch) pr.catch(() => setPaused(true)); }
  function setPaused(p) {
    stage.classList.toggle('is-paused', p);
    if (ctrl) ctrl.setAttribute('aria-label', p ? ctrl.dataset.play : ctrl.dataset.pause);
  }
  video.addEventListener('playing', () => { stage.classList.add('is-playing'); setPaused(false); });
  video.addEventListener('pause', () => setPaused(true));
  ctrl?.addEventListener('click', () => {
    userPaused = !video.paused ? true : false;
    if (userPaused) video.pause(); else { if (!video.dataset.file) load(); play(); }
  });
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (!video.dataset.file) return;
    if (wantPlay()) play(); else if (!userPaused) video.pause();
  }, { rootMargin: '80px' }).observe(sticky);
  // Tab im Hintergrund: Video anhalten (spart Akku), beim Zurückkehren weiter
  document.addEventListener('visibilitychange', () => { if (wantPlay()) play(); else if (document.hidden && !video.paused) video.pause(); });
  setPaused(userPaused);
  if (!userPaused) load();
  let rt;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (video.dataset.file) load(); }, 250); });

  /* ---------- Beschriftungen an den Geräten ---------- */
  // genaue Videozeit: requestVideoFrameCallback liefert die Zeit des angezeigten Frames, dazwischen wird hochgezählt
  let mediaT = 0, mediaAt = performance.now();
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    const onFrame = (now, meta) => { mediaT = meta.mediaTime; mediaAt = now; video.requestVideoFrameCallback(onFrame); };
    video.requestVideoFrameCallback(onFrame);
  }
  const hasVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
  let sideFade = null;

  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible || !track || !video.duration) return;
    let t = hasVFC ? mediaT + (video.paused ? 0 : (now - mediaAt) / 1000 * video.playbackRate) : video.currentTime;
    const n = track.n, f = ((t * track.fps) % n + n) % n;
    const i0 = Math.floor(f), i1 = (i0 + 1) % n, a = f - i0;
    const W = sticky.clientWidth, H = sticky.clientHeight;
    const vw = track.w, vh = track.h, s = Math.max(W / vw, H / vh);
    const ox = (W - vw * s) / 2, oy = (H - vh * s) / 2;
    const mob = mobileLayout();
    // auf dem Desktop keine Beschriftung unter dem Text: Seite des sichtbaren Panels ausblenden
    const want = { '-1': mob ? 1 : 1 - Math.max(panelVis[0], panelVis[2] || 0), '1': mob ? 1 : 1 - (panelVis[1] || 0) };
    if (!sideFade) sideFade = { ...want };          // erster Frame: sofort richtig, kein Aufblitzen
    else for (const k of ['-1', '1']) sideFade[k] += (want[k] - sideFade[k]) * 0.15;
    // 1) Lage und Grund-Deckkraft aller Schilder
    const list = [];
    for (const dev in tags) {
      const d = track.d[dev], el = tags[dev];
      if (!d) continue;
      let o0 = d[i0 * 3 + 2], o1 = d[i1 * 3 + 2];
      let o = o0 + (o1 - o0) * a;
      // Sprung beim Wechsel auf das nächste Gerät derselben Art (Wiederholung der Gasse) nicht interpolieren
      const jump = Math.abs(d[i1 * 3] - d[i0 * 3]) > 0.2;
      const x = jump ? d[i0 * 3] : d[i0 * 3] + (d[i1 * 3] - d[i0 * 3]) * a;
      const y = jump ? d[i0 * 3 + 1] : d[i0 * 3 + 1] + (d[i1 * 3 + 1] - d[i0 * 3 + 1]) * a;
      if (jump) o = Math.min(o0, o1);
      const px = ox + x * vw * s, py = oy + y * vh * s;
      o *= sideFade[String(track.side[dev])];
      if (py < 70 || px < 0 || px > W) o = 0;           // nicht unter den Header schieben
      // Schild am Bildrand nach innen schieben, Strich und Punkt bleiben am Gerät
      const pill = el.firstElementChild;
      if (!el._w) { el._w = pill.offsetWidth; el._ph = pill.offsetHeight; el._h = el.offsetHeight; }
      const hw = el._w / 2 + 12;
      const shift = clamp(px, hw, Math.max(hw, W - hw)) - px;
      list.push({ el, o, px, py, shift, lose: false });
    }
    // 2) Überdecken sich zwei Schilder (Geräte hintereinander, v. a. im Hochformat), tritt das weiter entfernte
    //    Gerät zurück – es steht näher am Fluchtpunkt in der Bildmitte
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const A = list[i], B = list[j];
      if (A.o < 0.02 || B.o < 0.02) continue;
      const dx = Math.abs(A.px + A.shift - B.px - B.shift), ax = A.py - A.el._h, bx = B.py - B.el._h;
      if (dx < (A.el._w + B.el._w) / 2 + 8 && ax < bx + B.el._ph + 6 && bx < ax + A.el._ph + 6) {
        (Math.abs(A.px - W / 2) < Math.abs(B.px - W / 2) ? A : B).lose = true;
      }
    }
    // 3) anwenden
    for (const T of list) {
      const el = T.el;
      el._y = (el._y || 0) + ((T.lose ? 1 : 0) - (el._y || 0)) * 0.18;
      const o = T.o * (1 - el._y);
      if (o < 0.02) { if (el.style.visibility !== 'hidden') { el.style.visibility = 'hidden'; el.style.opacity = '0'; } continue; }
      el.style.visibility = 'visible';
      el.style.opacity = o.toFixed(3);
      if (Math.abs(T.shift - (el._s || 0)) > 0.5) { el._s = T.shift; el.style.setProperty('--shift', `${T.shift.toFixed(1)}px`); }
      el.style.transform = `translate3d(${T.px.toFixed(1)}px, ${T.py.toFixed(1)}px, 0) translate(-50%, -100%)`;
    }
  }
  requestAnimationFrame(frame);
}
