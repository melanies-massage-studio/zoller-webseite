"""
Lädt alle Seiten nach, auf die eine Sprachfassung verlinkt, die aber noch nicht gebaut werden
(News, Erfolgsgeschichten, Tag- und Blätterseiten der Übersichten …) – damit kein Link mehr auf
zoller.info zeigt. Läuft in Runden, bis nichts Neues mehr dazukommt.

Aufruf:  .venv/bin/python tools/fetch_missing.py <sprachpfad>      (de, ca, ca-fr, mx)

- Alte Abfrage-Links (…/details?tx_news_pi1[news]=109, …?currentPage=3) bekommen einen lesbaren
  Pfad; die Zuordnung steht in .cache/raw/<sprachpfad>/_queries.json (de: content/queries.json).
- Ist eine Seite auf zoller.info nicht in der Sprache der Länderseite (z. B. kanadische News nur auf
  Französisch), wird laut hreflang die offizielle Fassung in der richtigen Sprache übernommen
  (en-CA -> en-US/en-IN/en-DE, fr-CA -> fr-FR, es-MX -> es-ES).
- Länderseiten: danach extract_locale.py laufen lassen. Deutsche Seite: neue Seiten landen direkt
  in content/pages/.
"""
import glob
import html
import json
import os
import re
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import extract  # noqa: E402
import extract_locale  # noqa: E402
from fetch_locale import ORIGIN, get, slug, slugify  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCALE_PREFIXES = ("ca", "ca-fr", "mx", "en_DE", "us", "es", "fr", "it", "pt", "se", "ru", "tr", "ja", "kr", "in",
                   "br", "at", "ch", "cz", "pl", "si", "hu", "sk")
FALLBACK = {"en": ("en-US", "en-IN", "en-DE", "en"), "fr": ("fr-FR",), "es": ("es-ES",), "de": ("de-AT",)}
PAGE_WORD = {"de": "seite", "en": "page", "fr": "page", "es": "pagina"}
SKIP_QUERY = ("tx_form_formframework", "tx_zoller_serial", "tx_kesearch", "tx_indexedsearch", "L=", "type=")


def conf_for(loc):
    if loc == "de":
        return {"lang": "de", "code": "de-DE", "src": "", "home": "/startseite"}
    sites = json.load(open(os.path.join(ROOT, "content", "sites.json"), encoding="utf-8"))
    return next(l for s in sites.values() for l in s["locales"] if l["src"] == loc)


def page_lang_ok(raw, lang):
    """Sprache des Hauptinhalts per Funktionswörter (wie extract_locale.language_ok)."""
    main = re.search(r"<main[\s\S]*?</main>", raw)
    words = re.findall(r"[a-zäöüßéèàùâêîôûçñáíóú]+", html.unescape(re.sub(r"<[^>]+>", " ", main.group(0) if main else raw)).lower())
    score = lambda l: sum(words.count(w) for w in extract_locale.STOPWORDS[l])
    return all(score(lang) >= score(o) for o in extract_locale.STOPWORDS if o != lang)


GENERIC = ("detail", "details", "detalle")
# News-Bereiche: Detailseite der deutschen Seite (gleiche TYPO3-Seite, gleiche Abfrage-Parameter)
DE_NEWS_BASE = (("your-success", "/ihr-erfolg/detail"), ("votre-reussite", "/ihr-erfolg/detail"), ("su-exito", "/ihr-erfolg/detail"),
                ("reports-stories", "/unternehmen/reports-stories/detail"), ("rapports-et-articles", "/unternehmen/reports-stories/detail"),
                ("informes-e-historias", "/unternehmen/reports-stories/detail"), ("/media", "/unternehmen/medien/detail"),
                ("/medias", "/unternehmen/medien/detail"), ("medios-de-comunicacion", "/unternehmen/medien/detail"),
                ("ihr-erfolg", "/ihr-erfolg/detail"), ("/medien", "/unternehmen/medien/detail"))


def alternates(raw):
    alts = dict(re.findall(r'<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"', raw))
    # nur konkrete Artikel, keine allgemeinen Detailseiten
    return {k: v for k, v in alts.items() if v.rstrip("/").split("/")[-1] not in GENERIC}


