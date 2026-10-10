/* ZOLLER – Interaktion & Scroll-Effekte */
(() => {
  'use strict';

  // Sicherheitsnetz im <head>: ohne dieses Signal blendet die Seite nach 5 s alles ohne Animation ein
  window.ZOLLER_READY = true;
  const doc = document.documentElement;
  const body = document.body;
  const ROOT = body.dataset.root || './';
  const ASSET_V = ((document.currentScript && document.currentScript.src) || '').split('?v=')[1] || '';
  // Übersetzungen der Länderseiten (window.ZI18N, deutscher Text als Schlüssel)
  const T = (s) => (window.ZI18N && window.ZI18N[s]) || s;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGSAP = !!(window.gsap && window.ScrollTrigger) && !reduced;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  /* ---------------------------------------------------------------- Lenis */
  let lenis = null;
  if (hasGSAP) {
    gsap.registerPlugin(ScrollTrigger);
    if (window.Lenis && !matchMedia('(pointer: coarse)').matches) {
      lenis = new Lenis({ duration: 1.15, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
      lenis.on('scroll', ScrollTrigger.update);
      window.__lenis = lenis;
      gsap.ticker.add(t => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    }
  }
  const scrollToY = (y) => lenis ? lenis.scrollTo(y) : window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });

  // Anker-Links sanft scrollen
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute('href').length < 2) return;
    const t = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));
    if (!t) return;
    e.preventDefault();
    const off = (parseInt(getComputedStyle(doc).scrollPaddingTop) || 120);
    scrollToY(t.getBoundingClientRect().top + window.scrollY - off);
    history.replaceState(null, '', a.getAttribute('href'));
  });

  /* --------------------------------------------------------------- Header */
  const header = $('[data-header]');
  let lastY = window.scrollY;
  const onScroll = () => {
    const y = window.scrollY;
    const down = y > lastY && y > 140;
    const megaOpen = !!$('.mainnav__item.is-open');
    if (!body.classList.contains('nav-open') && !megaOpen) {
      header.classList.toggle('is-hidden', down);
      body.classList.toggle('header-visible', !down);
    }
    header.classList.toggle('is-scrolled', y > 10);
    const tt = $('[data-to-top]');
    if (tt) tt.classList.toggle('is-visible', y > 900);
    lastY = y;
  };
  body.classList.add('header-visible');
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Passen Menü und Werkzeuge nicht nebeneinander (lange Menütexte, z. B. Französisch), blenden fit-1 … fit-5
  // nacheinander Zusätze aus (main.css) – zuletzt wandert das Menü hinter den Burger
  const mainList = $('.mainnav__list');
  const headerTools = $('.site-header__tools');
  const FIT = ['fit-1', 'fit-2', 'fit-3', 'fit-4', 'fit-5'];
  const fitHeader = () => {
    header.classList.remove(...FIT);
    for (const cls of FIT) {
      const last = mainList?.lastElementChild;
      if (!last || !last.offsetWidth) break;   // Menü steckt schon per CSS hinter dem Burger
      if (last.getBoundingClientRect().right + 16 <= headerTools.getBoundingClientRect().left) break;
      header.classList.add(cls);
    }
  };
  let fitTimer = 0;
  fitHeader();
  window.addEventListener('resize', () => { clearTimeout(fitTimer); fitTimer = setTimeout(fitHeader, 60); });
  document.fonts?.ready.then(fitHeader);
  $('[data-to-top]')?.addEventListener('click', () => scrollToY(0));

  /* ------------------------------------------------------------ Mega-Menü */
  const megaItems = $$('.mainnav__item.has-mega');
  let closeTimer;
  const closeAll = (except) => megaItems.forEach(li => {
    if (li !== except) { li.classList.remove('is-open'); li.querySelector('.mainnav__link').setAttribute('aria-expanded', 'false'); }
  });
  megaItems.forEach(li => {
    const link = li.querySelector('.mainnav__link');
    const open = () => { clearTimeout(closeTimer); closeAll(li); li.classList.add('is-open'); link.setAttribute('aria-expanded', 'true'); header.classList.remove('is-hidden'); };
    const close = () => { closeTimer = setTimeout(() => { li.classList.remove('is-open'); link.setAttribute('aria-expanded', 'false'); }, 180); };
    li.addEventListener('mouseenter', () => { if (matchMedia('(hover: hover)').matches) { clearTimeout(closeTimer); closeTimer = setTimeout(open, 90); } });
    li.addEventListener('mouseleave', () => { clearTimeout(closeTimer); close(); });
    li.addEventListener('focusin', open);
    li.addEventListener('focusout', (e) => { if (!li.contains(e.relatedTarget)) close(); });
    link.addEventListener('click', (e) => {
      if (!matchMedia('(hover: hover)').matches && !li.classList.contains('is-open')) { e.preventDefault(); open(); }
    });
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeAll(); closeSearch(); body.classList.remove('nav-open'); } });

  /* ------------------------------------------------------- Mobile-Navi */
  const burger = $('[data-burger]');
  burger?.addEventListener('click', () => {
    const open = body.classList.toggle('nav-open');
    burger.setAttribute('aria-expanded', String(open));
    header.classList.remove('is-hidden');
    if (lenis) open ? lenis.stop() : lenis.start();
  });

  /* ---------------------------------------------------------------- Suche */
  const search = $('[data-search]');
  const sInput = $('[data-search-input]');
  const sResults = $('[data-search-results]');
  const sHint = $('[data-search-hint]');
  let index = null;
  const loadIndex = async () => {
    if (index) return index;
    try { index = await fetch(ROOT + (body.dataset.index || 'assets/search-index.json')).then(r => r.json()); } catch (e) { index = []; }
    return index;
  };
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[»«„“"]/g, '');
  const runSearch = async (q, list, hint) => {
    const idx = await loadIndex();
    const terms = norm(q).split(/\s+/).filter(t => t.length > 1);
    list.innerHTML = '';
    if (!terms.length) { if (hint) hint.textContent = T('Produkte, Lösungen, Downloads, Stories …'); return; }
    const res = [];
    for (const p of idx) {
      const t = norm(p.t), x = norm(p.x + ' ' + p.d);
      let score = 0, ok = true;
      for (const term of terms) {
        const inT = t.includes(term), inX = x.includes(term);
        if (!inT && !inX) { ok = false; break; }
        score += (inT ? 10 : 0) + (inX ? 1 : 0) + (t.startsWith(term) ? 5 : 0);
      }
      if (ok) res.push([score - p.u.split('/').length * 0.3, p]);
    }
    res.sort((a, b) => b[0] - a[0]);
    if (hint) hint.textContent = res.length ? `${res.length} ${T('Treffer')}` : T('Keine Treffer – versuchen Sie einen anderen Begriff.');
    const sec = { produkte: T('Produkte'), solutions: T('Solutions'), unternehmen: T('Unternehmen'), 'ihr-erfolg': T('Ihr Erfolg'), events: T('Events'), academy: T('Academy'), start: T('Start') };
    list.innerHTML = res.slice(0, 40).map(([, p]) =>
      `<li><a href="${ROOT}${p.u}"><small>${sec[p.s] || p.s.replace(/-/g, ' ')}</small>${escapeHtml(p.t)}<small>${escapeHtml(p.d.slice(0, 140))}</small></a></li>`).join('');
  };
  const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function openSearch() {
    search.classList.add('is-open'); body.classList.remove('nav-open');
    if (lenis) lenis.stop();
    setTimeout(() => sInput.focus(), 50); loadIndex();
  }
  function closeSearch() {
    if (!search?.classList.contains('is-open')) return;
    search.classList.remove('is-open'); if (lenis) lenis.start();
  }
  $$('[data-search-open]').forEach(b => b.addEventListener('click', openSearch));
  $('[data-search-close]')?.addEventListener('click', closeSearch);
  search?.addEventListener('click', (e) => { if (e.target === search) closeSearch(); });
  let sT;
  sInput?.addEventListener('input', () => { clearTimeout(sT); sT = setTimeout(() => runSearch(sInput.value, sResults, sHint), 120); });
  $$('[data-inline-search]').forEach(inp => {
    const list = inp.parentElement.querySelector('[data-inline-results]');
    const q = new URLSearchParams(location.search).get('q') || new URLSearchParams(location.search).get('tx_kesearch_pi1[sword]');
    if (q) { inp.value = q; runSearch(q, list); }
    inp.addEventListener('input', () => { clearTimeout(sT); sT = setTimeout(() => runSearch(inp.value, list), 120); });
  });

  /* -------------------------------------------------------------- Dialoge */
  // Länderdialog mit Globus (countryglobe.js): Modul beim ersten Zeigen auf den Knopf vorladen, beim Öffnen starten
  const langDialog = $('[data-lang-dialog]');
  let cglobe = null;
  const loadGlobe = () => {
    if (!cglobe && langDialog) {
      const url = new URL(ROOT + 'assets/js/countryglobe.js' + (ASSET_V ? '?v=' + ASSET_V : ''), document.baseURI).href;
      cglobe = import(url).then(m => m.mount(langDialog)).catch((e) => {
        console.warn('Länderglobus deaktiviert:', e); langDialog.classList.add('is-static'); return null;
      });
    }
    return cglobe;
  };
  $$('[data-lang-open]').forEach(b => {
    b.addEventListener('pointerenter', loadGlobe, { once: true });
    b.addEventListener('click', () => {
      if (!langDialog) return;
      langDialog.showModal();
      if (lenis) lenis.stop();
      loadGlobe()?.then(g => g && langDialog.open && g.open());
    });
  });
  $$('dialog').forEach(d => {
    d.addEventListener('click', (e) => {
      if (e.target === d || e.target.closest('[data-close]')) d.close();
    });
    d.addEventListener('close', () => lenis && lenis.start());
  });
  $$('[data-modal]').forEach(b => b.addEventListener('click', () => {
    const d = document.getElementById(b.dataset.modal);
    if (d) { d.showModal(); if (lenis) lenis.stop(); }
  }));

  /* --------------------------------------------------------- YouTube 2-Klick */
  $$('[data-yt]').forEach(el => {
    const id = el.dataset.yt;
    const consent = el.querySelector('.video-consent');
    consent.style.backgroundImage = `linear-gradient(0deg, rgba(0,0,0,.65), rgba(0,0,0,.35)), url(https://i.ytimg.com/vi/${id}/hqdefault.jpg)`;
    consent.style.backgroundSize = 'cover';
    consent.style.backgroundPosition = 'center';
    el.addEventListener('click', () => {
      el.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0" title="${T('YouTube-Video')}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
    }, { once: true });
  });

  /* ------------------------------------------------------ Events nach Land */
  // Zuerst nur die Events des eigenen Landes; »Weltweit« zeigt alle, die Chips darunter ein anderes Land.
  // ?events=all öffnet direkt mit allen Events.
  $$('[data-events]').forEach((box) => {
    const today = new Date().toISOString().slice(0, 10);
    $$('[data-ev]', box).forEach((e) => { if (e.dataset.end < today) e.remove(); });   // seit dem Bauen vorbei
    const evs = $$('[data-ev]', box);
    const chips = $$('.ev-chip', box);
    chips.forEach((c) => {
      const n = evs.filter((e) => !c.dataset.evCountry || e.dataset.country === c.dataset.evCountry).length;
      const small = c.querySelector('small'); if (small) small.textContent = n;
      if (!n && !c.matches('.ev-chip--home, .ev-chip--world')) c.remove();
    });
    const empty = $('[data-ev-empty]', box);
    const show = (country, scroll) => {
      $$('.ev-chip', box).forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.evCountry === country)));
      let n = 0;
      evs.forEach((e) => { const on = !country || e.dataset.country === country; e.hidden = !on; if (on) n++; });
      $$('[data-ev-month]', box).forEach((m) => { m.hidden = !m.querySelector('[data-ev]:not([hidden])'); });
      if (empty) empty.hidden = n > 0;
      box.classList.remove('is-switching'); void box.offsetWidth; box.classList.add('is-switching');
      if (scroll && box.getBoundingClientRect().top < 0) scrollToY(box.getBoundingClientRect().top + window.scrollY - 120);
      if (window.ScrollTrigger) ScrollTrigger.refresh();
    };
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-ev-country]'); if (b) show(b.dataset.evCountry, true); });
    show(new URLSearchParams(location.search).get('events') === 'all' ? '' : box.dataset.home, false);
  });

  /* ------------------------------------------------------------- Hotspots */
  $$('.hotspots').forEach(hs => $$('.hotspot', hs).forEach((h, i) => h.style.setProperty('--i', i)));   // Reihenfolge beim Aufspringen
  $$('.hotspot').forEach(h => {
    const btn = h.querySelector('.hotspot__btn');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !h.classList.contains('is-open');
      $$('.hotspot.is-open').forEach(o => { o.classList.remove('is-open'); o.querySelector('.hotspot__btn').setAttribute('aria-expanded', 'false'); });
      h.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
    });
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.hotspot')) $$('.hotspot.is-open').forEach(o => o.classList.remove('is-open')); });

  /* -------------------------------------------------------------- Slider */
  const updateSlider = (track) => {
    const id = track.id;
    const prev = $(`[data-prev="${id}"]`), next = $(`[data-next="${id}"]`);
    if (!prev || !next) return;
    prev.disabled = track.scrollLeft < 8;
    next.disabled = track.scrollLeft + track.clientWidth > track.scrollWidth - 8;
  };
  $$('.slider__track').forEach(track => {
    const step = (dir) => {
      const slide = track.querySelector('.slider__slide');
      const w = slide ? slide.getBoundingClientRect().width + 20 : track.clientWidth * .8;
      track.scrollBy({ left: dir * w, behavior: reduced ? 'auto' : 'smooth' });
    };
    $(`[data-prev="${track.id}"]`)?.addEventListener('click', () => step(-1));
    $(`[data-next="${track.id}"]`)?.addEventListener('click', () => step(1));
    track.addEventListener('scroll', () => updateSlider(track), { passive: true });
    track.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); });
    updateSlider(track);
  });

  /* ---------------------------------------------------------- Hero-Slides */
  $$('[data-hero]').forEach(hero => {
    const slides = $$('.hero__slide', hero), dots = $$('.hero__dots button', hero);
    if (slides.length < 2) return;
    let i = 0, timer;
    const go = (n) => {
      slides[i].classList.remove('is-active'); dots[i]?.classList.remove('is-active');
      i = (n + slides.length) % slides.length;
      slides[i].classList.add('is-active');
      if (dots[i]) { dots[i].classList.remove('is-active'); void dots[i].offsetWidth; dots[i].classList.add('is-active'); }
    };
    const play = () => { clearInterval(timer); timer = setInterval(() => go(i + 1), 6000); };
    dots.forEach((d, n) => d.addEventListener('click', () => { go(n); play(); }));
    if (!reduced) play();
  });

  /* ---------------------------------------------------------- Zahlen zählen */
  // Zahlenformat der Seite: de/fr 1.000 bzw. 1 000 und 0,4 · en/es-MX 1,000 und 0.4
  const numLocale = document.documentElement.lang || 'de-DE';
  const dotDecimal = /^(en|es-MX)/i.test(numLocale);
  const parseCount = (txt) => {
    const m = txt.match(dotDecimal ? /(\d{1,3}(?:[,\s\u00a0\u202f]\d{3})+|\d+(?:[.,]\d+)?)/ : /(\d{1,3}(?:[.\s\u00a0\u202f]\d{3})+|\d+(?:[.,]\d+)?)/);
    if (!m) return null;
    const raw = m[1];
    const thousands = (dotDecimal ? /\d[,\s\u00a0\u202f]\d{3}(\D|$)/ : /\d[.\s\u00a0\u202f]\d{3}(\D|$)/).test(raw) && !raw.includes(dotDecimal ? '.' : ',');
    const decimals = !thousands && /[.,]/.test(raw) ? raw.split(/[.,]/)[1].length : 0;
    const value = parseFloat(thousands ? raw.replace(/[.,\s\u00a0\u202f]/g, '') : raw.replace(',', '.'));
    return { raw, value, decimals, thousands, locale: numLocale, sep: raw.includes(',') ? ',' : '.', before: txt.slice(0, m.index), after: txt.slice(m.index + raw.length) };
  };
  const fmt = (v, c) => {
    if (c.thousands) return Math.round(v).toLocaleString(c.locale);
    return c.decimals ? v.toFixed(c.decimals).replace('.', c.sep) : String(Math.round(v));
  };
  const counters = $$('[data-count]');
  const runCount = (el) => {
    if (el.dataset.counted) return;
    el.dataset.counted = '1';
    const c = parseCount(el.textContent.trim());
    if (!c || reduced) return;
    const dur = 1600, t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 4);
      el.textContent = c.before + fmt(c.value * e, c) + c.after;
      if (p < 1) requestAnimationFrame(tick); else el.textContent = c.before + c.raw + c.after;
    };
    requestAnimationFrame(tick);
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => entries.forEach(en => { if (en.isIntersecting) { runCount(en.target); io.unobserve(en.target); } }), { threshold: .6 });
    counters.forEach(c => io.observe(c));
  }

  /* --------------------------------------------- Wort-für-Wort (Statements) */
  $$('[data-words]').forEach(el => {
    const walk = (node) => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const s = document.createElement('span'); s.className = 'w'; s.textContent = part; frag.appendChild(s);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    };
    walk(el);
    el.classList.add('words-ready');
  });

  /* ------------------------------------------------------ Lesefortschritt */
  // Gelbe Linie am oberen Rand; nur auf längeren Seiten (Startseite hat ihre eigene Fortschrittsanzeige).
  // Wo der Browser scroll-gebundene CSS-Animationen kann, läuft sie ohne JavaScript (main.css).
  if (!body.classList.contains('page-home')) {
    const bar = document.createElement('div'); bar.className = 'scroll-progress'; bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML = '<i></i>'; body.append(bar);
    const fill = bar.firstChild;
    const cssTimeline = window.CSS && CSS.supports('animation-timeline: scroll()');
    let pt = false;
    const upd = () => {
      pt = false;
      const max = doc.scrollHeight - innerHeight;
      bar.hidden = max < innerHeight * 1.2;   // kurze Seiten brauchen keine Anzeige
      if (!cssTimeline) fill.style.setProperty('--p', Math.min(1, Math.max(0, scrollY / Math.max(1, max))).toFixed(4));
    };
    if (!cssTimeline) window.addEventListener('scroll', () => { if (!pt) { pt = true; requestAnimationFrame(upd); } }, { passive: true });
    window.addEventListener('resize', upd); window.addEventListener('load', upd); upd();
  }

  /* ------------------------------------------------------- Einblenden (IO) */
  const reveals = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !reduced) {
    const rio = new IntersectionObserver((entries) => entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('is-in'); rio.unobserve(en.target); }
    }), { rootMargin: '0px 0px -8% 0px', threshold: 0.01 });
    reveals.forEach(el => rio.observe(el));
    // Sicherheitsnetz: nichts bleibt dauerhaft unsichtbar
    setTimeout(() => reveals.forEach(el => { if (el.getBoundingClientRect().top < innerHeight) el.classList.add('is-in'); }), 1800);
  } else {
    reveals.forEach(el => el.classList.add('is-in'));
  }

  /* ------------------------------------------------------ Scroll-Effekte */
  if (hasGSAP) {
    // Bildmasken öffnen sich beim Scrollen
    $$('.reveal-mask').forEach(el => {
      gsap.fromTo(el, { clipPath: 'inset(12% 6% 12% 6% round 22px)' }, {
        clipPath: 'inset(0% 0% 0% 0% round 22px)', ease: 'none',
        scrollTrigger: { trigger: el, start: 'top 95%', end: 'top 35%', scrub: .6 },
      });
    });
    // Bild-Zoom innerhalb von Rahmen
    $$('[data-parallax-img] img').forEach(img => {
      gsap.fromTo(img, { scale: 1.18 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: img.closest('[data-parallax-img]'), start: 'top bottom', end: 'bottom top', scrub: true } });
    });
    // Parallax
    $$('img[data-parallax]').forEach(img => {
      gsap.fromTo(img, { yPercent: -8 }, { yPercent: 8, ease: 'none', scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
    // Vorhang-Hero (erstes Element der Seite, main.css): bleibt stehen, dunkelt ab, der Inhalt gleitet darüber.
    // Feste Scroll-Werte statt trigger, weil ein klebendes Element beim Messen sonst am Bildrand »mitwandert«.
    const curtain = $('main > :is(.hero, .ev-hero):first-child');
    const coverST = (el) => ({ start: 0, end: () => el.offsetHeight, scrub: true, invalidateOnRefresh: true });
    if (curtain) {
      gsap.fromTo(curtain, { '--cover': 0 }, { '--cover': 1, ease: 'none', scrollTrigger: coverST(curtain) });
      const inner = curtain.querySelector('.ev-hero__inner');
      if (inner) gsap.to(inner, { yPercent: -10, scale: .96, ease: 'none', scrollTrigger: coverST(curtain) });
    }
    // Seiten-Hero: Bild zoomt, Text wandert aus
    $$('[data-hero]').forEach(hero => {
      const media = hero.querySelector('[data-hero-parallax]');
      const copy = hero.querySelector('[data-hero-copy]');
      const st = hero === curtain ? coverST(hero) : { trigger: hero, start: 'top top', end: 'bottom top', scrub: true };
      const tl = gsap.timeline({ scrollTrigger: st });
      if (media) tl.fromTo(media, { scale: 1.08, yPercent: 0 }, { scale: 1, yPercent: hero === curtain ? 6 : 14, ease: 'none' }, 0);
      if (copy) tl.to(copy, { yPercent: -30, opacity: 0, ease: 'none' }, 0);
      if (copy) gsap.from(copy.children, { y: 50, opacity: 0, duration: 1.4, ease: 'expo.out', stagger: .1, delay: .15 });
    });
    // Produkt-Hero (Apple-Stil): Bild schwebt hoch, Titel skaliert
    $$('.product-hero').forEach(ph => {
      const img = ph.querySelector('[data-product-img]');
      const copy = ph.querySelector('[data-hero-copy]');
      if (ph.hasAttribute('data-product-stage')) {
        // 3D-Bühne animiert das Gerät selbst; hier nur Text und sanftes Ausblenden beim Scrollen
        if (copy) gsap.from(copy.children, { y: 40, opacity: 0, duration: 1.3, ease: 'expo.out', stagger: .1, delay: .15 });
        if (copy) gsap.to(copy, { yPercent: -18, opacity: .15, ease: 'none', scrollTrigger: { trigger: ph, start: 'top top', end: 'bottom top', scrub: true } });
        gsap.to(img, { yPercent: -8, ease: 'none', scrollTrigger: { trigger: ph, start: 'top top', end: 'bottom top', scrub: true } });
        return;
      }
      gsap.from(img, { y: 120, opacity: 0, scale: .92, duration: 1.6, ease: 'expo.out', delay: .1 });
      if (copy) gsap.from(copy.children, { y: 40, opacity: 0, duration: 1.3, ease: 'expo.out', stagger: .12 });
      gsap.to(img, { yPercent: -12, scale: 1.06, ease: 'none', scrollTrigger: { trigger: ph, start: 'top top', end: 'bottom top', scrub: true } });
      if (copy) gsap.to(copy, { yPercent: -20, opacity: .2, ease: 'none', scrollTrigger: { trigger: ph, start: 'top top', end: 'bottom top', scrub: true } });
    });
    // Statements: Wörter leuchten nacheinander auf
    $$('[data-words]').forEach(el => {
      const words = $$('.w', el);
      ScrollTrigger.create({
        trigger: el, start: 'top 85%', end: 'bottom 45%', scrub: true,
        onUpdate: (st) => { const n = Math.round(st.progress * words.length); words.forEach((w, i) => w.classList.toggle('is-lit', i < n)); },
      });
    });
    // ZOLLER-Symbol dreht sich
    $$('[data-spin]').forEach(el => gsap.fromTo(el, { rotate: -90 }, { rotate: 90, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } }));
    // Horizontal gepinnter Bereich
    const mm = gsap.matchMedia();
    mm.add('(min-width: 861px)', () => {
      $$('[data-hscroll]').forEach(sec => {
        const track = sec.querySelector('.hscroll__track');
        const pin = sec.querySelector('.hscroll__pin');
        const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
        const tween = gsap.to(track, {
          x: () => -dist(), ease: 'none',
          scrollTrigger: { trigger: sec, pin, start: 'top top', end: () => '+=' + dist(), scrub: .8, invalidateOnRefresh: true, anticipatePin: 1 },
        });
        $$('.app-card img', sec).forEach(img => gsap.fromTo(img, { xPercent: -6 }, { xPercent: 6, ease: 'none', scrollTrigger: { trigger: img.closest('.hscroll__item'), containerAnimation: tween, start: 'left right', end: 'right left', scrub: true } }));
      });
    });
    mm.add('(max-width: 860px)', () => { $$('[data-hscroll] .hscroll__track').forEach(t => { t.style.overflowX = 'auto'; t.style.scrollSnapType = 'x mandatory'; }); });
    // Immersiver Bereich: Bild skaliert beim Hineinscrollen
    $$('.immersive').forEach(sec => {
      const m = sec.querySelector('.immersive__media');
      gsap.fromTo(m, { clipPath: 'inset(8% 6% round 28px)' }, { clipPath: 'inset(0% 0% round 0px)', ease: 'none', scrollTrigger: { trigger: sec, start: 'top 90%', end: 'top 10%', scrub: true } });
    });
    // Zeitstrahl-Fortschritt
    $$('.timeline').forEach(tl => {
      const bar = tl.querySelector('.timeline__line i');
      if (bar) gsap.fromTo(bar, { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: tl.querySelector('.timeline__items'), start: 'top 60%', end: 'bottom 60%', scrub: true } });
      const links = $$('.timeline__nav a', tl);
      const nav = $('.timeline__nav', tl);
      // aktives Jahr in der Jahresleiste mittig halten – nur die Leiste scrollen, nie die Seite (scrollIntoView
      // würde auf dem Handy, wo die Leiste oben steht, die ganze Seite zurückspringen lassen)
      const center = (a) => {
        if (!a || !nav) return;
        const r = nav.getBoundingClientRect(), ar = a.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) return;
        nav.scrollTo({ top: nav.scrollTop + ar.top - r.top - (r.height - ar.height) / 2, left: nav.scrollLeft + ar.left - r.left - (r.width - ar.width) / 2, behavior: 'smooth' });
      };
      $$('.milestone', tl).forEach((m, i) => ScrollTrigger.create({
        trigger: m, start: 'top 55%', end: 'bottom 55%',
        onToggle: (st) => {
          m.classList.toggle('is-active', st.isActive);
          m.classList.toggle('is-past', !st.isActive && st.progress >= 1);
          if (st.isActive) { links.forEach(l => l.classList.remove('is-active')); links[i]?.classList.add('is-active'); center(links[i]); }
        },
      }));
    });
    window.addEventListener('load', () => ScrollTrigger.refresh());
  } else {
    $$('[data-words] .w').forEach(w => w.classList.add('is-lit'));
    $$('.reveal-mask').forEach(el => { el.style.clipPath = 'none'; });
  }

  /* ---------------------------------------------------------- Produktfilter */
  $$('.productlist').forEach(pl => {
    const rows = $$('.prow[data-row]', pl), toolRows = $$('.prow[data-tool]', pl);
    $('[data-nav-select]', pl)?.addEventListener('change', (e) => { if (e.target.value) location.href = e.target.value; });
    const rowF = $('[data-row-filter]', pl), toolF = $('[data-tool-filter]', pl);
    const apply = () => {
      const r = rowF?.value || '', t = toolF?.value || '';
      toolRows.forEach(x => x.hidden = x.dataset.tool !== t);
      rows.forEach(x => x.hidden = !!t || (r && x.dataset.row !== r));
      if (hasGSAP) ScrollTrigger.refresh();
      $$('[data-reveal]', pl).forEach(el => el.classList.add('is-in'));
    };
    rowF?.addEventListener('change', apply);
    toolF?.addEventListener('change', apply);
    $('[data-filter-reset]', pl)?.addEventListener('click', () => { if (rowF) rowF.value = ''; if (toolF) toolF.value = ''; apply(); });
  });

  /* -------------------------------------------------------------- Standorte */
  $$('[data-locations]').forEach(wrap => {
    const reg = $('[data-loc-region]', wrap), cty = $('[data-loc-country]', wrap), q = $('[data-loc-search]', wrap), count = $('[data-loc-count]', wrap);
    const cards = $$('.location', wrap);
    const allCountries = [...cty.options].slice(1).map(o => o.value);
    const apply = () => {
      const r = reg.value, c = cty.value, s = norm(q.value.trim());
      let n = 0;
      cards.forEach(el => {
        const ok = (!r || el.dataset.region === r) && (!c || el.dataset.country === c) && (!s || norm(el.dataset.text).includes(s));
        el.hidden = !ok; if (ok) n++;
      });
      count.textContent = `${n} ${n === 1 ? T('Standort') : T('Standorte')}`;
      if (hasGSAP) ScrollTrigger.refresh();
    };
    reg.addEventListener('change', () => {
      const r = reg.value;
      const valid = new Set(cards.filter(el => !r || el.dataset.region === r).map(el => el.dataset.country));
      cty.innerHTML = `<option value="">${T('Alle Länder')}</option>` + allCountries.filter(x => valid.has(x)).map(x => `<option>${x}</option>`).join('');
      apply();
    });
    cty.addEventListener('change', apply);
    q.addEventListener('input', apply);
    cards.forEach(el => { el.style.opacity = 1; });
    apply();
  });

  /* ---------------------------------------------------------------- Academy */
  $$('[data-academy]').forEach(grid => {
    const s = $('[data-academy-search]');
    const sels = $$('[data-academy-filter]');
    const cards = $$('.card', grid);
    const apply = () => {
      const terms = [s?.value || '', ...sels.map(x => x.value)].map(norm).filter(Boolean);
      cards.forEach(c => { c.hidden = !terms.every(t => norm(c.dataset.text).includes(t)); });
    };
    s?.addEventListener('input', apply); sels.forEach(x => x.addEventListener('change', apply));
  });

  /* ------------------------------------------------- Wirtschaftlichkeitsrechner */
  $$('[data-economy]').forEach(root => {
    const subMoney = '{0} CNC-Maschinen x {1} Werkzeugwechsel x {2} Min x {3} Arbeitstage/Jahr x {4} Schichten/Tag x {5} {6} Std.-Satz';
    const subSavings = '{0} CNC-Maschinen x {1} Arbeitstage/Jahr x {2} Schichten/Tag x {3} Maschinenstunden/Tag x {4} {5} Std.-Satz x {6} %';
    const subRoi = '{0} {1} Investitionskosten / {2} {3} Einsparung pro Jahr.';
    const format = (t, ...a) => a.reduce((s, v, i) => s.replace('{' + i + '}', v), t);
    const cur = root.querySelector('#calculator_currency');
    const fields = $$('select[id]:not(#calculator_currency), input[type="text"].number-only', root);
    let sym = '', iso = '', pos = 'after';
    const updateCurrency = () => {
      if (!cur) return;
      const o = cur.options[cur.selectedIndex];
      sym = o.getAttribute('data-symbol') || ''; iso = o.getAttribute('data-iso-currency') || ''; pos = o.getAttribute('data-position') || 'after';
      $$('span.currency', root).forEach(s => { s.innerHTML = pos === 'before' ? sym + '&nbsp;' : '&nbsp;' + sym; });
      ['.calc_result3', '.calc_result5', '.calc_result_total'].forEach(sel => {
        const r = root.querySelector(sel); if (!r) return;
        const c = r.parentElement.querySelector('span.currency'); if (!c) return;
        pos === 'before' ? r.parentElement.insertBefore(c, r) : r.parentElement.appendChild(c);
      });
    };
    const fmtN = (n, dec = false) => {
      const locale = (iso === '€' || iso === 'EUR') ? 'de-DE' : 'en-US';
      return (dec ? n : Math.round(n)).toLocaleString(locale, { maximumFractionDigits: dec ? 2 : 0, minimumFractionDigits: dec ? 2 : 0 });
    };
    const fmtC = (v) => pos === 'before' ? sym + fmtN(v) : fmtN(v) + ' ' + sym;
    const calc = (warn) => {
      const d = {};
      for (const f of fields) {
        const v = parseFloat(f.value);
        if (f.value === '' || isNaN(v) || v < 0) {
          if (warn) alert(root.querySelector('#economy-hidden-field')?.value || T('Bitte alle Felder ausfüllen.'));
          return;
        }
        d[f.name] = v;
      }
      const r1 = d.machine_count * d.tool_changes * d.saving_toolchange_minutes;
      const r2 = d.days_work_year * d.shifts * (r1 / 60);
      const r3 = r2 * d.machine_costs;
      const r5 = (d.days_work_year * d.shifts * d.machine_costs * d.machine_count * d.hour_day) * (d.productivity / 100);
      const r4 = d.invest_costs / r3;
      const set = (sel, v) => { const el = root.querySelector(sel); if (el) el.innerHTML = v; };
      set('.calc_result3', fmtN(r3)); set('.calc_result5', fmtN(r5)); set('.calc_result_total', fmtN(r3 + r5)); set('.calc_result4', fmtN(r4, true));
      set('.sub_money_lost', format(subMoney, d.machine_count, d.tool_changes, d.saving_toolchange_minutes, d.days_work_year, d.shifts, d.machine_costs, sym));
      set('.sub_savings', format(subSavings, d.machine_count, d.days_work_year, d.shifts, d.hour_day, d.machine_costs, sym, d.productivity));
      set('.sub_roi', format(subRoi, fmtC(d.invest_costs), '', fmtC(r3), ''));
    };
    updateCurrency(); calc(false);
    root.querySelector('#calc-submit')?.addEventListener('click', (e) => { e.preventDefault(); calc(true); });
    cur?.addEventListener('change', () => { updateCurrency(); calc(false); });
    fields.forEach(f => f.addEventListener('change', () => calc(false)));
    $$('input.number-only', root).forEach(i => i.addEventListener('input', () => { i.value = i.value.replace(/[^0-9.]/g, ''); }));
  });

  /* ------------------------------------------- Formulare: fertige E-Mail statt Server (statische Seite) */
  $$('form[data-mailto]').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (form.reportValidity && !form.reportValidity()) return;
      const lines = [], files = [];
      form.querySelectorAll('input, select, textarea').forEach(el => {
        if (!el.name || ['submit', 'button', 'hidden', 'password', 'reset'].includes(el.type)) return;
        if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return;
        if (el.type === 'file') { [...el.files].forEach(f => files.push(f.name)); return; }
        const lab = (el.id && form.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest('label');
        const label = ((lab && lab.textContent) || el.placeholder || el.name).replace(/\s+/g, ' ').replace(/\*/g, '').trim();
        const val = el.tagName === 'SELECT' ? (el.options[el.selectedIndex] || {}).text : (el.type === 'checkbox' ? '✓' : el.value);
        if (val) lines.push(`${label}: ${val}`);
      });
      if (files.length) lines.push('', `${T('Bitte hängen Sie Ihre Dateien an diese E-Mail an:')} ${files.join(', ')}`);
      location.href = `mailto:${form.dataset.mailto}?subject=${encodeURIComponent(form.dataset.subject || document.title)}&body=${encodeURIComponent(lines.join('\n'))}`;
      let note = form.querySelector('.form-sent');
      if (!note) { note = document.createElement('p'); note.className = 'form-sent form-note'; note.setAttribute('role', 'status'); form.append(note); }
      note.textContent = T('Ihr E-Mail-Programm öffnet sich mit der fertigen Nachricht – bitte dort absenden.');
    });
  });

  /* ------------------------------------------------- Defekte Bilder ausblenden */
  $$('img').forEach(img => {
    const hide = () => img.classList.add('is-broken');
    if (img.complete && img.naturalWidth === 0 && img.src) hide(); else img.addEventListener('error', hide, { once: true });
  });

  /* -------------------------------------------------- Externe Links kennzeichnen */
  $$('a[href^="http"]').forEach(a => {
    if (!a.target && !a.href.includes(location.host)) { a.target = '_blank'; a.rel = 'noopener'; }
  });

  /* ------------------------------------------- Produktkarten: 3D-Kippen + Lichtreflex */
  if (!reduced && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    $$('.product-card').forEach(card => {
      let raf = 0, rx = 0, ry = 0, gx = 50, gy = 50;
      const apply = () => {
        raf = 0;
        card.style.setProperty('--rx', `${rx.toFixed(2)}deg`); card.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
        card.style.setProperty('--gx', `${gx.toFixed(1)}%`); card.style.setProperty('--gy', `${gy.toFixed(1)}%`);
        card.style.setProperty('--mx', (ry / 6).toFixed(3)); card.style.setProperty('--my', (-rx / 5).toFixed(3));
      };
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        ry = (x - 0.5) * 12; rx = (0.5 - y) * 10; gx = x * 100; gy = y * 100;
        card.classList.add('is-tilting');
        if (!raf) raf = requestAnimationFrame(apply);
      });
      card.addEventListener('pointerleave', () => { rx = ry = 0; gx = gy = 50; card.classList.remove('is-tilting'); if (!raf) raf = requestAnimationFrame(apply); });
    });

    /* Magnetische Buttons */
    $$('.btn, .showroom-link, .wf-3d').forEach(btn => {
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) / r.width, y = (e.clientY - r.top - r.height / 2) / r.height;
        btn.style.translate = `${(x * 8).toFixed(1)}px ${(y * 6).toFixed(1)}px`;
      });
      btn.addEventListener('pointerleave', () => { btn.style.translate = ''; });
    });
  }

  /* ------------------------------------------- Seitenübergang: Karte → Produkt (View Transitions) */
  // Das angeklickte Kartenbild bekommt den Namen der Produktbühne und "fliegt" auf die neue Seite.
  document.addEventListener('click', (e) => {
    const card = e.target.closest('a.product-card');
    if (!card || e.metaKey || e.ctrlKey || e.shiftKey || card.target === '_blank') return;
    $$('[style*="view-transition-name"]').forEach(el => { if (el.style.viewTransitionName === 'product-hero') el.style.viewTransitionName = ''; });
    const img = card.querySelector('.product-card__img img');
    if (img) img.style.viewTransitionName = 'product-hero';
  });
  window.addEventListener('pageshow', () => {
    $$('.product-card__img img').forEach(img => { img.style.viewTransitionName = ''; });
  });

  /* ------------------------------------------- Überschriften: Wort für Wort aus der Maske */
  if (!reduced && 'IntersectionObserver' in window) {
    const heads = $$('main .section h2, main .section .section-head h2, main .feature__text h2, main .page-title h1, main .article-hero h1, main .textmedia__text h1, .footer-cta h2').filter(h =>
      !h.closest('[data-words], .worldflight, .product-hero, .modal, .mega, .accordion, .slider__slide, .hero, .ev-hero, .globe') &&
      [...h.childNodes].every(n => n.nodeType === 3 || ['BR', 'EM', 'STRONG', 'SPAN'].includes(n.nodeName) && !n.querySelector?.('*')));
    const hio = new IntersectionObserver((entries) => entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('is-in'); hio.unobserve(en.target); }
    }), { rootMargin: '0px 0px -10% 0px' });
    heads.forEach(h => {
      let i = 0;
      const wrap = (node) => {
        if (node.nodeType === 3) {
          const frag = document.createDocumentFragment();
          node.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const o = document.createElement('span'); o.className = 'hw';
            const inner = document.createElement('span'); inner.textContent = part; inner.style.setProperty('--i', i++);
            o.appendChild(inner); frag.appendChild(o);
          });
          node.replaceWith(frag);
        } else if (node.nodeName !== 'BR') { [...node.childNodes].forEach(wrap); }
      };
      [...h.childNodes].forEach(wrap);
      h.classList.add('h-split');
      hio.observe(h);
    });
  }

  /* ------------------------------------------- Lichtschein folgt dem Mauszeiger (dunkle Bereiche) */
  if (!reduced && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    $$('main .bg-black, .site-footer').forEach(sec => {
      const glow = document.createElement('span'); glow.className = 'cursor-glow'; glow.setAttribute('aria-hidden', 'true');
      if (getComputedStyle(sec).position === 'static') sec.style.position = 'relative';
      sec.prepend(glow);
      let raf = 0, x = 0, y = 0;
      sec.addEventListener('pointermove', (e) => {
        const r = sec.getBoundingClientRect(); x = e.clientX - r.left; y = e.clientY - r.top;
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; glow.style.transform = `translate3d(${x}px, ${y}px, 0)`; });
        glow.classList.add('is-on');
      });
      sec.addEventListener('pointerleave', () => glow.classList.remove('is-on'));
    });
  }
})();
