// Trainingsplan-Endpunkt: das Tool unter /training-plan/ meldet jeden erstellten Plan hierher.
// 1) Log ins Google Sheet (Tab "Trainingsplan") via Apps-Script-Webapp (LEADLOG_URL/LEADLOG_TOKEN)
// 2) Bei bekanntem Lead (signierte lid aus /api/lead): Plan als Notiz in den exercise.com-Kontakt + Mail an den Studio Manager
const API = "https://app.impact-martialarts.com";
const L = {
  goal: { learn: "Kampfkunst lernen", fit: "Fit werden", defense: "Selbstverteidigung", compete: "Wettkampf" },
  art: { mma: "MMA", muaythai: "Muay Thai", boxing: "Boxen", bjj: "BJJ", wrestling: "Ringen", fitnesskickboxing: "Fitness Kickboxen", explore: "Unsicher" },
  level: { beginner: "Anfänger", intermediate: "Fortgeschritten", advanced: "Erfahren" },
  win: { morning: "Morgen", midday: "Mittag", evening: "Abend" },
  otype: { nothing: "Nichts", cardio: "Laufen/Cardio", strength: "Kraft", sport: "Andere Sportart" },
  ofreq: { "1": "1x", "2": "2x", "3": "3+x" },
};
const DAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
// lid = "<clientId>.<hmac16>" (von /api/lead ausgestellt); nur gueltig signierte IDs duerfen ins CRM schreiben
async function verifyLid(env, lid) {
  const m = /^(\d{1,12})\.([0-9a-f]{16})$/.exec(String(lid || ""));
  if (!m || !env.LEADLOG_TOKEN) return null;
  const expect = await hmac(env.LEADLOG_TOKEN, "lead:" + m[1]);
  return expect === m[2] ? m[1] : null;
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const j = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
  let p;
  try {
    const raw = await request.text();
    if (raw.length > 12000) return j({ error: "too_large" }, 413);
    try { p = JSON.parse(raw); } catch { return j({ error: "bad_json" }, 400); }
    const loc = p.loc === "w" ? "Winterthur" : p.loc === "z" ? "Zürich" : "";
    if (!loc || !L.goal[p.goal]) return j({ error: "missing_fields" }, 400);
    const s = (v, n = 200) => (v == null ? "" : String(v).slice(0, n));
    const arts = (Array.isArray(p.arts) ? p.arts : []).map((a) => L.art[a]).filter(Boolean).slice(0, 3).join(", ");
    const win = (Array.isArray(p.win) ? p.win : []).map((w) => L.win[w]).filter(Boolean).join(", ");
    const plan = (Array.isArray(p.plan) ? p.plan : []).slice(0, 12)
      .map((x) => (DAYS[Number(x.d)] || "?") + " " + s(x.s, 5) + " " + s(x.disc, 30) + (x.lv ? " (" + s(x.lv, 20) + ")" : "") + (x.coach ? " · " + s(x.coach, 40) : ""))
      .join(" | ");
    const share = /^https:\/\/www\.impact-martialarts\.com\/training-plan\?/.test(s(p.share, 600)) ? s(p.share, 600) : "";
    const data = {
      sid: s(p.sid, 40), src: ["danke", "share", "direct"].includes(p.src) ? p.src : "direct", location: loc,
      goal: L.goal[p.goal], arts, level: L.level[p.level] || "", freq: s(p.freq, 2), win,
      otype: L.otype[p.otype] || "", ofreq: p.otype && p.otype !== "nothing" ? (L.ofreq[s(p.ofreq, 2)] || "") : "",
      sessions: s(p.sessions, 3), pkg: s(p.pkg, 40), plan, share, lead_id: "", firstname: "", lastname: "", email: "", page: s(p.page, 200),
    };

    // Bekannter Lead: Kontakt lesen, Plan als Notiz ins Profil (Feld "Message") schreiben
    const cid = await verifyLid(env, p.lid);
    let crm = "";
    if (cid && env.EXERCISE_EMAIL && env.EXERCISE_PASSWORD && env.EXERCISE_ORG_TOKEN) {
      try {
        const signin = await fetch(API + "/api/v4/users/sign_in", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.EXERCISE_ORG_TOKEN }, body: JSON.stringify({ email: env.EXERCISE_EMAIL, password: env.EXERCISE_PASSWORD }) });
        const auth = signin.ok ? (await signin.json()).auth_token : null;
        if (auth) {
          const H = { "Content-Type": "application/json", "Authorization": "Bearer " + env.EXERCISE_ORG_TOKEN, "API-TOKEN": auth };
          const cr = await fetch(API + "/api/v2/clients/" + cid, { headers: H });
          const cj = cr.ok ? await cr.json() : null;
          const c = cj && (cj.client || cj.data || cj);
          if (c && (c.id || c.email)) {
            data.lead_id = String(cid);
            data.firstname = s(c.first_name || (c.user && c.user.first_name), 80);
            data.lastname = s(c.last_name || (c.user && c.user.last_name), 80);
            data.email = s(c.email || (c.user && c.user.email), 120);
            const uid = c.user_id || (c.user && c.user.id) || null;
            if (uid) {
              const ur = await fetch(API + "/api/v4/users/" + uid, { headers: H });
              const user = ur.ok ? await ur.json() : null;
              const pf = (user && Array.isArray(user.profile_fields)) ? user.profile_fields.filter((f) => f && f.label).map((f) => ({ label: f.label, value: f.value == null ? "" : String(f.value) })) : [];
              const stamp = new Date().toLocaleDateString("de-CH", { timeZone: "Europe/Zurich" });
              // Kurz und zeilenweise (Entscheid Ruben 03.09.2026): Link zuerst, dann je Punkt eine Zeile.
              const note = ["TRAININGSPLAN " + stamp + (share ? ": " + share : ""),
                "Ziel: " + data.goal, "Kampfkunst: " + (arts || "-"), "Level: " + (data.level || "-"),
                "Tage/Woche: " + (data.freq || "-"), "Zeiten: " + (win || "-")]
                .concat((Array.isArray(p.plan) ? p.plan : []).slice(0, 12).map((x) => "- " + (DAYS[Number(x.d)] || "?") + " " + s(x.s, 5) + " " + s(x.disc, 30) + (x.lv ? " (" + s(x.lv, 20) + ")" : "") + (x.coach ? ", " + s(x.coach, 40) : "")))
                .join("\n");
              // Fruehere Trainingsplan-Notizen entfernen (mehrfaches Klicken im Tool), Rest der Nachricht behalten
              const f = pf.find((x) => x.label === "Message");
              const cleaned = f ? String(f.value || "").split(/\s*\|\|\s*|\n{2,}/).filter((seg) => seg.trim() && !/^TRAININGSPLAN\b/.test(seg.trim())).join("\n\n") : "";
              const merged = (cleaned ? cleaned + "\n\n" : "") + note;
              if (f) f.value = merged; else pf.push({ label: "Message", value: merged });
              const put = await fetch(API + "/api/v4/users/" + uid, { method: "PUT", headers: H, body: JSON.stringify({ user: { profile_fields: pf } }) });
              crm = put.ok ? "CRM-Notiz gesetzt" : "CRM-Notiz fehlgeschlagen (" + put.status + ")";
            } else crm = "CRM: keine User-ID";
          } else crm = "CRM: Kontakt " + cid + " nicht gefunden (" + cr.status + ")";
        } else crm = "CRM: Login fehlgeschlagen";
      } catch (e) { crm = "CRM: Ausnahme " + s(e && e.message, 80); }
    }

    // Log ins Sheet (nie blockierend)
    if (env.LEADLOG_URL && env.LEADLOG_TOKEN) {
      // alert:false = keine Mail je Plan an Abdi/Bogdan (Entscheid Ruben 03.09.2026, die CRM-Notiz reicht); auf !!data.lead_id setzen, um Mails wieder einzuschalten
      const body = JSON.stringify({ token: env.LEADLOG_TOKEN, type: "plan", alert: false, detail: crm, data });
      const pr = fetch(env.LEADLOG_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body, redirect: "follow" }).catch(() => {});
      try { context.waitUntil(pr); } catch {}
    }
    return j({ ok: true, linked: !!data.lead_id, crm });
  } catch (e) {
    return j({ error: "exception", detail: String(e && e.message ? e.message : e).slice(0, 140) }, 502);
  }
}
