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
python3 tools/sync_showroom.py  # übernimmt Produktbilder, Daten und 3D-Engine aus ../zoller-produktumgebung-3d
python3 tools/build.py          # erzeugt docs/ aus content/ (SITE_BASE=/ bei eigener Domain)
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

## Länderseiten (Kanada, Mexiko)

Aus diesem Repository werden zusätzlich eigene Webseiten für einzelne Länder erzeugt – gleiches Design, gleiche Technik, aber Sprache, Kontakt, Adresse, Rechtstexte, Events und News des jeweiligen Landes. Jede Länderseite liegt in einem eigenen GitHub-Repository:

| Land | Sprachen | Repository | Adresse |
|---|---|---|---|
| Kanada | Englisch, Französisch (`/fr/`) | [zoller-canada](https://github.com/mzollercreations/zoller-canada) | https://mzollercreations.github.io/zoller-canada/ |
| Mexiko | Spanisch | [zoller-mexico](https://github.com/mzollercreations/zoller-mexico) | https://mzollercreations.github.io/zoller-mexico/ |

- **Inhalte**: die offiziellen Sprachfassungen von zoller.info (`/ca/`, `/ca-fr/`, `/mx/`) – keine eigene Übersetzung der Seiteninhalte. Jede Seite kennt über `hreflang` ihr deutsches Gegenstück; darüber springt der Länderwechsel auf dieselbe Seite im anderen Land, und 3D-Produktbühnen, Kontakt- und Datenschutz-Links werden zugeordnet.
- **Feste Texte** (Buttons, Menüs, Footer, Globus …): `tools/i18n.py`, Schlüssel ist der deutsche Text. Fehlende Übersetzungen meldet `build.py` am Ende.
- **Länder, Sprachen, Adressen, Repositories**: `content/sites.json`. Ein weiteres Land = neuer Eintrag dort plus die Schritte unten.
- **Länderwechsel**: Weltkugel im Header → „Land und Sprache wählen“ mit den Länderseiten (kleine Flaggen) und den übrigen zoller.info-Sprachen. Neben dem Logo steht der Ländername; in Kanada wechselt „FR“/„EN“ direkt die Sprache.

```bash
# Inhalte eines Landes holen (Sprachpfade: ca, ca-fr, mx)
python3 tools/fetch_locale.py mx .cache/raw/mx
.venv/bin/python tools/extract_locale.py mx .cache/raw/mx
.venv/bin/python tools/fetch_missing.py mx      # verlinkte News, Tag- und Blätterseiten nachladen

# Unübersetzte Texte finden und übersetzen
python3 tools/untranslated.py mx liste.json    # -> Übersetzungen in content/sites/mx/translations.json

# Bauen und ansehen
python3 tools/build.py --site mx                 # -> dist/zoller-mexico
python3 -m http.server 8767 --directory dist     # http://localhost:8767/zoller-mexico/

# Veröffentlichen (Commit + Push ins Länder-Repository)
tools/publish.sh mx
```

Nach Änderungen an Design oder Skripten alle drei Seiten neu bauen: `python3 tools/build.py`, `tools/publish.sh ca`, `tools/publish.sh mx`.

### Unabhängig von zoller.info

Alle drei Seiten (Deutschland, Kanada, Mexiko) funktionieren ohne zoller.info – die alte Seite kann abgeschaltet werden:

- **Dateien**: Bilder, PDFs, Videos und Icons liegen auf der jeweiligen Seite (`fileadmin/`). `build.py` übernimmt sie aus `docs/` oder lädt fehlende einmalig nach. Blätterkataloge werden durch das komplette PDF des Katalogs ersetzt (Zuordnung: `content/flipbooks.json`).
- **Links**: Jeder Link zeigt auf die eigene Seite – Links in andere Sprachfassungen von zoller.info werden über das deutsche Gegenstück oder den Produktnamen auf die eigene Seite umgeleitet, USA-Links auf zoller-usa.com. Was es nirgends gibt (z. B. auf zoller.info schon gelöschte Stellenanzeigen), wird zu Text; `build.py` meldet solche Fälle am Ende.
- **News**: Alte Abfrage-Links (`…/detail?tx_news_pi1[news]=…`) sind lesbaren Artikelpfaden zugeordnet (`content/queries.json`, `content/sites/<sprachpfad>/queries.json`). Gibt es einen Artikel auf zoller.info nur in einer anderen Sprache, übernimmt `fetch_missing.py` die offizielle Übersetzung (z. B. Kanada-Englisch aus der US- oder Indien-Fassung).
- **Formulare** (Kontakt, Newsletter, Bewerbung, Ticketcodes …) öffnen eine fertig ausgefüllte E-Mail an die Landesgesellschaft (`assets/js/main.js`); E-Mail-Adresse aus `content/sites.json`.
- **Übersetzungen**: Was auf zoller.info in der Landessprache fehlt, steht in `content/sites/<sprachpfad>/translations.json` (Text → Übersetzung, auch für Bildtexte und Tooltips) und wird beim Bauen ersetzt.
- **3D-Showroom**: Jede Sprachfassung verlinkt den Showroom in ihrer Sprache (`zoller-produktumgebung-3d/en-ca/`, `/fr-ca/`, `/es-mx/`, erzeugt dort mit `tools/build_locale.py`).

## Scroll-Effekte & 3D

- **Startseite**: Gepinnte 3D-Bühne mit prozedural modelliertem Schrumpffutter (Steilkegel), beschichtetem 4-Schneiden-Fräser, gelbem Messring mit Messpunkten und dem ZOLLER-Symbol in 3D. Kamera, Rotation und Texte werden vom Scrollen gesteuert. Ohne WebGL oder bei „Bewegung reduzieren“ läuft stattdessen das originale Header-Video.
- **Überall**: Smooth Scrolling, Bildmasken, die sich beim Scrollen öffnen, Parallax-Zoom, Statements, die Wort für Wort aufleuchten, hochzählende Kennzahlen, horizontal gepinnter Bereich (Fräsen/Drehen/Schleifen), klebende Produkt-Unternavigation, Produkt-Hero mit schwebendem Gerät, Zeitstrahl mit Fortschrittslinie (Historie).
- `prefers-reduced-motion` wird respektiert.

## 3D & Animationen (Anbindung an die Produktumgebung 3D)

- **3D-Produktbühne** auf 51 Produktseiten (`assets/js/productstage.js`): freigestelltes Produktfoto auf spiegelndem Boden, dahinter das ZOLLER-Symbol als metallisch-gelbes 3D-Objekt, Lichtkante, Partikel, Kamera-Parallaxe mit Maus und Scroll. Auch Speziallösungen und Software-Add-ons, die bisher keinen Produktkopf hatten, bekommen diese Bühne. Hinweis: Die Geräte sind Fotos, keine 3D-Modelle – sie drehen sich deshalb immer zur Kamera.
- **Kameraflug „Die ZOLLER Produktwelt"** auf der Startseite (`assets/js/worldflight.js`): Die Engine der [Produktumgebung 3D](https://mzollercreations.github.io/zoller-produktumgebung-3d/) läuft im Kino-Modus, das Scrollen fliegt die Kamera durch alle sieben Themenwelten; zu jeder Themenwelt erscheinen Text, Produktlinks und Absprung in den Showroom.
- **Seitenübergänge** per View Transitions: Das Produktbild einer Karte fliegt beim Klick in die Produktbühne der neuen Seite (Chrome/Edge, Safari 18.2+; andere Browser laden normal).
- **Produktkarten** kippen in 3D zum Mauszeiger, mit Lichtreflex; **Buttons** ziehen magnetisch zum Zeiger; **Überschriften** gleiten Wort für Wort aus einer Maske; in dunklen Bereichen folgt ein gelber Lichtschein dem Zeiger.
- **Showroom-Links**: gelber Header-Button, Eintrag im Handy-Menü, Teaser auf der Produktübersicht, „Themenwelt in 3D erleben" auf den Kategorieseiten und „Im 3D-Showroom ansehen" auf jeder Produktseite (Deep-Link auf das Gerät).

## Header, Abstände & Globus

- **Header-Leiste**: Logo, direkt daneben die Hauptnavigation, rechts Suche, Sprache und der gelbe 3D-Showroom-Button. Die Leiste passt sich stufenweise an: Meta-Links (Service, Medien, Karriere) ab 1500 px, MYZOLLER ab 1300 px, kompakte Navigation mit „3D“-Button ab 1024 px (iPad quer), darunter Burger-Menü mit allen Werkzeugen rechtsbündig.
- **Mega-Menü**: Intro-Spalte mit Übersicht-Link und Hinweiskarte (3D-Showroom bzw. Standortglobus), daneben fließen die Gruppen wie Mauerwerk in Spalten – keine Lücken mehr durch unterschiedlich lange Gruppen.
- **Abstände**: `fix_spacing()` in `tools/build.py` prüft jede Abschnittsgrenze. Das alte CMS stapelt Inhalte mit „Abstand: keiner“; an Farbwechseln bekommt jetzt jede Seite ihren Innenabstand zurück, bei gleicher Farbe bleibt mindestens der Stapelabstand (`is-stacked`), und der erste Abschnitt unter Header bzw. Unternavigation bekommt Luft nach oben (`pt-top`).
- **Standortglobus**: Auf Touch-Geräten dreht ein Finger auf der Kugel nur den Globus, die Seite scrollt dabei nicht mit; außerhalb der Kugel scrollt die Seite normal. Auf dem Trackpad dreht seitliches Wischen den Globus, senkrechtes Scrollen bleibt der Seite, Pinch bzw. Strg/⌘ + Mausrad zoomt.

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
