// Lead endpoint: Start-LP form -> exercise.com (logic from UCONIC Make blueprint)
// Secrets in Cloudflare env: EXERCISE_EMAIL, EXERCISE_PASSWORD, EXERCISE_ORG_TOKEN, LEADLOG_URL, LEADLOG_TOKEN (Google-Sheet-Log)
// Antwort enthaelt "lid" (signierte Client-ID) -> Danke-Seite -> Trainingsplan-Tool -> /api/plan (CRM-Notiz + Sheet)
const LOCATION_IDS = { "Winterthur": "2222", "Zürich": "2508", "Zurich": "2508" };
const API = "https://app.impact-martialarts.com";

async function fetchRetry(url, opts, tries) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, opts);
      if (r.status < 500) return r;
      last = new Error("upstream " + r.status);
    } catch (e) { last = e; }
    await new Promise((res) => setTimeout(res, 400 * (i + 1)));
  }
  throw last;
}

// Lead-Log (Google Sheet via Apps-Script-Webapp) - nie blockierend, nie UX-relevant
function logLead(context, env, status, data, detail, alert, extra) {
  if (!env.LEADLOG_URL || !env.LEADLOG_TOKEN) return;
  const body = JSON.stringify(Object.assign({ token: env.LEADLOG_TOKEN, status, detail: String(detail || "").slice(0, 300), alert: !!alert, data }, extra || {}));
  const pr = fetch(env.LEADLOG_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body, redirect: "follow" }).catch(() => {});
  try { context.waitUntil(pr); } catch { /* ausserhalb Pages-Kontext */ }
}

// Signierte Lead-ID "<clientId>.<hmac16>": nur damit darf /api/plan spaeter in den CRM-Kontakt schreiben
async function makeLid(env, cid) {
  if (!cid || !env.LEADLOG_TOKEN) return "";
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.LEADLOG_TOKEN), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("lead:" + cid));
    return cid + "." + Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
  } catch { return ""; }
}

