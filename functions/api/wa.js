// WhatsApp-Automation (seit 05.09.2026): Datenlieferant fuer das Script im Sheet "WhatsApp Automation"
// (tools/whatsapp/dryrun.gs). Gleicher Login wie /api/lead und /api/klassen, Aufruf nur mit LEADLOG_TOKEN.
// POST {token, action, ...}
//   action "failed_payments" {days?}: Kunden mit fehlgeschlagener Zahlung im Fenster (entspricht dem Custom-Status-
//   Filter "Failed Payments" der Kundenliste: q[client_filter_type][]=failed_payment,,start,end), kompakt je Kunde.
//   Liefert nur, was der Zahlungs-Flow braucht: UID, Name, Telefon, Lifecycle, Billing-Status, naechste Zahlung.
//   action "report" {key, start, end, per?, location_id?, refresh?, rows?, sample?}: generischer Zugriff auf einen
//   exercise.com-Report (/api/v4/reports/<key>, gleicher Cache-Mechanismus wie klassen.js: refresh=true stoesst die
//   Generierung an, danach ohne refresh abholen; {ready:false} = noch am Rechnen, spaeter nochmals rufen).
//   Grundlage fuer das Verzugskonto (Report "failed_payments" = jede geplatzte Abbuchung einzeln).
//   action "invoices" {uid?, past_due? (default true), status?, per?, page?}: Rechnungen ueber den Endpunkt der
//   Admin-Oberflaeche (GET /api/v4/fp/invoices?user_id=U&q[past_due]=1, gefunden 08.09.2026 im Code der Seite
//   "Payment Details"). Liefert pro Rechnung u.a. hosted_invoice_url (Stripe-Bezahlseite), paid_at, attempt_count,
//   next_payment_attempt, charge_failure - Grundlage fuer den Rechnungslink in W3/W4 und das automatische Schliessen.
//   action "charges" {uid?, status?, per?, page?}: Abbuchungen (GET /api/v4/fp/charges/?user_id=U&curTab=overview).
//   Beide geben nie Namen, E-Mails oder Kartendaten zurueck (sanitize). Optional start/end (YYYY-MM-DD) = Datumsfilter.
//   action "clients" {uids: [...], status_uids?: [...]}: Name + Standort (location_id) je Mitglied aus GET /api/v4/users/{id};
//   fuer status_uids zusaetzlich Lifecycle/Billing aus der Kundenliste v2 (Schuldner ohne Eintrag in "Failed Payments").
//   action "locations": Standort-IDs -> Namen (Diagnose).
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
    if (p.action === "report") return j(await report(H, p));
    if (p.action === "probe_client") return j(await probeClient(H, String(p.uid || "").replace(/\D/g, "")));
    if (p.action === "invoices") return j(await fpList(H, "/api/v4/fp/invoices", p));
    if (p.action === "charges") return j(await fpList(H, "/api/v4/fp/charges/", p));
    if (p.action === "clients") return j(await clients(H, p.uids, p.status_uids));
    if (p.action === "locations") return j(await locations(H));
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
      location: String(c.location_name || (c.location && c.location.name) || c.home_location_name || (c.home_location && c.home_location.name) || ""),
      lifecycle: String(c.lifecycle_stage_name || ""), billing: String(c.billing_status || ""),
      failed: c.failed_payment, has_sub: !!c.has_subscription, cancel_pending: !!c.cancel_pending,
      next_payment: c.next_payment && c.next_payment.date ? new Date(Number(c.next_payment.date) * 1000).toISOString().slice(0, 10) : "",
    }));
    if (!list.length || list.length < 100 || (total && rows.length >= total)) break;
  }
  return { ok: true, days, start, end, total, count: rows.length, rows };
}

