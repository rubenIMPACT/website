// Oeffentliche Events aus dem Planungs-Sheet (Google Apps Script doGet, gleiche URL/Token wie Lead-Log).
// Nur Zeilen mit Haken "Website", nie Company events. Keine internen Felder (Owner, Notes).
// Cache: Antwort wird bis 24h vorgehalten und ab 5 Minuten Alter im Hintergrund aufgefrischt (stale-while-revalidate),
// damit Besucher nie auf Google warten. Nur der allererste Aufruf nach einem Deploy ist langsam.
const FRESH_MS = 5 * 60 * 1000;
function pub(e) { return { id: e.id, type: e.type, start: e.start, end: e.end, location: e.location, owner: e.owner || '', title: e.title || e.title_de || e.activity || '',
  text: e.text || e.text_de || '', registration: !!e.registration, app: !!e.app, app_link: e.app_link || '', spots: e.spots || null, friends: !!e.friends, rewards: !!e.rewards, link: e.link || '', image: e.image || '', signups: e.signups || 0 }; }
// Registration = App: Kurs im exercise.com-Buchungsfeed suchen (Titel/Activity + Datum + Standort) -> Buchungslink der App + belegte Plaetze.
// Feed liefert nur Termine mit mindestens einer Buchung (siehe schedule.js); ohne Treffer -> allgemeine Buchungsseite.
const APP_BASE = "https://app.impact-martialarts.com";
const CAL_UPSTREAM = APP_BASE + "/api/v4/calendar";
const LOC_ID = { winterthur: 2222, zurich: 2508 };
const nz = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
function zdate(iso) { const d = new Date(iso); if (isNaN(d)) return ""; const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d).map(x => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}`; }
const tokSub = (a, b) => { const ta = a.split(" ").filter((x) => x.length > 2), tb = b.split(" "); return ta.length > 0 && ta.every((x) => tb.includes(x)); }; // alle Woerter von a kommen in b vor ("wrestling sparring" passt zu "wrestling sunday sparring")
function manualLink(v) { v = String(v || "").trim(); if (!v) return ""; if (/^\d+$/.test(v)) return APP_BASE + "/a/booking/?serviceId=" + v; if (/^https?:\/\//i.test(v)) return v; return ""; }
async function attachApp(events) {
  const need = events.filter((e) => e.app);
  if (!need.length) return events;
  let all = [];
  try {
    const up = await fetch(CAL_UPSTREAM, { headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36", "Referer": APP_BASE + "/" } });
    if (up.ok) { const js = await up.json(); all = Array.isArray(js) ? js : []; }
  } catch {}
  for (const e of need) {
    const manual = manualLink(e.app_link);
    const date = String(e.start || "").slice(0, 10);
    const locId = /winterthur/i.test(e.location || "") ? LOC_ID.winterthur : /z(u|ü)rich/i.test(e.location || "") ? LOC_ID.zurich : 0;
    const names = [e.title, e.activity].map(nz).filter(Boolean);
    const hit = all.find((s) => { const d = s.data || {}; if (locId && d.location_id !== locId) return false; if (zdate(s.start_time) !== date) return false;
      const svc = nz(d.service || s.text); return !!svc && names.some((n) => tokSub(svc, n) || tokSub(n, svc)); });
    if (hit) { const d = hit.data || {}; e.spots = { booked: Number(d.clients_count || 0), total: Number(d.total_spots || 0) }; e.app_link = manual || (d.service_id ? APP_BASE + "/a/booking/?serviceId=" + d.service_id : APP_BASE + "/a/booking/"); }
    else e.app_link = manual || APP_BASE + "/a/booking/";
  }
  return events;
}
async function fetchUpstream(env) {
  const u = env.LEADLOG_URL + "?token=" + encodeURIComponent(env.LEADLOG_TOKEN) + "&what=events";
  const r = await fetch(u, { redirect: "follow", headers: { "Accept": "application/json" } });
  const t = await r.text(); let js = null; try { js = JSON.parse(t); } catch {}
  if (!js || !js.ok || !Array.isArray(js.events)) throw new Error("upstream");
  const seen = {}; // gleiche ID kann in mehreren Jahres-Tabs stehen (Tab-Kopie): erste gewinnt
  const list = js.events.filter((x) => { const k = x.id || (x.activity + x.start); if (seen[k]) return false; seen[k] = true; return true; });
  return (await attachApp(list)).map(pub);
}
function respond(events, fetchedAt) {
  return new Response(JSON.stringify({ ok: true, events, fetched_at: fetchedAt }), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60", "X-Fetched-At": String(fetchedAt) } });
}
export async function onRequestGet(context) {
  const { env, request } = context;
  if (!env.LEADLOG_URL || !env.LEADLOG_TOKEN) return new Response(JSON.stringify({ error: "config" }), { status: 500, headers: { "Content-Type": "application/json" } });
  const cache = caches.default;
  const key = new Request(new URL("/api/events", request.url).toString(), { method: "GET" });
  const store = async (events) => { const at = Date.now(); const res = respond(events, at); const c = new Response(res.body, res); c.headers.set("Cache-Control", "public, max-age=86400"); await cache.put(key, c); return res; };
  if (new URL(request.url).searchParams.get("debug") === "1") { // Schrittweise Diagnose ohne Cache
    const log = []; const t0 = Date.now();
    try {
      log.push("start");
      const r = await fetch(env.LEADLOG_URL + "?token=" + encodeURIComponent(env.LEADLOG_TOKEN) + "&what=events", { redirect: "follow", headers: { "Accept": "application/json" } });
      log.push("script " + r.status + " " + (Date.now() - t0) + "ms");
      const js = JSON.parse(await r.text()); log.push("events " + (js.events || []).length);
      const up = await fetch(CAL_UPSTREAM, { headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0", "Referer": APP_BASE + "/" } });
      log.push("calendar " + up.status + " " + (Date.now() - t0) + "ms");
      const all = await up.json(); log.push("sessions " + (Array.isArray(all) ? all.length : typeof all));
      const out = await attachApp(js.events); log.push("attach ok " + JSON.stringify(out.filter((e) => e.app).map((e) => ({ id: e.id, link: e.app_link, spots: e.spots }))));
      return new Response(JSON.stringify({ ok: true, log }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    } catch (e) { return new Response(JSON.stringify({ ok: false, log, error: String(e && e.stack || e) }), { status: 500, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }); }
  }
  if (new URL(request.url).searchParams.get("refresh") === "1") { // Debug/Force: Cache sofort neu fuellen, Fehler sichtbar machen
    try { return await store(await fetchUpstream(env)); }
    catch (e) { return new Response(JSON.stringify({ error: "upstream", message: String(e && e.message || e) }), { status: 502, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }); }
  }
  const hit = await cache.match(key);
  if (hit) {
    const at = Number(hit.headers.get("X-Fetched-At") || 0);
    if (Date.now() - at > FRESH_MS) context.waitUntil(fetchUpstream(env).then(store).catch(() => {}));
    return hit;
  }
  try { return await store(await fetchUpstream(env)); }
  catch (e) { return new Response(JSON.stringify({ error: "upstream" }), { status: 502, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }); }
}
