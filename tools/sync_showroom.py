"""
Übernimmt Produktbilder, Daten und die 3D-Engine aus dem Projekt
»zoller-produktumgebung-3d« in die Webseite (assets/showroom/, assets/js/world.js).

Aufruf:  python3 tools/sync_showroom.py [pfad/zu/zoller-produktumgebung-3d]
Danach:  python3 tools/build.py
"""
import json
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(os.path.dirname(ROOT), "zoller-produktumgebung-3d")
DOCS = os.path.join(SRC, "docs")
OUT = os.path.join(ROOT, "assets", "showroom")

KEEP = ("id", "name", "badge", "cat", "sub", "kind", "h", "aspect", "tier", "path", "claim", "teaser")


def main():
    data = json.load(open(os.path.join(DOCS, "data", "products.json"), encoding="utf-8"))
    os.makedirs(OUT, exist_ok=True)
    slim = {
        "categories": [{k: c[k] for k in ("id", "name", "text", "wall", "subs", "count")} for c in data["categories"]],
        "products": [{k: p.get(k) for k in KEEP if p.get(k) is not None} for p in data["products"]],
    }
    with open(os.path.join(OUT, "products.json"), "w", encoding="utf-8") as fh:
        json.dump(slim, fh, ensure_ascii=False, separators=(",", ":"))
    for sub in ("img/p", "img/hd", "img/wall"):
        dst = os.path.join(OUT, sub)
        if os.path.isdir(dst):
            shutil.rmtree(dst)
        shutil.copytree(os.path.join(DOCS, sub), dst)
    shutil.copyfile(os.path.join(DOCS, "assets", "js", "world.js"), os.path.join(ROOT, "assets", "js", "world.js"))
    n = len(os.listdir(os.path.join(OUT, "img", "hd")))
    print(f"{len(slim['products'])} Produkte, {n} freigestellte Bilder -> {OUT}")


if __name__ == "__main__":
    main()
