"""
Extrahiert die Inhalte der bestehenden zoller.info-Seiten (TYPO3) in ein
neutrales JSON-Format (content/pages/*.json). Jede Seite besteht aus einer
Liste von Blöcken; jeder TYPO3-Inhaltsbaustein wird vollständig übernommen.

Aufruf:  python tools/extract.py <raw-html-verzeichnis> <redirects.json>
"""
import glob
import html as htmllib
import json
import os
import re
import sys
import urllib.parse

from bs4 import BeautifulSoup, Comment, NavigableString, Tag

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "content", "pages")
ORIGIN = "https://www.zoller.info"

ALLOWED_TAGS = {
    "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "strong", "b", "em", "i", "u", "sup", "sub", "small",
    "ul", "ol", "li", "a", "img", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
    "blockquote", "figure", "figcaption", "hr", "iframe", "video", "source", "dl", "dt", "dd", "span",
    "form", "input", "select", "option", "textarea", "label", "button", "fieldset", "legend", "optgroup",
}
KEEP_CLASSES = {"large-text", "extra-large-text", "small-text", "text-center", "text-right", "bold", "required",
                "form-group", "row", "form-check", "checkbox", "help-block", "form-text", "notice-list"}
UNWRAP_TAGS = {"div", "section", "article", "header", "footer", "main", "aside", "nav", "picture", "font", "center"}

redirects = {}
images = set()


# ---------------------------------------------------------------- URLs ----
def norm_href(href):
    if not href:
        return ""
    href = htmllib.unescape(href.strip())
    if href.startswith(ORIGIN):
        href = href[len(ORIGIN):] or "/"
    if href.startswith("http://www.zoller.info"):
        href = href[len("http://www.zoller.info"):] or "/"
    if href.startswith("/") and not href.startswith("//"):
        path = href.split("#")[0]
        if path in redirects:
            fin = redirects[path]["final"]
            if fin.startswith("/") and redirects[path]["code"] == "200":
                href = fin
        # Query-Parameter bei normalen Seiten entfernen (cHash etc.), bei Dateien belassen
        if "?" in href and not href.startswith("/fileadmin"):
            base, q = href.split("?", 1)
            if "tx_news_pi1" not in q and "currentPage" not in q:
                href = base
    return href


def img_src(src):
    if not src:
        return ""
    src = htmllib.unescape(src.strip())
    if src.startswith(ORIGIN):
        src = src[len(ORIGIN):]
    src = src.split("?")[0] if src.startswith("/_assets") else src
    if src.startswith("/fileadmin"):
        images.add(src)
    return src


def pick_picture(pic, size="medium"):
    """Wählt aus <picture> eine passende Bildgröße (1x)."""
    if pic is None:
        return ""
    cands = []
    for s in pic.find_all("source"):
        m = re.search(r"min-width:\s*(\d+)", s.get("media", ""))
        w = int(m.group(1)) if m else 0
        ss = s.get("srcset") or s.get("data-srcset") or ""
        first = ss.split(",")[0].strip().split(" ")[0]
        if first:
            cands.append((w, first))
    img = pic.find("img")
    fallback = img.get("src") or img.get("data-src") if img else ""
    if not cands:
        return img_src(fallback)
    cands.sort(reverse=True)
    if size == "large":
        choice = [c for c in cands if c[0] <= 1920] or cands
        return img_src(choice[0][1])
    choice = [c for c in cands if c[0] <= 1200] or cands[-1:]
    return img_src(choice[0][1])


def img_info(img, pic_size="medium"):
    if img is None:
        return None
    pic = img.find_parent("picture")
    src = pick_picture(pic, pic_size) if pic else img_src(img.get("src") or img.get("data-src") or "")
    if not src or "/_assets/" in src:
        return None
    d = {"src": src, "alt": (img.get("alt") or "").strip()}
    for k in ("width", "height"):
        v = img.get(k)
        if v and str(v).isdigit():
            d[k[0]] = int(v)
    if img.get("title"):
        d["title"] = img["title"].strip()
    return d


# ------------------------------------------------------------- Cleaning ----
def is_blank(el):
    if not isinstance(el, Tag):
        return False
    if el.name in ("img", "br", "hr", "iframe", "video", "input", "select", "textarea", "button", "td", "th"):
        return False
    if el.find(["img", "iframe", "video", "input", "select", "textarea", "table", "hr"]):
        return False
    txt = el.get_text("", strip=True).replace("\xa0", "").replace("­", "")
    return txt == ""


