import re,json,os,sys
WD=['Mo','Di','Mi','Do','Fr','Sa','So']; WDEN={'Mo':'Mon','Di':'Tue','Mi':'Wed','Do':'Thu','Fr':'Fri','Sa':'Sat','So':'Sun'}
SVG='<svg class="cb" viewBox="30 12 40 76" aria-hidden="true"><path d="M50.4 16.4 L37.4 50"/><path d="M56.7 16.4 L43.7 50"/><path d="M62.9 16.4 L37 83.5"/><path d="M56.2 50.1 L43.3 83.5"/></svg>'
BOLT='<svg class="chapbolt bolt bolt-draw" viewBox="30 12 40 76" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><path d="M50.4 16.4 L37.4 50"/><path d="M56.7 16.4 L43.7 50"/><path d="M62.9 16.4 L37 83.5"/><path d="M56.2 50.1 L43.3 83.5"/></svg>'
CSS=('.sportintro{max-width:860px}.sportintro p{color:var(--grey);font-size:17px;line-height:1.66;margin-top:15px}'
 '.sptwrap{margin-top:32px;border-top:1px solid var(--hair);padding-top:20px}'
 '.sptwrap h3{font-size:12px;letter-spacing:2.4px;text-transform:uppercase;color:var(--gold);font-weight:800}'
 '.sptwrap .sphint{margin-top:8px;font-size:16px}'
 '.sptimes{list-style:none;margin-top:14px;display:grid;gap:7px;max-width:640px}'
 '.sptimes li{display:grid;grid-template-columns:34px 1fr;gap:12px;font-size:15px;color:#fff;padding-bottom:7px;border-bottom:1px solid var(--hair)}'
 '.sptimes b{color:var(--gold);font-weight:800}.sptimes small{color:var(--grey)}'
 '.splink{display:inline-block;margin-top:16px;color:var(--gold);font-weight:600;font-size:15px;text-decoration:none}'
 '.splink:hover{text-decoration:underline}')
NAME={'mma':'MMA','muay-thai':'Muay Thai','boxen':'Boxen','bjj':'BJJ','ringen':'Wrestling','fitness-kickboxen':'Fitness Kickboxing','street-defense':'Street Defense'}
SLUG_EN={'mma':'mma','muay-thai':'muay-thai','boxen':'boxing','bjj':'bjj','ringen':'wrestling','fitness-kickboxen':'fitness-kickboxing','street-defense':'street-defense','personal-training':'personal-training'}

def sched(city):
    s=open(f'{city}/stundenplan/index.html').read()
    d=json.loads(re.search(r'id="spdata"[^>]*>(.*?)</script>',s,re.S).group(1))
    out={}
    for day in d['days']:
        for tm,items in day['rows'].items():
            for it in items:
                if not it or not it.get('href'): continue
                k=it['href'].rstrip('/').split('/')[-1]
                out.setdefault(k,[]).append((WD.index(day['wd']),tm,day['wd'],it.get('n',''),it.get('lv','').split('·')[0].strip()))
    for k in out: out[k].sort()
    return out
SCHED={'zurich':sched('zurich'),'winterthur':sched('winterthur')}

def label(slug,n,lv):
    base=NAME.get(slug,''); rest=n.replace(base,'').strip(' -–()')
    rest=rest.replace('(','').replace(')','')
    parts=[p for p in (rest,lv) if p and p!='60 Min' and p!='45 Min']
    return ' · '.join(parts)

