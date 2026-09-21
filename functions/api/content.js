// Inhalte aus dem Google Sheet "IMPACT Website Content" als JSON, gelesen vom Apps Script. Heute: ?what=team (Tab "Team").
// Genutzt vom GitHub-Workflow content-sync (taeglich + Haekchen "Publish now" im Sheet) - GitHub braucht weder Token noch Script-URL.
// Cache 10 Min je Tab; ?refresh=1 erzwingt Neuabruf. Es kommen nur Zeilen mit Haken "Website" zurueck.
const ALLOWED = ["team"];
export async function onRequestGet(context) {
  const { env, request } = context; const url = new URL(request.url);
  const what = url.searchParams.get("what") || "team";
  const J = (o, status, cc) => new Response(JSON.stringify(o), { status: status || 200, headers: { "Content-Type": "application/json", "Cache-Control": cc || "no-store" } });
  if (!ALLOWED.includes(what)) return J({ ok: false, error: "unknown" }, 400);
  if (!env.LEADLOG_URL || !env.LEADLOG_TOKEN) return J({ ok: false, error: "config" }, 500);
  const cache = caches.default, key = new Request(new URL("/api/content?what=" + what, request.url).toString(), { method: "GET" });
  if (url.searchParams.get("refresh") !== "1") { const hit = await cache.match(key); if (hit) return hit; }
  try {
    const r = await fetch(env.LEADLOG_URL + "?token=" + encodeURIComponent(env.LEADLOG_TOKEN) + "&what=" + what, { redirect: "follow", headers: { Accept: "application/json" } });
    const t = await r.text(); let js = null; try { js = JSON.parse(t); } catch {}
    if (!js || !js.ok || !Array.isArray(js[what])) return J({ ok: false, error: "upstream", detail: t.slice(0, 200) }, 502);
    const res = J(js, 200, "public, max-age=600");
    context.waitUntil(cache.put(key, res.clone())); return res;
  } catch (e) { return J({ ok: false, error: String(e) }, 502); }
}