def clean(el, keep_forms=False):
    """Gibt bereinigtes, semantisches HTML eines Elements zurück."""
    if el is None:
        return ""
    soup = BeautifulSoup(str(el), "lxml")
    body = soup.body or soup
    for c in body.find_all(string=lambda t: isinstance(t, Comment)):
        c.extract()
    for t in body.find_all(["script", "style", "noscript", "svg", "template", "link", "meta"]):
        t.decompose()
    for t in body.find_all("input", {"type": "hidden"}):
        t.decompose()
    for t in body.select(".splide__arrows, .slider-controller, .scroll-arrow, .share-buttons, .overlay-button, .button-underlay"):
        t.decompose()
    if not keep_forms:
        for t in body.find_all(["form"]):
            t.unwrap()
        for t in body.find_all("button"):
            t.decompose()
    for pic in body.find_all("picture"):
        img = pic.find("img")
        if img is not None:
            src = pick_picture(pic, "medium")
            new = soup.new_tag("img", src=src, alt=img.get("alt", ""))
            for k in ("width", "height"):
                if img.get(k):
                    new[k] = img[k]
            pic.replace_with(new)
        else:
            pic.decompose()
    for t in body.find_all("source"):
        if t.parent and t.parent.name == "video":
            continue
        t.unwrap()
    for img in body.find_all("img"):
        src = img.get("src") or img.get("data-src") or ""
        if "/_assets/" in src or not src:
            img.decompose()
            continue
        img.attrs = {k: v for k, v in img.attrs.items() if k in ("src", "alt", "width", "height", "title", "data-src")}
        if "data-src" in img.attrs:
            img["src"] = img.attrs.pop("data-src")
        img["src"] = img_src(img["src"])
        img["loading"] = "lazy"
        img["alt"] = img.get("alt", "")
    for a in body.find_all("a"):
        cls = a.get("class") or []
        href = norm_href(a.get("href", ""))
        attrs = {}
        if href:
            attrs["href"] = href
        if a.get("target") == "_blank" or (href.startswith("http") and "zoller.info" not in href):
            attrs["target"] = "_blank"
            attrs["rel"] = "noopener"
        if a.get("title"):
            attrs["title"] = a["title"]
        if "block-button" in cls or "btn" in cls:
            attrs["class"] = "btn"
        elif "arrow-link" in cls or "link-arrow" in cls:
            attrs["class"] = "link-arrow"
        a.attrs = attrs
        if not href:
            a.unwrap()
    for t in body.find_all("iframe"):
        src = t.get("src") or t.get("data-src") or ""
        t.attrs = {"src": src, "title": t.get("title", "Video"), "allowfullscreen": ""}
    for t in body.find_all(True):
        if t.name in UNWRAP_TAGS:
            t.unwrap()
            continue
        if t.name not in ALLOWED_TAGS:
            t.unwrap()
            continue
        if t.name in ("a", "img", "iframe"):
            continue
        keep = [c for c in (t.get("class") or []) if c in KEEP_CLASSES]
        attrs = {}
        if keep:
            attrs["class"] = " ".join(keep)
        for k in ("colspan", "rowspan", "type", "name", "id", "for", "value", "required", "placeholder",
                  "multiple", "checked", "selected", "rows", "maxlength", "autocomplete", "src", "controls",
                  "poster", "muted", "loop", "playsinline", "autoplay"):
            if t.get(k) is not None:
                attrs[k] = t.get(k)
        t.attrs = attrs
    for t in body.find_all("span"):
        if not t.attrs:
            t.unwrap()
    # leere Elemente entfernen
    changed = True
    while changed:
        changed = False
        for t in body.find_all(["p", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "b", "em", "li", "ul", "ol", "figure", "blockquote", "span"]):
            if is_blank(t):
                t.decompose()
                changed = True
    out = "".join(str(c) for c in body.contents)
    out = re.sub(r"\s+", " ", out)
    out = re.sub(r">\s+<", "> <", out)
    out = re.sub(r"(<br/?>\s*)+(</p>)", r"\2", out)
    out = re.sub(r"(<p>)\s*(<br/?>\s*)+", r"\1", out)
    return out.strip()


def text(el):
    if el is None:
        return ""
    t = el.get_text(" ", strip=True).replace("\xa0", " ")
    return re.sub(r"\s+", " ", t).strip()


# ------------------------------------------------------------- Helpers ----
def frame_type(fr):
    for c in fr.get("class") or []:
        if c.startswith("frame-type-"):
            return c[len("frame-type-"):]
    return ""


def frame_bg(fr):
    for c in fr.get("class") or []:
        if c.startswith("frame-background-"):
            v = c[len("frame-background-"):]
            return {"default": "", "none": ""}.get(v, v)
    return ""


def frame_space(fr):
    sp = {}
    for c in fr.get("class") or []:
        m = re.match(r"frame-padding-space-(before|after)-(.*)", c)
        if m:
            sp[m.group(1)] = m.group(2)
    return sp


def is_frame(t):
    return isinstance(t, Tag) and any(c.startswith("frame-type-") for c in (t.get("class") or []))


def child_frames(el):
    """Direkte Kind-Frames (ohne verschachtelte)."""
    out = []
    for t in el.find_all(is_frame):
        p = t.parent
        nested = False
        while p is not None and p is not el:
            if is_frame(p):
                nested = True
                break
            p = p.parent
        if not nested:
            out.append(t)
    return out


def header_html(fr):
    """Überschriften-Block eines Frames (<header> direkt im content-inner)."""
    inner = fr.find(class_="content-inner") or fr
    hdr = inner.find("header", recursive=False)
    if hdr is None:
        for h in inner.find_all("header"):
            if h.find_parent(is_frame) is fr:
                hdr = h
                break
    if hdr is None:
        return ""
    decor = any("decor" in (h.get("class") or []) for h in hdr.find_all(re.compile("^h[1-6]$")))
    out = clean(hdr)
    if decor:
        out = re.sub(r"^<(h[1-6])>", r'<\1 class="headline-decor">', out)
    return out


def bodytext(el):
    if el is None:
        return ""
    return clean(el)


