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
  A1: { de: 'Hi {name}, hier ist {sender} von IMPACT {studio}. Danke für deine Anfrage. Wir haben gerade sehr viele Anfragen, ich melde mich so schnell wie möglich telefonisch bei dir. Wenn du lieber schreibst, antworte einfach hier.',
        en: "Hi {name}, this is {sender} from IMPACT {studio}. Thanks for your request. We're getting a lot of requests right now, so I'll call you as soon as I can. If you'd rather text, just reply here." },
  A2: { de: 'Hi {name}, hier nochmals {sender}. Falls du noch Interesse an einem Probetraining hast, schreib mir kurz, wann ein Anruf passt oder welche Klasse dich interessiert.',
        en: "Hi {name}, {sender} again. If you're still keen on a trial session, just let me know when a call suits you or which class you're interested in." },
  A3: { de: 'Hi {name}, letzte Nachricht von mir zu deiner Anfrage. Wenn du später mal starten willst, melde dich einfach hier. Alles Gute!',
        en: "Hi {name}, last message from me about your request. If you'd like to start later on, just message me here. All the best!" },
  B1: { de: 'Hi {name}, kurze Erinnerung: Heute um {time} ist dein Probetraining {class} bei uns in {studio}. Komm bitte 10 Minuten früher. Bis später!',
        en: 'Hi {name}, quick reminder: your trial session {class} is today at {time} at IMPACT {studio}. Please arrive 10 minutes early. See you later!' },
  C1: { de: 'Hi {name}, schade, dass es gestern mit dem Probetraining nicht geklappt hat. Soll ich dir einen neuen Termin vorschlagen?',
        en: "Hi {name}, sorry you couldn't make it to your trial yesterday. Shall I suggest a new date?" },
  D1: { de: 'Hi {name}, wie hat dir das Probetraining am {date} gefallen? Gibt es etwas, das für dich noch offen ist?',
        en: 'Hi {name}, how did you like your trial on {date}? Is there anything still open for you?' }
};
var CF_URL = 'https://www.impact-martialarts.com/api/wa', CF_TOKEN = 'PASTE_LEADLOG_TOKEN_HERE'; // Token = Zeile "var TOKEN" im Leads-Log-Script; nur im Editor eintragen, nie ins Repo
var RULE_E = { W2_D: 2, W3_D: 12, DAYS: 30 }; // W1 sofort, W2 nach 2 Tagen, W3 nach 12 Tagen, W4 einen Tag nach der naechsten Faelligkeit
var TEXT_E = {
  W1: { de: 'Hey {name} 👋 wir haben gesehen, dass die letzte Zahlung bei deinem Abo leider nicht durchgegangen ist. Kannst du bitte kurz deine Zahlungsdaten prüfen/aktualisieren und uns Bescheid geben, sobald das erledigt ist, damit wir es erneut abbuchen können? Wenn du Hilfe brauchst, sag kurz Bescheid 🙏 Danke dir!',
        en: "Hey {name} 👋 We noticed that the last payment for your membership didn't go through. Could you please take a moment to check or update your payment details and let us know once it's done, so we can retry the charge? If you need any help, just let us know – we're happy to assist! 🙏 Thanks so much! Your IMPACT Support Team" },
  W2: { de: 'Hey {name}, leider konnten wir deine offenen Zahlungen weiterhin nicht abbuchen. Deshalb haben wir deinen Zugang/Check-in vorläufig pausiert, bis die Zahlung erfolgreich abgeschlossen ist. Sobald die Zahlungsdaten aktualisiert sind, aktivieren wir alles sofort wieder. Danke für dein Verständnis.',
        en: 'Hi {name}, unfortunately we were still unable to collect your outstanding payments. For this reason we have temporarily paused your access/check-in until the payment has been completed. Please take care of this today by updating your payment details. As soon as they are updated, we will reactivate everything immediately. Thank you for your understanding.' },
  W3: { de: 'Hey {name}, wir melden uns nochmals wegen der weiterhin offenen Zahlung (seit über 10 Tagen). Bitte bring das heute in Ordnung (Zahlungsdaten aktualisieren), damit wir dein Abo wieder aktivieren können. Falls es gerade schwierig ist: melde dich kurz, dann finden wir eine Lösung.',
        en: "Hi {name}, we're reaching out again regarding the payment that is still outstanding, which has been due since {due_date}. Please take care of this today by updating your payment details so we can reactivate your membership. If things are difficult at the moment, just send us a quick message and we'll find a solution together. Thanks for your attention to this!" },
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
    var isE = flow === 'E', text = fill((table || TEXT)[msg][lang], Object.assign({ name: name.split(' ')[0], sender: isE ? 'Waseem' : SENDER[loc], studio: isE ? '' : STUDIO[lang][loc] }, vars || {}));
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
  // Flow E: failed payments (Waseem). First sighting = W1; still failing after 2 / 12 days = W2 / W3; W4 one day after the next due date.
  var pay = readFailedPayments(), payNote = '';
  if (pay === null) payNote = ' Flow E skipped (no token / endpoint error).';
  else {
    var seen = firstSeenE(sh);
    pay.forEach(function (c) {
      if (!c.uid || c.cancel_pending) return; // cancelled: stop
      var lang = leadLang[nname(c.name)] || 'de', first = seen[c.uid];
      var vars = { due_date: c.next_payment ? deDate(c.next_payment, lang) : '' };
      function pushE(msg, key, trig) { pushRow('E', msg, 'Waseem', c.name, lang, trig, key, vars, TEXT_E); }
      if (!first) pushE('W1', 'E:W1:' + c.uid + ':' + today, 'W1: failed payment seen today, billing "' + c.billing + '", stage "' + c.lifecycle + '"');
      else {
        var age = Math.round((new Date(today + 'T12:00:00') - new Date(first + 'T12:00:00')) / 86400000);
        if (age >= RULE_E.W2_D) pushE('W2', 'E:W2:' + c.uid + ':' + first, 'W2: still failing ' + age + ' days after first sighting (' + first + ')');
        if (age >= RULE_E.W3_D) pushE('W3', 'E:W3:' + c.uid + ':' + first, 'W3: still failing ' + age + ' days after first sighting');
        if (c.next_payment && c.next_payment > first && today >= addDs(c.next_payment, 1)) pushE('W4', 'E:W4:' + c.uid + ':' + c.next_payment, 'W4: next payment ' + c.next_payment + ' passed, still failing');
      }
    });
  }
  if (out.length) sh.getRange(sh.getLastRow() + 1, 1, out.length, HEAD.length).setValues(out);
  sh.getRange('A3').setValue('Last run ' + fmtDT(now) + ', ' + out.length + ' new rows. Leads read: ' + leads.length + ', trial rows: ' + (trials.Zurich.length + trials.Winterthur.length) + ', failed payments: ' + (pay ? pay.length : 'n/a') + '.' + payNote);
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
function firstSeenE(sh) { // uid -> date of the W1 row (first sighting of the failed payment)
  var seen = {}, n = sh.getLastRow();
  if (n < TR_ROW0) return seen;
  sh.getRange(TR_ROW0, 1, n - TR_ROW0 + 1, HEAD.length).getValues().forEach(function (r) {
    if (r[3] === 'E' && r[4] === 'W1') { var uid = String(r[10] || '').split(':')[2], d = dOf(r[0]); if (uid && d && (!seen[uid] || d < seen[uid])) seen[uid] = d; }
  });
  return seen;
}
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
function installDryRunTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'waDryRunHourly') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('waDryRunHourly').timeBased().everyHours(1).create();
}
