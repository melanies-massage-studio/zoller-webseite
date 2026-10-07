"""
Erzeugt die statische Webseite (docs/) aus content/pages/*.json.

Aufruf:  python3 tools/build.py
Nur Python-Standardbibliothek nötig.
"""
import glob
import html
import json
import os
import re
import shutil
import urllib.parse
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs")
ORIGIN = "https://www.zoller.info"
HOME = "/startseite"
SHOWROOM_URL = "https://melanies-massage-studio.github.io/zoller-produktumgebung-3d/"
CUBE_ICON = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">'
             '<path d="M12 2.8 20 7.4v9.2l-8 4.6-8-4.6V7.4z"/><path d="M4 7.4l8 4.6 8-4.6M12 12v9.2"/></svg>')

PAGES = {}
NAV = {}
SHOW = {}        # Produktpfad -> Produkt aus der 3D-Produktumgebung (assets/showroom/products.json)
SHOW_CATS = {}   # Kategorie-ID -> Kategorie
STAGE_KINDS = ("machine", "pedestal", "software")
ZSYMBOL_SVG = ('<svg class="product-hero__symbol" viewBox="-62 -62 124 124" aria-hidden="true"><circle r="27"/>'
               '<path d="M19 -19 L42 -42 M19 19 L42 42 M-19 19 L-42 42 M-19 -19 L-42 -42"/></svg>')
LOCATIONS = []
def _asset_version():
    import hashlib
    h = hashlib.md5()
    for rel in ("assets/css/main.css", "assets/js/main.js", "assets/js/stage3d.js", "assets/js/productstage.js",
                "assets/js/worldflight.js", "assets/js/world.js"):
        if not os.path.exists(os.path.join(ROOT, rel)):
            continue
        with open(os.path.join(ROOT, rel), "rb") as fh:
            h.update(fh.read())
    return h.hexdigest()[:10]


ASSET_VER = _asset_version()

esc = html.escape


# =============================================================== URLs ====
class Ctx:
    def __init__(self, page):
        self.page = page
        self.path = page["path"]
        depth = 0 if self.path in (HOME, "/404") else len(self.path.strip("/").split("/"))
        self.prefix = "../" * depth if depth else ""
        self.root = self.prefix or "./"
        self.uid = 0

    def next_id(self, base="el"):
        self.uid += 1
        return f"{base}-{self.uid}"

    def url(self, href):
        if not href:
            return ""
        href = html.unescape(href)
        if href.startswith(("mailto:", "tel:", "#", "javascript:", "data:")):
            return href
        if href.startswith("//"):
            return "https:" + href
        if href.startswith("http://www.zoller.info") or href.startswith(ORIGIN):
            href = re.sub(r"^https?://www\.zoller\.info", "", href) or "/"
        if href.startswith("http"):
            return href
        if not href.startswith("/"):
            return href
        if href.startswith("/fileadmin/_processed_/") or re.search(r"\.(webp|jpe?g|png|gif|svg)$", href.split("?")[0], re.I):
            if href.startswith("/fileadmin/") and os.path.exists(os.path.join(OUT, urllib.parse.unquote(href.lstrip("/").split("?")[0]))):
                return self.prefix + href.lstrip("/")
            return ORIGIN + href
        if href.startswith(("/fileadmin/", "/typo3", "/_assets")):
            return ORIGIN + href
        path, _, frag = href.partition("#")
        path, _, query = path.partition("?")
        path = path.rstrip("/") or HOME
        if path in PAGES:
            target = "" if path == HOME else path.strip("/") + "/"
            out = (self.prefix + target) or "./"
            return out + ("#" + frag if frag else "")
        return ORIGIN + href

    def img(self, src):
        return self.url(src) if src else ""

    def rewrite(self, s):
        """Links und Bildpfade in HTML-Fragmenten umschreiben."""
        if not s:
            return ""

        def rep(m):
            attr, val = m.group(1), m.group(2)
            return f'{attr}="{esc(self.url(html.unescape(val)), quote=True)}"'

        s = re.sub(r'\b(href|src)="([^"]*)"', rep, s)
        s = s.replace("<figcaption>", "").replace("</figcaption>", "")
        return s


