# -*- coding: utf-8 -*-
"""Einmalige Migration: 5 Karriere-Stellen + 6 Blogposts von Webflow in die neue Site."""
from bs4 import BeautifulSoup, NavigableString
import re, os, subprocess, html

SRC='/private/tmp/claude-501/-Users-rubencrawford/5e2dcf68-a03f-4cf9-8e08-a63592ae270d/scratchpad/mig'
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

ALLOWED={'p','h2','h3','h4','ul','ol','li','strong','em','b','i','a','blockquote','br'}

def sanitize(el):
    """Element -> bereinigtes HTML (nur erlaubte Tags, keine Attribute ausser href)."""
    if isinstance(el, NavigableString):
        return html.escape(str(el))
    if el.name not in ALLOWED:
        return ''.join(sanitize(c) for c in el.children)
    inner=''.join(sanitize(c) for c in el.children)
    if el.name=='a':
        href=el.get('href','')
        href=re.sub(r'https?://www\.impact-martialarts\.com/blog/([a-z0-9-]+)',r'/articles/\1/',href)
        href=re.sub(r'https?://www\.impact-martialarts\.com/career/([a-z0-9-]+)',r'/karriere/\1/',href)
        return f'<a href="{html.escape(href)}">{inner}</a>'
    if not inner.strip() and el.name not in ('br',): return ''
    return f'<{el.name}>{inner}</{el.name}>'

def collect_region(soup, start_pred, stop_pred):
    blocks=soup.find_all(['h2','h3','h4','p','ul','ol'])
    out=[];on=False;seen=set()
    for b in blocks:
        t=b.get_text(' ',strip=True)
        if not on and start_pred(b,t): on=True
        elif on and stop_pred(b,t): break
        elif on:
            if any(b is a or b in getattr(a,'descendants',[]) for a in out): continue
            key=(b.name,t[:80])
            if not t or t=='‍' or key in seen: continue
            seen.add(key); out.append(b)
    return out

def region_html(blocks):
    parts=[]
    for b in blocks:
        h=sanitize(b)
        if h.strip(): parts.append(h)
    return '\n'.join(parts)

def shell(hubfile):
    s=open(hubfile,encoding='utf-8').read()
    head=s[:s.index('<section class="pagehead"')]
    tail=s[s.index('<section class="final deep"'):]
    return head,tail

JOB_CSS='''
/* job detail */
.pagehead h1{font-size:clamp(34px,6vw,72px);max-width:20ch}
.jobfacts{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px;padding:0 var(--mx)}
.jobfacts span{border:1px solid var(--gold);color:var(--gold);font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;padding:7px 14px;border-radius:99px}
.jobbody{max-width:780px;padding:30px var(--mx) 10px}
.jobbody h2{font-size:clamp(24px,3.4vw,38px);margin:44px 0 14px}
.jobbody h3{font-size:clamp(18px,2.4vw,24px);margin:30px 0 10px}
.jobbody p{color:var(--grey);font-size:16.5px;line-height:1.65;margin:12px 0}
.jobbody ul,.jobbody ol{margin:12px 0 12px 20px;color:var(--grey)}
.jobbody li{margin:7px 0;font-size:16.5px;line-height:1.55}
.jobbody strong,.jobbody b{color:var(--white)}
.applysec{max-width:780px;padding:26px var(--mx) 90px}
.applysec h2{font-size:clamp(26px,4vw,44px);margin-bottom:14px}
.applysec p{color:var(--grey);font-size:16.5px;line-height:1.65;margin-bottom:24px}
'''
ART_CSS='''
/* artikel detail */
.pagehead h1{font-size:clamp(30px,5vw,58px);max-width:24ch}
.artphoto{margin:34px var(--mx) 0;max-width:980px}
.artphoto img{width:100%;max-height:520px;object-fit:cover;display:block}
.artbody{max-width:760px;padding:26px var(--mx) 90px}
.artbody h2{font-size:clamp(23px,3.2vw,34px);margin:42px 0 14px}
.artbody h3{font-size:clamp(19px,2.4vw,25px);margin:30px 0 10px}
.artbody p{color:var(--grey);font-size:17px;line-height:1.7;margin:14px 0}
.artbody ul,.artbody ol{margin:12px 0 12px 20px;color:var(--grey)}
.artbody li{margin:7px 0;font-size:17px;line-height:1.6}
.artbody strong,.artbody b{color:var(--white)}
.artbody a{color:var(--gold)}
.artdate{color:#8a867b;font-size:14px;letter-spacing:1px;margin-top:14px;padding:0 var(--mx);text-transform:uppercase}
'''

def write_page(path, head, tail, css, mid, title, desc):
    s=head+mid+'\n'+tail
    s=re.sub(r'<title>.*?</title>', f'<title>{title}</title>', s, count=1, flags=re.S)
    s=re.sub(r'(<meta name="description" content=")[^"]*(")', lambda m: m.group(1)+desc+m.group(2), s, count=1)
    s=s.replace('</style>', css+'</style>', 1)
    os.makedirs(os.path.dirname(path),exist_ok=True)
    open(path,'w',encoding='utf-8').write(s)
    print('geschrieben:',path)

