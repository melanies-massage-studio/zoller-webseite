# ZOLLER Webseite – Relaunch

Neugestaltung von [zoller.info](https://www.zoller.info/startseite) (deutsche Version) als schnelle, statische Webseite mit Scroll-Effekten im Apple-Stil und 3D-Rendering auf der Startseite.

- **419 Seiten**: alle deutschen Seiten aus der Sitemap plus News, Erfolgsgeschichten, Events und Stellenangebote
- **Keine Inhalte verloren**: Jeder Text, jedes Bild, jede Tabelle, jedes FAQ und jeder Download wurde automatisch übernommen und mit `tools/verify_content.py` gegen die Originalseiten geprüft
- **Corporate Design unverändert**: Schrift T-Star, Farben Schwarz / Weiß / ZOLLER-Gelb `#F0E600` / Grautöne
- **Keine Tracker, keine Cookies**: YouTube-Videos laden erst nach Klick (2-Klick-Lösung, youtube-nocookie)

## Vorschau

```bash
python3 -m http.server 8765 --directory docs
```

Danach http://localhost:8765 öffnen.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `docs/` | Fertige Webseite (wird von `tools/build.py` erzeugt, Bilder liegen unter `docs/fileadmin/`) |
| `content/pages/*.json` | Inhalte jeder Seite als strukturierte Blöcke |
| `content/nav.json` | Hauptnavigation (Mega-Menü), Meta-Navigation |
| `content/locations.json` | Alle 79 weltweiten Standorte/Vertretungen |
| `assets/css/main.css` | Design-System |
| `assets/js/main.js` | Navigation, Suche, Scroll-Effekte, Filter, Rechner |
| `assets/js/stage3d.js` | 3D-Bühne der Startseite (Three.js) |
| `assets/vendor/` | GSAP + ScrollTrigger, Lenis (Smooth Scroll), Three.js |
| `tools/` | Extraktion, Build und Prüfskripte |

## Seite neu erzeugen

```bash
python3 tools/build.py          # erzeugt docs/ aus content/
python3 tools/check_links.py    # prüft alle internen Links und Bilder
```

`build.py` braucht nur die Python-Standardbibliothek.

### Inhalte erneut von zoller.info übernehmen

```bash
python3 -m venv .venv && .venv/bin/pip install beautifulsoup4 lxml
.venv/bin/python tools/extract.py <ordner-mit-html> <redirects.json> <toolfilter.json>
.venv/bin/python tools/extract_nav.py <ordner-mit-html>/startseite.html
python3 tools/fetch_images.py
python3 tools/build.py
```

## Scroll-Effekte & 3D

- **Startseite**: Gepinnte 3D-Bühne mit prozedural modelliertem Schrumpffutter (Steilkegel), beschichtetem 4-Schneiden-Fräser, gelbem Messring mit Messpunkten und dem ZOLLER-Symbol in 3D. Kamera, Rotation und Texte werden vom Scrollen gesteuert. Ohne WebGL oder bei „Bewegung reduzieren“ läuft stattdessen das originale Header-Video.
- **Überall**: Smooth Scrolling, Bildmasken, die sich beim Scrollen öffnen, Parallax-Zoom, Statements, die Wort für Wort aufleuchten, hochzählende Kennzahlen, horizontal gepinnter Bereich (Fräsen/Drehen/Schleifen), klebende Produkt-Unternavigation, Produkt-Hero mit schwebendem Gerät, Zeitstrahl mit Fortschrittslinie (Historie).
- `prefers-reduced-motion` wird respektiert.

## Funktionen

- Mega-Menü (Desktop) und Mobile-Navigation mit allen Ebenen
- Seitensuche über alle 419 Seiten (clientseitig, `docs/assets/search-index.json`)
- Sprachauswahl mit den Links auf die jeweils passende Seite der anderen Länderversionen
- Produktfilter nach Solution, Gerätetyp und Werkzeugtyp
- Standortsuche nach Region, Land und Freitext
- Wirtschaftlichkeitsrechner (Rechenlogik 1:1 übernommen)
- Hotspot-Grafiken, FAQ-Akkordeons, Datenblätter, Download-Center, Slider, Modal-Kacheln

## Formulare

Die Formulare (Kontakt, Newsletter, Bewerbung, Software-Updates, Ticket-Code) behalten alle Felder und senden weiterhin an das bestehende TYPO3-Backend auf zoller.info. Für einen Betrieb komplett ohne das alte Backend müssen sie auf einen Formular-Dienst oder eine eigene API umgestellt werden. Formulare mit reCAPTCHA funktionieren nur, wenn die neue Domain dort freigeschaltet ist.

## Downloads

PDFs, Flipbooks und Videos werden weiterhin direkt von `www.zoller.info/fileadmin/…` geladen. Bilder liegen lokal in `docs/fileadmin/`.
