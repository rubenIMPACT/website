// Klassenanalyse serverseitig (seit 03.09.2026, Entscheid Ruben): holt die exercise.com-Reports per API mit dem
// gleichen Login wie /api/lead, rechnet Auslastung, Hitlist, Umsatzverteilung (Value Pricing) und Mitglieder ohne
// Besuch, und liefert die fertige Import-Struktur an das Apps Script "IMPACT Website Lead Log" (runKlassenanalyse).
// Kein Browser, kein Cowork, kein Modell mehr noetig. Die Rechnung ist ein 1:1-Port von tools/klassenanalyse/
// build_import.py und REVENUE() aus tools/klassenanalyse/fetch_reports.js (dort bleibt der manuelle Fallback).
//
// Aufruf (nur mit LEADLOG_TOKEN): POST {token, phase, start:'YYYY-MM-DD', end:'YYYY-MM-DD', popular_zh?}
//   phase 1: Generierung anstossen (recurring, visits, subs, popular Zuerich)   -> {ok:true}
//   phase 2: popular Zuerich abholen, dann popular Winterthur anstossen         -> {ready, popular_zh}
//   phase 3: alles abholen und rechnen (popular_zh aus Phase 2 mitgeben)        -> {ready, data}
// Popular Services teilt sich EINEN Server-Cache, darum Zuerich und Winterthur nacheinander. Jede Phase bleibt
// kurz (wenige Sekunden), das Warten zwischen den Phasen uebernimmt das Apps Script.
const API = "https://app.impact-martialarts.com";
const LOC = { Zurich: 2508, Winterthur: 2222 };
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export async function onRequestPost(context) {
  const { env, request } = context;
  const j = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
  let p;
  try { p = await request.json(); } catch { return j({ error: "bad_json" }, 400); }
  if (!env.LEADLOG_TOKEN || p.token !== env.LEADLOG_TOKEN) return j({ error: "unauthorized" }, 401);
  const start = String(p.start || ""), end = String(p.end || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return j({ error: "window" }, 400);
  const phase = Number(p.phase || 0);
  try {
    const H = await signIn(env);
    if (!H) return j({ error: "signin_failed" }, 502);
    const q = query(start, end);
    if (phase === 1) {
      const out = {};
      for (const k of ["recurring", "visits", "subs", "Zurich"]) { const r = await getJson(H, reportUrl(k, q) + "&refresh=true"); out[k] = { status: r.status, refreshing: r.json && r.json.refreshing, error: r.json && r.json.error }; }
      return j({ ok: true, started: out });
    }
    if (phase === 2) {
      const r = await getJson(H, reportUrl("Zurich", q));
      if (!r.json) return j({ error: "popular_zh_" + r.status });
      if (!isReady("Zurich", r.json, start)) return j({ ready: false, why: (filtersOf("Zurich", r.json) || "").slice(0, 120) });
      const zh = ((r.json.cached_stats || {}).reports || []).map((s) => ({ name: s.name, items: s.items || [] }));
      const w = await getJson(H, reportUrl("Winterthur", q) + "&refresh=true");
      return j({ ready: true, popular_zh: zh, wt_started: { status: w.status, refreshing: w.json && w.json.refreshing } });
    }
    if (phase === 3) {
      const got = {};
      for (const k of ["Winterthur", "recurring", "visits", "subs"]) {
        const r = await getJson(H, reportUrl(k, q));
        if (!r.json) return j({ error: k + "_" + r.status });
        if (!isReady(k, r.json, start)) return j({ ready: false, waiting: k, why: (filtersOf(k, r.json) || "").slice(0, 120) });
        got[k] = r.json.cached_stats;
      }
      const raw = {
        window: { start, end }, generated: new Date().toISOString(),
        recurring: (got.recurring || []).slice(1),
        popular: { Zurich: { reports: Array.isArray(p.popular_zh) ? p.popular_zh : [] }, Winterthur: { reports: ((got.Winterthur || {}).reports || []).map((s) => ({ name: s.name, items: s.items || [] })) } },
        revenue: REVENUE(got.visits || {}, got.subs || []),
      };
      return j({ ready: true, data: compute(raw) });
    }
    return j({ error: "phase" }, 400);
  } catch (e) {
    return j({ error: "exception", detail: String(e && e.message ? e.message : e).slice(0, 200) }, 502);
  }
}

// ---------------------------------------------------------------- exercise.com
async function signIn(env) {
  if (!env.EXERCISE_EMAIL || !env.EXERCISE_PASSWORD || !env.EXERCISE_ORG_TOKEN) return null;
  let last = null;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(API + "/api/v4/users/sign_in", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.EXERCISE_ORG_TOKEN, "User-Agent": UA }, body: JSON.stringify({ email: env.EXERCISE_EMAIL, password: env.EXERCISE_PASSWORD }) });
      if (r.ok) { const auth = (await r.json()).auth_token; if (auth) return { "Authorization": "Bearer " + env.EXERCISE_ORG_TOKEN, "API-TOKEN": auth, "Accept": "application/json", "User-Agent": UA }; }
      last = r.status;
    } catch (e) { last = e; }
    await new Promise((res) => setTimeout(res, 500 * (i + 1)));
  }
  return null;
}
function unixCH(dateStr, endOfDay) {
  // Schweizer Zeit: Sommerzeit von letztem Sonntag Maerz bis letztem Sonntag Oktober
  const [y, m, d] = dateStr.split("-").map(Number);
  const lastSun = (mo) => { const dt = new Date(Date.UTC(y, mo + 1, 0)); return dt.getUTCDate() - dt.getUTCDay(); };
  const t = Date.UTC(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0);
  const dstStart = Date.UTC(y, 2, lastSun(2), 1), dstEnd = Date.UTC(y, 9, lastSun(9), 1);
  const offset = (t >= dstStart && t < dstEnd) ? 2 : 1;
  return Math.floor(t / 1000) - offset * 3600;
}
function query(start, end) {
  return "page=1&start_date=" + unixCH(start, false) + "&start_date_string=" + start + "&end_date=" + unixCH(end, true) + "&end_date_string=" + end;
}
function reportUrl(key, q) {
  if (key === "recurring") return API + "/api/v4/reports/recurring_sessions?" + q + "&per=400";
  if (key === "visits") return API + "/api/v4/reports/detailed_visits?" + q + "&per=5000";
  if (key === "subs") return API + "/api/v4/reports/active_subscription?" + q + "&per=2000&only_active=true";
  return API + "/api/v4/reports/popular_services?" + q + "&per=400&location_id=" + LOC[key];
}
function filtersOf(key, json) {
  const cs = json.cached_stats;
  if (key === "recurring" || key === "subs") return ((cs || [])[0] || {}).filters || "";
  return (cs || {}).filters || "";
}
function isReady(key, json, start) {
  const f = filtersOf(key, json), want = start.replace(/-/g, "/");
  return !json.refreshing && f.indexOf("Start Date: " + want) >= 0 && (!(key in LOC) || f.indexOf("Location: " + key) >= 0);
}
async function getJson(H, url) {
  const r = await fetch(url, { headers: H });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
}