# ------------------------------------------------------------- Blocks ----
def parse_textmedia(fr):
    tp = fr.find(class_=re.compile(r"^ce-(textpic|image|text)"))
    hdr = header_html(fr)
    body_el = fr.find(class_="ce-bodytext")
    # Header im Bodytext (z. B. bei shortcut/textmedia)
    body = ""
    if body_el is not None:
        hdr_in = body_el.find("header")
        if hdr_in is not None:
            if not hdr:
                hdr = clean(hdr_in)
            hdr_in.decompose()
        body = bodytext(body_el)
    imgs = []
    videos = []
    gal = fr.find(class_="ce-gallery")
    cols = 1
    if gal is not None:
        cols = int(gal.get("data-ce-columns") or 1)
        for fig in gal.find_all("figure"):
            iframe = fig.find("iframe")
            video = fig.find("video")
            if iframe is not None:
                src = iframe.get("src") or iframe.get("data-src") or ""
                videos.append({"kind": "iframe", "src": src, "title": iframe.get("title", "")})
                continue
            if video is not None:
                s = video.find("source")
                src = (s.get("src") if s else None) or video.get("src") or ""
                if src.startswith(ORIGIN):
                    src = src[len(ORIGIN):]
                videos.append({"kind": "video", "src": src})
                continue
            im = img_info(fig.find("img"))
            if im:
                a = fig.find("a")
                if a and a.get("href"):
                    im["href"] = norm_href(a["href"])
                cap = fig.find("figcaption")
                if cap:
                    im["caption"] = clean(cap)
                imgs.append(im)
        # Bilder ohne figure
        if not imgs and not videos:
            for im in gal.find_all("img"):
                i = img_info(im)
                if i:
                    imgs.append(i)
    pos = "text"
    cls = " ".join(tp.get("class") or []) if tp is not None else ""
    if imgs or videos:
        if "ce-right" in cls and "ce-intext" in cls:
            pos = "right"
        elif "ce-left" in cls and "ce-intext" in cls:
            pos = "left"
        elif "ce-below" in cls:
            pos = "below"
        else:
            pos = "above"
    align = "center" if "ce-center" in cls and pos in ("above", "below", "text") else ""
    return {
        "type": "textmedia", "header": hdr, "body": body, "images": imgs, "videos": videos,
        "pos": pos, "cols": cols, "valign": "center" if "ce-text-vertical-center" in cls else "top",
    }


def parse_slides_hero(fr):
    slides = []
    for sl in fr.select(".splide__slide, .slide"):
        if sl.find_parent(class_="splide__slide") is not None:
            continue
        pic = sl.find("picture")
        img = pick_picture(pic, "large") if pic else (img_src(sl.find("img")["src"]) if sl.find("img") else "")
        video = None
        v = sl.find("video")
        if v is not None:
            s = v.find("source")
            video = (s.get("src") if s else None) or v.get("src") or v.get("data-src")
            if video and video.startswith(ORIGIN):
                video = video[len(ORIGIN):]
        head = sl.find(class_="slide__head")
        kicker = ""
        title = ""
        if head is not None:
            h = head.find(re.compile("^h[1-6]$"))
            title = text(h) if h else ""
            ps = [text(p) for p in head.find_all("p") if text(p)]
            if not title and ps:
                title = ps.pop(0)
            elif ps:
                kicker = " ".join(ps)
        txt = sl.find(class_="slide__text")
        body = clean(txt) if txt else ""
        btns = [clean(a) for a in sl.select("a.block-button")]
        dark = "black-text" in " ".join(sl.find(class_="slide__content__wrapper").get("class") or []) if sl.find(class_="slide__content__wrapper") else False
        slides.append({"img": img, "video": video, "title": title, "kicker": kicker, "text": body,
                       "buttons": [b for b in btns if b and b not in body], "light": dark})
    return {"type": "hero", "slides": slides}


def parse_product_header(fr):
    t = fr.find(class_="product-header-content--text")
    h = t.find(re.compile("^h[1-6]$")) if t else None
    title = text(h)
    if h:
        h.decompose()
    img = img_info(fr.find(class_="product-header-content--image").find("img")) if fr.find(class_="product-header-content--image") else None
    return {"type": "product_header", "title": title, "text": clean(t), "img": img}


def parse_subnav(fr):
    items = []
    title = ""
    for li in fr.select("li"):
        a = li.find("a")
        cur = li.find(class_="current")
        if "menu_subpages_title" in (li.get("class") or []):
            title = text(li)
            href = norm_href(a["href"]) if a else ""
            items.append({"label": "Übersicht", "href": href, "title": True, "current": bool(cur)})
            continue
        if a is not None:
            items.append({"label": text(a), "href": norm_href(a.get("href")), "current": False})
        elif cur is not None:
            items.append({"label": text(cur), "href": "", "current": True})
    return {"type": "subnav", "title": title, "items": items}


def parse_columns(fr, ftype):
    layout = ftype.replace("container-", "")
    cc = fr.find(class_="column-container")
    if cc is not None:
        for c in cc.get("class") or []:
            if c.startswith("column-") and c != "column-container":
                layout = c.replace("column-", "")
    cols = []
    for col in (cc.find_all(class_="column", recursive=False) if cc else []):
        cols.append(parse_frames(col))
    return {"type": "cols", "layout": layout, "columns": cols}


