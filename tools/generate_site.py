# -*- coding: utf-8 -*-
"""IMPACT site scaffold generator - design system from trial LPs, full architecture."""
import os, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOLT = '<path d="M50.4 16.4 L37.4 50"/><path d="M56.7 16.4 L43.7 50"/><path d="M62.9 16.4 L37 83.5"/><path d="M56.2 50.1 L43.3 83.5"/>'
LOGO = 'https://cdn.prod.website-files.com/651f0961164dd76d2ce8fd23/652a61bd13ed5242e0d0baff_IMPACT_Martial_Arts_Logo_neg_gold_web.png'

CSS = """
:root{--gold:#e2c210;--gold-dark:#b39a0c;--black:#000;--white:#fff;--grey:#b9b6ad;--hair:#26231c;--mx:clamp(20px,5vw,64px)}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{font-family:'Outfit',sans-serif;background:var(--black);color:var(--white);font-weight:300;line-height:1.5;-webkit-font-smoothing:antialiased;overflow-x:hidden}
img{max-width:100%;display:block}
a{color:inherit;text-decoration:none}
h1,h2,h3{font-weight:800;text-transform:uppercase;line-height:.98;letter-spacing:-.5px}
.accent{color:var(--gold)}
.cta{display:inline-block;background:var(--gold);color:var(--black);font-weight:800;font-size:15px;text-transform:uppercase;letter-spacing:.5px;padding:15px 26px;border-radius:4px;border:2px solid var(--gold);transition:transform .15s;cursor:pointer;position:relative;overflow:hidden}
.cta:hover{transform:translateY(-2px)}
.cta .sweep{position:absolute;top:-30%;bottom:-30%;left:-46px;width:34px;opacity:0;pointer-events:none}
.cta .sweep path{stroke:rgba(0,0,0,.45);stroke-width:4;fill:none}
.cta:hover .sweep{animation:ctasweep .45s ease-out}
@keyframes ctasweep{0%{opacity:1;transform:translateX(0)}100%{opacity:1;transform:translateX(420px)}}
.rev{opacity:0;transform:translateY(30px)}
.rev.vis{animation:rise .8s cubic-bezier(.3,1.15,.3,1) forwards}
@keyframes rise{60%{opacity:1;transform:translateY(-4px)}100%{opacity:1;transform:none}}
nav{position:fixed;top:0;left:0;right:0;z-index:60;display:flex;align-items:center;gap:16px;padding:16px var(--mx);transition:background .3s;background:linear-gradient(180deg,rgba(0,0,0,.85),transparent)}
nav.scrolled{background:rgba(0,0,0,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--hair)}
nav .logo img{height:32px}
.navlinks{display:none;gap:26px;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;font-weight:500}
.navlinks a:hover{color:var(--gold)}
@media(min-width:1000px){.navlinks{display:flex}}
.langtog{margin-left:auto;display:flex;gap:8px;font-size:13px;letter-spacing:1px;color:#6e6a5f;align-items:center}
.langtog .on{color:var(--gold);font-weight:800}
nav .cta{padding:10px 18px;font-size:13px}
.burger{display:block;background:none;border:none;color:var(--white);font-size:24px;cursor:pointer;line-height:1}
@media(min-width:1000px){.burger{display:none}}
.mobmenu{position:fixed;inset:0;background:rgba(0,0,0,.97);z-index:80;display:none;flex-direction:column;gap:6px;padding:90px var(--mx) 40px;font-size:26px;font-weight:800;text-transform:uppercase}
.mobmenu.open{display:flex}
.mobmenu a{padding:10px 0;border-bottom:1px solid var(--hair)}
.mobmenu .close{position:absolute;top:20px;right:var(--mx);font-size:30px;background:none;border:none;color:var(--gold);cursor:pointer}
.pagehero{padding:170px var(--mx) 70px;position:relative;overflow:hidden}
.pagehero:after{content:"";position:absolute;top:-40%;right:-20%;width:70%;height:150%;background:radial-gradient(ellipse,rgba(226,194,16,.09),transparent 65%);pointer-events:none}
.pagehero .kick{font-size:13px;letter-spacing:3px;color:var(--gold);font-weight:800;margin-bottom:14px}
.pagehero h1{font-size:clamp(44px,8.5vw,110px);max-width:14ch}
.pagehero .lead{margin-top:24px;font-size:18px;color:var(--grey);max-width:560px}
.pagehero .cta{margin-top:34px}
.chapter{padding:100px 0 0}
.chaphead{position:relative}
.chapbolt{position:absolute;left:var(--mx);top:6px;height:96px;width:20px}
.chapbolt path{stroke:var(--gold);stroke-width:3.4;fill:none;stroke-dasharray:220;stroke-dashoffset:220}
.chapbolt.vis path{animation:boltz .18s cubic-bezier(.7,0,.3,1) forwards}
.chapbolt.vis path:nth-child(2){animation-delay:.05s}.chapbolt.vis path:nth-child(3){animation-delay:.09s}.chapbolt.vis path:nth-child(4){animation-delay:.14s}
@keyframes boltz{to{stroke-dashoffset:0}}
.chaphead .idx{font-size:13px;color:var(--gold);font-weight:800;letter-spacing:3px;padding:0 var(--mx) 0 calc(var(--mx) + 36px)}
.chaphead h2{font-size:clamp(38px,6.5vw,84px);padding:6px var(--mx) 0 calc(var(--mx) + 36px)}
.chapter .lead{font-size:17px;color:var(--grey);max-width:560px;margin:22px var(--mx) 0}
.cardlist{margin:44px 0 0;border-top:1px solid var(--hair)}
.cardrow{display:grid;grid-template-columns:1fr auto;gap:14px;padding:26px var(--mx);border-bottom:1px solid var(--hair);align-items:center;transition:background .2s}
.cardrow:hover{background:#0d0c0a}
.cardrow h3{font-size:clamp(20px,3.2vw,30px)}
.cardrow small{display:block;font-size:14px;font-weight:300;text-transform:none;color:var(--grey);margin-top:4px;letter-spacing:0}
.cardrow .arr{color:var(--gold);font-weight:800;font-size:22px}
.note{margin:60px var(--mx) 0;padding:16px 20px;border:1px solid var(--hair);border-radius:6px;color:#8a867b;font-size:13px;letter-spacing:.5px}
.final{text-align:center;padding:120px var(--mx) 100px;position:relative;overflow:hidden}
.final:before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 50% 100%,rgba(226,194,16,.10),transparent 60%);pointer-events:none}
.final h2{font-size:clamp(40px,7vw,90px);margin-bottom:30px}
footer{border-top:1px solid var(--hair);padding:60px var(--mx) 40px;color:var(--grey);font-size:14px}
.fgrid{display:grid;grid-template-columns:1fr;gap:34px}
@media(min-width:900px){.fgrid{grid-template-columns:2fr 1fr 1fr 1fr}}
footer .flogo{height:34px;margin-bottom:16px}
footer h4{font-size:12px;letter-spacing:2px;text-transform:uppercase;color:var(--gold);margin-bottom:12px;font-weight:800}
footer ul{list-style:none}
footer li{margin:7px 0}
footer a:hover{color:var(--gold)}
.fbottom{margin-top:44px;padding-top:20px;border-top:1px solid var(--hair);font-size:12px;color:#6e6a5f}
body:after{content:"";position:fixed;inset:0;z-index:200;pointer-events:none;opacity:.035;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E")}
section.deep{background:#12100b}
"""

