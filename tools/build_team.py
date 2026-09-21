#!/usr/bin/env python3
"""Builds every place where team members appear from data/team.json
(written by tools/content_from_api.py from the Google Sheet "IMPACT Website Content", tab "Team").

One row in the sheet = one person. This script rewrites
  - the team cards + the bio overlay data (<script id="trbios">) on the 12 card pages
    (team pages, city pages, about pages, home pages; German and English),
  - the coach cards inside <section class="duosec" id="coach"> on the course pages (photo, role, summary, bio).
    WHO coaches a course and in which order is kept in data/coach-lineups.json (page -> list of names; created once from the
    pages on 21.09.2026, moves to the course tabs of the sheet later). A person who is not online is left out of the page but
    stays in the lineup file, so ticking "Website" again brings the coach card back.
Not touched: the hand-made head coach block on the BJJ pages (<section class="coachsec">).
Idempotent: running it twice changes nothing.

Rules
  Location  Both / Zürich / Winterthur  -> which city and team pages show the person
  Homepage  tick                        -> shown on the two home pages
  Founder   tick                        -> shown in the "Founders" block of the about pages (everyone else in the team block)
  Order     number                      -> position everywhere (small first)
  Bio empty                             -> card without overlay (class "nobio")
  Summary empty                         -> the first bio paragraph is the summary on course pages, the rest opens behind the button
"""
import glob, html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCS = ('Both', 'Zürich', 'Winterthur')


def esc(s):
    return html.escape(s, quote=False)


def paras(text):
    return [re.sub(r'\s*\n\s*', ' ', p).strip() for p in re.split(r'\n\s*\n', (text or '').replace('\r', '').strip()) if p.strip()]


def load():
    data = json.load(open(os.path.join(ROOT, 'data', 'team.json'), encoding='utf-8'))
    team = [p for p in data['team'] if p.get('website', True)]
    if len(team) < 5:
        sys.exit('FEHLER: weniger als 5 Personen in data/team.json - sieht nach einem Lesefehler aus, Abbruch.')
    seen = set()
    for p in team:
        for k in ('name', 'role_de', 'role_en'):
            if not str(p.get(k) or '').strip():
                sys.exit('FEHLER: Person ohne %s: %r' % (k, p.get('name')))
        if p['name'] in seen:
            sys.exit('FEHLER: Name doppelt: %r' % p['name'])
        if p.get('location') not in LOCS:
            sys.exit('FEHLER: Location ungueltig bei %r: %r' % (p['name'], p.get('location')))
        seen.add(p['name'])
    team.sort(key=lambda p: (float(p.get('order') or 999), p['name']))
    return team


def card(p, lang):
    hl = p.get('highlight_' + lang) or ''
    nobio = not paras(p.get('bio_' + lang))
    return '<div class="trcard rev%s"><img loading="lazy" src="%s" alt="%s"><span class="tm"><b>%s</b><i>%s</i>%s</span></div>' % (
        ' nobio' if nobio else '', html.escape(p['image_local']), html.escape(p['name']), esc(p['name']), esc(p['role_' + lang]),
        '<em>%s</em>' % esc(hl) if hl else '')


def duocard(p, lang, btn):
    first, _, rest = p['name'].partition(' ')
    bio = paras(p.get('bio_' + lang)); summ = (p.get('summary_' + lang) or '').strip()
    if not summ and bio:
        summ, bio = bio[0], bio[1:]
    more = '<button class="biobtn" type="button">%s</button><div class="biofull">%s</div>' % (btn, ''.join('<p>%s</p>' % esc(x) for x in bio)) if bio else ''
    return '<div class="duocard rev"><div class="photo"><img src="%s" alt="%s" loading="lazy"></div><h3>%s<span>%s</span></h3><div class="role">%s</div><p class="sum">%s</p>%s</div>' % (
        html.escape(p['image_local']), html.escape(p['name']), esc(first), esc(rest), esc(p['role_' + lang]), esc(summ), more)


CARD_RUN = re.compile(r'(?:<div class="trcard[^"]*"[^>]*>.*?</div>(\n?))+', re.S)


