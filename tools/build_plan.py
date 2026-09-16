#!/usr/bin/env python3
"""Baut aus data/plan-nominal.json (Nominalplan = Google-Slides-Decks) ALLE Stundenplan-Kopien im Repo:
4 Stundenplan-Seiten (spdata), 4 Kids-Seiten (lndata), Kursseiten-#zeiten (sptwrap), Training-Plan-Tool (SCHEDULE).
Idempotent: gleiche Eingabe -> gleiche Dateien. Aufruf: python3 tools/build_plan.py  (danach tools/schedule-check.py)"""
import re,json,glob,sys
P=json.load(open('data/plan-nominal.json'))
NAME={'QUE':'Quentz Alexis II','LAS':'Laszlo Simo','SER':'Sergei Liubchenko','NAS':'Natassja Aarons','FLO':'Florian Helmke-Becker','NTE':'Nathan Melliger','JOA':'João de Oliveira','SAM':'Samuel S. Bauer','DAR':'Dario Kashani'}
CODE={'QUE':'quentz','LAS':'laszlo','SER':'sergei','NAS':'natassja','FLO':'florian','NTE':'nathan','JOA':'joao','SAM':'samuel','DAR':'dario'}
DAYS=['Mo','Di','Mi','Do','Fr','Sa']; DN_DE={'Mo':'Montag','Di':'Dienstag','Mi':'Mittwoch','Do':'Donnerstag','Fr':'Freitag','Sa':'Samstag'}
DN_EN={'Mo':'Monday','Di':'Tuesday','Mi':'Wednesday','Do':'Thursday','Fr':'Friday','Sa':'Saturday'}; WD_EN={'Mo':'Mon','Di':'Tue','Mi':'Wed','Do':'Thu','Fr':'Fri','Sa':'Sat'}
SLUG={'Boxing':'boxen','Wrestling':'ringen','Muay Thai':'muay-thai','MMA':'mma','Fitness Kickboxing':'fitness-kickboxen','BJJ':'bjj','BJJ (Gi)':'bjj','BJJ (No-Gi)':'bjj','Street Defense':'street-defense','Striking':'muay-thai','Self Defense for Women':'street-defense','Self Defense Women':'street-defense','Little Ninjas 6-9':'little-ninjas','Little Ninjas 10-14':'little-ninjas','Open Mat':''}
SLUG_EN={'boxen':'boxing','ringen':'wrestling','fitness-kickboxen':'fitness-kickboxing'}
def who(code): return ' & '.join(NAME[c] for c in code.split('+') if c)
def mins(n): return 45 if n=='Little Ninjas 6-9' else 60
def disp(n,en):
    if n=='Boxing': return 'Boxing' if en else 'Boxen'
    if n=='Open Mat': return 'Open Mat (free)' if en else 'Open Mat (frei)'
    if n=='Self Defense Women': return 'Self Defense for Women'
    return re.sub(r'Little Ninjas (\d+)-(\d+)',r'Little Ninjas (\1–\2)',n)
def slot(c,loc,en):
    n,lv,code=c; slug=SLUG[n]; s=SLUG_EN.get(slug,slug) if en else slug
    href=('/en/%s/classes/%s/'%(loc,s) if s else '/en/%s/classes/'%loc) if en else ('/%s/kurse/%s/'%(loc,s) if s else '/%s/kurse/'%loc)
    return {'n':disp(n,en),'lv':(lv+' · ' if lv else '')+'%d Min'%mins(n),'who':who(code) if code else ('Open to all levels' if en else 'Alle Levels offen'),'href':href}
def build_spdata(loc,en):
    plan=P[loc]; mats=2 if loc=='zurich' else 1; days=[]
    for wd in DAYS:
        rows={}
        for t in sorted(plan[wd]):
            cells=[slot(c,loc,en) if c else None for c in plan[wd][t]]
            if mats==2:
                while len(cells)<2: cells.append(None)
            else: cells=[c for c in cells if c]
            rows[t]=cells
        days.append({'wd':wd,'name':(DN_EN if en else DN_DE)[wd],'date':'','rows':rows})
    return json.dumps({'days':days},ensure_ascii=False,separators=(',',':'))
def build_lndata(loc,en):
    out=[]
    for wd in DAYS:
        for t in sorted(P[loc][wd]):
            for c in P[loc][wd][t]:
                if c and c[0].startswith('Little Ninjas'): out.append({'wd':wd,'t':t,'n':disp(c[0],en),'lv':'%d Min'%mins(c[0]),'who':who(c[2])})
    return json.dumps(out,ensure_ascii=False,separators=(', ',': '))
def build_tool():
    T={'Boxing':'boxing','Wrestling':'wrestling','Muay Thai':'muaythai','MMA':'mma','Fitness Kickboxing':'fitnesskickboxing','BJJ':'bjj','BJJ (Gi)':'bjj','BJJ (No-Gi)':'bjj','Street Defense':'streetdefense','Striking':'striking'}
    lines=[]
    for loc,L in (('zurich','z'),('winterthur','w')):
        for i,wd in enumerate(DAYS,1):
            for t in sorted(P[loc][wd]):
                for c in P[loc][wd][t]:
                    if c and c[0] in T: lines.append((L,i,t,T[c[0]],'{loc:"%s",d:%d,s:"%s",disc:"%s",lv:"%s",coach:"%s"}'%(L,i,t,T[c[0]],c[1] or 'All Levels',CODE[c[2].split('+')[0]])))
    # Reihenfolge = Folie (Standort, Tag, Zeit, Matte A vor B); die Reihenfolge hat keinen Einfluss auf das Tool (Regressionslauf identisch)
    return '[\n'+',\n'.join(l[4] for l in lines)+'\n]'
