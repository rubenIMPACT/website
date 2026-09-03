// Holt die exercise.com-Reports fuer ein Zeitfenster ueber die JSON-API der Report-Seiten:
//   recurring_sessions + popular_services (Klassenanalyse) sowie detailed_visits + active_subscription (Value Pricing:
//   Abo-Nettoumsatz je Mitglied auf dessen Check-ins verteilt, Mitglieder ohne Besuch = Kuendigungsrisiko; seit 03.09.2026).
// Laeuft im EINGELOGGTEN Browser-Tab von app.impact-martialarts.com (Chrome-MCP javascript_tool), NICHT serverseitig.
//
// Ablauf (jeder Schritt ist ein eigener javascript_tool-Aufruf, weil ein Aufruf nach 45 s abbricht):
//   1) window.__ka = KA('2026-08-01','2026-08-31'); await __ka.refreshAll()      -> stoesst 3 Generierungen an
//   2) await __ka.poll()   -> wiederholen, bis {done:true}; dauert pro Report ~10-30 s
//   3) await __ka.collect() -> gibt {window, generated, recurring:[...], popular:{Zurich:{reports}, Winterthur:{reports}}}
// Das Ergebnis als JSON in eine Datei schreiben und mit build_import.py weiterverarbeiten.
//
// Refresh = GET auf /api/v4/reports/<report>?...&refresh=true; danach ohne refresh pollen, bis "refreshing" leer ist
// und der Filtertext das neue Startdatum enthaelt. Standort-Filter nur bei Popular Services: location_id (2508 Zurich, 2222 Winterthur).
function KA(startStr, endStr) {
  const LOC = { Zurich: 2508, Winterthur: 2222 };
  const s = Math.floor(new Date(startStr + 'T00:00:00+02:00').getTime() / 1000);
  const e = Math.floor(new Date(endStr + 'T23:59:59+02:00').getTime() / 1000);
  const qb = 'page=1&start_date=' + s + '&start_date_string=' + startStr + '&end_date=' + e + '&end_date_string=' + endStr;
  const q = qb + '&per=400';
  const get = async (u) => (await fetch(u, { credentials: 'include', headers: { Accept: 'application/json' } })).json();
  const want = startStr.replace(/-/g, '/');
  const jobs = [
    { key: 'recurring', url: '/api/v4/reports/recurring_sessions?' + q, filt: (j) => ((j.cached_stats || [])[0] || {}).filters || '' },
    { key: 'Zurich', url: '/api/v4/reports/popular_services?' + q + '&location_id=2508', filt: (j) => (j.cached_stats || {}).filters || '', loc: 'Zurich' },
    { key: 'Winterthur', url: '/api/v4/reports/popular_services?' + q + '&location_id=2222', filt: (j) => (j.cached_stats || {}).filters || '', loc: 'Winterthur' },
    // Value Pricing: alle Check-ins des Monats (per=5000 reicht fuer beide Standorte) und alle laufenden Abos
    { key: 'visits', url: '/api/v4/reports/detailed_visits?' + qb + '&per=5000', filt: (j) => (j.cached_stats || {}).filters || '' },
    { key: 'subs', url: '/api/v4/reports/active_subscription?' + qb + '&per=2000&only_active=true', filt: (j) => ((j.cached_stats || [])[0] || {}).filters || '' },
  ];
  const state = { done: {}, data: {} };
  return {
    async refreshAll() {
      const out = {};
      for (const j of jobs) { const r = await get(j.url + '&refresh=true'); out[j.key] = { refreshing: r.refreshing, error: r.error }; }
      return out;
    },
    // Popular Services teilt sich EINEN Report-Cache: Zurich und Winterthur nacheinander generieren.
    async refreshOne(key) { const j = jobs.find((x) => x.key === key); const r = await get(j.url + '&refresh=true'); return { key, refreshing: r.refreshing, error: r.error }; },
    async poll(key) {
      const list = key ? jobs.filter((x) => x.key === key) : jobs;
      const out = {};
      for (const j of list) {
        if (state.done[j.key]) { out[j.key] = 'done'; continue; }
        const r = await get(j.url);
        const f = j.filt(r);
        const ok = !r.refreshing && f.indexOf('Start Date: ' + want) >= 0 && (!j.loc || f.indexOf('Location: ' + j.loc) >= 0);
        out[j.key] = ok ? 'done' : (r.refreshing ? 'refreshing' : 'stale: ' + f.slice(0, 120));
        if (ok) { state.done[j.key] = true; state.data[j.key] = r.cached_stats; }
      }
      out.done = list.every((j) => state.done[j.key]);
      return out;
    },
    collect() {
      const rec = state.data.recurring || [];
      return {
        window: { start: startStr, end: endStr },
        generated: new Date().toISOString(),
        recurring: rec.slice(1),
        popular: { Zurich: { reports: (state.data.Zurich || {}).reports || [] }, Winterthur: { reports: (state.data.Winterthur || {}).reports || [] } },
        revenue: (state.data.visits && state.data.subs) ? REVENUE(state.data.visits, state.data.subs) : null,
      };
    },
  };
}

