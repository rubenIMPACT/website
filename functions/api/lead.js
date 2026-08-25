// Lead endpoint: Start-LP form -> exercise.com (logic from UCONIC Make blueprint)
// Secrets in Cloudflare env: EXERCISE_EMAIL, EXERCISE_PASSWORD, EXERCISE_ORG_TOKEN
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

export async function onRequestPost(context) {
  const { env, request } = context;
  const j = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
  try {
    if (!env.EXERCISE_EMAIL || !env.EXERCISE_PASSWORD || !env.EXERCISE_ORG_TOKEN)
      return j({ error: "endpoint_not_configured" }, 503);

    let p;
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
    if (!signin.ok || !auth) return j({ error: "signin_failed", up: signin.status }, 502);

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

    if (add.ok) return j({ ok: true });
    // Existing client (duplicate email): treat as accepted so the lead's UX succeeds.
    if (add.status === 409 || add.status === 422 || add.status === 400)
      return j({ ok: true, dup: true, up: add.status });
    return j({ error: "add_failed", up: add.status }, 502);
  } catch (e) {
    return j({ error: "exception", detail: String(e && e.message ? e.message : e).slice(0, 140) }, 502);
  }
}
