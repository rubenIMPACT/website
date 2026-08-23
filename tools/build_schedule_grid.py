# -*- coding: utf-8 -*-
"""Stundenplan: gemeinsame Zeitachse links, Tage als Spalten. Einmalige Migration der
statischen .dayblock-Markups nach JSON + neuer Renderer (statisch + live)."""
import re, json, sys, html

CSS_OLD_START = '/* zeitraster */'
CSS_OLD_END = '/* teamdd */'

NEW_CSS = '''/* zeitraster: eine Zeitachse links, Tage als Spalten */
.spgrid{display:grid;gap:8px 16px;padding:0 var(--mx);align-items:stretch;--tcol:46px}
.spgrid .tt{color:var(--gold);font-weight:800;font-size:15px;padding-top:12px;white-space:nowrap}
.spgrid .dh .dn{font-weight:800;font-size:15px;letter-spacing:1.5px;text-transform:uppercase;margin:6px 0 10px;color:var(--white)}
.spgrid .dh .dn i{font-style:normal;color:var(--grey);font-weight:400;font-size:12px;margin-left:8px}
.spgrid .dh .mh{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.spgrid .dh .mh b{color:var(--gold);font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:700}
.spgrid .dc{display:grid;gap:8px;align-content:stretch}
.spgrid .dc.m2{grid-template-columns:1fr 1fr}
.sess{display:block;border:1px solid var(--hair);padding:11px 12px;background:rgba(255,255,255,.02);transition:border-color .2s}
.sess:hover{border-color:var(--gold)}
.sess .n{font-weight:800;font-size:14px;line-height:1.25;display:block}
.sess .lv{color:var(--grey);font-size:10.5px;text-transform:uppercase;letter-spacing:.8px;display:block;margin-top:3px}
.sess .who{color:var(--gold);font-size:11.5px;display:block;margin-top:5px}
.slot.empty{border:1px dashed rgba(255,255,255,.06)}
@media(max-width:999px){.spgrid{gap:6px 10px}}
@media(max-width:559px){.spgrid{--tcol:40px;gap:6px 8px}.spgrid .tt{font-size:13px}.sess{padding:9px 9px}.sess .n{font-size:12.5px}.spgrid .dh .dn{font-size:13px}}
.daytabs.hidden{display:none}
.spnote{padding:26px var(--mx) 60px;color:var(--white);font-size:clamp(17px,2vw,21px);font-weight:500}

'''

JS = r'''<script>
(function(){
var LOC='%(loc)s',MATS=%(mats)s;
var DN={'Mo':'Montag','Di':'Dienstag','Mi':'Mittwoch','Do':'Donnerstag','Fr':'Freitag','Sa':'Samstag','So':'Sonntag'};
var grid=document.getElementById('spgrid'),tabs=document.querySelector('.daytabs');
var days=JSON.parse(document.getElementById('spdata').textContent).days;
var cur=0;
function per(){var w=window.innerWidth;if(MATS===2)return w>=1000?3:1;return w>=1000?Math.max(1,days.length):2}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;')}
function card(s){if(!s)return '<span class="slot empty"></span>';
 return '<a class="sess slot" href="'+esc(s.href)+'"><span class="n">'+esc(s.n)+'</span><span class="lv">'+esc(s.lv)+'</span><span class="who">'+esc(s.who)+'</span></a>';}
function render(){
  var p=per();cur=Math.max(0,Math.min(cur,days.length-p));
  var vis=days.slice(cur,cur+p);
  var times={};vis.forEach(function(d){Object.keys(d.rows).forEach(function(t){times[t]=1})});
  var tl=Object.keys(times).sort();
  var h='<div class="corner"></div>';
  vis.forEach(function(d){h+='<div class="dh"><div class="dn">'+esc(d.name)+(d.date?'<i>'+esc(d.date)+'</i>':'')+'</div>'+(MATS===2?'<div class="mh"><b>Mat A</b><b>Mat B</b></div>':'')+'</div>'});
  tl.forEach(function(t){
    h+='<div class="tt">'+esc(t)+'</div>';
    vis.forEach(function(d){var items=d.rows[t]||[];
      if(MATS===2){while(items.length<2)items=items.concat([null]);h+='<div class="dc m2">'+items.map(card).join('')+'</div>';}
      else{h+='<div class="dc">'+(items.length?items.map(card).join(''):card(null))+'</div>';}
    });
  });
  grid.style.gridTemplateColumns='var(--tcol) repeat('+p+',1fr)';
  grid.innerHTML=h;
  var bts=tabs.querySelectorAll('button');
  bts.forEach(function(b,j){b.classList.toggle('on',j>=cur&&j<cur+p)});
  tabs.classList.toggle('hidden',p>=days.length);
}
function buildTabs(){tabs.innerHTML='';days.forEach(function(d,i){var b=document.createElement('button');
  b.innerHTML=esc(d.wd)+(d.date?'<br><span style="font-size:10px;font-weight:400">'+esc(d.date)+'</span>':'');
  b.addEventListener('click',function(){cur=i;render()});tabs.appendChild(b)});}
buildTabs();
var wd=new Date().getDay();var map={1:0,2:1,3:2,4:3,5:4,6:5,0:0};cur=map[wd]<days.length?map[wd]:0;
render();
var rt;window.addEventListener('resize',function(){clearTimeout(rt);rt=setTimeout(render,80)});
/* Live-Layer: ersetzt die statischen Daten durch den exercise.com-Kalender */
fetch('/api/schedule?loc='+LOC).then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(j){
  if(!j.days||!j.days.length)return;
  days=j.days.map(function(day){var rows={};
    day.sessions.forEach(function(s){(rows[s.time]=rows[s.time]||[]).push({
      n:s.name,lv:(s.level?s.level+' · ':'')+s.mins+' Min',who:s.coach||'Alle Levels offen',
      href:s.slug?('/'+LOC+'/kurse/'+s.slug+'/'):('/'+LOC+'/kurse/')})});
    return {wd:day.wd,name:DN[day.wd]||day.wd,date:day.date.slice(8,10)+'.'+day.date.slice(5,7)+'.',rows:rows};
  });
  cur=0;buildTabs();render();
}).catch(function(){});
})();/*spgrid*/</script>'''