// Dublette: bestehenden Client suchen und mit erneuter Anfrage ergaenzen (Stage bleibt)
async function dupUpdate(env, auth, p, clean) {
  const H = { "Content-Type": "application/json", "Authorization": "Bearer " + env.EXERCISE_ORG_TOKEN, "API-TOKEN": auth };
  const email = String(p.email || "").trim().toLowerCase();
  const stamp = new Date().toISOString().slice(0, 10);
  let found = null, trace = [];
  // exercise.com ignoriert email=/search= und liefert nur die erste Seite. Echte Suche: q[client_search]=... (Hinweis aus der 422-Fehlermeldung des API)
  for (const u of ["/api/v3/clients?q%5Bclient_search%5D=" + encodeURIComponent(email) + "&per=25",
                   "/api/v2/clients?q%5Bclient_search%5D=" + encodeURIComponent(email) + "&per=25",
                   "/api/v4/clients?q%5Bclient_search%5D=" + encodeURIComponent(email) + "&per=25",
                   "/api/v2/clients?email=" + encodeURIComponent(email),
                   "/api/v2/clients?search=" + encodeURIComponent(email),
                   "/api/v4/clients?email=" + encodeURIComponent(email),
                   "/api/v2/clients?query=" + encodeURIComponent(email) + "&per_page=5",
                   "/api/v2/clients?q=" + encodeURIComponent(email),
                   "/api/v2/clients?per_page=100&email=" + encodeURIComponent(email),
                   "/api/v2/clients?per_page=100&search=" + encodeURIComponent(email)]) {
    try {
      const r = await fetch(API + u, { headers: H });
      const txt = await r.text();
      let js = null; try { js = JSON.parse(txt); } catch {}
      let list = Array.isArray(js) ? js : (js && (js.clients || js.data || js.results || js.items || js.client)) || [];
      if (list && !Array.isArray(list)) list = [list];
      const f0 = (list && list[0]) || null;
      trace.push(u.split("?")[0] + " " + r.status + " keys=" + (js && !Array.isArray(js) ? Object.keys(js).slice(0, 6).join("/") : Array.isArray(js) ? "array(" + js.length + ")" : "raw:" + txt.slice(0, 60)) + " n=" + ((list && list.length) || 0) + " first=" + (f0 ? Object.keys(f0).slice(0, 12).join("/") + " em=" + String(f0.email || (f0.user && f0.user.email) || "?") + " ids=" + list.slice(0, 3).map((c) => c && c.id).join(",") : "-"));
      const hit = (list || []).find((c) => c && String(c.email || (c.user && c.user.email) || "").toLowerCase() === email) || ((list || []).length === 1 ? list[0] : null);
      if (hit && hit.id) { found = hit; break; }
    } catch (e) { trace.push("lookup-exc"); }
  }
  if (!found) return { done: false, cid: null, detail: "E-Mail existiert bereits in exercise.com, Kontakt aber nicht auffindbar (evtl. Trainer- oder Staff-Account). Bitte manuell pruefen.", tech: "kein Client gefunden: " + trace.join(", ") };
  // Standort + Profilfelder haengen am User-Objekt (nicht am Client): GET /api/v4/users/{user_id}
  const uid = found.user_id || found.client_id || (found.user && found.user.id) || null;
  let user = null;
  if (uid) {
    try { const r = await fetch(API + "/api/v4/users/" + uid, { headers: H }); if (r.ok) user = await r.json(); else trace.push("user GET " + r.status); } catch { trace.push("user-exc"); }
  }
  const oldPf = (user && Array.isArray(user.profile_fields)) ? user.profile_fields.filter((f) => f && f.label).map((f) => ({ label: f.label, value: f.value == null ? "" : String(f.value) })) : [];
  const getPf = (l) => { const f = oldPf.find((x) => x.label === l); return f ? f.value : ""; };
  const oldMsg = getPf("Message");
  let oldTags = [];
  try {
    const raw = found.tags != null ? found.tags : found.tag_list;
    oldTags = Array.isArray(raw) ? raw.map(String) : String(raw || "").split(/,\s*/).filter(Boolean);
  } catch {}
  const note = "ERNEUTE ANFRAGE " + stamp + ": " + [clean(p.discipline), clean(p.location), p.kid_name ? "Kind " + clean(p.kid_name) + (p.kid_age ? " (" + clean(p.kid_age) + ")" : "") : "", p.message ? clean(p.message) : "", "Seite " + clean(p.page)].filter(Boolean).join(" | ");
  const tags = Array.from(new Set(oldTags.concat([clean(p.discipline), clean(p.location), "repeat-lead-" + stamp]).filter(Boolean)));
  // Bisheriger Standort: location_id des Users, sonst aus den Tags der Erstanfrage
  let oldLoc = "";
  const lid = String((user && user.location_id) || "");
  if (lid === "2508") oldLoc = "Zürich"; else if (lid === "2222") oldLoc = "Winterthur";
  if (!oldLoc) { const hasZ = oldTags.some((t) => /z(u|ü)rich/i.test(t)), hasW = oldTags.some((t) => /winterthur/i.test(t)); if (hasZ && !hasW) oldLoc = "Zürich"; else if (hasW && !hasZ) oldLoc = "Winterthur"; }
  const newLoc = /winterthur/i.test(String(p.location || "")) ? "Winterthur" : "Zürich";
  const locChanged = !!oldLoc && oldLoc !== newLoc;
  const lc = locChanged ? oldLoc + " -> " + newLoc : "";
  // Profilfelder: Liste wird vom API komplett ersetzt, darum bestehende Felder mitschicken
  const newPf = oldPf.map((f) => ({ label: f.label, value: f.value }));
  const setPf = (l, v) => { const f = newPf.find((x) => x.label === l); if (f) f.value = v; else newPf.push({ label: l, value: v }); };
  setPf("Message", (oldMsg ? oldMsg + " || " : "") + note + (locChanged ? " | STANDORTWECHSEL " + lc : ""));
  if (clean(p.discipline)) setPf("Interested in", clean(p.discipline));
  const ub = { profile_fields: newPf };
  if (clean(p.phone)) ub.phone_number = clean(p.phone);
  if (locChanged) ub.location_id = newLoc === "Winterthur" ? 2222 : 2508;
  let tagsOk = false, userOk = false;
  try {
    const r = await fetch(API + "/api/v2/clients/" + found.id, { method: "PUT", headers: H, body: JSON.stringify({ client: { tag_list: tags.join(",\n") } }) });
    tagsOk = r.ok; trace.push("tags PUT " + r.status);
  } catch { trace.push("tags-exc"); }
  if (uid) {
    try {
      const r = await fetch(API + "/api/v4/users/" + uid, { method: "PUT", headers: H, body: JSON.stringify({ user: ub }) });
      userOk = r.ok; trace.push("user PUT " + r.status + (r.ok ? "" : " " + (await r.text()).slice(0, 80)));
    } catch { trace.push("user-put-exc"); }
  }
  const done = userOk && tagsOk;
  return { done, cid: found.id, locchange: lc,
    detail: "Bestehender Kontakt (Client " + found.id + ")" + (done ? " mit Notiz und Tag ergaenzt" : " gefunden, Update unvollstaendig, bitte manuell nachtragen") + (locChanged ? ". Standortwechsel " + lc : ""),
    tech: trace.join(", ") };
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const j = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
  let p;
  try {
    if (!env.EXERCISE_EMAIL || !env.EXERCISE_PASSWORD || !env.EXERCISE_ORG_TOKEN)
      return j({ error: "endpoint_not_configured" }, 503);

    try { p = await request.json(); } catch { return j({ error: "bad_json" }, 400); }
    const locId = LOCATION_IDS[(p.location || "").trim()];
    if (!locId || !p.email || !p.firstname) return j({ error: "missing_fields" }, 400);
    const clean = (v) => (v == null ? "" : String(v).slice(0, 500));

    // 1) Sign in (retry; tolerate non-JSON bodies)
    const signin = await fetchRetry(API + "/api/v4/users/sign_in", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.EXERCISE_ORG_TOKEN },
      body: JSON.stringify({ email: env.EXERCISE_EMAIL, password: env.EXERCISE_PASSWORD }),
    }, 3);
    let auth = null;
    try { auth = (await signin.json()).auth_token; } catch {}
    if (!signin.ok || !auth) { logLead(context, env, "error_signin", p, "exercise.com Login fehlgeschlagen (Status " + signin.status + "). Lead NICHT im CRM, bitte manuell erfassen.", true); return j({ error: "signin_failed", up: signin.status }, 502); }

    // 2) Create client
    const client = { client: {
      email: clean(p.email), first_name: clean(p.firstname), last_name: clean(p.lastname),
      tag_list: [clean(p.discipline), clean(p.location), "start-lp"].filter(Boolean).join(",\n"),
      profile_fields: [
        { id: "phone_number", name: "Phone Number", value: clean(p.phone) },
        { id: "Interested in", name: "Interested in", value: clean(p.discipline) },
        { id: "Message", name: "Message",
          value: ["Erfahrung: " + clean(p.experience),
                  (p.kid_name || p.kid_age) ? "Kind: " + [clean(p.kid_name), p.kid_age ? clean(p.kid_age) + " Jahre" : ""].filter(Boolean).join(", ") : "",
                  p.message ? "Nachricht: " + clean(p.message) : "",
                  "Seite: " + clean(p.page), p.gclid ? "gclid: " + clean(p.gclid) : "",
                  p.fbclid ? "fbclid: " + clean(p.fbclid) : "",
                  p.ttclid ? "ttclid: " + clean(p.ttclid) : "",
                  p.referrer ? "Referrer: " + clean(p.referrer) : ""].filter(Boolean).join(" | ") },
        { id: "Where did you hear about us?", name: "Where did you hear about us?", value: clean(p.source) },
        { id: "location_id", name: "Location", value: locId },
        { id: "Little Ninjas - Kid's Age", name: "Little Ninjas - Kid's Age", value: clean(p.kid_age) },
      ],
      sub_trainer_id: "2299013", do_not_send_email: false, lifecycle_stage_id: "9398",
    } };

    const add = await fetchRetry(API + "/api/v2/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json",
        "Authorization": "Bearer " + env.EXERCISE_ORG_TOKEN, "API-TOKEN": auth },
      body: JSON.stringify(client),
    }, 2);

    if (add.ok) {
      let cid = null; try { const aj = await add.json(); const c = aj && (aj.client || aj.data || aj); cid = c && (c.id || c.client_id) ? String(c.id || c.client_id) : null; } catch {}
      logLead(context, env, "ok", p, "Neu im CRM" + (cid ? " (Client " + cid + ")" : ""), false);
      return j({ ok: true, lid: await makeLid(env, cid) });
    }
    // Dublette (E-Mail existiert): bestehenden Client ergaenzen, UX bleibt "erhalten"
    if (add.status === 409 || add.status === 422 || add.status === 400) {
      let addTxt = ""; try { addTxt = (await add.text()).slice(0, 200); } catch {}
      let addMsg = ""; try { const ej = JSON.parse(addTxt); addMsg = (ej.errors && ej.errors[0] && ej.errors[0].detail) || ""; } catch {}
      const du = await dupUpdate(env, auth, p, clean);
      // Jede erneute Anfrage -> Mail an den Studio Manager des Standorts (Routing im Apps-Script)
      logLead(context, env, du.done ? "dublette_ergaenzt" : "dublette_NICHT_ergaenzt", p, du.detail + (!du.done && addMsg ? " exercise.com meldet: " + addMsg : ""), true,
        { locchange: du.locchange || "", tech: "add " + add.status + " " + addTxt + " -> " + (du.tech || "") });
      return j({ ok: true, dup: true, updated: du.done, up: add.status, lid: await makeLid(env, du.cid) });
    }
    let addErr = ""; try { addErr = (await add.text()).slice(0, 120); } catch {}
    logLead(context, env, "error_add", p, "exercise.com hat den Lead abgelehnt (Status " + add.status + "). Bitte manuell erfassen.", true, { tech: "add " + add.status + " " + addErr });
    return j({ error: "add_failed", up: add.status }, 502);
  } catch (e) {
    try { logLead(context, env, "error_exception", (typeof p === "object" && p) ? p : {}, String(e && e.message ? e.message : e).slice(0, 200), true); } catch {}
    return j({ error: "exception", detail: String(e && e.message ? e.message : e).slice(0, 140) }, 502);
  }
}