def parse_content_scroller(fr):
    left = fr.find(class_="left")
    h2 = left.find(class_="header") if left else None
    sub = left.find(class_="subheader") if left else None
    items = []
    for sc in fr.select(".scroll-content"):
        items.append({
            "label": text(sc.find(class_="scroll-content__header")),
            "value": text(sc.find(class_="scroll-content__big-title")),
            "text": clean(sc.find(class_="scroll-content__text")),
        })
    return {"type": "kpis", "title": text(h2), "subtitle": text(sub), "items": items}


def parse_icon_button(fr):
    w = fr.find(class_="icon-button-content")
    icon = img_info(w.find("img")) if w else None
    t = w.find(class_="icon-button-text") if w else None
    btn = w.select_one("a.block-button") if w else None
    return {"type": "cta_strip", "icon": icon, "text": clean(t), "button": clean(btn) if btn else ""}


def parse_highlight(fr):
    hl = fr.find(class_="highlights")
    items = [clean(p) for p in hl.find_all("p")] if hl else []
    items = [re.sub(r"^<p[^>]*>|</p>$", "", i) for i in items if i]
    return {"type": "highlight", "items": items, "header": header_html(fr)}


def parse_slider(fr):
    slides = []
    for sl in fr.select(".splide__slide"):
        pic = sl.find("picture")
        img = None
        if pic is not None:
            im = pic.find("img")
            img = {"src": pick_picture(pic, "medium"), "alt": (im.get("alt") or "") if im else ""}
        elif sl.find("img"):
            img = img_info(sl.find("img"))
        head = sl.find(class_="slide__head")
        content = sl.find(class_="slide__content")
        if content is not None and head is not None:
            head = head.extract()
        slides.append({"img": img, "head": clean(head) if head else "", "text": clean(content) if content else ""})
    return {"type": "slider", "header": header_html(fr), "slides": slides}


def parse_slider_full(fr):
    slides = []
    for sl in fr.select(".splide__slide"):
        pic = sl.find("picture")
        img = {"src": pick_picture(pic, "medium"), "alt": ""} if pic else None
        ov = sl.find(class_="slide__overlay")
        right = "position-right" in (ov.get("class") or []) if ov else False
        txt = sl.find(class_="slide__text")
        is_quote = sl.find("img", src=re.compile("quote")) is not None
        slides.append({"img": img, "text": clean(txt), "right": right, "quote": is_quote,
                       "dark": "darkmode" in (sl.get("class") or [])})
    return {"type": "quotes", "header": header_html(fr), "slides": slides}


def parse_overlay(fr):
    oc = fr.find(class_="overlay-inner-content")
    img = img_info(oc.find("img", recursive=False) or oc.find("img")) if oc else None
    t = oc.find(class_="overlay-inner-content--text") if oc else None
    title_el = t.find(class_="h3") if t else None
    title = text(title_el)
    if title_el:
        title_el.decompose()
    return {"type": "overlay", "img": img, "title": title, "text": clean(t)}


def parse_overlay_tiles(fr):
    w = fr.find(class_="overlay-tiles-wrapper")
    cols = 4
    if w is not None:
        for c in w.get("class") or []:
            m = re.match(r"column-(\d)", c)
            if m:
                cols = int(m.group(1))
    tiles = []
    for oc in fr.select(".overlay-content"):
        big = oc.find(class_="overlay-inner-content")
        tc = oc.find(class_="overlay-tiles-content")
        logo = img_info(tc.find("img")) if tc and tc.find("img") else None
        label = text(tc) if tc else ""
        bimg = None
        btxt = ""
        if big is not None:
            bi = big.find("img", recursive=False) or big.find("img")
            bimg = img_info(bi)
            t = big.find(class_="overlay-inner-content--text")
            btxt = clean(t)
        else:
            ot = oc.find(class_="overlay-text")
            btxt = clean(ot) if ot is not None else ""
        tiles.append({"logo": logo, "label": label, "img": bimg, "text": btxt})
    return {"type": "tiles", "header": header_html(fr), "cols": cols, "tiles": tiles}


def parse_accordion(fr):
    items = []
    for tab in fr.select(".frame-type-accordion-tab"):
        lab = tab.find("label")
        title = text(lab.find("span") if lab and lab.find("span") else lab)
        content = tab.find(class_="tab-content")
        blocks = parse_frames(content) if content is not None else []
        if not blocks and content is not None:
            blocks = [{"type": "raw", "html": clean(content)}]
        items.append({"title": title, "blocks": blocks})
    return {"type": "accordion", "header": header_html(fr), "items": items}


def parse_uploads(fr):
    files = []
    for li in fr.select("ul.ce-uploads > li"):
        a = li.find("a")
        name = text(li.find(class_="ce-uploads-fileName")) or (a.get("title") if a else "")
        size = text(li.find(class_="ce-uploads-filesize"))
        desc = text(li.find(class_="ce-uploads-description"))
        thumb = img_info(li.find("img"))
        files.append({"href": norm_href(a.get("href")) if a else "", "name": name, "size": size,
                      "desc": desc, "thumb": thumb})
    return {"type": "downloads", "header": header_html(fr), "files": files}


def parse_table(fr):
    tbl = fr.find("table")
    cap = header_html(fr)
    return {"type": "table", "header": cap, "table": clean(tbl)}