async function report(H, p) {
  const key = String(p.key || "").replace(/[^a-z_]/g, "");
  if (!key) return { error: "no_key" };
  const start = String(p.start || ""), end = String(p.end || ""), per = Math.min(Number(p.per) || 2000, 10000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return { error: "bad_dates" };
  const q = "page=1&start_date=" + unixCH(start, false) + "&start_date_string=" + start + "&end_date=" + unixCH(end, true) + "&end_date_string=" + end + "&per=" + per + (p.location_id ? "&location_id=" + Number(p.location_id) : "");
  const url = API + "/api/v4/reports/" + key + "?" + q;
  let r = await getJson(H, url + (p.refresh ? "&refresh=true" : ""));
  if (r.status !== 200 || !r.json) return { ok: false, key, status: r.status, error: "report_" + r.status, body: JSON.stringify(r.json || "").slice(0, 200) };
  for (let i = 0; i < (p.refresh ? 6 : 2) && r.json.refreshing; i++) { await sleep(3000); r = await getJson(H, url); }
  const json = r.json, cs = json.cached_stats, filters = filtersText(json);
  const ready = !json.refreshing && filters.indexOf("Start Date: " + start.replace(/-/g, "/")) >= 0;
  const rows = rowsOf(cs);
  const headers = Array.isArray(cs) ? Object.keys(rows[0] || {}) : ((cs && cs.headers) || []);
  const out = { ok: true, key, ready, refreshing: !!json.refreshing, filters: filters.slice(0, 200), headers, count: rows.length, top: Object.keys(json).slice(0, 12) };
  if (p.sample) out.sample = rows.slice(0, Math.min(Number(p.sample), 5)).map((row) => { const o = {}; Object.keys(row).forEach((k) => { o[k] = String(row[k] === undefined || row[k] === null ? "" : row[k]).slice(0, 40); }); return o; });
  if (p.rows) { const cols = Array.isArray(p.cols) ? p.cols.map(String) : null; out.rows = cols ? rows.map((r) => { const o = {}; cols.forEach((c) => { o[c] = r[c]; }); return o; }) : rows; }
  return out;
}
function rowsOf(cs) {
  if (Array.isArray(cs)) return cs.slice(1);
  const H = (cs && cs.headers) || [], rows = [];
  ((cs && cs.reports) || []).forEach((g) => (g.items || []).forEach((it) => { const o = {}; H.forEach((h, i) => { o[h] = it[i]; }); o.__group = g.name; rows.push(o); }));
  return rows;
}
function filtersText(json) { const cs = json.cached_stats; return Array.isArray(cs) ? ((cs[0] || {}).filters || "") : ((cs || {}).filters || ""); }
async function getJson(H, url) {
  const r = await fetch(url, { headers: H });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
}
function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }
function unixCH(dateStr, endOfDay) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const lastSun = (mo) => { const dt = new Date(Date.UTC(y, mo + 1, 0)); return dt.getUTCDate() - dt.getUTCDay(); };
  const t = Date.UTC(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0);
  const dstStart = Date.UTC(y, 2, lastSun(2), 1), dstEnd = Date.UTC(y, 9, lastSun(9), 1);
  const offset = (t >= dstStart && t < dstEnd) ? 2 : 1;
  return Math.floor(t / 1000) - offset * 3600;
}