def times_html(slug,city,lang):
    rows=SCHED[city].get(slug,[])
    if not rows: return ''
    byday={}
    for _,tm,wd,n,lv in rows:
        l=label(slug,n,lv)
        byday.setdefault(wd,[]).append(f'{tm}'+(f' <small>{l}</small>' if l else ''))
    lis=''
    for wd in WD:
        if wd not in byday: continue
        d=WDEN[wd] if lang=='en' else wd
        lis+=f'<li><b>{d}</b><span>'+' &nbsp;·&nbsp; '.join(byday[wd])+'</span></li>'
    plan='/'+('en/' if lang=='en' else '')+city+('/schedule/' if lang=='en' else '/stundenplan/')
    h3='When we train' if lang=='en' else 'Wann trainiert wird'
    lk='Full schedule &rarr;' if lang=='en' else 'Ganzer Stundenplan &rarr;'
    return ('<div class="sptwrap rev"><h3>'+h3+'</h3>{HINT}<ul class="sptimes">'+lis+'</ul>'
            f'<a class="splink" href="{plan}">{lk}</a></div>')

LEKT={'mma':'MMA-Lektionen','muay-thai':'Muay-Thai-Lektionen','boxen':'Boxlektionen','bjj':'BJJ-Lektionen','ringen':'Ringer-Lektionen','fitness-kickboxen':'Fitness-Kickbox-Lektionen','street-defense':'Street-Defense-Lektionen'}
LEKT1={'mma':'MMA-Lektion','muay-thai':'Muay-Thai-Lektion','boxen':'Boxlektion','bjj':'BJJ-Lektion','ringen':'Ringer-Lektion','fitness-kickboxen':'Fitness-Kickbox-Lektion','street-defense':'Street-Defense-Lektion'}
LEKT_EN={'mma':'MMA','muay-thai':'Muay Thai','boxen':'boxing','bjj':'BJJ','ringen':'wrestling','fitness-kickboxen':'fitness kickboxing','street-defense':'Street Defense'}
def hint(slug,city,lang,disc_de,disc_en):
    rows=SCHED[city].get(slug,[])
    if not rows: return ''
    n=len(rows); lv={r[4] for r in rows}
    cityname={'zurich':('Zürich','Zurich'),'winterthur':('Winterthur','Winterthur')}[city]
    NUM_DE={1:'eine',2:'zwei',3:'drei',4:'vier',5:'fünf',6:'sechs',7:'sieben',8:'acht',9:'neun',10:'zehn',11:'elf',12:'zwölf',13:'dreizehn',14:'vierzehn'}
    if lang=='de':
        z=NUM_DE.get(n,str(n)); word=(LEKT1 if n==1 else LEKT)[slug]
        lvtxt=', von der Basics-Klasse bis zur Competition-Klasse' if 'Competition' in lv else (', in Basics- und All-Levels-Klassen' if 'Basics' in lv else '')
        verb='ist das' if n==1 else 'sind das'
        return f'<p class="sphint">In {cityname[0]} {verb} {z} {word} pro Woche{lvtxt}.</p>'
    word='class' if n==1 else 'classes'
    lvtxt=', from basics to competition level' if 'Competition' in lv else (', in basics and all-levels classes' if 'Basics' in lv else '')
    return f'<p class="sphint">In {cityname[1]} that is {n} {LEKT_EN[slug]} {word} per week{lvtxt}.</p>'