def parse_image_grid(fr):
    tiles = []
    for t in fr.select(".image-grid-tile"):
        pic = t.find("picture")
        img = {"src": pick_picture(pic, "large" if "full-width" in (t.get("class") or []) else "medium"), "alt": ""} if pic else img_info(t.find("img"))
        txt = t.find(class_="image-grid-text")
        tiles.append({"img": img, "text": clean(txt), "full": "full-width" in (t.get("class") or [])})
    intro = fr.find(class_="content")
    return {"type": "bento", "header": header_html(fr), "intro": clean(intro) if intro else "", "tiles": tiles}


def parse_menu_pages(fr):
    items = []
    for a in fr.select(".menu-pages-wrapper > a, .menu-pages-wrapper > .menu-pages-content"):
        mt = a.find(class_="menu-pages-text")
        title, body = text(a), ""
        if mt is not None:
            h = mt.find(re.compile("^h[1-6]$"))
            title = text(h)
            if h is not None:
                h.extract()
            body = clean(mt)
        items.append({"href": norm_href(a.get("href")) if a.name == "a" else "", "title": title, "text": body, "img": img_info(a.find("img"))})
    return {"type": "products", "header": header_html(fr), "items": items}


def parse_hotspots(fr):
    wrap = fr.find(class_="overflow-content") or fr
    img = None
    for im in wrap.find_all("img", recursive=False):
        img = img_info(im)
        if img:
            break
    if img is None:
        img = img_info(fr.find("img"))
    intro_el = fr.find(class_="overflow-text")
    spots = []
    for hs in fr.select(".hotspot"):
        try:
            co = json.loads(htmllib.unescape(hs.get("data-coordinates") or "{}"))
        except Exception:
            co = {}
        label = text(hs.find(class_="marker-description"))
        c = hs.find(class_="marker__content")
        spots.append({"x": round(float(co.get("x", 50)), 3), "y": round(float(co.get("y", 50)), 3),
                      "label": label, "text": clean(c)})
    return {"type": "hotspots", "header": header_html(fr), "intro": clean(intro_el) if intro_el else "",
            "img": img, "spots": spots}


def parse_column_image_text(fr):
    tiles = []
    for t in fr.select(".column-image-text-tile"):
        tiles.append({"img": img_info(t.find("img")), "text": clean(t.find(class_="column-image-text-content"))})
    return {"type": "values", "header": header_html(fr), "tiles": tiles}


def parse_count_banner(fr):
    w = fr.find(class_="count-banner-wrapper")
    h = w.find(re.compile("^h[1-6]$")) if w else None
    val = text(w.find(class_="tile__header")) if w else ""
    note = w.find(class_="count-banner-content").find("p") if w and w.find(class_="count-banner-content") else None
    return {"type": "count", "title": text(h), "value": val, "note": text(note)}


def parse_cta_banner(fr):
    pic = fr.find("picture")
    img = {"src": pick_picture(pic, "large"), "alt": ""} if pic else img_info(fr.find("img"))
    c = fr.find(class_="zoller-cta-banner__overlay")
    return {"type": "cta_banner", "img": img, "text": clean(c)}


def parse_newslist(fr):
    arts = []
    for art in fr.select(".article"):
        a = art.find("a")
        tags = [text(t) for t in art.select(".tag")]
        date = art.find("time")
        arts.append({
            "href": norm_href(a.get("href")) if a else "",
            "img": img_info(art.find("img")),
            "tags": [t for t in tags if t],
            "title": text(art.find(itemprop="headline")) or (a.get("title") if a else ""),
            "teaser": text(art.find(class_="teaser-text")),
            "date": (date.get("datetime") if date else "") or "",
        })
    pages = []
    for li in fr.select(".pagination li, .f3-widget-paginator li, nav.pagination a"):
        a = li if li.name == "a" else li.find("a")
        lab = text(li)
        if not lab:
            continue
        pages.append({"label": lab, "href": norm_href(a.get("href")) if a else "",
                      "current": "current" in " ".join(li.get("class") or []) or a is None})
    return {"type": "newslist", "header": header_html(fr), "articles": arts, "pages": pages}


def parse_taglist(fr):
    tags = []
    for o in fr.select("option[data-url]"):
        tags.append({"label": text(o), "href": norm_href(o["data-url"])})
    return {"type": "taglist", "tags": tags}


def parse_quote(fr):
    q = fr.find(class_="quote__text")
    src = fr.find(class_="quote__source")
    author = [text(s) for s in src.select(".quote__author span")] if src else []
    return {"type": "quote", "text": clean(q), "img": img_info(src.find("img")) if src else None, "author": author}


def parse_zoller_hero(fr):
    pic = fr.find("picture")
    img = {"src": pick_picture(pic, "large"), "alt": ""} if pic else img_info(fr.find("img"))
    h = fr.find(class_="zoller-hero__overlay-text")
    return {"type": "hero", "slides": [{"img": img["src"] if img else "", "title": "", "kicker": "",
                                         "title_html": clean(h), "text": "", "buttons": []}]}


def parse_icon_list(fr):
    items = []
    for it in fr.select(".icon-list__item"):
        items.append({
            "subtitle": text(it.find(class_="icon-list__item__subtitle")),
            "icon": img_info(it.find("img")),
            "value": text(it.find(class_="icon-list__item__header")),
            "text": clean(BeautifulSoup("".join(str(p) for p in it.find_all("p", recursive=False)), "lxml")),
            "content": clean(it.find(class_="icon-list__item__content")),
        })
    return {"type": "icon_list", "header": header_html(fr), "items": items}