# ============================================================ Helpers ====
def strip_tags(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def first_heading(s):
    m = re.search(r"<h([1-6])[^>]*>(.*?)</h\1>", s or "", re.S)
    return strip_tags(m.group(2)) if m else ""


def img_tag(ctx, im, cls="", sizes="", eager=False, alt=None, extra=""):
    if not im or not im.get("src"):
        return ""
    a = esc(alt if alt is not None else im.get("alt", ""), quote=True)
    wh = ""
    if im.get("w") and im.get("h"):
        wh = f' width="{im["w"]}" height="{im["h"]}"'
    load = 'fetchpriority="high"' if eager else 'loading="lazy" decoding="async"'
    c = f' class="{cls}"' if cls else ""
    return f'<img src="{esc(ctx.img(im["src"]), quote=True)}" alt="{a}"{wh}{c} {load}{extra}>'


def bg_class(bg):
    return {"lightgray": "bg-lightgray", "yellow": "bg-yellow", "black": "bg-black", "white": "bg-white",
            "gray": "bg-lightgray", "darkgray": "bg-black"}.get(bg or "", "bg-white")


def add_heading_class(h, cls):
    return re.sub(r"<(h[1-6])(\s[^>]*)?>", lambda m: f'<{m.group(1)} class="{cls}">' if not m.group(2) else m.group(0), h, count=1)


def section(ctx, b, inner, extra_cls="", tight=False, flush=False, wrap=True, attrs=""):
    if ctx.inline:
        return f'<div class="block block--{b.get("type")}">{inner}</div>'
    cls = ["section", bg_class(b.get("bg"))]
    sp = b.get("space") or {}
    if flush:
        cls.append("section--flush")
    elif tight or sp.get("before") in ("small", "extra-small") and sp.get("after") in ("small", "extra-small", None):
        cls.append("section--tight")
    if sp.get("before") == "none" and not flush:
        cls.append("pt-0")
    if sp.get("after") == "none" and not flush:
        cls.append("pb-0")
    if b.get("_continued"):
        cls.append("is-continued")
    if extra_cls:
        cls.append(extra_cls)
    bid = f' id="{esc(b["id"])}"' if b.get("id") else ""
    body = f'<div class="wrap">{inner}</div>' if wrap else inner
    return f'<section class="{" ".join(cls)}"{bid}{attrs}>{body}</section>'


def rte(ctx, s, cls="rte"):
    if not s:
        return ""
    s = ctx.rewrite(s)
    # Große Statement-Absätze bekommen den Wort-für-Wort-Effekt
    s = s.replace('<p class="extra-large-text">', '<p class="extra-large-text" data-words>')
    return f'<div class="{cls}">{s}</div>'


ICON_ARROW_L = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>'
ICON_ARROW_R = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>'
SYMBOL_SVG = '<svg viewBox="0 0 334.883 334.883" aria-hidden="true"><path d="M1017.967,708.735,954.14,772.562a130,130,0,0,0-156.924,0L733.39,708.735l-25.153,25.153,63.827,63.827a130,130,0,0,0,0,156.924l-63.827,63.826,25.153,25.153,63.827-63.826a130,130,0,0,0,156.924,0l63.826,63.826,25.153-25.153-63.826-63.826a130,130,0,0,0,0-156.924l63.826-63.827-25.153-25.153Zm-89.292,89.292h0a94.954,94.954,0,0,1,25.153,25.153h0a94.464,94.464,0,0,1,0,105.993h0a94.953,94.953,0,0,1-25.153,25.153h0a94.465,94.465,0,0,1-105.992,0h0a94.938,94.938,0,0,1-25.153-25.153,94.467,94.467,0,0,1,0-105.993h0a94.935,94.935,0,0,1,25.153-25.153h0a94.467,94.467,0,0,1,105.992,0Z" transform="translate(-708.237 -708.735)"/></svg>'


# ============================================================= Blocks ====
def r_textmedia(ctx, b):
    header = b.get("header", "")
    if "headline-decor" not in header and b.get("bg") != "yellow":
        pass
    body = b.get("body", "")
    imgs = b.get("images") or []
    vids = b.get("videos") or []
    pos = b.get("pos", "text")
    has_media = bool(imgs or vids)
    text_html = ""
    if header:
        text_html += f'<div class="section-head-inline" data-reveal>{ctx.rewrite(header)}</div>'
    if body:
        text_html += f'<div data-reveal>{rte(ctx, body)}</div>'
    if not has_media:
        cls = "textmedia textmedia--text"
        if (b.get("bg") == "yellow" or "extra-large-text" in body) and not ctx.inline:
            cls += " textmedia--statement"
        return section(ctx, b, f'<div class="{cls}"><div class="textmedia__text">{text_html}</div></div>')
    # Medien
    captioned = [i for i in imgs if i.get("caption") or i.get("href")]
    media_parts = []
    for v in vids:
        media_parts.append(video_html(ctx, v))
    if pos in ("above", "below") and len(imgs) > 1 and captioned:
        # Bildkarten
        cards = []
        for i, im in enumerate(imgs):
            cap = ctx.rewrite(im.get("caption", ""))
            href = ctx.url(im.get("href", ""))
            link = f'<a class="card__link" href="{esc(href, quote=True)}" aria-label="{esc(im.get("title") or strip_tags(cap)[:60], quote=True)}"></a>' if href else ""
            more = '<span class="card__more">Mehr erfahren</span>' if href and "Mehr erfahren" not in cap else ""
            cap = cap.replace("Mehr erfahren", '<span class="card__more">Mehr erfahren</span>') if href else cap
            cards.append(f'<article class="card" data-reveal style="--d:{i * 0.08}s"><div class="card__media">{img_tag(ctx, im)}</div><div class="card__body rte">{cap}{more}</div>{link}</article>')
        grid = f'<div class="card-grid">{"".join(cards)}</div>'
        head = f'<div class="section-head">{text_html}</div>' if text_html else ""
        inner = head + grid if pos == "below" else grid + (f'<div class="section-head" style="margin-top:3rem">{text_html}</div>' if text_html else "")
        return section(ctx, b, inner)
    for im in imgs:
        tag = img_tag(ctx, im)
        if im.get("href"):
            tag = f'<a href="{esc(ctx.url(im["href"]), quote=True)}">{tag}</a>'
        contain = " media-frame--contain" if re.search(r"(logo|icon|picto|diagram|grafik|chart|_freigestellt|png$)", im["src"], re.I) else ""
        cap = f'<figcaption>{strip_tags(im["caption"])}</figcaption>' if im.get("caption") else ""
        media_parts.append(f'<figure><div class="media-frame{contain}" data-parallax-img>{tag}</div>{cap}</figure>')
    cols = min(int(b.get("cols") or 1), 4)
    media = f'<div class="textmedia__media reveal-mask" data-cols="{cols if len(media_parts) > 1 else 1}">{"".join(media_parts)}</div>'
    if pos in ("right", "left"):
        cls = f"textmedia textmedia--{pos}"
        if b.get("valign") != "center":
            cls += " textmedia--valign-top"
        inner = f'<div class="{cls}"><div class="textmedia__text">{text_html}</div>{media}</div>'
    else:
        cls = f"textmedia textmedia--{pos}"
        inner = f'<div class="{cls}"><div class="textmedia__text">{text_html}</div>{media}</div>'
    return section(ctx, b, inner)


def youtube_id(src):
    m = re.search(r"(?:youtube(?:-nocookie)?\.com/(?:embed/|watch\?v=)|youtu\.be/)([\w-]{6,})", src or "")
    return m.group(1) if m else ""


def video_html(ctx, v):
    src = v.get("src", "")
    yid = youtube_id(src)
    if yid:
        thumb = f"https://i.ytimg.com/vi/{yid}/hqdefault.jpg"
        return (f'<div class="video-embed" data-yt="{esc(yid)}"><div class="video-consent">'
                f'<div><button class="play-btn" type="button" aria-label="Video abspielen"></button>'
                f'<p>Mit Klick wird das Video von YouTube geladen. Dabei gelten die Datenschutzbestimmungen von YouTube.</p></div></div></div>')
    if src.startswith("/") or src.startswith("http"):
        url = src if src.startswith("http") else ORIGIN + src
        return f'<div class="video-embed"><video src="{esc(url, quote=True)}" controls playsinline preload="metadata"></video></div>'
    if src:
        return f'<div class="video-embed"><iframe src="{esc(src, quote=True)}" title="Video" allowfullscreen loading="lazy"></iframe></div>'
    return ""


def r_hero(ctx, b):
    slides = [s for s in b.get("slides", []) if s.get("img") or s.get("video") or s.get("title") or s.get("title_html")]
    if not slides:
        return ""
    s0 = slides[0]
    light = s0.get("light")
    media = []
    for i, s in enumerate(slides):
        if s.get("video"):
            vsrc = ctx.url(s["video"]) if not s["video"].startswith("/fileadmin/01_Pages/Startingpage") else ctx.prefix + "assets/video/header_animation.mp4"
            m = f'<video src="{esc(vsrc, quote=True)}" autoplay muted loop playsinline preload="auto"></video>'
        else:
            m = f'<img src="{esc(ctx.img(s["img"]), quote=True)}" alt="" {"fetchpriority=high" if i == 0 else "loading=lazy"}>'
        media.append(f'<div class="hero__slide{" is-active" if i == 0 else ""}">{m}</div>')
    title_html = s0.get("title_html") or ""
    if title_html:
        title = add_heading_class(ctx.rewrite(title_html), "hero__title hero__title--sm")
        if "<h" not in title:
            title = f'<h1 class="hero__title hero__title--sm">{title}</h1>'
    else:
        t = s0.get("title", "")
        long = len(t) > 38
        title = f'<h1 class="hero__title{" hero__title--sm" if long else ""}" data-hero-title>{esc(t)}</h1>' if t else ""
    kicker = f'<p class="hero__kicker">{esc(s0["kicker"])}</p>' if s0.get("kicker") else ""
    texts = []
    for i, s in enumerate(slides):
        if i == 0:
            continue
        # Weitere Slides: Inhalte nicht verlieren
        if s.get("title") or s.get("text"):
            texts.append(f'<div class="hero__extra"><strong>{esc(s.get("title", ""))}</strong>{ctx.rewrite(s.get("text", ""))}</div>')
    body = ctx.rewrite(s0.get("text", ""))
    btns = "".join(ctx.rewrite(x) for x in s0.get("buttons", []))
    dots = ""
    if len(slides) > 1:
        dots = '<div class="hero__dots">' + "".join(f'<button type="button" aria-label="Bild {i + 1}"{" class=is-active" if i == 0 else ""}></button>' for i in range(len(slides))) + "</div>"
    cls = "hero" + (" hero--light" if light else "") + ("" if (s0.get("title") or title_html) and len(slides) else "")
    if ctx.first_block and not ctx.inline:
        ctx.main_cls = "has-hero"
    inner = (f'<div class="hero__slides" data-hero-parallax>{"".join(media)}</div>'
             f'<div class="hero__content"><div class="wrap" data-hero-copy>{kicker}{title}'
             f'<div class="hero__text">{body}{"".join(texts)}</div>{("<div class=hero__btns>" + btns + "</div>") if btns else ""}{dots}</div></div>')
    if not ctx.first_block:
        cls += " hero--short"
    return f'<section class="{cls}" id="{esc(b.get("id", ""))}" data-hero>{inner}{"<span class=scroll-cue aria-hidden=true></span>" if ctx.first_block else ""}</section>'


def show_product(path):
    p = SHOW.get((path or "").rstrip("/"))
    return p if p and p.get("kind") in STAGE_KINDS else None


def r_product_header(ctx, b):
    if ctx.first_block or ctx.after_subnav:
        ctx.main_cls = "has-hero"
    p = show_product(ctx.path)
    if p:
        return product_stage(ctx, b, p)
    img = img_tag(ctx, b.get("img"), eager=True, alt=b.get("title", ""))
    return (f'<section class="product-hero" id="{esc(b.get("id", ""))}"><div class="wrap"><div class="product-hero__grid">'
            f'<div class="product-hero__copy" data-hero-copy><h1 class="product-hero__name">{esc(b.get("title", ""))}</h1>'
            f'<div class="product-hero__claim">{rte(ctx, b.get("text", ""))}</div></div>'
            f'<div class="product-hero__img" data-product-img>{img}</div></div></div></section>')


def product_stage(ctx, b, p):
    """Produkt-Hero mit 3D-Bühne (assets/js/productstage.js); ohne WebGL bleibt das Foto mit SVG-Symbol."""
    ctx.has_stage = True
    cut = f'{ctx.prefix}assets/showroom/img/hd/{p["id"]}.webp'
    cat = SHOW_CATS.get(p["cat"], {})
    crumbs = [cat.get("name", ""), p.get("sub", "")] + ([p["badge"]] if p.get("badge") else [])
    eyebrow = " · ".join(esc(c) for c in crumbs if c)
    title = b.get("title") or p["name"]
    showroom = (f'<a class="btn btn--ghost btn--3d" href="{SHOWROOM_URL}#produkt/{p["id"]}">'
                f'{CUBE_ICON}<span>Im 3D-Showroom ansehen</span></a>')
    return (f'<section class="product-hero product-hero--stage" id="{esc(b.get("id", "") or "produkt")}" data-product-stage '
            f'data-cutout="{esc(cut, quote=True)}" data-aspect="{p.get("aspect", 1.2)}" data-kind="{esc(p["kind"])}">'
            f'<div class="wrap"><div class="product-hero__grid">'
            f'<div class="product-hero__copy" data-hero-copy><span class="product-hero__eyebrow">{eyebrow}</span>'
            f'<h1 class="product-hero__name">{esc(title)}</h1>'
            f'<div class="product-hero__claim">{rte(ctx, b.get("text", ""))}</div>'
            f'<div class="product-hero__actions">{showroom}</div></div>'
            f'<div class="product-hero__img" data-product-img>{ZSYMBOL_SVG}'
            f'<img class="product-hero__cutout" src="{esc(cut, quote=True)}" alt="{esc(title, quote=True)}" fetchpriority="high" decoding="async">'
            f'<canvas class="product-hero__canvas" aria-hidden="true"></canvas></div>'
            f'</div></div><span class="scroll-cue" aria-hidden="true"></span></section>')


def showroom_strip(ctx, cat):
    n = cat.get("count", 0)
    return (f'<section class="section section--tight"><div class="wrap"><div class="cta-strip cta-strip--3d" data-reveal="scale">'
            f'<div class="cta-strip__text"><span class="cta-strip__icon">{CUBE_ICON}</span><div class="rte">'
            f'<p class="bold"><strong>Themenwelt »{esc(cat["name"])}« in 3D erleben</strong></p>'
            f'<p>{n} {"Produkt" if n == 1 else "Produkte"} auf einer Bühne im 3D-Showroom – drehen, zoomen und zu Fuß durch die Halle gehen.</p></div></div>'
            f'<a class="btn" href="{SHOWROOM_URL}#themenwelt/{cat["id"]}">3D-Showroom öffnen</a></div></div></section>')


def r_subnav(ctx, b):
    items = b.get("items", [])
    lis = []
    for it in items:
        href = ctx.url(it["href"]) if it.get("href") else ""
        cur = it.get("current") or (it.get("href") and it["href"].rstrip("/") == ctx.path)
        label = esc(it["label"])
        if href:
            lis.append(f'<li><a href="{esc(href, quote=True)}"{" aria-current=page" if cur else ""}>{label}</a></li>')
        else:
            lis.append(f'<li><a aria-current="page">{label}</a></li>')
    title = esc(b.get("title", ""))
    title_href = ""
    for it in items:
        if it.get("title") and it.get("href"):
            title_href = ctx.url(it["href"])
    t = f'<a class="subnav__title" href="{esc(title_href, quote=True)}">{title}</a>' if title_href else f'<span class="subnav__title">{title}</span>'
    ctx.after_subnav = True
    ctx.has_subnav = True
    return (f'<nav class="subnav" aria-label="{title}"><div class="wrap subnav__inner">{t}'
            f'<ul class="subnav__list">{"".join(lis)}</ul>'
            f'<a class="btn" href="{esc(ctx.url("/unternehmen/kontakt"), quote=True)}">Jetzt anfragen</a></div></nav>')


def r_cols(ctx, b):
    layout = b.get("layout", "2cols")
    cls = {"2cols": "cols--2", "50-50": "cols--2", "66-33": "cols--66-33", "33-66": "cols--33-66",
           "33-33-33": "cols--3", "25-25-25-25": "cols--4"}.get(layout, "cols--2")
    prev_inline = ctx.inline
    ctx.inline = True
    cols = []
    for col in b.get("columns", []):
        cols.append('<div class="col">' + "".join(render_block(ctx, x) for x in col) + "</div>")
    ctx.inline = prev_inline
    return section(ctx, b, f'<div class="cols {cls}" data-reveal>{"".join(cols)}</div>')


def r_kpis(ctx, b):
    items = []
    for it in b.get("items", []):
        items.append(f'<div class="kpi" data-reveal><div class="kpi__label">{esc(it.get("label", ""))}</div>'
                     f'<div class="kpi__value" data-count>{esc(it.get("value", ""))}</div>'
                     f'<div class="kpi__text">{rte(ctx, it.get("text", ""))}</div></div>')
    head = (f'<div class="kpi-scroller__intro"><span class="eyebrow">ZOLLER weltweit</span><h2>{esc(b.get("title", ""))}</h2>'
            f'<p class="subheader">{esc(b.get("subtitle", ""))}</p></div>')
    return section(ctx, b, f'<div class="kpi-scroller">{head}<div class="kpi-scroller__list">{"".join(items)}</div></div>')


def r_cta_strip(ctx, b):
    icon = img_tag(ctx, b.get("icon"), alt="")
    return section(ctx, b, f'<div class="cta-strip" data-reveal="scale"><div class="cta-strip__text">{icon}<div class="rte">{ctx.rewrite(b.get("text", ""))}</div></div>{ctx.rewrite(b.get("button", ""))}</div>', tight=True)


def r_highlight(ctx, b):
    items = "".join(f'<p data-reveal style="--d:{i * 0.1}s">{ctx.rewrite(x)}</p>' for i, x in enumerate(b.get("items", [])))
    head = f'<div class="section-head">{ctx.rewrite(b["header"])}</div>' if b.get("header") else ""
    return section(ctx, b, f'{head}<div class="highlight"><div class="highlight__symbol" data-spin>{SYMBOL_SVG}</div><div class="highlight__list">{items}</div></div>')


def slider_shell(ctx, head_html, slides_html, extra_cls=""):
    sid = ctx.next_id("slider")
    controls = (f'<div class="slider__controls"><button type="button" data-prev="{sid}" aria-label="Zurück">{ICON_ARROW_L}</button>'
                f'<button type="button" data-next="{sid}" aria-label="Weiter">{ICON_ARROW_R}</button></div>')
    head = f'<div class="wrap"><div class="slider__head"><div>{head_html}</div>{controls}</div></div>'
    return f'<div class="slider {extra_cls}">{head}<div class="slider__track" id="{sid}" tabindex="0">{slides_html}</div></div>'


def r_slider(ctx, b):
    slides = []
    for s in b.get("slides", []):
        img = s.get("img")
        im = f'<div class="media-frame">{img_tag(ctx, img)}</div>' if img and img.get("src") else ""
        head = rte(ctx, s.get("head", ""))
        slides.append(f'<div class="slider__slide">{im}{head}{rte(ctx, s.get("text", ""))}</div>')
    inner = slider_shell(ctx, ctx.rewrite(b.get("header", "")), "".join(slides))
    if ctx.inline:
        return inner
    return section(ctx, b, inner, wrap=False)


def r_quotes(ctx, b):
    slides = []
    for i, s in enumerate(b.get("slides", [])):
        img = img_tag(ctx, s.get("img"))
        rev = " quote-slide--right" if s.get("right") else ""
        slides.append(f'<div class="slider__slide quote-slide{rev}"><div class="quote-slide__img">{img}</div>'
                      f'<div class="quote-slide__text">{rte(ctx, s.get("text", ""))}</div></div>')
    sid = ctx.next_id("slider")
    controls = (f'<div class="slider__controls"><button type="button" data-prev="{sid}" aria-label="Zurück">{ICON_ARROW_L}</button>'
                f'<button type="button" data-next="{sid}" aria-label="Weiter">{ICON_ARROW_R}</button></div>')
    head = ctx.rewrite(b.get("header", ""))
    inner = (f'<div class="wrap"><div class="slider__head"><div>{head}</div>{controls if len(slides) > 1 else ""}</div></div>'
             f'<div class="slider__track slider__track--full" id="{sid}" tabindex="0">{"".join(slides)}</div>')
    b = dict(b)
    if not b.get("bg"):
        b["bg"] = "black"
    return section(ctx, b, f'<div class="slider quotes">{inner}</div>', wrap=False)


def r_overlay(ctx, b):
    img = img_tag(ctx, b.get("img"))
    title = f'<h3>{esc(b["title"])}</h3>' if b.get("title") else ""
    return section(ctx, b, f'<div class="overlay-teaser"><div class="media-frame reveal-mask" data-parallax-img>{img}</div>'
                           f'<div data-reveal>{title}{rte(ctx, b.get("text", ""))}</div></div>')


def r_tiles(ctx, b):
    tiles = []
    modals = []
    for t in b.get("tiles", []):
        mid = ctx.next_id("modal")
        logo = img_tag(ctx, t.get("logo"), alt=t.get("label", ""))
        label = f'<span class="tile-btn__label">{esc(t.get("label", ""))}</span>' if t.get("label") and not logo else ""
        name = first_heading(t.get("text", "")) or t.get("label") or (t.get("logo") or {}).get("alt", "") or "Details"
        tiles.append(f'<button type="button" class="tile-btn" data-modal="{mid}" aria-label="{esc(name, quote=True)}">{logo}{label}</button>')
        mimg = f'<div class="modal__img">{img_tag(ctx, t.get("img"))}</div>' if t.get("img") else ""
        grid = "modal__grid" if mimg else ""
        modals.append(f'<dialog class="modal" id="{mid}"><button class="modal__close" type="button" data-close aria-label="Schließen">×</button>'
                      f'<div class="{grid}">{mimg}<div class="modal__body">{rte(ctx, t.get("text", ""))}</div></div></dialog>')
    head = f'<div class="section-head">{ctx.rewrite(b["header"])}</div>' if b.get("header") else ""
    return section(ctx, b, f'{head}<div class="tiles" style="--cols:{b.get("cols", 4)}" data-reveal>{"".join(tiles)}</div>{"".join(modals)}')


def r_accordion(ctx, b):
    items = []
    prev_inline = ctx.inline
    ctx.inline = True
    for it in b.get("items", []):
        inner = "".join(render_block(ctx, x) for x in it.get("blocks", []))
        items.append(f'<details><summary>{esc(it.get("title", ""))}<span class="acc-icon" aria-hidden="true"></span></summary>'
                     f'<div class="accordion__body">{inner}</div></details>')
    ctx.inline = prev_inline
    head = f'<div class="section-head">{ctx.rewrite(b["header"])}</div>' if b.get("header") else ""
    return section(ctx, b, f'{head}<div class="accordion" data-reveal>{"".join(items)}</div>')


def r_downloads(ctx, b):
    cards = []
    for f in b.get("files", []):
        href = ctx.url(f.get("href", ""))
        thumb = f'<div class="download__thumb">{img_tag(ctx, f.get("thumb"), alt="")}</div>' if f.get("thumb") else ""
        ext = (re.search(r"\.(\w+)$", f.get("href", "").split("?")[0]) or [None, ""])[1].upper()
        kind = "Flipbook" if "blaetterkatalog" in f.get("href", "") else (ext or "Datei")
        size = f' · {esc(f["size"])}' if f.get("size") and kind != "Flipbook" else ""
        desc = f'<span class="small-text">{esc(f["desc"])}</span>' if f.get("desc") else ""
        cards.append(f'<a class="download" href="{esc(href, quote=True)}" target="_blank" rel="noopener">{thumb}'
                     f'<span class="download__name">{esc(f.get("name", ""))}</span>{desc}<span class="download__meta">{kind}{size}</span></a>')
    head = f'<div class="section-head">{ctx.rewrite(b["header"])}</div>' if b.get("header") else ""
    return section(ctx, b, f'{head}<div class="downloads" data-reveal>{"".join(cards)}</div>')


def r_table(ctx, b):
    t = ctx.rewrite(b.get("table", ""))
    # Gruppenzeilen (zweite Zelle leer) hervorheben
    def grp(m):
        row = m.group(0)
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        if len(cells) >= 2 and strip_tags(cells[0]) and not any(strip_tags(c) for c in cells[1:]):
            return row.replace("<tr>", '<tr class="is-group">', 1)
        return row
    t = re.sub(r"<tr>.*?</tr>", grp, t, flags=re.S)
    t = t.replace("<table>", '<table class="spec-table">', 1)
    head = f'<div class="section-head">{ctx.rewrite(b["header"])}</div>' if b.get("header") else ""
    return section(ctx, b, f'{head}<div class="table-wrap" data-reveal>{t}</div>', tight=True)


def r_bento(ctx, b):
    tiles = []
    for t in b.get("tiles", []):
        full = " bento__tile--full" if t.get("full") else ""
        tiles.append(f'<div class="bento__tile{full}" data-reveal="scale">{img_tag(ctx, t.get("img"), alt="")}'
                     f'<div class="bento__text rte">{ctx.rewrite(t.get("text", ""))}</div></div>')
    head = f'<div class="section-head">{ctx.rewrite(b["header"])}</div>' if b.get("header") else ""
    intro = rte(ctx, b.get("intro", "")) if b.get("intro") else ""
    return section(ctx, b, f'{head}{intro}<div class="bento">{"".join(tiles)}</div>', tight=True)


def product_card(ctx, it, i=0):
    href = ctx.url(it.get("href", ""))
    sp = show_product(it.get("href", ""))
    if sp:
        img = (f'<img src="{ctx.prefix}assets/showroom/img/hd/{sp["id"]}.webp" alt="" loading="lazy" decoding="async" '
               f'data-product="{sp["id"]}">')
    else:
        img = img_tag(ctx, it.get("img"), alt="")
    title = esc(it.get("title", ""))
    text = it.get("text", "")
    text_html = rte(ctx, text) if text.startswith("<") else (f"<p>{esc(text)}</p>" if text else "")
    go = '<span class="product-card__go" aria-hidden="true"></span>' if href else ""
    inner = f'<div class="product-card__text"><h3>{title}</h3>{text_html}</div><div class="product-card__img">{img}</div>{go}'
    if href:
        tgt = ' target="_blank" rel="noopener"' if href.startswith("http") and "zoller.info" not in href else ""
        return f'<a class="product-card" href="{esc(href, quote=True)}"{tgt} data-reveal style="--d:{(i % 4) * 0.07}s">{inner}</a>'
    return f'<div class="product-card" data-reveal style="--d:{(i % 4) * 0.07}s">{inner}</div>'


def r_products(ctx, b):
    cards = "".join(product_card(ctx, it, i) for i, it in enumerate(b.get("items", [])))
    head = f'<div class="section-head">{ctx.rewrite(b["header"])}</div>' if b.get("header") else ""
    return section(ctx, b, f'{head}<div class="product-rail is-grid">{cards}</div>')


def r_productlist(ctx, b):
    f = b.get("filters", {})
    sol = f.get("solutions", [])
    apps = f.get("applications", [])
    tools = f.get("tool", [])
    parts = []
    # Solution-Auswahl -> Navigation zu den Produktbereichen
    sol_map = {"Einstellen & Messen": "/produkte/einstellen-messen", "Toolmanagement": "/produkte/toolmanagement",
               "Prüfen & Messen": "/produkte/pruefen-messen", "Automation": "/produkte/automation",
               "Schrumpftechnik": "/produkte/schrumpftechnik", "Werkzeugaufnahmen": "/produkte/werkzeugaufnahmen",
               "Wuchttechnik": "/produkte/wuchttechnik"}
    if sol:
        opts = "".join(f'<option value="{esc(ctx.url(sol_map.get(o["label"], "/produkte")), quote=True)}"{" selected" if o.get("selected") else ""}>{esc(o["label"])}</option>' for o in sol)
        parts.append(f'<label class="pfilter"><span>Solution</span><select data-nav-select><option value="{esc(ctx.url("/produkte"), quote=True)}">Solution wählen</option>{opts}</select></label>')
    if apps:
        opts = "".join(f'<option value="{esc(o["label"], quote=True)}">{esc(o["label"])}</option>' for o in apps)
        parts.append(f'<label class="pfilter"><span>Gerätetyp</span><select data-row-filter><option value="">Gerätetyp wählen</option>{opts}</select></label>')
    if tools and b.get("tools"):
        parts.insert(1, '<span class="pfilter__or">oder</span>')
        opts = "".join(f'<option value="{esc(o["value"], quote=True)}">{esc(o["label"])}</option>' for o in tools)
        parts.append(f'<label class="pfilter"><span>Werkzeug</span><select data-tool-filter><option value="">Werkzeug wählen</option>{opts}</select></label>')
    if parts:
        parts.append('<button type="button" class="pfilter__reset" data-filter-reset>Filter zurücksetzen</button>')
    filters = f'<div class="pfilters" data-reveal>{"".join(parts)}</div>' if parts else ""
    rows = []
    for r in b.get("rows", []):
        cards = "".join(product_card(ctx, it, i) for i, it in enumerate(r.get("items", [])))
        title = f'<h2 class="prow__title">{esc(r["title"])}</h2>' if r.get("title") else ""
        rows.append(f'<div class="prow" data-row="{esc(r.get("title", ""), quote=True)}">{title}<div class="product-rail is-grid">{cards}</div></div>')
    tool_html = ""
    if b.get("tools"):
        blocks = []
        for v, tr in b["tools"].items():
            cards = "".join(product_card(ctx, it, i) for i, it in enumerate(tr.get("items", [])))
            blocks.append(f'<div class="prow" data-tool="{esc(v)}" hidden><h2 class="prow__title">Produkte für {esc(tr["label"])}</h2><div class="product-rail is-grid">{cards}</div></div>')
        tool_html = "".join(blocks)
    return section(ctx, b, f'<div class="productlist">{filters}{"".join(rows)}{tool_html}</div>')


def r_hotspots(ctx, b):
    spots = []
    lst = []
    for i, s in enumerate(b.get("spots", [])):
        side = " hotspot--left" if s["x"] > 75 else (" hotspot--right" if s["x"] < 25 else "")
        flip = " hotspot--flip" if s["y"] > 62 else ""
        spots.append(f'<div class="hotspot{side}{flip}" style="left:{s["x"]}%;top:{s["y"]}%">'
                     f'<button type="button" class="hotspot__btn" aria-expanded="false"><span class="hotspot__dot"></span><span class="hotspot__label">{esc(s["label"])}</span></button>'
                     f'<div class="hotspot__panel" role="dialog" aria-label="{esc(s["label"], quote=True)}">{rte(ctx, s.get("text", ""))}</div></div>')
        lst.append(f'<details><summary>{esc(s["label"])}<span class="acc-icon" aria-hidden="true"></span></summary><div class="accordion__body">{rte(ctx, s.get("text", ""))}</div></details>')
    head = f'<div class="section-head">{ctx.rewrite(b["header"])}</div>' if b.get("header") else ""
    intro = rte(ctx, b.get("intro", "")) if b.get("intro") else ""
    img = img_tag(ctx, b.get("img"))
    return section(ctx, b, f'{head}{intro}<div class="hotspots" data-reveal="scale"><div class="hotspots__img">{img}{"".join(spots)}</div>'
                           f'<div class="hotspots__list accordion">{"".join(lst)}</div></div>')


def r_values(ctx, b):
    tiles = "".join(f'<div class="value-tile" data-reveal style="--d:{i * 0.08}s">{img_tag(ctx, t.get("img"), alt="")}<div class="value-tile__text">{ctx.rewrite(t.get("text", ""))}</div></div>'
                    for i, t in enumerate(b.get("tiles", [])))
    head = f'<div class="section-head">{ctx.rewrite(b["header"])}</div>' if b.get("header") else ""
    return section(ctx, b, f'{head}<div class="value-tiles">{tiles}</div>')


def r_count(ctx, b):
    return section(ctx, b, f'<div class="count-banner" data-reveal><div><h2>{esc(b.get("title", ""))}</h2>'
                           f'<p class="count-banner__note">{esc(b.get("note", ""))}</p></div>'
                           f'<div class="count-banner__value" data-count>{esc(b.get("value", ""))}</div></div>')


def r_cta_banner(ctx, b):
    img = img_tag(ctx, b.get("img"), alt="", extra=" data-parallax")
    return section(ctx, b, f'<div class="cta-banner" data-reveal="scale">{img}<div class="cta-banner__content rte">{ctx.rewrite(b.get("text", ""))}</div></div>', tight=True)


def news_card(ctx, a, i=0):
    href = ctx.url(a.get("href", ""))
    tags = "".join(f"<span>{esc(t)}</span>" for t in a.get("tags", []))
    date_ = ""
    if a.get("date"):
        try:
            y, m, d = a["date"][:10].split("-")
            date_ = f'<time class="card__date" datetime="{esc(a["date"][:10])}">{d}.{m}.{y}</time>'
        except ValueError:
            pass
    return (f'<article class="card" data-reveal style="--d:{(i % 3) * 0.08}s"><div class="card__media">{img_tag(ctx, a.get("img"), alt="")}</div>'
            f'<div class="card__body">{("<div class=card__tags>" + tags + "</div>") if tags else ""}<h3>{esc(a.get("title", ""))}</h3>'
            f'<p>{esc(a.get("teaser", ""))}</p>{date_}<span class="card__more">Weiterlesen</span></div>'
            f'<a class="card__link" href="{esc(href, quote=True)}" aria-label="{esc(a.get("title", ""), quote=True)}"></a></article>')


def r_newslist(ctx, b):
    cards = "".join(news_card(ctx, a, i) for i, a in enumerate(b.get("articles", [])))
    pages = ""
    if b.get("pages"):
        lis = []
        for p in b["pages"]:
            if p.get("href") and not p.get("current"):
                lis.append(f'<li><a href="{esc(ctx.url(p["href"]), quote=True)}">{esc(p["label"])}</a></li>')
            else:
                lis.append(f'<li><span aria-current="page">{esc(p["label"])}</span></li>')
        pages = f'<ul class="pagination">{"".join(lis)}</ul>'
    head = f'<div class="section-head">{ctx.rewrite(b["header"])}</div>' if b.get("header") else ""
    return section(ctx, b, f'{head}<div class="card-grid">{cards}</div>{pages}')


def r_taglist(ctx, b):
    tags = "".join(f'<a href="{esc(ctx.url(t["href"]), quote=True)}"{" aria-current=page" if t["href"].rstrip("/") == ctx.path else ""}>{esc(t["label"])}</a>' for t in b.get("tags", []))
    return section(ctx, b, f'<nav class="tag-filter" aria-label="Themen">{tags}</nav>', tight=True)


def r_quote(ctx, b):
    img = img_tag(ctx, b.get("img"), alt=(b.get("author") or [""])[0])
    author = "<br>".join(esc(a) for a in b.get("author", []))
    q = strip_tags(b.get("text", ""))
    return section(ctx, b, f'<figure class="pull-quote" data-reveal><blockquote><p>{esc(q)}</p></blockquote>'
                           f'<figcaption>{img}<span>{author}</span></figcaption></figure>', tight=True)


def r_icon_list(ctx, b):
    items = []
    for it in b.get("items", []):
        items.append(f'<div class="icon-item" data-reveal><div class="icon-item__head">{img_tag(ctx, it.get("icon"), alt="")}'
                     f'<div><div class="icon-item__sub">{esc(it.get("subtitle", ""))}</div><div class="icon-item__value" data-count>{esc(it.get("value", ""))}</div></div></div>'
                     f'{rte(ctx, it.get("text", ""))}</div>')
    head = f'<div class="section-head">{ctx.rewrite(b["header"])}</div>' if b.get("header") else ""
    return section(ctx, b, f'{head}<div class="icon-list">{"".join(items)}</div>')


def r_goals(ctx, b):
    tiles = []
    for i, t in enumerate(b.get("tiles", [])):
        tiles.append(f'<div class="goal" data-reveal style="--d:{(i % 3) * 0.08}s">{img_tag(ctx, t.get("img"), alt="", cls="goal__icon")}'
                     f'<div class="goal__value" data-count>{esc(t.get("value", ""))}</div>{rte(ctx, t.get("text", ""), "rte goal__text")}'
                     f'{rte(ctx, t.get("foot", ""), "rte goal__foot")}</div>')
    head = f'<div class="section-head">{ctx.rewrite(b["header"])}</div>' if b.get("header") else ""
    return section(ctx, b, f'{head}<div class="goals">{"".join(tiles)}</div>')


def r_timeline(ctx, b):
    heads = b.get("heads", {})
    nav = []
    items = []
    for it in b.get("items", []):
        h = heads.get(it.get("id"), {})
        year = h.get("year", "")
        label = h.get("label", "")
        body = it.get("html", "")
        body = re.sub(r"^\s*\d{2}\s*<br/?>\s*\d{2}\s*", "", body)  # Jahreszahl-Grafik entfernen
        # Bilder (+ kurze Bildunterschrift) zu Galerien zusammenfassen
        body = re.sub(r'(<img [^>]+>)\s*(?:<p>([^<]{1,90})</p>)?',
                      lambda m: f'<figure class="ms-fig">{m.group(1)}{("<figcaption>" + m.group(2) + "</figcaption>") if m.group(2) else ""}</figure>', body)
        body = re.sub(r'((?:<figure class="ms-fig">.*?</figure>\s*)+)', lambda m: f'<div class="ms-gallery">{m.group(1)}</div>', body, flags=re.S)
        mid = f'ms-{esc(it.get("id", ""))}'
        nav.append(f'<a href="#{mid}"><strong>{esc(year)}</strong><span>{esc(label)}</span></a>')
        items.append(f'<article class="milestone" id="{mid}"><div class="milestone__year" aria-hidden="true">{esc(year)}</div>'
                     f'<div class="milestone__body" data-reveal>{rte(ctx, body, "rte milestone__rte")}</div></article>')
    return section(ctx, b, f'<div class="timeline"><nav class="timeline__nav" aria-label="Jahre">{"".join(nav)}</nav>'
                           f'<div class="timeline__items"><div class="timeline__line"><i></i></div>{"".join(items)}</div></div>')


def r_form(ctx, b):
    kind = b.get("kind", "")
    head = f'<div class="section-head">{ctx.rewrite(b["header"])}</div>' if b.get("header") else ""
    body = ctx.rewrite(b.get("html", ""))
    if kind == "zoller_economy":
        return section(ctx, b, f'{head}<div class="economy form" data-economy>{body}</div>')
    note = ('<p class="form-note">Ihre Angaben werden sicher an ZOLLER übermittelt und gemäß der '
            f'<a href="{esc(ctx.url("/datenschutz"), quote=True)}">Datenschutzerklärung</a> verarbeitet.</p>') if kind == "form_formframework" else ""
    return section(ctx, b, f'{head}<div class="form form--{esc(kind)}" data-reveal>{body}{note}</div>')


def r_locations(ctx, b):
    if not LOCATIONS:
        return section(ctx, b, f'<p><a class="btn" href="{ORIGIN}/unternehmen/kontakt/standorte">Standortsuche öffnen</a></p>')
    regions = sorted({l["region"] for l in LOCATIONS if l.get("region")})
    countries = sorted({l["country"] for l in LOCATIONS})
    ropts = "".join(f'<option>{esc(r)}</option>' for r in regions)
    copts = "".join(f'<option>{esc(c)}</option>' for c in countries)
    cards = []
    for l in LOCATIONS:
        lines = "<br>".join(esc(x) for x in l.get("lines", []))
        contact = []
        for k, lab in (("phone", "Tel."), ("fax", "Fax"), ("email", "E-Mail"), ("other", "")):
            for v in l.get(k, []):
                if k == "email":
                    contact.append(f'<a href="mailto:{esc(v, quote=True)}">{esc(v)}</a>')
                elif k == "phone":
                    contact.append(f'<a href="tel:{esc(re.sub(r"[^0-9+]", "", v), quote=True)}">{lab} {esc(v)}</a>')
                else:
                    contact.append(f"{lab} {esc(v)}".strip())
        links = []
        for w in l.get("web", []):
            label = "Route planen" if ("goo.gl/maps" in w or "google." in w and "maps" in w) else re.sub(r"^https?://(www\.)?", "", w).rstrip("/")
            links.append(f'<a class="link-arrow" href="{esc(w, quote=True)}" target="_blank" rel="noopener">{esc(label)}</a>')
        txt = " ".join([l["name"], l["country"], " ".join(l.get("lines", []))]).lower()
        cards.append(f'<article class="location" data-region="{esc(l.get("region", ""), quote=True)}" data-country="{esc(l["country"], quote=True)}" data-text="{esc(txt, quote=True)}">'
                     f'<div class="location__region">{esc(l["region"])} · {esc(l["country"])}</div><h3>{esc(l["name"])}</h3>'
                     f'<p>{lines}</p><p class="location__contact">{"<br>".join(contact)}</p><p class="location__links">{" ".join(links)}</p></article>')
    return section(ctx, b, f'<div class="locations" data-locations><div class="locations__filter">'
                           f'<select data-loc-region aria-label="Region"><option value="">Alle Regionen</option>{ropts}</select>'
                           f'<select data-loc-country aria-label="Land"><option value="">Alle Länder</option>{copts}</select>'
                           f'<input type="search" data-loc-search placeholder="Ort oder Firma suchen" aria-label="Standort suchen"></div>'
                           f'<p class="locations__count" data-loc-count></p><div class="locations__grid">{"".join(cards)}</div></div>')


def r_events(ctx, b):
    groups = []
    for m in b.get("months", []):
        evs = []
        for e in m.get("events", []):
            btns = "".join(
                f'<a class="btn{" btn--ghost" if x.get("share") else ""}" href="{esc(ctx.url(x["href"]), quote=True)}"{" target=_blank rel=noopener" if x["href"].startswith("http") else ""}>{esc(x["label"])}</a>'
                for x in e.get("buttons", []))
            img = img_tag(ctx, e.get("img"), alt="", cls="event__logo")
            evs.append(f'<article class="event" data-reveal><div class="event__date"><span>{esc(e.get("month", ""))}</span><b>{esc(e.get("day", ""))}</b><span>{esc(e.get("weekday", ""))}</span></div>'
                       f'<div class="event__body"><div class="event__meta"><span>{esc(e.get("date", ""))}</span><span>{esc(e.get("place", ""))}</span></div>'
                       f'<h3>{esc(e.get("title", ""))}</h3>{rte(ctx, e.get("text", ""))}<div class="event__btns">{btns}</div></div>'
                       f'<div class="event__img">{img}</div></article>')
        groups.append(f'<div class="event-month"><h2 class="event-month__title">{esc(m.get("label", ""))}</h2>{"".join(evs)}</div>')
    return section(ctx, b, f'<div class="events">{"".join(groups)}</div>')


def r_academy(ctx, b):
    flt = b.get("filters", {})
    selects = []
    for lab, opts in flt.items():
        if not opts:
            continue
        o = "".join(f"<option>{esc(x)}</option>" for x in opts)
        selects.append(f'<label class="pfilter"><span>{esc(lab)}</span><select data-academy-filter><option value="">Alle</option>{o}</select></label>')
    search = '<label class="pfilter"><span>Suche</span><input type="search" data-academy-search placeholder="Stichwort"></label>'
    cards = []
    for i, it in enumerate(b.get("items", [])):
        txt = strip_tags(it.get("text", ""))
        href = ctx.url(it.get("href", ""))
        cards.append(f'<article class="card" data-reveal data-text="{esc(txt.lower(), quote=True)}"><div class="card__media">{img_tag(ctx, it.get("img"), alt="")}</div>'
                     f'<div class="card__body"><h3>{esc(it.get("title", ""))}</h3><p>{esc(txt.replace(it.get("title", ""), "").strip()[:220])}</p><span class="card__more">Ansehen</span></div>'
                     f'<a class="card__link" href="{esc(href, quote=True)}" target="_blank" rel="noopener" aria-label="{esc(it.get("title", ""), quote=True)}"></a></article>')
    more = (f'<p style="margin-top:2.5rem;text-align:center"><a class="btn" href="https://myzoller.com/" target="_blank" rel="noopener">'
            'Alle Inhalte in MYZOLLER</a></p>')
    raw = rte(ctx, b.get("raw", "")) if b.get("raw") else ""
    return section(ctx, b, f'<div class="pfilters">{"".join(selects)}{search}</div><div class="card-grid" data-academy>{"".join(cards)}</div>{raw}{more}')


def r_search(ctx, b):
    return section(ctx, b, '<div class="inline-search"><label for="inline-search-input" class="visually-hidden">Suche</label>'
                           '<input id="inline-search-input" type="search" placeholder="Wonach suchen Sie?" data-inline-search>'
                           '<ul class="search-results search-results--light" data-inline-results></ul></div>')


def r_article(ctx, b):
    tags = "".join(f"<span>{esc(t)}</span>" for t in b.get("tags", []))
    d = b.get("date", "")
    dl = ""
    if d:
        try:
            y, m, dd = d[:10].split("-")
            dl = f'<time datetime="{esc(d[:10])}">{dd}.{m}.{y}</time>'
        except ValueError:
            dl = esc(b.get("date_label", ""))
    imgs = b.get("images", [])
    hero_img = f'<div class="article-hero__img reveal-mask">{img_tag(ctx, imgs[0], eager=True, extra=" data-parallax")}</div>' if imgs else ""
    ctx.main_cls = ""
    prev_inline = ctx.inline
    ctx.inline = True
    body = "".join(render_block(ctx, x) for x in b.get("blocks", []))
    ctx.inline = prev_inline
    share_url = ORIGIN + (PAGES[ctx.path].get("url") or ctx.path)
    title = b.get("title") or PAGES[ctx.path]["title"]
    share = (f'<div class="share"><span>Teilen</span>'
             f'<a href="mailto:?subject={esc(title, quote=True)}&amp;body={esc(share_url, quote=True)}" aria-label="Per E-Mail teilen">E-Mail</a>'
             f'<a href="https://www.linkedin.com/sharing/share-offsite/?url={esc(share_url, quote=True)}" target="_blank" rel="noopener">LinkedIn</a>'
             f'<a href="https://www.facebook.com/sharer/sharer.php?u={esc(share_url, quote=True)}" target="_blank" rel="noopener">Facebook</a></div>')
    parent = "/" + "/".join(ctx.path.strip("/").split("/")[:-2]) if "/detail/" in ctx.path else "/unternehmen/reports-stories"
    back = f'<a class="link-arrow back-link" href="{esc(ctx.url(parent), quote=True)}">← Zurück zur Übersicht</a>'
    gallery = ""
    if len(imgs) > 1:
        gallery = '<div class="article-gallery">' + "".join(f"<figure>{img_tag(ctx, im)}</figure>" for im in imgs[1:]) + "</div>"
    return (f'<article class="article"><header class="article-hero"><div class="wrap">'
            f'<div class="article-hero__meta">{dl}{("<span class=card__tags>" + tags + "</span>") if tags else ""}</div>'
            f'<h1 data-reveal>{esc(title)}</h1><div class="lead" data-reveal>{rte(ctx, b.get("lead", ""))}</div>{hero_img}</div></header>'
            f'<div class="section section--tight bg-white"><div class="wrap article-body">{body}{gallery}'
            f'<div class="article-foot">{share}{back}</div></div></div></article>')


def r_raw(ctx, b):
    return section(ctx, b, rte(ctx, b.get("html", "")))


RENDER = {
    "textmedia": r_textmedia, "hero": r_hero, "product_header": r_product_header, "subnav": r_subnav,
    "cols": r_cols, "kpis": r_kpis, "cta_strip": r_cta_strip, "highlight": r_highlight, "slider": r_slider,
    "quotes": r_quotes, "overlay": r_overlay, "tiles": r_tiles, "accordion": r_accordion,
    "downloads": r_downloads, "table": r_table, "bento": r_bento, "products": r_products,
    "productlist": r_productlist, "hotspots": r_hotspots, "values": r_values, "count": r_count,
    "cta_banner": r_cta_banner, "newslist": r_newslist, "taglist": r_taglist, "quote": r_quote,
    "icon_list": r_icon_list, "goals": r_goals, "timeline": r_timeline, "form": r_form,
    "locations": r_locations, "events": r_events, "academy": r_academy, "search": r_search,
    "article": r_article, "raw": r_raw,
}


def render_block(ctx, b):
    fn = RENDER.get(b.get("type"), r_raw)
    out = fn(ctx, b)
    ctx.first_block = False
    if b.get("type") != "subnav":
        ctx.after_subnav = False
    return out


# ================================================ 3D-Showroom-Teaser ====
def showroom_teaser(ctx, bg="bg-black"):
    img = f'{ctx.prefix}assets/img/produktumgebung-3d.webp?v={ASSET_VER}'
    return f'''<section class="section {bg} showroom-teaser" id="produktumgebung-3d"><div class="wrap"><div class="feature">
  <div class="feature__media reveal-mask"><a class="media-frame showroom-teaser__frame" href="{SHOWROOM_URL}" aria-label="Produktumgebung 3D öffnen">
    <img src="{img}" alt="Blick in die 3D-Produktumgebung: zentraler Platz mit ZOLLER-Symbol und den Themenwelten" width="1600" height="900" loading="lazy" decoding="async">
    <span class="showroom-teaser__play">{CUBE_ICON}</span></a><span class="feature__badge">NEU · 3D</span></div>
  <div class="feature__text">
    <span class="eyebrow" data-reveal>Produktumgebung 3D</span>
    <h2 data-reveal>Alle Produkte in einer 3D-Halle erleben</h2>
    <p data-reveal>59 Produkte in sieben Themenwelten – von Einstellen &amp; Messen bis Wuchttechnik. Drehen, zoomen, zu Fuß durch die Halle gehen und jedes Gerät mit allen Details, Modellen und technischen Daten ansehen.</p>
    <ul class="showroom-teaser__facts" data-reveal><li><b>59</b> Produkte</li><li><b>7</b> Themenwelten</li><li><b>360°</b> Rundgang</li></ul>
    <p data-reveal><a class="btn" href="{SHOWROOM_URL}">3D-Showroom öffnen</a></p>
  </div>
</div></div></section>'''


def worldflight(ctx):
    """Startseite: scroll-gesteuerter Kameraflug durch die 3D-Halle (assets/js/worldflight.js)."""
    ctx.has_worldflight = True
    cats = list(SHOW_CATS.values())
    prods = list(SHOW.values())
    total = sum(c.get("count", 0) for c in cats)
    chapters = [f'''<div class="wf-chapter wf-chapter--intro" data-chapter="0">
  <span class="eyebrow">Die ZOLLER Produktwelt in 3D</span>
  <h2>{total} Produkte.<br>{len(cats)} Themenwelten.<br><em>Eine Halle.</em></h2>
  <p>Scrollen Sie – die Kamera fliegt durch alle Themenwelten der 3D-Produktumgebung.</p>
  <span class="wf-scroll" aria-hidden="true"><i></i></span></div>''']
    rail = []
    for i, c in enumerate(cats):
        items = [p for p in prods if p.get("cat") == c["id"]]
        chips = "".join(f'<li><a href="{esc(ctx.url(p["path"]), quote=True)}">{esc(p["name"])}</a></li>' for p in items[:9])
        more = f'<li class="wf-more">+ {len(items) - 9} weitere</li>' if len(items) > 9 else ""
        n = c.get("count", len(items))
        chapters.append(f'''<div class="wf-chapter" data-chapter="{i + 1}">
  <span class="wf-num">{i + 1:02d}<small> / {len(cats):02d}</small></span>
  <h3>{esc(c["name"])}</h3>
  <p class="wf-text">{esc(c.get("text", ""))}</p>
  <p class="wf-count"><b>{n}</b> {"Produkt" if n == 1 else "Produkte"}</p>
  <ul class="wf-chips">{chips}{more}</ul>
  <div class="wf-links"><a class="link-arrow" href="{esc(ctx.url("/produkte/" + c["id"]), quote=True)}">Themenwelt ansehen →</a>
  <a class="wf-3d" href="{SHOWROOM_URL}#themenwelt/{c["id"]}">{CUBE_ICON}In 3D begehen</a></div></div>''')
        rail.append(f'<li><button type="button" data-goto="{i + 1}" aria-label="{esc(c["name"], quote=True)}"><span>{esc(c["name"])}</span></button></li>')
    chapters.append(f'''<div class="wf-chapter wf-chapter--outro" data-chapter="{len(cats) + 1}">
  <span class="eyebrow">Produktumgebung 3D</span>
  <h2>Jetzt selbst durch<br>die Halle gehen.</h2>
  <p>Jedes Gerät anklicken, Details lesen, im Begehen-Modus zu Fuß durch alle Themenwelten.</p>
  <p><a class="btn" href="{SHOWROOM_URL}">3D-Showroom öffnen</a></p></div>''')
    img = f'{ctx.prefix}assets/img/produktumgebung-3d.webp?v={ASSET_VER}'
    return f'''<section class="worldflight" id="produktwelt" data-worldflight data-base="{ctx.prefix}assets/showroom/" aria-label="Die ZOLLER Produktwelt in 3D">
  <div class="worldflight__sticky">
    <div class="worldflight__poster" style="background-image:url('{img}')"></div>
    <canvas class="worldflight__canvas" aria-hidden="true"></canvas>
    <div class="worldflight__shade" aria-hidden="true"></div>
    <div class="worldflight__loading" aria-hidden="true"><i></i><span>Halle wird geladen</span></div>
    <div class="wrap worldflight__ui">{"".join(chapters)}</div>
    <ol class="worldflight__rail" aria-label="Themenwelten">{"".join(rail)}</ol>
    <div class="worldflight__bar" aria-hidden="true"><i></i></div>
  </div>
</section>'''


# ======================================================== Startseite ====
def render_home(ctx, page):
    B = page["blocks"]
    by = {}
    for b in B:
        by.setdefault(b["type"], []).append(b)
    hero = by["hero"][0]["slides"][0]
    tm = [b for b in B if b["type"] == "textmedia"]
    used = set()

    def take(pred):
        for b in tm:
            if id(b) in used:
                continue
            if pred(b):
                used.add(id(b))
                return b
        return None

    wear = take(lambda b: "wearCheck" in b.get("header", ""))
    premium = take(lambda b: b.get("bg") == "yellow")
    apps = take(lambda b: len(b.get("images", [])) >= 3)
    q1 = take(lambda b: "Automation ist unabdingbar" in b.get("header", ""))
    q2 = take(lambda b: "Digitalisierung" in b.get("header", ""))
    smart = take(lambda b: "Smart Factory" in b.get("body", "") or "live erleben" in b.get("header", ""))
    balancer = take(lambda b: "toolBalancer" in b.get("body", ""))
    out = []
    root = ctx.prefix
    # 1) 3D-Bühne
    sub = strip_tags(hero.get("text", ""))
    parts = [s.strip() for s in re.split(r"(?<=Werkzeugprozesse)\s+", sub, maxsplit=1)]
    p1 = parts[0] if parts else sub
    p2 = parts[1] if len(parts) > 1 else ""
    out.append(f'''
<section class="stage3d" data-stage3d aria-label="Einleitung">
  <div class="stage3d__sticky">
    <div class="stage3d__fallback"><video src="{root}assets/video/header_animation.mp4" autoplay muted loop playsinline preload="metadata" poster=""></video></div>
    <canvas class="stage3d__canvas" aria-hidden="true"></canvas>
    <div class="stage3d__copy"><div class="wrap">
      <div class="stage3d__panel" data-panel="0"><span class="eyebrow">ZOLLER · Technologieführer</span><h1>{esc(hero.get("title", ""))}</h1><p>{esc(sub)}</p></div>
      <div class="stage3d__panel stage3d__panel--right" data-panel="1"><h2>Präzision<br><em>auf den µm.</em></h2><p>{esc(p1)}.</p></div>
      <div class="stage3d__panel" data-panel="2"><h2>Ein System.<br><em>Alle Prozesse.</em></h2><p>{esc(p2[0].upper() + p2[1:] if p2 else "")}</p>
        <a class="btn" href="{esc(ctx.url("/das-system"), quote=True)}">Das System entdecken</a></div>
    </div></div>
    <div class="stage3d__progress" aria-hidden="true"><span><i></i></span><span><i></i></span><span><i></i></span></div>
    <div class="stage3d__readout" aria-hidden="true">Messung live<b data-readout>Ø 20,000 mm</b><span data-readout2>L 112,000 mm</span></div>
  </div>
</section>''')
    # 2) wearCheck
    if wear:
        img = img_tag(ctx, (wear.get("images") or [None])[0])
        out.append(f'''<section class="section bg-black feature-dark" id="{wear["id"]}"><div class="wrap"><div class="feature">
  <div class="feature__media reveal-mask"><div class="media-frame" data-parallax-img>{img}</div><span class="feature__badge">KI</span></div>
  <div class="feature__text"><div data-reveal>{add_heading_class(ctx.rewrite(wear["header"]), "eyebrow-h")}</div><div data-reveal>{rte(ctx, wear["body"])}</div></div>
</div></div></section>''')
    # 3) Premium-Statement (gelb)
    if premium:
        body = premium.get("body", "")
        statement_m = re.search(r'<p class="extra-large-text">((?:(?!</p>).)*Premium ein Versprechen(?:(?!</p>).)*)</p>', body, re.S)
        statement = ""
        if statement_m:
            statement = statement_m.group(1)
            body = body.replace(statement_m.group(0), "")
        body = body.replace('<p class="extra-large-text"><br/>', '<p class="extra-large-text">')
        img = img_tag(ctx, (premium.get("images") or [None])[0])
        out.append(f'''<section class="section bg-yellow" id="{premium["id"]}"><div class="wrap">
  <div class="premium">
    <div class="premium__text"><div data-reveal>{ctx.rewrite(premium["header"])}</div><div data-reveal>{rte(ctx, body)}</div></div>
    <div class="premium__img reveal-mask"><div class="media-frame" data-parallax-img>{img}</div></div>
  </div>
  {f'<p class="statement statement--wide" data-words>{ctx.rewrite(statement)}</p>' if statement else ""}
</div></section>''')
    # 4) Kennzahlen
    for b in by.get("kpis", []):
        out.append(r_kpis(ctx, b))
    # 4b) 3D-Produktwelt: Kameraflug durch die Halle
    out.append(worldflight(ctx) if SHOW_CATS else showroom_teaser(ctx))
    # 5) Rechner-Banner
    for b in by.get("cta_strip", []):
        out.append(r_cta_strip(ctx, b))
    # 6) Fräsen / Drehen / Schleifen (horizontal gepinnt)
    if apps:
        items = []
        for i, im in enumerate(apps["images"]):
            cap = ctx.rewrite(im.get("caption", "")).replace("Mehr erfahren", "")
            cap = re.sub(r"<br/?>\s*$", "", cap.strip())
            items.append(f'''<div class="hscroll__item"><a class="app-card" href="{esc(ctx.url(im.get("href", "")), quote=True)}">
  {img_tag(ctx, im, alt="")}<span class="app-card__num">0{i + 1} / 0{len(apps["images"])}</span>
  <div class="app-card__text rte">{cap}<span class="btn btn--ghost">Mehr erfahren</span></div></a></div>''')
        out.append(f'''<section class="section bg-lightgray hscroll" id="{apps["id"]}" data-hscroll>
  <div class="hscroll__pin"><div class="wrap"><div class="section-head" data-reveal>{ctx.rewrite(apps["header"])}</div></div>
  <div class="hscroll__track">{"".join(items)}</div></div></section>''')
    # 7) Zitate
    for i, q in enumerate([x for x in (q1, q2) if x]):
        img = img_tag(ctx, (q.get("images") or [None])[0])
        quote = strip_tags(q["header"]).strip("„“\" ")
        body = q.get("body", "")
        m = re.search(r'<p class="large-text">(.*?)</p>', body, re.S)
        cite = strip_tags(m.group(1)) if m else ""
        rest = body.replace(m.group(0), "") if m else body
        bg = "bg-white" if i == 0 else "bg-lightgray"
        out.append(f'''<section class="section {bg}" id="{q["id"]}"><div class="wrap"><div class="big-quote{" big-quote--rev" if i else ""}">
  <div class="big-quote__img reveal-mask"><div class="media-frame" style="height:100%">{img_tag(ctx, (q.get("images") or [None])[0], extra=" data-parallax")}</div></div>
  <div data-reveal><blockquote><p>{esc(quote)}</p></blockquote><cite>{esc(cite)}</cite>{rte(ctx, rest)}</div></div></div></section>''')
    # 8) Smart Factory (Vollbild)
    if smart:
        img = img_tag(ctx, (smart.get("images") or [None])[0], extra=" data-parallax")
        out.append(f'''<section class="immersive" id="{smart["id"]}"><div class="immersive__media">{img}</div>
  <div class="wrap immersive__content"><div class="immersive__card" data-reveal>{ctx.rewrite(smart["header"])}{rte(ctx, smart["body"])}</div></div></section>''')
    # 9) toolBalancer
    if balancer:
        header = re.sub(r'<a href="/startseite">(.*?)</a>', r"\1", balancer["header"])
        img = img_tag(ctx, (balancer.get("images") or [None])[0])
        out.append(f'''<section class="section bg-black" id="{balancer["id"]}"><div class="wrap"><div class="feature feature--rev">
  <div class="feature__media reveal-mask"><div class="media-frame" data-parallax-img>{img}</div></div>
  <div class="feature__text"><span class="eyebrow">Wuchttechnik</span><div data-reveal>{ctx.rewrite(header)}</div><div data-reveal>{rte(ctx, balancer["body"])}</div>
  <p class="big-number" data-reveal><span data-count>&lt; 0,4</span> <small>gmm Wuchtgüte</small></p></div>
</div></div></section>''')
    # Restliche Textblöcke (falls neue Inhalte hinzukommen)
    for b in tm:
        if id(b) not in used:
            out.append(r_textmedia(ctx, b))
    # 10) News + 11) Experten-CTA
    for b in by.get("newslist", []):
        out.append(r_newslist(ctx, b))
    for b in by.get("cta_banner", []):
        out.append(r_cta_banner(ctx, b))
    for t in ("products", "slider", "quotes", "accordion", "downloads", "table", "bento"):
        for b in by.get(t, []):
            out.append(render_block(ctx, b))
    ctx.main_cls = "has-hero"
    return "\n".join(out)


# ============================================================ Layout ====
def header_html(ctx):
    nav = NAV["main"]
    items = []
    for n in nav:
        href = ctx.url(n["href"])
        active = ctx.path == n["href"] or ctx.path.startswith(n["href"].rstrip("/") + "/")
        kids = n.get("children", [])
        if not kids:
            items.append(f'<li class="mainnav__item"><a class="mainnav__link{" is-active" if active else ""}" href="{esc(href, quote=True)}">{esc(n["label"])}</a></li>')
            continue
        cols = []
        for c in kids:
            sub = c.get("children", [])
            lis = []
            for s in sub:
                small = f'<small>{esc(s.get("claim") or s.get("desc", ""))}</small>' if (s.get("claim") or s.get("desc")) else ""
                ss = s.get("children", [])
                subsub = ""
                if ss:
                    subsub = '<ul class="sub-group">' + "".join(
                        f'<li><a href="{esc(ctx.url(x["href"]), quote=True)}">{esc(x["label"])}'
                        f'{("<small>" + esc(x.get("claim") or x.get("desc", "")) + "</small>") if (x.get("claim") or x.get("desc")) else ""}</a></li>'
                        for x in ss) + "</ul>"
                lis.append(f'<li><a href="{esc(ctx.url(s["href"]), quote=True)}">{esc(s["label"])}{small}</a>{subsub}</li>')
            title = f'<h3><a href="{esc(ctx.url(c["href"]), quote=True)}">{esc(c["label"])}</a></h3>'
            cols.append(f'<div class="mega__col">{title}{("<ul>" + "".join(lis) + "</ul>") if lis else ""}</div>')
        mid = "mega-" + re.sub(r"\W+", "", n["label"].lower())
        items.append(f'''<li class="mainnav__item has-mega"><a class="mainnav__link{" is-active" if active else ""}" href="{esc(href, quote=True)}" aria-expanded="false" aria-controls="{mid}">{esc(n["label"])}</a>
<div class="mega" id="{mid}"><div class="wrap mega__inner"><div class="mega__intro"><h2>{esc(n["label"])}</h2><a href="{esc(href, quote=True)}">Übersicht {esc(n["label"])} →</a></div>
<div class="mega__cols">{"".join(cols)}</div></div></div></li>''')
    meta = "".join(f'<a class="meta-link" href="{esc(ctx.url(m["href"]), quote=True)}">{esc(m["label"])}</a>' for m in NAV["meta"])
    home = ctx.url(HOME)
    return f'''<header class="site-header" data-header>
<div class="wrap site-header__inner">
  <a class="site-header__logo" href="{esc(home, quote=True)}" aria-label="ZOLLER Startseite"><img src="{ctx.prefix}assets/img/zoller.svg" alt="ZOLLER" width="118" height="27"></a>
  <nav class="mainnav" aria-label="Hauptnavigation"><ul class="mainnav__list">{"".join(items)}</ul></nav>
  <div class="site-header__tools">
    <a class="showroom-link" href="{SHOWROOM_URL}" title="Alle Produkte in der 3D-Produktumgebung erleben">{CUBE_ICON}<span class="showroom-link__full">3D-Showroom</span><span class="showroom-link__short">3D</span></a>
    {meta}
    <a class="meta-link myzoller-link" href="https://myzoller.com/" target="_blank" rel="noopener" aria-label="MYZOLLER"><img src="{ctx.prefix}assets/img/myzoller.svg" alt="MYZOLLER" width="90" height="15"></a>
    <button class="icon-btn" type="button" data-search-open aria-label="Suche öffnen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></button>
    <button class="icon-btn" type="button" data-lang-open aria-label="Sprache wählen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/></svg></button>
    <button class="icon-btn burger" type="button" data-burger aria-label="Menü öffnen" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 8h16M4 16h16"/></svg></button>
  </div>
</div>
</header>
{mobile_nav(ctx)}'''


def mobile_nav(ctx):
    def lst(nodes, depth=0):
        out = []
        for n in nodes:
            href = esc(ctx.url(n["href"]), quote=True)
            kids = n.get("children", [])
            claim = n.get("claim") or n.get("desc")
            if kids and depth < 2:
                out.append(f'<details><summary>{esc(n["label"])}</summary><ul><li><a href="{href}">Übersicht</a></li>{"".join(lst(kids, depth + 1))}</ul></details>')
            else:
                out.append(f'<li><a href="{href}">{esc(n["label"])}{("<small>" + esc(claim) + "</small>") if claim else ""}</a></li>')
        return out
    top = []
    for n in NAV["main"]:
        if n.get("children"):
            top.append(f'<details><summary>{esc(n["label"])}</summary><ul><li><a href="{esc(ctx.url(n["href"]), quote=True)}">Übersicht</a></li>{"".join(lst(n["children"], 1))}</ul></details>')
        else:
            top.append(f'<a href="{esc(ctx.url(n["href"]), quote=True)}">{esc(n["label"])}</a>')
    meta = "".join(f'<a href="{esc(ctx.url(m["href"]), quote=True)}">{esc(m["label"])}</a>' for m in NAV["meta"])
    showroom = (f'<a class="mobile-nav__showroom" href="{SHOWROOM_URL}">{CUBE_ICON}<span>Produktumgebung 3D'
                f'<small>Alle Produkte im 3D-Showroom erleben</small></span></a>')
    return f'<nav class="mobile-nav" aria-label="Mobile Navigation" data-mobile-nav>{showroom}{"".join(top)}<div class="mobile-nav__meta">{meta}<a href="https://myzoller.com/" target="_blank" rel="noopener">MYZOLLER</a></div></nav>'


def footer_html(ctx):
    u = ctx.url
    def link(label, href, ext=False):
        t = ' target="_blank" rel="noopener"' if ext else ""
        return f'<li><a href="{esc(u(href), quote=True)}"{t}>{esc(label)}</a></li>'
    nav = "".join(link(n["label"], n["href"]) for n in NAV["main"])
    service = "".join([link("Service", "/unternehmen/kontakt/ansprechpartner"), link("Medien", "/unternehmen/medien"),
                       link("Karriere", "/unternehmen/karriere"), link("MYZOLLER", "https://myzoller.com/", True)])
    useful = "".join([link("Wirtschaftlichkeitsrechner", "/wirtschaftlichkeitsrechner"), link("Ansprechpartner", "/unternehmen/kontakt/ansprechpartner"),
                      link("E-Mail senden", "mailto:info@zoller.info"), link("ZOLLER Service", "/unternehmen/kontakt/ansprechpartner"),
                      link("Software-Updates", "/software-updates"), link("Online Support", "/online-support"),
                      link("Geschäftsfelder", "/geschaeftsfelder"), link("Newsletteranmeldung", "/unternehmen/kontakt/newsletter"),
                      link("Allgemeine Einkaufsbedingungen", "/allgemeine-einkaufsbedingungen")])
    crumbs = breadcrumb(ctx)
    return f'''{crumbs}
<footer class="site-footer">
  <div class="wrap">
    <div class="footer-cta">
      <h2 data-reveal>Mit System<br><em>zum Maximum.</em></h2>
      <div data-reveal><a class="btn" href="{esc(u("/unternehmen/kontakt"), quote=True)}">Kontakt aufnehmen</a><a class="btn btn--ghost" href="https://myzoller.com/de/de/expert/booking" target="_blank" rel="noopener">1:1 Expertengespräch</a></div>
    </div>
    <div class="footer-grid">
      <div class="footer-brand">
        <img src="{ctx.prefix}assets/img/zoller.svg" alt="ZOLLER" width="150" height="34">
        <address>E. ZOLLER GmbH &amp; Co. KG<br>Einstell- und Messgeräte<br>Gottlieb-Daimler-Straße 19<br>D-74385 Pleidelsheim<br>
        <a href="tel:+49714489700">Tel: +49 7144 8970-0</a><br><a href="mailto:info@zoller.info">info@zoller.info</a></address>
        <div class="footer-social">
          <a href="https://www.linkedin.com/company/zollersolutions" target="_blank" rel="noopener" aria-label="LinkedIn"><svg viewBox="0 0 24 24"><path d="M4.98 3.5C4.98 4.88 3.87 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.22 8.02h4.56V23H.22V8.02zM8.3 8.02h4.37v2.05h.06c.61-1.15 2.1-2.37 4.32-2.37 4.62 0 5.47 3.04 5.47 7v8.3h-4.56v-7.36c0-1.76-.03-4.02-2.45-4.02-2.45 0-2.83 1.92-2.83 3.9V23H8.3V8.02z"/></svg></a>
          <a href="https://www.youtube.com/user/zollertv" target="_blank" rel="noopener" aria-label="YouTube"><svg viewBox="0 0 24 24"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.2 3.6-6.2 3.6z"/></svg></a>
        </div>
      </div>
      <div><h3>Navigation</h3><ul>{nav}</ul></div>
      <div><h3>Service</h3><ul>{service}</ul></div>
      <div class="footer-wide"><h3>Nützliche Links</h3><ul>{useful}</ul></div>
      <div><h3>Folgen Sie uns auf</h3><ul>{link("LinkedIn", "https://www.linkedin.com/company/zollersolutions", True)}{link("YouTube", "https://www.youtube.com/user/zollertv", True)}</ul></div>
    </div>
    <div class="footer-bottom">
      <span>© {date.today().year} E. ZOLLER GmbH &amp; Co. KG</span>
      <ul>{link("Kontakt", "/unternehmen/kontakt")}{link("Datenschutz", "/datenschutz")}{link("Haftungsausschluss", "/haftungsausschluss")}{link("Impressum", "/impressum")}<li><button type="button" data-lang-open>DE</button></li></ul>
    </div>
  </div>
</footer>
<button class="to-top" type="button" data-to-top aria-label="Nach oben"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg></button>'''


def breadcrumb(ctx):
    if ctx.path == HOME:
        return ""
    parts = ctx.path.strip("/").split("/")
    crumbs = [f'<li><a href="{esc(ctx.url(HOME), quote=True)}">Start</a></li>']
    for i in range(len(parts)):
        p = "/" + "/".join(parts[: i + 1])
        last = i == len(parts) - 1
        if p in PAGES:
            label = PAGES[p]["title"] or parts[i]
            label = re.sub(r"\s*[|–-]\s*ZOLLER.*$", "", label)
            if last:
                crumbs.append(f'<li><span aria-current="page">{esc(label)}</span></li>')
            else:
                crumbs.append(f'<li><a href="{esc(ctx.url(p), quote=True)}">{esc(label)}</a></li>')
    return f'<nav class="breadcrumb bg-lightgray" aria-label="Brotkrumen"><div class="wrap"><ol>{"".join(crumbs)}</ol></div></nav>'


def lang_dialog(ctx, page):
    regions = page.get("languages") or PAGES[HOME].get("languages") or []
    cols = []
    for r in regions:
        lis = "".join(f'<li><a href="{esc(l["href"], quote=True)}"{" aria-current=true" if l["label"].startswith("Deutschland") else ""}{"" if "zoller.info" in l["href"] and not l["href"].endswith(".pdf") else " target=_blank rel=noopener"}>{esc(l["label"])}</a></li>' for l in r["links"])
        cols.append(f'<div><h3>{esc(r["region"])}</h3><ul>{lis}</ul></div>')
    return f'''<dialog class="lang-dialog" data-lang-dialog aria-labelledby="lang-title"><div class="lang-dialog__inner">
<div class="lang-dialog__head"><h2 id="lang-title">Sprache wählen</h2><button class="icon-btn" type="button" data-close aria-label="Schließen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
<div class="lang-dialog__grid">{"".join(cols)}</div></div></dialog>'''


def search_overlay(ctx):
    return f'''<div class="search-overlay" data-search role="dialog" aria-modal="true" aria-label="Suche">
<button class="icon-btn search-overlay__close" type="button" data-search-close aria-label="Suche schließen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
<div class="search-overlay__box"><label for="site-search" class="visually-hidden">Suchbegriff</label>
<input id="site-search" type="search" placeholder="Suchen auf zoller.info" autocomplete="off" data-search-input>
<p class="search-hint" data-search-hint>Produkte, Lösungen, Downloads, Stories …</p>
<ul class="search-results" data-search-results></ul></div></div>'''


def render_page(page):
    ctx = Ctx(page)
    ctx.inline = False
    ctx.first_block = True
    ctx.after_subnav = False
    ctx.has_subnav = False
    ctx.main_cls = ""
    ctx.has_stage = False
    ctx.has_worldflight = False
    is_home = page["path"] == HOME
    if is_home:
        body = render_home(ctx, page)
    else:
        blocks = page["blocks"]
        # Hintergrund-Folgen markieren
        prev = None
        for b in blocks:
            bg = b.get("bg") or "white"
            if prev == bg and b["type"] not in ("hero", "product_header", "subnav"):
                b["_continued"] = True
            prev = bg if b["type"] != "subnav" else prev
        sp = show_product(page["path"])
        if sp and not any(b["type"] == "product_header" for b in blocks):
            # Produktseiten ohne eigenen Kopf (Speziallösungen, Software) bekommen eine 3D-Bühne
            blocks = list(blocks)
            at = 1 if blocks and blocks[0]["type"] == "subnav" else 0
            text = sp.get("teaser") or sp.get("claim") or ""
            blocks.insert(at, {"type": "product_header", "id": "produkt", "title": sp["name"],
                               "text": f'<p>{esc(text)}</p><p><a class="btn" href="/unternehmen/kontakt">Jetzt anfragen</a></p>'})
            nxt = blocks[at + 1] if len(blocks) > at + 1 else None
            if nxt and nxt["type"] == "textmedia" and "<h1" in nxt.get("header", ""):
                nxt = dict(nxt)
                nxt["header"] = nxt["header"].replace("<h1", "<h2").replace("</h1>", "</h2>")
                blocks[at + 1] = nxt
        cat_id = page["path"].split("/")[-1] if page["path"].count("/") == 2 and page["path"].startswith("/produkte/") else None
        parts = []
        for b in blocks:
            if page["path"] == "/produkte" and b["type"] == "productlist":
                parts.append(showroom_teaser(ctx))
            if cat_id in SHOW_CATS and b["type"] == "productlist":
                parts.append(showroom_strip(ctx, SHOW_CATS[cat_id]))
            parts.append(render_block(ctx, b))
        body = "\n".join(p for p in parts if p)
        if not ctx.main_cls and not any(b["type"] in ("hero",) for b in blocks[:1]) and not any(b["type"] == "article" for b in blocks):
            # Seiten ohne Bühne bekommen einen Seitentitel, falls keiner vorhanden ist
            if "<h1" not in body:
                body = (f'<section class="section page-title bg-white"><div class="wrap"><h1 data-reveal>{esc(page["title"])}</h1></div></section>' + body)
    title = page["title"] or "ZOLLER"
    full_title = f"{title} | ZOLLER" if "ZOLLER" not in title else title
    desc = page.get("description") or ""
    og = ctx.url(page.get("og_image") or "") if page.get("og_image") else ""
    body_cls = "page-home" if is_home else ("page-product" if ctx.has_subnav else "page")
    head = f'''<!doctype html>
<html lang="de" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{esc(full_title)}</title>
<meta name="description" content="{esc(desc, quote=True)}">
<meta name="theme-color" content="#000000">
<meta property="og:title" content="{esc(title, quote=True)}">
<meta property="og:type" content="website">
{f'<meta property="og:image" content="{esc(og, quote=True)}">' if og else ""}
<link rel="icon" href="{ctx.prefix}assets/img/favicon.ico">
<link rel="preload" href="{ctx.prefix}assets/fonts/T-Star-Medium.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="{ctx.prefix}assets/fonts/T-Star-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="{ctx.prefix}assets/css/main.css?v={ASSET_VER}">
<script>document.documentElement.className='js';if(matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('reduced-motion');</script>
</head>'''
    scripts = f'''<script src="{ctx.prefix}assets/vendor/gsap.min.js" defer></script>
<script src="{ctx.prefix}assets/vendor/ScrollTrigger.min.js" defer></script>
<script src="{ctx.prefix}assets/vendor/lenis.min.js" defer></script>
<script src="{ctx.prefix}assets/js/main.js?v={ASSET_VER}" defer></script>'''
    modules = []
    if is_home:
        modules.append("stage3d.js")
    if ctx.has_worldflight:
        modules.append("worldflight.js")
    if ctx.has_stage:
        modules.append("productstage.js")
    if modules:
        scripts += f'''
<script type="importmap">{{"imports":{{"three":"{ctx.root}assets/vendor/three.module.min.js"}}}}</script>'''
        for m in modules:
            scripts += f'''
<script type="module" src="{ctx.prefix}assets/js/{m}?v={ASSET_VER}"></script>'''
    doc = f'''{head}
<body class="{body_cls}" data-root="{ctx.root}">
<a class="skip-link" href="#main">Zum Inhalt springen</a>
{header_html(ctx)}
<main id="main" class="{ctx.main_cls}">
{body}
</main>
{footer_html(ctx)}
{lang_dialog(ctx, page)}
{search_overlay(ctx)}
{scripts}
</body>
</html>'''
    return doc


# ============================================================ Search ====
def search_index():
    idx = []
    for path, p in PAGES.items():
        texts = []

        def walk(o):
            if isinstance(o, str):
                texts.append(o)
            elif isinstance(o, dict):
                for k, v in o.items():
                    if k in ("src", "img", "href", "id", "ftype", "bg", "space", "pos", "type", "kind", "html") and k != "html":
                        continue
                    walk(v)
            elif isinstance(o, list):
                for v in o:
                    walk(v)
        walk(p["blocks"])
        txt = strip_tags(" ".join(texts))
        section_ = path.strip("/").split("/")[0] if path != HOME else "start"
        idx.append({"t": p["title"], "u": "" if path == HOME else path.strip("/") + "/", "s": section_,
                    "d": (p.get("description") or txt[:180]), "x": txt[:2500].lower()})
    return idx


# ============================================================== Main ====
def main():
    global NAV, LOCATIONS
    NAV = json.load(open(os.path.join(ROOT, "content", "nav.json"), encoding="utf-8"))
    show_file = os.path.join(ROOT, "assets", "showroom", "products.json")
    if os.path.exists(show_file):
        sd = json.load(open(show_file, encoding="utf-8"))
        SHOW_CATS.update({c["id"]: c for c in sd["categories"]})
        SHOW.update({p["path"].rstrip("/"): p for p in sd["products"] if p.get("path")})
    loc_file = os.path.join(ROOT, "content", "locations.json")
    if os.path.exists(loc_file):
        LOCATIONS = json.load(open(loc_file, encoding="utf-8"))
    skip = {"/404", "/suchergebnisse", "/ihr-erfolg/detail", "/unternehmen/reports-stories/detail", "/unternehmen/medien/detail"}
    for f in sorted(glob.glob(os.path.join(ROOT, "content", "pages", "*.json"))):
        p = json.load(open(f, encoding="utf-8"))
        if p["path"] in skip:
            continue
        PAGES[p["path"].rstrip("/") or HOME] = p
    # Ausgabeverzeichnis vorbereiten (Bilder in docs/fileadmin bleiben erhalten)
    os.makedirs(OUT, exist_ok=True)
    for name in os.listdir(OUT):
        full = os.path.join(OUT, name)
        if name in ("fileadmin", "CNAME", ".nojekyll"):
            continue
        if os.path.isdir(full):
            shutil.rmtree(full)
        else:
            os.remove(full)
    shutil.copytree(os.path.join(ROOT, "assets"), os.path.join(OUT, "assets"))
    open(os.path.join(OUT, ".nojekyll"), "w").close()
    count = 0
    for path, p in PAGES.items():
        doc = render_page(p)
        target = OUT if path == HOME else os.path.join(OUT, path.strip("/"))
        os.makedirs(target, exist_ok=True)
        with open(os.path.join(target, "index.html"), "w", encoding="utf-8") as fh:
            fh.write(doc)
        count += 1
    # /startseite/ als Weiterleitung
    os.makedirs(os.path.join(OUT, "startseite"), exist_ok=True)
    with open(os.path.join(OUT, "startseite", "index.html"), "w") as fh:
        fh.write('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=../"><link rel="canonical" href="../"><title>ZOLLER</title>')
    with open(os.path.join(OUT, "404.html"), "w", encoding="utf-8") as fh:
        fake = {"path": "/404", "title": "Seite nicht gefunden", "description": "", "blocks": [
            {"type": "textmedia", "header": "<h1>Seite nicht gefunden</h1>", "body": "<p>Die gewünschte Seite existiert nicht (mehr). Nutzen Sie die Suche oder starten Sie auf der Startseite.</p><p><a class=\"btn\" href=\"/startseite\">Zur Startseite</a></p>", "images": [], "videos": [], "pos": "text"}]}
        PAGES["/404"] = fake
        doc = render_page(fake)
        # 404.html wird für beliebig tiefe URLs ausgeliefert: feste Basis setzen
        base = os.environ.get("SITE_BASE", "/zoller-webseite/")
        doc = doc.replace("<head>", f'<head>\n<base href="{base}">', 1)
        fh.write(doc)
        del PAGES["/404"]
    with open(os.path.join(OUT, "assets", "search-index.json"), "w", encoding="utf-8") as fh:
        json.dump(search_index(), fh, ensure_ascii=False, separators=(",", ":"))
    print(f"{count} Seiten erzeugt -> {OUT}")


if __name__ == "__main__":
    main()