// Value Pricing (Entscheid Ruben 03.09.2026): Netto-Abobetrag pro Monat (Payment Plan Price ohne MwSt, auf Monate
// umgerechnet, Coupon abgezogen) je Mitglied gleichmaessig auf dessen abgeschlossene Check-ins des Monats verteilen und
// je Slot (Standort|Kurs|Wochentag|Uhrzeit) summieren. Pausierte und erst geplante Abos zaehlen nicht. Besuche ohne
// Abo (Probetraining, Gaeste) bringen 0 CHF. Mitglieder ohne einen einzigen Check-in = Liste "novisit".
function REVENUE(vs, subsStats) {
  const H = vs.headers || [], ix = (n) => H.indexOf(n);
  const rows = []; (vs.reports || []).forEach((g) => (g.items || []).forEach((it) => rows.push(it)));
  const comp = rows.filter((x) => x[ix('Status')] === 'Completed');
  const subs = (subsStats || []).slice(1);
  const parse = (str) => { const m = /Fr([\d,.]+)\/(month|year|(\d+) months|(\d+) years)/.exec(str || ''); if (!m) return null; const amt = parseFloat(m[1].replace(/,/g, '')); let mo = 1; if (m[2] === 'year') mo = 12; else if (m[3]) mo = +m[3]; else if (m[4]) mo = +m[4] * 12; return amt / mo; };
  const coup = (str, v) => { if (!str) return v; let m = /(\d+)% off/.exec(str); if (m) return v * (1 - m[1] / 100); m = /Fr([\d.]+) off/.exec(str); if (m) return Math.max(0, v - parseFloat(m[1])); return v; };
  const mem = {}; let skipped = 0;
  subs.forEach((s) => {
    if (s['Active Subscription Type'] === 'Paused' || s['Active Subscription Type'] === 'Scheduled') return;
    const v = parse(s['Payment Plan Price']); if (v == null) { skipped++; return; }
    const m = mem[s['User ID']] = mem[s['User ID']] || { chf: 0, name: ((s['First Name'] || '') + ' ' + (s['Last Name'] || '')).trim(), email: s['Email'] || '', loc: s['Location'] || '?', pkg: [], since: String(s['Start Date'] || '').slice(0, 10) };
    m.chf += coup(s['Current Coupon Discount'], v); m.pkg.push(s['Subscribed To']);
  });
  const vcount = {}; comp.forEach((x) => { const u = x[ix('User ID')]; vcount[u] = (vcount[u] || 0) + 1; });
  const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'], slots = {}, nosubUsers = {}; let nosub = 0;
  comp.forEach((x) => {
    const u = x[ix('User ID')], m = mem[u];
    if (!m) { nosub++; nosubUsers[u] = 1; return; }
    const mm = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}) ([AP]M)/.exec(x[ix('Start Time')] || ''); if (!mm) return;
    const d = new Date(+mm[1], +mm[2] - 1, +mm[3]), h = (+mm[4] % 12) + (mm[6] === 'PM' ? 12 : 0);
    const key = [String(x[ix('Location')] || '').trim(), String(x[ix('Service')] || '').replace(/\s+/g, ' ').trim(), DAYS[d.getDay()], String(h).padStart(2, '0') + ':' + mm[5]].join('|');
    const sl = slots[key] = slots[key] || { chf: 0, visits: 0 }; sl.chf += m.chf / vcount[u]; sl.visits++;
  });
  Object.keys(slots).forEach((k) => { slots[k].chf = Math.round(slots[k].chf * 100) / 100; });
  const members = {}, novisit = [];
  Object.keys(mem).forEach((u) => {
    const m = mem[u], L = members[m.loc] = members[m.loc] || { subs: 0, visited: 0, novisit: 0, chf: 0, chf_visited: 0, chf_novisit: 0 };
    L.subs++; L.chf += m.chf;
    if (vcount[u]) { L.visited++; L.chf_visited += m.chf; }
    else { L.novisit++; L.chf_novisit += m.chf; novisit.push({ uid: u, name: m.name, email: m.email, location: m.loc, package: m.pkg.join(', '), chf: Math.round(m.chf * 100) / 100, since: m.since }); }
  });
  Object.keys(members).forEach((k) => { ['chf', 'chf_visited', 'chf_novisit'].forEach((f) => { members[k][f] = Math.round(members[k][f]); }); });
  novisit.sort((a, b) => a.location < b.location ? -1 : a.location > b.location ? 1 : b.chf - a.chf);
  return { basis: 'netto (ohne MwSt, nach Coupon)', slots, members, novisit, nosub_visits: nosub, nosub_users: Object.keys(nosubUsers).length, visits_completed: comp.length, subs_unparsed: skipped };
}