# ---------- KARRIERE ----------
jhead,jtail=shell('karriere/index.html')
JOBS=[('bjj-coach','BJJ Coach (10–30%)'),('head-coach','Head MMA Coach / Senior Martial Arts Coach (80–100%)'),
      ('mma-coach','MMA Coach (10–30%)'),('muay-thai-boxing-coach','Muay Thai & Boxing Coach (10–30%)'),('sales','Sales Professional & Team Lead (80%)')]
FACTSET={'part-time','full-time','(eu/efta)','competitive salary'}
for slug,_t in JOBS:
    soup=BeautifulSoup(open(f'{SRC}/career_{slug}.html',encoding='utf-8').read(),'html.parser')
    for t in soup(['script','style']): t.decompose()
    h1s=[h.get_text(' ',strip=True) for h in soup.find_all('h1')]
    title=next((h for h in h1s if re.search(r'\(\d+[^)]*%\)', h)), h1s[0])
    ti=h1s.index(title)
    sub=h1s[ti+1] if ti+1<len(h1s) and h1s[ti+1].lower() not in FACTSET else ''
    facts=[h for h in h1s if h.lower() in FACTSET]
    if slug=='sales': facts=['80%','Winterthur']
    if slug!='sales':
        blocks=collect_region(soup, lambda b,t:'Your next chapter' in t, lambda b,t:t.strip().upper()=='APPLY NOW')
        instr=next((h.get_text(' ',strip=True) for h in soup.find_all('h2') if h.get_text(' ',strip=True).startswith('Please fill out the form')),'')
        instr=instr.replace('Please fill out the form and include the following:','Send us an email and include the following:')
    else:
        blocks=collect_region(soup, lambda b,t: t.startswith('IMPACT Martial Arts AG is opening'), lambda b,t: 'Your application has been received' in t or 'Traumjob' in t)
        # Startblock selbst mitnehmen
        startp=next(p for p in soup.find_all('p') if p.get_text(' ',strip=True).startswith('IMPACT Martial Arts AG is opening'))
        blocks=[startp]+blocks
        instr='Send us an email with your CV and a few lines about yourself.'
    body=region_html(blocks)
    chips=''.join(f'<span>{html.escape(f)}</span>' for f in facts)
    mailto='mailto:support@impact-martialarts.com?subject='+re.sub(r'\s+','%20','Bewerbung '+title.split('(')[0].strip())
    mid=(f'<section class="pagehead"><div class="kick rev">Karriere bei IMPACT</div>'
         f'<h1 class="rev">{html.escape(title)}</h1>'
         + (f'<p class="lead rev">{html.escape(sub)}</p>' if sub else '')
         + (f'<div class="jobfacts rev">{chips}</div>' if chips else '')
         + f'</section>\n<article class="jobbody rev">{body}</article>\n'
         f'<section class="applysec"><h2 class="rev">Apply <span class="accent">now.</span></h2>'
         f'<p>{html.escape(instr)}</p>'
         f'<a class="cta" href="{mailto}">Jetzt bewerben</a></section>\n')
    write_page(f'karriere/{slug}/index.html', jhead, jtail, JOB_CSS, mid,
               f'{html.escape(title)} | Karriere bei IMPACT Martial Arts',
               'Offene Stelle bei IMPACT Martial Arts: '+html.escape(title))

# ---------- BLOG ----------
ahead,atail=shell('articles/index.html')
import glob
for f in sorted(glob.glob(f'{SRC}/blog_*.html')):
    slug=os.path.basename(f)[5:-5]
    soup=BeautifulSoup(open(f,encoding='utf-8').read(),'html.parser')
    title=soup.find('h1').get_text(' ',strip=True)
    og=soup.find('meta',property='og:image')['content']
    date=None
    for el in soup.find_all(string=re.compile(r'^\s*\w+ \d{1,2}, 20\d\d\s*$')):
        date=el.strip(); break
    for t in soup(['script','style']): t.decompose()
    rt=soup.select_one('.w-richtext')
    body=''.join(sanitize(c) for c in rt.children)
    # Hero-Bild spiegeln
    short=re.sub(r'[^a-z0-9]+','-',slug)[:40].strip('-')
    dest=f'assets/blog/{short}.jpg'
    os.makedirs('assets/blog',exist_ok=True)
    if not os.path.exists(dest):
        subprocess.run(['curl','-s','-A',UA,'-o',dest,og],check=True)
        assert os.path.getsize(dest)>3000, (dest, og)
    mid=(f'<section class="pagehead"><div class="kick rev">Artikel &amp; News</div>'
         f'<h1 class="rev">{html.escape(title)}</h1></section>'
         + (f'<div class="artdate rev">{html.escape(date)}</div>' if date else '')
         + f'\n<div class="artphoto rev"><img src="/{dest}" alt="{html.escape(title)}"></div>\n'
         f'<article class="artbody">{body}</article>\n')
    write_page(f'articles/{slug}/index.html', ahead, atail, ART_CSS, mid,
               f'{html.escape(title)} | IMPACT Martial Arts',
               html.escape(title)+' – Artikel von IMPACT Martial Arts.')
print('fertig')
