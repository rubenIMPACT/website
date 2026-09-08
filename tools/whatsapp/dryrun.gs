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
var PAY_LINK = 'https://app.impact-martialarts.com/ex4/me/account/?card=true'; // member billing page (update card); same for everyone
var RULE_E = { W1_D: 3, W2_D: 6, W3_D: 14, DAYS: 180, HIST_D: 180, MAX_ATTEMPTS: 5, RETRY_WINDOW_D: 14, W4_GRACE_D: 7 }; // Ruben 08.09.: W1 am Tag 3, 180 Tage zurueck, W4 mit 7 Tagen Frist, Inkasso-Stage erst 7 Tage nach der zweiten geplatzten Rechnung // exercise.com KB (06/2025): Stripe Smart Retries, up to 4 retries within 2 weeks, timing chosen by Stripe, not configurable; afterwards no automatic attempt (subscription stays past-due at IMPACT). MAX_ATTEMPTS = 1 failure + 4 retries.
var HARD_DECLINE = /lost|stolen|incorrect number|invalid account|authentication required|not allowed|does not support/i; // Stripe does not retry these until a new card is on file // Ruben 07.09.2026: W1 zwei Tage nach der ersten Sichtung (Abbuchung geht oft von selbst noch durch), W2 Tag 6, W3 Tag 14, W4 einen Tag nach der naechsten Faelligkeit
var TEXT_E = {
  W1: { de: 'Hey {name} 👋 wir haben gesehen, dass die letzte Zahlung bei deinem Abo leider nicht durchgegangen ist. Kannst du bitte kurz deine Zahlungsdaten und die Deckung deines Kontos prüfen, damit wir es in den nächsten Tagen erneut abbuchen können? Wenn du Hilfe brauchst, sag kurz Bescheid 🙏 Danke dir!',
        en: "Hey {name} 👋 We noticed that the last payment for your membership didn't go through. Could you please check your payment details and make sure your account has sufficient funds, so we can retry the charge in the next few days? If you need any help, just let us know 🙏 Thanks so much!" },
  W2: { de: 'Hey {name}, wir konnten die offene Zahlung leider immer noch nicht abbuchen. Bitte prüfe heute kurz deine Zahlungsdaten oder die Deckung deines Kontos, wir versuchen die Abbuchung dann nochmals. Danke dir!',
        en: 'Hey {name}, unfortunately we still could not collect the outstanding payment. Please check your payment details or the funds on your account today, and we will retry the charge. Thanks!' },
  W3: { de: 'Hey {name}, die Zahlung von CHF {amount} ist seit dem {due_date} offen, und die automatischen Abbuchungen sind ausgeschöpft. Bitte aktualisiere heute deine Zahlungsdaten hier: {pay_link} Danach buchen wir den Betrag erneut ab. Wenn du lieber direkt bezahlen willst, sag kurz Bescheid, dann schicke ich dir die Rechnung mit Zahlungslink. Falls es gerade schwierig ist: melde dich, dann finden wir eine Lösung.',
        en: "Hi {name}, the payment of CHF {amount} has been outstanding since {due_date} and the automatic charges have run out. Please update your payment details today here: {pay_link} We will then charge the amount again. If you prefer to pay directly, just let me know and I will send you the invoice with a payment link. If things are difficult at the moment, get in touch and we will find a solution together." },
  W4: { de: 'Hey {name}, leider sind inzwischen mehrere Zahlungen offen und auch die neue Zahlung ist erneut fehlgeschlagen. Wenn wir innerhalb von 7 Tagen keinen Zahlungseingang bzw. keine Rückmeldung erhalten, müssen wir den offenen Betrag an unser Inkasso-/Mahnverfahren weitergeben. Bitte aktualisiere heute deine Zahlungsdaten hier: {pay_link} oder melde dich kurz für die Rechnung mit Zahlungslink (CHF {amount}), damit wir das vermeiden können.',
        en: "Hi {name}, unfortunately several payments are still overdue, and the most recent payment attempt has failed again. If we don't receive an update or payment from you within 7 days, we'll need to move forward with our debt collection process. Please update your payment details today here: {pay_link} or get in touch for the invoice with a payment link (CHF {amount}), so we can avoid further steps. Thank you for your prompt attention." }
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
    var resolved = readResolved(ss); arr.forEach(function (a) { a.resolved = resolved[a.uid + ':' + a.first] || null; });
    var sent = sentPrefixes(sh, today);
    arr.forEach(function (a) {
      var c = info[a.uid];
      if (a.resolved) return; // closed by hand: no messages
      if (!c || c.cancel_pending || /debt|inactive|non-client|lost/i.test(c.lifecycle) || !/^billed$/i.test(c.billing)) return; // not in the client list (cancelled/inactive), debt collection, paused: by hand
      var lang = leadLang[nname(a.name)] || 'de', vars = { due_date: deDate(a.first, lang), amount: String(a.amount), pay_link: PAY_LINK }; // PAY_LINK = the member's own billing page (card update); a direct pay link per invoice needs an exercise.com invoice (Send Invoice, by hand for now)
      function pushE(msg, trig) { var pre = 'E:' + msg + ':' + a.uid; if (sent[pre]) return; sent[pre] = today; pushRow('E', msg, 'Waseem', a.name, lang, trig, pre + ':' + a.first, vars, TEXT_E); }
      var money = 'CHF ' + a.amount + ' open, ' + a.attempts + ' attempts, ' + (a.reason || 'no reason given');
      if (a.days >= RULE_E.W1_D) pushE('W1', 'W1: ' + a.days + ' days since the first open charge (' + a.first + '), ' + money);
      if (a.days >= RULE_E.W2_D) pushE('W2', 'W2: still open after ' + a.days + ' days, ' + money);
      if (a.days >= RULE_E.W3_D) pushE('W3', 'W3: still open after ' + a.days + ' days, ' + money);
      if (a.open >= 2) pushE('W4', 'W4: ' + a.open + ' open charges (the next charge failed too), ' + money);
    });
  }
  if (out.length) sh.getRange(sh.getLastRow() + 1, 1, out.length, HEAD.length).setValues(out);
  if (arr) { writeArrears(ss, arr, info || {}, sh); writeRetryList(ss, arr, info || {}); var es = ss.getSheetByName('E state'); if (es) ss.deleteSheet(es); }
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
  var ch = fetchReport('charges', start, end, 15000, ['User ID', 'Date', 'Amount', 'Status', 'Purchase Type', 'Item Type']);
  if (ch === null) return null;
  var ok = {}, chVals = {}, ptVals = {};
  ch.forEach(function (r) { var stv = String(r['Status'] === undefined ? '' : r['Status']); chVals[stv] = (chVals[stv] || 0) + 1; var pt = String(r['Purchase Type'] || '') + '/' + String(r['Item Type'] || ''); ptVals[pt] = (ptVals[pt] || 0) + 1; if (/succe|paid|complete/i.test(stv)) { var u = String(r['User ID'] || ''); (ok[u] = ok[u] || []).push({ date: dOfAny(r['Date']), amount: num(r['Amount']) }); } });
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
    var first = open[0].date, newest = open[open.length - 1], second = open.length > 1 ? open[1].date : '';
    var att = open.reduce(function (m, c) { return Math.max(m, c.attempts); }, 0);
    rows.push({ uid: u, name: a.name, loc: a.loc, first: first, second: second, days: daysBetween(first, end), open: open.length, attempts: att, amount: r2(open.reduce(function (s, c) { return s + c.amount; }, 0)), lastDate: newest.last, reason: newest.reason, item: newest.item, hidden: open.some(function (c) { return c.laterPaid; }), exhausted: att >= RULE_E.MAX_ATTEMPTS || daysBetween(first, end) > RULE_E.RETRY_WINDOW_D || HARD_DECLINE.test(newest.reason) });
  });
  rows.sort(function (x, y) { return y.days - x.days; }); // provisional; the final order (priority) is set in writeArrears once the client status is known
  rows.convVals = convVals; rows.chVals = chVals; rows.ptVals = ptVals;
  Logger.log('Debtors: ' + rows.length + ' members, Converted values ' + JSON.stringify(convVals) + ', charge status values ' + JSON.stringify(chVals) + ', purchase types ' + JSON.stringify(ptVals) + ', hidden cases ' + rows.filter(function (a) { return a.hidden; }).length);
  return rows;
}
var RESOLVED_HEAD = ['UID', 'Name', 'First failed', 'Resolved on', 'Note'];
function resolvedSheet(ss) { var s = ss.getSheetByName('Resolved'); if (!s) { s = ss.insertSheet('Resolved'); s.getRange('A1').setValue('Resolved by hand: cases closed outside exercise.com (payment plan, bank transfer, cash, goodwill). Written from the checkbox in "Retry today"; a later new failure of the same member is a new case.').setFontColor('#666666').setWrap(true); s.getRange('A1:E1').merge(); s.setRowHeight(1, 45); s.getRange(2, 1, 1, RESOLVED_HEAD.length).setValues([RESOLVED_HEAD]).setFontWeight('bold').setBackground('#f3f3f3'); s.setFrozenRows(2); [80, 180, 90, 90, 320].forEach(function (w, i) { s.setColumnWidth(1 + i, w); }); } return s; }
function readResolved(ss) { // 'uid:firstFailed' -> {date, note}
  var s = resolvedSheet(ss), m = {}, n = s.getLastRow();
  if (n >= 3) s.getRange(3, 1, n - 2, RESOLVED_HEAD.length).getValues().forEach(function (r) { if (r[0]) m[String(r[0]) + ':' + dOf(r[2])] = { date: dOf(r[3]), note: String(r[4] || '') }; });
  return m;
}
var ARR_HEAD = ['Priority', 'UID', 'Name', 'Location', 'First failed', 'Days', 'Open charges', 'Attempts', 'Auto-retries left', 'Later invoice paid', 'Amount open CHF', 'Last failure', 'Failure message', 'Item', 'Lifecycle', 'Billing', 'Stage', 'Next step', 'Last message', 'Updated'];
var ARR_W = [60, 80, 180, 90, 90, 50, 60, 60, 70, 70, 90, 90, 260, 200, 110, 80, 60, 300, 120, 120];
function stageOf(a) { return a.open >= 2 ? 'W4' : (a.days >= RULE_E.W3_D ? 'W3' : (a.days >= RULE_E.W2_D ? 'W2' : (a.days >= RULE_E.W1_D ? 'W1' : 'wait'))); }
function activeClient(c) { return !!c && !c.cancel_pending && !/debt|inactive|non-client|lost/i.test(c.lifecycle) && /^billed$/i.test(c.billing); }
function priorityOf(a, c) { // 1 = most urgent. Active members first (the automation can still act), ordered by dunning stage, then by amount.
  if (a.resolved) return 4;                            // closed by hand (payment plan, transfer, cash): no more messages
  if (!c) return 5;                                   // not in the client list: cancelled / inactive, by hand
  if (/debt/i.test(c.lifecycle)) return 4;            // already in debt collection
  if (!activeClient(c)) return 4;                     // paused, pending cancellation, inactive
  var st = stageOf(a);
  return st === 'W4' ? 1 : (st === 'W3' ? 2 : 3);     // W4 = second charge open, W3 = retries exhausted, W1/W2/wait = still in the automatic window
}
function nextStepOf(a, c) {
  if (a.resolved) return 'Resolved by hand on ' + a.resolved.date + ': ' + a.resolved.note;
  if (!c) return 'By hand: account not in client list (cancelled or inactive)';
  if (/debt/i.test(c.lifecycle)) return 'Debt collection running (Sam)';
  if (!activeClient(c)) return 'By hand: subscription paused or pending cancellation';
  var st = stageOf(a);
  if (st === 'W4') { var esc = addDs(a.second, RULE_E.W4_GRACE_D), today = fmtD(new Date()); return (today >= esc ? 'NOW: escalate to Sam and set "Debt collection" (deadline ' + esc + ' passed)' : 'W4 sent or due; escalate to Sam and set "Debt collection" on ' + esc + ' if still unpaid'); }
  if (a.exhausted) return HARD_DECLINE.test(a.reason) ? 'Ask for a new card, then retry by hand' : 'Retry by hand (see Retry today)';
  return 'Wait for Stripe retries; ' + st + ' message due';
}
function writeArrears(ss, rows, info, dry) {
  var sh = ss.getSheetByName('Debtors') || ss.getSheetByName('Arrears'); // renamed 08.09. (Ruben)
  if (sh && sh.getName() !== 'Debtors') { sh.setName('Debtors'); sh.getRange('A1').setValue('Debtors: members with open failed charges'); }
  if (!sh) {
    sh = ss.insertSheet('Debtors');
    sh.getRange('A1').setValue('Debtors: members with open failed charges').setFontSize(14).setFontWeight('bold');
    sh.getRange('A2').setValue('Rebuilt every hour from the exercise.com reports "Failed Payments" and "Charges" (last 90 days), sorted by Priority (1 = most urgent), then by open amount. Open = failed charge that exercise.com has not marked as converted (paid later). A later paid invoice does NOT close an older open charge (column "Later invoice paid" flags exactly these hidden cases). Auto-retries left = no once Stripe stopped retrying (5 attempts, 14 days, or a hard decline); then only a manual retry after the card update or a direct payment settles it. Stage = dunning step: W1 from day 2, W2 from day 6, W3 from day 14, W4 as soon as a second charge is open. Next step = what a human still has to do. Debt collection, paused and accounts outside the client list are listed at the bottom and get no automatic message.').setFontColor('#666666').setWrap(true);
    sh.getRange('A2:T2').merge(); sh.setRowHeight(2, 90);
    sh.getRange(4, 1, 1, ARR_HEAD.length).setValues([ARR_HEAD]).setFontWeight('bold').setBackground('#fde8d5');
    sh.setFrozenRows(4);
    ARR_W.forEach(function (w, i) { sh.setColumnWidth(1 + i, w); });
  }
  if (sh.getLastRow() >= 4 && sh.getRange(4, 1).getValue() !== 'Priority') { if (sh.getMaxColumns() < ARR_HEAD.length) sh.insertColumnsAfter(sh.getMaxColumns(), ARR_HEAD.length - sh.getMaxColumns()); sh.getRange(4, 1, 1, ARR_HEAD.length).setValues([ARR_HEAD]).setFontWeight('bold').setBackground('#fde8d5'); ARR_W.forEach(function (w, i) { sh.setColumnWidth(1 + i, w); }); } // header upgrade 08.09.
  var last = lastMsgE(dry), now = fmtDT(new Date());
  var sorted = rows.slice().sort(function (x, y) { var px = priorityOf(x, info[x.uid]), py = priorityOf(y, info[y.uid]); return px !== py ? px - py : (y.amount !== x.amount ? y.amount - x.amount : y.days - x.days); });
  var out = sorted.map(function (a) {
    var c = info[a.uid] || null, stage = stageOf(a);
    return [priorityOf(a, c), a.uid, a.name, a.loc, a.first, a.days, a.open, a.attempts, a.exhausted ? 'no' : 'yes', a.hidden ? 'yes' : '', a.amount, a.lastDate, a.reason, a.item, c ? c.lifecycle : 'not in client list', c ? c.billing : '', stage, nextStepOf(a, c), last[a.uid] || '', now];
  });
  if (sh.getLastRow() >= 5) { sh.getRange(5, 1, sh.getLastRow() - 4, ARR_HEAD.length).clearContent().setBackground(null).setFontColor(null); }
  if (out.length) {
    sh.getRange(5, 1, out.length, ARR_HEAD.length).setValues(out); sh.getRange(5, 11, out.length, 1).setNumberFormat('0.00'); sh.getRange(5, 5, out.length, 1).setNumberFormat('@'); sh.getRange(5, 12, out.length, 1).setNumberFormat('@');
    var bg = sorted.map(function (a) { var c = info[a.uid]; var col = (c && /debt/i.test(c.lifecycle)) ? '#f4cccc' : (a.resolved ? '#eeeeee' : null); return ARR_HEAD.map(function () { return col; }); }); // red = debt collection (Ruben 08.09.), grey = resolved by hand
    sh.getRange(5, 1, out.length, ARR_HEAD.length).setBackgrounds(bg);
  }
  sh.getRange('A3').setValue(out.length + ' members in arrears, CHF ' + r2(out.reduce(function (s, r) { return s + r[10]; }, 0)) + ' open, ' + out.filter(function (r) { return r[9] === 'yes'; }).length + ' with a later invoice paid (old charge still open), ' + out.filter(function (r) { return r[8] === 'no'; }).length + ' with auto-retries exhausted. Priority 1 = second charge open, 2 = retries exhausted, 3 = still in the automatic retry window, 4 = debt collection / paused, 5 = not in client list. ' + now);
}
var RETRY_HEAD = ['UID', 'Name', 'Location', 'Days', 'Open charges', 'Amount open CHF', 'Later invoice paid', 'Failure message', 'Suggested action', 'Listed since', 'Done (Waseem)', 'Resolved by hand', 'Note', 'Updated'];
var RETRY_LOG_HEAD = ['Log date', 'UID', 'Name', 'Location', 'Amount open CHF', 'Listed since', 'Done (Waseem)', 'Note', 'Outcome'];
function writeRetryList(ss, rows, info) { // Weg 1 (Ruben 07.09.): members whose automatic retries are exhausted -> Waseem retries by hand.
  // 08.09. (Ruben): checkbox "Done (Waseem)" + note per member; both survive the hourly rebuild (keyed by UID). Every morning the
  // previous day's list is archived to "Retry log" with the checkbox state, and the checkboxes are reset. A member who leaves
  // the list is logged with the outcome (charge succeeded / no longer listed).
  var sh = ss.getSheetByName('Retry today'), today = fmtD(new Date()), now = fmtDT(new Date());
  if (!sh) {
    sh = ss.insertSheet('Retry today');
    sh.getRange('A1').setValue('Retry today: manual retry needed (automatic retries exhausted)').setFontSize(14).setFontWeight('bold');
    sh.getRange('A2').setValue('Rebuilt every hour. Active, billed members with an open failed charge where Stripe will not retry any more (5 attempts, older than 14 days, or a hard decline). A member stays on the list until the charge succeeds, the account is no longer active, or the case is resolved by hand; then the row moves to "Retry log" with its outcome. "Later invoice paid" = a newer charge went through, so the card works. Tick "Done (Waseem)" after the manual retry; the tick is archived every morning and reset. Tick "Resolved by hand" plus a note for cases settled outside exercise.com (payment plan, bank transfer, cash): the member then leaves the list, gets no more messages, and the note is kept in tab "Resolved".').setFontColor('#666666').setWrap(true);
    sh.getRange('A2:N2').merge(); sh.setRowHeight(2, 70);
    sh.getRange(4, 1, 1, RETRY_HEAD.length).setValues([RETRY_HEAD]).setFontWeight('bold').setBackground('#d9ead3');
    sh.setFrozenRows(4);
    [80, 180, 90, 50, 60, 90, 70, 240, 200, 90, 90, 90, 220, 120].forEach(function (w, i) { sh.setColumnWidth(1 + i, w); });
  }
  if (sh.getRange(4, 12).getValue() !== 'Resolved by hand') { // header upgrade 08.09.
    if (sh.getMaxColumns() < RETRY_HEAD.length) sh.insertColumnsAfter(sh.getMaxColumns(), RETRY_HEAD.length - sh.getMaxColumns());
    sh.getRange(4, 1, 1, RETRY_HEAD.length).setValues([RETRY_HEAD]).setFontWeight('bold').setBackground('#d9ead3');
    [80, 180, 90, 50, 60, 90, 70, 240, 200, 90, 90, 90, 220, 120].forEach(function (w, i) { sh.setColumnWidth(1 + i, w); });
    try { sh.getRange('A2:N2').merge(); } catch (e) {}
  }
  var log = ss.getSheetByName('Retry log');
  if (!log) {
    log = ss.insertSheet('Retry log');
    log.getRange('A1').setValue('Retry log: one line per member and day, written every morning (and when a member leaves the list)').setFontSize(12).setFontWeight('bold');
    log.getRange(2, 1, 1, RETRY_LOG_HEAD.length).setValues([RETRY_LOG_HEAD]).setFontWeight('bold').setBackground('#f3f3f3');
    log.setFrozenRows(2);
    [90, 80, 180, 90, 90, 90, 90, 240, 200].forEach(function (w, i) { log.setColumnWidth(1 + i, w); });
  }
  // previous state (keyed by UID)
  var prev = {}, n = sh.getLastRow();
  if (n >= 5) sh.getRange(5, 1, n - 4, RETRY_HEAD.length).getValues().forEach(function (r) { var u = String(r[0] || ''); if (u) prev[u] = { name: r[1], loc: r[2], amount: r[5], since: dOf(r[9]) || today, done: r[10] === true, resolve: r[11] === true, note: String(r[12] || '') }; });
  // "Resolved by hand" ticked with a note -> write to tab Resolved (case = uid + first failed date), the row then leaves the list
  var resSheet = resolvedSheet(ss), resolvedNow = {};
  rows.forEach(function (a) { var p = prev[a.uid]; if (p && p.resolve && p.note.trim()) { resSheet.appendRow([a.uid, a.name, a.first, today, p.note.trim()]); a.resolved = { date: today, note: p.note.trim() }; resolvedNow[a.uid] = p.note.trim(); } });
  var inArrears = {}; rows.forEach(function (a) { inArrears[a.uid] = true; });
  var lastLog = dOf(sh.getRange('Z1').getValue());
  var logRows = [];
  if (lastLog && lastLog !== today) { // new day: archive yesterday's list with the checkbox state, then reset the ticks
    Object.keys(prev).forEach(function (u) { var p = prev[u]; logRows.push([lastLog, u, p.name, p.loc, p.amount, p.since, p.done ? 'yes' : 'no', p.note, inArrears[u] ? 'still open' : 'charge succeeded or account closed']); p.done = false; });
  }
  var out = rows.filter(function (a) { return a.exhausted && !a.resolved && activeClient(info[a.uid]); }).sort(function (x, y) { return y.amount - x.amount; });
  var current = {};
  var vals = out.map(function (a) {
    current[a.uid] = true; var p = prev[a.uid] || {};
    var action = HARD_DECLINE.test(a.reason) ? 'Ask for a new card, then retry' : (a.hidden ? 'Retry today, card works' : 'Retry today');
    if (p.resolve && !(p.note || '').trim()) action = 'Note required to resolve by hand';
    return [a.uid, a.name, a.loc, a.days, a.open, a.amount, a.hidden ? 'yes' : '', a.reason, action, p.since || today, p.done === true, p.resolve === true, p.note || '', now];
  });
  Object.keys(prev).forEach(function (u) { if (!current[u]) { var p = prev[u]; logRows.push([today, u, p.name, p.loc, p.amount, p.since, p.done ? 'yes' : 'no', p.note, resolvedNow[u] ? 'resolved by hand: ' + resolvedNow[u] : (inArrears[u] ? 'no longer listed (status changed)' : 'charge succeeded or account closed')]); } });
  if (n >= 5) { sh.getRange(5, 1, n - 4, RETRY_HEAD.length).clearContent(); sh.getRange(5, 11, n - 4, 2).clearDataValidations(); }
  if (vals.length) {
    sh.getRange(5, 1, vals.length, RETRY_HEAD.length).setValues(vals);
    sh.getRange(5, 6, vals.length, 1).setNumberFormat('0.00'); sh.getRange(5, 10, vals.length, 1).setNumberFormat('@');
    sh.getRange(5, 11, vals.length, 2).insertCheckboxes(); sh.getRange(5, 11, vals.length, 2).setValues(vals.map(function (r) { return [r[10], r[11]]; }));
  }
  if (logRows.length) log.getRange(log.getLastRow() + 1, 1, logRows.length, RETRY_LOG_HEAD.length).setValues(logRows);
  sh.getRange('Z1').setValue(today); sh.hideColumns(26);
  sh.getRange('A3').setValue(vals.length + ' members to retry by hand, CHF ' + r2(vals.reduce(function (s, r) { return s + r[5]; }, 0)) + ' open, ' + vals.filter(function (r) { return r[10] === true; }).length + ' ticked as done today. Tick "Resolved by hand" plus a note to close a case outside exercise.com (payment plan, transfer, cash). ' + now);
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
function waProbeClient() { // one-off (Ruben 08.09.): structure of one debtor's payment endpoints, read-only, log only
  var ss = SpreadsheetApp.openById(WA_ID), sh = ss.getSheetByName('Retry today');
  var uid = String(sh.getRange(5, 1).getValue() || '').replace(/\D/g, '');
  if (!uid) { Logger.log('no uid on Retry today'); return; }
  var r = UrlFetchApp.fetch(CF_URL, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ token: CF_TOKEN, action: 'probe_client', uid: uid }), muteHttpExceptions: true });
  var t = r.getContentText() || '';
  Logger.log('probe ' + r.getResponseCode() + ' len ' + t.length);
  for (var i = 0; i < t.length; i += 1500) Logger.log('P' + (i / 1500) + ' ' + t.slice(i, i + 1500));
}
function installDryRunTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'waDryRunHourly') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('waDryRunHourly').timeBased().everyHours(1).create();
}
