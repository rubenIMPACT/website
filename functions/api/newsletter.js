// Newsletter sign-up -> Mailchimp (25.09.2026, Ruben: pop-up for undecided visitors + optional tick box in the trial form).
// Double opt-in: new addresses get status "pending", Mailchimp sends the confirmation mail, only a click subscribes them.
// Existing contacts keep their status (an unsubscribed person is never re-subscribed from here).
// Secret in Cloudflare env: MAILCHIMP_API_KEY (Ruben creates it in Mailchimp, ends with "-us14"). Optional: MAILCHIMP_LIST_ID.
// Without the key the endpoint answers 503 and the website keeps the feature switched off (NL_ON in assets/track.js).

function j(o, s) { return new Response(JSON.stringify(o), { status: s || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }); }
function clean(v, max) { return String(v == null ? "" : v).replace(/[\r\n\t]+/g, " ").trim().slice(0, max || 200); }
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

async function md5(s) {
  const b = await crypto.subtle.digest("MD5", new TextEncoder().encode(s)); // Cloudflare Workers support MD5 (Mailchimp member id)
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

// subscribe({ email, source: "popup" | "trial", lang: "de" | "en", firstname, lastname, location }) -> { ok, status, error }
export async function subscribe(env, d) {
  const key = env.MAILCHIMP_API_KEY || "";
  const dc = (key.split("-")[1] || "").trim();
  if (!key || !dc) return { ok: false, error: "not_configured" };
  const email = clean(d.email, 160).toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "email" };
  const API = "https://" + dc + ".api.mailchimp.com/3.0";
  const H = { "Authorization": "Basic " + btoa("impact:" + key), "Content-Type": "application/json" };
  let list = env.MAILCHIMP_LIST_ID || "";
  if (!list) { // one audience only ("IMPACT Martial Arts Newsletter")
    const r = await fetch(API + "/lists?count=10&fields=lists.id,lists.name", { headers: H });
    if (!r.ok) return { ok: false, error: "lists_" + r.status };
    const ls = ((await r.json()).lists || []);
    const hit = ls.find((l) => /impact/i.test(l.name || "")) || ls[0];
    if (!hit) return { ok: false, error: "no_list" };
    list = hit.id;
  }
  const merge = {};
  if (d.firstname) merge.FNAME = clean(d.firstname, 80);
  if (d.lastname) merge.LNAME = clean(d.lastname, 80);
  if (d.location) { // field "Location" was created by the import of 25.09.2026; its merge tag is looked up by name
    try {
      const r = await fetch(API + "/lists/" + list + "/merge-fields?count=50&fields=merge_fields.tag,merge_fields.name", { headers: H });
      const mf = r.ok ? ((await r.json()).merge_fields || []) : [];
      const f = mf.find((x) => String(x.name).toLowerCase() === "location");
      if (f) merge[f.tag] = clean(d.location, 40);
    } catch {}
  }
  const hash = await md5(email);
  const lang = d.lang === "en" ? "en" : "de";
  const body = { email_address: email, status_if_new: "pending", language: lang };
  if (Object.keys(merge).length) body.merge_fields = merge;
  const r = await fetch(API + "/lists/" + list + "/members/" + hash, { method: "PUT", headers: H, body: JSON.stringify(body) });
  if (!r.ok) {
    let t = ""; try { t = (await r.json()).title || ""; } catch {}
    return { ok: false, error: "put_" + r.status, detail: t };
  }
  const m = await r.json();
  const tags = [{ name: d.source === "trial" ? "Website trial form" : "Website pop-up", status: "active" }, { name: lang === "en" ? "EN" : "DE", status: "active" }];
  try { await fetch(API + "/lists/" + list + "/members/" + hash + "/tags", { method: "POST", headers: H, body: JSON.stringify({ tags }) }); } catch {}
  return { ok: true, status: m.status || "" };
}

export async function onRequestPost(context) {
  const { env, request } = context;
  let p; try { p = await request.json(); } catch { return j({ error: "json" }, 400); }
  if (p.hp) return j({ ok: true }); // honeypot filled = bot, pretend success
  if (!EMAIL_RE.test(clean(p.email, 160))) return j({ error: "email" }, 400);
  const res = await subscribe(env, { email: p.email, source: "popup", lang: clean(p.lang, 5) });
  if (res.error === "not_configured") return j({ error: "not_configured" }, 503);
  if (!res.ok) return j({ error: res.error }, 502);
  return j({ ok: true, status: res.status });
}

// GET: is the key set? ?check=1 also asks Mailchimp for the audience (read only, no contact is touched)
export async function onRequestGet({ env, request }) {
  const key = env.MAILCHIMP_API_KEY || "", out = { configured: !!key };
  if (key && new URL(request.url).searchParams.get("check") === "1") {
    const dc = (key.split("-")[1] || "").trim();
    try {
      const r = await fetch("https://" + dc + ".api.mailchimp.com/3.0/lists?count=10&fields=lists.id,lists.name,lists.stats.member_count", { headers: { "Authorization": "Basic " + btoa("impact:" + key) } });
      out.mailchimp = r.status;
      if (r.ok) out.lists = ((await r.json()).lists || []).map((l) => ({ name: l.name, members: l.stats && l.stats.member_count }));
    } catch (e) { out.mailchimp = "error"; }
  }
  return j(out);
}
