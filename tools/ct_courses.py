#!/usr/bin/env python3
"""Course page texts from the Google Sheet "IMPACT Website Content" (one tab per discipline).

  python3 tools/ct_courses.py build     data/courses.json -> the course pages (used by the workflow content-sync)
  python3 tools/ct_courses.py tag       one-off: mark every editable text element in the pages with data-ct="section.field"
  python3 tools/ct_courses.py extract   one-off: read the marked pages into data/courses.json (first fill of the sheet)

How it works
  Every editable text element in a course page carries data-ct="<section>.<field>", e.g. data-ct="faq.q3". The page stays its own
  template: `build` only replaces the text inside these elements, so layout, scripts and sitewide edits survive.
  Sheet row = Section | Field | Location (Both / Zürich / Winterthur) | Deutsch | English. A field has either ONE row "Both" or
  separate rows per location; a row for only one location means the element exists only there.
  Repeating fields can be added or removed in the sheet: Text n, Bullet n, Point n (+ Detail n), Question n + Answer n.
  A new one is cloned from its predecessor (n-1) on the page; a missing one is removed from the page.

Text markup in the sheet
  *gold*      accent colour             _underlined_   underlined link word (only where the page already uses it)
  line break  = line break in the cell
Not in the sheet (generated or functional): timetable block (#zeiten), coach cards (Team tab), trial form, review quotes and
counters, address line, navigation and footer. Elements with unknown inline markup are left alone and listed by `tag`.
"""
import glob, html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data', 'courses.json')
EN_SLUG = {'boxen': 'boxing', 'ringen': 'wrestling', 'fitness-kickboxen': 'fitness-kickboxing'}
DISCIPLINES = [('bjj', 'BJJ'), ('muay-thai', 'Muay Thai'), ('mma', 'MMA'), ('boxen', 'Boxing'), ('ringen', 'Wrestling'),
               ('fitness-kickboxen', 'Fitness Kickboxing'), ('street-defense', 'Street Defense'), ('personal-training', 'Personal Training'),
               ('little-ninjas', 'Little Ninjas')]
KIDS = ('little-ninjas',)   # different page template: sections without ids, extra element types (see TOKEN_KIDS)
LOCS = {'Zürich': 'zurich', 'Winterthur': 'winterthur'}
SECTION_LABEL = {'seo': 'SEO (Google)', 'hero': 'Hero', 'banner': 'Banner', 'sportart': 'About the sport', 'beweis': 'Reviews', 'ablauf': 'How the trial works',
                 'photos': 'Photo captions', 'anmelden': 'Sign-up block', 'warum': 'Why IMPACT', 'coach': 'Head coach block', 'gi': 'Extra block',
                 'app': 'IMPACT App', 'zeiten': 'Timetable block', 'faq': 'FAQ', 'final': 'Closing', 'benefits': 'Benefits', 'kurse': 'Age groups'}
FIELD_LABEL = {'title': 'Title', 'description': 'Description', 'headline': 'Headline', 'kicker': 'Kicker', 'heading': 'Title', 'sub': 'Subline', 'lead': 'Lead',
               'text': 'Text', 'bullet': 'Bullet', 'q': 'Question', 'a': 'Answer', 'h': 'Heading', 'detail': 'Detail', 'point': 'Point',
               'button': 'Button', 'caption': 'Caption', 'side': 'Side text', 'quote': 'Quote', 'who': 'Quote author', 'label': 'Label', 'link': 'Link text'}
REPEATABLE = ('text', 'bullet', 'point', 'detail', 'q', 'a')


def pages():
    """[(discipline slug, location label, lang, path)] for every existing adult course page."""
    out = []
    for slug, _ in DISCIPLINES:
        for loc, folder in LOCS.items():
            for lang, path in (('de', '%s/kurse/%s/index.html' % (folder, slug)), ('en', 'en/%s/classes/%s/index.html' % (folder, EN_SLUG.get(slug, slug)))):
                if os.path.exists(os.path.join(ROOT, path)):
                    out.append((slug, loc, lang, path))
    return out


# ---------------------------------------------------------------- text <-> html inside one element
SVG = r'<svg\b.*?</svg>'
PREFIX = re.compile(r'^(\s*(?:%s)?\s*)' % SVG, re.S)
SUFFIX = re.compile(r'(\s*(?:%s|<small\b.*)\s*)$' % SVG, re.S)


