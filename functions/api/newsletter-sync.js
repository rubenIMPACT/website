// Weekly transfer of new IMPACT customers from exercise.com to Mailchimp (Ruben 28.09.2026).
// Same rule as the one-off import of 25.09.2026: members (running subscription) and ex-members (stage Client, Inactive Client,
// Dependant client, Personal Training Client, Debt collection, Bexio) are customers and may get the newsletter (Swiss UWG customer
// exception, see the privacy statement). Leads who never bought are NEVER added. Staff, "Do Not Contact" and exercise.com placeholder
// addresses are skipped.
// Safety: anybody already in Mailchimp in ANY state (subscribed, unsubscribed, cleaned, pending, archived) is left alone, so nobody who
// unsubscribed is ever re-added. If the Mailchimp list (incl. archived) cannot be read completely, nothing is written. More than MAX_ADD
// new customers in one run = abort (something is wrong). New contacts get status "subscribed", fields Group / Location and the tag
// "exercise.com sync".
// Called weekly by .github/workflows/newsletter-sync.yml (POST). GET or POST ?dry=1 = count only. The answer holds counts only, no
// personal data. At most one real run per 12 hours (guard in the Cloudflare cache), so calling the URL from outside cannot do harm.
// Secrets: EXERCISE_EMAIL / EXERCISE_PASSWORD / EXERCISE_ORG_TOKEN (like lead.js), MAILCHIMP_API_KEY (like newsletter.js).

const API = "https://app.impact-martialarts.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const CUSTOMER_STAGES = new Set([9399, 9400, 11318, 10271, 11034, 10198]); // Client, Inactive Client, Dependant client, PT Client, Debt collection, Bexio
const DNC_STAGE = 9401; // Do Not Contact
const STAFF_EMAIL = /@impact-martialarts\.com$|@exercise\.com$/i;
const STAFF_NAMES = /^(abdallah|abdi) elshahaibi|^waseem samour|^bogdan cristea|^jo[aã]o carlos|^laszlo simo|^sergei lubcenko|^nathan melliger|^samuel bauer|^ruben crawford|^rania spinnler|^paloma carela|^gioele perretta/i;
const TAG = "exercise.com sync";
const MAX_ADD = 200;
const GUARD_KEY = "https://guard.impact.local/newsletter-sync";

function j(o, s) { return new Response(JSON.stringify(o), { status: s || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }); }

async function signIn(env) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(API + "/api/v4/users/sign_in", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.EXERCISE_ORG_TOKEN, "User-Agent": UA }, body: JSON.stringify({ email: env.EXERCISE_EMAIL, password: env.EXERCISE_PASSWORD }) });
      if (r.ok) { const auth = (await r.json()).auth_token; if (auth) return { "Authorization": "Bearer " + env.EXERCISE_ORG_TOKEN, "API-TOKEN": auth, "Accept": "application/json", "User-Agent": UA }; }
    } catch (e) {}
    await new Promise((res) => setTimeout(res, 800 * (i + 1)));
  }
  return null;
}
async function getJson(url, H) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { headers: H }); if (r.ok) { const js = await r.json(); if (js) return js; } } catch (e) {}
    await new Promise((res) => setTimeout(res, 1200 * (i + 1)));
  }
  return null;
}
const tagsOf = (c) => { const raw = c.tags != null ? c.tags : c.tag_list; return (Array.isArray(raw) ? raw.map((x) => (typeof x === "string" ? x : (x && x.name) || "")) : String(raw || "").split(",")).map((s) => s.trim()).filter(Boolean); };

// exercise.com: all clients, reduced to customers (one entry per e-mail)
async function customers(env) {
  const H = await signIn(env);
  if (!H) throw new Error("exercise_signin");
  const first = await getJson(API + "/api/v4/clients?per=500&page=1", H);
  if (!first || !first.meta) throw new Error("exercise_clients");
  const pages = Math.ceil((first.meta.total || 0) / 500);
  const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, i) => getJson(API + "/api/v4/clients?per=500&page=" + (i + 2), H)));
  if (rest.some((x) => !x)) throw new Error("exercise_clients_page");
  const all = [first].concat(rest).flatMap((x) => x.client || x.clients || []);
  if (all.length < (first.meta.total || 0) * 0.98) throw new Error("exercise_clients_incomplete");
  const by = new Map();
  for (const c of all) {
    const email = String(c.email || c.client_email || "").toLowerCase().trim();
    if (!email || STAFF_EMAIL.test(email)) continue;
    const name = ((c.first_name || "") + " " + (c.last_name || "")).trim();
    const tags = tagsOf(c);
    if (STAFF_NAMES.test(name) || tags.some((t) => /staff/i.test(t))) { by.set(email, { skip: true }); continue; }
    const o = by.get(email) || { email, fn: "", ln: "", member: false, ex: false, dnc: false, loc: new Set() };
    if (o.skip) continue;
    const st = Number(c.lifecycle_stage_id || 0);
    if (st === DNC_STAGE) o.dnc = true;
    if (c.has_subscription) o.member = true;
    if (CUSTOMER_STAGES.has(st)) o.ex = true;
    if (!o.fn) { o.fn = String(c.first_name || "").trim(); o.ln = String(c.last_name || "").trim(); }
    for (const t of tags) { if (/^z[uü]rich$/i.test(t)) o.loc.add("Zürich"); if (/^winterthur$/i.test(t)) o.loc.add("Winterthur"); }
    by.set(email, o);
  }
  const out = [];
  for (const o of by.values()) if (!o.skip && !o.dnc && (o.member || o.ex)) out.push(o);
  return { clients: all.length, customers: out };
}

