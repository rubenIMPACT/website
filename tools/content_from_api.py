#!/usr/bin/env python3
"""Fetches the team from the Google Sheet "IMPACT Website Content" (tab "Team") via https://www.impact-martialarts.com/api/content
and writes data/team.json. Photos given as Google Drive or https links are downloaded once to assets/team/<name>.jpg (max. 1200 px wide).
Aborts without changing anything if the sheet cannot be read or returns fewer than 5 people."""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blog_from_api as B   # shared helpers: get() with retries, to_jpeg()

ROOT, SITE = B.ROOT, B.SITE
B.MAX_W = 1200


def slug(name):
    s = name.lower()
    for a, b in (('ä', 'ae'), ('ö', 'oe'), ('ü', 'ue'), ('ß', 'ss'), ('ã', 'a'), ('á', 'a'), ('é', 'e'), ('è', 'e'), ('ç', 'c'), ('ñ', 'n')):
        s = s.replace(a, b)
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')[:60]


def main():
    raw, _ = B.get(SITE + '/api/content?what=team&refresh=1')
    js = json.loads(raw)
    if not js.get('ok') or not isinstance(js.get('team'), list) or len(js['team']) < 5:
        sys.exit('FEHLER: Team-Tab nicht lesbar oder fast leer: %s' % str(js)[:200])
    for n in js.get('notes') or []:
        print('Hinweis aus dem Sheet:', n)
    old = {}
    try:
        old = {p['name']: p for p in json.load(open(os.path.join(ROOT, 'data', 'team.json'), encoding='utf-8'))['team']}
    except Exception:
        pass
    team = []
    for p in js['team']:
        src = (p.get('image') or '').strip(); prev = old.get(p['name'], {}); local = ''
        if src.startswith(SITE + '/assets/') or src.startswith('/assets/'):
            local = src.replace(SITE, '')
        elif src:
            local = '/assets/team/%s.jpg' % slug(p['name'])
            if not (prev.get('image') == src and prev.get('image_local') == local and os.path.exists(ROOT + local)):
                m = re.search(r'(?:/d/|[?&]id=)([-\w]{20,})', src) if 'google.com' in src else None
                try:
                    img, ctype = B.get(SITE + '/api/event-image?id=' + m.group(1) if m else src, tries=2, wait=10)
                    if not (ctype.startswith('image/') or img[:3] == b'\xff\xd8\xff' or img[:8] == b'\x89PNG\r\n\x1a\n'):
                        raise ValueError('kein Bild (%s)' % ctype)
                    os.makedirs(os.path.dirname(ROOT + local), exist_ok=True)
                    open(ROOT + local, 'wb').write(B.to_jpeg(img)); print('Foto geladen:', local)
                except Exception as e:
                    local = prev.get('image_local') or ''
                    print('WARNUNG: Foto fuer %s nicht ladbar (%s) - %s.' % (p['name'], e, 'bisheriges Foto bleibt' if local else 'Person wird uebersprungen'))
        if not local:
            local = prev.get('image_local') or ''
        if not local:
            print('WARNUNG: %s hat kein Foto und erscheint deshalb nicht.' % p['name']); continue
        q = dict(p); q['image_local'] = local; team.append(q)
    if len(team) < 5:
        sys.exit('FEHLER: weniger als 5 Personen mit Foto - Abbruch.')
    json.dump({'ok': True, 'team': team}, open(os.path.join(ROOT, 'data', 'team.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('data/team.json: %d Personen' % len(team))


if __name__ == '__main__':
    main()
