"""Prüft, ob alle Texte der Originalseiten im extrahierten Inhalt enthalten sind."""
import glob, json, os, re, sys, collections
from bs4 import BeautifulSoup
sys.path.insert(0, os.path.dirname(__file__))
raw_dir = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IGN = re.compile(r'^(Toggle|accordion|Nächster|Vorheriger|Slide|Scroll|left|right|Plus|Icon|Close|overlay|Filter|Bitte|Tag|wählen|Alle|Senden|--|\|)$', re.I)
def words(s):
    s = re.sub(r'<[^>]+>', ' ', s)
    s = s.replace('­', '').replace('\xa0', ' ')
    return [w for w in re.findall(r'[\wÄÖÜäöüß%€$µ.,:;!?–-]+', s) if len(w) > 2]
def jstrings(o):
    if isinstance(o, str): yield o
    elif isinstance(o, dict):
        for v in o.values(): yield from jstrings(v)
    elif isinstance(o, list):
        for v in o: yield from jstrings(v)
types = collections.Counter(); raws = collections.Counter()
bad = []
for f in sorted(glob.glob(os.path.join(ROOT, 'content/pages/*.json'))):
    p = json.load(open(f))
    def walk(bs):
        for b in bs:
            types[b.get('type')] += 1
            if b.get('type') == 'raw': raws[b.get('ftype')] += 1
            for k in ('blocks',):
                if k in b: walk(b[k])
            for c in b.get('columns', []): walk(c)
            for it in b.get('items', []) if isinstance(b.get('items'), list) else []:
                if isinstance(it, dict) and 'blocks' in it: walk(it['blocks'])
    walk(p['blocks'])
    rf = os.path.join(raw_dir, os.path.basename(f)[:-5] + '.html')
    if not os.path.exists(rf): continue
    soup = BeautifulSoup(open(rf, encoding='utf-8').read(), 'lxml')
    m = soup.find('main')
    for t in m.find_all(['script', 'style', 'select', 'option', 'button']): t.decompose()
    for t in m.select('.language-dropdown-wrapper, .zoller_products__filters'): t.decompose()
    ow = collections.Counter(w.strip('.,:;!?') for w in words(m.get_text(' ')) if not IGN.match(w))
    nw = collections.Counter(w.strip('.,:;!?') for s in jstrings(p['blocks']) for w in words(s))
    missing = {w: c for w, c in ow.items() if w and nw[w] == 0}
    total = sum(ow.values()) or 1
    miss = sum(missing.values())
    if miss / total > 0.01 and miss > 2:
        bad.append((round(100 * miss / total, 1), os.path.basename(f), list(missing)[:15]))
print('block types:', dict(types.most_common()))
print('raw fallbacks by ftype:', dict(raws))
print('pages with >1% missing words:', len(bad))
for b in sorted(bad, reverse=True)[:40]: print(b)
