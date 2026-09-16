// Nominalplan (Google-Slides-Decks) als JSON, gelesen vom Apps Script (what=plan). Cache 1h; ?refresh=1 erzwingt Neuabruf.
// Genutzt vom GitHub-Workflow plan-sync (taeglich) - so braucht GitHub weder Token noch Script-URL.
export async function onRequestGet(context) {
  const { env, request } = context; const url = new URL(request.url);
  if (!env.LEADLOG_URL || !env.LEADLOG_TOKEN) return new Response(JSON.stringify({ ok: false, error: "config" }), { status: 500, headers: { "Content-Type": "application/json" } });
  // Verwaltung ohne Editor: ?what=sptrigger (Tages-Trigger 05:30 anlegen) / ?what=spdaily (Aenderungslauf jetzt). Nur diese zwei, kein Cache.
  const what = url.searchParams.get("what");
  if (what === "sptrigger" || what === "spdaily") {
    const r = await fetch(env.LEADLOG_URL + "?token=" + encodeURIComponent(env.LEADLOG_TOKEN) + "&what=" + what, { redirect: "follow", headers: { Accept: "application/json" } });
    return new Response(await r.text(), { status: r.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
  const cache = caches.default, key = new Request(new URL("/api/plan-nominal", request.url).toString(), { method: "GET" });
  if (url.searchParams.get("refresh") !== "1") { const hit = await cache.match(key); if (hit) return hit; }
  try {
    const r = await fetch(env.LEADLOG_URL + "?token=" + encodeURIComponent(env.LEADLOG_TOKEN) + "&what=plan", { redirect: "follow", headers: { Accept: "application/json" } });
    const t = await r.text(); let js = null; try { js = JSON.parse(t); } catch {}
    if (!js || !js.ok) return new Response(JSON.stringify({ ok: false, error: "upstream", detail: t.slice(0, 200) }), { status: 502, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    const res = new Response(JSON.stringify(js), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" } });
    context.waitUntil(cache.put(key, res.clone())); return res;
  } catch (e) { return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 502, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }); }
}