// ---------------------------------------------------------------- Rechnung (Port von build_import.py)
const DAYORDER = { Mo: 0, Tu: 1, We: 2, Th: 3, Fr: 4, Sa: 5, Su: 6 };
const SERIES = /^(Mo|Tu|We|Th|Fr|Sa|Su)(?:, ?(?:Mo|Tu|We|Th|Fr|Sa|Su))* at (\d{2}:\d{2} [AP]M) \((?:CEST|CET)\) from .+ \(Class\)$/;
const KIDS = /little ninjas|kids|kinder/i, FREE = /open mat/i;
const SKIP = /anmeldegespr|personal training|workshop|seminar|probetraining|trial/i;
const EXCL_HIT = /open mat|self defense for women/i;
const MIN_AVG = 3, MIN_EV = 4;
const r2 = (x) => Math.round(x * 100) / 100;
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
function minutes(t) { const h = parseInt(t.slice(0, 2), 10), mi = parseInt(t.slice(3, 5), 10); return ((h % 12) + (t.slice(6, 8).toUpperCase() === "PM" ? 12 : 0)) * 60 + mi; }
function hm(m) { return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); }
function segment(service) { if (KIDS.test(service)) return "Kids"; if (FREE.test(service)) return "Gratis"; return "Erwachsene"; }
function discipline(service) {
  let x = service.replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  x = x.replace(/\s*-\s*(Basics|All Levels|Competition)\s*$/i, "").trim();
  if (/^BJJ \(No-Gi\)/i.test(x)) return "BJJ No-Gi";
  if (/^BJJ \(Gi\)/i.test(x)) return "BJJ Gi";
  if (/^BJJ$/i.test(x)) return "BJJ Competition";
  if (/^Striking/i.test(x)) return "Muay Thai";
  return x;
}
function level(service) { const m = /-\s*(Basics|All Levels|Competition)\s*$/i.exec(service); return m ? m[1] : ""; }

