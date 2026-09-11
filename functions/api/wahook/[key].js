// WhatsApp webhook (Meta Cloud API via Dualhook Webhook Override), 11.09.2026.
// URL: https://www.impact-martialarts.com/api/wahook/<WA_HOOK_KEY>  (the key in the path is the shared secret: Meta signs the
// POSTs with Dualhook's app secret, which we do not have, so the high-entropy path + shape checks are the protection Dualhook recommends).
// GET  = Meta's verification handshake (hub.verify_token must equal WA_VERIFY_TOKEN, answer = hub.challenge).
// POST = events (inbound messages, statuses, echoes of messages the coaches send from the WhatsApp Business App, history/contact sync).
//        Compact rows are forwarded to the Apps-Script web app of the WhatsApp Automation project (WA_EVENTS_URL, doPost in dryrun.gs),
//        which appends them to the tab "WA Events" in the sheet "WhatsApp Automation". Always answers 200 fast (Meta retries otherwise).
// Secrets in Cloudflare env: WA_HOOK_KEY, WA_VERIFY_TOKEN, WA_EVENTS_URL, LEADLOG_TOKEN (auth towards the Apps-Script web app).
const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

export async function onRequestGet({ request, env, params }) {
  if (!env.WA_HOOK_KEY || params.key !== env.WA_HOOK_KEY) return new Response("not found", { status: 404 });
  const u = new URL(request.url), mode = u.searchParams.get("hub.mode"), tok = u.searchParams.get("hub.verify_token"), ch = u.searchParams.get("hub.challenge");
  if (mode === "subscribe" && env.WA_VERIFY_TOKEN && tok === env.WA_VERIFY_TOKEN && ch) return new Response(ch, { status: 200, headers: { "Content-Type": "text/plain" } });
  return new Response("forbidden", { status: 403 });
}

export async function onRequestPost(context) {
  const { request, env, params } = context;
  if (!env.WA_HOOK_KEY || params.key !== env.WA_HOOK_KEY) return new Response("not found", { status: 404 });
  let p; try { p = await request.json(); } catch { return j({ ok: false, error: "bad_json" }, 200); }
  if (!p || p.object !== "whatsapp_business_account" || !Array.isArray(p.entry)) return j({ ok: true, ignored: "shape" });
  const rows = extract(p, request.headers);
  if (rows.length && env.WA_EVENTS_URL && env.LEADLOG_TOKEN) {
    const body = JSON.stringify({ token: env.LEADLOG_TOKEN, type: "wa_events", rows });
    const pr = fetch(env.WA_EVENTS_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body, redirect: "follow" }).catch(() => {});
    try { context.waitUntil(pr); } catch { /* outside Pages context */ }
  }
  return j({ ok: true, rows: rows.length });
}

// One compact row per event: [received (unix s), phone_number_id, waba, field, direction, counterpart wa_id, name, type, text (300), message id, status, extra]
function extract(p, headers) {
  const out = [], now = Math.floor(Date.now() / 1000), s = (v, n) => String(v === undefined || v === null ? "" : v).slice(0, n || 200);
  for (const e of p.entry) {
    const waba = s(e.id, 40);
    for (const c of (e.changes || [])) {
      const f = s(c.field, 40), v = c.value || {}, pnid = s(v.metadata && v.metadata.phone_number_id, 40);
      const names = {}; (v.contacts || []).forEach((k) => { if (k && k.wa_id) names[s(k.wa_id, 30)] = s(k.profile && k.profile.name, 80); });
      if (f === "messages" || f === "smb_message_echoes") {
        const echo = f === "smb_message_echoes";
        for (const m of (v.messages || v.message_echoes || [])) {
          const other = echo ? s(m.to, 30) : s(m.from, 30), type = s(m.type, 20);
          const text = type === "text" ? s(m.text && m.text.body, 300) : (m[type] && (m[type].caption || m[type].body || m[type].text) ? s(m[type].caption || m[type].body || m[type].text, 300) : "");
          out.push([Number(m.timestamp) || now, pnid, waba, f, echo ? "out-app" : "in", other, names[other] || "", type, text, s(m.id, 120), "", echo && m.from ? "from " + s(m.from, 30) : ""]);
        }
        for (const st of (v.statuses || [])) out.push([Number(st.timestamp) || now, pnid, waba, f, "status", s(st.recipient_id, 30), "", "", "", s(st.id, 120), s(st.status, 20), st.errors ? s(JSON.stringify(st.errors), 200) : ""]);
      } else if (f === "history" || f === "smb_app_state_sync") {
        out.push([now, pnid, waba, f, "sync", "", "", "", "", "", s(v.metadata && v.metadata.phase || v.phase, 40), s(JSON.stringify(v).length, 20) + " chars"]);
      } else {
        out.push([now, pnid, waba, f, "event", "", "", "", "", "", "", s(JSON.stringify(v), 300)]);
      }
    }
  }
  const ev = headers.get("X-Dualhook-Event"); if (ev && !out.length) out.push([now, "", "", "dualhook", "event", "", "", "", "", "", s(ev, 60), ""]);
  return out.slice(0, 200);
}