def split_inner(inner):
    pre = PREFIX.match(inner).group(1)
    rest = inner[len(pre):]
    m = SUFFIX.search(rest)
    suf = m.group(1) if m and m.group(1).strip() else ''
    if suf:
        rest = rest[:len(rest) - len(suf)]
    tail_ws = rest[len(rest.rstrip()):]; rest = rest.rstrip()
    if rest.startswith('<b>') and rest.endswith('</b>') and rest.count('<b>') == 1:   # whole text in one <b>: keep the wrapper out of the sheet
        return pre + '<b>', rest[3:-4], '</b>' + tail_ws + suf
    return pre, rest, tail_ws + suf


def to_text(h):
    flags, ac = set(), ''
    if '<span class="rw' in h:
        flags.add('rw')
        h = re.sub(r'<span class="rw accent">(.*?)</span>', r'<span class="accent">\1</span>', h, flags=re.S)
        h = re.sub(r'<span class="rw">(.*?)</span>', r'\1', h, flags=re.S)
        h = re.sub(r'</span>(\s+)<span class="accent">', r'\1', h)   # neighbouring accent words = one accent run
    m = re.search(r'<span class="(accent[^"]*)">', h)
    if m:
        ac = m.group(1)
    h = re.sub(r'<span class="accent[^"]*">(.*?)</span>', r'*\1*', h, flags=re.S)
    if '<span class="ulink">' in h:
        flags.add('ul'); h = re.sub(r'<span class="ulink">(.*?)</span>', r'_\1_', h, flags=re.S)
    if '<b>' in h:
        flags.add('b'); h = re.sub(r'<b>(.*?)</b>', r'**\1**', h, flags=re.S)
    h = re.sub(r'<br\s*/?>', '\n', h)
    if re.search(r'<[a-zA-Z/]', h):
        return None, flags, ac
    return html.unescape(h.replace('&shy;', '[-]')).replace('\xad', '[-]'), flags, ac


def to_html(text, flags, ac):
    t = html.escape(text.replace('\r', ''), quote=False).replace('[-]', '&shy;')   # [-] = soft hyphen (allowed break inside a long word)
    accent = ac or 'accent'
    if 'b' in flags:
        t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t, flags=re.S)
    if 'rw' in flags:
        out = []
        for part in re.split(r'(\*.+?\*)', t, flags=re.S):
            cls = 'rw accent' if part.startswith('*') and part.endswith('*') and len(part) > 1 else 'rw'
            words = (part[1:-1] if cls == 'rw accent' else part)
            out.append(re.sub(r'(\S+)', lambda m: '<span class="%s">%s</span>' % (cls, m.group(1)), words))
        t = ''.join(out)
    else:
        t = re.sub(r'\*(.+?)\*', lambda m: '<span class="%s">%s</span>' % (accent, m.group(1)), t, flags=re.S)
    if 'ul' in flags:
        t = re.sub(r'(?<![\w])_(.+?)_(?![\w])', r'<span class="ulink">\1</span>', t, flags=re.S)
    return t.replace('\n', '<br>')


# ---------------------------------------------------------------- finding elements
MASK = re.compile(r'<script\b.*?</script>|<style\b.*?</style>|<form\b.*?</form>|<section class="duosec".*?</section>|<section class="chapter" id="zeiten">.*?</section>'
                  r'|<div class="nameblock[^"]*">.*?</div>|<p class="cred">.*?</p>|<div id="testnote".*?</div>|<!--.*?-->', re.S)
TOKEN = re.compile(r'(?P<open><(?:section|header)\b[^>]*>)|(?P<close></(?:section|header)>)|(?P<band><div class="claimband">)|(?P<photo><div class="photo\b)'
                   r'|(?P<leaf><(?P<tag>h1|h2|h3|p|li|summary|small)\b(?P<attrs>[^>]*)>(?P<inner>.*?)</(?P=tag)>)'
                   r'|(?P<dleaf><div\b(?P<dattrs>[^>]*class="(?:idx|cap|vert)\b[^"]*"[^>]*)>(?P<dinner>(?:(?!<div\b).)*?)</div>)'
                   r'|(?P<point><div class="rev(?: [^"]*)?"(?P<pattrs>[^>]*)>(?P<pinner>\s*%s[^<]+)(?=<small\b))'
                   r'|(?P<cta><a\b(?P<cattrs>[^>]*class="cta"[^>]*)>(?P<cinner>.*?)</a>)' % SVG, re.S)

