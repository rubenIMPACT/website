// Live-Stundenplan: liest den oeffentlichen exercise.com-Kalender,
// filtert pro Standort auf die naechsten 7 Tage und gibt NUR unkritische Felder weiter.
const UPSTREAM = "https://app.impact-martialarts.com/api/v4/calendar";
const LOC = { winterthur: 2222, zurich: 2508 };
const TZ = "Europe/Zurich";

function slugFor(name) {
  const n = name.toLowerCase();
  if (n.includes("ninja")) return "little-ninjas";
  if (n.includes("kickbox")) return "fitness-kickboxen";
  if (n.includes("muay") || n.includes("striking")) return "muay-thai";
  if (n.includes("bjj")) return "bjj";
  if (n.includes("wrestling") || n.includes("ringen")) return "ringen";
  if (n.includes("boxing") || n.includes("boxen")) return "boxen";
  if (n.includes("mma")) return "mma";
  if (n.includes("defense")) return "street-defense";
  if (n.includes("personal")) return "personal-training";
  return null; // z.B. Open Mat
}

function zparts(iso) {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("de-CH", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false });
  const p = Object.fromEntries(fmt.formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, wd: p.weekday.replace(".", "") };
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const loc = LOC[(url.searchParams.get("loc") || "").toLowerCase()];
  if (!loc) return new Response(JSON.stringify({ error: "loc" }), { status: 400, headers: { "Content-Type": "application/json" } });

  const cache = caches.default;
  const key = new Request(url.toString(), context.request);
  const hit = await cache.match(key);
  if (hit) return hit;

  const up = await fetch(UPSTREAM, { headers: { "Accept": "application/json" } });
  if (!up.ok) return new Response(JSON.stringify({ error: "upstream", status: up.status }), { status: 502, headers: { "Content-Type": "application/json" } });
  const all = await up.json();

  const now = Date.now();
  const horizon = now + 7 * 86400000;
  const days = {};
  for (const s of all) {
    const d = s.data || {};
    if (d.location_id !== loc) continue;
    const t = new Date(s.start_time).getTime();
    if (isNaN(t) || t < now - 3600000 || t > horizon) continue;
    const svc = (d.service || s.text || "").trim();
    if (!svc) continue;
    const m = svc.match(/^(.*?)\s*-\s*(Basics|All Levels|Competition|Sparring)\s*$/i);
    const name = m ? m[1].trim() : svc;
    const level = m ? m[2].trim() : "";
    const zp = zparts(s.start_time);
    const mins = Math.round((new Date(s.end_time) - new Date(s.start_time)) / 60000) || 60;
    const coach = [d.primary_trainer_name, d.secondary_trainer_name].filter(Boolean).join(" & ");
    (days[zp.date] = days[zp.date] || { date: zp.date, wd: zp.wd, sessions: [] }).sessions.push(
      { time: zp.time, name, level, mins, coach, slug: slugFor(svc) });
  }
  const out = Object.values(days).sort((a, b) => a.date.localeCompare(b.date));
  out.forEach(d => d.sessions.sort((a, b) => a.time.localeCompare(b.time)));

  const res = new Response(JSON.stringify({ updated: new Date().toISOString(), days: out }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300, s-maxage=900", "Access-Control-Allow-Origin": "*" } });
  context.waitUntil(cache.put(key, res.clone()));
  return res;
}