C={
'mma':{'de':{'t':'MMA','ban':['STAND-UP &amp; BODEN','FLIESSENDER ÜBERGANG','EINSTEIGERFREUNDLICH','UNTERSTÜTZENDES UMFELD'],
  'p':['MMA verbindet drei Bereiche: Schlagen und Treten im Stand, Takedowns aus dem Ringen und Kontrolle am Boden aus dem Brazilian Jiu-Jitsu. Du musst nicht in allen dreien perfekt sein. Du lernst, sie zu verbinden, um gezielt die Schwächen des Gegners auszunutzen.',
        'Lockeres Sparring gehört dazu. Es geht nicht ums Gewinnen, sondern darum, dass du besser wirst.',
        'Ein Wettkampfteam ist im Aufbau. Einige bestreiten gerade ihre ersten Kämpfe. Wenn du dabei sein willst, ist jetzt der richtige Moment.'],
  'faq':('Wie läuft eine Lektion ab?','Eine Lektion dauert 60 Minuten: aufwärmen, Technik mit dem Partner, dann Anwendung. Basics-Klassen sind für den Einstieg, All-Levels-Klassen für alle, die schon trainieren.')},
 'en':{'t':'MMA','ban':['STAND-UP &amp; GROUND','SEAMLESS TRANSITIONS','BEGINNER-FRIENDLY','SUPPORTIVE ENVIRONMENT'],
  'p':['MMA combines three areas: striking and kicking on the feet, takedowns from wrestling and control on the ground from Brazilian Jiu-Jitsu. You do not have to be perfect in all three. You learn to connect them and to use your opponent’s weaknesses.',
        'Light sparring is part of it. It is not about winning, it is about getting better.',
        'A competition team is taking shape. A few members are having their first fights. If you want to be part of it, now is the moment.'],
  'faq':('How does a class work?','A class lasts 60 minutes: warm-up, technique with a partner, then application. Basics classes are for getting started, all-levels classes for everyone who already trains.')}},
'muay-thai':{'de':{'t':'Muay Thai','ban':['KUNST DER ACHT GLIEDMASSEN','TECHNIK &amp; RESPEKT','EINSTEIGERFREUNDLICH','WETTKAMPFTEAM','UNTERSTÜTZENDES UMFELD'],
  'p':['Muay Thai / Thaiboxen arbeitet mit Fäusten, Ellbogen, Knien und Schienbeinen. Daher der Name: die Kunst der acht Gliedmassen. Angewendet werden kann im Clinch oder auf Distanz.',
        'Sparring gehört dazu, locker und technisch. Es geht nicht ums Gewinnen, sondern darum, dass du besser wirst.',
        'Wer in den Wettkampf will, trainiert im Wettkampfteam mit. Voraussetzung ist Commitment: mindestens drei Trainings pro Woche, besser mehr.'],
  'faq':('Wie läuft eine Lektion ab?','Eine Lektion dauert 60 Minuten: aufwärmen, Technik mit dem Partner, Pratzenarbeit, dann Runden. Basics-Klassen sind für den Einstieg, All-Levels-Klassen für alle, die schon trainieren.')},
 'en':{'t':'Muay Thai','ban':['ART OF EIGHT LIMBS','TECHNIQUE &amp; RESPECT','BEGINNER-FRIENDLY','COMPETITION TEAM','SUPPORTIVE ENVIRONMENT'],
  'p':['Muay Thai, also called Thai boxing, uses fists, elbows, knees and shins. Hence the name: the art of eight limbs. It works in the clinch and at distance.',
        'Sparring is part of it, light and technical. It is not about winning, it is about getting better.',
        'If you want to compete, you train with the competition team. It takes commitment: at least three sessions a week, better more.'],
  'faq':('How does a class work?','A class lasts 60 minutes: warm-up, technique with a partner, pad work, then rounds. Basics classes are for getting started, all-levels classes for everyone who already trains.')}},
'boxen':{'de':{'t':'Boxen','ban':['TIMING SCHLÄGT KRAFT','SAUBERE TECHNIK','EINSTEIGERFREUNDLICH','SPARRING MIT KONTROLLE'],
  'p':['Boxen ist der Kampfsport mit den Fäusten: Schläge, Beinarbeit, Deckung, Distanz. Wer boxen lernt, arbeitet gleichzeitig an sauberer Technik, an Ausdauer und daran, unter Druck ruhig zu bleiben.',
        'Sparring gehört dazu, locker und technisch. Es geht nicht ums Gewinnen, sondern darum, dass du besser wirst.'],
  'faq':('Wie läuft eine Lektion ab?','Eine Lektion dauert 60 Minuten: aufwärmen, Technik mit dem Partner und an den Pratzen, dann Runden. Basics-Klassen sind für den Einstieg, All-Levels-Klassen für alle, die schon boxen.')},
 'en':{'t':'Boxing','ban':['TIMING BEATS POWER','CLEAN TECHNIQUE','BEGINNER-FRIENDLY','CONTROLLED SPARRING'],
  'p':['Boxing is the martial art of the fists: punches, footwork, guard, distance. Learning to box means working on clean technique, on stamina and on staying calm under pressure.',
        'Sparring is part of it, light and technical. It is not about winning, it is about getting better.'],
  'faq':('How does a class work?','A class lasts 60 minutes: warm-up, technique with a partner and on the pads, then rounds. Basics classes are for getting started, all-levels classes for everyone who already boxes.')}},
'bjj':{'de':{'t':'BJJ','ban':['KEIN EGO','TECHNIK STATT KRAFT','EINSTEIGERFREUNDLICH','BLACK BELT COACHING'],
  'p':['Brazilian Jiu-Jitsu ist Bodenkampf. Es geht nicht darum, härter zuzuschlagen, sondern das Gegenüber zu kontrollieren, bis es aufgibt. Deshalb funktioniert BJJ auch gegen grössere und stärkere Leute.',
        'Trainiert wird im Gi, also im Kimono, und im No-Gi ohne Kimono. Beides hat eigene Klassen.',
        'Es gibt eine Graduierung: Wer fleissig und ausdauernd dabeibleibt, wird von João graduiert. Und es gibt ein Wettkampfteam für alle, die antreten wollen. Voraussetzung ist Commitment: mindestens drei Trainings pro Woche, besser mehr.'],
  'zh_extra':'Die Open Mat ist freies Training ohne Unterricht, offen für alle Level, auch für Anfänger.',
  'faq':('Wie läuft eine Lektion ab?','Eine Lektion dauert 60 Minuten: aufwärmen, Technik mit dem Partner, dann Rollen, also freies Üben mit Widerstand. Basics-Klassen sind für den Einstieg, All-Levels-Klassen für alle, die schon trainieren.')},
 'en':{'t':'BJJ','ban':['NO EGO','TECHNIQUE OVER STRENGTH','BEGINNER-FRIENDLY','BLACK BELT COACHING'],
  'p':['Brazilian Jiu-Jitsu is ground fighting. It is not about hitting harder, it is about controlling your opponent until they tap. That is why BJJ works against bigger and stronger people.',
        'We train in the Gi, the kimono, and No-Gi without it. Both have their own classes.',
        'There is a grading system: whoever stays consistent and puts in the work gets graded by João. And there is a competition team for everyone who wants to compete. It takes commitment: at least three sessions a week, better more.'],
  'zh_extra':'The open mat is free training without instruction, open to all levels, beginners included.',
  'faq':('How does a class work?','A class lasts 60 minutes: warm-up, technique with a partner, then rolling, which is free practice with resistance. Basics classes are for getting started, all-levels classes for everyone who already trains.')}},
'ringen':{'de':{'t':'Ringen','ban':['TAKEDOWNS &amp; KONTROLLE','EXPLOSIVE KRAFT','EINSTEIGERFREUNDLICH','BUNDESLIGA-COACH'],
  'p':['Ringen ist der Kampf um die bessere Position: Takedowns, das Gegenüber zu Boden bringen und dort kontrollieren. Es ist die Grundlage, die im MMA oft den Unterschied macht, und eines der besten Kraft- und Ausdauertrainings, das es gibt.'],
  'faq':('Wie läuft eine Lektion ab?','Eine Lektion dauert 60 Minuten: aufwärmen, Technik mit dem Partner, dann Anwendung mit Widerstand. Basics-Klassen sind für den Einstieg, All-Levels-Klassen für alle, die schon ringen.')},
 'en':{'t':'Wrestling','ban':['TAKEDOWNS &amp; CONTROL','EXPLOSIVE POWER','BEGINNER-FRIENDLY','BUNDESLIGA COACH'],
  'p':['Wrestling is the fight for the better position: takedowns, putting your opponent on the ground and controlling them there. It is the base that often decides an MMA fight, and one of the best strength and conditioning workouts there is.'],
  'faq':('How does a class work?','A class lasts 60 minutes: warm-up, technique with a partner, then application with resistance. Basics classes are for getting started, all-levels classes for everyone who already wrestles.')}},
'fitness-kickboxen':{'de':{'t':'Fitness Kickboxen','ban':['KEIN KONTAKT','SPASS','KRAFT &amp; AUSDAUER','HANDSCHUHE INKLUSIVE'],
  'p':['Fitness Kickboxen ist Kickboxen, ohne getroffen zu werden. Du lernst echte Schlag- und Tritttechnik auf Pratzen und Sandsäcke. Kein Sparring, kein Wettkampf, kein Vorwissen nötig.',
        'Die Klassen sind gemischt, alle Level trainieren zusammen, und du steigst jederzeit ein. Über 60 Prozent der Teilnehmenden sind Frauen.'],
  'faq':('Wie läuft eine Lektion ab?','Eine Lektion dauert 60 Minuten und ist von vorne bis hinten in Bewegung: aufwärmen, Technik, Runden an den Pratzen, Kraftteil.')},
 'en':{'t':'Fitness Kickboxing','ban':['NO CONTACT','SUPER FUN','STRENGTH &amp; ENDURANCE','GLOVES INCLUDED'],
  'p':['Fitness kickboxing is kickboxing without getting hit. You learn real punching and kicking technique on pads and bags. No sparring, no competition, no experience needed.',
        'The classes are mixed, all levels train together, and you can join any time. More than 60 percent of the people in them are women.'],
  'faq':('How does a class work?','A class lasts 60 minutes and keeps moving from start to finish: warm-up, technique, rounds on the pads, strength work.')}},
'street-defense':{'de':{'t':'Street Defense','ban':['FÜR DEN ERNSTFALL','EINFACH &amp; WIRKSAM','KEIN VORWISSEN NÖTIG','RUHE UNTER DRUCK'],
  'p':['Street Defense ist Selbstverteidigung für echte Situationen, nicht für den Ring. Es geht um wenige, einfache Techniken, die auch unter Stress funktionieren, und darum, eine Situation früh zu erkennen und zu entschärfen.',
        'Trainiert wird in Szenarien statt nach Wettkampfregeln: enge Distanz, mehrere Personen, überraschter Start.'],
  'faq':('Wie läuft eine Lektion ab?','Eine Lektion dauert 60 Minuten: aufwärmen, Technik mit dem Partner, dann Szenarien.')},
 'en':{'t':'Street Defense','ban':['FOR REAL SITUATIONS','SIMPLE &amp; EFFECTIVE','NO EXPERIENCE NEEDED','CALM UNDER PRESSURE'],
  'p':['Street Defense is self-defence for real situations, not for the ring. It is about a few simple techniques that still work under stress, and about spotting a situation early and defusing it.',
        'We train in scenarios instead of competition rules: close distance, several people, a surprise start.'],
  'faq':('How does a class work?','A class lasts 60 minutes: warm-up, technique with a partner, then scenarios.')}},
'personal-training':{'de':{'t':'Personal Training','ban':['1 ZU 1','DEIN ZIEL, DEIN TEMPO','JEDE SPORTART','TERMIN NACH ABSPRACHE'],
  'p':['Im Personal Training trainierst du allein mit einem Coach. Kein Gruppentempo, keine Rücksicht auf andere Level. Der Coach schaut nur auf dich und korrigiert jede Wiederholung.',
        'Möglich ist das in allen Sportarten, die wir unterrichten: Boxen, Muay Thai, MMA, BJJ, Ringen oder reines Fitnesstraining. Auch als Ergänzung zu den Gruppenklassen, wenn du an einer bestimmten Sache arbeiten willst.',
        'Termine vereinbarst du individuell mit dem Coach.'],'faq':None},
 'en':{'t':'Personal Training','ban':['ONE ON ONE','YOUR GOAL, YOUR PACE','ANY DISCIPLINE','BY ARRANGEMENT'],
  'p':['In personal training you train alone with a coach. No group pace, no compromise on level. The coach only watches you and corrects every repetition.',
        'This works in every discipline we teach: boxing, Muay Thai, MMA, BJJ, wrestling or pure fitness training. It also works alongside the group classes when you want to work on one specific thing.',
        'You arrange your sessions individually with the coach.'],'faq':None}},
}