// Mailchimp: every address in the audience in any state (archived separately)
async function mailchimp(env) {
  const key = env.MAILCHIMP_API_KEY || "", dc = (key.split("-")[1] || "").trim();
  if (!key || !dc) throw new Error("mailchimp_not_configured");
  const API_MC = "https://" + dc + ".api.mailchimp.com/3.0";
  const H = { "Authorization": "Basic " + btoa("impact:" + key), "Content-Type": "application/json" };
  const ls = await getJson(API_MC + "/lists?count=10&fields=lists.id,lists.name", H);
  const list = ls && ((ls.lists || []).find((l) => /impact/i.test(l.name || "")) || (ls.lists || [])[0]);
  if (!list) throw new Error("mailchimp_list");
  const id = env.MAILCHIMP_LIST_ID || list.id;
  const known = new Set();
  const readAll = async (status) => {
    let offset = 0, total = null;
    do {
      const q = "count=1000&offset=" + offset + "&fields=total_items,members.email_address" + (status ? "&status=" + status : "");
      const r = await getJson(API_MC + "/lists/" + id + "/members?" + q, H);
      if (!r) throw new Error("mailchimp_members_" + (status || "all"));
      total = r.total_items || 0;
      (r.members || []).forEach((m) => known.add(String(m.email_address || "").toLowerCase().trim()));
      offset += 1000;
    } while (offset < total);
    return total;
  };
  const totalAll = await readAll("");
  const totalArchived = await readAll("archived");
  return { API_MC, H, id, known, totalAll, totalArchived };
}

async function mergeTags(mc) {
  const r = await getJson(mc.API_MC + "/lists/" + mc.id + "/merge-fields?count=50&fields=merge_fields.tag,merge_fields.name", mc.H);
  const m = {};
  ((r && r.merge_fields) || []).forEach((f) => { m[String(f.name).toLowerCase()] = f.tag; });
  return m;
}

async function tagSegment(mc) {
  const r = await getJson(mc.API_MC + "/lists/" + mc.id + "/segments?type=static&count=1000&fields=segments.id,segments.name", mc.H);
  const hit = ((r && r.segments) || []).find((s) => s.name === TAG);
  if (hit) return hit.id;
  const c = await fetch(mc.API_MC + "/lists/" + mc.id + "/segments", { method: "POST", headers: mc.H, body: JSON.stringify({ name: TAG, static_segment: [] }) });
  return c.ok ? (await c.json()).id : null;
}

async function run(env, dry) {
  const cu = await customers(env);
  const mc = await mailchimp(env);
  const todo = cu.customers.filter((o) => !mc.known.has(o.email));
  const res = { dry, exercise_clients: cu.clients, customers: cu.customers.length, mailchimp_contacts: mc.totalAll, mailchimp_archived: mc.totalArchived,
    new_customers: todo.length, new_members: todo.filter((o) => o.member).length, new_ex_members: todo.filter((o) => !o.member).length };
  if (dry || !todo.length) return res;
  if (todo.length > MAX_ADD) return Object.assign(res, { error: "too_many", note: "more than " + MAX_ADD + " new customers in one run, nothing written" });
  const mt = await mergeTags(mc);
  const members = todo.map((o) => {
    const merge = {};
    if (o.fn) merge.FNAME = o.fn.slice(0, 80);
    if (o.ln) merge.LNAME = o.ln.slice(0, 80);
    if (mt.group) merge[mt.group] = o.member ? "Member" : "Ex-member";
    if (mt.location && o.loc.size) merge[mt.location] = Array.from(o.loc).join("/");
    return { email_address: o.email, status: "subscribed", merge_fields: merge };
  });
  let added = 0, updated = 0; const errors = [];
  for (let i = 0; i < members.length; i += 500) {
    const r = await fetch(mc.API_MC + "/lists/" + mc.id, { method: "POST", headers: mc.H, body: JSON.stringify({ members: members.slice(i, i + 500), update_existing: false }) });
    if (!r.ok) { errors.push("batch_" + r.status); continue; }
    const b = await r.json();
    added += (b.new_members || []).length; updated += (b.updated_members || []).length;
    (b.errors || []).forEach((e) => errors.push(String(e.error_code || e.error || "error").slice(0, 60)));
  }
  const seg = await tagSegment(mc);
  if (seg) {
    const emails = todo.map((o) => o.email);
    for (let i = 0; i < emails.length; i += 500)
      await fetch(mc.API_MC + "/lists/" + mc.id + "/segments/" + seg, { method: "POST", headers: mc.H, body: JSON.stringify({ members_to_add: emails.slice(i, i + 500) }) });
  }
  return Object.assign(res, { added, updated, errors: errors.slice(0, 20), error_count: errors.length, tagged: !!seg });
}

async function handle(context, wantDry) {
  const { env, request } = context;
  const dry = wantDry || new URL(request.url).searchParams.get("dry") === "1";
  const cache = caches.default;
  if (!dry) {
    const last = await cache.match(GUARD_KEY);
    if (last) return j({ skipped: true, note: "ran within the last 12 hours", last_run: await last.text() });
  }
  try {
    const res = await run(env, dry);
    if (!dry && !res.error) context.waitUntil(cache.put(GUARD_KEY, new Response(new Date().toISOString(), { headers: { "Cache-Control": "max-age=43200" } })));
    return j(res, res.error ? 409 : 200);
  } catch (e) {
    return j({ error: String(e && e.message ? e.message : e).slice(0, 120) }, 502);
  }
}
export const onRequestGet = (context) => handle(context, true);   // GET never writes
export const onRequestPost = (context) => handle(context, false);
