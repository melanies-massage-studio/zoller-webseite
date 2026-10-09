"""Extrahiert Hauptnavigation, Meta-Navigation und Footer aus der Startseite."""
import json
import os
import re
import sys

from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(__file__))
import extract  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def t(el):
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True)).strip() if el is not None else ""


def item(li):
    a = li.find("a", recursive=False) or li.find("a")
    if a is None:
        return None
    node = {"label": "", "href": extract.norm_href(a.get("href", ""))}
    td = a.find(class_="mega-menu__item--title-description")
    if td is not None:
        node["label"] = t(td.find("span"))
        node["claim"] = t(td.find("p"))
        sc = a.find(class_="product-showcase")
        if sc is not None:
            node["desc"] = t(sc.find("p"))
            im = extract.img_info(sc.find("img"))
            if im:
                node["img"] = im["src"]
    else:
        sp = a.find("span")
        node["label"] = t(sp) if sp is not None else t(a)
    kids = []
    sub = li.find("ul")
    if sub is not None:
        seen = set()
        for c in sub.find_all("li", recursive=False):
            it = item(c)
            if not it or not it["label"] or it["label"] in SKIP_LABELS or (it["href"], it["label"]) in seen:
                continue
            seen.add((it["href"], it["label"]))
            kids.append(it)
    if kids:
        node["children"] = kids
    return node


SKIP_LABELS = ("zurück", "back", "retour", "regresar", "volver", "atrás")
CLOSE_LABELS = ("Suche schließen", "Close Menu", "Fermer le menu", "Cerrar menú")
OVERVIEW_LABELS = ("Übersicht", "overview", "Overview", "aperçu", "Aperçu", "vue d'ensemble", "Vue d'ensemble", "resumen", "Resumen", "visión general", "Visión general")


def extract_nav(raw):
    soup = BeautifulSoup(open(raw, encoding="utf-8").read(), "lxml")
    header = soup.find("header")
    uls = [u for u in header.find_all("ul") if not u.find_parent("ul")]
    meta = []
    for li in uls[0].find_all("li", recursive=False):
        a = li.find("a")
        if a is not None and t(a):
            meta.append({"label": t(a), "href": extract.norm_href(a.get("href"))})
    nav = []
    for li in uls[1].find_all("li", recursive=False):
        it = item(li)
        if it and it["label"] and it["href"] and it["label"] not in CLOSE_LABELS:
            # "Übersicht"-Duplikate entfernen
            if "children" in it:
                it["children"] = [c for c in it["children"] if c["label"] not in OVERVIEW_LABELS]
            nav.append(it)
    footer = soup.find("footer")
    groups = []
    for col in footer.select(".footer__column, .footer-column, nav, .footer__links"):
        pass
    flinks = [{"label": t(a), "href": extract.norm_href(a.get("href"))} for a in footer.find_all("a", href=True) if t(a)]
    return {"meta": meta, "main": nav, "footer_links": flinks}


def main():
    data = extract_nav(sys.argv[1])
    nav = data["main"]
    os.makedirs(os.path.join(ROOT, "content"), exist_ok=True)
    json.dump(data, open(os.path.join(ROOT, "content", "nav.json"), "w"), ensure_ascii=False, indent=1)
    for n in nav:
        print(n["label"], n["href"], len(n.get("children", [])))


if __name__ == "__main__":
    main()