JS = """
(function(){
var nv=document.querySelector('nav');
window.addEventListener('scroll',function(){nv.classList.toggle('scrolled',window.scrollY>40)});
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('vis');io.unobserve(e.target)}})},{threshold:.35});
document.querySelectorAll('.rev,.chapbolt').forEach(function(el){io.observe(el)});
var b=document.getElementById('burger'),m=document.getElementById('mobmenu');
if(b){b.addEventListener('click',function(){m.classList.add('open')});
m.querySelector('.close').addEventListener('click',function(){m.classList.remove('open')});}
})();
"""

# ---------- i18n ----------
T = {
 'de': dict(lang='de', home='/', locations=[('Zürich','/zurich/'),('Winterthur','/winterthur/')],
   nav=[('Standorte','#standorte'),('Kurse','#kurse'),('Stundenplan','#'),('Über uns','/ueber-uns/')],
   trial='Gratis Probetraining', trialhub='/probetraining/', courses_word='Kurse', team='Team',
   schedule='Stundenplan', schedule_slug='stundenplan', courses_slug='kurse',
   placeholder='Diese Seite ist Teil der neuen Architektur. Inhalt wird als Nächstes übertragen – Design-System steht.',
   more='Mehr erfahren', legal=[('AGB','https://www.impact-martialarts.com/agb'),('Datenschutz','https://www.impact-martialarts.com/datenschutzerklarung')],
   contactword='Kontakt'),
 'en': dict(lang='en', home='/en/', locations=[('Zurich','/en/zurich/'),('Winterthur','/en/winterthur/')],
   nav=[('Locations','#standorte'),('Classes','#kurse'),('Timetable','#'),('About','/en/about/')],
   trial='Free Trial Session', trialhub='/trial/', courses_word='Classes', team='Team',
   schedule='Timetable', schedule_slug='timetable', courses_slug='classes',
   placeholder='This page is part of the new architecture. Content migration is next – the design system is in place.',
   more='Learn more', legal=[('Terms','https://www.impact-martialarts.com/terms-and-conditions'),('Privacy','https://www.impact-martialarts.com/privacy-policy')],
   contactword='Contact'),
}

