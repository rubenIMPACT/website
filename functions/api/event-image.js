// Bild-Proxy fuer Event-Bilder aus Google Drive (Bild-URL im Planungs-Sheet darf ein normaler Drive-Link sein,
// keine oeffentliche Freigabe noetig). Apps Script liest die Datei als Ruben und liefert base64; hier 7 Tage Cache.
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") || "").replace(/[^\w-]/g, "");
  if (!id || !env.LEADLOG_URL || !env.LEADLOG_TOKEN) return new Response("bad request", { status: 400 });
  const cache = caches.default;
  const key = new Request(new URL("/api/event-image?id=" + id, request.url).toString(), { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return hit;
  try {
    const r = await fetch(env.LEADLOG_URL + "?token=" + encodeURIComponent(env.LEADLOG_TOKEN) + "&what=image&id=" + id, { redirect: "follow", headers: { "Accept": "application/json" } });
    const js = await r.json();
    if (!js || !js.ok || !js.b64) return new Response("not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    const bin = Uint8Array.from(atob(js.b64), (c) => c.charCodeAt(0));
    const res = new Response(bin, { headers: { "Content-Type": js.mime, "Cache-Control": "public, max-age=604800", "X-Content-Type-Options": "nosniff" } });
    context.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (e) { return new Response("upstream", { status: 502, headers: { "Cache-Control": "no-store" } }); }
}
