/* Terminkalender der Event-Seiten: Tage, Filter nach Lösung, Platz anfragen (E-Mail), Kalender-Export (.ics) */
(() => {
  'use strict';
  const root = document.querySelector('[data-agenda]');
  if (!root) return;
  const cfg = JSON.parse(root.getAttribute('data-agenda'));
  const tabs = [...root.querySelectorAll('[role=tab]')];
  const days = [...root.querySelectorAll('.agenda__day')];
  const filters = [...root.querySelectorAll('[data-filter]')];
  let filter = 'all';

  function selectDay(i, focus) {
    tabs.forEach((t, k) => {
      const on = k === i;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      days[k].hidden = !on;
    });
    if (focus) tabs[i].focus();
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => selectDay(i));
    t.addEventListener('keydown', (e) => {
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (d) { e.preventDefault(); selectDay((i + d + tabs.length) % tabs.length, true); }
      if (e.key === 'Home') { e.preventDefault(); selectDay(0, true); }
      if (e.key === 'End') { e.preventDefault(); selectDay(tabs.length - 1, true); }
    });
  });

  const matches = (slot) => filter === 'all' || slot.dataset.tag === filter || slot.dataset.tag === 'all';
  function applyFilter(f) {
    filter = f;
    filters.forEach((b) => { const on = b.dataset.filter === f; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    days.forEach((d, i) => {
      const slots = [...d.querySelectorAll('.agenda__slot')];
      let n = 0;
      slots.forEach((s) => { const on = matches(s) && (f === 'all' || s.dataset.tag !== 'none'); s.hidden = !on; if (on && s.dataset.tag !== 'none') n++; });
      d.querySelector('.agenda__empty').hidden = n > 0;
      tabs[i].classList.toggle('is-dim', f !== 'all' && n === 0);
    });
  }
  filters.forEach((b) => b.addEventListener('click', () => applyFilter(b.dataset.filter)));

  // "Demos im Terminkalender" auf den Produktkarten: filtern, Schwerpunkttag wählen, hinscrollen
  document.querySelectorAll('[data-agenda-jump]').forEach((b) => b.addEventListener('click', () => {
    const f = b.dataset.agendaJump;
    applyFilter(f);
    let best = 0, bestN = -1;
    days.forEach((d, i) => {
      const n = [...d.querySelectorAll(`.agenda__slot[data-tag="${f}"]`)].length;
      if (n > bestN) { best = i; bestN = n; }
    });
    selectDay(best);
    const sec = root.closest('section');
    if (window.__lenis) window.__lenis.scrollTo(sec, { offset: -70 }); else sec.scrollIntoView({ behavior: 'smooth' });
  }));

  // Direktlink auf einen Tag: #tag-2026-10-14
  const fromHash = () => { const i = days.findIndex((d) => '#' + d.id === location.hash); if (i >= 0) selectDay(i); };
  window.addEventListener('hashchange', fromHash); fromHash();

  // ---------------------------------------------------------------- Platz anfragen
  const fmtDate = (iso) => { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; };
  root.addEventListener('click', (e) => {
    const book = e.target.closest('[data-book]'), ics = e.target.closest('[data-ics]');
    const slot = (book || ics) && (book || ics).closest('.agenda__slot');
    if (book && slot) {
      const s = slot.dataset;
      const subject = `Anmeldung ${cfg.event}: ${s.title} (${fmtDate(s.date)}, ${s.start} PT)`;
      const body = `Hallo ZOLLER-Team,\n\nich möchte gerne an folgendem Programmpunkt teilnehmen:\n\n${s.title}\n${fmtDate(s.date)}, ${s.start}–${s.end} Uhr (PT)\n${cfg.location}\n\nName:\nFirma:\nTelefon:\nAnzahl Personen:\n\nViele Grüße`;
      location.href = `mailto:${cfg.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }
    if (ics && slot) download([slot], slugify(slot.dataset.title));
  });
  const all = document.querySelector('[data-ics-all]');
  if (all) all.addEventListener('click', () => download([...root.querySelectorAll('.agenda__slot')].filter((s) => s.dataset.tag !== 'none'), 'zoller-automation-week'));

  // ---------------------------------------------------------------- iCalendar
  const slugify = (t) => t.toLowerCase().replace(/[»«]/g, '').replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-|-$/g, '');
  const utc = (d, t) => new Date(`${d}T${t}:00${cfg.tzoffset}`).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const icsText = (t) => t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  function download(slots, name) {
    const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const ev = slots.map((s) => {
      const d = s.dataset, p = s.querySelector('p');
      return ['BEGIN:VEVENT', `UID:${d.date}-${d.start.replace(':', '')}-${slugify(d.title)}@zoller-automation-week`, `DTSTAMP:${now}`,
        `DTSTART:${utc(d.date, d.start)}`, `DTEND:${utc(d.date, d.end)}`,
        `SUMMARY:${icsText(d.title.replace(/[»«]/g, '') + ' · ' + cfg.event)}`, `LOCATION:${icsText(cfg.location)}`,
        `DESCRIPTION:${icsText((p ? p.textContent + '\n\n' : '') + 'Anmeldung: ' + cfg.email)}`, 'END:VEVENT'].join('\r\n');
    });
    const cal = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ZOLLER//Automation Week//DE', 'CALSCALE:GREGORIAN', ...ev, 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([cal], { type: 'text/calendar;charset=utf-8' }));
    a.download = name + '.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
})();

/* Einladungsvideo: großer Play-Button über dem Poster */
document.querySelectorAll('[data-ev-video]').forEach((w) => {
  const v = w.querySelector('video'), b = w.querySelector('.ev-video__play');
  b.addEventListener('click', () => { v.play(); });
  v.addEventListener('play', () => w.classList.add('is-playing'));
  v.addEventListener('pause', () => { if (!v.seeking) w.classList.remove('is-playing'); });
});
