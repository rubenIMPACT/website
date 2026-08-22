# -*- coding: utf-8 -*-
"""Course pages on LP blueprint (DE, both cities). BJJ/MT reuse their polished LPs 1:1; other disciplines transform the MT template. Nav injected, ad-mode hides it."""
import re, os, sys, hashlib, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import enrich_winterthur_de as W
G = W.G

def wfname(url):
    clean=urllib.parse.unquote(url.split('?')[0])
    base=re.sub(r'[^A-Za-z0-9.-]+','-',clean.split('/')[-1])[-80:]
    return 'assets/wf/%s-%s'%(hashlib.md5(url.encode()).hexdigest()[:8],base)

NAV_CSS = """/* sitenav */
.sitenav{position:fixed;top:0;left:0;right:0;z-index:60;display:flex;align-items:center;gap:26px;padding:14px var(--mx);background:linear-gradient(180deg,rgba(0,0,0,.88),rgba(0,0,0,0));font-size:13px;letter-spacing:1px;text-transform:uppercase}
.sitenav a{color:#fff;text-decoration:none;font-weight:500}
.sitenav a.brand{font-weight:800;color:var(--gold);letter-spacing:2px;margin-right:auto}
.sitenav a:hover{color:var(--gold)}
.admode .sitenav{display:none}
body>nav:not(.sitenav),.langtog{display:none!important}
@media(max-width:760px){.sitenav{gap:14px;font-size:11px}.sitenav a.extra{display:none}}
"""
ADJS = """<script>if(/[?&](gclid|fbclid|utm_|ad=1)/.test(location.search)){document.documentElement.classList.add('admode')}</script>"""

def nav(city_de, de_u, en_u):
    return ('<nav class="sitenav"><a class="brand" href="/">IMPACT</a>'
            '<a href="/winterthur/">Winterthur</a><a href="/zurich/">Z&uuml;rich</a>'
            '<a class="extra" href="/stundenplan/">Stundenplan</a>'
            '<a href="%s" style="color:var(--gold)">DE</a><a href="%s">EN</a>'
            '<a href="#anmelden" class="cta" style="padding:9px 14px;font-size:12px">Probetraining</a></nav>')%(de_u,en_u)

def rows_from(points):
    out=[]
    for p in points[:4]:
        if ' – ' in p: t,s=p.split(' – ',1)
        elif ' - ' in p: t,s=p.split(' - ',1)
        else:
            w=p.split(); t=' '.join(w[:2]); s=' '.join(w[2:])
        out.append((t.strip().rstrip(',.'), s.strip()))
    return out

