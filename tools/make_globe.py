#!/usr/bin/env python3
"""Erzeugt die Landmaske für den 3D-Standortglobus (assets/js/globe-land.js).

Die Landflächen stammen aus Natural Earth (ne_50m_land, Public Domain). Sie werden
auf ein Raster gezeichnet und auf eine Fibonacci-Kugel mit N Punkten abgetastet;
gespeichert wird nur ein Bit pro Punkt (Land ja/nein) als Base64. Der Globus
erzeugt die Punkte im Browser identisch neu und filtert sie mit dieser Maske.

Aufruf: python3 tools/make_globe.py [pfad/zu/ne_50m_land.geojson]
(ohne Pfad wird die Datei von GitHub geladen). Reines Python, keine Abhängigkeiten.
"""
import base64, json, math, os, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson"
N = 70000            # Punkte auf der Kugel (muss zu POINTS in globe.js passen)
W, H = 2880, 1440    # Rasterauflösung (8 px pro Grad)


def load(path):
    if path:
        return json.load(open(path, encoding="utf-8"))
    with urllib.request.urlopen(SRC) as r:
        return json.load(r)


def rings(geo):
    for f in geo["features"]:
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for poly in polys:
            for ring in poly:
                yield ring


def rasterize(geo):
    """Gerade-Ungerade-Füllung per Scanline; Kanten werden nach Zeilen sortiert."""
    rows = [[] for _ in range(H)]
    for ring in rings(geo):
        pts = [((lng + 180) / 360 * W, (90 - lat) / 180 * H) for lng, lat in ring]
        for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]):
            if y0 == y1:
                continue
            if y0 > y1:
                x0, y0, x1, y1 = x1, y1, x0, y0
            for r in range(max(0, math.ceil(y0 - .5)), min(H, math.ceil(y1 - .5))):
                yc = r + .5
                rows[r].append(x0 + (yc - y0) * (x1 - x0) / (y1 - y0))
    mask = []
    for xs in rows:
        xs.sort()
        row = bytearray(W)
        for a, b in zip(xs[0::2], xs[1::2]):
            for c in range(max(0, math.ceil(a - .5)), min(W, math.ceil(b - .5))):
                row[c] = 1
        mask.append(row)
    return mask


def main():
    mask = rasterize(load(sys.argv[1] if len(sys.argv) > 1 else None))
    bits = bytearray((N + 7) // 8)
    golden = math.pi * (3 - math.sqrt(5))
    land = 0
    for i in range(N):
        y = 1 - (i + .5) / N * 2                     # identisch zu fibPoint() in globe.js
        lat = math.degrees(math.asin(y))
        lng = math.degrees((i * golden) % (2 * math.pi)) - 180
        r = min(H - 1, int((90 - lat) / 180 * H))
        c = min(W - 1, int((lng + 180) / 360 * W))
        if mask[r][c]:
            bits[i >> 3] |= 1 << (i & 7)
            land += 1
    out = os.path.join(ROOT, "assets", "js", "globe-land.js")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write("/* Landmaske für den Standortglobus – erzeugt von tools/make_globe.py aus Natural Earth (Public Domain). */\n")
        fh.write(f"export const POINTS = {N};\n")
        fh.write(f'export const LAND = "{base64.b64encode(bits).decode()}";\n')
    print(f"{land} von {N} Punkten sind Land → {os.path.relpath(out, ROOT)}")


if __name__ == "__main__":
    main()
