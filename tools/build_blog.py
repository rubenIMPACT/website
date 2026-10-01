#!/usr/bin/env python3
"""Builds the blog (/articles/) from data/blog.json (written by tools/blog_from_api.py from the Google Sheet "IMPACT Blog").

One row in the sheet = one post. This script
  - writes/updates articles/<slug>/index.html (an existing article page is its own template, so sitewide edits survive;
    a new post is cloned from the newest existing article page),
  - removes article pages whose row is no longer ticked "Website",
  - rebuilds the card list in articles/index.html (newest first),
  - keeps sitemap.xml in sync.
Idempotent: running it twice changes nothing.

Text format of the sheet column "Text":
  blank line = new paragraph, single line break = line break,
  "# Heading" = subheading, "- item" = bullet list,
  **bold**, *italic*, [link text](https://...), bare https:// links become clickable,
  "![caption](photo link)" on its own line = photo in the text; two photo lines in a row = two photos side by side
  (the photo is downloaded by tools/blog_from_api.py; a photo that cannot be loaded is left out).
"""
import html, json, os, re, shutil, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, 'articles')
SITE = 'https://www.impact-martialarts.com'
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']


def esc(s):
    return html.escape(s, quote=True)


def inline(s):
    """Inline markup -> HTML. Input is plain text from the sheet."""
    out, pos = [], 0
    # links first, so their URLs are not touched by the emphasis rules
    for m in re.finditer(r'\[([^\]]+)\]\((https?://[^\s)]+)\)|(https?://[^\s<]+[^\s<.,;:!?)])', s):
        out.append(emph(s[pos:m.start()]))
        if m.group(1):
            out.append('<a href="%s" target="_blank" rel="noopener">%s</a>' % (esc(m.group(2)), emph(m.group(1))))
        else:
            out.append('<a href="%s" target="_blank" rel="noopener">%s</a>' % (esc(m.group(3)), esc(m.group(3))))
        pos = m.end()
    out.append(emph(s[pos:]))
    return ''.join(out)


def emph(s):
    s = esc(s)
    s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s, flags=re.S)
    s = re.sub(r'(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)', r'<em>\1</em>', s, flags=re.S)
    return s


IMG_LINE = re.compile(r'^!\[([^\]]*)\]\((https?://[^\s)]+)\)\s*$')
ARTFIG_CSS = ('<style>/*artfig*/.artbody .artfig{margin:30px 0 34px;display:grid;gap:10px}'
              '.artbody .artfig img{width:100%;display:block;object-fit:cover}'
              '.artbody .artfig.n2{grid-template-columns:1fr 1fr}.artbody .artfig.n2 img{aspect-ratio:3/2;height:100%}'
              '.artbody .artfig figcaption{grid-column:1/-1;color:#8a867b;font-size:13px;letter-spacing:.5px;margin-top:2px}'
              '@media(min-width:900px){.artbody .artfig.n2{width:min(980px,calc(100vw - 2*var(--mx)))}}'
              '@media(max-width:600px){.artbody .artfig.n2{grid-template-columns:1fr}}</style>')