function loadRows(data) {
  const agg = {};
  for (const loc of Object.keys(data.popular || {})) {
    for (const svc of (data.popular[loc].reports || [])) {
      const name = String(svc.name || "").trim();
      if (!name || SKIP.test(name)) continue;
      for (const it of (svc.items || [])) {
        const label = String(it[0]), m = SERIES.exec(label);
        if (!m) continue;
        const days = label.split(" at ")[0], start = m[2];
        const nums = [it[1], it[2], it[3], it[4]].map((x) => parseInt(parseFloat(x), 10));
        if (nums.some((x) => isNaN(x))) continue;
        const k = [loc, name, days, start].join("|");
        const a = agg[k] = agg[k] || { loc, name, days, start, ev: 0, att: 0, cap: 0, booked: 0 };
        a.ev += nums[0]; a.booked += nums[1]; a.att += nums[2]; a.cap += nums[3];
      }
    }
  }
  const extra = {};
  for (const r of (data.recurring || [])) {
    const loc = String(r["Location"] || "").trim(), svc = String(r["Service"] || "").trim();
    if (!loc || !svc) continue;
    const start = String(r["Start Time"] || "").slice(0, 8), days = String(r["Days"] || "").trim();
    const k = [loc, svc, days, start].join("|");
    const e = extra[k] = extra[k] || { uniq: 0, visits: 0, sessions: 0, staff: new Set() };
    e.uniq = Math.max(e.uniq, num(r["Total Unique Users"])); e.visits += num(r["Total Visits"]); e.sessions += num(r["Total Sessions"]);
    for (const st of [r["Primary Staff"], r["Secondary Staff"]]) if (st) e.staff.add(String(st).trim());
  }
  const rows = [];
  for (const k of Object.keys(agg)) {
    const a = agg[k]; if (a.ev === 0) continue;
    const e = extra[k], mins = minutes(a.start);
    rows.push({ location: a.loc, service: a.name, days: a.days, start: hm(mins), minutes: mins, daytype: a.days === "Sa" ? "Sa" : "Werktag", segment: segment(a.name),
      events: a.ev, attended: a.att, capacity: a.cap, booked: a.booked, uniq: e ? Math.trunc(e.uniq) : 0, rec_visits: e ? Math.trunc(e.visits) : 0,
      staff: e ? Array.from(e.staff).sort().join(", ") : "", matched: !!e });
  }
  rows.sort((x, y) => (x.location < y.location ? -1 : x.location > y.location ? 1 : 0) || ((DAYORDER[x.days.split(",")[0].trim()] ?? 9) - (DAYORDER[y.days.split(",")[0].trim()] ?? 9)) || (x.minutes - y.minutes) || (x.service < y.service ? -1 : x.service > y.service ? 1 : 0));
  return rows;
}
function slotFactors(rows) {
  const slot = {};
  for (const r of rows) { if (r.segment === "Gratis") continue; const k = [r.location, r.daytype, r.minutes].join("|"); const s = slot[k] = slot[k] || { att: 0, ev: 0, disc: new Set() }; s.att += r.attended; s.ev += r.events; s.disc.add(r.discipline || r.service); }
  for (const r of rows) {
    const s = slot[[r.location, r.daytype, r.minutes].join("|")];
    if (r.segment === "Gratis" || !s || s.ev === 0) { r.slot_ratio = null; r.has_neighbor = false; continue; }
    const avg = s.att / s.ev;
    r.slot_ratio = avg ? (r.attended / r.events) / avg : null;
    const others = new Set(s.disc); others.delete(r.discipline || r.service); r.has_neighbor = others.size > 0;
  }
}
function hitlist(rows, keyFn, totalRev) {
  const per = {};
  for (const r of rows) {
    if (r.segment === "Gratis" || EXCL_HIT.test(r.service)) continue;
    const k = keyFn(r), keys = k.indexOf("BJJ Competition") >= 0 ? [k.replace("BJJ Competition", "BJJ Gi"), k.replace("BJJ Competition", "BJJ No-Gi")] : [k];
    for (const kk of keys) {
      const locs = per[kk] = per[kk] || {}; const g = locs[r.location] = locs[r.location] || { w: 0, wr: 0, ev: 0, att: 0, cap: 0, evn: 0, uniq: 0, n: 0, rev: 0 };
      g.ev += r.events; g.att += r.attended; g.cap += r.capacity; g.uniq += r.uniq; g.n += 1; g.rev += r.revenue || 0;
      if (r.slot_ratio != null) { g.w += r.events; g.wr += r.events * r.slot_ratio; if (r.has_neighbor) g.evn += r.events; }
    }
  }
  const out = [];
  for (const name of Object.keys(per)) {
    const locs = per[name], row = { name }, vals = [];
    for (const loc of ["Zurich", "Winterthur"]) {
      const g = locs[loc];
      if (g && g.w) {
        const avg = g.ev ? g.att / g.ev : 0, idx = (avg >= MIN_AVG && g.ev >= MIN_EV) ? g.wr / g.w : null;
        if (idx != null) vals.push(idx);
        row[loc] = { index: idx, util: g.cap ? g.att / g.cap : 0, events: g.ev, attended: g.att, avg, with_neighbor: g.evn, uniq: g.uniq, classes: g.n, revenue: r2(g.rev) };
      } else row[loc] = null;
    }
    const sum = (f) => Object.keys(locs).reduce((a, l) => a + locs[l][f], 0);
    row.index = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    row.events = sum("ev"); row.attended = sum("att"); row.capacity = sum("cap"); row.with_neighbor = sum("evn"); row.uniq = sum("uniq");
    row.revenue = totalRev ? r2(sum("rev")) : null; row.revenue_share = totalRev ? row.revenue / totalRev : null;
    row.util = row.capacity ? row.attended / row.capacity : 0;
    row.revenue_per_event = (totalRev && row.events) ? r2(row.revenue / row.events) : null;
    out.push(row);
  }
  if (totalRev) out.sort((a, b) => ((b.revenue || 0) - (a.revenue || 0)) || (b.attended - a.attended));
  else out.sort((a, b) => ((b.index ?? -9) - (a.index ?? -9)) || (b.attended - a.attended));
  return out;
}
function summary(rows) {
  const out = {};
  for (const r of rows) { if (r.segment === "Gratis") continue; const s = out[r.location] = out[r.location] || { classes: 0, events: 0, attended: 0, capacity: 0, revenue: 0 }; s.classes++; s.events += r.events; s.attended += r.attended; s.capacity += r.capacity; s.revenue = r2(s.revenue + (r.revenue || 0)); }
  return out;
}
function applyRevenue(rows, rv) {
  if (!rv || !rv.slots) return null;
  const norm = (k) => k.split("|").map((x) => x.split(/\s+/).filter(Boolean).join(" ")).join("|");
  const slots = {}; for (const k of Object.keys(rv.slots)) slots[norm(k)] = rv.slots[k];
  const used = new Set();
  for (const r of rows) {
    let chf = 0, vis = 0;
    for (const d of r.days.split(",")) { const k = norm([r.location, r.service, d.trim(), r.start].join("|")); if (slots[k]) { chf += slots[k].chf; vis += slots[k].visits; used.add(k); } }
    r.revenue = r2(chf); r.revenue_visits = vis; r.revenue_per_event = r.events ? r2(chf / r.events) : null;
  }
  const other = {};
  for (const k of Object.keys(slots)) if (!used.has(k)) { const svc = k.split("|")[1]; other[svc] = (other[svc] || 0) + slots[k].chf; }
  const out = {}; for (const k of Object.keys(rv)) if (k !== "slots") out[k] = rv[k];
  out.class_total = r2(rows.reduce((a, r) => a + (r.revenue || 0), 0));
  const os = {}; Object.keys(other).sort((a, b) => other[b] - other[a]).forEach((k) => { os[k] = r2(other[k]); });
  out.other_services = os; out.other_total = r2(Object.keys(other).reduce((a, k) => a + other[k], 0));
  return out;
}
// Schlanke Ausgabe: nur die Felder, die das Apps Script liest (wie build_import + Upload-Version)
const KEEP_ROW = ["location", "segment", "service", "days", "start", "daytype", "events", "attended", "capacity", "uniq", "rec_visits", "staff", "revenue", "revenue_per_event"];
function slimHit(h) {
  const o = {}; for (const k of ["name", "index", "util", "attended", "events", "capacity", "with_neighbor", "uniq", "revenue", "revenue_share", "revenue_per_event"]) o[k] = h[k] === undefined ? null : h[k];
  for (const loc of ["Zurich", "Winterthur"]) { const g = h[loc]; o[loc] = g ? { index: g.index, util: g.util, attended: g.attended, events: g.events, with_neighbor: g.with_neighbor } : null; }
  return o;
}
function compute(data) {
  const rows = loadRows(data);
  if (!rows.length) throw new Error("Keine Klassen erkannt");
  for (const r of rows) { r.discipline = discipline(r.service); r.level = level(r.service); }
  slotFactors(rows);
  const rev = applyRevenue(rows, data.revenue);
  const totalRev = rev ? rev.class_total : 0;
  const hl = hitlist(rows, (r) => r.discipline, totalRev); // Level-Hitlist seit 03.09.2026 nicht mehr (Entscheid Ruben)
  const slimRev = rev ? { basis: rev.basis, members: rev.members, novisit: (rev.novisit || []).map((m) => ({ name: m.name, email: m.email, location: m.location, package: m.package, chf: m.chf, since: m.since })),
    nosub_visits: rev.nosub_visits, nosub_users: rev.nosub_users, visits_completed: rev.visits_completed, class_total: rev.class_total, other_total: rev.other_total, other_services: rev.other_services } : null;
  return { window: data.window, generated: data.generated, rows: rows.map((r) => { const o = {}; for (const k of KEEP_ROW) o[k] = r[k] === undefined ? null : r[k]; return o; }),
    summary: summary(rows), unmatched: rows.filter((r) => !r.matched).length, hitlist: hl.map(slimHit), revenue: slimRev };
}

