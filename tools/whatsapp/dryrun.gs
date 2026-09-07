// WhatsApp Automation IMPACT, Phase 0: dry run (Stand 05.09.2026).
// Standalone Apps Script, bound to the Google Sheet "WhatsApp Automation" (WA_ID). Runs hourly, sends NOTHING.
// Reads read-only: tab "Leads" in the Leads Log (MAIN_ID) and the tabs "Probetrainings ZH/WT" in "Team KPIs" (TEAM_ID).
// Writes to the tab "Dry run": one row per message the automation WOULD have sent (deduplicated by key).
// Not visible in Phase 0 (needs the WhatsApp connection): stop when a human has already written or the person replied.
// Texts are placeholders; the approved texts live in the Google Doc "WhatsApp Messages IMPACT".
var WA_ID = '125Uy-sdroaNF25ZLO11O36iRfOVuxCBDNe6s-Od7ep0';
var MAIN_ID = '1nlA8MOSqYFwj-rI0SYRFh06-VmMTdoUPYEsHf3zwtlE';
var TEAM_ID = '1mU0eQbnn02JoH6yg1v-o8-ACei44mLiirWNTP1-avjg';
var TZ = 'Europe/Zurich';
var TR_SHEETS = { Zurich: 'Probetrainings ZH', Winterthur: 'Probetrainings WT' };
var TR_ROW0 = 5, TR_P0 = 8, TR_NCOL = 19;
var CI = { date: 0, name: 1, art: 2, cls: 3, coach: 4, booked: 5, kanal: 6, pers: 7, lifecycle: 8, check: 9, contract: 10, seller: 11, pkg: 12, note: 13, crm: 14, created: 15, uid: 16, ns: 17, stamp: 18 };
var LEAD = { ts: 0, status: 1, first: 2, last: 3, email: 4, phone: 5, loc: 6, interest: 7, message: 11, page: 13, exclude: 19 };
var SENDER = { Zurich: 'Abdi', Winterthur: 'Bogdan' };
var STUDIO = { de: { Zurich: 'Zürich', Winterthur: 'Winterthur' }, en: { Zurich: 'Zurich', Winterthur: 'Winterthur' } };
var RULE = { A1_H: 48, A2_D: 6, A3_D: 12, C_D: 1, D_D: 3, OPEN: 10, CLOSE: 19, B_OPEN: 7 }; // Ruben 05.09.2026: 48 h, chain 6/12 days, reminder 3 h before class
var LC_SKIP = /not interested|do not contact|lost|non-client|client|signed/i; // lifecycle stages that stop Flow D
var TEST_MAIL = /^(testlead|test-endpunkt|test2@|paulinelowe12|waseasdasd)/i;
var TEXT = {
  A1: { de: 'Hi {name}, hier ist {sender} von IMPACT {studio}. Danke für deine Anfrage. Wir haben gerade sehr viele Anfragen, ich melde mich so schnell wie möglich telefonisch bei dir. Wann erreiche ich dich am besten?',
        en: "Hi {name}, this is {sender} from IMPACT {studio}. Thanks for your request. We're getting a lot of requests right now, so I'll call you as soon as I can. When is the best time to reach you?" },
  A2: { de: 'Hi {name}, hier nochmals {sender}. Falls du noch Interesse an einem Probetraining hast: Wann erreiche ich dich am besten kurz telefonisch?',
        en: "Hi {name}, {sender} again. If you're still keen on a trial session: when is the best time to reach you for a quick call?" },
  A3: { de: 'Hi {name}, letzte Nachricht von mir zu deiner Anfrage. Wenn du später mal starten willst, sag mir kurz, wann ein Anruf passt. Alles Gute!',
        en: "Hi {name}, last message from me about your request. If you'd like to start later on, just tell me when a call suits you. All the best!" },
  B1: { de: 'Hi {name}, kurze Erinnerung: Heute um {time} ist dein Probetraining {class} bei uns in {studio}. Komm bitte 10 Minuten früher. Bis später!',
        en: 'Hi {name}, quick reminder: your trial session {class} is today at {time} at IMPACT {studio}. Please arrive 10 minutes early. See you later!' },
  C1: { de: 'Hi {name}, schade, dass es gestern mit dem Probetraining nicht geklappt hat. Soll ich dir einen neuen Termin vorschlagen?',
        en: "Hi {name}, sorry you couldn't make it to your trial yesterday. Shall I suggest a new date?" },
  D1: { de: 'Hi {name}, wie hat dir das Probetraining am {date} gefallen? Gibt es etwas, das für dich noch offen ist?',
        en: 'Hi {name}, how did you like your trial on {date}? Is there anything still open for you?' }
};
var CF_URL = 'https://www.impact-martialarts.com/api/wa', CF_TOKEN = 'PASTE_LEADLOG_TOKEN_HERE'; // Token = Zeile "var TOKEN" im Leads-Log-Script; nur im Editor eintragen, nie ins Repo
var RULE_E = { W1_D: 2, W2_D: 6, W3_D: 14, DAYS: 90, HIST_D: 90, MAX_ATTEMPTS: 3 }; // MAX_ATTEMPTS: exercise.com/Stripe stop retrying after ~3 attempts (Ruben 07.09.), then only a manual retry or a direct payment settles the charge // Ruben 07.09.2026: W1 zwei Tage nach der ersten Sichtung (Abbuchung geht oft von selbst noch durch), W2 Tag 6, W3 Tag 14, W4 einen Tag nach der naechsten Faelligkeit
var TEXT_E = {
  W1: { de: 'Hey {name} 👋 wir haben gesehen, dass die letzte Zahlung bei deinem Abo leider nicht durchgegangen ist. Kannst du bitte kurz deine Zahlungsdaten und die Deckung deines Kontos prüfen, damit wir es in den nächsten Tagen erneut abbuchen können? Wenn du Hilfe brauchst, sag kurz Bescheid 🙏 Danke dir!',
        en: "Hey {name} 👋 We noticed that the last payment for your membership didn't go through. Could you please check your payment details and make sure your account has sufficient funds, so we can retry the charge in the next few days? If you need any help, just let us know 🙏 Thanks so much!" },
  W2: { de: 'Hey {name}, wir konnten die offene Zahlung leider immer noch nicht abbuchen. Bitte prüfe heute kurz deine Zahlungsdaten oder die Deckung deines Kontos, wir versuchen die Abbuchung dann nochmals. Danke dir!',
        en: 'Hey {name}, unfortunately we still could not collect the outstanding payment. Please check your payment details or the funds on your account today, and we will retry the charge. Thanks!' },
  W3: { de: 'Hey {name}, wir melden uns nochmals wegen der weiterhin offenen Zahlung (seit über 10 Tagen). Bitte bring das heute in Ordnung, damit dein Abo sauber weiterläuft. Falls es gerade schwierig ist: melde dich kurz, dann finden wir eine Lösung.',
        en: "Hi {name}, we're reaching out again regarding the payment that is still outstanding, which has been due since {due_date}. Please take care of this today by updating your payment details so your membership keeps running smoothly. If things are difficult at the moment, just send us a quick message and we'll find a solution together. Thanks for your attention to this!" },
  W4: { de: 'Hey {name}, leider sind inzwischen mehrere Zahlungen offen und auch die neue Zahlung ist erneut fehlgeschlagen. Wenn wir bis morgen keinen Zahlungseingang bzw. keine Rückmeldung erhalten, müssen wir den offenen Betrag an unser Inkasso-/Mahnverfahren weitergeben. Bitte melde dich heute kurz oder aktualisiere die Zahlungsdaten direkt, damit wir das vermeiden können.',
        en: "Hi {name}, unfortunately several payments are still overdue, and the most recent payment attempt has failed again. If we don't receive an update or payment from you by tomorrow, we'll need to move forward with our debt collection process. Please update your payment details or contact us today so we can avoid taking further steps. Thank you for your prompt attention." }
};
var HEAD = ['Date', 'Detected', 'Would send', 'Flow', 'Message', 'Location', 'Name', 'Language', 'Trigger', 'Text', 'Key'];

