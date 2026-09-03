// Oeffentliche Events aus dem Planungs-Sheet (Google Apps Script doGet, gleiche URL/Token wie Lead-Log).
// Nur Zeilen mit Haken "Website", nie Company events. 5 Minuten Cache. Es werden keine internen Felder (Owner, Notes) weitergegeben.
export async function onRequestGet(context) {
  const { env, request } = context;
  const H = { "Content-Type": "application/json", "Cache-Control": "public, max-age=120" };
  if (!env.LEADLOG_URL || !env.LEADLOG_TOKEN) return new Response(JSON.stringify({ error: "config" }), { status: 500, headers: H });
  const cache = caches.default;
  const key = new Request(new URL("/api/events", request.url).toString(), { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return hit;
  try {
    const u = env.LEADLOG_URL + "?token=" + encodeURIComponent(env.LEADLOG_TOKEN) + "&what=events";
    const r = await fetch(u, { redirect: "follow", headers: { "Accept": "application/json" } });
    const t = await r.text(); let js = null; try { js = JSON.parse(t); } catch {}
    if (!js || !js.ok || !Array.isArray(js.events)) return new Response(JSON.stringify({ error: "upstream" }), { status: 502, headers: { "Content-Type": "application/json" } });
    const events = js.events.map((e) => ({ id: e.id, type: e.type, start: e.start, end: e.end, location: e.location, title_de: e.title_de, title_en: e.title_en,
      text_de: e.text_de, text_en: e.text_en, registration: !!e.registration, rewards: !!e.rewards, link: e.link, image: e.image, signups: e.signups || 0 }));
    const res = new Response(JSON.stringify({ ok: true, events }), { headers: Object.assign({}, H, { "Cache-Control": "public, max-age=300" }) });
    context.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (e) { return new Response(JSON.stringify({ error: "fetch" }), { status: 502, headers: { "Content-Type": "application/json" } }); }
}
