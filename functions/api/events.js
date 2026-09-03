// Oeffentliche Events aus dem Planungs-Sheet (Google Apps Script doGet, gleiche URL/Token wie Lead-Log).
// Nur Zeilen mit Haken "Website", nie Company events. Keine internen Felder (Owner, Notes).
// Cache: Antwort wird bis 24h vorgehalten und ab 5 Minuten Alter im Hintergrund aufgefrischt (stale-while-revalidate),
// damit Besucher nie auf Google warten. Nur der allererste Aufruf nach einem Deploy ist langsam.
const FRESH_MS = 5 * 60 * 1000;
function pub(e) { return { id: e.id, type: e.type, start: e.start, end: e.end, location: e.location, owner: e.owner || '', title: e.title || e.title_de || e.activity || '',
  text: e.text || e.text_de || '', registration: !!e.registration, rewards: !!e.rewards, link: e.link || '', image: e.image || '', signups: e.signups || 0 }; }
async function fetchUpstream(env) {
  const u = env.LEADLOG_URL + "?token=" + encodeURIComponent(env.LEADLOG_TOKEN) + "&what=events";
  const r = await fetch(u, { redirect: "follow", headers: { "Accept": "application/json" } });
  const t = await r.text(); let js = null; try { js = JSON.parse(t); } catch {}
  if (!js || !js.ok || !Array.isArray(js.events)) throw new Error("upstream");
  const seen = {}; // gleiche ID kann in mehreren Jahres-Tabs stehen (Tab-Kopie): erste gewinnt
  return js.events.filter((x) => { const k = x.id || (x.activity + x.start); if (seen[k]) return false; seen[k] = true; return true; }).map(pub);
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
  const hit = await cache.match(key);
  if (hit) {
    const at = Number(hit.headers.get("X-Fetched-At") || 0);
    if (Date.now() - at > FRESH_MS) context.waitUntil(fetchUpstream(env).then(store).catch(() => {}));
    return hit;
  }
  try { return await store(await fetchUpstream(env)); }
  catch (e) { return new Response(JSON.stringify({ error: "upstream" }), { status: 502, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }); }
}