TOKEN_KIDS = re.compile(r'(?P<open><(?:section|header)\b[^>]*>)|(?P<close></(?:section|header)>)|(?P<band>\x00)|(?P<photo>\x00)'
                        r'|(?P<leaf><(?P<tag>h1|h2|h3|h4|p|summary|blockquote)\b(?P<attrs>[^>]*)>(?P<inner>.*?)</(?P=tag)>)'
                        r'|(?P<dleaf><(?:div|span)\b(?P<dattrs>[^>]*class="(?:idx|kick|age|who|go)\b[^"]*"[^>]*)>(?P<dinner>(?:(?!<div\b).)*?)</(?:div|span)>)'
                        r'|(?P<point>\x00)(?P<pattrs>)(?P<pinner>)'
                        r'|(?P<cta><a\b(?P<cattrs>[^>]*class="cta(?: [^"]*)?"[^>]*)>(?P<cinner>.*?)</a>)', re.S)
KIDS_SECTION = (('class="kidwhy"', 'benefits'), ('kidrev', 'beweis'), ('class="kidsgrid"', 'kurse'), ('id="kidsched"', 'zeiten'), ('kidfaq', 'faq'))


def region(s):
    a = s.find('<header class="hero')
    if a < 0:
        a = s.find('<header class="pagehero')
    b = s.find('<div class="floatcta"', a) if s.find('<div class="floatcta"', a) > 0 else s.find('<footer')
    b = min(b, s.find('<footer')) if s.find('<footer') > 0 else b
    if a < 0 or b < 0:
        sys.exit('FEHLER: hero/footer nicht gefunden')
    return a, b


def kind_of(tag, attrs, in_details):
    cls = (re.search(r'class="([^"]*)"', attrs) or [None, ''])[1].split()
    if tag == 'h1': return 'headline'
    if tag == 'h2': return 'heading'
    if tag in ('h3', 'h4'): return 'h'
    if tag == 'blockquote': return 'quote'
    if tag == 'summary': return 'q'
    if tag == 'li': return 'bullet'
    if tag == 'small': return 'detail'
    if tag == 'p': return 'a' if in_details else ('sub' if 'sub' in cls else 'lead' if 'lead' in cls else 'text')
    if tag == 'div': return ('kicker' if ('idx' in cls or 'kick' in cls) else 'caption' if 'cap' in cls else 'label' if 'age' in cls else 'who' if 'who' in cls
                             else 'link' if 'go' in cls else 'side')
    if tag == 'a': return 'button'
    if tag == 'point': return 'point'