def jesc(t): return t.replace('\\','\\\\').replace('"','\\"')
def build(path,slug,city,lang):
    s=open(path).read(); orig=s; c=C[slug][lang]
    # --- 1) Banner
    m=re.search(r'(<div class="claimband"><ul>)(.*?)(</ul>)',s,re.S)
    if m:
        lis=''.join(f'\n<li class="rev">{SVG}{x}</li>' for x in c['ban'])
        s=s[:m.start(2)]+lis+'\n'+s[m.end(2):]
    # --- 2) Beschreibungsblock + Zeiten
    ps=list(c['p'])
    if slug=='bjj' and city=='zurich' and c.get('zh_extra'): ps.insert(2,c['zh_extra'])
    idx='THE DISCIPLINE' if lang=='en' else 'DIE SPORTART'
    h2=(f'What to expect from <span class="accent">{c["t"]}</span>.' if lang=='en'
        else f'Was dich beim <span class="accent">{c["t"]}</span> erwartet.')
    tm=times_html(slug,city,lang).replace('{HINT}',hint(slug,city,lang,c['t'],C[slug]['en']['t'].lower())) if slug!='personal-training' else ''
    sec=('\n<section class="chapter" id="sportart">\n<div class="chaphead">\n'+BOLT+
         f'\n<div class="idx rev">{idx}</div>\n<h2 class="rev">{h2}</h2>\n</div>\n<div class="hairpair rev"></div>\n'
         '<div class="sportintro">'+''.join(f'<p class="rev">{x}</p>' for x in ps)+tm+'</div>\n</section>\n')
    anchor='<section class="chapter" id="beweis">'
    assert anchor in s, ('kein beweis-Anker',path)
    s=s.replace(anchor,sec+anchor,1)
    # --- 3) FAQ
    if c['faq']:
        q,a=c['faq']
        det=f'<details><summary>{q}</summary><p>{a}</p></details>'
        anc='<details><summary>'+('How do I sign up?' if lang=='en' else 'Wie melde ich mich an?')+'</summary>'
        assert anc in s,('kein FAQ-Anker',path)
        s=s.replace(anc,det+anc,1)
        jq='{"@type": "Question", "name": "'+('How do I sign up?' if lang=='en' else 'Wie melde ich mich an?')+'"'
        assert jq in s,('kein JSON-Anker',path)
        s=s.replace(jq,'{"@type": "Question", "name": "'+jesc(q)+'", "acceptedAnswer": {"@type": "Answer", "text": "'+jesc(a)+'"}}, '+jq,1)
    # --- 4) CSS
    assert '</style>' in s
    s=s.replace('</style>','\n'+CSS+'\n</style>',1)
    if s!=orig: open(path,'w').write(s); return True
    return False

if __name__=='__main__':
    jobs=[]
    for slug in C:
        for city in ('zurich','winterthur'):
            de=f'{city}/kurse/{slug}/index.html'
            en=f'en/{city}/classes/{SLUG_EN[slug]}/index.html'
            if os.path.exists(de): jobs.append((de,slug,city,'de'))
            if os.path.exists(en): jobs.append((en,slug,city,'en'))
    n=0
    for j in jobs:
        if build(*j): n+=1; print('gebaut:',j[0])
    print('Seiten gebaut:',n,'von',len(jobs))