function waDryRunHourly() {
  var now = new Date(), today = fmtD(now);
  var ss = SpreadsheetApp.openById(WA_ID), sh = ensureSheets(ss);
  var keys = existingKeys(sh), out = [];
  var leads = readLeads(), trials = { Zurich: readTrials('Zurich'), Winterthur: readTrials('Winterthur') };
  var trialNames = {};
  ['Zurich', 'Winterthur'].forEach(function (loc) { trials[loc].forEach(function (t) { trialNames[t.nname] = true; }); });
  var leadLang = {}; leads.forEach(function (l) { if (l.nname && !leadLang[l.nname]) leadLang[l.nname] = l.lang; });
  function pushRow(flow, msg, loc, name, lang, trigger, key, vars, table) {
    if (keys[key]) return; keys[key] = true;
    var isE = flow === 'E', text = fill((table || TEXT)[msg][lang], Object.assign({ name: firstOf(name), sender: isE ? 'Waseem' : SENDER[loc], studio: isE ? '' : STUDIO[lang][loc] }, vars || {}));
    out.push([today, fmtT(now), fmtDT(sendAt(now, flow)), flow, msg, isE ? 'Support (Waseem)' : (loc === 'Zurich' ? 'Zürich' : 'Winterthur'), name, lang.toUpperCase(), trigger, text, key]);
  }
  function push(flow, msg, loc, name, lang, trigger, key, vars) { pushRow(flow, msg, loc, name, lang, trigger, key, vars, TEXT); }
  // Flow A: website lead, no trial booking, chain 48 h / 6 d / 12 d. "Due" = the mark fell into the last 24 h (true daily rate, no backlog).
  var h = 3600000, marks = [['A1', RULE.A1_H * h], ['A2', RULE.A2_D * 24 * h], ['A3', RULE.A3_D * 24 * h]];
  leads.forEach(function (l) {
    if (!l.loc || l.test || l.status !== 'ok') return;
    if (trialNames[l.nname] || hasTrialLoose(trials, l)) return; // booked, attended, no-show or cancelled: Flow A is over
    marks.forEach(function (m) {
      var due = l.ts.getTime() + m[1];
      if (due <= now.getTime() && due > now.getTime() - 24 * h) push('A', m[0], l.loc, l.name, l.lang, m[0] + ': request ' + fmtDT(l.ts) + ', no trial booked', 'A:' + m[0] + ':' + (l.email || l.nname), {});
    });
  });
  // Flows B, C, D from the trial lists
  var yday = addDs(today, -RULE.C_D), d3 = addDs(today, -RULE.D_D);
  ['Zurich', 'Winterthur'].forEach(function (loc) {
    trials[loc].forEach(function (t) {
      var lang = leadLang[t.nname] || 'de';
      if (t.art === 'BOOKED' && t.date === today) push('B', 'B1', loc, t.name, lang, 'B1: trial booked today, ' + t.cls + ' (3 h before class; class time not in the list yet)', 'B:B1:' + t.uid + ':' + t.date, { 'class': t.cls, time: '{time}' });
      if (t.art === 'NOSHOW' && t.date === yday) push('C', 'C1', loc, t.name, lang, 'C1: no-show on ' + t.date + ', no new booking', 'C:C1:' + t.uid + ':' + t.date, {});
      if (t.art === 'TRIAL' && t.date === d3 && !t.contract && !LC_SKIP.test(t.lifecycle)) push('D', 'D1', loc, t.name, lang, 'D1: trial on ' + t.date + ', no contract, stage "' + (t.lifecycle || '-') + '"', 'D:D1:' + t.uid + ':' + t.date, { date: deDate(t.date, lang) });
    });
  });
  // Flow E: failed payments (Waseem), based on the arrears account (reports "Failed Payments" + "Charges", 90 days):
  // W1 two days after the first open failed charge, W2 day 6, W3 day 14, W4 as soon as a second charge is open. Stops by
  // itself when every failed charge is converted or a successful charge of the same amount followed.
  var pay = readFailedPayments(), payNote = '', arr = (pay === null) ? null : buildArrears();
  if (pay === null || arr === null) payNote = ' Flow E skipped (no token / report error).';
  else {
    var info = {}; pay.forEach(function (c) { info[c.uid] = c; });
    var sent = sentPrefixes(sh, today);
    arr.forEach(function (a) {
      var c = info[a.uid];
      if (!c || c.cancel_pending || /debt|inactive|non-client|lost/i.test(c.lifecycle) || !/^billed$/i.test(c.billing)) return; // not in the client list (cancelled/inactive), debt collection, paused: by hand
      var lang = leadLang[nname(a.name)] || 'de', vars = { due_date: deDate(a.first, lang) };
      function pushE(msg, trig) { var pre = 'E:' + msg + ':' + a.uid; if (sent[pre]) return; sent[pre] = today; pushRow('E', msg, 'Waseem', a.name, lang, trig, pre + ':' + a.first, vars, TEXT_E); }
      var money = 'CHF ' + a.amount + ' open, ' + a.attempts + ' attempts, ' + (a.reason || 'no reason given');
      if (a.days >= RULE_E.W1_D) pushE('W1', 'W1: ' + a.days + ' days since the first open charge (' + a.first + '), ' + money);
      if (a.days >= RULE_E.W2_D) pushE('W2', 'W2: still open after ' + a.days + ' days, ' + money);
      if (a.days >= RULE_E.W3_D) pushE('W3', 'W3: still open after ' + a.days + ' days, ' + money);
      if (a.open >= 2) pushE('W4', 'W4: ' + a.open + ' open charges (the next charge failed too), ' + money);
    });
  }
  if (out.length) sh.getRange(sh.getLastRow() + 1, 1, out.length, HEAD.length).setValues(out);
  if (arr) { writeArrears(ss, arr, info || {}, sh); var es = ss.getSheetByName('E state'); if (es) ss.deleteSheet(es); }
  var su = ss.getSheetByName('Summary'); if (su) su.getRange('A3:A400').setNumberFormat('yyyy-mm-dd');
  sh.getRange('A3').setValue('Last run ' + fmtDT(now) + ', ' + out.length + ' new rows. Leads read: ' + leads.length + ', trial rows: ' + (trials.Zurich.length + trials.Winterthur.length) + ', failed payments: ' + (pay ? pay.length : 'n/a') + ', in arrears: ' + (arr ? arr.length : 'n/a') + '.' + payNote);
  Logger.log('Dry run ' + fmtDT(now) + ': ' + out.length + ' new rows');
  return out.length;
}

