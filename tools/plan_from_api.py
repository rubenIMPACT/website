#!/usr/bin/env python3
"""Holt den Nominalplan von /api/plan-nominal (Google-Slides-Decks via Apps Script) und schreibt data/plan-nominal.json.
Bricht ab (Exit 1), wenn die Folie nicht sauber lesbar war - dann bleibt die letzte gute Datei stehen."""
import json,sys,urllib.request,datetime
URL='https://www.impact-martialarts.com/api/plan-nominal?refresh=1'
import time
js=None
for attempt in range(1,4):  # das Google-Skript braucht 5-35 s und mag keine parallelen Abrufe: drei Versuche, 30 s Abstand
    try:
        req=urllib.request.Request(URL,headers={'User-Agent':'Mozilla/5.0 (plan-sync)','Accept':'application/json'})
        js=json.load(urllib.request.urlopen(req,timeout=180)); break
    except Exception as e:
        print(f'Versuch {attempt} fehlgeschlagen: {e}'); time.sleep(30)
if js is None: print('Plan nicht abrufbar'); sys.exit(1)
if not js.get('ok'): print('API-Fehler:',js); sys.exit(1)
if js.get('warnings'): print('Folie nicht sauber lesbar:'); [print(' ',w) for w in js['warnings']]; sys.exit(1)
for loc,minc in (('zurich',45),('winterthur',25)):
    n=sum(1 for wd in js[loc].values() for row in wd.values() for c in row if c)
    if n<minc: print(f'{loc}: nur {n} Zellen gelesen (Minimum {minc})'); sys.exit(1)
cur=json.load(open('data/plan-nominal.json'))
out={'source':cur.get('source',{}),'zurich':js['zurich'],'winterthur':js['winterthur']}
out['source']['synced']=datetime.date.today().strftime('%d.%m.%Y')+' aus den Slides (Apps Script)'
json.dump(out,open('data/plan-nominal.json','w'),ensure_ascii=False,indent=1)
print('plan-nominal.json aktualisiert:',{l:sum(1 for wd in js[l].values() for row in wd.values() for c in row if c) for l in ('zurich','winterthur')})