def parse_tiles_goals(fr):
    tiles = []
    for col in fr.select(".column"):
        tiles.append({
            "img": img_info(col.find("img")),
            "value": text(col.find(class_="tile__header")),
            "text": clean(col.find(class_="tile__text")),
            "foot": clean(col.find(class_="tile__footnote")),
        })
    return {"type": "goals", "header": header_html(fr), "tiles": tiles}


def parse_timeline(fr):
    ms = []
    for m in fr.select(".milestone, [data-milestone-id], .timeline-item"):
        ms.append(m)
    items = []
    # Inhalte der Meilensteine
    for m in fr.select(".zoller-timeline-milestone, .timeline-milestone, .milestone"):
        year = text(m.find(class_=re.compile("year")))
        items.append({"year": year, "html": clean(m), "img": img_info(m.find("img"))})
    if not items:
        return {"type": "raw", "html": clean(fr)}
    return {"type": "timeline", "items": items}


def parse_news_detail(fr):
    art = fr.find(class_="news-single")
    if art is None:
        return {"type": "raw", "html": clean(fr)}
    date = art.find("time")
    tags = [text(s).strip(" |") for s in art.select(".news-list-tags span")]
    tw = art.find(class_="news-text-wrap")
    h = tw.find(re.compile("^h[1-6]$")) if tw else None
    title = text(h)
    if h is not None:
        h.decompose()
    lead = clean(tw)
    ce = art.find(id="content-elements")
    blocks = parse_frames(ce) if ce is not None else []
    imgs = []
    for im in art.select(".news-img-wrap img, .mediaelement img"):
        if im.find_parent(id="content-elements") is None:
            i = img_info(im)
            if i:
                imgs.append(i)
    related = []
    for a in art.select(".news-related a, .related a"):
        related.append({"href": norm_href(a.get("href")), "label": text(a)})
    rest = art.find(class_="news-backlink-wrap")
    return {"type": "article", "date": date.get("datetime") if date else "", "date_label": text(date),
            "tags": [t for t in tags if t], "title": title, "lead": lead, "images": imgs,
            "blocks": blocks, "related": related}


def light_clean(el):
    """Behält die Struktur (Klassen, Formularfelder) und entfernt nur Skripte.
    Formular-Ziele zeigen auf das bestehende TYPO3-Backend, damit Anfragen
    weiterhin dort verarbeitet werden."""
    soup = BeautifulSoup(str(el), "lxml")
    body = soup.body or soup
    for c in body.find_all(string=lambda t: isinstance(t, Comment)):
        c.extract()
    for t in body.find_all(["script", "style", "noscript", "link", "meta"]):
        t.decompose()
    for t in body.find_all("img"):
        src = t.get("src") or ""
        if "/_assets/" in src:
            t["src"] = ORIGIN + src.split("?")[0]
        elif src:
            t["src"] = img_src(src)
    for a in body.find_all("a"):
        if a.get("href"):
            a["href"] = norm_href(a["href"])
    for f in body.find_all("form"):
        act = htmllib.unescape(f.get("action") or "")
        if act.startswith("/"):
            f["action"] = ORIGIN + act
    for t in body.find_all(True):
        if t.get("style"):
            del t["style"]
    out = "".join(str(c) for c in body.contents)
    return re.sub(r"\s+", " ", out).strip()


def parse_form(fr, ftype):
    form = fr.find("form")
    return {"type": "form", "kind": ftype, "html": light_clean(form if form is not None else fr),
            "header": header_html(fr)}


def parse_academy(fr):
    items = []
    for it in fr.select(".zoller-academy__item, .academy-item, .zoller-academy__card, article"):
        a = it.find("a")
        items.append({
            "href": norm_href(a.get("href")) if a else "",
            "img": img_info(it.find("img")),
            "title": text(it.find(re.compile("^h[1-6]$"))),
            "text": clean(it),
        })
    filters = {}
    for flt in fr.select(".zoller-academy__filter"):
        lab = text(flt.find("label"))
        opts = [text(o.find("span")) for o in flt.select(".multi-select__option")]
        if lab:
            filters[lab] = opts
    return {"type": "academy", "filters": filters, "items": items, "raw": clean(fr) if not items else ""}


PARSERS = {
    "textmedia": parse_textmedia, "textpic": parse_textmedia, "text": parse_textmedia, "image": parse_textmedia,
    "zoller_hero-slider": parse_slides_hero, "zoller_product_header": parse_product_header,
    "menu_subpages": parse_subnav, "zoller_content-scroller": parse_content_scroller,
    "zoller_icon-button": parse_icon_button, "zoller_highlight": parse_highlight,
    "zoller_slider": parse_slider, "zoller_slider-full-width": parse_slider_full,
    "zoller_overlay": parse_overlay, "zoller_overlay-tiles": parse_overlay_tiles,
    "accordion": parse_accordion, "uploads": parse_uploads, "table": parse_table,
    "zoller_image-grid": parse_image_grid, "menu_pages": parse_menu_pages,
    "menu_categorized_pages": parse_menu_pages, "zoller_image-hotspots": parse_hotspots,
    "zoller_column-image-text": parse_column_image_text, "zoller_count-banner": parse_count_banner,
    "zoller_cta-banner": parse_cta_banner, "news_newsliststicky": parse_newslist, "news_pi1": parse_newslist,
    "news_taglist": parse_taglist, "zoller_quote": parse_quote, "zoller_hero": parse_zoller_hero,
    "zoller_icon-list": parse_icon_list, "zoller_tiles": parse_tiles_goals,
    "news_newsdetail": parse_news_detail, "zoller_academy": parse_academy,
}