NUM_DE=['','eine','zwei','drei','vier','fünf','sechs','sieben','acht','neun','zehn','elf','zwölf']
DISC_DE={'boxen':'Box','mma':'MMA','muay-thai':'Muay-Thai','ringen':'Ringer','bjj':'BJJ','fitness-kickboxen':'Fitness-Kickbox','street-defense':'Street-Defense'}
DISC_EN={'boxen':'boxing','mma':'MMA','muay-thai':'Muay Thai','ringen':'wrestling','bjj':'BJJ','fitness-kickboxen':'fitness kickboxing','street-defense':'Street Defense'}
NOLEVEL={'fitness-kickboxen','street-defense'}
def label(c,slug):
    n,lv,_=c
    if slug in NOLEVEL: return ''
    if n=='Striking': return 'Striking · Competition'
    if n=='BJJ': return 'Competition'
    if n.startswith('BJJ ('): return n[5:-1]+' · '+lv
    return lv
def build_zeiten(loc,slug,en):
    plan=P[loc]; items={}; comp=False; total=0
    for wd in DAYS:
        for t in sorted(plan[wd]):
            for c in plan[wd][t]:
                if c and c[0] in SLUG and SLUG[c[0]]==slug and not c[0].startswith(('Self','Little','Open')) and SLUG[c[0]]:
                    items.setdefault(wd,[]).append((t,label(c,slug))); total+=1; comp|=(c[1]=='Competition')
    if not total: return None
    city=('Zurich' if loc=='zurich' else 'Winterthur') if en else ('Zürich' if loc=='zurich' else 'Winterthur')
    if en:
        suf='' if slug in NOLEVEL else (', from basics to competition level' if comp else ', in basics and all-levels classes')
        sent='In %s we have %d %s session%s per week%s.'%(city,total,DISC_EN[slug],'' if total==1 else 's',suf)
    else:
        suf='' if slug in NOLEVEL else (', von der Basics-Klasse bis zur Competition-Klasse' if comp else ', in Basics- und All-Levels-Klassen')
        num=NUM_DE[total] if total<len(NUM_DE) else str(total)
        sent='In %s haben wir %s %s-Session%s pro Woche%s.'%(city,num,DISC_DE[slug],'' if total==1 else 's',suf)
    lis=''.join('<li><b>%s</b><span>%s</span></li>'%(WD_EN[wd] if en else wd,' &nbsp;·&nbsp; '.join(t+(' <small>%s</small>'%l if l else '') for t,l in items[wd])) for wd in DAYS if wd in items)
    link=('/en/%s/schedule/'%loc,'Full schedule &rarr;') if en else ('/%s/stundenplan/'%loc,'Ganzer Stundenplan &rarr;')
    return '<p class="sphint">%s</p><ul class="sptimes">%s</ul><a class="splink" href="%s">%s</a>'%(sent,lis,link[0],link[1])
def sub(s,pat,new,f):
    m=re.search(pat,s,re.S); assert m,(f,pat[:40]); return s[:m.start(1)]+new+s[m.end(1):]
changed=[]
def write(f,s):
    if open(f).read()!=s: open(f,'w').write(s); changed.append(f)
for loc in ('zurich','winterthur'):
    for en,f in ((False,'%s/stundenplan/index.html'%loc),(True,'en/%s/schedule/index.html'%loc)):
        s=open(f).read(); write(f,sub(s,r'<script id="spdata"[^>]*>(.*?)</script>',build_spdata(loc,en),f))
    for en,f in ((False,'%s/kurse/little-ninjas/index.html'%loc),(True,'en/%s/classes/little-ninjas/index.html'%loc)):
        s=open(f).read(); write(f,sub(s,r'<script id="lndata"[^>]*>(.*?)</script>',build_lndata(loc,en),f))
    for f in glob.glob('%s/kurse/*/index.html'%loc)+glob.glob('en/%s/classes/*/index.html'%loc):
        s=open(f).read()
        if 'id="zeiten"' not in s: continue
        en=f.startswith('en/'); slug=f.split('/')[-2]; slug={v:k for k,v in SLUG_EN.items()}.get(slug,slug)
        blk=build_zeiten(loc,slug,en)
        if blk is None: print('WARNUNG: keine Klassen fuer',f); continue
        i=s.find('id="zeiten"'); j=s.find('</section>',i); seg=s[i:j]
        m=re.search(r'(<div class="sptwrap[^>]*>)(.*?)(</div>)',seg,re.S); assert m,f
        seg=seg[:m.start(2)]+blk+seg[m.end(2):]; write(f,s[:i]+seg+s[j:])
f='training-plan/index.html'; s=open(f).read(); write(f,sub(s,r'const SCHEDULE\s*=\s*(\[.*?\]);',build_tool(),f))
print('geaendert:',len(changed)); [print('  ',c) for c in changed]