# Article layout in the style of the newsletter (01.10.2026): cream card on a beige page, photo with gold bars on top,
# date label + two-tone title (part after ":" in gold), Anton headings, Lora text, photos across the full card width.
ARTCARD_HEAD = ('<link href="https://fonts.googleapis.com/css2?family=Anton&family=Lora:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">'
                '<style>/*artcard*/'
                '.navwrap nav,.navwrap.scrolled nav{background:#000}'
                '.artpage{background:#f0ece4;padding:150px 0 80px}'
                '.artcard{max-width:720px;margin:0 auto;background:#faf8f4;color:#2a2a2a}'
                '.artcard .artphoto{margin:0;max-width:none;border-top:6px solid #c6b659;border-bottom:6px solid #c6b659}'
                '.artcard .artphoto[hidden]{display:none}'
                '.artcard .artphoto img{max-height:620px}'
                '.arthead{padding:44px 52px 4px}'
                '.arthead .artdate{margin:0 0 10px;padding:0;color:#c6b659;font-size:11px;font-weight:700;letter-spacing:3.5px;text-transform:uppercase}'
                '.arthead h1{font-family:Anton,Impact,sans-serif;font-weight:400;font-size:clamp(30px,4.4vw,40px);line-height:1.15;'
                'letter-spacing:1px;color:#111;text-transform:uppercase;max-width:none;margin:0}'
                '.arthead h1 .gold{color:#c6b659}'
                '.artcard .artbody{max-width:none;padding:22px 0 60px;font-family:Lora,Georgia,serif;font-weight:400}'
                '.artcard .artbody>p,.artcard .artbody>ul,.artcard .artbody>ol,.artcard .artbody>h2,.artcard .artbody>h3{margin-left:52px;margin-right:52px}'
                '.artcard .artbody p{color:#2a2a2a;font-size:18.5px;line-height:1.78;margin-top:0;margin-bottom:16px}'
                '.artcard .artbody li{color:#2a2a2a;font-size:18px;line-height:1.7}'
                '.artcard .artbody ul,.artcard .artbody ol{padding-left:22px}'
                '.artcard .artbody h2,.artcard .artbody h3{font-family:Anton,Impact,sans-serif;font-weight:400;color:#111;'
                'font-size:clamp(26px,3.4vw,34px);line-height:1.15;letter-spacing:1px;text-transform:uppercase;margin-top:44px;margin-bottom:16px}'
                '.artcard .artbody strong,.artcard .artbody b{color:#111}'
                '.artcard .artbody a{color:#8c7a1e;text-decoration:underline}'
                '.artcard .artbody .artfig{margin:44px 0 0;gap:4px}'
                '.artcard .artbody .artfig.n2{width:auto}'
                '.artcard .artbody .artfig+h2,.artcard .artbody .artfig+h3{margin-top:40px}'
                '.artcard .artbody .artfig figcaption{display:none}'
                '@media(max-width:700px){.artpage{padding:90px 0 40px}.arthead{padding:30px 22px 2px}'
                '.artcard .artbody>p,.artcard .artbody>ul,.artcard .artbody>ol,.artcard .artbody>h2,.artcard .artbody>h3{margin-left:22px;margin-right:22px}'
                '.artcard .artbody p{font-size:17px;line-height:1.72}}'
                '</style>')
OLD_LAYOUT = re.compile(r'<section class="pagehead"><div class="kick rev">[^<]*</div>(<h1 class="rev">.*?</h1>)</section>'
                        r'(<div class="artdate rev">.*?</div>)\s*(<div class="artphoto rev"[^>]*>(?:<img [^>]*>)?</div>)\s*'
                        r'(<article class="artbody">.*?</article>)', re.S)


def card_layout(s, path):
    """Old article page layout -> newsletter-style card (once; afterwards the page keeps the card)."""
    if 'class="artcard"' not in s:
        s, n = OLD_LAYOUT.subn(lambda m: '<main class="artpage"><div class="artcard">%s<header class="arthead">%s%s</header>%s</div></main>'
                               % (m.group(3), m.group(2), m.group(1), m.group(4)), s, count=1)
        if n != 1:
            sys.exit('FEHLER: Artikel-Layout nicht erkannt in %s' % path)
    if '/*artcard*/' not in s:
        s = sub1(r'</head>', ARTCARD_HEAD + '</head>', s, '</head>', path)
    return s


def title_html(title):
    """'Part one: part two' -> part two in gold, as in the newsletter."""
    a, sep, b = title.partition(':')
    if sep and a.strip() and b.strip():
        return '%s:<br><span class="gold">%s</span>' % (esc(a.strip()), esc(b.strip()))
    return esc(title)


def figure(items, images, title):
    """items = [(caption, url)] of consecutive photo lines -> <figure>. Photos without a downloaded copy are skipped."""
    imgs = [(c, images[u]) for c, u in items if images.get(u)]
    if not imgs:
        return ''
    caps = []
    for c, _ in imgs:
        if c.strip() and c.strip() not in caps:
            caps.append(c.strip())
    tags = ''.join('<img src="%s" alt="%s" loading="lazy">' % (esc(src), esc(c.strip() or title)) for c, src in imgs)
    cap = '<figcaption>%s</figcaption>' % ' · '.join(esc(c) for c in caps) if caps else ''
    return '<figure class="artfig n%d">%s%s</figure>' % (min(len(imgs), 2), tags, cap)


