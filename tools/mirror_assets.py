# Mirror all Webflow-CDN images into the repo and rewrite references.
import os, re, hashlib, urllib.request, urllib.parse
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(os.path.join(ROOT,'assets','wf'),exist_ok=True)
PAT=re.compile(r'https://cdn\.prod\.website-files\.com/[^"\'\s]+')
seen={}
def local_name(url):
    clean=urllib.parse.unquote(url.split('?')[0])
    base=re.sub(r'[^A-Za-z0-9.-]+','-',clean.split('/')[-1])[-80:]
    h=hashlib.md5(url.encode()).hexdigest()[:8]
    return f'{h}-{base}'
changed=0
for dirpath,dirs,files in os.walk(ROOT):
    if '.git' in dirpath or os.path.join('assets','wf') in dirpath: continue
    for fn in files:
        if not fn.endswith('.html'): continue
        p=os.path.join(dirpath,fn)
        d=open(p,encoding='utf-8').read(); orig=d
        for url in sorted(set(PAT.findall(d))):
            if url not in seen:
                name=local_name(url); dest=os.path.join(ROOT,'assets','wf',name)
                if not os.path.exists(dest):
                    try:
                        req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
                        data=urllib.request.urlopen(req,timeout=30).read()
                        assert data, 'leer'
                        open(dest,'wb').write(data)
                        print('downloaded',name)
                    except Exception as e:
                        print('SKIP',url,e); continue
                seen[url]=name
            rel=os.path.relpath(os.path.join(ROOT,'assets','wf',seen[url]),dirpath).replace('\\','/')
            d=d.replace(url,rel)
        if d!=orig:
            open(p,'w',encoding='utf-8').write(d); changed+=1
print('rewrote',changed,'files,',len(seen),'assets')
