"""
Findet Texte einer Länderfassung, die auf zoller.info nicht übersetzt sind (deutsche Reste, englische
Texte auf französischen/spanischen Seiten …) und noch nicht in content/sites/<sprachpfad>/translations.json
stehen.

Aufruf:  python3 tools/untranslated.py <sprachpfad> [ausgabe.json]      (ca, ca-fr, mx)

Ausgabe: {Text: Datei} – die Übersetzungen kommen als {Text: Übersetzung} in translations.json.
Namen und Marken, die unverändert bleiben sollen, trägt man dort mit sich selbst ein (gilt dann als geprüft).
"""
import glob
import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STOP = {
    "de": set("und der die das mit für nicht wird sich auch ist ein eine von den im zu auf sie wir bei oder durch werden dem des sind kann ihre ihr unsere".split()),
    "en": set("and the with for that this are from which our you your is of to in on can be by an".split()),
    "fr": set("et les des pour avec une dans est sur qui vous nous du au la le de en par sont".split()),
    "es": set("y los las para con una del que por más el la de en se su sus es al como".split()),
}
# Sprachen, die auf einer Seite der Zielsprache nicht vorkommen sollten (fr/es teilen viele Funktionswörter)
FOREIGN = {"en": ("de", "fr"), "fr": ("de", "en"), "es": ("de", "en")}
GERMAN_HINT = re.compile(r"[äöüßÄÖÜ]|\b(und|der|die|das|mit|für|zur|zum|bei|oder|Ihre?|Sie|eingeben|senden|Anschreiben|Lebenslauf|"
                         r"Zeugnisse|Anzahl|Modulares|Digitale|Effizienter|Sicherer|Smarte|Zentrale|Werkzeug\w*|\w*spindel|\w*adapter|"
                         r"Schritt|Nachricht|Kontaktdaten|Vorname|Nachname|Firma|Straße|Ort|Telefon|Anfrage)\b|"
                         r"(ung|ungen|keit|heit|lich|isch|schaft|bestände)\b", re.I)
ADDRESS = re.compile(r"(straße|strasse|str\.|GmbH|mbB|& Co|Platz \d|weg \d)", re.I)
SKIP_KEYS = {"src", "href", "id", "ftype", "bg", "space", "pos", "type", "kind", "path", "url", "de_path", "src_path",
             "og_image", "value", "tag", "date", "lat", "lng", "languages", "breadcrumb"}


def texts(o, out, key=""):
    if isinstance(o, str):
        out.append(o)
    elif isinstance(o, dict):
        for k, v in o.items():
            if k not in SKIP_KEYS:
                texts(v, out, k)
    elif isinstance(o, list):
        for v in o:
            texts(v, out, key)


def nodes(s):
    parts = re.split(r"<[^>]+>", s) if "<" in s else [s]
    parts += re.findall(r'\b(?:title|alt)="([^"]+)"', s) if "<" in s else []
    for t in parts:
        t = html.unescape(t).strip()
        if t:
            yield t


def segments(files):
    segs = {}
    for f in files:
        out = []
        texts(json.load(open(f, encoding="utf-8")), out)
        for s in out:
            for t in nodes(s):
                segs.setdefault(t, f)
    return segs


def site_files(src):
    folder = os.path.join(ROOT, "content", "sites", src) if src else os.path.join(ROOT, "content")
    return glob.glob(os.path.join(folder, "pages", "*.json")) + [os.path.join(folder, "nav.json")]


def score(t, lang):
    words = re.findall(r"[a-zäöüßéèàùâêîôûçñáíóú']+", t.lower())
    return sum(1 for w in words if w in STOP[lang])


def find(loc):
    sites = json.load(open(os.path.join(ROOT, "content", "sites.json"), encoding="utf-8"))
    lang = next(l["lang"] for s in sites.values() for l in s["locales"] if l["src"] == loc)
    tr_file = os.path.join(ROOT, "content", "sites", loc, "translations.json")
    done = json.load(open(tr_file, encoding="utf-8")) if os.path.exists(tr_file) else {}
    de = segments(site_files(""))
    other = {}  # gleiche Texte in den anderen Sprachfassungen (englisch auf fr/es-Seiten, französisch auf en-Seiten)
    for s in sites.values():
        for l in s["locales"]:
            if l["src"] and l["src"] != loc and l["lang"] != lang:
                for t in segments(site_files(l["src"])):
                    other.setdefault(t, l["lang"])
    found = {}
    for t, f in segments(site_files(loc)).items():
        if t in done or not re.search(r"[A-Za-zÄÖÜäöü]{3}", t) or re.fullmatch(r"[\W\d»«]*»[^«]+«[\W\d]*", t):
            continue
        n = len(t.split())
        bad = False
        if n >= 4:
            foreign = max(score(t, o) for o in FOREIGN[lang])
            bad = foreign >= 2 and foreign > score(t, lang)
        if not bad and t in de and GERMAN_HINT.search(t) and not ADDRESS.search(t):
            bad = True   # deutscher Rest (gleicher Text wie auf der deutschen Seite)
        if not bad and n >= 2 and t in other and t not in de and other[t] in FOREIGN[lang] and re.search(r"\b[a-zé]{3,}", t):
            # Text aus einer anderen Sprachfassung (z. B. englisch auf der spanischen Seite) – auf englischen
            # Seiten nur, wenn er erkennbar französisch/spanisch ist (englische Reste der fr-Seite sind hier richtig)
            if lang == "en":
                bad = bool(re.search(r"[éèàçêûôîñ]|\b(de|des|du|la|le|les|et|pour|por|para|los|las|y)\b", t))
            else:   # auf fr/es-Seiten: erkennbar englisch, nicht in der Zielsprache
                bad = score(t, lang) == 0 and not re.search(r"[éèàçêûôîñáíóú¿¡]", t) and other[t] == "en"
        if bad:
            found[t] = os.path.relpath(f, ROOT)
    return found


def main():
    loc = sys.argv[1]
    found = find(loc)
    out = json.dumps(found, ensure_ascii=False, indent=1)
    if len(sys.argv) > 2:
        open(sys.argv[2], "w", encoding="utf-8").write(out)
    else:
        print(out)
    print(f"{loc}: {len(found)} unübersetzte Texte, {sum(len(t) for t in found)} Zeichen", file=sys.stderr)


if __name__ == "__main__":
    main()
