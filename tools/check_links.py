"""Prüft alle relativen Links/Bilder in docs/ (oder dem angegebenen Ordner, z. B. dist/zoller-canada) auf existierende Ziele."""
import os, re, glob, collections, sys, urllib.parse
ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs")
bad = collections.Counter(); ext = collections.Counter(); total = 0
for f in glob.glob(os.path.join(ROOT, "**", "*.html"), recursive=True):
    s = open(f, encoding="utf-8").read()
    base = os.path.dirname(f)
    for attr, url in re.findall(r'\b(href|src)="([^"]+)"', s):
        total += 1
        if url.startswith(("http", "mailto:", "tel:", "#", "data:", "javascript:")):
            if "zoller.info" in url and "/fileadmin/" not in url: ext[re.sub(r"\?.*", "", url)] += 1
            continue
        p = urllib.parse.unquote(url.split("#")[0].split("?")[0])
        if not p: continue
        target = os.path.normpath(os.path.join(base, p))
        if os.path.isdir(target): target = os.path.join(target, "index.html")
        if not os.path.exists(target): bad[(os.path.relpath(f, ROOT), url)] += 1
print("links checked:", total, "broken:", len(bad))
for (f, u), n in list(bad.items())[:25]: print("  ", f, "->", u)
print("links to zoller.info pages (not rebuilt):", len(ext))
for u, n in ext.most_common(25): print("  ", n, u)
