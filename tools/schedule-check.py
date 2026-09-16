#!/usr/bin/env python3
"""Zellen-Abgleich: Nominalplan (data/plan-nominal.json = Google-Slides-Decks) gegen ALLE Kopien im Repo.
Prueft spdata (4 Stundenplan-Seiten), lndata (4 Kids-Seiten), #zeiten der Kursseiten, SCHEDULE im Training-Plan-Tool.
Rot = kein Push. Aufruf: python3 tools/schedule-check.py"""
import re,json,sys,glob
P=json.load(open('data/plan-nominal.json'))
CODE={'QUE':'Quentz','LAS':'Laszlo','SER':'Sergei','NAS':'Natassja','FLO':'Florian','NTE':'Nathan','JOA':'João','SAM':'Samuel','DAR':'Dario'}
WDN={'Mo':1,'Di':2,'Mi':3,'Do':4,'Fr':5,'Sa':6}; EN2DE={'Mon':'Mo','Tue':'Di','Wed':'Mi','Thu':'Do','Fri':'Fr','Sat':'Sa'}
def nname(n): n=re.sub(r'\s*\((\d+)[–-](\d+)\)',r' \1-\2',n); return n.replace('Boxen','Boxing').replace('Fitness Kickboxen','Fitness Kickboxing').replace('Self Defense Women','Self Defense for Women').replace('Open Mat (frei)','Open Mat').replace('Open Mat (free)','Open Mat').replace('BJJ Open Mat','Open Mat').strip()
def nominal(loc):
    out={}
    for wd,rows in P[loc].items():
        for t,cells in rows.items():
            for c in cells:
                if c: out[(wd,t,nname(c[0]))]=c
    return out
errs=[]
def check_sp(f,loc):
    s=open(f).read(); d=json.loads(re.search(r'<script id="spdata"[^>]*>(.*?)</script>',s,re.S).group(1)); N=nominal(loc); web={}
    for day in d['days']:
        wd=EN2DE.get(day['wd'],day['wd'])
        for t,slots in day['rows'].items():
            for x in slots:
                if x: web[(wd,t,nname(x['n']))]=x
    for k in N.keys()-web.keys(): errs.append(f'{f}: FEHLT {k}')
    for k in web.keys()-N.keys(): errs.append(f'{f}: NICHT IM NOMINALPLAN {k} ({web[k]["who"]})')
    for k in N.keys()&web.keys():
        c=N[k]; x=web[k]
        if c[1] and c[1].lower() not in x['lv'].lower(): errs.append(f'{f}: LEVEL {k}: Folie {c[1]} / Seite {x["lv"]}')
        want=sorted(CODE[p] for p in c[2].split('+') if p); have=sorted(w.strip().split()[0] for w in x['who'].split('&') if w.strip()) if c[2] else []
        if c[2] and want!=have: errs.append(f'{f}: TRAINER {k}: Folie {want} / Seite {have}')
        if 'Self Defense for Women' in k[2] and 'street-defense' not in x['href']: errs.append(f'{f}: SDW-Link muss auf Street Defense zeigen')
def check_ln(f,loc):
    s=open(f).read(); d=json.loads(re.search(r'<script id="lndata"[^>]*>(.*?)</script>',s,re.S).group(1)); N=nominal(loc)
    want={k for k in N if k[2].startswith('Little Ninjas')}; have={(EN2DE.get(e['wd'],e['wd']),e['t'],nname(e['n'])) for e in d}
    for k in want-have: errs.append(f'{f}: Kids FEHLT {k}')
    for k in have-want: errs.append(f'{f}: Kids NICHT IM NOMINALPLAN {k}')
DISC={'boxen':'Boxing','boxing':'Boxing','ringen':'Wrestling','wrestling':'Wrestling','muay-thai':'Muay Thai','mma':'MMA','fitness-kickboxen':'Fitness Kickboxing','fitness-kickboxing':'Fitness Kickboxing','bjj':'BJJ','street-defense':'Street Defense'}
def check_course(f):
    s=open(f).read(); i=s.find('id="zeiten"')
    if i<0: return
    seg=s[i:s.find('</section>',i)]; loc='winterthur' if re.search(r'(^|/)winterthur/',f) else 'zurich'; slug=f.split('/')[-2]; disc=DISC.get(slug)
    if not disc: return
    N=nominal(loc); want={(k[0],k[1]) for k in N if k[2].split(' (')[0]==disc or (disc=='BJJ' and k[2].startswith('BJJ')) or (disc=='Muay Thai' and k[2]=='Striking')}
    have=set()
    for li in re.findall(r'<li[^>]*>(.*?)</li>',seg,re.S):
        m=re.search(r'<b>\s*(\w+)\s*</b>',li); 
        if not m: continue
        wd=EN2DE.get(m.group(1),m.group(1))
        for t in re.findall(r'(\d\d:\d\d)',li): have.add((wd,t))
    for k in want-have: errs.append(f'{f}: Zeiten FEHLT {k}')
    for k in have-want: errs.append(f'{f}: Zeiten NICHT IM NOMINALPLAN {k}')
def check_tool():
    s=open('training-plan/index.html').read(); raw=re.search(r'const SCHEDULE\s*=\s*(\[.*?\]);',s,re.S).group(1)
    tool={(a,int(b),c,d) for a,b,c,d,e,g in re.findall(r'\{loc:"(\w)",d:(\d),s:"([\d:]+)",disc:"(\w+)",lv:"([^"]*)",coach:"(\w*)"\}',raw)}
    T={'Boxing':'boxing','Wrestling':'wrestling','Muay Thai':'muaythai','MMA':'mma','Fitness Kickboxing':'fitnesskickboxing','BJJ':'bjj','Street Defense':'streetdefense','Striking':'striking'}
    want=set()
    for loc,L in (('zurich','z'),('winterthur','w')):
        for k in nominal(loc):
            base=k[2].split(' (')[0]
            if base in T: want.add((L,WDN[k[0]],k[1],T[base]))
    for k in tool-want: errs.append(f'training-plan: NICHT IM NOMINALPLAN {k}')
    for k in want-tool: errs.append(f'training-plan: FEHLT {k}')
check_sp('zurich/stundenplan/index.html','zurich'); check_sp('winterthur/stundenplan/index.html','winterthur'); check_sp('en/zurich/schedule/index.html','zurich'); check_sp('en/winterthur/schedule/index.html','winterthur')
for f in glob.glob('*/kurse/little-ninjas/index.html')+glob.glob('en/*/classes/little-ninjas/index.html'): check_ln(f,'winterthur' if 'winterthur' in f else 'zurich')
for f in glob.glob('*/kurse/*/index.html')+glob.glob('en/*/classes/*/index.html'): check_course(f)
check_tool()
if errs:
    print('\n'.join(errs)); print(f'\nROT: {len(errs)} Abweichungen vom Nominalplan'); sys.exit(1)
print('GRUEN: alle Kopien entsprechen dem Nominalplan (Stundenplan 4, Kids 4, Kursseiten, Tool)')