def parse_frame(fr):
    ft = frame_type(fr)
    base = {"id": fr.get("id", ""), "bg": frame_bg(fr), "space": frame_space(fr)}
    if ft == "shortcut":
        inner = parse_frames(fr.find(class_="content-inner") or fr)
        for b in inner:
            if not b.get("bg") and base["bg"]:
                b["bg"] = base["bg"]
        return inner
    if ft.startswith("container-"):
        b = parse_columns(fr, ft)
    elif ft in ("form_formframework", "formdoubleoptin_doubleoptin", "zoller_serial", "zoller_economy"):
        b = parse_form(fr, ft)
        if ft in ("zoller_serial", "zoller_economy"):
            inner = fr.find(class_="content-inner") or fr
            hdr = inner.find("header", recursive=False)
            if hdr is not None:
                hdr.extract()
            b["html"] = light_clean(inner)
    elif ft in ("ke_search_pi1", "ke_search_pi2"):
        return [{"type": "search", **base}]
    elif ft == "list" and fr.find(id="retailer-search-ajax"):
        holder = fr.find(id="uri-holder")
        b = {"type": "locations", "uri": (holder.get("data-uri") or "").strip() if holder else ""}
    elif ft == "header":
        h = header_html(fr)
        if not h:
            return []
        b = {"type": "textmedia", "header": h, "body": "", "images": [], "videos": [], "pos": "text", "cols": 1, "valign": "top"}
    elif ft == "zoller_timeline":
        b = {"type": "timeline_raw", "html": str(fr)}
    elif ft in PARSERS:
        try:
            b = PARSERS[ft](fr)
        except Exception as e:  # Fallback: nichts verlieren
            print("  ! parser", ft, "failed:", e, file=sys.stderr)
            b = {"type": "raw", "html": clean(fr)}
    else:
        b = {"type": "raw", "html": clean(fr), "ftype": ft}
    if isinstance(b, dict):
        b.setdefault("ftype", ft)
        b.update({k: v for k, v in base.items() if k not in b or not b[k]})
        return [b]
    return b


def parse_frames(el):
    blocks = []
    for fr in child_frames(el):
        blocks.extend(parse_frame(fr))
    return blocks


# ------------------------------------------- Inhalte außerhalb von Frames ----
toolfilter = {}


def parse_products_list(el, path):
    filters = {}
    for sel in el.select("select"):
        name = sel.get("name", "")
        key = re.search(r"\[filters\]\[(\w+)\]", name)
        key = key.group(1) if key else name
        opts = [{"value": o.get("value"), "label": text(o), "selected": o.has_attr("selected")}
                for o in sel.find_all("option") if o.get("value")]
        filters[key] = opts
    rows = []
    cur = {"title": "", "items": []}
    container = el.select_one(".zoller_products__products-rows") or el
    for c in container.find_all(True, recursive=False):
        if c.name and c.name.startswith("h"):
            if cur["items"] or cur["title"]:
                rows.append(cur)
            cur = {"title": text(c), "items": []}
        elif "zoller_products__list" in (c.get("class") or []):
            for it in c.select(".zoller_products__item"):
                a = it.find("a")
                h = it.find("h3")
                title = text(h)
                cur["items"].append({
                    "href": norm_href(a.get("href")) if a else "",
                    "title": title,
                    "text": text(it.find("p")),
                    "img": img_info(it.find("img")),
                    "full": "zoller_products__item--full-width" in (it.get("class") or []),
                    "kind": it.get("data-type", ""),
                })
    if cur["items"] or cur["title"]:
        rows.append(cur)
    b = {"type": "productlist", "filters": filters, "rows": rows}
    if path == "/produkte" and toolfilter:
        tf = {}
        for v, r in toolfilter.items():
            tf[v] = {"label": r["label"], "items": [{
                "href": norm_href(i["href"]), "title": i["title"], "text": i["text"],
                "img": {"src": img_src(i["img"]), "alt": ""} if i["img"] else None} for i in r["items"]]}
        b["tools"] = tf
    return b


def parse_events(el):
    months = []
    for item in el.select(".news-accordion__item"):
        label = text(item.find(class_="news-accordion__title"))
        evs = []
        for art in item.select(".article--event"):
            info = [text(s) for s in art.select(".article__info > span")]
            txt = art.find(class_="article__text")
            btns = []
            if txt is not None:
                for a in txt.select("a.block-button"):
                    btns.append({"label": text(a), "href": norm_href(a.get("href")),
                                 "share": "mailto:" in (a.get("href") or "")})
                    a.decompose()
            evs.append({
                "month": text(art.find(class_="article__date-month")),
                "day": text(art.find(class_="article__date-day--numerical")),
                "weekday": text(art.find(class_="article__date-day")),
                "img": img_info(art.find(class_="article__image").find("img")) if art.find(class_="article__image") else None,
                "date": info[0] if info else "",
                "place": info[1] if len(info) > 1 else "",
                "title": text(art.find(class_="article__header")),
                "text": clean(txt),
                "buttons": btns,
            })
        months.append({"label": label, "events": evs})
    return {"type": "events", "months": months}