// ---------------------------------------------------------------- Value Pricing (1:1 aus tools/klassenanalyse/fetch_reports.js)
function REVENUE(vs, subsStats) {
  const H = vs.headers || [], ix = (n) => H.indexOf(n);
  const rows = []; (vs.reports || []).forEach((g) => (g.items || []).forEach((it) => rows.push(it)));
  const comp = rows.filter((x) => x[ix("Status")] === "Completed");
  const subs = (subsStats || []).slice(1);
  const parse = (str) => { const m = /Fr([\d,.]+)\/(month|year|(\d+) months|(\d+) years)/.exec(str || ""); if (!m) return null; const amt = parseFloat(m[1].replace(/,/g, "")); let mo = 1; if (m[2] === "year") mo = 12; else if (m[3]) mo = +m[3]; else if (m[4]) mo = +m[4] * 12; return amt / mo; };
  const coup = (str, v) => { if (!str) return v; let m = /(\d+)% off/.exec(str); if (m) return v * (1 - m[1] / 100); m = /Fr([\d.]+) off/.exec(str); if (m) return Math.max(0, v - parseFloat(m[1])); return v; };
  const mem = {}; let skipped = 0;
  subs.forEach((s) => {
    if (s["Active Subscription Type"] === "Paused" || s["Active Subscription Type"] === "Scheduled") return;
    const v = parse(s["Payment Plan Price"]); if (v == null) { skipped++; return; }
    const m = mem[s["User ID"]] = mem[s["User ID"]] || { chf: 0, name: ((s["First Name"] || "") + " " + (s["Last Name"] || "")).trim(), email: s["Email"] || "", loc: s["Location"] || "?", pkg: [], since: String(s["Start Date"] || "").slice(0, 10) };
    m.chf += coup(s["Current Coupon Discount"], v); m.pkg.push(s["Subscribed To"]);
  });
  const vcount = {}; comp.forEach((x) => { const u = x[ix("User ID")]; vcount[u] = (vcount[u] || 0) + 1; });
  const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"], slots = {}, nosubUsers = {}; let nosub = 0;
  comp.forEach((x) => {
    const u = x[ix("User ID")], m = mem[u];
    if (!m) { nosub++; nosubUsers[u] = 1; return; }
    const mm = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}) ([AP]M)/.exec(x[ix("Start Time")] || ""); if (!mm) return;
    const d = new Date(Date.UTC(+mm[1], +mm[2] - 1, +mm[3])), h = (+mm[4] % 12) + (mm[6] === "PM" ? 12 : 0);
    const key = [String(x[ix("Location")] || "").trim(), String(x[ix("Service")] || "").replace(/\s+/g, " ").trim(), DAYS[d.getUTCDay()], String(h).padStart(2, "0") + ":" + mm[5]].join("|");
    const sl = slots[key] = slots[key] || { chf: 0, visits: 0 }; sl.chf += m.chf / vcount[u]; sl.visits++;
  });
  Object.keys(slots).forEach((k) => { slots[k].chf = Math.round(slots[k].chf * 100) / 100; });
  const members = {}, novisit = [];
  Object.keys(mem).forEach((u) => {
    const m = mem[u], L = members[m.loc] = members[m.loc] || { subs: 0, visited: 0, novisit: 0, chf: 0, chf_visited: 0, chf_novisit: 0 };
    L.subs++; L.chf += m.chf;
    if (vcount[u]) { L.visited++; L.chf_visited += m.chf; }
    else { L.novisit++; L.chf_novisit += m.chf; novisit.push({ uid: u, name: m.name, email: m.email, location: m.loc, package: m.pkg.join(", "), chf: Math.round(m.chf * 100) / 100, since: m.since }); }
  });
  Object.keys(members).forEach((k) => { ["chf", "chf_visited", "chf_novisit"].forEach((f) => { members[k][f] = Math.round(members[k][f]); }); });
  novisit.sort((a, b) => a.location < b.location ? -1 : a.location > b.location ? 1 : b.chf - a.chf);
  return { basis: "netto (ohne MwSt, nach Coupon)", slots, members, novisit, nosub_visits: nosub, nosub_users: Object.keys(nosubUsers).length, visits_completed: comp.length, subs_unparsed: skipped };
}