def candidates(alts, code, lang):
    """Offizielle Fassungen in der Sprache der Länderseite, zoller.info-Adressen zuerst (Bilder liegen dort)."""
    urls = [alts[c] for c in (code,) + FALLBACK[lang] if c in alts]
    urls = list(dict.fromkeys(urls))
    return sorted(urls, key=lambda u: "www.zoller.info" not in u)


def right_language(raw, lang, code):
    """Rohes HTML in der richtigen Sprache: bei Bedarf die offizielle Fassung laut hreflang laden."""
    if page_lang_ok(raw, lang):
        return raw, ""
    for url in candidates(alternates(raw), code, lang):
        try:
            _, _, body = get(url)
        except Exception:  # noqa: BLE001
            continue
        if page_lang_ok(body, lang):
            return body, url
    return raw, ""


def resolve_news_query(h, loc, conf):
    """Alter Abfrage-Link auf eine News -> (lokaler Pfad mit Präfix, Roh-HTML) über den deutschen Artikel."""
    base = h.split("?")[0]
    de_base = next((d for k, d in DE_NEWS_BASE if k in base), "/ihr-erfolg/detail")
    try:
        _, _, de_raw = get(ORIGIN + de_base + "?" + h.split("?", 1)[1])
    except Exception:  # noqa: BLE001
        return None, None
    m = re.search(r'<link rel="alternate" hreflang="de-DE" href="([^"]+)"', de_raw)
    de_title = html.unescape((re.search(r"<title>([^<]*)", de_raw) or [None, ""])[1]).strip()
    de_title = re.sub(r"\s*[|–-]\s*ZOLLER\s*$", "", de_title)
    de_path = None
    for f in sorted(glob.glob(os.path.join(ROOT, "content", "pages", "*.json"))):
        p = json.load(open(f, encoding="utf-8"))
        if "/detail/" in p["path"] and (re.sub(r"\s*[|–-]\s*ZOLLER\s*$", "", p.get("title", "").strip()) == de_title
                                        or p["path"].rstrip("/").split("/")[-1] == slugify(de_title)):
            de_path = p["path"]
            break
    if not de_path and m and m.group(1).rstrip("/").split("/")[-1] not in GENERIC:
        de_path = m.group(1).replace(ORIGIN, "")
    if not de_path:
        return None, None
    if loc == "de":
        return de_path, None
    try:
        _, _, de_slug_raw = get(ORIGIN + de_path)
    except Exception:  # noqa: BLE001
        return None, None
    alts = alternates(de_slug_raw)
    own = alts.get(conf["code"], "").replace(ORIGIN, "")
    path = own if own.startswith("/" + loc + "/") else base + "/" + de_path.rstrip("/").split("/")[-1]
    for url in ([alts[conf["code"]]] if conf["code"] in alts else []) + candidates(alts, conf["code"], conf["lang"]):
        try:
            _, _, body = get(url)
        except Exception:  # noqa: BLE001
            continue
        if page_lang_ok(body, conf["lang"]):
            return path, body
    return path, de_slug_raw


def collect_links(pages, loc):
    links = set()
    pre = "/" + loc + "/" if loc != "de" else "/"
    for p in pages.values():
        txt = json.dumps(p["blocks"], ensure_ascii=False)
        for h in re.findall(r'href=\\"([^"\\]+)\\"|"href": "([^"]+)"', txt):
            h = html.unescape(h[0] or h[1])
            if not h.startswith(pre) or h.startswith(("/fileadmin", "/typo3", "/_assets")):
                continue
            if loc == "de" and h.strip("/").split("/")[0] in LOCALE_PREFIXES:
                continue
            if any(q in h for q in SKIP_QUERY):
                continue
            links.add(h.split("#")[0])
    return links


def local_path(href, loc, conf):
    path = href.split("?")[0].rstrip("/")
    if loc != "de":
        path = path[len(loc) + 1:] if path.startswith("/" + loc) else path
        if "/" + loc + path == conf["home"]:
            path = "/startseite"
    return path or "/startseite"


