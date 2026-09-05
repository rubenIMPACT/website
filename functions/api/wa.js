// WhatsApp-Automation (seit 05.09.2026): Datenlieferant fuer das Script im Sheet "WhatsApp Automation"
// (tools/whatsapp/dryrun.gs). Gleicher Login wie /api/lead und /api/klassen, Aufruf nur mit LEADLOG_TOKEN.
// POST {token, action, ...}
//   action "failed_payments" {days?}: Kunden mit fehlgeschlagener Zahlung im Fenster (entspricht dem Custom-Status-
//   Filter "Failed Payments" der Kundenliste: q[client_filter_type][]=failed_payment,,start,end), kompakt je Kunde.
//   Liefert nur, was der Zahlungs-Flow braucht: UID, Name, Telefon, Lifecycle, Billing-Status, naechste Zahlung.
const API = "https://app.impact-martialarts.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export async function onRequestPost(context) {
  const { env, request } = context;
  const j = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
  let p;
  try { p = await request.json(); } catch { return j({ error: "bad_json" }, 400); }
  if (!env.LEADLOG_TOKEN || p.token !== env.LEADLOG_TOKEN) return j({ error: "unauthorized" }, 401);
  try {
    const H = await signIn(env);
    if (!H) return j({ error: "signin_failed" }, 502);
    if (p.action === "failed_payments") return j(await failedPayments(H, Math.min(Math.max(Number(p.days) || 30, 1), 120)));
    return j({ error: "unknown_action" }, 400);
  } catch (e) {
    return j({ error: "exception", detail: String(e && e.message ? e.message : e).slice(0, 200) }, 502);
  }
}

async function failedPayments(H, days) {
  const end = Math.floor(Date.now() / 1000), start = end - days * 86400, rows = [];
  let total = 0;
  for (let page = 1; page <= 10; page++) {
    const url = API + "/api/v2/clients/?page=" + page + "&per=100&q%5Bclient_filter_type%5D%5B%5D=failed_payment%2C%2C" + start + "%2C" + end;
    const r = await fetch(url, { headers: H });
    if (!r.ok) throw new Error("clients " + r.status);
    const b = await r.json();
    const list = Array.isArray(b.client) ? b.client : (Array.isArray(b.clients) ? b.clients : []);
    total = (b.meta && Number(b.meta.total)) || total;
    list.forEach((c) => rows.push({
      uid: String(c.user_id || ""), cid: String(c.id || ""),
      name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim(),
      email: String(c.email || c.client_email || "").toLowerCase(), phone: String(c.client_phone_number || ""),
      lifecycle: String(c.lifecycle_stage_name || ""), billing: String(c.billing_status || ""),
      failed: c.failed_payment, has_sub: !!c.has_subscription, cancel_pending: !!c.cancel_pending,
      next_payment: c.next_payment && c.next_payment.date ? new Date(Number(c.next_payment.date) * 1000).toISOString().slice(0, 10) : "",
    }));
    if (!list.length || list.length < 100 || (total && rows.length >= total)) break;
  }
  return { ok: true, days, start, end, total, count: rows.length, rows };
}

async function signIn(env) {
  if (!env.EXERCISE_EMAIL || !env.EXERCISE_PASSWORD || !env.EXERCISE_ORG_TOKEN) return null;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(API + "/api/v4/users/sign_in", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.EXERCISE_ORG_TOKEN, "User-Agent": UA }, body: JSON.stringify({ email: env.EXERCISE_EMAIL, password: env.EXERCISE_PASSWORD }) });
      if (r.ok) { const auth = (await r.json()).auth_token; if (auth) return { "Authorization": "Bearer " + env.EXERCISE_ORG_TOKEN, "API-TOKEN": auth, "Accept": "application/json", "User-Agent": UA }; }
    } catch (e) { /* retry */ }
    await new Promise((res) => setTimeout(res, 500 * (i + 1)));
  }
  return null;
}