def parse_days(s):
    days=[]
    for m in re.finditer(r'<div class="dayblock" data-day="([^"]+)">(.*?)</div>\n</div>', s, re.S):
        name=m.group(1); body=m.group(2)
        rows={}
        for tr in re.finditer(r'<div class="trow"><span class="tt">([^<]*)</span>(.*?)(?:</div>|$)', body, re.S):
            t=tr.group(1).strip(); inner=tr.group(2)
            items=[]
            for sl in re.finditer(r'<a class="sess slot" href="([^"]+)"><span class="n">(.*?)</span><span class="lv">(.*?)</span><span class="who">(.*?)</span></a>|<span class="slot empty"></span>', inner, re.S):
                if sl.group(1):
                    items.append({'n':html.unescape(sl.group(2)),'lv':html.unescape(sl.group(3)),'who':html.unescape(sl.group(4)),'href':sl.group(1)})
                else:
                    items.append(None)
            if not t:  # Fortsetzungszeile (>2 Slots gleiche Zeit)
                t=list(rows.keys())[-1]
                rows[t]+=items
            else:
                rows[t]=items
        wd={'Montag':'Mo','Dienstag':'Di','Mittwoch':'Mi','Donnerstag':'Do','Freitag':'Fr','Samstag':'Sa','Sonntag':'So'}[name]
        days.append({'wd':wd,'name':name,'date':'','rows':rows})
    return days

def transform(path, loc, mats):
    s=open(path,encoding='utf-8').read()
    days=parse_days(s)
    assert len(days)>=6, (path,len(days))
    if mats==1:
        # Winterthur: Leerslots am Ende entfernen (eine Matte)
        for d in days:
            for t,items in d['rows'].items():
                while items and items[-1] is None: items.pop()
    # CSS
    a=s.index(CSS_OLD_START); b=s.index(CSS_OLD_END)
    s=s[:a]+NEW_CSS+s[b:]
    # Markup: .spdays ... bis </div> vor <p class="spnote">
    m=re.search(r'<div class="spdays">.*?</div>\n<p class="spnote">[^<]*</p>', s, re.S)
    assert m, path
    data=json.dumps({'days':days},ensure_ascii=False,separators=(',',':')).replace('</','<\\/')
    new='<div class="spgrid" id="spgrid"></div>\n<script id="spdata" type="application/json">'+data+'</script>\n<p class="spnote">Klick auf eine Stunde für Details zur Disziplin.</p>'
    s=s[:m.start()]+new+s[m.end():]
    # Scripts
    s,n1=re.subn(r'<script>\n\(function\(\)\{var tabs=document\.querySelectorAll\(\'\.daytabs button\'\).*?\}\)\(\);/\*sptabs\*/</script>\n','',s,flags=re.S); assert n1==1,(path,'sptabs')
    s,n2=re.subn(r'<script>\n\(function\(\)\{\nvar LOC=.*?\}\)\(\);/\*splive\*/</script>', JS%{'loc':loc,'mats':mats}, s, flags=re.S); assert n2==1,(path,'splive')
    open(path,'w',encoding='utf-8').write(s)
    print(path, 'days', len(days), 'sessions', sum(len([x for it in d['rows'].values() for x in it if x]) for d in days))

if __name__=='__main__':
    transform('zurich/stundenplan/index.html','zurich',2)
    transform('winterthur/stundenplan/index.html','winterthur',1)