def build(base, city, slug, name, c):
    d=base
    zur = city=='Zürich'
    d=d.replace('../../assets/','/assets/')
    # nav + ad-mode
    d=d.replace('</style>', NAV_CSS+'</style>',1)
    zur0 = city=='Zürich'
    de_u0='/%s/kurse/%s/'%('zurich' if zur0 else 'winterthur', slug)
    en_u0='/en/%s/classes/%s/'%('zurich' if zur0 else 'winterthur', dict(zip([x[0] for x in G.COURSES['de']],[x[0] for x in G.COURSES['en']]))[slug])
    d=re.sub(r'(<body[^>]*>)', lambda m: m.group(1)+'\n'+nav(city,de_u0,en_u0)+'\n', d, count=1)
    d=d.replace('</head>', ADJS+'\n</head>',1)
    # canonical URL refs + hreflang links: strip LP-specific canonicals if any (none), fix DE/EN toggle links
    de_u='/%s/kurse/%s/'%('zurich' if zur else 'winterthur', slug)
    en_u='/en/%s/classes/%s/'%('zurich' if zur else 'winterthur', dict(zip([x[0] for x in G.COURSES['de']],[x[0] for x in G.COURSES['en']]))[slug])
    d=re.sub(r'href="/trial/[a-z-]+/"','href="%s"'%en_u,d)
    d=re.sub(r'href="/probetraining/(bjj|muay-thai)/"','href="%s"'%de_u,d)
    # title/meta
    d=re.sub(r'<title>.*?</title>','<title>%s %s – IMPACT Martial Arts</title>'%(name.strip(),city),d,flags=re.S)
    # city strings
    if zur:
        d=d.replace('Technoparkstrasse 3, Winterthur','Josefstrasse 92, Zürich')
        d=d.replace('Winterthur','Zürich')
        d=d.replace('value="Zürich">Zürich</option>','value="Zürich" selected>Zürich</option>')
        d=d.replace('<option value="Winterthur" selected>','<option value="Winterthur">')
        d=re.sub(r'<option value="Zürich" selected>Zürich</option>(\s*<option value="Winterthur")','<option value="Zürich" selected>Zürich</option>\\1',d)
    if c is None:
        return d
    # ---- generic discipline transform (base = MT template) ----
    # hero words
    short=name.strip().split(' / ')[0].split(' - ')[0]
    d=re.sub(r'<span class="rw">Technik\.</span>\s*<span class="rw">Präzision\.</span>\s*<span class="rw accent">IMPACT\.</span>',
             '<span class="rw">%s.</span> <span class="rw accent">IMPACT.</span>'%short, d)
    # hero sub + cred
    d=re.sub(r'(<p class="sub">).*?(</p>)', r'\g<1>%s\g<2>'%c['sub'], d, count=1, flags=re.S)
    d=re.sub(r'<p class="cred">.*?</p>','',d,count=1,flags=re.S)
    # hero media: video -> photo
    img=wfname(c['img'])
    d=re.sub(r'<video[^>]*>.*?</video>','<img src="/%s" alt="%s bei IMPACT %s" style="width:100%%;height:100%%;object-fit:cover">'%(img,short,city),d,count=1,flags=re.S)
    d=re.sub(r'<button class="soundbtn".*?</button>','',d,count=1,flags=re.S)
    # warum bg -> discipline image
    d=re.sub(r"#warum:before\{content:\"\";position:absolute;inset:0;background:url\('[^']+'\)","#warum:before{content:\"\";position:absolute;inset:0;background:url('/%s')"%img,d)
    # warum wordlist rows
    rows=rows_from((c['why_pts'] or [])+c['learn'])
    tri='<svg class="tri" width="16" height="24" viewBox="33 12 36 76" overflow="visible" aria-hidden="true"><path pathLength="100" d="M50.4 16.4 L37.4 50"/><path pathLength="100" d="M56.7 16.4 L43.7 50"/><path pathLength="100" d="M62.9 16.4 L37 83.5"/><path pathLength="100" d="M56.2 50.1 L43.3 83.5"/></svg>'
    rowhtml=''.join('<div class="rev">%s%s <small>%s</small></div>'%(tri,t,s) for t,s in rows)
    d=re.sub(r'(<div class="wordlist">).*?(</div>\s*</div>\s*</div>\s*</section>)', r'\g<1>'+rowhtml.replace('\\','\\\\')+r'\g<2>', d, count=1, flags=re.S)
    # remove MT-only weapons + duo coaches
    d=re.sub(r'<section class="gisec" id="gi">.*?</section>','',d,count=1,flags=re.S)
    d=re.sub(r'<section class="duosec" id="coach">.*?</section>','',d,count=1,flags=re.S)
    # ablauf bg -> discipline image too
    d=re.sub(r"#ablauf:before\{content:\"\";position:absolute;inset:0;background:url\('[^']+'\)","#ablauf:before{content:\"\";position:absolute;inset:0;background:url('/%s')"%img,d)
    # FAQ items
    faqs=''.join('<details><summary>%s</summary><p>%s</p></details>'%qa for qa in c['faq'])
    m=re.search(r'<section class="faq[^>]*>.*?</section>', d, re.S)
    sec=m.group(0)
    sec2=re.sub(r'<details.*</details>', faqs, sec, flags=re.S)
    d=d[:m.start()]+sec2+d[m.end():]
    # form discipline preselect
    d=re.sub(r'(<option value="[^"]*"[^>]*>)','\\1',d)  # noop
    d=re.sub(r' selected>Thai-Boxen','>Thai-Boxen',d)
    optname={'bjj':'Brazilian Jiu-jitsu / BJJ','muay-thai':'Thai-Boxen / Muay Thai','boxen':'Boxen','mma':'MMA','ringen':'Ringen','fitness-kickboxen':'Fitness Kickboxen','selbstverteidigung-fuer-frauen':'Selbstverteidigung für Frauen','street-defense':'Street Defense','personal-training':'Personal Training'}[slug]
    if 'value="%s"'%optname in d:
        d=d.replace('value="%s"'%optname,'value="%s" selected'%optname,1)
    else:
        d=re.sub(r'(<select id="fdis"[^>]*>)', r'\1<option value="%s" selected>%s</option>'%(optname,optname), d, count=1)
    return d

os.makedirs('winterthur/kurse',exist_ok=True); os.makedirs('zurich/kurse',exist_ok=True)
bjj_base=open('tools/templates/lp-bjj.html',encoding='utf-8').read()
mt_base=open('tools/templates/lp-mt.html',encoding='utf-8').read()
NAMES=dict((s,(n,dsc)) for s,n,dsc in G.COURSES['de'])
count=0
for city,cslug in [('Winterthur','winterthur'),('Zürich','zurich')]:
    for slug,c in [('bjj',None),('muay-thai',None)]+[(s,W.C[s]) for s in W.C if s not in ('bjj','muay-thai')]:
        base = bjj_base if slug=='bjj' else mt_base
        name=NAMES[slug][0]
        html=build(base, city, slug, name, c if slug not in ('bjj','muay-thai') else None)
        path='%s/kurse/%s/index.html'%(cslug,slug)
        os.makedirs(os.path.dirname(path),exist_ok=True)
        open(path,'w',encoding='utf-8').write(html)
        count+=1
print('built',count,'course pages on LP blueprint')
