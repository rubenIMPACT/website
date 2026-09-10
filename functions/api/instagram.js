// Instagram-Feed fuer die Startseiten (Kachelgitter "Follow us on Instagram").
// Quelle: Instagram Graph API ueber die mit unserer Facebook-Seite verknuepfte Instagram-Business-Kennung.
// Token: IG_TOKEN, sonst der bestehende System-User-Token META_ADS_TOKEN (laeuft nicht ab, siehe klassen.js).
// Noetiges Recht: instagram_basic (+ pages_show_list zum Finden der Seite). Fehlt es, sagt ?debug=1 welches.
// Bilder laufen ueber unseren eigenen Proxy (?img=<id>), damit keine Besucheranfragen zu Meta gehen und
// die signierten CDN-Adressen nicht ablaufen koennen.
// Cache: Liste 1h frisch, bis 7 Tage als Notvorrat; Bilder 7 Tage. Faellt alles aus, bleiben die statischen
// Kacheln im HTML stehen - die Seite sieht nie leer aus.
const V = "v23.0";
const G = "https://graph.facebook.com/" + V;
const LIMIT = 8;
const LIST_TTL = 604800; // 7 Tage im Edge-Cache, Auffrischung steuert FRESH_MS
const FRESH_MS = 60 * 60 * 1000;

const tok = (env) => env.IG_TOKEN || env.META_ADS_TOKEN || "";

async function gj(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  const t = await r.text();
  let js = null; try { js = JSON.parse(t); } catch {}
  if (!js) throw new Error("kein JSON (" + r.status + "): " + t.slice(0, 180));
  if (js.error) throw new Error("Meta " + (js.error.code || "") + ": " + (js.error.message || "").slice(0, 200));
  return js;
}

// Instagram-Kennung: fest in IG_USER_ID, sonst ueber die Seiten des Tokens suchen.
async function igUserId(env) {
  if (env.IG_USER_ID) return { id: String(env.IG_USER_ID), via: "env" };
  const js = await gj(G + "/me/accounts?fields=name,instagram_business_account{id,username}&limit=50&access_token=" + encodeURIComponent(tok(env)));
  const pages = Array.isArray(js.data) ? js.data : [];
  const hit = pages.find((p) => p.instagram_business_account && p.instagram_business_account.id);
  if (!hit) throw new Error("keine Seite mit verknuepftem Instagram-Konto gefunden (" + pages.length + " Seiten sichtbar)");
  return { id: hit.instagram_business_account.id, via: hit.name + " / @" + (hit.instagram_business_account.username || "?") };
}

async function fetchPosts(env) {
  const { id } = await igUserId(env);
  const js = await gj(G + "/" + id + "/media?fields=id,media_type,media_url,thumbnail_url,permalink,timestamp&limit=" + LIMIT + "&access_token=" + encodeURIComponent(tok(env)));
  const list = Array.isArray(js.data) ? js.data : [];
  return list.filter((m) => m.media_url || m.thumbnail_url).slice(0, LIMIT).map((m) => ({
    id: m.id, permalink: m.permalink || "", type: m.media_type || "", ts: m.timestamp || "", img: "/api/instagram?img=" + encodeURIComponent(m.id),
  }));
}

function respond(posts, at, maxAge) {
  return new Response(JSON.stringify({ ok: true, posts, fetched_at: at }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=" + maxAge, "X-Fetched-At": String(at) },
  });
}

// Bild-Proxy: Medien-Adresse aus der (gecachten) Liste holen und die Bytes durchreichen.
async function image(context, mediaId) {
  const { env, request } = context;
  const cache = caches.default;
  const key = new Request(new URL("/api/instagram?img=" + encodeURIComponent(mediaId), request.url).toString(), { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return hit;
  const js = await gj(G + "/" + encodeURIComponent(mediaId) + "?fields=media_type,media_url,thumbnail_url&access_token=" + encodeURIComponent(tok(env)));
  const src = js.media_type === "VIDEO" ? (js.thumbnail_url || js.media_url) : (js.media_url || js.thumbnail_url);
  if (!src) return new Response("not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const up = await fetch(src);
  if (!up.ok) return new Response("upstream", { status: 502, headers: { "Cache-Control": "no-store" } });
  const buf = await up.arrayBuffer();
  const res = new Response(buf, { headers: { "Content-Type": up.headers.get("Content-Type") || "image/jpeg", "Cache-Control": "public, max-age=604800", "X-Content-Type-Options": "nosniff" } });
  context.waitUntil(cache.put(key, res.clone()));
  return res;
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const img = url.searchParams.get("img");
  if (!tok(env)) return new Response(JSON.stringify({ error: "config", detail: "weder IG_TOKEN noch META_ADS_TOKEN gesetzt" }), { status: 500, headers: { "Content-Type": "application/json" } });
  if (img) { try { return await image(context, img.replace(/[^\w.-]/g, "")); } catch (e) { return new Response("upstream: " + e.message, { status: 502, headers: { "Cache-Control": "no-store" } }); } }

  if (url.searchParams.get("debug") === "1") { // Schrittweise Diagnose, sagt genau welches Recht fehlt
    const log = [];
    try {
      log.push("Token: " + (env.IG_TOKEN ? "IG_TOKEN" : "META_ADS_TOKEN"));
      const who = await igUserId(env); log.push("Instagram-Kennung " + who.id + " (" + who.via + ")");
      const posts = await fetchPosts(env); log.push("Beitraege: " + posts.length + (posts[0] ? ", neuester " + posts[0].ts : ""));
      return new Response(JSON.stringify({ ok: true, log, posts }, null, 2), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    } catch (e) { log.push("FEHLER: " + e.message); return new Response(JSON.stringify({ ok: false, log }, null, 2), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }); }
  }

  const cache = caches.default;
  const key = new Request(new URL("/api/instagram", request.url).toString(), { method: "GET" });
  const store = async (posts) => { const at = Date.now(); const c = respond(posts, at, LIST_TTL); await cache.put(key, c); return respond(posts, at, 300); };
  if (url.searchParams.get("refresh") === "1") { try { return await store(await fetchPosts(env)); } catch (e) { return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 502, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }); } }

  const hit = await cache.match(key);
  if (hit) { // vorhanden: sofort ausliefern, im Hintergrund auffrischen wenn aelter als FRESH_MS
    const age = Date.now() - Number(hit.headers.get("X-Fetched-At") || 0);
    if (age > FRESH_MS) context.waitUntil((async () => { try { await store(await fetchPosts(env)); } catch {} })());
    return hit;
  }
  try { return await store(await fetchPosts(env)); }
  catch (e) { return new Response(JSON.stringify({ ok: false, error: e.message, posts: [] }), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }); }
}
