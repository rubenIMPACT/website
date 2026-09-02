// Formulare ohne CRM-Anbindung (Events, Kuendigungs-Feedback): landen nur im Google-Sheet-Log
// Secrets in Cloudflare env: LEADLOG_URL, LEADLOG_TOKEN (gleiche wie lead.js)
function j(o, s) { return new Response(JSON.stringify(o), { status: s || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }); }
function clean(v, max) { return String(v == null ? "" : v).replace(/[\r\n\t]+/g, " ").trim().slice(0, max || 400); }
export async function onRequestPost(context) {
  const { env, request } = context;
  let p; try { p = await request.json(); } catch { return j({ error: "json" }, 400); }
  if (p.hp) return j({ ok: true });
  const kind = p.kind === "event" ? "event" : p.kind === "cancellation" ? "cancellation" : null;
  if (!kind) return j({ error: "kind" }, 400);
  let data;
  if (kind === "event") {
    if (!clean(p.name) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean(p.email)) || !clean(p.event_id)) return j({ error: "fields" }, 400);
    data = { event_id: clean(p.event_id, 80), event_title: clean(p.event_title, 120), event_date: clean(p.event_date, 20), location: clean(p.location, 40),
      name: clean(p.name, 120), email: clean(p.email, 160).toLowerCase(), phone: clean(p.phone, 40), friends: clean(p.friends, 10), lang: clean(p.lang, 5), page: clean(p.page, 200) };
  } else {
    const f = ["first_name", "last_name", "reason", "expectations", "expectations_text", "satisfaction", "satisfaction_text", "timing", "timing_text", "price", "price_stay", "price_max", "suggestions", "rejoin", "rejoin_text", "lang"];
    data = { anonymous: !!p.anonymous };
    for (const k of f) data[k] = clean(p[k], 2000);
    if (data.anonymous) { data.first_name = ""; data.last_name = ""; }
    if (!data.reason && !data.suggestions && !data.satisfaction) return j({ error: "empty" }, 400);
  }
  if (!env.LEADLOG_URL || !env.LEADLOG_TOKEN) return j({ error: "config" }, 500);
  // Apps Script fuehrt doPost beim POST aus und antwortet mit 302 (Redirect auf die Ergebnisseite).
  // Der Redirect wird NICHT verfolgt: 302 = Script hat gelaufen. Google antwortet manchmal erst nach >10s,
  // die Zeile ist dann trotzdem geschrieben. Darum: nach 9s optimistisch "ok" melden, Request laeuft im Hintergrund weiter.
  const body = JSON.stringify({ token: env.LEADLOG_TOKEN, kind, data });
  const req = fetch(env.LEADLOG_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body, redirect: "manual" }).then((r) => r.status).catch(() => -1);
  context.waitUntil(req);
  const status = await Promise.race([req, new Promise((res) => setTimeout(() => res("timeout"), 9000))]);
  if (status === "timeout" || status === 302 || status === 200) return j({ ok: true });
  return j({ ok: false, up: status }, 502);
}
