#!/usr/bin/env python3
"""Regression check for the Training-Plan tool: loads training-plan/index.html headless (Playwright, repo .venv)
with share-link query strings and prints the rendered plan (contact, sessions, home sessions, notes).
Run: .venv/bin/python tools/training-plan-check.py [extra query strings]"""
import os,sys
from playwright.sync_api import sync_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL='file://'+os.path.join(ROOT,'training-plan','index.html')
CASES=[
 # Rubens Faelle vom 03.09.2026
 'loc=z&g=defense&a=explore&l=intermediate&f=2&w=evening,morning,midday&o=strength&of=2',
 'loc=z&g=defense&a=explore&l=beginner&f=1&w=evening,morning&o=nothing',
 'loc=w&g=defense&a=muaythai&l=beginner&f=3&w=evening&o=nothing',
 'loc=z&g=defense&a=mma&l=beginner&f=6&w=evening&o=strength&of=3',
 'loc=w&g=compete&a=fitnesskickboxing&l=beginner&f=3&w=evening&o=nothing',
 # Randfaelle
 'loc=w&g=defense&a=explore&l=beginner&f=2&w=early,late&o=nothing',
 'loc=z&g=defense&a=explore&l=beginner&f=2&w=morning,midday&o=nothing',
 'loc=z&g=learn&a=mma&l=intermediate&f=6&w=morning,midday,early,late&o=nothing',
 'loc=z&g=compete&a=mma&l=advanced&f=5&w=morning,midday,early,late&o=strength&of=2',
 'loc=w&g=learn&a=bjj&l=beginner&f=6&w=morning,midday,early,late&o=cardio&of=2',
 'loc=z&g=fit&a=muaythai&l=beginner&f=5&w=early,late&o=strength&of=2',
 'loc=z&g=learn&a=bjj&l=beginner&f=1&w=late&o=strength&of=1',
 'loc=z&g=learn&a=boxing,bjj&l=intermediate&f=4&w=early,late&o=nothing',
 'loc=z&g=fit&a=muaythai&l=beginner&f=3&w=early&o=nothing',
]+sys.argv[1:]
JS=r"""()=>{const o=document.getElementById('out');if(!o.innerHTML.trim())return '(no output)';
 const t=el=>el?el.innerText.replace(/\s+/g,' ').trim():'';
 const L=[];L.push('contact: '+t(o.querySelector('.hero .coach')).slice(0,80));
 o.querySelectorAll('.week .row').forEach(r=>{const dy=t(r.querySelector('.dy'));const b=r.querySelector('.blk');
   if(!b){L.push('   '+dy+'  REST');return;}
   L.push('   '+(dy||'   ')+'  '+t(b.querySelector('.tm'))+'  '+t(b.querySelector('.ti'))+(b.classList.contains('edge')?'  [?]':''));});
 o.querySelectorAll('.edgenote,.shortnote').forEach(n=>L.push('   note: '+t(n)));
 L.push('   S&C: '+t(o.querySelector('.advisory')).replace(/^Strength & Conditioning /,''));
 L.push('   '+t(o.querySelector('.foot')));return L.join('\n');}"""
with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':390,'height':844});errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    for c in CASES:
        pg.goto(URL+'?'+c);pg.wait_for_timeout(350)
        print('### '+c);print(pg.evaluate(JS));print()
    print('win buttons:',pg.evaluate("()=>[...document.querySelectorAll('#win .choice')].map(b=>b.dataset.v).join(',')"))
    print('page errors:',errs or 'none')
    b.close()