function readLeads() {
  var sh = SpreadsheetApp.openById(MAIN_ID).getSheetByName('Leads'), out = [];
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 24).getValues();
  v.forEach(function (r) {
    var ts = r[LEAD.ts]; if (!(ts instanceof Date)) return;
    var first = String(r[LEAD.first] || '').trim(), last = String(r[LEAD.last] || '').trim(), email = String(r[LEAD.email] || '').toLowerCase().trim();
    var locRaw = String(r[LEAD.loc] || ''), loc = /z[uü]rich/i.test(locRaw) ? 'Zurich' : (/winterthur/i.test(locRaw) ? 'Winterthur' : '');
    var test = /^test/i.test(first) || /^test/i.test(last) || TEST_MAIL.test(email) || !!String(r[LEAD.exclude] || '').trim();
    var page = String(r[LEAD.page] || ''), lang = /\/en\//.test(page) ? 'en' : (langOfText(r[LEAD.message]) || 'de');
    out.push({ ts: ts, status: String(r[LEAD.status] || '').trim(), first: first, name: (first + ' ' + last).trim(), nname: nname(first + ' ' + last), email: email, loc: loc, lang: lang, test: test });
  });
  return out;
}

function readTrials(loc) {
  var sh = SpreadsheetApp.openById(TEAM_ID).getSheetByName(TR_SHEETS[loc]), out = [];
  if (!sh || sh.getLastRow() < TR_ROW0) return out;
  var v = sh.getRange(TR_ROW0, TR_P0, sh.getLastRow() - TR_ROW0 + 1, TR_NCOL).getValues();
  v.forEach(function (r) {
    var date = dOf(r[CI.date]); if (!date || !r[CI.uid]) return;
    var name = String(r[CI.name] || '').trim();
    out.push({ date: date, name: name, nname: nname(name), art: artOf(r[CI.art]), cls: String(r[CI.cls] || '').trim(), lifecycle: String(r[CI.lifecycle] || '').trim(), contract: dOf(r[CI.contract]), uid: String(r[CI.uid]).trim() });
  });
  return out;
}

