# ZOLLER Webseite – Relaunch

Neugestaltung von [zoller.info](https://www.zoller.info/startseite) (deutsche Version) als schnelle, statische Webseite mit Scroll-Effekten im Apple-Stil und einer gerenderten Kamerafahrt durch den Showroom auf der Startseite.

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
| `assets/js/homefilm.js` | Startseiten-Video (Kamerafahrt durch den Showroom) mit mitlaufenden Geräte-Beschriftungen |
| `assets/video/home/` | Videos, Poster und Beschriftungs-Spur der Startseite (erzeugt von `../video/home-hero/finish.py`) |
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

## Länderseiten (Kanada, Mexiko, USA)

Aus diesem Repository werden zusätzlich eigene Webseiten für einzelne Länder erzeugt – gleiches Design, gleiche Technik, aber Sprache, Kontakt, Adresse, Rechtstexte, Events und News des jeweiligen Landes. Jede Länderseite liegt in einem eigenen GitHub-Repository:

| Land | Sprachen | Repository | Adresse |
|---|---|---|---|
| Kanada | Englisch, Französisch (`/fr/`) | [zoller-canada](https://github.com/mzollercreations/zoller-canada) | https://mzollercreations.github.io/zoller-canada/ |
| Mexiko | Spanisch | [zoller-mexico](https://github.com/mzollercreations/zoller-mexico) | https://mzollercreations.github.io/zoller-mexico/ |
| USA | Englisch | [zoller-usa](https://github.com/mzollercreations/zoller-usa) | https://mzollercreations.github.io/zoller-usa/ |

- **Inhalte**: die offiziellen Sprachfassungen von zoller.info (`/ca/`, `/ca-fr/`, `/mx/`) – keine eigene Übersetzung der Seiteninhalte. Jede Seite kennt über `hreflang` ihr deutsches Gegenstück; darüber springt der Länderwechsel auf dieselbe Seite im anderen Land, und 3D-Produktbühnen, Kontakt- und Datenschutz-Links werden zugeordnet.
- **USA**: zoller.info hat keine eigene US-Fassung (`/us/` leitet auf zoller-usa.com um). Die USA-Seite nutzt deshalb die englischen Inhalte von Kanada (`"src": "ca"` in `content/sites.json`) mit eigener Flagge, Firma (ZOLLER Inc., Ann Arbor) und Formular-Adresse. Abweichende Seiten liegen im Overlay `content/sites/us/pages/` (z. B. Ansprechpartner mit den US-Standorten) und ersetzen die gleichnamige Seite von Kanada; Textersetzungen gingen in `content/sites/us/replace.json`. Alte Links auf zoller.info/us/… und zoller-usa.com zeigen auf die USA-Seite.
- **Feste Texte** (Buttons, Menüs, Footer, Globus …): `tools/i18n.py`, Schlüssel ist der deutsche Text. Fehlende Übersetzungen meldet `build.py` am Ende.
- **Länder, Sprachen, Adressen, Repositories**: `content/sites.json`. Ein weiteres Land = neuer Eintrag dort plus die Schritte unten.
- **Länderwechsel mit Globus**: Knopf mit Weltkugel und Flagge des aktuellen Landes im Header (und im Footer) öffnet „Land und Sprache wählen“ – links der 3D-Globus (`assets/js/countryglobe.js`, lädt erst beim ersten Öffnen), rechts die Liste. Jede Länderseite steht mit Flagge auf ihrem Hauptsitz (Pleidelsheim, Mississauga, Querétaro, Ann Arbor), die übrigen ZOLLER-Länderseiten als weiße Punkte. Zeigen auf ein Land blendet die Route vom aktuellen Land ein; ein Klick fliegt als Lichtpunkt dorthin, zoomt auf den Hauptsitz, blendet „ZOLLER | LAND“ ein und öffnet dieselbe Seite im anderen Land, die aus dem Schwarz aufblendet. Ohne WebGL bleibt die Liste, bei reduzierter Bewegung entfällt der Flug. Lage, Blickpunkt und Seite der Beschriftung: `geo` in `content/sites.json`. Flaggen: `tools/flags.py` (auch für den 3D-Showroom). Neben dem Logo steht der Ländername; in Kanada wechselt „FR“/„EN“ direkt die Sprache. Gemeinsame Globus-Teile (Kugel, Landpunkte, Messring, Markierungen) liegen in `assets/js/globe-core.js` und werden auch vom Standorte-Globus genutzt.
- **Events nach Land**: Alle Firmenevents weltweit stehen in `content/events.json` (Land, Ort, Kurztext, Beschreibung, Ablauf, offizielle Website – Texte in DE/EN/FR/ES). Die Eventseite jeder Länderseite zeigt zuerst nur die Events ihres Landes; „Weltweit“ zeigt alle, die Chips darunter ein anderes Land (`?events=all` öffnet direkt alle). Vergangene Events fallen beim Bauen und im Browser weg.
- **Jedes Event in jeder Sprache**: „Mehr erfahren“ führt immer auf eine Eventseite in der Sprache der Länderseite – nie auf die deutsche Seite und nicht auf MYZOLLER (zeigt diese Events nur auf Deutsch). `build.py` erzeugt für jedes Event aus `events.json` eine eigene Seite (`/events/<id>`, `/evenements/<id>`, `/eventos/<id>`); Events mit handgebauter Seite (`page`, z. B. Automation Week Torrance, Automation Days Ann Arbor) brauchen diese Seite in jeder Sprachfassung (`content/pages`, `content/sites/ca|ca-fr|mx/pages` mit `de_path`). Fehlt eine Sprache, meldet `build.py` am Ende „ACHTUNG: … Events ohne Seite“. Neues Event: Eintrag mit allen vier Sprachen in `events.json`, alle Seiten neu bauen.
- **USA**: Startseite mit dem nordamerikanischen Hauptsitz in Ann Arbor direkt nach der Kamerafahrt (`content/sites/us/home.json`, Bilder aus der Firmenchronik und der Reise-Seite der Technology Days) und eigene Eventseite „ZOLLER Automation Days 2026“ (`content/sites/us/pages/`).
- **Header passt sich an**: Passen Menü und Werkzeuge nicht nebeneinander (lange Menütexte, z. B. Französisch), blendet `assets/js/main.js` stufenweise Zusätze aus (`fit-1` … `fit-5` in `main.css`: Meta-Links, EN/FR-Umschalter, kurzer 3D-Knopf, kleinere Menüschrift, zuletzt Burger-Menü).

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

Nach Änderungen an Design oder Skripten alle vier Seiten neu bauen: `python3 tools/build.py`, `tools/publish.sh ca`, `tools/publish.sh mx`, `tools/publish.sh us`.

### Unabhängig von zoller.info

Alle vier Seiten (Deutschland, Kanada, Mexiko, USA) funktionieren ohne zoller.info – die alte Seite kann abgeschaltet werden:

- **Dateien**: Bilder, PDFs, Videos und Icons liegen auf der jeweiligen Seite (`fileadmin/`). `build.py` übernimmt sie aus `docs/` oder lädt fehlende einmalig nach. Blätterkataloge werden durch das komplette PDF des Katalogs ersetzt (Zuordnung: `content/flipbooks.json`).
- **Links**: Jeder Link zeigt auf die eigene Seite – Links in andere Sprachfassungen von zoller.info werden über das deutsche Gegenstück oder den Produktnamen auf die eigene Seite umgeleitet, USA-Links (zoller.info/us/…, zoller-usa.com) auf die eigene USA-Seite. Was es nirgends gibt (z. B. auf zoller.info schon gelöschte Stellenanzeigen), wird zu Text; `build.py` meldet solche Fälle am Ende.
- **News**: Alte Abfrage-Links (`…/detail?tx_news_pi1[news]=…`) sind lesbaren Artikelpfaden zugeordnet (`content/queries.json`, `content/sites/<sprachpfad>/queries.json`). Gibt es einen Artikel auf zoller.info nur in einer anderen Sprache, übernimmt `fetch_missing.py` die offizielle Übersetzung (z. B. Kanada-Englisch aus der US- oder Indien-Fassung).
- **Formulare** (Kontakt, Newsletter, Bewerbung, Ticketcodes …) öffnen eine fertig ausgefüllte E-Mail an die Landesgesellschaft (`assets/js/main.js`); E-Mail-Adresse aus `content/sites.json`.
- **Übersetzungen**: Was auf zoller.info in der Landessprache fehlt, steht in `content/sites/<sprachpfad>/translations.json` (Text → Übersetzung, auch für Bildtexte und Tooltips) und wird beim Bauen ersetzt.
- **3D-Showroom**: Jede Sprachfassung verlinkt den Showroom in ihrer Sprache (`zoller-produktumgebung-3d/en-ca/`, `/fr-ca/`, `/es-mx/`, `/en-us/`, erzeugt dort mit `tools/build_locale.py`). Auch dort wechselt ein Knopf mit Weltkugel und Flagge Land und Sprache.

## Scroll-Effekte & 3D

- **Startseite**: Kamerafahrt durch eine Showroom-Gasse, links und rechts die Geräte aus den offiziellen CAD-Daten (»venturion«, »smile«, »keeper«, »toolOrganizer«, »toolStation«), in Blender/Cycles gerendert (`../video/home-hero`, CAD-Bibliothek `../cad`). Das Video ist eine nahtlose Schleife (20 s), quer für Desktop/Tablet und hochkant für Smartphones und Tablets im Hochformat. Darüber wechseln beim Scrollen drei Texte; kleine Beschriftungen hängen an den Geräten im Video und führen zur Produktseite (Bildpositionen pro Frame aus Blender). Pause-Knopf unten rechts; bei „Bewegung reduzieren“ oder Datensparmodus bleibt das Standbild stehen.
- **Überall**: Smooth Scrolling, Bildmasken, die sich beim Scrollen öffnen, Parallax-Zoom, Statements, die Wort für Wort aufleuchten, hochzählende Kennzahlen, horizontal gepinnter Bereich (Fräsen/Drehen/Schleifen), klebende Produkt-Unternavigation, Produkt-Hero mit schwebendem Gerät, Zeitstrahl mit Fortschrittslinie (Historie).
- **Vorhang-Hero**: Das große Bild am Seitenanfang (`.hero`, Eventseiten `.ev-hero`) bleibt stehen und dunkelt ab, der Inhalt gleitet als Blatt mit runden Ecken darüber (`main.css` „Scroll-Effekte“, `main.js`).
- **Lesefortschritt**: gelbe Linie am oberen Rand auf allen längeren Seiten außer der Startseite (scroll-gebundene CSS-Animation, sonst JavaScript).
- **Karten** (News, Produkte, Werte, Ziele, Event-Produkte) kippen beim Hereinscrollen aus der Tiefe nach oben; Seitentitel und der Footer-Claim gleiten Wort für Wort aus einer Maske; der gelbe Akzentstrich über Überschriften wächst mit.
- **Historie**: Das Jahr in der Bildmitte wird kräftig, erreichte Punkte füllen sich gelb; die Jahresleiste scrollt mit, ohne die Seite zu verschieben. **Events**: Zeilen gleiten herein, das Datumsfeld klappt auf. **Hotspot-Bilder**: die Punkte springen nacheinander auf.
- Das Einblenden (`data-reveal`) nutzt die Einzel-Eigenschaften `translate`/`scale`/`rotate`, damit `transform` für Hover-Anheben und 3D-Kippen der Karten frei bleibt. Komponenten mit eigenem `transition` hängen `var(--reveal-t)` an.
- **Sicherheitsnetz**: Lädt `main.js` nicht (Netzfehler), blendet die Seite nach 5 s alles ohne Animation ein (`ZOLLER_READY` im `<head>`).
- `prefers-reduced-motion` wird respektiert.

### Flüssigkeit (Stand 10.10.2026)

- **3D-Halle** (Startseite, `world.js` aus der Produktumgebung 3D): baut sich in Portionen auf (Shader parallel kompiliert, Texturen über mehrere Frames hochgeladen) statt die Seite bis zu 5 s anzuhalten; im Kino-Modus auf Retina-Displays ohne MSAA; die Auflösung passt sich der Bildrate an (nie unter 85 %/67 %); steht die Kamera, wird nur jedes zweite Bild gerendert.
- **Produktbühne, Standort- und Länderglobus** kompilieren ihre Shader vor dem ersten Bild.
- Messung: Startseite beim Durchscrollen 95 % der Bilder unter 17,6 ms (vorher 50–83 ms), längster Hänger 150 ms (vorher bis 5 s).
- Lokal testen mit `zoller-docs-test` (Port 8768, `../.claude/launch.json`): der einfache `python3 -m http.server` verwirft bei vielen gleichzeitigen Anfragen Verbindungen, dann fehlen Skripte und Inhalte bleiben scheinbar leer.

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
