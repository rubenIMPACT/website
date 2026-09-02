// Holt die beiden exercise.com-Reports fuer ein Zeitfenster ueber die JSON-API der Report-Seiten.
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
  const q = 'page=1&per=400&start_date=' + s + '&start_date_string=' + startStr + '&end_date=' + e + '&end_date_string=' + endStr;
  const get = async (u) => (await fetch(u, { credentials: 'include', headers: { Accept: 'application/json' } })).json();
  const want = startStr.replace(/-/g, '/');
  const jobs = [
    { key: 'recurring', url: '/api/v4/reports/recurring_sessions?' + q, filt: (j) => ((j.cached_stats || [])[0] || {}).filters || '' },
    { key: 'Zurich', url: '/api/v4/reports/popular_services?' + q + '&location_id=2508', filt: (j) => (j.cached_stats || {}).filters || '', loc: 'Zurich' },
    { key: 'Winterthur', url: '/api/v4/reports/popular_services?' + q + '&location_id=2222', filt: (j) => (j.cached_stats || {}).filters || '', loc: 'Winterthur' },
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
      };
    },
  };
}
