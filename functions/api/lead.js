// Lead endpoint: Start-LP form -> exercise.com (logic from UCONIC Make blueprint)
// Secrets live in Cloudflare Pages env vars, never in this repo:
//   EXERCISE_EMAIL, EXERCISE_PASSWORD, EXERCISE_ORG_TOKEN
const LOCATION_IDS = { "Winterthur": "2222", "Zürich": "2508", "Zurich": "2508" };

export async function onRequestPost(context) {
  const { env, request } = context;
  const j = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

  if (!env.EXERCISE_EMAIL || !env.EXERCISE_PASSWORD || !env.EXERCISE_ORG_TOKEN)
    return j({ error: "endpoint_not_configured" }, 503);

  let p;
  try { p = await request.json(); } catch { return j({ error: "bad_json" }, 400); }

  const locId = LOCATION_IDS[(p.location || "").trim()];
  if (!locId || !p.email || !p.firstname) return j({ error: "missing_fields" }, 400);

  const clean = (v) => (v == null ? "" : String(v).slice(0, 500));

  // 1) Sign in
  const signin = await fetch("https://app.impact-martialarts.com/api/v4/users/sign_in", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + env.EXERCISE_ORG_TOKEN,
    },
    body: JSON.stringify({ email: env.EXERCISE_EMAIL, password: env.EXERCISE_PASSWORD }),
  });
  if (!signin.ok) return j({ error: "exercise_signin_failed" }, 502);
  const auth = (await signin.json()).auth_token;

  // 2) Create client (mapping identical to the Make blueprint)
  const client = {
    client: {
      email: clean(p.email),
      first_name: clean(p.firstname),
      last_name: clean(p.lastname),
      tag_list: [clean(p.discipline), clean(p.location), "start-lp"].filter(Boolean).join(",\n"),
      profile_fields: [
        { id: "phone_number", name: "Phone Number", value: clean(p.phone) },
        { id: "Interested in", name: "Interested in", value: clean(p.discipline) },
        { id: "Message", name: "Message",
          value: ["Erfahrung: " + clean(p.experience), p.kid_age ? "Kind: " + clean(p.kid_age) : "",
                  "Seite: " + clean(p.page), p.gclid ? "gclid: " + clean(p.gclid) : "",
                  p.fbclid ? "fbclid: " + clean(p.fbclid) : "",
                  p.referrer ? "Referrer: " + clean(p.referrer) : ""].filter(Boolean).join(" | ") },
        { id: "Where did you hear about us?", name: "Where did you hear about us?", value: clean(p.source) },
        { id: "location_id", name: "Location", value: locId },
        { id: "Little Ninjas - Kid's Age", name: "Little Ninjas - Kid's Age", value: clean(p.kid_age) },
      ],
      sub_trainer_id: "2299013",
      do_not_send_email: false,
      lifecycle_stage_id: "9398",
    },
  };

  const add = await fetch("https://app.impact-martialarts.com/api/v2/clients", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + env.EXERCISE_ORG_TOKEN,
      "API-TOKEN": auth,
    },
    body: JSON.stringify(client),
  });
  if (!add.ok) return j({ error: "exercise_add_failed", status: add.status }, 502);
  return j({ ok: true });
}
