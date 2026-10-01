#!/usr/bin/env python3
"""Fetches the blog posts from the Google Sheet "IMPACT Blog" (via https://www.impact-martialarts.com/api/blog) and writes
data/blog.json. Photos (Google Drive link or any https link in the sheet) are downloaded once to assets/blog/<slug>.jpg, so the
pages stay static and fast. Aborts without changing anything if the sheet cannot be read or returns no posts."""
import hashlib, io, json, os, re, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://www.impact-martialarts.com'
UA = {'User-Agent': 'Mozilla/5.0 (blog-sync)', 'Accept': '*/*'}  # same style as plan-sync; a full Chrome UA from a GitHub runner made the first request hang for 2 minutes (21.09.2026)
MAX_W = 1600


def get(url, tries=3, wait=15):
    err = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return r.read(), r.headers.get('Content-Type', '')
        except Exception as e:  # noqa
            err = e; print('Versuch %d fehlgeschlagen (%s): %s' % (i + 1, url.split('?')[0], e), flush=True)
            if i < tries - 1:
                time.sleep(wait)
    raise err


def to_jpeg(raw):
    """Resize to MAX_W and re-encode as JPEG (strips EXIF). Without Pillow the bytes are kept as they are."""
    try:
        from PIL import Image, ImageOps
    except Exception:
        return raw
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert('RGB')
    if im.width > MAX_W:
        im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
    out = io.BytesIO(); im.save(out, 'JPEG', quality=84, optimize=True, progressive=True)
    return out.getvalue()


def fetch_photo(src, local):
    """Downloads one photo (Google Drive link via /api/event-image, or any https link) to ROOT+local as JPEG. Raises on failure."""
    m = re.search(r'(?:/d/|[?&]id=)([-\w]{20,})', src) if 'google.com' in src else None
    url = SITE + '/api/event-image?id=' + m.group(1) if m else src
    raw_img, ctype = get(url, tries=4, wait=20)  # the image service answers 502 now and then on a cold start (30.09.2026)
    if not (ctype.startswith('image/') or raw_img[:3] == b'\xff\xd8\xff' or raw_img[:8] == b'\x89PNG\r\n\x1a\n'):
        raise ValueError('kein Bild (%s)' % ctype)
    os.makedirs(os.path.dirname(ROOT + local), exist_ok=True)
    open(ROOT + local, 'wb').write(to_jpeg(raw_img)); print('Bild geladen:', local)


def text_photos(slug, text, prev):
    """Photo lines (a photo link alone on a line, or "![caption](link)") in the text -> {link: /assets/blog/<slug>-<hash>.jpg}. Links that cannot be loaded are left out."""
    out, before = {}, prev.get('images') or {}
    found = re.findall(r'^\s*(?:!\[[^\]]*\]\((https?://[^\s)]+)\)|(https?://drive\.google\.com/file/d/[-\w]+\S*|https?://\S+\.(?:jpe?g|png|webp)(?:\?\S*)?))\s*$',
                       text or '', flags=re.M | re.I)
    for src in (a or b for a, b in found):
        if src in out:
            continue
        local = '/assets/blog/%s-%s.jpg' % (slug[:50], hashlib.sha1(src.encode()).hexdigest()[:8])
        if before.get(src) == local and os.path.exists(ROOT + local):
            out[src] = local; continue
        try:
            fetch_photo(src, local); out[src] = local
        except Exception as e:
            print('WARNUNG: Foto im Text von %s nicht ladbar (%s) - wird weggelassen.' % (slug, e))
    return out


def main():
    raw, _ = get(SITE + '/api/blog?refresh=1')
    js = json.loads(raw)
    if not js.get('ok') or not isinstance(js.get('posts'), list) or not js['posts']:
        sys.exit('FEHLER: Blog-Sheet nicht lesbar oder leer: %s' % str(js)[:200])
    for n in js.get('notes') or []:
        print('Hinweis aus dem Sheet:', n)
    old = {}
    try:
        old = {p['slug']: p for p in json.load(open(os.path.join(ROOT, 'data', 'blog.json'), encoding='utf-8'))['posts']}
    except Exception:
        pass
    posts = []
    for p in js['posts']:
        src = (p.get('image') or '').strip(); local = ''
        prev = old.get(p['slug'], {})
        if src.startswith(SITE + '/assets/') or src.startswith('/assets/'):
            local = src.replace(SITE, '')
        elif src:
            local = '/assets/blog/%s.jpg' % p['slug'][:60]
            have = prev.get('image') == src and prev.get('image_local') == local and os.path.exists(ROOT + local)
            if not have:
                m = re.search(r'(?:/d/|[?&]id=)([-\w]{20,})', src) if 'google.com' in src else None
                url = SITE + '/api/event-image?id=' + m.group(1) if m else src
                try:
                    raw_img, ctype = get(url, tries=2, wait=10)
                    if not (ctype.startswith('image/') or raw_img[:3] == b'\xff\xd8\xff' or raw_img[:8] == b'\x89PNG\r\n\x1a\n'):
                        raise ValueError('kein Bild (%s)' % ctype)
                    os.makedirs(os.path.dirname(ROOT + local), exist_ok=True)
                    open(ROOT + local, 'wb').write(to_jpeg(raw_img)); print('Bild geladen:', local)
                except Exception as e:
                    print('WARNUNG: Bild fuer %s nicht ladbar (%s) - Post erscheint ohne bzw. mit bisherigem Foto.' % (p['slug'], e))
                    local = prev.get('image_local') or ''
                    src = prev.get('image') or src if local else src
        post = {'slug': p['slug'], 'date': p['date'], 'title': p['title'], 'description': p.get('description', ''),
                'image': src, 'image_local': local, 'text': p['text']}
        photos = text_photos(p['slug'], p['text'], prev)
        if photos:
            post['images'] = photos
        posts.append(post)
    json.dump({'ok': True, 'posts': posts}, open(os.path.join(ROOT, 'data', 'blog.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('data/blog.json: %d Posts' % len(posts))


if __name__ == '__main__':
    main()
