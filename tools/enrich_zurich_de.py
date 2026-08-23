# -*- coding: utf-8 -*-
"""Enrich /zurich/kurse/* (DE) reusing Winterthur content (CMS-verified identical texts), Zurich-specific images."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import enrich_winterthur_de as W   # runs generate_site + winterthur enrich (idempotent), exposes C, rt, wl, RT_CSS
G = W.G

ZH_IMG = {  # zurich-specific main images from CMS; others inherit winterthur image
 'mma':'https://cdn.prod.website-files.com/651f0961164dd76d2ce8fd62/6a5471b4fcb510891c8293be_IMPACT%20Website%20(15).png',
 'bjj':'https://cdn.prod.website-files.com/651f0961164dd76d2ce8fd62/6a356dcf3df09853ce27ab4c_IMPACT%20Website%20(15).png',
 'boxen':'https://cdn.prod.website-files.com/651f0961164dd76d2ce8fd62/6a5480a3bb57d6bfa9b37b0e_IMPACT%20Website%20(32).png',
 'muay-thai':'https://cdn.prod.website-files.com/651f0961164dd76d2ce8fd62/6a54854cfe09ac6b2922c5a8_IMPACT%20Website%20(33).png',
 'ringen':'https://cdn.prod.website-files.com/651f0961164dd76d2ce8fd62/6a548a3b90c3dfa2b79690d2_IMPACT%20Website%20(41).png',
}
NAMES = dict((s,(n,d)) for s,n,d in G.COURSES['de'])
t = G.T['de']
for slug, c in W.C.items():
    name, desc = NAMES[slug]
    img = ZH_IMG.get(slug, c['img'])
    trial = G.TRIAL_READY.get(('de','winterthur',slug), '/probetraining/')  # LPs cover both locations via dropdown
    quote = '<section class="bigq"><p class="rev">%s</p></section>'%c['quote'] if c['quote'] else ''
    q2 = '<section class="bigq deep" style="max-width:none"><p class="rev" style="max-width:1000px">%s</p></section>'%c['why_rt2'] if c['why_rt2'] else ''
    faqs=''.join('<details><summary>%s</summary><p>%s</p></details>'%qa for qa in c['faq'])
    body = W.RT_CSS
    body += '<div class="photo rev coursephoto" style="aspect-ratio:1584/894;max-width:1100px;margin-left:auto;margin-right:auto"><img src="%s" alt="%s bei IMPACT Zürich" loading="lazy" style="width:100%%;height:100%%;object-fit:cover" onerror="this.parentNode.remove()"></div>'%(img,name)
    body += '<section class="chapter"><div class="chaphead">%s<div class="idx rev">DIE DISZIPLIN</div><h2 class="rev">%s</h2></div><div class="rt rev">%s</div>%s</section>'%(G.bolt(),c['what_h'],W.rt(c['rt_what']),W.wl(c['learn']))
    body += quote
    body += '<section class="chapter deep" style="padding-bottom:90px"><div class="chaphead">%s<div class="idx rev">WARUM IMPACT</div><h2 class="rev">Warum <span class="accent">IMPACT.</span></h2></div><div class="rt rev">%s</div>%s</section>'%(G.bolt(),W.rt(c['why_rt']),W.wl(c['why_pts']))
    body += q2
    body += '<section class="chapter"><div class="chaphead">%s<div class="idx rev">%s</div><h2 class="rev">%s</h2></div><div class="rt rev">%s</div></section>'%(G.bolt(),c['special_h'].upper(),('Dein <span class="accent">Einstieg.</span>' if 'Einstieg' in c['special_h'] else 'Dein <span class="accent">Weg.</span>'),W.rt(c['special_rt']))
    body += '<section class="chapter deep" style="padding-bottom:80px"><div class="chaphead">%s<div class="idx rev">FAQ</div><h2 class="rev">Keine <span class="accent">Ausreden.</span></h2></div><div class="faqs">%s</div></section>'%(G.bolt(),faqs)
    en_slug = dict(zip([x[0] for x in G.COURSES['de']],[x[0] for x in G.COURSES['en']]))[slug]
    G.page('de','/zurich/kurse/%s/'%slug,'%s Zürich – IMPACT Martial Arts'%name.strip(),desc,
        'IMPACT Zürich',name.strip().replace(' / ','<br>'),c['sub'],body,
        '/zurich/kurse/%s/'%slug,'/en/zurich/classes/%s/'%en_slug,
        cta=(trial,t['trial']))
    print('zurich enriched',slug)
print('done')
