/* IMPACT newsletter (25.09.2026, Ruben). Loaded by assets/track.js when NL_ON is true.
   1) Shows the optional tick box "Schick mir News und Events von IMPACT (optional)" under every trial form (label.nlopt, hidden in the HTML).
   2) Exit pop-up for undecided visitors, sign-up with double opt-in via /api/newsletter.
   Rules (Ruben 25.09.2026):
   - never before 30 seconds on the current page (desktop and phone), never when a trial form is visible on screen,
     never after someone started filling a trial form on this page, never on the trial form / thank-you / booking / cancellation pages,
     never again for people who sent a trial request, at most once in 30 days, never after a sign-up.
   - desktop: the mouse leaves the window towards the tab bar / close button. Clicking links between pages never triggers it.
   - phone: a fast scroll back up (typical move before leaving). Browsing from page to page never triggers it.
   Texts DE approved by Ruben 25.09.2026 (headline + tick box); EN and the small UI texts are Claude's proposal. */
(function () {
  if (window.__impNl) return; window.__impNl = 1;
  var EN = /^en/i.test(document.documentElement.lang || '') || /^\/en\//.test(location.pathname);
  var T = EN ? {
    h: 'Not ready for a trial yet?', p: 'We’ll invite you to our events and keep you posted.',
    ph: 'Your email', btn: 'Sign up', fine: 'You’ll get an email to confirm. Unsubscribe anytime.', priv: 'Privacy', privHref: '/en/privacy/',
    ok: 'Almost done! Please confirm your sign-up in the email we just sent you.', err: 'That didn’t work. Please try again later.', bad: 'Please enter a valid email address.', close: 'Close'
  } : {
    h: 'Noch nicht bereit fürs Probetraining?', p: 'Wir laden dich zu unseren Events ein und halten dich auf dem Laufenden.',
    ph: 'Deine E-Mail', btn: 'Anmelden', fine: 'Du bekommst eine Mail zur Bestätigung. Abmeldung jederzeit.', priv: 'Datenschutz', privHref: '/datenschutz/',
    ok: 'Fast geschafft! Bitte bestätige deine Anmeldung in der Mail, die wir dir gerade geschickt haben.', err: 'Das hat nicht geklappt. Bitte versuch es später nochmal.', bad: 'Bitte gib eine gültige E-Mail-Adresse ein.', close: 'Schliessen'
  };
  var DAY = 864e5, NOW = Date.now(), START = NOW;
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function send(ev) { try { (window.dataLayer = window.dataLayer || []).push({ event: ev, page_path: location.pathname, page_lang: EN ? 'en' : 'de' }); if (typeof window.gtag === 'function') window.gtag('event', ev, { page_path: location.pathname }); } catch (e) {} }

  var css = document.createElement('style');
  css.textContent =
    '.nlopt:not([hidden]){display:flex;align-items:flex-start;gap:10px;margin:14px 0 0;font-size:12px;line-height:1.4;font-weight:400;letter-spacing:0;text-transform:none;color:var(--grey,#b9b6ad);cursor:pointer}' +
    '.nlopt input,#leadform .nlopt input{-webkit-appearance:none;appearance:none;flex:0 0 auto;width:17px;height:17px;min-height:0;margin:1px 0 0;padding:0;box-sizing:border-box;border:1px solid #5c574b;border-radius:3px;background:transparent;cursor:pointer}' +
    '.nlopt input:checked,#leadform .nlopt input:checked{background:var(--gold,#e2c210) url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 16 16%27%3E%3Cpath d=%27M3.5 8.5l3 3 6-7%27 fill=%27none%27 stroke=%27%23000%27 stroke-width=%272.2%27/%3E%3C/svg%3E") center/13px no-repeat;border-color:var(--gold,#e2c210)}' +
    '.nlopt input:focus-visible{outline:2px solid var(--gold,#e2c210);outline-offset:2px}' +
    '.nlpop{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.72);opacity:0;transition:opacity .2s}' +
    '.nlpop.on{opacity:1}' +
    '.nlpop .nlc{position:relative;width:100%;max-width:440px;background:#0a0908;border:1px solid var(--hair,#26231c);border-top:3px solid var(--gold,#e2c210);border-radius:6px;padding:30px 26px 22px;color:#fff;font-family:Outfit,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.6)}' +
    '.nlpop h2{margin:0 34px 10px 0;font-size:24px;line-height:1.15;font-weight:800;text-transform:uppercase;letter-spacing:.3px}' +
    '.nlpop p{margin:0 0 18px;font-size:15px;line-height:1.5;color:#e8e5dc}' +
    '.nlpop form{display:flex;flex-direction:column;gap:10px;margin:0}' +
    '.nlpop input[type=email]{width:100%;box-sizing:border-box;background:transparent;border:1px solid #4a4538;border-radius:4px;color:#fff;padding:13px 14px;font-size:16px;font-family:inherit}' +
    '.nlpop input[type=email]:focus{outline:none;border-color:var(--gold,#e2c210)}' +
    '.nlpop button.nlgo{background:var(--gold,#e2c210);color:#000;border:2px solid var(--gold,#e2c210);border-radius:4px;padding:13px 18px;font-weight:800;font-size:15px;text-transform:uppercase;letter-spacing:.5px;cursor:pointer;font-family:inherit}' +
    '.nlpop button.nlgo[disabled]{opacity:.6;cursor:default}' +
    '.nlpop .nlx{position:absolute;top:10px;right:10px;width:36px;height:36px;border:0;background:transparent;color:#b9b6ad;font-size:26px;line-height:1;cursor:pointer}' +
    '.nlpop .nlx:hover{color:#fff}' +
    '.nlpop .nlf{margin:12px 0 0;font-size:12px;color:#8f8b80}.nlpop .nlf a{color:#b9b6ad}' +
    '.nlpop .nlm{margin:4px 0 0;font-size:14px;color:var(--gold,#e2c210);min-height:0}' +
    '.nlpop .nlhp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}' +
    '@media(max-width:600px){.nlpop{align-items:flex-end;padding:0}.nlpop .nlc{max-width:none;border-radius:12px 12px 0 0;padding:26px 20px calc(20px + env(safe-area-inset-bottom))}.nlpop h2{font-size:21px}}';
  document.head.appendChild(css);

  // 1) tick box under the trial forms
  document.querySelectorAll('label.nlopt[hidden]').forEach(function (l) { l.hidden = false; });

  // Pages without pop-up. The thank-you pages remember that this person sent a trial request.
  var path = location.pathname;
  if (/^\/(probetraining\/danke|en\/trial\/thanks)(\/|$)/.test(path)) set('imp_lead', String(NOW));
  if (/^\/(en\/)?(probetraining|trial|termin|booking|kuendigung|cancellation|training-plan)(\/|$)/.test(path)) return;
  if (get('imp_lead') || get('imp_nl_done')) return;
  var seen = Number(get('imp_nl_seen') || 0);
  if (seen && NOW - seen < 30 * DAY) return;
  if (!set('imp_nl_test', '1')) return; // no storage = cannot respect "once in 30 days", so never show

  // Trial forms on this page: visible on screen or started = no pop-up
  var formVisible = 0, formStarted = false;
  var forms = [].slice.call(document.querySelectorAll('form')).filter(function (f) { return f.id === 'leadform' || f.querySelector('[name=discipline]'); });
  forms.forEach(function (f) {
    ['focusin', 'input', 'change'].forEach(function (ev) { f.addEventListener(ev, function () { formStarted = true; }, true); });
    f.addEventListener('submit', function () { set('imp_lead', String(Date.now())); }, true);
  });
  if (forms.length && 'IntersectionObserver' in window) {
    var vis = new Map();
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { vis.set(e.target, e.isIntersecting); }); formVisible = 0; vis.forEach(function (v) { if (v) formVisible++; }); }, { threshold: 0 });
    forms.forEach(function (f) { io.observe(f); });
  } else if (forms.length) { formStarted = true; } // old browser: be safe

  function overlayOpen() {
    var b = document.body, d = document.documentElement;
    if ((b && b.style.overflow === 'hidden') || d.style.overflow === 'hidden') return true;
    // an open dialog (team bio, event sign-up ...): only count dialogs that are actually displayed
    return [].some.call(document.querySelectorAll('[aria-modal="true"]:not(.nlpop), [role="dialog"]:not(.nlpop)'), function (el) {
      var cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
    });
  }
  function allowed() {
    if (shown) return false;
    if (Date.now() - START < 30000) return false; // at least 30 seconds on this page
    if (formVisible || formStarted) return false;
    if (document.visibilityState === 'hidden') return false;
    if (overlayOpen()) return false;
    return true;
  }

  var shown = false;
  function show() {
    if (!allowed()) return;
    shown = true; set('imp_nl_seen', String(Date.now())); send('nl_popup_shown');
    var last = document.activeElement;
    var w = document.createElement('div'); w.className = 'nlpop'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true'); w.setAttribute('aria-labelledby', 'nlh');
    var c = document.createElement('div'); c.className = 'nlc'; w.appendChild(c);
    var x = document.createElement('button'); x.type = 'button'; x.className = 'nlx'; x.setAttribute('aria-label', T.close); x.textContent = '×'; c.appendChild(x);
    var h = document.createElement('h2'); h.id = 'nlh'; h.textContent = T.h; c.appendChild(h);
    var p = document.createElement('p'); p.textContent = T.p; c.appendChild(p);
    var f = document.createElement('form'); f.noValidate = true; c.appendChild(f);
    var inp = document.createElement('input'); inp.type = 'email'; inp.name = 'email'; inp.required = true; inp.autocomplete = 'email'; inp.placeholder = T.ph; inp.setAttribute('aria-label', T.ph); f.appendChild(inp);
    var hp = document.createElement('input'); hp.type = 'text'; hp.name = 'hp'; hp.tabIndex = -1; hp.autocomplete = 'off'; hp.className = 'nlhp'; hp.setAttribute('aria-hidden', 'true'); f.appendChild(hp);
    var go = document.createElement('button'); go.type = 'submit'; go.className = 'nlgo'; go.textContent = T.btn; f.appendChild(go);
    var msg = document.createElement('div'); msg.className = 'nlm'; msg.setAttribute('role', 'status'); f.appendChild(msg);
    var fine = document.createElement('div'); fine.className = 'nlf'; fine.appendChild(document.createTextNode(T.fine + ' '));
    var a = document.createElement('a'); a.href = T.privHref; a.textContent = T.priv; fine.appendChild(a); c.appendChild(fine);
    document.body.appendChild(w);
    requestAnimationFrame(function () { w.classList.add('on'); });
    setTimeout(function () { try { inp.focus({ preventScroll: true }); } catch (e) {} }, 50);
    var done = false;
    function close() { if (!w.parentNode) return; if (!done) send('nl_popup_close'); document.removeEventListener('keydown', key, true); w.parentNode.removeChild(w); try { last && last.focus && last.focus({ preventScroll: true }); } catch (e) {} }
    function key(e) { if (e.key === 'Escape') close(); if (e.key === 'Tab') { var fs = [inp, go, a, x]; var i = fs.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); x.focus(); } else if (!e.shiftKey && i === fs.length - 1) { e.preventDefault(); inp.focus(); } } }
    document.addEventListener('keydown', key, true);
    x.addEventListener('click', close);
    w.addEventListener('click', function (e) { if (e.target === w) close(); });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = inp.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v)) { msg.textContent = T.bad; inp.focus(); return; }
      go.disabled = true; msg.textContent = '';
      fetch('/api/newsletter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: v, hp: hp.value, lang: EN ? 'en' : 'de', page: location.href }) })
        .then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(function () { done = true; set('imp_nl_done', String(Date.now())); send('nl_popup_signup'); f.parentNode.removeChild(f); p.textContent = T.ok; fine.parentNode.removeChild(fine); setTimeout(close, 6000); })
        .catch(function () { go.disabled = false; msg.textContent = T.err; });
    });
  }

  // Desktop: mouse leaves the window at the top (tab bar, address bar, close button)
  if (window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.addEventListener('mouseout', function (e) { if (!e.relatedTarget && !e.toElement && e.clientY <= 4) show(); });
  } else {
    // Phone / tablet: fast scroll back up (at least 140 px within 300 ms, not at the very top)
    var hist = [];
    window.addEventListener('scroll', function () {
      var y = window.scrollY || window.pageYOffset || 0, t = Date.now();
      hist.push([t, y]); while (hist.length && t - hist[0][0] > 300) hist.shift();
      var maxY = 0; hist.forEach(function (s) { if (s[1] > maxY) maxY = s[1]; });
      if (maxY - y >= 140 && y > 250) { hist = []; show(); }
    }, { passive: true });
  }
})();