def build_cards(path, groups, lang, changed):
    """groups = one list of people per card grid on the page, in page order."""
    f = os.path.join(ROOT, path); s = open(f, encoding='utf-8').read()
    runs = list(CARD_RUN.finditer(s))
    if len(runs) != len(groups):
        sys.exit('FEHLER: %s hat %d Kartenbloecke, erwartet %d' % (path, len(runs), len(groups)))
    out, pos, shown = [], 0, []
    for m, people in zip(runs, groups):
        sep = '\n' if '</div>\n<div class="trcard' in m.group(0) else ''
        tail = '\n' if m.group(0).endswith('\n') else ''
        out.append(s[pos:m.start()]); out.append(sep.join(card(p, lang) for p in people) + tail); pos = m.end(); shown += people
    out.append(s[pos:]); s2 = ''.join(out)
    bios = {p['name']: paras(p.get('bio_' + lang)) for p in shown if paras(p.get('bio_' + lang))}
    s2, n = re.subn(r'(<script id="trbios" type="application/json">).*?(</script>)', lambda m: m.group(1) + json.dumps(bios, ensure_ascii=False).replace('</', '<\\/') + m.group(2), s2, count=1, flags=re.S)
    if n != 1:
        sys.exit('FEHLER: trbios fehlt in ' + path)
    if s2 != s:
        open(f, 'w', encoding='utf-8').write(s2); changed.append(path)


DUOSEC = re.compile(r'(<section class="duosec" id="coach">.*?<div class="duogrid">)(.*?)(</div></section>)', re.S)
HEAD = {'de': ('Dein ', 'Coach.', 'Deine ', 'Coaches.'), 'en': ('Your ', 'Coach.', 'Your ', 'Coaches.')}


LINEUPS = os.path.join(ROOT, 'data', 'coach-lineups.json')


def page_names(path):
    m = DUOSEC.search(open(os.path.join(ROOT, path), encoding='utf-8').read())
    return [html.unescape(x) for x in re.findall(r'<div class="photo"><img src="[^"]*" alt="([^"]*)"', m.group(2))] if m else None


def load_lineups(course_pages):
    lineups = json.load(open(LINEUPS, encoding='utf-8')) if os.path.exists(LINEUPS) else {}
    new = False
    for path in course_pages:
        if path not in lineups:
            names = page_names(path)
            if names:
                lineups[path] = names; new = True
    if new:
        json.dump(lineups, open(LINEUPS, 'w', encoding='utf-8'), ensure_ascii=False, indent=1, sort_keys=True)
    return lineups


def build_course(path, byname, lang, changed, lineups):
    f = os.path.join(ROOT, path); s = open(f, encoding='utf-8').read()
    m = DUOSEC.search(s)
    if not m or path not in lineups:
        return
    names = lineups[path]
    btn = (re.search(r'<button class="biobtn"[^>]*>(.*?)</button>', s) or [None, 'Erfahre mehr' if lang == 'de' else 'Learn more'])[1]
    keep = [byname[n] for n in names if n in byname]
    if not keep:
        print('WARNUNG: %s haette keinen Coach mehr - Seite nicht veraendert.' % path); return
    head = m.group(1)
    one = HEAD[lang]
    head = re.sub(r'<h2 class="rev">[^<]*<span class="accent">[^<]*</span></h2>', '<h2 class="rev">%s<span class="accent">%s</span></h2>' % ((one[0], one[1]) if len(keep) == 1 else (one[2], one[3])), head, count=1)
    s2 = s[:m.start()] + head + ''.join(duocard(p, lang, btn) for p in keep) + m.group(3) + s[m.end():]
    if s2 != s:
        open(f, 'w', encoding='utf-8').write(s2); changed.append(path)


def main():
    team = load(); byname = {p['name']: p for p in team}; changed = []
    zh = [p for p in team if p['location'] in ('Both', 'Zürich')]
    wt = [p for p in team if p['location'] in ('Both', 'Winterthur')]
    home = [p for p in team if p.get('homepage')]
    about = [[p for p in team if not p.get('founder')], [p for p in team if p.get('founder')]]
    for pre, lang in (('', 'de'), ('en/', 'en')):
        build_cards(pre + 'zurich/team/index.html', [zh], lang, changed)
        build_cards(pre + 'zurich/index.html', [zh], lang, changed)
        build_cards(pre + 'winterthur/team/index.html', [wt], lang, changed)
        build_cards(pre + 'winterthur/index.html', [wt], lang, changed)
        build_cards(pre + 'index.html', [home], lang, changed)
        build_cards(pre + ('ueber-uns' if lang == 'de' else 'about') + '/index.html', about, lang, changed)
    de = [os.path.relpath(f, ROOT) for f in sorted(glob.glob(os.path.join(ROOT, '*/kurse/*/index.html')))]
    en = [os.path.relpath(f, ROOT) for f in sorted(glob.glob(os.path.join(ROOT, 'en/*/classes/*/index.html')))]
    lineups = load_lineups(de + en)
    for path in de:
        build_course(path, byname, 'de', changed, lineups)
    for path in en:
        build_course(path, byname, 'en', changed, lineups)
    print('Team: %d Personen online. %s' % (len(team), ('Geaendert: ' + ', '.join(changed)) if changed else 'Keine Aenderung.'))


if __name__ == '__main__':
    main()
