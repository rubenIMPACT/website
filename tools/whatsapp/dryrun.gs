// WhatsApp Automation IMPACT, Phase 0: dry run (Stand 08.09.2026, Flow E on invoice basis).
// Standalone Apps Script, bound to the Google Sheet "WhatsApp Automation" (WA_ID). Runs hourly, sends NOTHING.
// Reads read-only: tab "Leads" in the Leads Log (MAIN_ID), the tabs "Probetrainings ZH/WT" in "Team KPIs" (TEAM_ID) and, via
// /api/wa, exercise.com's open invoices, failed charges and client status (Flow E, tabs Debtors / Retry today).
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
var CARD_LINK = 'https://app.impact-martialarts.com/ex4/me/account/?card=true'; // member billing page (save the card for the next charges); same for everyone. The pay link per member ({pay_link}) is the Stripe payment page of the ORIGINAL open invoice (hosted_invoice_url from exercise.com, since 08.09.2026, Ruben's decision).
var RULE_E = { W1_D: 3, W2_D: 6, W3_D: 14, DAYS: 180, HIST_D: 180, MAX_ATTEMPTS: 5, RETRY_WINDOW_D: 14, W4_GRACE_D: 7 }; // Ruben 08.09.: W1 am Tag 3, 180 Tage zurueck, W4 mit 7 Tagen Frist, Inkasso-Stage erst 7 Tage nach der zweiten geplatzten Rechnung // exercise.com KB (06/2025): Stripe Smart Retries, up to 4 retries within 2 weeks, timing chosen by Stripe, not configurable; afterwards no automatic attempt (subscription stays past-due at IMPACT). MAX_ATTEMPTS = 1 failure + 4 retries.
var HARD_DECLINE = /lost|stolen|incorrect number|invalid account|authentication required|not allowed|does not support/i; // Stripe does not retry these until a new card is on file // Ruben 07.09.2026: W1 zwei Tage nach der ersten Sichtung (Abbuchung geht oft von selbst noch durch), W2 Tag 6, W3 Tag 14, W4 einen Tag nach der naechsten Faelligkeit
var TEXT_E = {
  W1: { de: 'Hey {name} 👋 wir haben gesehen, dass die letzte Zahlung bei deinem Abo leider nicht durchgegangen ist. Kannst du bitte kurz deine Zahlungsdaten und die Deckung deines Kontos prüfen, damit wir es in den nächsten Tagen erneut abbuchen können? Wenn du Hilfe brauchst, sag kurz Bescheid 🙏 Danke dir!',
        en: "Hey {name} 👋 We noticed that the last payment for your membership didn't go through. Could you please check your payment details and make sure your account has sufficient funds, so we can retry the charge in the next few days? If you need any help, just let us know 🙏 Thanks so much!" },
  W2: { de: 'Hey {name}, wir konnten die offene Zahlung leider immer noch nicht abbuchen. Bitte prüfe heute kurz deine Zahlungsdaten oder die Deckung deines Kontos, wir versuchen die Abbuchung dann nochmals. Danke dir!',
        en: 'Hey {name}, unfortunately we still could not collect the outstanding payment. Please check your payment details or the funds on your account today, and we will retry the charge. Thanks!' },
  W3: { de: 'Hey {name}, die Zahlung von CHF {amount} ist seit dem {due_date} offen, und die automatischen Abbuchungen sind ausgeschöpft. Du kannst die Rechnung direkt hier bezahlen (auch mit einer neuen Karte): {pay_link} Bitte hinterlege danach auch deine aktuelle Karte für die nächsten Abbuchungen: {card_link} Falls es gerade schwierig ist: melde dich, dann finden wir eine Lösung.',
        en: "Hi {name}, the payment of CHF {amount} has been outstanding since {due_date} and the automatic charges have run out. You can pay the invoice directly here (a new card works too): {pay_link} Afterwards, please also save your current card for the next charges: {card_link} If things are difficult at the moment, get in touch and we will find a solution together." },
  W4: { de: 'Hey {name}, leider sind inzwischen mehrere Zahlungen offen, insgesamt CHF {amount}. Wenn wir innerhalb von 7 Tagen keinen Zahlungseingang bzw. keine Rückmeldung erhalten, müssen wir den offenen Betrag an unser Inkasso-/Mahnverfahren weitergeben. Du kannst die Rechnungen direkt hier bezahlen: {invoices} Bitte hinterlege danach auch deine aktuelle Karte: {card_link} Melde dich kurz, wenn du eine Lösung brauchst, damit wir das vermeiden können.',
        en: "Hi {name}, unfortunately several payments are still overdue, CHF {amount} in total. If we don't receive a payment or a reply from you within 7 days, we'll need to move forward with our debt collection process. You can pay the invoices directly here: {invoices} Afterwards, please also save your current card: {card_link} Get in touch if you need a solution, so we can avoid further steps." }
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
  // Flows B, C, D from the trial lists. Language (Ruben 09.09.): 1. tag EN / DE in exercise.com (optional, set by hand), 2. the language
  // of the request text the person wrote (exercise.com profile field "Message"), 3. the website page / form text of the lead, 4. German.
  var yday = addDs(today, -RULE.C_D), d3 = addDs(today, -RULE.D_D), due = [];
  ['Zurich', 'Winterthur'].forEach(function (loc) {
    trials[loc].forEach(function (t) {
      if (keys['B:B1:' + t.uid + ':' + t.date] && keys['C:C1:' + t.uid + ':' + t.date] && keys['D:D1:' + t.uid + ':' + t.date]) return;
      if (t.art === 'BOOKED' && t.date === today) due.push({ flow: 'B', msg: 'B1', loc: loc, t: t, trig: 'B1: trial booked today, ' + t.cls + ' (3 h before class; class time not in the list yet)', key: 'B:B1:' + t.uid + ':' + t.date, vars: { 'class': t.cls, time: '{time}' } });
      if (t.art === 'NOSHOW' && t.date === yday) due.push({ flow: 'C', msg: 'C1', loc: loc, t: t, trig: 'C1: no-show on ' + t.date + ', no new booking', key: 'C:C1:' + t.uid + ':' + t.date, vars: {} });
      if (t.art === 'TRIAL' && t.date === d3 && !t.contract && !LC_SKIP.test(t.lifecycle)) due.push({ flow: 'D', msg: 'D1', loc: loc, t: t, trig: 'D1: trial on ' + t.date + ', no contract, stage "' + (t.lifecycle || '-') + '"', key: 'D:D1:' + t.uid + ':' + t.date, vars: { date: '' } });
    });
  });
  var dueUids = {}; due.forEach(function (d) { if (!keys[d.key]) dueUids[d.t.uid] = true; });
  var dueClients = fetchClients(Object.keys(dueUids)), langSrc = { tag: 0, text: 0, lead: 0, 'default': 0 };
  due.forEach(function (d) {
    if (keys[d.key]) return;
    var pick = langPick(dueClients[d.t.uid], leadLang[d.t.nname]); langSrc[pick.src]++;
    if (d.vars.date === '') d.vars.date = deDate(d.t.date, pick.lang);
    push(d.flow, d.msg, d.loc, d.t.name, pick.lang, d.trig + ' [lang ' + pick.lang + ' from ' + pick.src + ']', d.key, d.vars);
  });
  if (due.length) Logger.log('trial language sources: ' + JSON.stringify(langSrc));
  // Flow E: failed payments (Waseem). Debtors account = exercise.com's OPEN INVOICES (since 08.09.2026, Ruben's "Punkt 1"):
  // W1 three days after the first open invoice, W2 day 6, W3 day 14 with the pay link of the ORIGINAL open invoice, W4 as soon
  // as a second invoice is open (7-day deadline, one pay link per invoice). Stops by itself when no open invoice is left.
  var pay = readFailedPayments(), payNote = '', info = {};
  if (pay) pay.forEach(function (c) { info[c.uid] = c; });
  var arr = (pay === null) ? null : buildDebtors(info);
  if (pay === null || arr === null) payNote = ' Flow E skipped (no token / endpoint error).';
  else {
    var sent = sentPrefixes(sh, today);
    arr.forEach(function (a) {
      var c = info[a.uid];
      if (!activeClient(c)) return; // not in the client list (cancelled/inactive), debt collection, paused, unknown status: by hand
      var lang = langPick(a.client, leadLang[nname(a.name)]).lang;
      var vars = { due_date: deDate(a.first, lang), amount: String(a.amount), pay_link: a.link, card_link: CARD_LINK, invoices: a.debts.map(function (d) { return 'CHF ' + d.amount.toFixed(2) + ' (' + deDate(d.date, lang) + '): ' + d.link; }).join(' | ') };
      function pushE(msg, trig) { var pre = 'E:' + msg + ':' + a.uid; if (sent[pre]) return; sent[pre] = today; pushRow('E', msg, 'Waseem', a.name, lang, trig, pre + ':' + a.first, vars, TEXT_E); }
      var money = 'CHF ' + a.amount + ' open, ' + a.attempts + ' attempts, ' + (a.nextRetry ? 'next Stripe retry ' + a.nextRetry : 'no automatic retry left') + (a.reason ? ', ' + a.reason : '');
      if (a.days >= RULE_E.W1_D) pushE('W1', 'W1: ' + a.days + ' days since the first open invoice (' + a.first + '), ' + money);
      if (a.days >= RULE_E.W2_D) pushE('W2', 'W2: still open after ' + a.days + ' days, ' + money);
      if (a.days >= RULE_E.W3_D) pushE('W3', 'W3: still open after ' + a.days + ' days, pay link of the original invoice, ' + money);
      if (a.open >= 2) pushE('W4', 'W4: ' + a.open + ' open invoices (the next invoice failed too), ' + money);
    });
  }
  if (out.length) sh.getRange(sh.getLastRow() + 1, 1, out.length, HEAD.length).setValues(out);
  if (arr) { writeArrears(ss, arr, info, sh); retireRetryTab(ss); var es = ss.getSheetByName('E state'); if (es) ss.deleteSheet(es); }
  var su = ss.getSheetByName('Summary'); if (su) su.getRange('A3:A400').setNumberFormat('yyyy-mm-dd');
  sh.getRange('A3').setValue('Last run ' + fmtDT(now) + ', ' + out.length + ' new rows. Leads read: ' + leads.length + ', trial rows: ' + (trials.Zurich.length + trials.Winterthur.length) + ', clients with failed payments: ' + (pay ? pay.length : 'n/a') + ', debtors (open invoices): ' + (arr ? arr.length : 'n/a') + '.' + payNote);
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
function langPick(cl, leadLangOfPerson) { // {lang, src}: tag EN/DE in exercise.com > language of the request text in exercise.com > lead's page/form language > German
  var tags = String((cl && cl.tags) || '');
  if (/(^|[,\s])EN([,\s]|$)/i.test(tags)) return { lang: 'en', src: 'tag' };
  if (/(^|[,\s])DE([,\s]|$)/i.test(tags)) return { lang: 'de', src: 'tag' };
  var txt = langOfText(String((cl && cl.message) || '').replace(/ERNEUTE ANFRAGE|Nachricht:|STANDORTWECHSEL|Kind /g, ' '));
  if (txt) return { lang: txt, src: 'text' };
  if (leadLangOfPerson) return { lang: leadLangOfPerson, src: 'lead' };
  return { lang: 'de', src: 'default' };
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
function cfPost(body) { // one /api/wa call; null = not available (no token, HTTP error, invalid JSON)
  if (!CF_TOKEN || /^PASTE/.test(CF_TOKEN)) return null;
  try {
    body.token = CF_TOKEN;
    var r = UrlFetchApp.fetch(CF_URL, { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true });
    var b = JSON.parse(r.getContentText() || '{}');
    if (r.getResponseCode() !== 200 || !b.ok) { Logger.log('wa ' + body.action + ': ' + r.getResponseCode() + ' ' + String(r.getContentText()).slice(0, 200)); return null; }
    return b;
  } catch (e) { Logger.log('wa ' + body.action + ': ' + e); return null; }
}
function fetchInvoices(status, maxPages, start) { // exercise.com invoices with this status (open / paid), all pages; null = error
  var rows = [];
  for (var page = 1; page <= (maxPages || 5); page++) {
    var body = { action: 'invoices', status: status, past_due: false, per: 100, page: page }; if (start) body.start = start;
    var b = cfPost(body); if (!b) return null;
    rows = rows.concat(b.rows || []);
    if ((b.rows || []).length < 100) break;
  }
  return rows;
}
function fetchFailedCharges() { // latest failed charge per member (date + reason) from the newest 400 failed charges; {} on error
  var m = {}, min = '', max = '';
  for (var page = 1; page <= 2; page++) {
    var b = cfPost({ action: 'charges', status: 'failed', per: 200, page: page }); if (!b) break;
    (b.rows || []).forEach(function (c) { var u = String(c.user_id || ''), d = c.created_at ? fmtD(new Date(c.created_at * 1000)) : ''; if (!u || !d) return; if (!min || d < min) min = d; if (d > max) max = d; if (!m[u] || d > m[u].date) m[u] = { date: d, reason: String(c.failure_message || c.failure_code || '').slice(0, 70) }; });
    if ((b.rows || []).length < 200) break;
  }
  Logger.log('failed charges read: ' + Object.keys(m).length + ' members, dates ' + min + ' to ' + max);
  return m;
}
function fetchClients(uids) { // name + studio (location_id of the user) per debtor, 40 ids per call (Cloudflare subrequest limit); {} on error
  var out = {}, n = 0;
  for (var i = 0; i < uids.length; i += 40) {
    var b = cfPost({ action: 'clients', uids: uids.slice(i, i + 40) }); if (!b) continue;
    Object.keys(b.clients || {}).forEach(function (u) { if (b.clients[u]) { out[u] = b.clients[u]; n++; } });
  }
  Logger.log('clients looked up: ' + uids.length + ', found ' + n);
  return out;
}
function fetchClientStatus(uids) { // lifecycle/billing from the client list for members without an entry in the failed-payment list; {} on error
  if (!uids.length) return {};
  var b = cfPost({ action: 'client_status', uids: uids }); if (!b) return {};
  Logger.log('client status: ' + uids.length + ' asked, ' + b.found + ' found in ' + b.pages + ' pages, unresolved ' + JSON.stringify(b.unresolved || []));
  return b.clients || {};
}
function fetchLocations() { // location id -> name (invoices carry destination_id); {} on error
  var b = cfPost({ action: 'locations' }); if (!b) return {};
  var m = {}; ['nodes', 'locations'].forEach(function (k) { Object.keys(b[k] || {}).forEach(function (id) { if (b[k][id]) m[id] = b[k][id]; }); });
  Logger.log('locations: ' + Object.keys(m).length + ' ' + JSON.stringify(b.info || {}).slice(0, 400));
  return m;
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
function buildDebtors(info) { // one entry per member with at least one open debt in exercise.com (source: open invoices, since 08.09.2026); null = error
  // Debt = subscription invoice that failed at least once and is still open (status open, attempts >= 1), or an unpaid invoice sent by hand.
  // A sent invoice that repeats an older open subscription invoice of the same amount is the SAME debt (Waseem's manual invoices): counted once, link of the original.
  var inv = fetchInvoices('open', 5); if (inv === null) return null;
  var fails = fetchFailedCharges(), today = fmtD(new Date());
  var byUid = {};
  inv.forEach(function (i) {
    var u = String(i.user_id || ''); if (!u) return;
    var sent = i.collection_method === 'send_invoice', att = Number(i.attempt_count) || 0;
    if (!sent && att < 1) return; // subscription invoice not charged yet (upcoming)
    var created = i.created_at ? fmtD(new Date(i.created_at * 1000)) : today, due = i.due_date ? fmtD(new Date(i.due_date * 1000)) : '';
    (byUid[u] = byUid[u] || []).push({ id: String(i.id || ''), sent: sent, amount: r2((Number(i.amount_due) || 0) / 100), created: created, date: sent ? (due && due < today ? due : created) : created, due: due, attempts: att, npa: i.next_payment_attempt ? fmtD(new Date(i.next_payment_attempt * 1000)) : '', link: String(i.hosted_invoice_url || ''), item: String(i.item_name || i.description || ''), dupe: false, dupeOf: '' });
  });
  var rows = [];
  Object.keys(byUid).forEach(function (u) {
    var debts = byUid[u].sort(function (x, y) { return x.date < y.date ? -1 : (x.date > y.date ? 1 : (x.created < y.created ? -1 : 1)); });
    debts.filter(function (d) { return d.sent; }).forEach(function (sv) {
      var orig = debts.filter(function (a) { return !a.sent && !a.dupeOf && Math.abs(a.amount - sv.amount) < 0.05 && a.created <= sv.created; }).pop();
      if (orig) { sv.dupe = true; orig.dupeOf = sv.id; }
    });
    var open = debts.filter(function (d) { return !d.dupe; });
    var first = open[0].date, second = open.length > 1 ? open[1].date : '';
    var att = open.reduce(function (m, d) { return Math.max(m, d.attempts); }, 0);
    var retries = open.filter(function (d) { return d.npa && d.npa >= today; }).map(function (d) { return d.npa; }).sort();
    var manual = open.filter(function (d) { return !(d.npa && d.npa >= today); }); // invoices Stripe will not retry any more: only a payment via the link or a manual retry settles them
    var f = fails[u] || {}, c = info[u];
    rows.push({ uid: u, name: c ? c.name : '', loc: (c && c.location) || '', first: first, second: second, days: daysBetween(first, today), open: open.length, attempts: att, amount: r2(open.reduce(function (sum, d) { return sum + d.amount; }, 0)), lastDate: f.date || '', reason: f.reason || '', item: open[open.length - 1].item, exhausted: manual.length > 0, manual: manual, nextRetry: retries[0] || '', sent: debts.filter(function (d) { return d.sent; }).length, dupes: debts.filter(function (d) { return d.dupe; }).length, link: open[0].link, debts: open });
  });
  var missing = rows.filter(function (a) { return !info[a.uid]; }).map(function (a) { return a.uid; });
  var status = fetchClientStatus(missing); // lifecycle/billing for members without a failed-payment entry (old sent invoices, exhausted retries older than the report window)
  rows.forEach(function (a) { if (!info[a.uid] && status[a.uid]) { info[a.uid] = status[a.uid]; a.name = status[a.uid].name || a.name; } });
  var extra = fetchClients(rows.map(function (a) { return a.uid; })); // studio + name for everyone (invoices only carry the platform location)
  rows.forEach(function (a) { var x = extra[a.uid]; if (!x) return; if (!info[a.uid]) info[a.uid] = x; a.name = a.name || x.name || ''; a.loc = x.location || a.loc || ''; a.client = { tags: (x.tags || '') + ',' + ((info[a.uid] && info[a.uid].tags) || ''), message: x.message || '' }; });
  rows = refreshPayLinks(rows, today);
  rows.sort(function (x, y) { return y.days - x.days; }); // provisional; the final order (priority) is set in writeArrears once the client status is known
  Logger.log('Debtors: ' + rows.length + ' members from ' + inv.length + ' open invoices, ' + rows.filter(function (a) { return a.exhausted; }).length + ' without automatic retry, ' + rows.filter(function (a) { return a.dupes; }).length + ' with a duplicate sent invoice, ' + missing.length + ' without failed-payment entry (' + Object.keys(status).length + ' found in the client list)');
  return rows;
}
var ARR_HEAD = ['Priority', 'UID', 'Name', 'Location', 'First failed', 'Days', 'Open invoices', 'Attempts', 'Next Stripe retry', 'Sent invoices', 'Amount open CHF', 'Last failure', 'Failure message', 'Item', 'Lifecycle', 'Billing', 'Stage', 'Action', 'Last retry', 'Done (Waseem)', 'Note', 'Last message', 'Updated', 'Pay link']; // 09.09. (Ruben): one tab only, "Retry today" merged in
var ARR_W = [60, 80, 180, 90, 90, 50, 60, 60, 90, 70, 90, 90, 240, 200, 110, 80, 60, 360, 90, 90, 220, 120, 120, 320];
var RETRY_WAIT_D = 2; // Ruben / Sam 09.09.: Waseem retries by hand every second or third day, not daily
var ARR_NOTE = 'Rebuilt every hour from the open invoices in exercise.com: one row per member with at least one open debt, i.e. a subscription invoice that failed at least once and is still open, or an unpaid invoice that was sent by hand. A sent invoice that repeats an older open subscription invoice of the same amount counts once ("Sent invoices" shows "dup": void the sent copy). Sorted by Priority (1 = most urgent), then by open amount. "Action" says what a human has to do today: wait (Stripe still retries on the date in "Next Stripe retry"), check the payment via the pay link or retry the named invoice by hand (only when Stripe has no attempt left for it), escalate to Sam (second invoice open and the W4 deadline passed), or by hand for special statuses. Tick "Done (Waseem)" after a manual retry: on the next run the tick becomes the date in "Last retry", the tab "Retry log" gets a line, and the action says to wait ' + RETRY_WAIT_D + ' days. "Note" is free text and survives the rebuild. A member leaves the list as soon as no open invoice is left (paid or voided in exercise.com); the log then records "invoice paid on ..." or "left the list". There is no closing by hand in the sheet. Debt collection (red), paused and accounts outside the client list get no automatic message.';
var LOG_HEAD = ['Date', 'UID', 'Name', 'Location', 'Amount at the time', 'Listed since', 'Done (Waseem)', 'Note', 'Event'];
var MERGED_NOTE = 'Merged into the tab "Debtors" on 9 Sep 2026 (Ruben): Action, Last retry, Done (Waseem) and Note now live there. This tab is no longer updated and can be deleted.';
function stageOf(a) { return a.open >= 2 ? 'W4' : (a.days >= RULE_E.W3_D ? 'W3' : (a.days >= RULE_E.W2_D ? 'W2' : (a.days >= RULE_E.W1_D ? 'W1' : 'wait'))); }
function activeClient(c) { return !!c && !c.cancel_pending && !/debt|inactive|non-client|lost/i.test(c.lifecycle) && /^billed$/i.test(c.billing); }
function priorityOf(a, c) { // 1 = most urgent. Active members first (the automation can still act), ordered by dunning stage, then by amount.
  if (!c) return 5;                                   // not in the client list: cancelled / inactive, by hand
  if (/debt/i.test(c.lifecycle)) return 4;            // already in debt collection
  if (!activeClient(c)) return 4;                     // paused, pending cancellation, inactive, status unknown
  var st = stageOf(a);
  return st === 'W4' ? 1 : (st === 'W3' ? 2 : 3);     // W4 = second invoice open, W3 = retries exhausted, W1/W2/wait = still in the automatic window
}
function actionOf(a, c, p, today) { // what a human has to do with this member today (Waseem, or Sam)
  if (!c) return 'By hand: account not in client list (cancelled or inactive)';
  if (/debt/i.test(c.lifecycle)) return 'Debt collection running (Sam)';
  if (!c.billing) return 'By hand: status unknown (not in the failed-payment client list), check the client in exercise.com';
  if (!activeClient(c)) return 'By hand: subscription paused or pending cancellation';
  var dup = a.dupes ? 'Void the duplicate sent invoice. ' : '', st = stageOf(a);
  if (st === 'W4') { var esc = addDs(a.second, RULE_E.W4_GRACE_D); return dup + (today >= esc ? 'NOW: escalate to Sam and set "Debt collection" (W4 deadline ' + esc + ' passed)' : 'W4 sent or due: wait for the payment via the links, escalate to Sam on ' + esc + ' if still unpaid'); }
  if (p.lastRetry && daysBetween(p.lastRetry, today) < RETRY_WAIT_D) return dup + 'Retried by hand on ' + p.lastRetry + ', wait until ' + addDs(p.lastRetry, RETRY_WAIT_D);
  if (a.manual.length) {
    var which = a.manual.map(function (d) { return 'invoice of ' + d.date + (d.sent ? ' (sent by hand)' : ''); }).join(', ');
    return dup + (HARD_DECLINE.test(a.reason) ? 'Ask for a new card, then retry by hand: ' : 'Check for a payment via the pay link, else retry by hand: ') + which + (a.nextRetry ? '. Stripe still retries the newest invoice on ' + a.nextRetry : '');
  }
  return dup + 'Wait for the Stripe retry on ' + a.nextRetry + '; ' + st + ' message due';
}
function cleanNote(v) { var s = String(v || ''); return /^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{2} \d{4} \d{2}:\d{2}/.test(s) ? '' : s; } // drops timestamps that slipped into the note column on 08.09.
function logSheet(ss) { // event log: one line per event (retried by hand, invoice paid, left the list)
  var log = ss.getSheetByName('Retry log');
  if (!log) {
    log = ss.insertSheet('Retry log');
    log.getRange('A1').setValue('Retry log: one line per event (retried by hand, invoice paid, left the list)').setFontSize(12).setFontWeight('bold');
    log.getRange(2, 1, 1, LOG_HEAD.length).setValues([LOG_HEAD]).setFontWeight('bold').setBackground('#f3f3f3');
    log.setFrozenRows(2);
    [90, 80, 180, 90, 110, 90, 90, 240, 260].forEach(function (w, i) { log.setColumnWidth(1 + i, w); });
  }
  if (log.getRange(2, 9).getValue() !== 'Event') { log.getRange('A1').setValue('Retry log: one line per event (retried by hand, invoice paid, left the list); lines before 9 Sep 2026 come from the old daily archive'); log.getRange(2, 1, 1, LOG_HEAD.length).setValues([LOG_HEAD]).setFontWeight('bold').setBackground('#f3f3f3'); }
  return log;
}
function writeArrears(ss, rows, info, dry) {
  var sh = ss.getSheetByName('Debtors') || ss.getSheetByName('Arrears'); // renamed 08.09. (Ruben)
  if (sh && sh.getName() !== 'Debtors') sh.setName('Debtors');
  var today = fmtD(new Date()), now = fmtDT(new Date());
  if (!sh) {
    sh = ss.insertSheet('Debtors');
    sh.getRange('A1').setValue('Debtors: members with open invoices').setFontSize(14).setFontWeight('bold');
    sh.getRange('A2').setValue(ARR_NOTE).setFontColor('#666666').setWrap(true);
    sh.getRange('A2:T2').merge(); sh.setRowHeight(2, 120);
    sh.getRange(4, 1, 1, ARR_HEAD.length).setValues([ARR_HEAD]).setFontWeight('bold').setBackground('#fde8d5');
    sh.setFrozenRows(4);
    ARR_W.forEach(function (w, i) { sh.setColumnWidth(1 + i, w); });
  }
  // previous state per UID (Last retry / Done / Note survive the hourly rebuild)
  var prev = {}, n = sh.getLastRow(), merged = sh.getRange(4, 19).getValue() === 'Last retry';
  if (merged && n >= 5) sh.getRange(5, 1, n - 4, ARR_HEAD.length).getValues().forEach(function (r) { var u = String(r[1] || ''); if (u) prev[u] = { name: r[2], loc: r[3], amount: Number(r[10]) || 0, since: dOf(r[4]), lastRetry: dOf(r[18]), done: r[19] === true, note: cleanNote(r[20]) }; });
  if (!merged) { // one-off migration 09.09.: carry Last retry / Done / Note over from the old tab "Retry today", then upgrade the header
    var rt = ss.getSheetByName('Retry today');
    if (rt && rt.getLastRow() >= 5 && rt.getRange(4, 11).getValue() === 'Last retry') rt.getRange(5, 1, rt.getLastRow() - 4, 14).getValues().forEach(function (r) { var u = String(r[0] || ''); if (u) prev[u] = { name: r[1], loc: r[2], amount: Number(r[5]) || 0, since: dOf(r[9]), lastRetry: dOf(r[10]), done: r[11] === true, note: cleanNote(r[12]) }; });
    if (sh.getMaxColumns() < ARR_HEAD.length) sh.insertColumnsAfter(sh.getMaxColumns(), ARR_HEAD.length - sh.getMaxColumns());
    if (n >= 4) sh.getRange(4, 1, n - 3, ARR_HEAD.length).clearContent().clearDataValidations().setBackground(null);
    sh.getRange(4, 1, 1, ARR_HEAD.length).setValues([ARR_HEAD]).setFontWeight('bold').setBackground('#fde8d5');
    ARR_W.forEach(function (w, i) { sh.setColumnWidth(1 + i, w); });
    sh.getRange('A1').setValue('Debtors: members with open invoices'); sh.getRange('A2').setValue(ARR_NOTE); sh.setRowHeight(2, 120);
    n = 4;
  }
  var log = logSheet(ss), logRows = [];
  Object.keys(prev).forEach(function (u) { var p = prev[u]; if (p.done) { p.lastRetry = today; p.done = false; logRows.push([today, u, p.name, p.loc, p.amount, p.since, 'yes', p.note, 'retried by hand on ' + today]); } });
  var last = lastMsgE(dry);
  var sorted = rows.slice().sort(function (x, y) { var px = priorityOf(x, info[x.uid]), py = priorityOf(y, info[y.uid]); return px !== py ? px - py : (y.amount !== x.amount ? y.amount - x.amount : y.days - x.days); });
  var current = {};
  var out = sorted.map(function (a) {
    current[a.uid] = true; var c = info[a.uid] || null, p = prev[a.uid] || {};
    return [priorityOf(a, c), a.uid, a.name, a.loc, a.first, a.days, a.open, a.attempts, a.nextRetry || 'none', (a.sent ? String(a.sent) : '') + (a.dupes ? ' dup' : ''), a.amount, a.lastDate, a.reason, a.item, c ? (c.lifecycle || 'unknown') : 'not in client list', c ? c.billing : '', stageOf(a), actionOf(a, c, p, today), p.lastRetry || '', false, p.note || '', last[a.uid] || '', now, a.link];
  });
  var gone = Object.keys(prev).filter(function (u) { return !current[u]; });
  var paid = gone.length ? paidSince(addDs(today, -45)) : {};
  gone.forEach(function (u) { var p = prev[u]; logRows.push([today, u, p.name, p.loc, p.amount, p.since, '', p.note, paid[u] ? 'invoice paid on ' + paid[u] : 'left the list (invoice voided or paid earlier, or account changed)']); });
  if (n >= 5) { sh.getRange(5, 1, n - 4, ARR_HEAD.length).clearContent().setBackground(null).setFontColor(null); sh.getRange(5, 20, n - 4, 1).clearDataValidations(); }
  if (out.length) {
    sh.getRange(5, 1, out.length, ARR_HEAD.length).setValues(out);
    sh.getRange(5, 11, out.length, 1).setNumberFormat('0.00'); [5, 9, 12, 19].forEach(function (col) { sh.getRange(5, col, out.length, 1).setNumberFormat('@'); });
    sh.getRange(5, 20, out.length, 1).insertCheckboxes();
    var bg = sorted.map(function (a) { var c = info[a.uid]; var col = (c && /debt/i.test(c.lifecycle)) ? '#f4cccc' : null; return ARR_HEAD.map(function () { return col; }); }); // red = debt collection (Ruben 08.09.)
    sh.getRange(5, 1, out.length, ARR_HEAD.length).setBackgrounds(bg);
  }
  if (logRows.length) log.getRange(log.getLastRow() + 1, 1, logRows.length, LOG_HEAD.length).setValues(logRows);
  var acts = out.map(function (r) { return String(r[17]); });
  sh.getRange('A3').setValue(out.length + ' members with open invoices, CHF ' + r2(out.reduce(function (sum, r) { return sum + r[10]; }, 0)) + ' open. Today: ' + acts.filter(function (s) { return /^NOW/.test(s); }).length + ' to escalate to Sam, ' + acts.filter(function (s) { return /retry by hand:/.test(s); }).length + ' to check or retry by hand, ' + acts.filter(function (s) { return /^Retried by hand/.test(s); }).length + ' waiting after a manual retry, ' + acts.filter(function (s) { return /^Wait for the Stripe retry|^W4 sent/.test(s); }).length + ' waiting for Stripe or the links. Priority 1 = second invoice open, 2 = retries exhausted, 3 = still in the automatic retry window, 4 = debt collection / paused / unknown, 5 = not in client list. ' + now);
}
function retireRetryTab(ss) { // 09.09. (Ruben): "Retry today" merged into "Debtors"; the old tab is emptied and marked, not deleted
  var rt = ss.getSheetByName('Retry today'); if (!rt || rt.getRange('A3').getValue() === MERGED_NOTE) return;
  var n = rt.getLastRow(); if (n >= 5) rt.getRange(5, 1, n - 4, rt.getMaxColumns()).clearContent().clearDataValidations();
  rt.getRange('A3').setValue(MERGED_NOTE);
}
function refreshPayLinks(rows, today) { // Stripe pay links expire (Waseem 09.09.): re-read every invoice that a message or the lists may use from Stripe via exercise.com, 40 per call.
  // The refreshed invoice also carries the true status: a debt that is paid or void in Stripe drops out right here.
  var need = [], byId = {};
  rows.forEach(function (a) { if (a.exhausted || a.open >= 2 || a.days >= RULE_E.W3_D) a.debts.forEach(function (d) { if (d.id && !byId[d.id]) { byId[d.id] = d; need.push(d.id); } }); });
  var fresh = 0, closed = 0;
  for (var i = 0; i < need.length; i += 40) {
    var b = cfPost({ action: 'invoice_refresh', ids: need.slice(i, i + 40) }); if (!b) continue;
    Object.keys(b.invoices || {}).forEach(function (id) { var n = b.invoices[id], d = byId[id]; if (!n || n.error || !d) return; if (n.hosted_invoice_url) { d.link = String(n.hosted_invoice_url); fresh++; } if (n.status && n.status !== 'open') { d.closed = String(n.status); closed++; } });
  }
  var out = [];
  rows.forEach(function (a) {
    if (!a.debts.some(function (d) { return d.closed; })) { out.push(a); return; }
    var open = a.debts.filter(function (d) { return !d.closed; }); if (!open.length) return; // everything paid or voided in Stripe: no debt any more
    a.debts = open; a.open = open.length; a.first = open[0].date; a.second = open.length > 1 ? open[1].date : ''; a.days = daysBetween(a.first, today); a.amount = r2(open.reduce(function (s, d) { return s + d.amount; }, 0)); a.link = open[0].link; a.item = open[open.length - 1].item;
    var retries = open.filter(function (d) { return d.npa && d.npa >= today; }).map(function (d) { return d.npa; }).sort(); a.manual = open.filter(function (d) { return !(d.npa && d.npa >= today); }); a.exhausted = a.manual.length > 0; a.nextRetry = retries[0] || '';
    out.push(a);
  });
  Logger.log('pay links refreshed: ' + fresh + ' of ' + need.length + ' invoices, ' + closed + ' no longer open in Stripe, ' + (rows.length - out.length) + ' members dropped');
  return out;
}
function paidSince(start) { // uid -> latest paid date among invoices created since start; {} on error
  var m = {}, inv = fetchInvoices('paid', 3, start); if (!inv) return m;
  inv.forEach(function (i) { var u = String(i.user_id || ''), d = i.paid_at ? fmtD(new Date(i.paid_at * 1000)) : ''; if (u && d && (!m[u] || d > m[u])) m[u] = d; });
  return m;
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
  var ss = SpreadsheetApp.openById(WA_ID), sh = ss.getSheetByName('Debtors');
  var uid = String(sh.getRange(5, 2).getValue() || '').replace(/\D/g, '');
  if (!uid) { Logger.log('no uid on Retry today'); return; }
  var r = UrlFetchApp.fetch(CF_URL, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ token: CF_TOKEN, action: 'probe_client', uid: uid }), muteHttpExceptions: true });
  var t = r.getContentText() || '';
  Logger.log('probe ' + r.getResponseCode() + ' len ' + t.length);
  for (var i = 0; i < t.length; i += 1500) Logger.log('P' + (i / 1500) + ' ' + t.slice(i, i + 1500));
}
function waProbeInvoices() { // one-off (Ruben 08.09.): does fp/invoices give a pay link (hosted_invoice_url) + paid status per failed charge? read-only, log only (compact projection, no names/e-mails)
  var ss = SpreadsheetApp.openById(WA_ID), sh = ss.getSheetByName('Debtors');
  var uid = String(sh.getRange(5, 2).getValue() || '').replace(/\D/g, '');
  var F_INV = ['id', 'user_id', 'status', 'collection_method', 'manual', 'amount_due', 'amount_paid', 'attempt_count', 'next_payment_attempt', 'charge_failure', 'last_charge_attempt', 'charge_status', 'charge_id', 'subscription_id', 'item_name', 'due_date', 'paid_at', 'created_at', 'hosted_invoice_url'];
  var F_CH = ['id', 'user_id', 'status', 'amount', 'paid_at', 'failure_code', 'failure_message', 'subscription_id', 'purchase_id', 'processor_type', 'created_at'];
  var tests = [
    ['all invoices UID ' + uid, { action: 'invoices', uid: uid, per: 50, past_due: false }, F_INV],
    ['charges UID ' + uid, { action: 'charges', uid: uid, per: 50 }, F_CH],
    ['ALL past-due invoices (platform)', { action: 'invoices', per: 100 }, F_INV],
    ['ALL open invoices (platform, status open)', { action: 'invoices', per: 100, past_due: false, status: 'open' }, F_INV]
  ];
  tests.forEach(function (test) {
    var body = test[1]; body.token = CF_TOKEN;
    var r = UrlFetchApp.fetch(CF_URL, { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true });
    var t = r.getContentText() || '', o = null; try { o = JSON.parse(t); } catch (e) {}
    Logger.log('=== ' + test[0] + ' -> ' + r.getResponseCode() + ' len ' + t.length + (o ? ' meta ' + JSON.stringify(o.meta) + ' count ' + o.count : ' ' + t.slice(0, 300)));
    if (!o || !o.rows) return;
    o.rows.forEach(function (row, i) {
      var parts = test[2].map(function (k) {
        var v = row[k];
        if (k === 'hosted_invoice_url') v = v ? 'URL' : '-';
        if (/_at$|date|attempt$/.test(k) && typeof v === 'number' && v > 1e9) v = new Date(v * 1000).toISOString().slice(0, 10);
        if (v && typeof v === 'object') v = JSON.stringify(v).slice(0, 40);
        return k + '=' + v;
      });
      Logger.log('R' + i + ' ' + parts.join(' | '));
    });
  });
}
function waProbeReconcile() { // one-off (08.09.): compare the Debtors tab (report-based) with exercise.com's open invoices (fp/invoices), log only, no names
  var ss = SpreadsheetApp.openById(WA_ID), sh = ss.getSheetByName('Debtors');
  var last = sh.getLastRow(), deb = {};
  if (last >= 5) sh.getRange(5, 1, last - 4, 17).getValues().forEach(function (r) { var u = String(r[1] || '').replace(/\D/g, ''); if (u) deb[u] = { prio: r[0], amt: Number(r[10]) || 0, life: String(r[14] || ''), stage: String(r[16] || '') }; });
  var inv = [];
  for (var page = 1; page <= 3; page++) {
    var body = { token: CF_TOKEN, action: 'invoices', per: 100, page: page, past_due: false, status: 'open' };
    var r = UrlFetchApp.fetch(CF_URL, { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true });
    var o = null; try { o = JSON.parse(r.getContentText()); } catch (e) {}
    if (!o || !o.rows) { Logger.log('page ' + page + ' failed ' + r.getResponseCode()); break; }
    inv = inv.concat(o.rows);
    if (o.rows.length < 100) break;
  }
  var per = {};
  inv.forEach(function (i) {
    var u = String(i.user_id), p = per[u] || (per[u] = { man: 0, manAmt: 0, autoTried: 0, autoTriedAmt: 0, autoNew: 0, npa: '', maxAtt: 0, oldest: '' });
    var amt = (Number(i.amount_due) || 0) / 100, cr = i.created_at ? new Date(i.created_at * 1000).toISOString().slice(0, 10) : '';
    if (i.manual || i.collection_method === 'send_invoice') { p.man++; p.manAmt += amt; }
    else if ((Number(i.attempt_count) || 0) > 0) { p.autoTried++; p.autoTriedAmt += amt; p.maxAtt = Math.max(p.maxAtt, Number(i.attempt_count)); p.npa = i.next_payment_attempt ? new Date(i.next_payment_attempt * 1000).toISOString().slice(0, 10) : (p.npa || 'none'); }
    else p.autoNew++;
    if (!p.oldest || cr < p.oldest) p.oldest = cr;
  });
  var onlyDeb = [], both = [], onlyInv = [];
  Object.keys(deb).forEach(function (u) { if (per[u] && (per[u].man || per[u].autoTried)) both.push(u); else onlyDeb.push(u); });
  Object.keys(per).forEach(function (u) { if (!deb[u] && (per[u].man || per[u].autoTried)) onlyInv.push(u); });
  Logger.log('=== open invoices fetched ' + inv.length + ' | users with open invoices ' + Object.keys(per).length + ' | Debtors rows ' + Object.keys(deb).length);
  Logger.log('=== BOTH ' + both.length + ' | only in Debtors (no open invoice) ' + onlyDeb.length + ' | only in invoices (not in Debtors) ' + onlyInv.length);
  var line = function (u) { var p = per[u] || {}, d = deb[u] || {}; return 'u=' + u + ' deb[prio=' + d.prio + ' amt=' + d.amt + ' life=' + d.life + ' stage=' + d.stage + '] inv[man=' + (p.man || 0) + '/' + (p.manAmt || 0) + ' autoTried=' + (p.autoTried || 0) + '/' + (p.autoTriedAmt || 0) + ' maxAtt=' + (p.maxAtt || 0) + ' npa=' + (p.npa || '-') + ' autoNew=' + (p.autoNew || 0) + ' oldest=' + (p.oldest || '') + ']'; };
  onlyDeb.forEach(function (u) { Logger.log('D ' + line(u)); });
  onlyInv.forEach(function (u) { Logger.log('I ' + line(u)); });
  both.forEach(function (u) { Logger.log('B ' + line(u)); });
  var newOnly = Object.keys(per).filter(function (u) { return !per[u].man && !per[u].autoTried; });
  Logger.log('=== users with only untried open auto invoices (upcoming) ' + newOnly.length);
}
function waProbeLang() { // one-off (09.09.): does the language pick work on real trial people? log only, no names
  var t = readTrials('Zurich').concat(readTrials('Winterthur')).slice(-30), uids = [], seen = {};
  t.forEach(function (x) { if (x.uid && !seen[x.uid]) { seen[x.uid] = true; uids.push(x.uid); } });
  var leads = readLeads(), leadLang = {}; leads.forEach(function (l) { if (l.nname && !leadLang[l.nname]) leadLang[l.nname] = l.lang; });
  var cl = fetchClients(uids), src = {};
  t.forEach(function (x) { if (!cl[x.uid]) return; var c = cl[x.uid], p = langPick(c, leadLang[x.nname]); src[p.src] = (src[p.src] || 0) + 1; Logger.log('L ' + x.uid + ' msg=' + (c.message ? c.message.length : 0) + ' tags=' + String(c.tags || '').replace(/\n/g, ' ').slice(0, 40) + ' lead=' + (leadLang[x.nname] || '-') + ' -> ' + p.lang + '/' + p.src); });
  Logger.log('lang sources: ' + JSON.stringify(src));
}
function waProbeRefresh() { // one-off (09.09.): is the stored Stripe pay link stale, and does exercise.com's refresh give a fresh one? log only (URLs, no names)
  var ss = SpreadsheetApp.openById(WA_ID), sh = ss.getSheetByName('Debtors');
  var uid = String(sh.getRange(5, 2).getValue() || '').replace(/\D/g, '');
  var b = cfPost({ action: 'invoices', uid: uid, per: 20, past_due: false, status: 'open' }); if (!b) { Logger.log('no invoices'); return; }
  var open = (b.rows || []).filter(function (i) { return i.collection_method === 'send_invoice' || (Number(i.attempt_count) || 0) > 0; }).sort(function (x, y) { return (x.created_at || 0) - (y.created_at || 0); });
  if (!open.length) { Logger.log('no open debt for ' + uid); return; }
  var inv = open[0];
  Logger.log('BEFORE id=' + inv.id + ' status=' + inv.status + ' updated=' + (inv.updated_at ? fmtD(new Date(inv.updated_at * 1000)) : '') + ' url=' + inv.hosted_invoice_url);
  var r = cfPost({ action: 'invoice_refresh', ids: [inv.id] }); if (!r) { Logger.log('refresh failed'); return; }
  var n = (r.invoices || {})[inv.id] || {};
  Logger.log('AFTER  id=' + inv.id + ' status=' + n.status + ' updated=' + (n.updated_at ? fmtD(new Date(n.updated_at * 1000)) : '') + ' url=' + n.hosted_invoice_url + ' same=' + (n.hosted_invoice_url === inv.hosted_invoice_url));
}
function installDryRunTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'waDryRunHourly') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('waDryRunHourly').timeBased().everyHours(1).create();
}
