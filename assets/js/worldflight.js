/* ZOLLER – Startseite: Kameraflug durch die 3D-Produktwelt
   Die Engine der Produktumgebung 3D (world.js) läuft im Kino-Modus; der
   Scroll-Fortschritt der Sektion steuert die Kamera von der Übersicht durch
   alle sieben Themenwelten. Kapitel-Texte blenden passend dazu ein. */

const sec = document.querySelector('[data-worldflight]');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

if (sec) setup();

function setup() {
  const chapters = [...sec.querySelectorAll('[data-chapter]')];
  const railBtns = [...sec.querySelectorAll('[data-goto]')];
  const bar = sec.querySelector('.worldflight__bar i');
  const canvas = sec.querySelector('.worldflight__canvas');
  const loading = sec.querySelector('.worldflight__loading');
  const stops = chapters.length - 1;
  let world = null, active = -1, ticking = false;

  const progress = () => {
    const r = sec.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, sec.offsetHeight - window.innerHeight));
  };

  // Kapitel i ist sichtbar, solange die Kamera an Station i steht (siehe world.setProgress)
  function chapterAt(p) {
    const u = p * stops;
    for (let i = 0; i <= stops; i++) if (u >= i - 0.14 && u <= i + 0.42) return i;
    return -1;
  }

  function update() {
    ticking = false;
    const p = progress();
    if (world) world.setProgress(p);
    const c = chapterAt(p);
    if (c !== active) {
      active = c;
      chapters.forEach((el, i) => el.classList.toggle('is-active', i === c));
      railBtns.forEach((b) => b.classList.toggle('is-active', +b.dataset.goto === c));
      sec.classList.toggle('is-traveling', c === -1);
    }
    if (bar) bar.style.transform = `scaleX(${p.toFixed(4)})`;
    const inside = p > 0 && p < 1;
    sec.classList.toggle('is-inside', inside);
  }
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();

  // Rail: zu einer Themenwelt springen
  railBtns.forEach((b) => b.addEventListener('click', () => {
    const i = +b.dataset.goto;
    const top = sec.getBoundingClientRect().top + window.scrollY;
    const y = top + (i + 0.12) / stops * (sec.offsetHeight - window.innerHeight);
    const lenis = window.__lenis;
    if (lenis) lenis.scrollTo(y, { duration: 1.6 }); else window.scrollTo({ top: y, behavior: 'smooth' });
  }));

  const test = document.createElement('canvas');
  const webgl = !!(test.getContext('webgl2') || test.getContext('webgl'));
  if (!webgl || reduced) { sec.classList.add('is-static'); return; }

  let started = false;
  const io = new IntersectionObserver(([en]) => {
    if (en.isIntersecting && !started) { started = true; start(); }
    if (world) world.setRunning(en.isIntersecting);
  }, { rootMargin: '120% 0px 120% 0px' });
  io.observe(sec);

  // Szene neben die Textkarte schieben (Desktop) bzw. über die Karte (Handy)
  function applyInset() {
    if (!world) return;
    const card = sec.querySelector('.wf-chapter:not(.wf-chapter--intro):not(.wf-chapter--outro)');
    if (window.innerWidth > 860) {
      const r = card ? card.getBoundingClientRect() : { right: 520 };
      world.setInset(-Math.min(window.innerWidth * 0.45, r.right + 24), 0);
    } else {
      world.setInset(0, Math.min(window.innerHeight * 0.45, (card?.offsetHeight || 300) + 30));
    }
    world.resize();
  }

  async function start() {
    try {
      const base = sec.dataset.base;
      await Promise.race([
        Promise.all(['400', '500', '700', '800'].map((w) => document.fonts.load(`${w} 40px "T-Star"`))),
        new Promise((r) => setTimeout(r, 2500)),
      ]);
      const [{ createWorld }, data] = await Promise.all([
        import('./world.js'),
        fetch(`${base}products.json`).then((r) => r.json()),
      ]);
      world = await createWorld(canvas, data, {
        base, cinematic: true, mobile: matchMedia('(max-width: 760px)').matches,
        onProgress: (f) => { if (loading) loading.querySelector('i').style.transform = `scaleX(${f})`; },
      });
      applyInset();
      window.addEventListener('resize', applyInset);
      world.start();
      world.setProgress(progress());
      sec.classList.add('is-ready');
      update();
    } catch (e) {
      console.warn('3D-Produktwelt nicht verfügbar:', e);
      sec.classList.add('is-static');
    }
  }
}