function hasTrialLoose(trials, l) { // sibling accounts ("Anna & Ben Muster") or swapped name order
  var parts = l.nname.split(' '); if (parts.length < 2) return false;
  var f = parts[0], s = parts[parts.length - 1];
  return ['Zurich', 'Winterthur'].some(function (loc) { return trials[loc].some(function (t) { return t.nname.indexOf(f) >= 0 && t.nname.indexOf(s) >= 0; }); });
}
function artOf(v) { v = String(v || ''); if (/^trial/i.test(v)) return 'TRIAL'; if (/gebucht|booked/i.test(v)) return 'BOOKED'; if (/no-?show/i.test(v)) return 'NOSHOW'; if (/storniert|cancel/i.test(v)) return 'CANCELLED'; return 'OTHER'; }
function langOfText(t) {
  t = String(t || '').toLowerCase(); if (!t) return '';
  var en = (t.match(/\b(the|and|would|like|want|for|with|my|is|are|to|of|please|hello|thanks|interested|class|session|looking)\b/g) || []).length;
  var de = (t.match(/\b(ich|und|der|die|das|für|mit|nicht|ein|eine|bin|ist|möchte|gerne|hallo|danke|kurs|probetraining|würde|interesse|suche)\b/g) || []).length;
  if (en > de) return 'en'; if (de > en) return 'de'; return '';
}
function nname(s) { return String(s || '').toLowerCase().replace(/[^a-zäöüéèàß&+ ]/g, ' ').replace(/\s+/g, ' ').trim(); }
function firstOf(n) { return String(n || '').split(' ')[0].replace(/[&+]/g, ' & ').replace(/\s+/g, ' ').trim(); }
function fill(t, vars) { return String(t).replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined ? vars[k] : m; }); }
function deDate(d, lang) { var p = d.split('-'); return lang === 'en' ? (p[2] + '/' + p[1]) : (p[2] + '.' + p[1] + '.'); }
function sendAt(now, flow) { // next moment inside the send window (Mon-Sat, 10-19; Flow B from 07)
  var open = flow === 'B' ? RULE.B_OPEN : RULE.OPEN, d = new Date(now.getTime());
  for (var i = 0; i < 3; i++) {
    var dow = Number(Utilities.formatDate(d, TZ, 'u')), hr = Number(Utilities.formatDate(d, TZ, 'H'));
    if (dow === 7 || hr >= RULE.CLOSE) { d = atHour(addD(d, 1), open); continue; }
    if (hr < open) return atHour(d, open);
    return d;
  }
  return d;
}
function atHour(d, h) { return new Date(Utilities.formatDate(d, TZ, 'yyyy-MM-dd') + 'T' + (h < 10 ? '0' : '') + h + ':00:00' + Utilities.formatDate(d, TZ, 'XXX')); }
function dOf(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : (String(v || '').match(/^(\d{2})\.(\d{2})\.(\d{4})/) ? String(v).replace(/^(\d{2})\.(\d{2})\.(\d{4}).*/, '$3-$2-$1') : String(v || '').slice(0, 10)); }
function fmtD(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }
function fmtT(d) { return Utilities.formatDate(d, TZ, 'HH:mm'); }
function fmtDT(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd HH:mm'); }
function addD(d, n) { var t = new Date(d.getTime()); t.setDate(t.getDate() + n); return t; }
function addDs(s, n) { return fmtD(addD(new Date(s + 'T12:00:00'), n)); }

function readFailedPayments() { // null = not available (no token or endpoint error); [] = none
  if (!CF_TOKEN || /^PASTE/.test(CF_TOKEN)) return null;
  try {
    var r = UrlFetchApp.fetch(CF_URL, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ token: CF_TOKEN, action: 'failed_payments', days: RULE_E.DAYS }), muteHttpExceptions: true });
    var b = JSON.parse(r.getContentText() || '{}');
    if (r.getResponseCode() !== 200 || !b.ok) { Logger.log('wa failed_payments: ' + r.getResponseCode() + ' ' + String(r.getContentText()).slice(0, 200)); return null; }
    return b.rows || [];
  } catch (e) { Logger.log('wa failed_payments: ' + e); return null; }
}
function fetchReport(key, start, end, per, cols) { // exercise.com report via /api/wa (refresh, then poll); null = error
  if (!CF_TOKEN || /^PASTE/.test(CF_TOKEN)) return null;
  var refresh = true;
  for (var i = 0; i < 4; i++) {
    try {
      var r = UrlFetchApp.fetch(CF_URL, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ token: CF_TOKEN, action: 'report', key: key, start: start, end: end, per: per, refresh: refresh, rows: true, cols: cols }), muteHttpExceptions: true });
      var b = JSON.parse(r.getContentText() || '{}');
      if (r.getResponseCode() !== 200 || !b.ok) { Logger.log('report ' + key + ': ' + r.getResponseCode() + ' ' + String(r.getContentText()).slice(0, 200)); return null; }
      if (b.ready) return b.rows || [];
      refresh = false; Utilities.sleep(15000);
    } catch (e) { Logger.log('report ' + key + ': ' + e); return null; }
  }
  Logger.log('report ' + key + ' not ready'); return null;
}
function buildArrears() { // one entry per member with at least one open (unconverted) failed charge in the last HIST_D days
  var end = fmtD(new Date()), start = addDs(end, -RULE_E.HIST_D);
  var fp = fetchReport('failed_payments', start, end, 5000, ['User ID', 'First Name', 'Last Name', 'Location', 'Date', 'Item Name', 'Amount', 'Failure Code', 'Failure Message', 'Charge ID', 'Attempts Within This Time Period', 'Converted']);
  if (fp === null) return null;
  var ch = fetchReport('charges', start, end, 8000, ['User ID', 'Date', 'Amount', 'Status']);
  if (ch === null) return null;
  var ok = {};
  ch.forEach(function (r) { if (/succe|paid|complete/i.test(String(r['Status'] || ''))) { var u = String(r['User ID'] || ''); (ok[u] = ok[u] || []).push({ date: dOfAny(r['Date']), amount: num(r['Amount']) }); } });
  var byUid = {}, convVals = {};
  fp.forEach(function (r) {
    var u = String(r['User ID'] || ''); if (!u) return;
    var d = dOfAny(r['Date']), amt = num(r['Amount']), cid = String(r['Charge ID'] || (d + ':' + amt));
    var conv = /yes|true|^1$/i.test(String(r['Converted'] || ''));
    var settled = conv; // only the platform's own flag counts; a later successful charge of the SAME amount does not settle an older one (next invoice paid, old one still open - Ruben 07.09.)
    var laterPaid = (ok[u] || []).some(function (s) { return s.date > d && Math.abs(s.amount - amt) < 0.05; });
    var cv = String(r['Converted'] === undefined ? '' : r['Converted']); convVals[cv] = (convVals[cv] || 0) + 1;
    var a = byUid[u] = byUid[u] || { uid: u, name: (String(r['First Name'] || '') + ' ' + String(r['Last Name'] || '')).trim(), loc: String(r['Location'] || ''), charges: {} };
    var c = a.charges[cid] = a.charges[cid] || { date: d, last: d, amount: amt, attempts: 0, settled: false, laterPaid: false, reason: '', item: String(r['Item Name'] || '') };
    c.laterPaid = c.laterPaid || laterPaid;
    if (d && d < c.date) c.date = d; if (d && d > c.last) c.last = d;
    c.attempts = Math.max(c.attempts, num(r['Attempts Within This Time Period']) || 1);
    c.settled = c.settled || settled;
    var why = String(r['Failure Message'] || r['Failure Code'] || ''); if (why) c.reason = why.slice(0, 70);
  });
  var rows = [];
  Object.keys(byUid).forEach(function (u) {
    var a = byUid[u], open = Object.keys(a.charges).map(function (k) { return a.charges[k]; }).filter(function (c) { return !c.settled && c.date; });
    if (!open.length) return;
    open.sort(function (x, y) { return x.date < y.date ? -1 : 1; });
    var first = open[0].date, newest = open[open.length - 1];
    var att = open.reduce(function (m, c) { return Math.max(m, c.attempts); }, 0);
    rows.push({ uid: u, name: a.name, loc: a.loc, first: first, days: daysBetween(first, end), open: open.length, attempts: att, amount: r2(open.reduce(function (s, c) { return s + c.amount; }, 0)), lastDate: newest.last, reason: newest.reason, item: newest.item, hidden: open.some(function (c) { return c.laterPaid; }), exhausted: att >= RULE_E.MAX_ATTEMPTS });
  });
  rows.sort(function (x, y) { return y.days - x.days; });
  rows.convVals = convVals;
  Logger.log('Arrears: ' + rows.length + ' members, Converted values ' + JSON.stringify(convVals) + ', hidden cases ' + rows.filter(function (a) { return a.hidden; }).length);
  return rows;
}
var ARR_HEAD = ['UID', 'Name', 'Location', 'First failed', 'Days', 'Open charges', 'Attempts', 'Auto-retries left', 'Later invoice paid', 'Amount open CHF', 'Last failure', 'Failure message', 'Item', 'Lifecycle', 'Billing', 'Stage', 'Last message', 'Updated'];
function writeArrears(ss, rows, info, dry) {
  var sh = ss.getSheetByName('Arrears');
  if (!sh) {
    sh = ss.insertSheet('Arrears');
    sh.getRange('A1').setValue('Arrears: members with open failed charges').setFontSize(14).setFontWeight('bold');
    sh.getRange('A2').setValue('Rebuilt every hour from the exercise.com reports "Failed Payments" and "Charges" (last 90 days). Open = failed charge that exercise.com has not marked as converted (paid later). A later paid invoice does NOT close an older open charge (column "Later invoice paid" flags exactly these hidden cases). Auto-retries left = no once the platform stopped retrying (about 3 attempts); then only a manual retry after the card update or a direct payment settles it. Stage = dunning step by days open: W1 from day 2, W2 from day 6, W3 from day 14, W4 as soon as a second charge is open. Debt collection, inactive, paused and accounts outside the client list are listed but get no automatic message.').setFontColor('#666666').setWrap(true);
    sh.getRange('A2:R2').merge(); sh.setRowHeight(2, 80);
    sh.getRange(4, 1, 1, ARR_HEAD.length).setValues([ARR_HEAD]).setFontWeight('bold').setBackground('#fde8d5');
    sh.setFrozenRows(4);
    [80, 180, 90, 90, 50, 60, 60, 70, 70, 90, 90, 260, 200, 110, 80, 70, 120, 120].forEach(function (w, i) { sh.setColumnWidth(1 + i, w); });
  }
  if (sh.getLastRow() >= 4 && sh.getRange(4, 8).getValue() !== 'Auto-retries left') { sh.getRange(4, 1, 1, ARR_HEAD.length).setValues([ARR_HEAD]).setFontWeight('bold').setBackground('#fde8d5'); } // header upgrade 07.09.
  var last = lastMsgE(dry), now = fmtDT(new Date());
  var out = rows.map(function (a) {
    var c = info[a.uid] || {}, stage = a.open >= 2 ? 'W4' : (a.days >= RULE_E.W3_D ? 'W3' : (a.days >= RULE_E.W2_D ? 'W2' : (a.days >= RULE_E.W1_D ? 'W1' : 'wait')));
    return [a.uid, a.name, a.loc, a.first, a.days, a.open, a.attempts, a.exhausted ? 'no' : 'yes', a.hidden ? 'yes' : '', a.amount, a.lastDate, a.reason, a.item, c.lifecycle || 'not in client list', c.billing || '', stage, last[a.uid] || '', now];
  });
  if (sh.getLastRow() >= 5) sh.getRange(5, 1, sh.getLastRow() - 4, ARR_HEAD.length).clearContent();
  if (out.length) sh.getRange(5, 1, out.length, ARR_HEAD.length).setValues(out);
  sh.getRange('A3').setValue(out.length + ' members in arrears, CHF ' + r2(out.reduce(function (s, r) { return s + r[9]; }, 0)) + ' open, ' + out.filter(function (r) { return r[8] === 'yes'; }).length + ' with a later invoice paid (old charge still open), ' + out.filter(function (r) { return r[7] === 'no'; }).length + ' with auto-retries exhausted. Converted values: ' + JSON.stringify(rows.convVals || {}) + '. ' + now);
}
function lastMsgE(dry) { // uid -> latest dry-run message for Flow E
  var m = {}, n = dry.getLastRow(); if (n < TR_ROW0) return m;
  dry.getRange(TR_ROW0, 1, n - TR_ROW0 + 1, HEAD.length).getValues().forEach(function (r) { if (r[3] === 'E') { var uid = String(r[10] || '').split(':')[2]; if (uid) m[uid] = r[4] + ' ' + dOf(r[0]); } });
  return m;
}
function sentPrefixes(sh, today) { // 'E:W1:uid' -> date of that row, only rows of the last 60 days (an older episode may start again)
  var m = {}, n = sh.getLastRow(); if (n < TR_ROW0) return m;
  var lim = addDs(today, -60);
  sh.getRange(TR_ROW0, 1, n - TR_ROW0 + 1, HEAD.length).getValues().forEach(function (r) { var k = String(r[10] || '').split(':'); var d = dOf(r[0]); if (k[0] === 'E' && k.length >= 3 && d >= lim) m[k.slice(0, 3).join(':')] = d; });
  return m;
}
function dOfAny(v) { // report dates like "2026/08/07 12:07 AM CEST", ISO strings, Date objects, dd.MM.yyyy
  if (v instanceof Date) return fmtD(v);
  var s = String(v || '').trim(), m = /^(\d{4})[\/-](\d{2})[\/-](\d{2})/.exec(s); if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(s); if (m) return m[3] + '-' + m[2] + '-' + m[1];
  return '';
}
function num(v) { var n = parseFloat(String(v === undefined || v === null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; }
function r2(x) { return Math.round(x * 100) / 100; }
function daysBetween(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
function ensureSheets(ss) {
  var sh = ss.getSheetByName('Dry run');
  if (!sh) {
    sh = ss.getSheets()[0]; sh.setName('Dry run');
    sh.getRange('A1').setValue('WhatsApp Automation, Phase 0 dry run').setFontSize(16).setFontWeight('bold');
    sh.getRange('A2').setValue('Every row is a message the automation WOULD have sent (nothing is sent in Phase 0). Runs hourly, reads the Leads Log and the Probetrainings tabs in Team KPIs. Not checked yet: whether a human already wrote to the person or the person replied (needs the WhatsApp connection), so this is the upper bound. Flow A = lead without trial booking (48 h / 6 d / 12 d), B = reminder 3 h before the trial, C = no-show, D = trial without contract after 3 days, E = failed payment (Waseem, W1 to W4). Texts are drafts; the approved texts live in the Google Doc "WhatsApp Messages IMPACT".').setFontColor('#666666').setWrap(true);
    sh.getRange('A2:K2').merge(); sh.setRowHeight(2, 90);
    sh.getRange(4, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold').setBackground('#f3f3f3');
    sh.setFrozenRows(4);
    [95, 65, 120, 45, 70, 90, 180, 70, 330, 420, 10].forEach(function (w, i) { sh.setColumnWidth(1 + i, w); });
    sh.hideColumns(HEAD.length);
    var su = ss.insertSheet('Summary');
    su.getRange('A1').setValue('Messages per day and flow (dry run)').setFontSize(14).setFontWeight('bold');
    su.getRange('A3').setFormula('=IFERROR(QUERY(\'Dry run\'!A5:K, "select A, count(K) where A is not null group by A pivot E order by A desc", 0), "no rows yet")');
    su.getRange('H1').setValue('Total per flow').setFontWeight('bold');
    su.getRange('H2').setFormula('=IFERROR(QUERY(\'Dry run\'!A5:K, "select E, F, count(K) where E is not null group by E, F order by E", 0), "")');
  }
  return sh;
}
function existingKeys(sh) {
  var keys = {}, n = sh.getLastRow();
  if (n >= TR_ROW0) sh.getRange(TR_ROW0, HEAD.length, n - TR_ROW0 + 1, 1).getValues().forEach(function (r) { if (r[0]) keys[String(r[0])] = true; });
  return keys;
}
function waCleanup() { // maintenance: drop dry-run rows that the current rules exclude (safe to re-run)
  var sh = SpreadsheetApp.openById(WA_ID).getSheetByName('Dry run'), n = sh.getLastRow(), del = 0;
  if (n < TR_ROW0) return 0;
  var v = sh.getRange(TR_ROW0, 1, n - TR_ROW0 + 1, HEAD.length).getValues();
  for (var i = v.length - 1; i >= 0; i--) { if (v[i][3] === 'E' && /Debt collection|Inactive Client|billing "paused"|Non-Billed/i.test(String(v[i][8] || ''))) { sh.deleteRow(TR_ROW0 + i); del++; } }
  Logger.log('Cleanup: ' + del + ' rows removed'); return del;
}
function waProbeReports() { // one-off: which payment reports exist in exercise.com and which columns they have (log only)
  var keys = ['failed_payments', 'failed_payment', 'charges', 'sales', 'transactions', 'balance_transactions', 'payments', 'invoices', 'estimated_upcoming_charges', 'sales_by_category'];
  var end = fmtD(new Date()), start = addDs(end, -30);
  keys.forEach(function (k) {
    var r = UrlFetchApp.fetch(CF_URL, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ token: CF_TOKEN, action: 'report', key: k, start: start, end: end, per: 200, refresh: true, sample: 2 }), muteHttpExceptions: true });
    Logger.log(k + ' -> ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 900));
  });
}
function installDryRunTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'waDryRunHourly') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('waDryRunHourly').timeBased().everyHours(1).create();
}