COURSES = {
 'de': [
  ('bjj','Brazilian Jiu-Jitsu / BJJ','Effektiver Bodenkampf – Technik statt Kraft.'),
  ('muay-thai','Thai-Boxen / Muay Thai','Die Kunst der acht Waffen – kraftvoll, technisch, mit Respekt.'),
  ('boxen','Boxen','Schlagtechnik, Fitness und Timing – die Kunst des Boxens.'),
  ('mma','MMA','Boxen, Muay Thai, Ringen und BJJ fliessen zusammen.'),
  ('ringen','Ringen','Kraft, Technik und Ausdauer durch umfassendes Ringtraining.'),
  ('fitness-kickboxen','Fitness Kickboxen','Schweisstreibendes Fitness-Training mit Spassfaktor.'),
  ('selbstverteidigung-fuer-frauen','Selbstverteidigung für Frauen','Realitätsbasierte Selbstverteidigung für Frauen und LGBT+.'),
  ('street-defense','Street Defense','Selbstverteidigung, die im Ernstfall funktioniert.'),
  ('little-ninjas','Little Ninjas – Kids Training','Kindertraining für Selbstvertrauen, Disziplin und Fitness.'),
  ('personal-training','Personal Training','1:1-Coaching – massgeschneidert auf deine Ziele.'),
 ],
 'en': [
  ('bjj','Brazilian Jiu-Jitsu / BJJ','Effective ground fighting – technique over strength.'),
  ('muay-thai','Thai Boxing / Muay Thai','The art of eight limbs – powerful, technical, respectful.'),
  ('boxing','Boxing','Striking technique, fitness and timing – the art of boxing.'),
  ('mma','MMA','Boxing, Muay Thai, wrestling and BJJ combined.'),
  ('wrestling','Wrestling','Strength, technique and endurance through wrestling.'),
  ('fitness-kickboxing','Fitness Kickboxing','Sweat-inducing fitness training with the fun of striking.'),
  ('self-defense-for-women','Self Defense for Women','Reality-based self defense for women and LGBT+.'),
  ('street-defense','Street Defense','Self defense that works when it matters.'),
  ('little-ninjas','Little Ninjas – Kids Training','Kids training for confidence, discipline and fitness.'),
  ('personal-training','Personal Training','1:1 coaching tailored to your goals.'),
 ],
}
LOCS = {'de':[('zurich','Zürich','Walchestrasse 15, 8006 Zürich'),('winterthur','Winterthur','Technoparkstrasse 3, 8406 Winterthur')],
        'en':[('zurich','Zurich','Walchestrasse 15, 8006 Zurich'),('winterthur','Winterthur','Technoparkstrasse 3, 8406 Winterthur')]}

