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
  **bold**, *italic*, [link text](https://...), bare https:// links become clickable.
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


def text_to_html(text):
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
            if re.match(r'^#{1,3}\s+', l):
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
    s = tpl
    s = sub1(r'<title>.*?</title>', '<title>%s | IMPACT Martial Arts</title>' % esc(title), s, 'title', path)
    s = sub1(r'<link rel="canonical" href="[^"]*">', '<link rel="canonical" href="%s/articles/%s/">' % (SITE, slug), s, 'canonical', path)
    s = sub1(r'<meta name="description" content="[^"]*">', '<meta name="description" content="%s">' % esc(desc), s, 'description', path)
    s = sub1(r'<h1 class="rev">.*?</h1>', '<h1 class="rev">%s</h1>' % esc(title), s, 'h1', path)
    s = sub1(r'<div class="artdate rev">.*?</div>', '<div class="artdate rev">%s</div>' % long_date(post['_date']), s, 'artdate', path)
    photo = '<div class="artphoto rev"><img src="%s" alt="%s"></div>' % (esc(img), esc(title)) if img else '<div class="artphoto rev" hidden></div>'
    s = sub1(r'<div class="artphoto rev"[^>]*>(?:<img [^>]*>)?</div>', photo, s, 'artphoto', path)
    s = sub1(r'<article class="artbody">.*?</article>', '<article class="artbody">%s</article>' % text_to_html(post['text']), s, 'artbody', path)
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