// Read-only structure probe of one client's payment endpoints (08.09.2026, Ruben's OK): which endpoints exist and whether a
// per-charge pay / hosted invoice link is exposed. Returns key names, array sizes, URL values and a few status/amount fields,
// never names, e-mails or card data.
async function probeClient(H, uid) {
  if (!uid) return { error: "no_uid" };
  const paths = ["/api/v4/users/" + uid, "/api/v4/users/" + uid + "/charges", "/api/v4/users/" + uid + "/invoices", "/api/v4/users/" + uid + "/subscriptions", "/api/v4/users/" + uid + "/events", "/api/v4/users/" + uid + "/payment_details", "/api/v4/charges?user_id=" + uid, "/api/v4/invoices?user_id=" + uid, "/api/v2/clients/" + uid + "/charges", "/api/v4/users/" + uid + "/failed_payments", "/api/v4/subscriptions?user_id=" + uid, "/api/v4/users/" + uid + "/activity"];
  const out = {};
  for (const path of paths) {
    try {
      const r = await fetch(API + path + (path.includes("?") ? "&" : "?") + "per=50&per_page=50", { headers: H });
      let json = null; try { json = await r.json(); } catch {}
      out[path] = { status: r.status, shape: r.status === 200 ? describe(json, 0) : (json && json.error ? String(json.error).slice(0, 60) : null) };
    } catch (e) { out[path] = { error: String(e).slice(0, 80) }; }
  }
  return { ok: true, uid, out };
}
function describe(x, depth) {
  if (x === null || x === undefined) return null;
  if (Array.isArray(x)) return { array: x.length, item: x.length ? describe(x[0], depth + 1) : null };
  if (typeof x === "object") {
    const o = {};
    Object.keys(x).slice(0, 80).forEach((k) => {
      const v = x[k];
      if (typeof v === "string" && /^https?:\/\//.test(v)) o[k] = v.slice(0, 140);
      else if (v && typeof v === "object" && depth < 2) o[k] = describe(v, depth + 1);
      else o[k] = typeof v + (/(url|link|invoice|hosted|retry|status|fail|paid|due|attempt|amount|type|kind|event|action)/i.test(k) && v !== null && typeof v !== "object" ? "=" + String(v).slice(0, 50) : "");
    });
    return o;
  }
  return typeof x;
}

// Rechnungen / Abbuchungen ueber die Endpunkte der Admin-Oberflaeche (nur lesend, keine PII).
async function fpList(H, path, p) {
  const uid = String(p.uid || "").replace(/\D/g, ""), per = Math.min(Math.max(Number(p.per) || 50, 1), 200), page = Math.max(Number(p.page) || 1, 1);
  const isCharges = path.indexOf("charges") >= 0;
  let q = "page=" + page + "&per=" + per + (uid ? "&user_id=" + uid : "");
  if (isCharges) q += "&curTab=overview";
  else if (p.past_due !== false) q += "&q%5Bpast_due%5D=1";
  if (p.status) q += "&q%5Bstatus_eq%5D=" + encodeURIComponent(String(p.status));
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(p.start || ""))) q += "&start_date=" + unixCH(String(p.start), false);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(p.end || ""))) q += "&end_date=" + unixCH(String(p.end), true);
  const r = await getJson(H, API + path + "?" + q);
  if (r.status !== 200 || !r.json) return { ok: false, path, status: r.status, body: JSON.stringify(r.json || "").slice(0, 300) };
  const b = r.json, list = Array.isArray(b) ? b : (b.invoice || b.invoices || b.charge || b.charges || b.data || []);
  const arr = Array.isArray(list) ? list : [];
  return { ok: true, path, uid, page, per, top: Array.isArray(b) ? ["array"] : Object.keys(b).slice(0, 10), meta: b.meta || null, keys: arr.length ? Object.keys(arr[0]) : [], count: arr.length, rows: arr.map(sanitize) };
}
const PII = /(^|_)(first_name|last_name|full_name|formatted_name|paid_by_name|name|email|phone|address|street|city|zip|card|last4|brand|exp_month|exp_year|fingerprint|token|password|birthday)($|_)/i;
function sanitize(x) {
  const o = {};
  Object.keys(x || {}).forEach((k) => {
    if (PII.test(k) && !/^(item_name|plan_name|product_name|location_name)$/.test(k)) return;
    const v = x[k];
    if (v === null || v === undefined) o[k] = null;
    else if (typeof v === "object") o[k] = describe(v, 1);
    else o[k] = typeof v === "string" ? v.slice(0, 200) : v;
  });
  return o;
}

