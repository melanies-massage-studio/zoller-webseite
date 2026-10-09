"""
Extrahiert eine Sprachfassung von zoller.info (heruntergeladen mit fetch_locale.py)
nach content/sites/<sprachpfad>/ – im selben Format wie die deutsche Seite.

Aufruf:  .venv/bin/python tools/extract_locale.py <sprachpfad> <raw-ordner>
         z. B. .venv/bin/python tools/extract_locale.py ca .cache/raw/ca

Ergebnis:
  content/sites/<sprachpfad>/pages/*.json   Seiten (Pfade ohne Sprachpräfix, Startseite = /startseite)
  content/sites/<sprachpfad>/nav.json       Hauptnavigation
  content/sites/<sprachpfad>/images.json    verwendete Bilder
Jede Seite bekommt »de_path« (deutsches Gegenstück laut hreflang) für Länderwechsel,
3D-Produktbühnen und feste Links (Kontakt, Datenschutz …).
"""
import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
import extract  # noqa: E402
import extract_nav  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGIN = "https://www.zoller.info"
HOME = "/startseite"
# Häufige Funktionswörter: News, die auf zoller.info noch nicht übersetzt sind, erkennen
STOPWORDS = {
    "de": ("und", "der", "die", "das", "mit", "für", "nicht", "wird", "sich", "auch"),
    "en": ("and", "the", "with", "for", "that", "this", "are", "from", "which", "our"),
    "fr": ("et", "les", "des", "pour", "avec", "une", "dans", "est", "sur", "qui"),
    "es": ("y", "los", "las", "para", "con", "una", "del", "que", "por", "más"),
}


def language_ok(page, lang):
    words = re.findall(r"[a-zäöüßéèàùâêîôûçñáíóú]+", json.dumps(page["blocks"], ensure_ascii=False).lower())
    score = lambda l: sum(words.count(w) for w in STOPWORDS[l])
    return score(lang) >= score("de")


def main():
    loc, raw_dir = sys.argv[1], sys.argv[2]
    sites = json.load(open(os.path.join(ROOT, "content", "sites.json"), encoding="utf-8"))
    conf = next(l for s in sites.values() for l in s["locales"] if l["src"] == loc)
    home = conf["home"]
    prefix = "/" + loc
    out = os.path.join(ROOT, "content", "sites", loc)
    pages_dir = os.path.join(out, "pages")
    os.makedirs(pages_dir, exist_ok=True)
    for f in glob.glob(os.path.join(pages_dir, "*.json")):
        os.remove(f)
    extract.images.clear()
    pages = {}
    skipped = 0
    for fn in sorted(glob.glob(os.path.join(raw_dir, "*.html"))):
        raw = open(fn, encoding="utf-8", errors="ignore").read()
        p = extract.extract_page(fn)
        if p is None:
            print("  - kein <main>:", fn, file=sys.stderr)
            continue
        path = p["path"]
        if path == home:
            path = HOME
        elif path.startswith(prefix + "/"):
            path = path[len(prefix):]
        else:
            continue
        if path == "/404":
            continue
        m = re.search(r'<link rel="alternate" hreflang="de-DE" href="([^"]+)"', raw)
        de = m.group(1).replace(ORIGIN, "").rstrip("/") if m else ""
        if re.search(r"/(details?|detalle)/", path):
            # News und Erfolgsgeschichten: nur übernehmen, wenn sie wirklich übersetzt sind
            if not language_ok(p, conf["lang"]):
                skipped += 1
                continue
            de = ""  # hreflang zeigt hier nur auf die allgemeine Detailseite
        p["path"] = path
        p["src_path"] = extract.page_path_from_file(fn)
        p["de_path"] = de if de.startswith("/") else ""
        pages[path] = p
    for path, p in pages.items():
        with open(os.path.join(pages_dir, extract.slug_for(path) + ".json"), "w", encoding="utf-8") as fh:
            json.dump(p, fh, ensure_ascii=False, indent=1)
    nav = extract_nav.extract_nav(os.path.join(raw_dir, extract.slug_for(home) + ".html"))
    json.dump(nav, open(os.path.join(out, "nav.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(sorted(extract.images), open(os.path.join(out, "images.json"), "w"), indent=0)
    # Alte Abfrage-Links der News (…/details?tx_news_pi1…) -> Pfad des übernommenen Artikels
    qfile = os.path.join(raw_dir, "_queries.json")
    queries = json.load(open(qfile)) if os.path.exists(qfile) else {}
    queries = {k: v[len(prefix):] for k, v in queries.items() if v[len(prefix):] in pages}
    json.dump(queries, open(os.path.join(out, "queries.json"), "w"), ensure_ascii=False, indent=1)
    mapped = sum(1 for p in pages.values() if p["de_path"])
    if skipped:
        print(f"{loc}: {skipped} News noch nicht übersetzt – bleiben Links auf zoller.info")
    print(f"{loc}: {len(pages)} Seiten ({mapped} mit deutschem Gegenstück), {len(extract.images)} Bilder, "
          f"Navigation: {', '.join(n['label'] for n in nav['main'])}")


if __name__ == "__main__":
    main()
