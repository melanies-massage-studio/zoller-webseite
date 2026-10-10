/* ZOLLER – Scroll-Choreografie
   Effekte, die direkt am Scrollen hängen (statt einmal beim Hereinscrollen abzulaufen):
   - Farbwechsel als Karte: schwarze und gelbe Abschnitte (und der Footer) falten sich beim Hereinscrollen von einer
     runden Karte zur vollen Breite auf und beim Verlassen wieder zusammen
   - Tiefe beim Szenenwechsel: wechselt danach die Farbe, tritt der Inhalt des alten Abschnitts zurück
   - Laufband mit allen Solutions (Startseite): Tempo und Richtung folgen dem Scrollen
   - Smart-Factory-Karte schwebt durch das Bild, Schriftzug am Seitenende steigt aus der Unterkante
   - Messskala (Desktop): Lineal am rechten Rand mit Lesefortschritt
   Läuft nach main.js (Lenis und GSAP sind dann eingerichtet). Bei »Bewegung reduzieren« bleibt alles stehen. */
(() => {
  'use strict';

  const root = document.documentElement;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || root.classList.contains('reduced-motion')) return;
  const body = document.body;
  const main = document.querySelector('main');
  if (!main) return;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = (t) => t * t * (3 - 2 * t);
  let vh = innerHeight, vw = innerWidth;

  /* ---------------------------------------------------------------- Farben */
  const rgb = (c) => { const m = c.match(/[\d.]+/g); if (!m || (m.length > 3 && +m[3] < 0.5)) return null; return m.slice(0, 3).map(Number); };
  // sichtbare Hintergrundfarbe: eigene, sonst die des nächsten Vorfahren mit Farbe
  const bgOf = (el) => {
    for (let n = el; n && n !== root; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c) return c; }
    return [255, 255, 255];
  };
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / 441.7;
  // »kräftig«: dunkel oder ZOLLER-Gelb – nur diese Abschnitte werden zur Karte
  const strong = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255 < 0.25 || (c[0] > 180 && c[1] > 160 && c[2] < 120);
  const css = (c) => `rgb(${c.join(',')})`;
  const inFlow = (el) => el.offsetHeight > 0 && !el.matches('script, style, dialog, template, .subnav') && getComputedStyle(el).position !== 'fixed';
  // Nachbar im Seitenfluss (überspringt Unsichtbares; am Ende von <main> geht es mit Brotkrumen/Footer weiter)
  const flow = (el, dir) => {
    const step = dir < 0 ? 'previousElementSibling' : 'nextElementSibling';
    for (let n = el; n && n !== body; n = n.parentElement) {
      let s = n[step];
      while (s && !inFlow(s)) s = s[step];
      if (s) return s === main ? main[dir < 0 ? 'lastElementChild' : 'firstElementChild'] : s;
    }
    return null;
  };

  /* ------------------------------------------- Farbwechsel als Karte (Unfold) */
  // erst alle Farben lesen, dann umbauen – sonst sähe ein Abschnitt schon den umgebauten Nachbarn
  const footer = $('.site-footer');
  const SKIP = '.hero, .ev-hero, .homefilm, .worldflight, .hscroll, .immersive, .globe, .product-hero, .subnav, .band, .breadcrumb';
  const curtain = $('main > :is(.hero, .ev-hero):first-child');
  const unfolds = [];
  [...main.children, footer].forEach((el) => {
    if (!el || !inFlow(el) || el.matches(SKIP)) return;
    if (el === main.firstElementChild || (curtain && el === curtain.nextElementSibling)) return;   // Seitenanfang / Blatt über dem Vorhang
    const own = bgOf(el);
    if (!strong(own)) return;
    const p = flow(el, -1), n = el === footer ? null : flow(el, 1);
    const pc = p && bgOf(p), nc = n && bgOf(n);
    const inE = !!pc && dist(pc, own) > 0.2, inX = !!nc && dist(nc, own) > 0.2;
    if (inE || inX) unfolds.push({ el, own, pc: inE ? pc : own, nc: inX ? nc : own, inE, inX, k: -1 });
  });

  /* --------------------------------------- Tiefe beim Szenenwechsel (Recede) */
  const recedes = [];
  $$(':scope > section.section', main).forEach((sec) => {
    if (sec.matches('.hscroll, .page-title') || sec.querySelector('[data-hscroll], .kpi-scroller, .timeline, [data-locations], .globe')) return;   // klebende Teile nicht verschieben
    const wrap = sec.querySelector(':scope > .wrap');
    const n = flow(sec, 1);
    if (!wrap || !n || dist(bgOf(sec), bgOf(n)) < 0.2) return;
    recedes.push({ sec, wrap, t: -1 });
  });

  unfolds.forEach((u) => {
    u.el.classList.add('unfold');
    u.el.style.background = `linear-gradient(${css(u.pc)} 50%, ${css(u.nc)} 50%)`;
    u.bg = document.createElement('i');
    u.bg.className = 'uf-bg'; u.bg.setAttribute('aria-hidden', 'true');
    u.bg.style.background = css(u.own);
    u.el.prepend(u.bg);
  });

  // Alle update-Funktionen bekommen fertig gemessene Werte (erst messen, dann schreiben – kein Layout-Hin-und-Her)
  const updateUnfold = (rects) => {
    const X = clamp(vw * 0.035, 10, 64), R = clamp(vw * 0.028, 18, 44);
    unfolds.forEach((u, i) => {
      const r = rects[i];
      let k = 0;
      if (r.bottom > -40 && r.top < vh + 40) {
        if (u.inE) k = Math.max(k, 1 - ease(clamp((vh - r.top) / (vh * 0.55))));        // Oberkante: Fensterrand → 45 % Höhe
        if (u.inX) k = Math.max(k, ease(clamp((vh * 0.5 - r.bottom) / (vh * 0.5))));    // Unterkante: halbe Höhe → oberer Rand
      } else k = r.top >= vh + 40 ? +u.inE : +u.inX;
      if (Math.abs(k - u.k) < 0.0015) return;
      u.k = k;
      u.bg.style.clipPath = k > 0.002 ? `inset(0 ${(k * X).toFixed(1)}px round ${(k * R).toFixed(1)}px)` : '';
    });
  };

  const updateRecede = (rects) => {
    recedes.forEach((c, i) => {
      const r = rects[i];
      if (r.height < vh * 0.6) return;   // kurze Abschnitte stehen ganz im Bild – dort würde der Text mitten im Lesen wegrücken
      const t = clamp((vh * 0.55 - r.bottom) / (vh * 0.55));   // Unterkante: 55 % Höhe → oberer Rand
      if (Math.abs(t - c.t) < 0.002) return;
      c.t = t;
      const s = c.wrap.style;
      if (t <= 0) { s.transform = ''; s.opacity = ''; s.willChange = ''; return; }
      s.willChange = 'transform, opacity';
      s.transform = `translate3d(0, ${(t * vh * 0.14).toFixed(1)}px, 0) scale(${(1 - 0.04 * t).toFixed(4)})`;
      s.opacity = (1 - 0.5 * t * t).toFixed(3);
    });
  };

  /* ------------------------------------------- Schriftzug am Seitenende */
  const mark = $('.footer-mark__svg');
  let markT = -1;
  const updateMark = (r) => {
    if (!r) return;
    if (r.top > vh) { if (markT !== 0) { markT = 0; mark.style.transform = 'translate3d(0, 75%, 0)'; } return; }
    const t = ease(clamp((vh - r.top) / Math.max(1, r.height)));
    if (Math.abs(t - markT) < 0.002) return;
    markT = t;
    mark.style.transform = `translate3d(0, ${((1 - t) * 75).toFixed(2)}%, 0)`;
  };

  /* ------------------------------------------------------------ Messskala */
  // Lineal am rechten Rand (Desktop mit Maus, nicht auf der Startseite – die hat eigene Fortschrittsanzeigen).
  // Die Teilstriche laufen beim Scrollen mit, der gelbe Zeiger steht; die Anzeige daneben zeigt den Lesefortschritt.
  let ms = null, msTicks, msFill, msVal, msTimer = 0, msShown = -1;
  const fineMQ = matchMedia('(hover: hover) and (pointer: fine)');
  const msWanted = () => fineMQ.matches && vw >= 1024;
  if (!body.classList.contains('page-home')) {
    ms = document.createElement('div');
    ms.className = 'mscale'; ms.setAttribute('aria-hidden', 'true');
    ms.innerHTML = '<div class="mscale__body"><div class="mscale__ticks"></div><div class="mscale__fill"><i></i></div><div class="mscale__ptr"></div></div><div class="mscale__val"><span>0</span><small>%</small></div>';
    body.append(ms);
    msTicks = $('.mscale__ticks', ms); msFill = $('.mscale__fill i', ms); msVal = $('.mscale__val span', ms);
  }
  const updateScale = (docH, moved) => {
    if (!ms) return;
    const on = msWanted() && docH - vh > vh * 1.2;
    root.classList.toggle('has-mscale', on);
    if (!on) { ms.classList.remove('is-on'); return; }
    const y = scrollY, p = clamp(y / Math.max(1, docH - vh));
    msTicks.style.transform = `translate3d(0, ${(-(y * 0.5) % 30).toFixed(2)}px, 0)`;
    msFill.style.transform = `scaleY(${p.toFixed(4)})`;
    const pct = Math.round(p * 100);
    if (pct !== msShown) { msShown = pct; msVal.textContent = pct; }
    if (moved) {
      ms.classList.add('is-on');
      clearTimeout(msTimer);
      msTimer = setTimeout(() => ms.classList.remove('is-on'), 1200);
    }
  };

  /* -------------------------------------------------------------- Schleife */
  let queued = false, moved = false;
  const frame = () => {
    queued = false;
    const uR = unfolds.map((u) => u.el.getBoundingClientRect());
    const cR = recedes.map((c) => c.sec.getBoundingClientRect());
    const mR = mark && mark.parentElement.getBoundingClientRect();
    const docH = root.scrollHeight;
    updateUnfold(uR);
    updateRecede(cR);
    updateMark(mR);
    updateScale(docH, moved);
    moved = false;
  };
  const request = (m) => { moved = moved || m; if (!queued) { queued = true; requestAnimationFrame(frame); } };
  addEventListener('scroll', () => request(true), { passive: true });
  addEventListener('resize', () => { vh = innerHeight; vw = innerWidth; unfolds.forEach((u) => { u.k = -1; }); recedes.forEach((c) => { c.t = -1; }); markT = -1; request(false); });
  addEventListener('load', () => request(false));
  request(false);

  /* -------------------------------------------------------- Laufband (Startseite) */
  $$('[data-band]').forEach((band) => {
    const rows = $$('[data-band-row]', band).map((r) => ({ dir: +r.dataset.bandRow, track: $('.band__track', r), set: $('.band__set', r), x: 0, w: 0 }));
    const measure = () => rows.forEach((r, i) => { const old = r.w; r.w = r.set.offsetWidth; if (!old && i) r.x = -r.w * 0.37; });
    measure();
    addEventListener('resize', measure);
    document.fonts?.ready.then(measure);
    let visible = false, last = 0, lastY = scrollY, vel = 0, dir = 1;
    const tick = (now) => {
      if (!visible) return;
      const dt = Math.min(0.064, (now - last) / 1000 || 0.016); last = now;
      const y = scrollY, dy = y - lastY; lastY = y;
      vel += (dy / dt - vel) * Math.min(1, dt * 7);   // geglättete Scroll-Geschwindigkeit (px/s)
      if (Math.abs(dy) > 0.5) dir = Math.sign(dy);
      const speed = 34 + Math.min(1600, Math.abs(vel)) * 0.4;
      for (const r of rows) {
        if (!r.w) continue;
        r.x -= r.dir * dir * speed * dt;
        r.x %= r.w; if (r.x > 0) r.x -= r.w;
        r.track.style.transform = `translate3d(${r.x.toFixed(2)}px, 0, 0)`;
      }
      requestAnimationFrame(tick);
    };
    new IntersectionObserver(([e]) => {
      const was = visible; visible = e.isIntersecting;
      if (visible && !was) { last = performance.now(); lastY = scrollY; requestAnimationFrame(tick); }
    }, { rootMargin: '80px 0px' }).observe(band);
  });

  /* ------------------------------------- Smart-Factory-Karte schwebt durch das Bild */
  if (window.gsap && window.ScrollTrigger) {
    $$('.immersive').forEach((sec) => {
      const card = $('.immersive__card', sec);
      if (!card) return;
      gsap.fromTo(card, { y: () => vh * 0.16 }, { y: () => -vh * 0.06, ease: 'none',
        scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true } });
    });
  }
})();