def scan(s, kids=False):
    """Yields dicts for every editable element in document order (absolute positions in s)."""
    a, b = region(s); reg = s[a:b]
    masked = MASK.sub(lambda m: ' ' * len(m.group(0)), reg)
    sec, counters, out = None, {}, []
    for m in (TOKEN_KIDS if kids else TOKEN).finditer(masked):
        if m.group('open'):
            t = m.group('open'); i = re.search(r'id="([^"]*)"', t); c = re.search(r'class="([^"]*)"', t); cl = c.group(1).split() if c else []
            sec = i.group(1) if i else ('hero' if ('hero' in cl or 'pagehero' in cl) else 'final' if 'final' in cl else (cl[0] if cl else 'x'))
            if kids and not i and sec not in ('hero', 'final'):
                body = masked[m.start():masked.find('</section>', m.start())]
                sec = next((name for marker, name in KIDS_SECTION if marker in t or marker in body), sec)
            continue
        if m.group('close'):
            sec = None; continue
        if m.group('band'):
            sec = 'banner'; continue
        if m.group('photo'):
            if sec is None or sec == 'banner': sec = 'photos'
            continue
        if m.group('leaf'):
            tag, attrs, inner, g = m.group('tag'), m.group('attrs'), m.group('inner'), 'inner'
        elif m.group('dleaf'):
            tag, attrs, inner, g = 'div', m.group('dattrs'), m.group('dinner'), 'dinner'
            real = 'span' if m.group('dleaf').startswith('<span') else 'div'
        elif m.group('point'):
            tag, attrs, inner, g = 'point', m.group('pattrs'), m.group('pinner'), 'pinner'
        else:
            tag, attrs, inner, g = 'a', m.group('cattrs'), m.group('cinner'), 'cinner'
        if sec is None or not re.sub(r'<[^>]+>|\s', '', inner):
            continue
        in_details = masked.rfind('<details', 0, m.start()) > masked.rfind('</details>', 0, m.start())
        kind = kind_of(tag, attrs, in_details)
        out.append(dict(sec=sec, kind=kind, tag=tag, attrs=attrs, start=a + m.start(g), end=a + m.end(g), el_start=a + m.start(), el_end=a + m.end(),
                        attrs_pos=a + m.start() + 1 + len('div' if tag == 'point' else (real if m.group('dleaf') else tag))))
    # number the fields per section
    prev = None
    for e in out:
        k = (e['sec'], e['kind'])
        if e['kind'] == 'detail' and prev is not None and prev['kind'] == 'point' and prev['sec'] == e['sec']:
            e['n'] = prev['n']; counters[k] = max(counters.get(k, 0), e['n'])   # a detail carries the number of its point
        else:
            counters[k] = counters.get(k, 0) + 1; e['n'] = counters[k]
        prev = e
    single = {}
    for e in out:
        single[(e['sec'], e['kind'])] = max(single.get((e['sec'], e['kind']), 0), e['n'])
    for e in out:
        numbered = e['kind'] in REPEATABLE or e['kind'] == 'h' or single[(e['sec'], e['kind'])] > 1
        e['key'] = '%s.%s%s' % (e['sec'], e['kind'], e['n'] if numbered else '')
    keys = [e['key'] for e in out]
    dup = sorted({k for k in keys if keys.count(k) > 1})
    if dup:
        sys.exit('FEHLER: doppelte Feldnamen auf einer Seite: %s' % dup)
    return out


def key_parts(key):
    sec, f = key.split('.', 1); m = re.match(r'^([a-z]+?)(\d*)$', f)
    return sec, m.group(1), int(m.group(2)) if m.group(2) else 0


def label(key):
    sec, kind, n = key_parts(key)
    return SECTION_LABEL.get(sec, sec), FIELD_LABEL[kind] + (' %d' % n if n else '')


def key_from_labels(section, field):
    secs = {v.lower(): k for k, v in SECTION_LABEL.items()}; kinds = {v.lower(): k for k, v in FIELD_LABEL.items() if k != 'heading'}
    kinds['title'] = 'heading'
    sec = secs.get(section.strip().lower(), section.strip().lower())
    m = re.match(r'^\s*([A-Za-z ]+?)\s*(\d*)\s*$', field)
    if not m or m.group(1).lower() not in kinds:
        return None
    kind = kinds[m.group(1).lower()]
    if sec == 'seo':
        kind = {'heading': 'title'}.get(kind, kind)
    return '%s.%s%s' % (sec, kind, m.group(2))


# ---------------------------------------------------------------- tag
def tag_page(path, kids=False):
    f = os.path.join(ROOT, path); s = open(f, encoding='utf-8').read()
    els = scan(s, kids); skipped = []; edits = []
    for e in els:
        pre, mid, suf = split_inner(s[e['start']:e['end']])
        text, flags, ac = to_text(mid)
        same_words = text is not None and re.sub(r'<[^>]+>', '', to_html(text, flags, ac)) == re.sub(r'<[^>]+>', '', mid)
        same_meaning = text is not None and html.unescape(to_html(text, flags, ac)) == html.unescape(mid)   # &rarr; vs the arrow character etc.
        if text is None or (not same_meaning and not ('rw' in flags and same_words)):   # rw: word grouping may differ, text is identical
            skipped.append('%s <%s> %s' % (e['key'], e['tag'], re.sub(r'\s+', ' ', mid)[:70])); continue
        if 'data-ct=' in e['attrs']:
            continue
        add = ' data-ct="%s"' % e['key'] + (' data-ct-f="%s"' % ' '.join(sorted(flags)) if flags else '') + (' data-ct-ac="%s"' % ac if ac and ac != 'accent' else '')
        edits.append((e['attrs_pos'] + len(e['attrs']), add))
    for pos, add in sorted(edits, reverse=True):
        s = s[:pos] + add + s[pos:]
    open(f, 'w', encoding='utf-8').write(s)
    return len(edits), skipped