// Client status for a list of user ids (read-only). Field names of /api/v4/users/{id} are guessed with fallbacks; "keys"
// lists the real top-level keys of the first record so the mapping can be corrected.
const LOC_NAMES = { "2508": "Zürich", "2222": "Winterthur" }; // location_id of the user object (same ids as lead.js)
async function clients(H, uids, statusUids) {
  const out = {}, keys = [];
  const list = (Array.isArray(uids) ? uids : []).map((u) => String(u).replace(/\D/g, "")).filter(Boolean).slice(0, 80);
  for (const uid of list) {
    const r = await getJson(H, API + "/api/v4/users/" + uid);
    const u = r.json && (r.json.user || r.json);
    if (r.status !== 200 || !u || typeof u !== "object") { out[uid] = null; continue; }
    if (!keys.length) keys.push(...Object.keys(u).slice(0, 100));
    const pick = (...ks) => { for (const k of ks) { const v = k.split(".").reduce((o, q) => (o && o[q] !== undefined ? o[q] : undefined), u); if (v !== undefined && v !== null && v !== "") return v; } return ""; };
    out[uid] = { uid, name: [pick("first_name"), pick("last_name")].filter(Boolean).join(" ").trim() || String(pick("name", "full_name")), email: String(pick("email")).toLowerCase(), phone: String(pick("phone", "client_phone_number", "phone_number", "mobile_phone")), lifecycle: String(pick("lifecycle_stage_name", "lifecycle_stage.name", "lifecycle_stage", "lifecycle")), billing: String(pick("billing_status", "billing")), cancel_pending: !!pick("cancel_pending"), has_sub: !!pick("has_subscription"), location_id: String(pick("location_id")), location: LOC_NAMES[String(pick("location_id"))] || String(pick("location_name", "location.name", "home_location_name", "home_location.name")), active: pick("active", "is_active", "status", "state") };
  }
  // /users/{id} carries no lifecycle / billing status: for the ids in status_uids take those from the client list (v2), scanning pages until every id is found
  const wantIds = (Array.isArray(statusUids) ? statusUids : []).map((u) => String(u).replace(/\D/g, ""));
  const want = new Set(wantIds.filter((u) => out[u] && !out[u].billing));
  let pages = 0;
  for (let page = 1; page <= 20 && want.size; page++) {
    const r = await getJson(H, API + "/api/v2/clients/?page=" + page + "&per=100");
    const b = r.json, arr = b && (Array.isArray(b.client) ? b.client : (Array.isArray(b.clients) ? b.clients : []));
    if (r.status !== 200 || !arr || !arr.length) break;
    pages++;
    arr.forEach((c) => {
      const u = String(c.user_id || "");
      if (!want.has(u)) return;
      want.delete(u);
      Object.assign(out[u], { lifecycle: String(c.lifecycle_stage_name || ""), billing: String(c.billing_status || ""), cancel_pending: !!c.cancel_pending, has_sub: !!c.has_subscription, phone: out[u].phone || String(c.client_phone_number || ""), cid: String(c.id || ""), location: out[u].location || String(c.location_name || (c.location && c.location.name) || c.home_location_name || ""), in_client_list: true });
    });
    if (arr.length < 100) break;
  }
  return { ok: true, count: Object.keys(out).length, keys, clients: out, client_list_pages: pages, unresolved: [...want] };
}
// Location ids -> names (invoices carry destination_id of type Fbm::Location). Two candidate endpoints, both read-only.
async function locations(H) {
  const out = { ok: true, nodes: {}, locations: {}, info: {} };
  for (const [key, path] of [["nodes", "/api/v4/fbm/platform_nodes?fetch_all=true"], ["locations", "/api/v4/fbm/locations?fetch_all=true&per=100"]]) {
    const r = await getJson(H, API + path), b = r.json;
    const list = Array.isArray(b) ? b : (b && (b.platform_nodes || b.platform_node || b.locations || b.location || b.nodes || b.data)) || [];
    (Array.isArray(list) ? list : []).forEach((n) => { if (n && n.id !== undefined) out[key][String(n.id)] = String(n.name || n.title || n.label || ""); });
    out.info[key] = { status: r.status, top: Array.isArray(b) ? ["array"] : Object.keys(b || {}).slice(0, 8), sample: Array.isArray(list) && list[0] ? Object.keys(list[0]).slice(0, 25) : [] };
  }
  return out;
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