# trial LPs that already exist
TRIAL_READY = {('de','winterthur','bjj'):'/probetraining/bjj/', ('de','winterthur','muay-thai'):'/probetraining/muay-thai/',
               ('en','winterthur','bjj'):'/trial/bjj/', ('en','winterthur','muay-thai'):'/trial/muay-thai/'}

def bolt(cls='chapbolt', vb='30 12 40 76'):
    return '<svg class="%s" viewBox="%s" aria-hidden="true">%s</svg>' % (cls, vb, BOLT)

def sweep():
    return '<svg class="sweep" viewBox="30 12 40 76" aria-hidden="true">%s</svg>' % BOLT

def nav_html(lang, de_url, en_url, depth):
    t=T[lang]
    links=''.join('<a href="%s">%s</a>'%(u,n) for n,u in t['nav'] if u!='#')
    mob=''.join('<a href="%s">%s</a>'%(u,n) for n,u in ([(l,u) for l,u in t['locations']]+[(t['courses_word'],t['locations'][1][1]+t['courses_slug']+'/'),(t['nav'][3][0],t['nav'][3][1]),(t['trial'],t['trialhub'])]))
    return """<nav><a class="logo" href="%s"><img src="%s" alt="IMPACT Martial Arts"></a>
<div class="navlinks">%s</div>
<div class="langtog"><a href="%s" class="%s">DE</a><span>|</span><a href="%s" class="%s">EN</a></div>
<a class="cta" href="%s">%s%s</a>
<button class="burger" id="burger" aria-label="Menu">&#9776;</button></nav>
<div class="mobmenu" id="mobmenu"><button class="close" aria-label="Schliessen">&times;</button>%s</div>""" % (
      t['home'], LOGO, links, de_url, 'on' if lang=='de' else '', en_url, 'on' if lang=='en' else '',
      t['trialhub'], t['trial'], sweep(), mob)

def footer_html(lang):
    t=T[lang]
    locs=''.join('<li><a href="%s">%s</a></li>'%(u,n) for n,u in t['locations'])
    courses=''.join('<li><a href="%s%s/%s/">%s</a></li>'%(t['locations'][1][1],t['courses_slug'],s,n) for s,n,_ in COURSES[lang][:6])
    legal=''.join('<li><a href="%s" target="_blank" rel="noopener">%s</a></li>'%(u,n) for n,u in t['legal'])
    return """<footer><div class="fgrid">
<div><img class="flogo" src="%s" alt="IMPACT"><div>Strong Body, Strong Mind, Great Vibes.</div>
<div style="margin-top:14px">Walchestrasse 15, 8006 Zürich<br>Technoparkstrasse 3, 8406 Winterthur</div></div>
<div><h4>%s</h4><ul>%s<li><a href="%s">%s</a></li></ul></div>
<div><h4>%s</h4><ul>%s</ul></div>
<div><h4>IMPACT</h4><ul><li><a href="%s">%s</a></li><li><a href="https://www.impact-martialarts.com/career" target="_blank" rel="noopener">%s</a></li>%s</ul></div>
</div><div class="fbottom">&copy; 2026 IMPACT Martial Arts</div></footer>""" % (
      LOGO, 'Standorte' if lang=='de' else 'Locations', locs, t['trialhub'], t['trial'],
      t['courses_word'], courses, t['nav'][3][1], t['nav'][3][0],
      'Karriere' if lang=='de' else 'Career', legal)