def text_to_html(text, images=None, title=''):
    images = images or {}
    text = (text or '').replace('\r\n', '\n').replace('\r', '\n').strip()
    blocks = re.split(r'\n\s*\n', text) if text else []
    out = []
    for b in blocks:
        lines = [l.rstrip() for l in b.split('\n') if l.strip()]
        if not lines:
            continue
        i = 0
        para = []

        def flush():
            if para:
                out.append('<p>' + '<br>'.join(inline(x) for x in para) + '</p>')
                del para[:]
        while i < len(lines):
            l = lines[i]
            if IMG_LINE.match(l):
                flush(); items = []
                while i < len(lines) and IMG_LINE.match(lines[i]):
                    m = IMG_LINE.match(lines[i]); items.append((m.group(1), m.group(2))); i += 1
                for k in range(0, len(items), 2):
                    out.append(figure(items[k:k + 2], images, title))
            elif re.match(r'^#{1,3}\s+', l):
                flush(); out.append('<h3>' + inline(re.sub(r'^#{1,3}\s+', '', l)) + '</h3>'); i += 1
            elif re.match(r'^[-•]\s+', l):
                flush(); items = []
                while i < len(lines) and re.match(r'^[-•]\s+', lines[i]):
                    items.append('<li>' + inline(re.sub(r'^[-•]\s+', '', lines[i])) + '</li>'); i += 1
                out.append('<ul>' + ''.join(items) + '</ul>')
            else:
                para.append(l); i += 1
        flush()
    return ''.join(out)


def slugify(title):
    s = title.lower()
    for a, b in (('ä', 'ae'), ('ö', 'oe'), ('ü', 'ue'), ('ß', 'ss'), ('é', 'e'), ('è', 'e'), ('à', 'a'), ('ç', 'c')):
        s = s.replace(a, b)
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s[:80].strip('-')


def parse_date(v):
    v = str(v or '').strip()
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})', v) or None
    if m:
        return datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    m = re.match(r'^(\d{1,2})\.(\d{1,2})\.(\d{4})$', v)
    if m:
        return datetime.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    raise ValueError('date not readable: %r' % v)


def long_date(d):
    return '%s %d, %d' % (MONTHS[d.month - 1], d.day, d.year)


def short_date(d):
    return '%d %s' % (d.day, MONTHS[d.month - 1][:3])


def sub1(pattern, repl, s, what, path):
    new, n = re.subn(pattern, lambda m: repl, s, count=1, flags=re.S)
    if n != 1:
        sys.exit('FEHLER: %s nicht gefunden in %s' % (what, path))
    return new


def render_page(tpl, post, path):
    title, slug = post['title'], post['slug']
    desc = post.get('description') or (title + ' – Artikel von IMPACT Martial Arts.')
    img = post.get('image_local') or ''
    s = card_layout(tpl, path)
    s = sub1(r'<title>.*?</title>', '<title>%s | IMPACT Martial Arts</title>' % esc(title), s, 'title', path)
    s = sub1(r'<link rel="canonical" href="[^"]*">', '<link rel="canonical" href="%s/articles/%s/">' % (SITE, slug), s, 'canonical', path)
    s = sub1(r'<meta name="description" content="[^"]*">', '<meta name="description" content="%s">' % esc(desc), s, 'description', path)
    s = sub1(r'<h1 class="rev">.*?</h1>', '<h1 class="rev">%s</h1>' % title_html(title), s, 'h1', path)
    s = sub1(r'<div class="artdate rev">.*?</div>', '<div class="artdate rev">%s</div>' % long_date(post['_date']), s, 'artdate', path)
    photo = '<div class="artphoto rev"><img src="%s" alt="%s"></div>' % (esc(img), esc(title)) if img else '<div class="artphoto rev" hidden></div>'
    s = sub1(r'<div class="artphoto rev"[^>]*>(?:<img [^>]*>)?</div>', photo, s, 'artphoto', path)
    s = sub1(r'<article class="artbody">.*?</article>', '<article class="artbody">%s</article>' % text_to_html(post['text'], post.get('images'), title), s, 'artbody', path)
    if '/*artfig*/' not in s:
        s = sub1(r'</head>', ARTFIG_CSS + '</head>', s, '</head>', path)
    return s