def parse_languages(el):
    regions = []
    for reg in el.select(".dropdown-region"):
        p = reg.find("p")
        links = []
        for a in reg.select("a.dropdown-item-text"):
            href = a.get("href", "")
            if href.startswith("/"):
                href = ORIGIN + href
            links.append({"label": text(a), "href": href,
                          "active": "active-language" in (a.parent.get("class") or [])})
        regions.append({"region": text(p), "links": links})
    return regions


def parse_main(main, path):
    blocks = []
    langs = []
    for c in main.find_all(True, recursive=False):
        cls = c.get("class") or []
        if is_frame(c):
            blocks.extend(parse_frame(c))
        elif "zoller_products" in cls:
            blocks.append(parse_products_list(c, path))
        elif "news" in cls and c.select(".article--event"):
            blocks.append(parse_events(c))
        elif "language-dropdown-wrapper" in cls:
            langs = parse_languages(c)
        elif c.find(is_frame):
            blocks.extend(parse_frames(c))
        elif (text(c) or c.find("img")) and clean(c):
            blocks.append({"type": "raw", "html": clean(c), "ftype": "nonframe:" + " ".join(cls)})
    return blocks, langs


# ------------------------------------------------------------ Timeline ----
def parse_timeline_full(raw_html):
    soup = BeautifulSoup(raw_html, "lxml")
    heads = {}
    for b in soup.select("button.go-to-milestone"):
        heads[b.get("data-milestone")] = {"year": text(b.find("strong")), "label": text(b).replace(text(b.find("strong")), "", 1).strip()}
    items = []
    for m in soup.select("[data-milestone-id], .milestone, .zoller-timeline__milestone, .timeline-content"):
        mid = m.get("data-milestone-id") or m.get("id", "").replace("milestone-", "")
        items.append({"id": mid, "html": clean(m), "img": img_info(m.find("img"))})
    return heads, items


# ----------------------------------------------------------------- Page ----
def page_path_from_file(fn):
    base = os.path.basename(fn)[:-5]
    return "/" + base.replace("__", "/").replace("@@", "?").replace("~~", "&")


def extract_page(fn):
    raw = open(fn, encoding="utf-8", errors="ignore").read()
    soup = BeautifulSoup(raw, "lxml")
    main = soup.find("main")
    if main is None:
        return None
    path = page_path_from_file(fn)
    canon = soup.find("link", rel="canonical")
    og_url = soup.find("meta", property="og:url")
    title = soup.title.get_text(strip=True) if soup.title else ""
    desc = soup.find("meta", attrs={"name": "description"})
    og_img = soup.find("meta", property="og:image")
    crumbs = []
    for li in soup.select(".breadcrumb li, nav.breadcrumbs li, .breadcrumb-container li"):
        a = li.find("a")
        crumbs.append({"label": text(li), "href": norm_href(a.get("href")) if a else ""})
    blocks, langs = parse_main(main, path)
    for b in blocks:
        if b.get("type") == "timeline_raw":
            heads, items = parse_timeline_full(b["html"])
            b.clear()
            b.update({"type": "timeline", "heads": heads, "items": items})
    url = ""
    if og_url is not None:
        url = og_url.get("content", "")
    elif canon is not None:
        url = canon.get("href", "")
    return {
        "path": path,
        "url": url.replace(ORIGIN, ""),
        "title": re.sub(r"\s*\|\s*ZOLLER\s*$", "", title),
        "description": htmllib.unescape(desc.get("content", "")).replace("\xa0", " ") if desc else "",
        "og_image": img_src(og_img.get("content", "")) if og_img else "",
        "breadcrumb": crumbs,
        "languages": langs,
        "blocks": blocks,
    }


def slug_for(path):
    p = path.strip("/")
    if not p:
        return "startseite"
    return p.replace("/", "__").replace("?", "@@").replace("&", "~~")


def main():
    global redirects, toolfilter
    raw_dir = sys.argv[1]
    if len(sys.argv) > 2 and os.path.exists(sys.argv[2]):
        redirects = json.load(open(sys.argv[2]))
    if len(sys.argv) > 3 and os.path.exists(sys.argv[3]):
        toolfilter = json.load(open(sys.argv[3]))
    os.makedirs(OUT, exist_ok=True)
    pages = {}
    for fn in sorted(glob.glob(os.path.join(raw_dir, "*.html"))):
        p = extract_page(fn)
        if p is None:
            print("  - no <main>:", fn, file=sys.stderr)
            continue
        # Weiterleitungen: Query-URLs auf die finale Seite abbilden
        if "?" in p["path"]:
            q = p["path"]
            if q in redirects and redirects[q]["final"] != q:
                p["path"] = redirects[q]["final"].split("?")[0]
            else:
                continue
        if p["path"] in pages:
            continue
        pages[p["path"]] = p
    for path, p in pages.items():
        with open(os.path.join(OUT, slug_for(path) + ".json"), "w", encoding="utf-8") as f:
            json.dump(p, f, ensure_ascii=False, indent=1)
    with open(os.path.join(ROOT, "content", "images.json"), "w") as f:
        json.dump(sorted(images), f, indent=0)
    print("pages:", len(pages), "images:", len(images))


if __name__ == "__main__":
    main()
