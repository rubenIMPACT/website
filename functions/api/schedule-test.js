// TEMPORAER: prueft, ob der Kalender MIT Login den vollen Plan liefert.
// Gibt NUR Zaehler pro Tag/Standort zurueck (keine Personendaten). Nach dem Test loeschen.
const API = "https://app.impact-martialarts.com";
const UA = { "Accept": "application/json",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  "Referer": "https://app.impact-martialarts.com/" };

function summarize(list) {
  const days = {};
  let withClients = 0;
  for (const s of list) {
    const d = s.data || {};
    const key = (d.location_id || "?") + " " + String(s.start_time || "").slice(0, 10);
    days[key] = (days[key] || 0) + 1;
    if ((d.client_name || "").trim()) withClients++;
  }
  return { total: list.length, withClients, days };
}

export async function onRequestGet(context) {
  const { env } = context;
  const j = (o, s = 200) => new Response(JSON.stringify(o, null, 1), { status: s, headers: { "Content-Type": "application/json" } });
  if (!env.EXERCISE_EMAIL || !env.EXERCISE_PASSWORD || !env.EXERCISE_ORG_TOKEN) return j({ error: "no_env" }, 503);

  const signin = await fetch(API + "/api/v4/users/sign_in", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.EXERCISE_ORG_TOKEN, ...UA },
    body: JSON.stringify({ email: env.EXERCISE_EMAIL, password: env.EXERCISE_PASSWORD }),
  });
  let auth = null;
  try { auth = (await signin.json()).auth_token; } catch {}
  if (!signin.ok || !auth) return j({ error: "signin", status: signin.status }, 502);

  const now = Math.floor(Date.now() / 1000);
  const tries = {
    range14: "/api/v4/calendar?start=" + now + "&end=" + (now + 14 * 86400),
    cal_loc: "/api/v4/calendar?start=" + now + "&end=" + (now + 14 * 86400) + "&location_ids[]=2508&location_ids[]=2222",
    sched_appts: "/api/v4/scheduled_appointments",
    appts: "/api/v4/appointments?start=" + now + "&end=" + (now + 14 * 86400),
    services: "/api/v4/services",
    v2_sched: "/api/v2/scheduled_appointments",
    v2_cal: "/api/v2/calendar?start=" + now + "&end=" + (now + 14 * 86400),
  };
  const out = {};
  for (const [name, path] of Object.entries(tries)) {
    try {
      const r = await fetch(API + path, { headers: { ...UA, "Authorization": "Bearer " + env.EXERCISE_ORG_TOKEN, "API-TOKEN": auth } });
      const body = await r.text();
      let parsed = null;
      try { parsed = JSON.parse(body); } catch {}
      if (Array.isArray(parsed)) out[name] = summarize(parsed);
      else if (parsed && typeof parsed === "object") {
        const arr = parsed.data || parsed.results || parsed.appointments || parsed.scheduled_appointments || parsed.services;
        out[name] = Array.isArray(arr) ? { keys: Object.keys(parsed), ...summarize(arr) } : { status: r.status, keys: Object.keys(parsed).slice(0, 12), snippet: body.slice(0, 160) };
      } else out[name] = { status: r.status, snippet: body.slice(0, 120) };
    } catch (e) { out[name] = { error: String(e).slice(0, 120) }; }
  }
  return j(out);
}