def main():
    data = json.load(open(os.path.join(ROOT, 'data', 'blog.json'), encoding='utf-8'))
    posts = data['posts']
    if not posts:
        sys.exit('FEHLER: keine Posts in data/blog.json - Abbruch, nichts veraendert.')
    seen = set()
    for p in posts:
        for k in ('slug', 'title', 'date', 'text'):
            if not str(p.get(k) or '').strip():
                sys.exit('FEHLER: Post ohne %s: %r' % (k, p.get('title') or p.get('slug')))
        if not re.match(r'^[a-z0-9-]+$', p['slug']) or p['slug'] in seen:
            sys.exit('FEHLER: Slug ungueltig oder doppelt: %r' % p['slug'])
        seen.add(p['slug']); p['_date'] = parse_date(p['date'])
    posts.sort(key=lambda p: (p['_date'], p['slug']), reverse=True)

    existing = sorted(d for d in os.listdir(ART) if os.path.isfile(os.path.join(ART, d, 'index.html')))
    if not existing:
        sys.exit('FEHLER: keine bestehende Artikelseite als Vorlage gefunden.')
    # template for new posts = first existing article page (deterministic; every article page gets the same sitewide edits)
    tpl_default = open(os.path.join(ART, existing[0], 'index.html'), encoding='utf-8').read()

    changed = []
    for p in posts:
        path = os.path.join(ART, p['slug'], 'index.html')
        old = open(path, encoding='utf-8').read() if os.path.exists(path) else None
        new = render_page(old or tpl_default, p, path)
        if new != old:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            open(path, 'w', encoding='utf-8').write(new); changed.append(('neu ' if old is None else 'geaendert ') + p['slug'])
    removed = [d for d in existing if d not in seen]
    if len(removed) > 2 and len(removed) >= len(existing) / 2:
        sys.exit('FEHLER: %d von %d Artikeln wuerden geloescht - sieht nach einem Lesefehler aus, Abbruch.' % (len(removed), len(existing)))
    for d in removed:
        shutil.rmtree(os.path.join(ART, d)); changed.append('entfernt ' + d)

    # index cards
    ipath = os.path.join(ART, 'index.html'); idx = open(ipath, encoding='utf-8').read()
    cards = '\n'.join('<a class="cardrow artrow rev" href="/articles/%s/"><div><small>%s</small><h3>%s</h3></div><div class="arr">&rarr;</div></a>'
                      % (p['slug'], short_date(p['_date']), esc(p['title'])) for p in posts)
    new_idx, n = re.subn(r'(<div class="cardlist"[^>]*>\n)(?:<a class="cardrow artrow rev".*?</a>\n)*(</div></section>)', lambda m: m.group(1) + cards + '\n' + m.group(2), idx, count=1, flags=re.S)
    if n != 1:
        sys.exit('FEHLER: Kartenliste in articles/index.html nicht gefunden')
    if new_idx != idx:
        open(ipath, 'w', encoding='utf-8').write(new_idx); changed.append('geaendert index')

    # sitemap
    spath = os.path.join(ROOT, 'sitemap.xml'); sm = open(spath, encoding='utf-8').read()
    entries = re.findall(r'<url><loc>.*?</url>\n?', sm, flags=re.S)
    is_art = lambda e: re.search(r'<loc>%s/articles/' % re.escape(SITE), e) is not None
    first = next(i for i, e in enumerate(entries) if is_art(e))
    proto = next(e for e in entries if '/articles/</loc>' in e)
    block = [(p['slug'], re.sub(r'<loc>[^<]*</loc>', '<loc>%s/articles/%s/</loc>' % (SITE, p['slug']), proto, count=1)) for p in posts] + [('index.html', proto)]
    block.sort(key=lambda t: t[0])  # same order as the file paths, as before
    others = [e for e in entries if not is_art(e)]
    before = len([e for e in entries[:first] if not is_art(e)])
    keep = others[:before] + [e for _, e in block] + others[before:]
    head, tail = sm[:sm.find(entries[0])], sm[sm.rfind(entries[-1]) + len(entries[-1]):]
    new_sm = head + ''.join(e if e.endswith('\n') else e + '\n' for e in keep) + tail
    if new_sm != sm:
        open(spath, 'w', encoding='utf-8').write(new_sm); changed.append('geaendert sitemap')

    print('Blog: %d Posts. %s' % (len(posts), '; '.join(changed) if changed else 'Keine Aenderung.'))


if __name__ == '__main__':
    main()
