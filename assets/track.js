/* IMPACT Funnel-Messung (09.09.2026): schickt drei Ereignisse in den GTM-dataLayer.
   cta_click        - Klick auf Probetraining-/Anmelde-/WhatsApp-Links (cta_text, cta_href, cta_kind)
   trial_form_start - erste Eingabe im Probetraining-Formular (form_loc, form_dis)
   trial_form_abandon - Seite verlassen nach Start ohne Absenden (last_field, form_loc, form_dis)
   Kein Personenbezug: keine Namen, Nummern oder Mails werden mitgeschickt. */
(function(){
  var dl=window.dataLayer=window.dataLayer||[];
  window.gtag=window.gtag||function(){dl.push(arguments)}; /* gtag.js wird vom GTM-Google-Tag geladen und verarbeitet diese Aufrufe direkt (wie generate_lead im Formular) */
  function send(ev,p){p=p||{};p.page_path=location.pathname;p.page_lang=(document.documentElement.lang||'').slice(0,2);
    try{window.gtag('event',ev,p)}catch(e){}
    try{var q={};for(var k in p)q[k]=p[k];q.event=ev;dl.push(q)}catch(e){}}
  function kind(h){h=h||'';if(/wa\.me|whatsapp/.test(h))return 'whatsapp';if(/probetraining|\/trial/.test(h))return 'trial_page';if(/#anmelden|#form|#leadform/.test(h))return 'trial_form';if(/^tel:/.test(h))return 'phone';return ''}
  document.addEventListener('click',function(e){
    var a=e.target&&e.target.closest?e.target.closest('a,button'):null;if(!a)return;
    var h=a.getAttribute('href')||'',k=kind(h);
    if(!k&&!/(^|\s)cta(\s|$)/.test(a.className||''))return;
    send('cta_click',{cta_text:(a.textContent||'').replace(/\s+/g,' ').trim().slice(0,60),cta_href:h.slice(0,120),cta_kind:k||'cta'});
  },true);
  var f=document.getElementById('leadform');if(!f)return;
  var started=false,submitted=false,last='';
  function val(id){var el=document.getElementById(id);return el?String(el.value||'').slice(0,40):''}
  function ctx(){return {form_loc:val('floc'),form_dis:val('fdis')}}
  function onField(e){var el=e.target;if(!el||!el.name||el.type==='hidden')return;last=el.name;
    if(!started){started=true;var p=ctx();send('trial_form_start',p)}}
  f.addEventListener('focusin',onField,true);f.addEventListener('input',onField,true);f.addEventListener('change',onField,true);
  f.addEventListener('submit',function(){submitted=true},true);
  function bye(){if(started&&!submitted){submitted=true;var p=ctx();p.last_field=last;send('trial_form_abandon',p)}}
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')bye()});
  window.addEventListener('pagehide',bye);
})();