# ---------------------------------------------------------------- align numbering between the two locations (part of `tag`)
def align():
    """Gives equal repeatable items (questions, texts, bullets, points) the same number in Zürich and Winterthur, so that one row
    "Both" is enough. Items that exist only in one location keep a number of their own. Pure renaming of data-ct keys."""
    import difflib
    norm = lambda t: re.sub(r'Zürich|Zurich|Winterthur', '{C}', t or '')
    allp = pages()
    for slug, _ in DISCIPLINES:
        P = {(loc, lang): path for d, loc, lang, path in allp if d == slug}
        if ('Zürich', 'de') not in P or ('Winterthur', 'de') not in P:
            continue
        zh, wt = page_texts(P[('Zürich', 'de')]), page_texts(P[('Winterthur', 'de')])
        mapping = {}
        groups = {}
        for key in wt:
            sec, kind, n = key_parts(key)
            if kind in ('q', 'text', 'bullet', 'point'):
                groups.setdefault((sec, kind), []).append(key)
        for (sec, kind), wkeys in groups.items():
            zkeys = [k for k in zh if key_parts(k)[:2] == (sec, kind)]
            sm = difflib.SequenceMatcher(None, [norm(zh[k]) for k in zkeys], [norm(wt[k]) for k in wkeys], autojunk=False)
            used = {key_parts(k)[2] for k in zkeys}; matched = {}
            for blk in sm.get_matching_blocks():
                for i in range(blk.size):
                    matched[wkeys[blk.b + i]] = key_parts(zkeys[blk.a + i])[2]
            nxt = max(used | {0})
            for k in wkeys:
                if k in matched:
                    n = matched[k]
                else:
                    nxt += 1; n = nxt
                if n != key_parts(k)[2]:
                    mapping[k] = '%s.%s%d' % (sec, kind, n)
                    pair = {'q': 'a', 'point': 'detail'}.get(kind)
                    if pair:
                        mapping['%s.%s%d' % (sec, pair, key_parts(k)[2])] = '%s.%s%d' % (sec, pair, n)
        if not mapping:
            continue
        for lang in ('de', 'en'):
            path = P.get(('Winterthur', lang))
            if not path:
                continue
            f = os.path.join(ROOT, path); t = open(f, encoding='utf-8').read()
            if lang == 'en' and set(page_texts(path)) != set(wt):
                print('HINWEIS: %s hat andere Felder als die deutsche Seite - Nummern nicht angeglichen' % path); continue
            t = re.sub(r'data-ct="([^"]+)"', lambda m: 'data-ct="\x00%s"' % mapping[m.group(1)] if m.group(1) in mapping else m.group(0), t)
            open(f, 'w', encoding='utf-8').write(t.replace('data-ct="\x00', 'data-ct="'))
        print('%-20s Nummern angeglichen: %d Felder in Winterthur' % (slug, len(mapping)))


# ---------------------------------------------------------------- read tagged elements
CT = re.compile(r'<(?P<tag>[a-z0-9]+)\b(?P<attrs>[^>]*\sdata-ct="(?P<key>[^"]+)"[^>]*)>', re.S)


def tagged(s):
    out = []
    for m in CT.finditer(s):
        tag = m.group('tag'); close = '</%s>' % tag; end = s.find(close, m.end())
        attrs = m.group('attrs'); f = re.search(r'data-ct-f="([^"]*)"', attrs); ac = re.search(r'data-ct-ac="([^"]*)"', attrs)
        out.append(dict(key=m.group('key'), tag=tag, open_start=m.start(), start=m.end(), end=end, el_end=end + len(close),
                        flags=set(f.group(1).split()) if f else set(), ac=ac.group(1) if ac else ''))
    return out


def seo_get(s):
    t = re.search(r'<title>(.*?)</title>', s, re.S); d = re.search(r'<meta name="description" content="([^"]*)"', s)
    return html.unescape(t.group(1)) if t else '', html.unescape(d.group(1)) if d else ''