def page(lang, path, title, seodesc, kick, h1, lead, body, de_url, en_url, cta=None):
    t=T[lang]
    cta = cta or (t['trialhub'], t['trial'])
    doc = """<!DOCTYPE html>
<html lang="%s"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>%s</title><meta name="description" content="%s">
<script>window.dataLayer=window.dataLayer||[];</script>
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-W6SM24HX');</script>
<!-- End Google Tag Manager -->
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;800&display=swap" rel="stylesheet">
<style>%s</style></head><body>
%s
<header class="pagehero"><div class="kick rev">%s</div><h1 class="rev">%s</h1>
<p class="lead rev">%s</p><a class="cta rev" href="%s">%s%s</a></header>
%s
<section class="final deep"><h2 class="rev">%s</h2><a class="cta" href="%s">%s%s</a></section>
%s
<script>%s</script></body></html>""" % (
        lang, html.escape(title), html.escape(seodesc), CSS,
        nav_html(lang, de_url, en_url, path.count('/')),
        html.escape(kick), h1, html.escape(lead), cta[0], html.escape(cta[1]), sweep(),
        body,
        ('Bereit für <span class="accent">Runde eins?</span>' if lang=='de' else 'Ready for <span class="accent">round one?</span>'),
        cta[0], html.escape(cta[1]), sweep(),
        footer_html(lang), JS)
    full = os.path.join(ROOT, path.lstrip('/'))
    os.makedirs(full, exist_ok=True)
    with open(os.path.join(full,'index.html'),'w',encoding='utf-8') as f: f.write(doc)
    return path

def chapter(idx, h2, lead, rows, note=None):
    r=''.join('<a class="cardrow rev" href="%s"><div><h3>%s</h3><small>%s</small></div><div class="arr">&rarr;</div></a>'%(u,h,s) for h,s,u in rows)
    n=('<div class="note rev">%s</div>'%note) if note else ''
    return """<section class="chapter"><div class="chaphead">%s<div class="idx rev">%s</div><h2 class="rev">%s</h2></div>
<p class="lead rev">%s</p><div class="cardlist">%s</div>%s</section>""" % (bolt(), idx, h2, lead, r, n)

