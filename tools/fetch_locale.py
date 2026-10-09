"""
Lädt alle Seiten einer Sprachfassung von zoller.info (laut Sitemap) als HTML herunter.

Aufruf:  python3 tools/fetch_locale.py <sprachpfad> <zielordner>
         z. B. python3 tools/fetch_locale.py ca .cache/raw/ca      (Kanada, Englisch)
               python3 tools/fetch_locale.py ca-fr .cache/raw/ca-fr (Kanada, Französisch)
               python3 tools/fetch_locale.py mx .cache/raw/mx       (Mexiko, Spanisch)

Dateinamen wie bei extract.py: Pfad mit »__« statt »/« (z. B. ca__company__contact.html).
Bereits geladene Dateien werden übersprungen.

Mit --details (nach extract_locale.py) werden zusätzlich die verlinkten News und Erfolgsgeschichten
geladen, die nicht in der Sitemap stehen. Alte Abfrage-Links (…/details?tx_news_pi1[news]=109)
bekommen einen Pfad aus dem Titel; die Zuordnung steht in <zielordner>/_queries.json.
"""
import glob
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ORIGIN = "https://www.zoller.info"
HOMES = {"ca": "/ca/accueil", "ca-fr": "/ca-fr/page-daccueil", "mx": "/mx/pagina-de-inicio"}
UA = {"User-Agent": "Mozilla/5.0 (Macintosh) zoller-webseite/fetch_locale"}


def get(url, tries=3):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.status, r.geturl(), r.read().decode("utf-8", "ignore")
        except Exception as e:  # noqa: BLE001
            err = e
            time.sleep(1.5 * (attempt + 1))
    raise err


def sitemap_urls(loc):
    _, _, idx = get(f"{ORIGIN}{HOMES[loc]}/sitemap.xml")
    if "<urlset" in idx:  # manche Sprachfassungen liefern die Seitenliste direkt
        return [u.replace("&amp;", "&") for u in re.findall(r"<loc>([^<]+)</loc>", idx)]
    urls = []
    for sm in re.findall(r"<loc>([^<]+)</loc>", idx):
        _, _, xml = get(sm.replace("&amp;", "&"))
        urls += re.findall(r"<loc>([^<]+)</loc>", xml)
    return [u.replace("&amp;", "&") for u in urls]


def slug(path):
    return path.strip("/").replace("/", "__").replace("?", "@@").replace("&", "~~")


def slugify(t):
    t = html.unescape(t).lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        t = t.replace(a, b)
    t = urllib.parse.unquote(t)
    import unicodedata
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")[:80] or "artikel"


def fetch_details(loc, out):
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    links = set()
    for f in glob.glob(os.path.join(root, "content", "sites", loc, "pages", "*.json")):
        txt = open(f, encoding="utf-8").read()
        links.update(html.unescape(h) for h in re.findall(r'(/' + re.escape(loc) + r'/[^"\\ ]*?/(?:details|detalle|detail)(?:/[^"\\ ?#]+|\?tx_news_pi1[^"\\ #]*))', txt))
    qfile = os.path.join(out, "_queries.json")
    queries = json.load(open(qfile)) if os.path.exists(qfile) else {}
    ok = 0
    for link in sorted(links):
        if "?" in link and link in queries:
            continue
        if "?" not in link and os.path.exists(os.path.join(out, slug(link) + ".html")):
            continue
        try:
            status, final, body = get(ORIGIN + link)
        except Exception as e:  # noqa: BLE001
            print("   fail", link, e)
            continue
        path = link
        if "?" in link:
            m = re.search(r"<title>([^<]*)", body)
            path = link.split("?")[0].rstrip("/") + "/" + slugify(m.group(1) if m else link)
            queries[link] = path
        with open(os.path.join(out, slug(path) + ".html"), "w", encoding="utf-8") as fh:
            fh.write(body)
        ok += 1
        time.sleep(0.2)
    json.dump(queries, open(qfile, "w"), ensure_ascii=False, indent=1)
    print(f"{loc}: {len(links)} verlinkte Artikel, {ok} neu geladen")


def main():
    loc, out = sys.argv[1], sys.argv[2]
    if "--details" in sys.argv:
        fetch_details(loc, out)
        return
    os.makedirs(out, exist_ok=True)
    urls = sitemap_urls(loc)
    print(f"{loc}: {len(urls)} Seiten in der Sitemap")

    def one(u):
        path = urllib.parse.unquote(urllib.parse.urlparse(u).path).rstrip("/")
        target = os.path.join(out, slug(path) + ".html")
        if os.path.exists(target) and os.path.getsize(target) > 1000:
            return "skip"
        try:
            status, final, body = get(u)
        except Exception as e:  # noqa: BLE001
            return f"fail {u} {e}"
        if urllib.parse.urlparse(final).path.rstrip("/") != path:
            return f"redirect {u} -> {final}"
        with open(target, "w", encoding="utf-8") as fh:
            fh.write(body)
        time.sleep(0.2)
        return "ok"

    with ThreadPoolExecutor(4) as ex:
        res = list(ex.map(one, urls))
    for r in res:
        if not r in ("ok", "skip"):
            print("  ", r)
    print(f"{loc}: ok {res.count('ok')}, übersprungen {res.count('skip')}, andere {sum(r not in ('ok', 'skip') for r in res)}")


if __name__ == "__main__":
    main()