def main():
    loc = sys.argv[1]
    conf = conf_for(loc)
    lang = conf["lang"]
    raw_dir = os.path.join(ROOT, ".cache", "raw", loc)
    os.makedirs(raw_dir, exist_ok=True)
    qfile = os.path.join(ROOT, "content", "queries.json") if loc == "de" else os.path.join(raw_dir, "_queries.json")
    queries = json.load(open(qfile, encoding="utf-8")) if os.path.exists(qfile) else {}
    tried = set()
    for rnd in range(1, 6):
        if loc == "de":
            pages = {}
            for f in glob.glob(os.path.join(ROOT, "content", "pages", "*.json")):
                p = json.load(open(f, encoding="utf-8"))
                pages[p["path"].rstrip("/") or "/startseite"] = p
        else:
            sys.argv = ["extract_locale.py", loc, raw_dir]
            extract_locale.main()
            pages = {}
            for f in glob.glob(os.path.join(ROOT, "content", "sites", loc, "pages", "*.json")):
                p = json.load(open(f, encoding="utf-8"))
                pages[p["path"]] = p
        titles = {re.sub(r"\s+", " ", p.get("title", "")).strip(): path for path, p in pages.items() if "/detail" in path}
        todo = []
        for h in sorted(collect_links(pages, loc)):
            if h in tried or h in queries:
                continue
            if "?" not in h and local_path(h, loc, conf) in pages:
                continue
            if "?" in h and "tx_news_pi1" not in h:
                continue
            todo.append(h)
        if not todo:
            break
        print(f"Runde {rnd}: {len(todo)} fehlende Seiten")
        new = 0
        for h in todo:
            tried.add(h)
            try:
                status, final, raw = get(ORIGIN + h)
            except Exception as e:  # noqa: BLE001
                print("   nicht erreichbar:", h, str(e)[:60])
                continue
            path = h.split("?")[0].rstrip("/")
            alt = ""
            if re.search(r"/(details?|detalle)/[^/?]+$", path):
                raw, alt = right_language(raw, lang, conf.get("code", "de-DE"))
            if "?" in h:
                q = urllib.parse.unquote(h.split("?", 1)[1])
                if "[news]=" in q:
                    news_path, body = resolve_news_query(h, loc, conf)
                    if not news_path:
                        print("   News nicht zuzuordnen:", h)
                        continue
                    queries[h] = news_path
                    lp = local_path(news_path, loc, conf)
                    if lp in pages or body is None or os.path.exists(os.path.join(raw_dir, slug(news_path) + ".html")):
                        continue
                    path, raw = news_path, body
                elif "currentPage]=" in q:
                    path += f"/{PAGE_WORD[lang]}-" + re.search(r"currentPage\]=(\d+)", q).group(1)
                elif "[tags]=" in q:
                    path += "/tag-" + re.search(r"\[tags\]=(\d+)", q).group(1)
                else:
                    continue
                queries[h] = path
            if alt:
                print("   offizielle Übersetzung übernommen:", alt.replace(ORIGIN, ""))
            with open(os.path.join(raw_dir, slug(path) + ".html"), "w", encoding="utf-8") as fh:
                fh.write(raw)
            new += 1
            if loc == "de":
                p = extract.extract_page(os.path.join(raw_dir, slug(path) + ".html"))
                if p:
                    p["path"] = path
                    with open(os.path.join(ROOT, "content", "pages", extract.slug_for(path) + ".json"), "w", encoding="utf-8") as fh:
                        json.dump(p, fh, ensure_ascii=False, indent=1)
        json.dump(queries, open(qfile, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"   {new} Seiten neu geladen")
    # Bereits geladene News in falscher Sprache durch die offizielle Übersetzung ersetzen
    fixed = 0
    for fn in glob.glob(os.path.join(raw_dir, "*.html")):
        if not re.search(r"__(details?|detalle)__[^_]", os.path.basename(fn)):
            continue
        raw = open(fn, encoding="utf-8", errors="ignore").read()
        body, alt = right_language(raw, lang, conf.get("code", "de-DE"))
        if alt:
            open(fn, "w", encoding="utf-8").write(body)
            fixed += 1
            print("   offizielle Übersetzung übernommen:", alt.replace(ORIGIN, ""))
    if loc != "de":
        sys.argv = ["extract_locale.py", loc, raw_dir]
        extract_locale.main()
    print(f"{loc}: fertig ({fixed} News durch offizielle Übersetzung ersetzt)")


if __name__ == "__main__":
    main()