pages=[]
for lang in ('de','en'):
    t=T[lang]; other='en' if lang=='de' else 'de'
    pfx='' if lang=='de' else '/en'
    # ---- course detail pages + kurse overview per location ----
    for lslug, lname, laddr in LOCS[lang]:
        base='%s/%s/'%(pfx,lslug)
        rows=[]
        for cslug,cname,cdesc in COURSES[lang]:
            curl='%s%s/%s/'%(base,t['courses_slug'],cslug)
            rows.append((cname,cdesc,curl))
            trial = TRIAL_READY.get((lang,lslug,cslug), t['trialhub'])
            de_u = '/%s/kurse/%s/'%(lslug, dict(zip([c[0] for c in COURSES['en']],[c[0] for c in COURSES['de']])).get(cslug,cslug)) if lang=='en' else '%s%s/%s/'%(base,t['courses_slug'],cslug)
            en_u = '/en/%s/classes/%s/'%(lslug, dict(zip([c[0] for c in COURSES['de']],[c[0] for c in COURSES['en']])).get(cslug,cslug)) if lang=='de' else '%s%s/%s/'%(base,t['courses_slug'],cslug)
            body = chapter('01', ('Warum <span class="accent">IMPACT.</span>' if lang=='de' else 'Why <span class="accent">IMPACT.</span>'),
                t['placeholder'],
                [( ('Gratis Probetraining' if lang=='de' else 'Free trial session'), cdesc, trial ),
                 ( t['schedule'], laddr, '%s%s/'%(base,t['schedule_slug']) )])
            pages.append(page(lang, curl, '%s %s – IMPACT Martial Arts'%(cname,lname), cdesc,
                'IMPACT '+lname, cname.replace('/','<br>'), cdesc, body, de_u, en_u, cta=(trial, t['trial'])))
        # overview
        ov='%s%s/'%(base,t['courses_slug'])
        body=chapter('01', ('Alle <span class="accent">Kurse.</span>' if lang=='de' else 'All <span class="accent">classes.</span>'),
            ('Für jedes Alter und jedes Level – finde deine Disziplin.' if lang=='de' else 'For every age and level – find your discipline.'), rows)
        pages.append(page(lang, ov, '%s %s | IMPACT Martial Arts'%(t['courses_word'],lname),
            'Kampfsportkurse bei IMPACT %s.'%lname if lang=='de' else 'Martial arts classes at IMPACT %s.'%lname,
            'IMPACT '+lname, ('Kurse in <span class="accent">%s.</span>'%lname if lang=='de' else 'Classes in <span class="accent">%s.</span>'%lname),
            ('Erkunde unsere Kampfsportkurse für jedes Alter und Niveau.' if lang=='de' else 'Explore our martial arts classes for all ages and levels.'),
            body, '/%s/kurse/'%lslug, '/en/%s/classes/'%lslug))
        # schedule + team skeletons
        for slug2,h1x,kickx in [(t['schedule_slug'], t['schedule'], lname), ('team', t['team'], lname)]:
            u='%s%s/'%(base,slug2)
            body=chapter('01', '%s <span class="accent">%s.</span>'%(h1x,lname), t['placeholder'],
                [(t['courses_word'],'','%s%s/'%(base,t['courses_slug'])),(t['trial'],'',t['trialhub'])])
            pages.append(page(lang,u,'%s %s | IMPACT Martial Arts'%(h1x,lname),t['placeholder'],'IMPACT '+lname,
                h1x+'.','',body,'/%s/%s/'%(lslug,'stundenplan' if slug2 in('stundenplan','timetable') else slug2),
                '/en/%s/%s/'%(lslug,'timetable' if slug2 in('stundenplan','timetable') else slug2)))
        # location page
        lrows=[(t['courses_word'],'','%s%s/'%(base,t['courses_slug'])),(t['schedule'],'','%s%s/'%(base,t['schedule_slug'])),(t['team'],'','%steam/'%base),(t['trial'],'',t['trialhub'])]
        body=chapter('01', ('Dein Studio in <span class="accent">%s.</span>'%lname if lang=='de' else 'Your gym in <span class="accent">%s.</span>'%lname), laddr, lrows)
        pages.append(page(lang, base, 'IMPACT Martial Arts %s | MMA, Muay Thai, BJJ & mehr'%lname,
            'Trainiere MMA, Muay Thai, BJJ, Fitness Kickboxing, Self Defense und Boxen in %s.'%lname,
            'IMPACT Martial Arts', lname+'.',
            ('MMA, Muay Thai, BJJ, Boxen, Kids Training – alles unter einem Dach.' if lang=='de' else 'MMA, Muay Thai, BJJ, boxing, kids training – all under one roof.'),
            body, '/%s/'%lslug, '/en/%s/'%lslug))
    # ---- top-level skeletons ----
    top = ([('ueber-uns','Über uns','Leidenschaft und Fachwissen bei IMPACT.'),('faq','FAQ','Antworten auf die häufigsten Fragen.'),
            ('kontakt','Kontakt','Wir sind für dich da.'),('seminare','Seminare','Dynamische Seminare mit Weltklasse-Coaches.'),
            ('events','Events','Community-Events bei IMPACT.'),('karriere','Karriere','Werde Teil des IMPACT-Teams.'),('blog','Blog','Einblicke, Trainingstipps und News.')]
        if lang=='de' else
           [('about','About','Passion and expertise at IMPACT.'),('faq','FAQ','Answers to the most common questions.'),
            ('contact','Contact','We are here for you.'),('seminars','Seminars','Dynamic seminars with world-class coaches.'),
            ('career','Career','Join the IMPACT team.')])
    for slug,name,desc in top:
        u='%s/%s/'%(pfx,slug)
        de_map={'about':'ueber-uns','contact':'kontakt','seminars':'seminare','career':'karriere','faq':'faq'}
        en_map={v:k for k,v in de_map.items()}
        de_u='/%s/'%(slug if lang=='de' else de_map.get(slug,slug))
        en_u='/en/%s/'%(en_map.get(slug,slug) if lang=='de' else slug)
        body=chapter('01', name+' <span class="accent">.</span>', t['placeholder'],
            [(t['locations'][0][0],'',t['locations'][0][1]),(t['locations'][1][0],'',t['locations'][1][1]),(t['trial'],'',t['trialhub'])])
        pages.append(page(lang,u,'%s | IMPACT Martial Arts'%name,desc,'IMPACT Martial Arts',name+'.',desc,body,de_u,en_u))
    # ---- trial hub ----
    hub=t['trialhub']
    hubrows=[]
    for lslug,lname,_ in LOCS[lang]:
        for cslug,cname,cdesc in COURSES[lang][:2]:
            key=(lang,lslug,cslug)
            if key in TRIAL_READY:
                hubrows.append(('%s – %s'%(cname.split('/')[0].strip(),lname),cdesc,TRIAL_READY[key]))
    hubrows.append((('Anderer Kurs / Standort' if lang=='de' else 'Other class / location'),
        ('Aktuelle Anmeldung über die Hauptseite' if lang=='de' else 'Currently via the main site'),
        'https://www.impact-martialarts.com/gr/probetraining' if lang=='de' else 'https://www.impact-martialarts.com/trial-session'))
    body=chapter('01', ('Wähle deinen <span class="accent">Einstieg.</span>' if lang=='de' else 'Choose your <span class="accent">start.</span>'),
        ('Dein erstes Training ist gratis. Davor finden wir im Gespräch heraus, ob IMPACT und du zusammenpassen.' if lang=='de' else
         'Your first session is free. Before that, a short call to see if IMPACT and you are a match.'), hubrows)
    pages.append(page(lang, hub, ('Gratis Probetraining | IMPACT Martial Arts' if lang=='de' else 'Free Trial | IMPACT Martial Arts'),
        t['placeholder'],'IMPACT Martial Arts',
        ('Gratis <span class="accent">Probetraining.</span>' if lang=='de' else 'Free <span class="accent">trial.</span>'),
        '', body, '/probetraining/','/trial/'))
    # ---- homepage ----
    locrows=[(n,'', u) for n,u in t['locations']]
    body = chapter('01 — STANDORTE' if lang=='de' else '01 — LOCATIONS',
        ('Zwei Städte. <span class="accent">Ein Team.</span>' if lang=='de' else 'Two cities. <span class="accent">One team.</span>'),
        ('Weltklasse-Training im Herzen deiner Stadt.' if lang=='de' else 'World-class training in the heart of your city.'), locrows)
    body += chapter('02 — '+t['courses_word'].upper(),
        ('Finde deine <span class="accent">Disziplin.</span>' if lang=='de' else 'Find your <span class="accent">discipline.</span>'),
        ('MMA, Muay Thai, BJJ, Boxen, Selbstverteidigung, Kids Training und mehr.' if lang=='de' else 'MMA, Muay Thai, BJJ, boxing, self defense, kids training and more.'),
        [(n,d,'%s/winterthur/%s/%s/'%(pfx,t['courses_slug'],s)) for s,n,d in COURSES[lang][:6]] +
        [(('Alle Kurse ansehen' if lang=='de' else 'View all classes'),'','%s/winterthur/%s/'%(pfx,t['courses_slug']))])
    pages.append(page(lang, pfx+'/' if pfx else '/', 
        'IMPACT Martial Arts | MMA, Muay Thai, BJJ, Fitness Kickboxing & mehr' if lang=='de' else 'IMPACT Martial Arts | MMA, Muay Thai, BJJ & More',
        ('Trainiere MMA, Muay Thai, BJJ, Fitness Kickboxing, Self Defense, Boxing und Kidstraining bei IMPACT Martial Arts.' if lang=='de' else
         'Train MMA, Muay Thai, BJJ, Fitness Kickboxing, Self Defense, Boxing, and Kids Training at IMPACT Martial Arts.'),
        'Zürich · Winterthur',
        ('Starker Körper.<br>Starker Geist.<br><span class="accent">Great Vibes.</span>' if lang=='de' else 'Strong body.<br>Strong mind.<br><span class="accent">Great vibes.</span>'),
        ('Kampfsport für alle – professionell, inklusiv, mit einer Community, die dich trägt.' if lang=='de' else
         'Martial arts for everyone – professional, inclusive, with a community that carries you.'),
        body, '/', '/en/'))

print('generated', len(pages), 'pages')