def page_texts(path):
    s = open(os.path.join(ROOT, path), encoding='utf-8').read(); out = {}
    title, desc = seo_get(s); out['seo.title'] = title; out['seo.description'] = desc
    for e in tagged(s):
        pre, mid, suf = split_inner(s[e['start']:e['end']]); text, _, _ = to_text(mid)
        out[e['key']] = text
    return out


# ---------------------------------------------------------------- extract
def extract():
    allp = pages(); disc = []
    for slug, tab in DISCIPLINES:
        texts = {(loc, lang): page_texts(path) for d, loc, lang, path in allp if d == slug}
        order = []
        for k in (('Zürich', 'de'), ('Winterthur', 'de'), ('Zürich', 'en'), ('Winterthur', 'en')):
            for key in texts.get(k, {}):
                if key not in order:
                    # keep document order: insert after the previous key of the same page if possible
                    keys = list(texts[k]); i = keys.index(key); prev = next((p for p in reversed(keys[:i]) if p in order), None)
                    order.insert(order.index(prev) + 1 if prev else len(order), key)
        rows = []
        for key in order:
            v = {loc: (texts.get((loc, 'de'), {}).get(key), texts.get((loc, 'en'), {}).get(key)) for loc in LOCS}
            locs = [l for l in LOCS if v[l][0] is not None or v[l][1] is not None]
            if len(locs) == 2 and v['Zürich'] == v['Winterthur']:
                rows.append(dict(key=key, location='Both', de=v['Zürich'][0] or '', en=v['Zürich'][1] or ''))
            else:
                for l in locs:
                    rows.append(dict(key=key, location=l, de=v[l][0] or '', en=v[l][1] or ''))
        for r in rows:
            r['section'], r['field'] = label(r['key'])
        disc.append(dict(slug=slug, tab=tab, rows=rows))
    json.dump({'ok': True, 'courses': disc}, open(DATA, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for d in disc:
        print('%-20s %3d Zeilen, davon Both %3d' % (d['tab'], len(d['rows']), sum(r['location'] == 'Both' for r in d['rows'])))


# ---------------------------------------------------------------- build
def unit_bounds(s, e):
    """The repeatable unit around an element: <details> for q/a, the point div (incl. its detail) for point/detail, else the element."""
    _, kind, _ = key_parts(e['key'])
    if kind in ('q', 'a'):
        a = s.rfind('<details', 0, e['open_start']); b = s.find('</details>', e['el_end']) + len('</details>')
        return a, b
    if kind == 'detail':
        a = s.rfind('<div', 0, e['open_start']); b = s.find('</div>', e['el_end']) + len('</div>')
        return a, b
    return e['open_start'], e['el_end']


def faq_jsonld(s, lang):
    qa = {}
    for e in tagged(s):
        sec, kind, n = key_parts(e['key'])
        if sec == 'faq' and kind in ('q', 'a'):
            qa.setdefault(n, {})[kind] = html.unescape(re.sub(r'<[^>]+>', '', s[e['start']:e['end']].replace('<br>', ' '))).strip()
    items = [qa[n] for n in sorted(qa) if 'q' in qa[n] and 'a' in qa[n]]

    def repl(m):
        try:
            d = json.loads(m.group(2))
        except Exception:
            return m.group(0)
        if d.get('@type') != 'FAQPage':
            return m.group(0)
        new = [{'@type': 'Question', 'name': i['q'], 'acceptedAnswer': {'@type': 'Answer', 'text': i['a']}} for i in items]
        if d.get('mainEntity') == new:
            return m.group(0)   # unchanged content: keep the original formatting
        d['mainEntity'] = new
        return m.group(1) + json.dumps(d, ensure_ascii=False) + m.group(3)
    return re.sub(r'(<script type="application/ld\+json">)(.*?)(</script>)', repl, s, flags=re.S)


def build_page(path, want, lang, problems):
    f = os.path.join(ROOT, path); s = open(f, encoding='utf-8').read(); orig = s
    have = {e['key'] for e in tagged(s)}
    if len([k for k in want if not k.startswith('seo.')]) < 0.6 * len(have):
        sys.exit('FEHLER: %s: das Sheet liefert nur %d von %d Feldern - sieht nach einem Lesefehler aus, Abbruch.' % (path, len(want), len(have)))
    # 1) remove repeatable units that are no longer in the sheet (from the end, so positions stay valid)
    for e in sorted(tagged(s), key=lambda e: -e['open_start']):
        sec, kind, n = key_parts(e['key'])
        if e['key'] not in want and kind in REPEATABLE and kind not in ('a', 'detail'):
            a, b = unit_bounds(s, e); s = s[:a] + s[b:]
    # 2) add new repeatable units by cloning the predecessor
    for key in sorted((k for k in want if k not in {e['key'] for e in tagged(s)} and not k.startswith('seo.')), key=lambda k: key_parts(k)):
        sec, kind, n = key_parts(key)
        if kind in ('a', 'detail'):
            continue   # created together with its question / point
        cands = [e for e in tagged(s) if key_parts(e['key'])[:2] == (sec, kind) and key_parts(e['key'])[2] < n] if kind in REPEATABLE else []
        prev = max(cands, key=lambda e: key_parts(e['key'])[2]) if cands else None
        if not prev:
            problems.append('%s: Feld "%s / %s" gibt es auf dieser Seite nicht und kann nicht automatisch angelegt werden' % (path, *label(key))); continue
        a, b = unit_bounds(s, prev); unit = s[a:b]
        pn = key_parts(prev['key'])[2]
        unit = re.sub(r'data-ct="%s\.(%s|a|detail)%d"' % (re.escape(sec), kind, pn), lambda m: 'data-ct="%s.%s%d"' % (sec, m.group(1), n), unit)
        s = s[:b] + unit + s[b:]
    # 3) write the texts
    for e in sorted(tagged(s), key=lambda e: -e['start']):
        if e['key'] not in want:
            continue
        pre, mid, suf = split_inner(s[e['start']:e['end']])
        new = to_html(want[e['key']], e['flags'], e['ac'])
        if html.unescape(new) != html.unescape(mid):   # rewrite only when the meaning changes (keeps entities like &rarr; as they were)
            s = s[:e['start']] + pre + new + suf + s[e['end']:]
    # 4) SEO + FAQ schema
    def meta(s, rx, value, quote):   # only rewrite when the meaning changes (keeps the original escaping otherwise)
        return re.sub(rx, lambda m: m.group(0) if html.unescape(m.group(2)) == value else m.group(1) + html.escape(value, quote=quote) + m.group(3), s, count=1, flags=re.S)
    if want.get('seo.title'):
        s = meta(s, r'(<title>)(.*?)(</title>)', want['seo.title'], False)
        s = meta(s, r'(<meta property="og:title" content=")([^"]*)(")', want['seo.title'], True)
    if want.get('seo.description'):
        s = meta(s, r'(<meta name="description" content=")([^"]*)(")', want['seo.description'], True)
        s = meta(s, r'(<meta property="og:description" content=")([^"]*)(")', want['seo.description'], True)
    s = faq_jsonld(s, lang)
    if s != orig:
        open(f, 'w', encoding='utf-8').write(s); return True
    return False


def build():
    data = json.load(open(DATA, encoding='utf-8'))
    by = {d['slug']: d for d in data['courses']}
    changed, problems = [], []
    for slug, loc, lang, path in pages():
        if slug not in by:
            continue
        want = {}
        for r in by[slug]['rows']:
            key = r.get('key') or key_from_labels(r.get('section', ''), r.get('field', ''))
            if not key:
                problems.append('%s: Zeile "%s / %s" nicht erkannt (Schreibweise von Section oder Field pruefen)' % (by[slug]['tab'], r.get('section'), r.get('field'))); continue
            if r['location'] in ('Both', loc) and (r.get(lang) or '').strip():
                want[key] = r[lang].strip('\n')
        if 'hero.headline' not in want:
            sys.exit('FEHLER: %s: Hero-Headline fehlt im Sheet - Abbruch.' % path)
        if build_page(path, want, lang, problems):
            changed.append(path)
    for p in problems:
        print('HINWEIS:', p)
    print('Kursseiten: %s' % (('geaendert: ' + ', '.join(changed)) if changed else 'Keine Aenderung.'))


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'build'
    if cmd == 'tag':
        total = 0
        for slug, loc, lang, path in pages():
            n, skipped = tag_page(path, slug in KIDS); total += n
            for x in skipped:
                print('nicht editierbar (bleibt wie es ist): %s  %s' % (path, x))
        print('markiert:', total)
        align()
    elif cmd == 'extract':
        extract()
    else:
        build()
