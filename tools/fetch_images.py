"""Lädt alle in content/images.json referenzierten Bilder nach docs/fileadmin/."""
import json, os, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs")
imgs = json.load(open(os.path.join(ROOT, "content", "images.json")))
def get(src):
    path = urllib.parse.unquote(src.split("?")[0])
    target = os.path.join(OUT, path.lstrip("/"))
    if os.path.exists(target) and os.path.getsize(target) > 0:
        return "skip"
    os.makedirs(os.path.dirname(target), exist_ok=True)
    url = "https://www.zoller.info" + src
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            data = urllib.request.urlopen(req, timeout=40).read()
            open(target, "wb").write(data)
            return "ok"
        except Exception as e:
            err = e
            time.sleep(1 + attempt)
    return f"fail {src} {err}"
with ThreadPoolExecutor(6) as ex:
    res = list(ex.map(get, imgs))
fails = [r for r in res if r.startswith("fail")]
print("ok", res.count("ok"), "skip", res.count("skip"), "fail", len(fails))
for f in fails[:20]: print(f)
