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
var RULE = { A1_H: 48, NEXT_H: 48, A_MAX: 3, C_D: 1, D_D: 3, OPEN: 10, CLOSE: 19, B_OPEN: 7 }; // Ruben 10.09.2026 (rolling chain): message 1 48 h after the request, every further one 48 h after the LAST message (manual or automatic), 3 messages at most; reminder 3 h before class
var LC_SKIP = /not interested|do not contact|lost|non-client|client|signed/i; // lifecycle stages that stop Flow D
var TEST_MAIL = /^(testlead|test-endpunkt|test2@|paulinelowe12|waseasdasd)/i;
var TEXT = {
  A1: { de: 'Hi {name}, hier ist {sender} von IMPACT {studio}. Super, dass du unser Training kennenlernen willst. Wir haben gerade sehr viele Anfragen, ich melde mich so schnell wie möglich telefonisch bei dir. Wann erreiche ich dich am besten?', // Flow A texts = Google Doc, Ruben's go 10.09.2026
        en: "Hi {name}, this is {sender} from IMPACT {studio}. Great that you want to get to know our training. We're getting a lot of requests right now, so I'll call you as soon as I can. When is the best time to reach you?" },
  A2: { de: 'Hi {name}, wenn du noch Interesse an einem Probetraining hast: Wann erreiche ich dich am besten kurz telefonisch?',
        en: "Hi {name}, Sorry, it took so long. If you're still keen on a trial session: when is the best time to reach you for a quick call?" },
  A3: { de: 'Hi {name}, letzte Nachricht von mir zu deiner Anfrage. Wenn du später mal starten willst, sag mir kurz, wann ein Anruf passt. Alles Gute!',
        en: "Hi {name}, last message from me about your request. If you'd like to start later on, just tell me when a call suits you. All the best!" },
  B1: { de: 'Hi {name}, kurze Erinnerung: Heute um {time} ist dein {class} Probetraining bei uns. Bis später! 🙂', // B, C, D texts = Google Doc, Ruben's go 10.09.2026
        en: 'Hi {name}, quick reminder: your {class} trial session is today at {time}. See you later! 🙂' },
  C1: { de: 'Hi {name}, schade, dass es gestern mit dem Probetraining nicht geklappt hat. Soll ich dir einen neuen Termin vorschlagen?',
        en: "Hi {name}, sorry you couldn't make it to your trial yesterday. Shall I suggest a new date?" },
  D1: { de: 'Hi {name}, wie hat dir das Probetraining am {date} gefallen? Gibt es etwas, das für dich noch offen ist?',
        en: 'Hi {name}, how did you like your trial on {date}? Is there anything still open for you?' },
  X1: { de: 'Hi {name}, schade, dass es mit dem Probetraining am {date} nicht geklappt hat. Soll ich dir einen neuen Termin vorschlagen?', // DRAFT (10.09.2026, not in the Google Doc yet): cancelled trial, Ruben decides the text
        en: "Hi {name}, a pity the trial on {date} didn't work out. Shall I suggest a new date?" }
};
var CF_URL = 'https://www.impact-martialarts.com/api/wa', CF_TOKEN = 'PASTE_LEADLOG_TOKEN_HERE'; // Token = Zeile "var TOKEN" im Leads-Log-Script; nur im Editor eintragen, nie ins Repo
var CARD_LINK = 'https://app.impact-martialarts.com/ex4/me/account/?card=true'; // member billing page (save the card for the next charges); same for everyone. The pay link per member ({pay_link}) is the Stripe payment page of the ORIGINAL open invoice (hosted_invoice_url from exercise.com, since 08.09.2026, Ruben's decision).
var RULE_E = { W1_D: 3, W2_D: 6, W3_D: 14, DAYS: 180, HIST_D: 180, MAX_ATTEMPTS: 5, RETRY_WINDOW_D: 14, W4_GRACE_D: 7, W4_AFTER_W3_D: 7, W5_D: 1 }; // Ruben 10.09.: W4 only 7 days after W3 actually went out; W5 = the day after the second invoice was paid while the first is still open (the member had both links and paid only one) // Ruben 08.09.: W1 am Tag 3, 180 Tage zurueck, W4 mit 7 Tagen Frist, Inkasso-Stage erst 7 Tage nach der zweiten geplatzten Rechnung // exercise.com KB (06/2025): Stripe Smart Retries, up to 4 retries within 2 weeks, timing chosen by Stripe, not configurable; afterwards no automatic attempt (subscription stays past-due at IMPACT). MAX_ATTEMPTS = 1 failure + 4 retries.
var HARD_DECLINE = /lost|stolen|incorrect number|invalid account|authentication required|not allowed|does not support/i; // Stripe does not retry these until a new card is on file // Ruben 07.09.2026: W1 zwei Tage nach der ersten Sichtung (Abbuchung geht oft von selbst noch durch), W2 Tag 6, W3 Tag 14, W4 einen Tag nach der naechsten Faelligkeit
var TEXT_E = {
  W1: { de: 'Hey {name} 👋 wir haben gesehen, dass die letzte Zahlung bei deinem Abo leider nicht durchgegangen ist. Kannst du bitte kurz deine Zahlungsdaten und die Deckung deines Kontos prüfen, damit wir es in den nächsten Tagen erneut abbuchen können? Wenn du Hilfe brauchst, sag kurz Bescheid 🙏 Danke dir!',
        en: "Hey {name} 👋 We noticed that the last payment for your membership didn't go through. Could you please check your payment details and make sure your account has sufficient funds, so we can retry the charge in the next few days? If you need any help, just let us know 🙏 Thanks so much!" },
  W2: { de: 'Hey {name}, wir konnten die offene Zahlung leider immer noch nicht abbuchen. Bitte prüfe heute kurz deine Zahlungsdaten oder die Deckung deines Kontos, wir versuchen die Abbuchung dann nochmals. Danke dir!',
        en: 'Hey {name}, unfortunately we still could not collect the outstanding payment. Please check your payment details or the funds on your account today, and we will retry the charge. Thanks!' },
  W3: { de: 'Hey {name}, die Zahlung von CHF {amount} ist seit dem {due_date} offen, und die automatischen Abbuchungen sind ausgeschöpft. Du kannst die Rechnung direkt hier bezahlen (auch mit einer neuen Karte): {pay_link} Bitte hinterlege danach auch deine aktuelle Karte für die nächsten Abbuchungen: {card_link} Falls es gerade schwierig ist: melde dich, dann finden wir eine Lösung.',
        en: "Hi {name}, the payment of CHF {amount} has been outstanding since {due_date} and the automatic charges have run out. You can pay the invoice directly here (a new card works too): {pay_link} Afterwards, please also save your current card for the next charges: {card_link} If things are difficult at the moment, get in touch and we will find a solution together." },
  W5: { de: 'Hey {name}, danke für deine Zahlung 🙏 Eine ältere Rechnung über CHF {amount} vom {due_date} ist allerdings noch offen. Du kannst sie direkt hier bezahlen: {pay_link} Melde dich kurz, falls etwas unklar ist oder du eine Lösung brauchst.', // in the Google Doc since 10.09.2026 (Ruben: build as is): second invoice paid after W4, first still open
        en: "Hi {name}, thanks for your payment 🙏 One older invoice of CHF {amount} from {due_date} is still open, though. You can pay it directly here: {pay_link} Just get in touch if anything is unclear or you need a solution." },
  W4: { de: 'Hey {name}, leider sind inzwischen mehrere Zahlungen offen, insgesamt CHF {amount}. Wenn wir innerhalb von 7 Tagen keinen Zahlungseingang bzw. keine Rückmeldung erhalten, müssen wir den offenen Betrag an unser Inkasso-/Mahnverfahren weitergeben. Du kannst die Rechnungen direkt hier bezahlen: {invoices} Bitte hinterlege danach auch deine aktuelle Karte: {card_link} Melde dich kurz, wenn du eine Lösung brauchst, damit wir das vermeiden können.',
        en: "Hi {name}, unfortunately several payments are still overdue, CHF {amount} in total. If we don't receive a payment or a reply from you within 7 days, we'll need to move forward with our debt collection process. You can pay the invoices directly here: {invoices} Afterwards, please also save your current card: {card_link} Get in touch if you need a solution, so we can avoid further steps." }
};
var TEXT_M = { // manual texts (Abdi / Bogdan after an unanswered call, quick replies); not sent by the automation, kept here for the call list and the chat-state detection (Google Doc, Ruben 10.09.2026)
  M1: { de: 'Hi {name}, hier ist {sender} von IMPACT {studio}. Ich habe gerade versucht, dich anzurufen, wegen deiner Anfrage für ein Probetraining. Wann passt dir ein kurzer Anruf?',
        en: 'Hi {name}, this is {sender} from IMPACT {studio}. I just tried to call you about your request for a trial session. When would a quick call suit you?' },
  M2: { de: 'Hi {name}, ich habs telefonisch probiert. Wann erreiche ich dich am besten? Das Probetraining planen wir zusammen im kurzen Gespräch.',
        en: "Hi {name}, I tried calling. When is the best time to reach you? We'll plan your trial session together in a quick call." },
  M3: { de: 'Hi {name}, letzter Versuch, ich will dich nicht nerven. Wenn du noch Lust auf ein Probetraining hast, sag mir kurz, wann ein Anruf passt. Sonst alles Gute!',
        en: "Hi {name}, last try, I don't want to bother you. If you still fancy a trial session, just tell me when a call suits you. Otherwise all the best!" }
};
var RULE_R = { N: 7, WIN_D: 45, LOCS: ['Zurich'] }; // Ruben 10.09.2026: Google review request after the 7th check-in, Zurich (Abdi) first. New members only: first visit inside the last WIN_D days (45: a 60-day visits report does not finish in time, 45 days Zurich = ~4200 rows in 11 s)
var LOC_ID = { Zurich: 2508, Winterthur: 2222 }; // exercise.com location ids (same as klassen.js)
var REVIEW_LINK = { Zurich: 'https://g.page/r/CUfMYkGu7EHJEBM/review', Winterthur: 'https://g.page/r/CSof6-V2zvUTEBM/review' }; // "write a review" links from the Google Business Profile (Ruben 10.09.2026)
var TEXT_R = { // Google Doc, Ruben's go 10.09.2026
  R1: { de: 'Hi {name}, schön, dass du so regelmässig da bist. Wenn dir das Training bei uns gefällt, würdest du uns kurz eine Google-Bewertung schreiben? Das hilft uns enorm: {review_link}',
        en: "Hi {name}, great to see you training so regularly. If you're enjoying it, would you leave us a quick Google review? It helps us a lot: {review_link}" }
};
var STAGE = { lead: 9398, first: 9692, second: 9861, third: 11307, trialBooked: 9693, pending: 10005, lost: 9970, noshow: 11305, cancelled: 11313, debt: 11034 }; // exercise.com lifecycle stage ids (read 10.09.2026)
var STAGE_SYNC = { pending: true, contacts: true, lost: false, noshow: false, debt: false }; // Ruben 10.09.: the stages in exercise.com follow the events. Live before the WhatsApp go-live: "Pending Decision" (trial list) and First/Second/Third Contact from the coaches' call ticks; the rest hangs on messages that are not sent yet
var LEAD_STAGES = ['Lead', 'First Contact', 'Second Contact', 'Third Contact', 'Missed the talk', 'Trial Booked', 'Pending Decision', 're-engage no-shows', 're-engage cancelled trial', '']; // the automation only moves clients that are in one of these; Client, Do Not Contact, Debt collection etc. are never touched
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
    out.push([dayStart(now), fmtT(now), sendAt(now, flow), flow, msg, isE ? 'Support (Waseem)' : (loc === 'Zurich' ? 'Zürich' : 'Winterthur'), name, lang.toUpperCase(), trigger, text, key]);
  }
  function push(flow, msg, loc, name, lang, trigger, key, vars) { pushRow(flow, msg, loc, name, lang, trigger, key, vars, TEXT); }
  // Flow A: website lead, no trial booking. Rolling chain (Ruben 10.09.): message 1 = 48 h after the request, message 2 = 48 h after
  // message 1, message 3 = 48 h after message 2, then the chain ends. Each slot is filled by the coach after a call (M1-M3, visible
  // only after the WhatsApp connection) or, when the 48 h run out, by the automation (A1-A3). "Due" = the mark fell into the last 24 h (no backlog).
  var h = 3600000, lastA = lastFlowA(sh), calls = harvestCalls(now); // calls = the coaches' ticks in the call lists ("Called, no answer" / "Reached"), the call signal we do not get from WhatsApp
  leads.forEach(function (l) {
    if (!l.loc || l.test || l.status !== 'ok') return;
    if (trialNames[l.nname] || hasTrialLoose(trials, l)) return; // booked, attended, no-show or cancelled: Flow A is over
    var id = l.email || l.nname, st = leadState(l, lastA, calls, now), slot = st.slot, lastAt = st.lastAt;
    if (st.reached || slot >= RULE.A_MAX) return; // reached by phone: the coach owns the lead, the automation is off
    var msg = 'A' + (slot + 1), due = lastAt ? lastAt.getTime() + RULE.NEXT_H * h : l.ts.getTime() + RULE.A1_H * h;
    if (due <= now.getTime() && due > now.getTime() - 24 * h) push('A', msg, l.loc, l.name, l.lang, msg + ': ' + (lastAt ? RULE.NEXT_H + ' h after message ' + slot + ' (' + fmtEuDT(lastAt) + ')' : RULE.A1_H + ' h after the request (' + fmtEuDT(l.ts) + ')') + ', no trial booked', 'A:' + msg + ':' + id, {});
  });
  writeCallLists(leads, trials, trialNames, lastA, calls, now); // Ruben 10.09.: call list per studio in Team KPIs (replaces the lifecycle stages First/Second/Third Contact as the team's working list)
  if (STAGE_SYNC.contacts) { // Ruben 10.09. ("ja"): the call ticks set First / Second / Third Contact in exercise.com (forward only); after the go-live the sent messages will do the same
    var stageN = 0, ladder = [['first', ['Lead', '']], ['second', ['Lead', 'First Contact', '']], ['third', ['Lead', 'First Contact', 'Second Contact', '']]];
    leads.forEach(function (l) {
      if (!l.loc || l.test || l.status !== 'ok' || !l.email || trialNames[l.nname] || hasTrialLoose(trials, l)) return;
      var n = (calls[l.email.toLowerCase()] || { called: [] }).called.length; if (!n) return;
      var step = ladder[Math.min(n, 3) - 1]; if (setStage(ss, l.email, l.name, STAGE[step[0]], STAGE_NAME[step[0]], 'call attempt ' + n + ' ticked in the call list', step[1]) === 'set') stageN++;
    });
    if (stageN) Logger.log('stages from call ticks: ' + stageN + ' set');
  }
  // Flows B, C, D from the trial lists. Language (Ruben 09.09.): 1. tag EN / DE in exercise.com (optional, set by hand), 2. the language
  // of the request text the person wrote (exercise.com profile field "Message"), 3. the website page / form text of the lead, 4. German.
  var yday = addDs(today, -RULE.C_D), d3 = addDs(today, -RULE.D_D), due = [];
  ['Zurich', 'Winterthur'].forEach(function (loc) {
    trials[loc].forEach(function (t) {
      if (keys['B:B1:' + t.uid + ':' + t.date] && keys['C:C1:' + t.uid + ':' + t.date] && keys['D:D1:' + t.uid + ':' + t.date] && keys['X:X1:' + t.uid + ':' + t.date]) return;
      if (t.art === 'BOOKED' && t.date === today) due.push({ flow: 'B', msg: 'B1', loc: loc, t: t, trig: 'B1: trial booked today, ' + t.cls + ' (3 h before class; class time not in the list yet)', key: 'B:B1:' + t.uid + ':' + t.date, vars: { 'class': t.cls, time: '{time}' } });
      if (t.art === 'NOSHOW' && t.date === yday) due.push({ flow: 'C', msg: 'C1', loc: loc, t: t, trig: 'C1: no-show on ' + euD(t.date) + ', no new booking', key: 'C:C1:' + t.uid + ':' + t.date, vars: {} });
      if (t.art === 'CANCELLED' && t.date >= addDs(today, -7) && t.date <= addDs(today, 30)) due.push({ flow: 'X', msg: 'X1', loc: loc, t: t, trig: 'X1: trial on ' + euD(t.date) + ' cancelled, no new booking (re-engage cancelled trial)', key: 'X:X1:' + t.uid + ':' + t.date, vars: { date: '' } }); // Flow X (Ruben 10.09.): cancelled trial, once per trial date, next send window
      if (t.art === 'TRIAL' && t.date === d3 && !t.contract && !LC_SKIP.test(t.lifecycle)) due.push({ flow: 'D', msg: 'D1', loc: loc, t: t, trig: 'D1: trial on ' + euD(t.date) + ', no contract, stage "' + (t.lifecycle || '-') + '"', key: 'D:D1:' + t.uid + ':' + t.date, vars: { date: '' } });
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
    var sent = sentPrefixes(sh, leftDates(ss)), held = [];
    var w4one = arr.filter(function (a) { return sent['E:W4:' + a.uid] && a.open === 1; }); // W4 went out, one invoice left: was the second one paid?
    var paidE = w4one.length ? paidSince(addDs(today, -60)) : {};
    arr.forEach(function (a) {
      var c = info[a.uid];
      if (!activeClient(c)) return; // not in the client list (cancelled/inactive), debt collection, paused, unknown status: by hand
      var lang = langPick(a.client, leadLang[nname(a.name)]).lang;
      var links = a.debts.map(function (d) { return 'CHF ' + d.amount.toFixed(2) + ' (' + deDate(d.date, lang) + '): ' + d.link; }).join(' | ');
      var vars = { due_date: deDate(a.first, lang), amount: String(a.amount), pay_link: a.debts.length > 1 ? links : a.debts[0].link, card_link: CARD_LINK, invoices: links }; // Ruben 09.09.: always every link, never chase twice. Links come from a.debts (refreshed this run in refreshPayLinks), never from a copy taken before the refresh (Ruben 10.09.).
      // Ruben 10.09.: only the HIGHEST due stage goes out. An old case that is already 20 days open gets W3 (with the pay links) straight away, never W1+W2+W3 on the same day; the skipped stages count as done. A stage never goes out after a higher one (W4 sent, second invoice paid -> no W3).
      var st = stageOf(a), w3 = sent['E:W3:' + a.uid], w4 = sent['E:W4:' + a.uid], since = '';
      if (st === 'W4' && !(w3 && daysBetween(w3, today) >= RULE_E.W4_AFTER_W3_D)) st = stageByDays(a); // Ruben 10.09.: W4 only 7 days after W3 really went out; until then the stage by age (an old case gets W3 with all links first, W4 a week later)
      if (w4 && a.open === 1) { since = (paidE[a.uid] && paidE[a.uid] >= w4) ? paidE[a.uid] : w4; st = daysBetween(since, today) >= RULE_E.W5_D ? 'W5' : 'wait'; } // Ruben 10.09.: second invoice paid after W4, first still open -> W5 the next day (no paid date found: the day after W4)
      if (st === 'wait') return;
      var top = 0; STAGES.forEach(function (m) { if (sent['E:' + m + ':' + a.uid] && RANK[m] > top) top = RANK[m]; });
      if (RANK[st] <= top) return; // this stage or a higher one already went out (within the last 60 days)
      var skipped = STAGES.filter(function (m) { return RANK[m] < RANK[st] && !sent['E:' + m + ':' + a.uid]; });
      var money = 'CHF ' + a.amount + ' open, ' + a.attempts + ' attempts, ' + (a.nextRetry ? 'next Stripe retry ' + euD(a.nextRetry) : 'no automatic retry left') + (a.reason ? ', ' + a.reason : '');
      var trig = { W1: 'W1: ' + a.days + ' days since the first open invoice (' + euD(a.first) + '), ' + money,
                   W2: 'W2: still open after ' + a.days + ' days, ' + money,
                   W3: 'W3: still open after ' + a.days + ' days, pay link' + (a.debts.length > 1 ? 's of all ' + a.debts.length + ' open invoices' : ' of the original invoice') + ', ' + money,
                   W4: 'W4: ' + a.open + ' open invoices (the next invoice failed too), ' + money }[st];
      if (st === 'W5') trig = 'W5: W4 sent ' + euD(w4) + ', second invoice ' + (paidE[a.uid] && paidE[a.uid] >= w4 ? 'paid on ' + euD(paidE[a.uid]) : 'gone (no paid date found)') + ', first invoice (' + euD(a.first) + ') still open ' + daysBetween(since, today) + ' days later, ' + money;
      if (skipped.length) trig += ' [' + skipped.join('+') + ' skipped: highest due stage only]';
      if (RANK[st] >= RANK.W3 && !a.debts.every(function (d) { return d.fresh; })) { held.push(st + ' ' + a.uid); return; } // Ruben 10.09.: a message with pay links only goes out when every link was confirmed fresh from Stripe in this run; otherwise it waits for the next hour
      var pre = 'E:' + st + ':' + a.uid; sent[pre] = today; pushRow('E', st, 'Waseem', a.name, lang, trig, pre + ':' + a.first, vars, TEXT_E);
    });
    if (held.length) { payNote += ' Held (pay link not refreshed this run): ' + held.length + '.'; Logger.log('held, pay link not refreshed: ' + held.join(', ')); }
  }
  // Flow R: Google review request after the N-th check-in (Ruben 10.09.: Zurich / Abdi first). Only new members (first visit inside
  // the window), completed check-ins since the first visit; due when the N-th check-in happened today or yesterday (no backlog blast).
  var rev = reviewCandidates(today), revNote = '';
  if (rev === null) revNote = ' Flow R skipped (report not ready / error).';
  else {
    var ydayR = addDs(today, -1), dueR = rev.filter(function (c) { return (c.nth === today || c.nth === ydayR) && !keys['R:R1:' + c.uid]; });
    var revClients = fetchClients(dueR.map(function (c) { return c.uid; }));
    dueR.forEach(function (c) {
      var link = REVIEW_LINK[c.loc]; if (!link) { Logger.log('R1 held: no review link for ' + c.loc); return; }
      var cl = revClients[c.uid] || {}, pick = langPick(cl, leadLang[nname(c.name || cl.name)]);
      pushRow('R', 'R1', c.loc, c.name || cl.name || '', pick.lang, 'R1: ' + RULE_R.N + 'th check-in on ' + euD(c.nth) + ' (first visit ' + euD(c.first) + ', ' + c.count + ' completed check-ins) [lang ' + pick.lang + ' from ' + pick.src + ']', 'R:R1:' + c.uid, { review_link: link }, TEXT_R);
    });
  }
  payNote += revNote;
  // Stage sync (Ruben 10.09.): "Pending Decision" on the evening of an attended trial without contract (first run after 20:00), only if the stage was not changed by hand
  if (STAGE_SYNC.pending && Number(Utilities.formatDate(now, TZ, 'H')) >= 22) { // Ruben 10.09.: after 22:00, sales can still close until 21:30
    var setN = 0;
    ['Zurich', 'Winterthur'].forEach(function (loc) { trials[loc].forEach(function (t) { if (t.art === 'TRIAL' && t.date === today && !t.contract && !LC_SKIP.test(t.lifecycle)) { if (setStage(ss, t.uid, t.name, STAGE.pending, 'Pending Decision', 'trial attended ' + euD(t.date) + ', no contract by 22:00') === 'set') setN++; } }); });
    if (setN) payNote += ' Stages: ' + setN + ' x Pending Decision.';
  }
  if (out.length) { var r0 = sh.getLastRow() + 1; sh.getRange(r0, 1, out.length, HEAD.length).setValues(out); sh.getRange(r0, 1, out.length, 1).setNumberFormat('dd.MM.yyyy'); sh.getRange(r0, 3, out.length, 1).setNumberFormat('dd.MM.yyyy HH:mm'); }
  if (arr) { writeArrears(ss, arr, info, sh); retireRetryTab(ss); var es = ss.getSheetByName('E state'); if (es) ss.deleteSheet(es); }
  var su = ss.getSheetByName('Summary'); if (su) su.getRange('A3:A400').setNumberFormat('dd.MM.yyyy');
  sh.getRange('A3').setValue('Last run ' + fmtEuDT(now) + ', ' + out.length + ' new rows. Leads read: ' + leads.length + ', trial rows: ' + (trials.Zurich.length + trials.Winterthur.length) + ', clients with failed payments: ' + (pay ? pay.length : 'n/a') + ', debtors (open invoices): ' + (arr ? arr.length : 'n/a') + '.' + payNote);
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
    out.push({ ts: ts, status: String(r[LEAD.status] || '').trim(), first: first, name: (first + ' ' + last).trim(), nname: nname(first + ' ' + last), email: email, loc: loc, lang: lang, test: test, phone: String(r[LEAD.phone] || '').trim(), interest: String(r[LEAD.interest] || '').trim() });
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
function euD(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? m[3] + '.' + m[2] + '.' + m[1] : String(iso || ''); } // 2026-09-08 -> 08.09.2026 (Ruben 10.09.: European dates in every visible field; ISO stays internal)
function euDT(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/.exec(String(iso || '')); return m ? m[3] + '.' + m[2] + '.' + m[1] + ' ' + m[4] : euD(iso); }
function fmtEuD(d) { return Utilities.formatDate(d, TZ, 'dd.MM.yyyy'); }
function fmtEuDT(d) { return Utilities.formatDate(d, TZ, 'dd.MM.yyyy HH:mm'); }
function dayStart(d) { return atHour(d, 0); } // Date object at 00:00 Swiss time (date cells in the sheets, formatted dd.MM.yyyy)
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
function fetchReport(key, start, end, per, cols, locId, noWait) { // exercise.com report via /api/wa (cache, then refresh + poll); null = error or, with noWait, 'not ready yet' (refresh triggered, read on the next run)
  if (!CF_TOKEN || /^PASTE/.test(CF_TOKEN)) return null;
  var refresh = false; // attempt 0 uses exercise.com's cached report (fast when the same window was generated earlier today), attempt 1 triggers a fresh one, then poll
  for (var i = 0; i < 8; i++) {
    try {
      var r = UrlFetchApp.fetch(CF_URL, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ token: CF_TOKEN, action: 'report', key: key, start: start, end: end, per: per, refresh: refresh, rows: true, cols: cols, location_id: locId || undefined }), muteHttpExceptions: true });
      var b = JSON.parse(r.getContentText() || '{}');
      if (r.getResponseCode() !== 200 || !b.ok) { Logger.log('report ' + key + ': ' + r.getResponseCode() + ' ' + String(r.getContentText()).slice(0, 200)); return null; }
      if (b.ready) { if (i) Logger.log('report ' + key + ' ready after ' + i + ' attempts'); return b.rows || []; }
      if (i === 0) { refresh = true; continue; }
      if (noWait) { Logger.log('report ' + key + ': refresh triggered, read on the next run (refreshing=' + b.refreshing + ', rows=' + b.count + ', filters=' + String(b.filters || '').slice(0, 120) + ')'); return null; }
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
  rows.forEach(function (a) { var x = extra[a.uid]; if (!x) return; if (!info[a.uid]) info[a.uid] = x; a.name = a.name || x.name || ''; a.loc = x.location || a.loc || ''; a.phone = (info[a.uid] && info[a.uid].phone) || x.phone || ''; a.email = (info[a.uid] && info[a.uid].email) || x.email || ''; a.client = { tags: (x.tags || '') + ',' + ((info[a.uid] && info[a.uid].tags) || ''), message: x.message || '' }; }); // phone + e-mail for Waseem (09.09.)
  rows = refreshPayLinks(rows, today);
  rows.sort(function (x, y) { return y.days - x.days; }); // provisional; the final order (priority) is set in writeArrears once the client status is known
  Logger.log('Debtors: ' + rows.length + ' members from ' + inv.length + ' open invoices, ' + rows.filter(function (a) { return a.exhausted; }).length + ' without automatic retry, ' + rows.filter(function (a) { return a.dupes; }).length + ' with a duplicate sent invoice, ' + missing.length + ' without failed-payment entry (' + Object.keys(status).length + ' found in the client list)');
  return rows;
}
var ARR_HEAD = ['Priority', 'UID', 'Name', 'Phone', 'Email', 'Location', 'First failed', 'Days', 'Open invoices', 'Attempts', 'Next Stripe retry', 'Sent invoices', 'Amount open CHF', 'Last failure', 'Failure message', 'Item', 'Lifecycle', 'Billing', 'Stage', 'Action', 'Last retry', 'Done (Waseem)', 'Note', 'Last message', 'Updated', 'Pay links', 'Pay links (raw)']; // 09.09. (Ruben): one tab only, "Retry today" merged in; Pay links = every open invoice as short clickable labels, raw URLs in a hidden helper column
var ARR_W = [60, 80, 180, 120, 200, 90, 90, 50, 60, 60, 90, 70, 90, 90, 240, 200, 110, 80, 60, 360, 90, 90, 220, 120, 120, 200, 300]; // Phone + Email added 09.09. (Waseem)
var RETRY_WAIT_D = 2; // Ruben / Sam 09.09.: Waseem retries by hand every second or third day, not daily
var ARR_NOTE = 'Rebuilt every hour from the open invoices in exercise.com: one row per member with at least one open debt, i.e. a subscription invoice that failed at least once and is still open, or an unpaid invoice that was sent by hand. A sent invoice that repeats an older open subscription invoice of the same amount counts once ("Sent invoices" shows "dup": void the sent copy). Sorted by Priority (1 = most urgent), then by open amount. "Action" says what a human has to do today: wait (Stripe still retries on the date in "Next Stripe retry"), check the payment via the pay link or retry the named invoice by hand (only when Stripe has no attempt left for it), escalate to Sam (second invoice open and the W4 deadline passed), or by hand for special statuses. Tick "Done (Waseem)" after a manual retry: on the next run the tick becomes the date in "Last retry", the tab "Retry log" gets a line, and the action says to wait ' + RETRY_WAIT_D + ' days. "Note" is free text and survives the rebuild. A member leaves the list as soon as no open invoice is left (paid or voided in exercise.com); the log then records "invoice paid on ..." or "left the list". There is no closing by hand in the sheet. "Pay links" lists every open invoice of the member as a clickable link (amount and date), one per line, oldest first, refreshed every hour; the hidden column "Pay links (raw)" holds the full addresses for copying. Yellow rows: Stripe has no automatic attempt left for at least one open invoice, only the pay link or a manual retry settles it. Red rows: debt collection. Debt collection, paused and accounts outside the client list get no automatic message.';
var LOG_HEAD = ['Date', 'UID', 'Name', 'Location', 'Amount at the time', 'Listed since', 'Done (Waseem)', 'Note', 'Event'];
var MERGED_NOTE = 'Merged into the tab "Debtors" on 9 Sep 2026 (Ruben): Action, Last retry, Done (Waseem) and Note now live there. This tab is no longer updated and can be deleted.';
var STAGES = ['W1', 'W2', 'W3', 'W4', 'W5'], RANK = { wait: 0, W1: 1, W2: 2, W3: 3, W4: 4, W5: 5 };
function stageByDays(a) { return a.days >= RULE_E.W3_D ? 'W3' : (a.days >= RULE_E.W2_D ? 'W2' : (a.days >= RULE_E.W1_D ? 'W1' : 'wait')); }
function stageOf(a) { return a.open >= 2 ? 'W4' : stageByDays(a); } // Debtors view: second invoice open = W4. The message flow additionally waits 7 days after W3 (see waDryRunHourly)
function activeClient(c) { return !!c && !c.cancel_pending && !/debt|inactive|non-client|lost/i.test(c.lifecycle) && /^billed$/i.test(c.billing); }
function priorityOf(a, c) { // 1 = most urgent. Active members first (the automation can still act), ordered by dunning stage, then by amount.
  if (!c) return 5;                                   // not in the client list: cancelled / inactive, by hand
  if (/debt/i.test(c.lifecycle)) return 4;            // already in debt collection
  if (!activeClient(c)) return 4;                     // paused, pending cancellation, inactive, status unknown
  var st = stageOf(a);
  return st === 'W4' ? 1 : (st === 'W3' ? 2 : 3);     // W4 = second invoice open, W3 = retries exhausted, W1/W2/wait = still in the automatic window
}
function actionOf(a, c, p, today, w4) { // w4 = date W4 went out (dry run / later real), '' if not yet // what a human has to do with this member today (Waseem, or Sam)
  if (!c) return 'By hand: account not in client list (cancelled or inactive)';
  if (/debt/i.test(c.lifecycle)) return 'Debt collection running (Sam)';
  if (!c.billing) return 'By hand: status unknown (not in the failed-payment client list), check the client in exercise.com';
  if (!activeClient(c)) return 'By hand: subscription paused or pending cancellation';
  var dup = a.dupes ? 'Void the duplicate sent invoice. ' : (a.sent && a.open > a.sent ? 'Sent invoice next to an open subscription invoice: check whether both cover the same month and void one. ' : ''), st = stageOf(a); if (st === 'W4' && !w4) { st = stageByDays(a); dup += 'Second invoice open, W4 follows 7 days after W3. '; } // mixed cases (10.09.)
  if (st === 'W4') { var esc = addDs(w4, RULE_E.W4_GRACE_D); return dup + (today >= esc ? 'NOW: escalate to Sam and set "Debt collection" (W4 deadline ' + euD(esc) + ' passed)' : 'W4 sent or due: wait for the payment via the links, escalate to Sam on ' + euD(esc) + ' if still unpaid'); }
  if (p.lastRetry && daysBetween(p.lastRetry, today) < RETRY_WAIT_D) return dup + 'Retried by hand on ' + euD(p.lastRetry) + ', wait until ' + euD(addDs(p.lastRetry, RETRY_WAIT_D));
  if (a.manual.length) { // the pay link always points to the oldest open invoice, which is also the one to retry by hand
    var head = HARD_DECLINE.test(a.reason) ? 'Ask the member for a new card, then retry the oldest open invoice by hand' : 'Retry the oldest open invoice by hand in exercise.com (first line in Pay links). If it fails again, send the member the pay links';
    if (a.manual.length > 1) head += ' (' + a.manual.length + ' invoices without Stripe retry)';
    return dup + head + (a.nextRetry ? '. Stripe still retries the newest invoice on ' + euD(a.nextRetry) : '');
  }
  return dup + 'Wait for the Stripe retry on ' + euD(a.nextRetry) + '; ' + st + ' message due';
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
  if (true) { log.getRange('A1').setValue('Retry log: one line per event. "paid on <date>" = the member left the list and a paid invoice was found; "voided, no payment found" = the member left the list without a payment (invoice voided in exercise.com); "retried by hand on <date>" = one line per tick in Debtors. Lines before 9 Sep 2026 18:53 come from older versions of the log.'); log.getRange(2, 1, 1, LOG_HEAD.length).setValues([LOG_HEAD]).setFontWeight('bold').setBackground('#f3f3f3'); }
  return log;
}
function writeArrears(ss, rows, info, dry) {
  var sh = ss.getSheetByName('Debtors') || ss.getSheetByName('Arrears'); // renamed 08.09. (Ruben)
  if (sh && sh.getName() !== 'Debtors') sh.setName('Debtors');
  var today = fmtD(new Date()), now = fmtEuDT(new Date());
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
  var prev = {}, n = sh.getLastRow(), merged = sh.getRange(4, 21).getValue() === 'Last retry', oldMerged = sh.getRange(4, 19).getValue() === 'Last retry'; // oldMerged = layout of 09.09. evening without Phone / Email
  if (merged && n >= 5) sh.getRange(5, 1, n - 4, ARR_HEAD.length).getValues().forEach(function (r) { var u = String(r[1] || ''); if (u) prev[u] = { name: r[2], loc: r[5], amount: Number(r[12]) || 0, since: dOf(r[6]), lastRetry: dOf(r[20]), done: r[21] === true, note: cleanNote(r[22]) }; });
  if (!merged && oldMerged && n >= 5) sh.getRange(5, 1, n - 4, 25).getValues().forEach(function (r) { var u = String(r[1] || ''); if (u) prev[u] = { name: r[2], loc: r[3], amount: Number(r[10]) || 0, since: dOf(r[4]), lastRetry: dOf(r[18]), done: r[19] === true, note: cleanNote(r[20]) }; });
  if (!merged) { // one-off migration 09.09.: carry Last retry / Done / Note over from the old tab "Retry today", then upgrade the header
    var rt = ss.getSheetByName('Retry today');
    if (!oldMerged && rt && rt.getLastRow() >= 5 && rt.getRange(4, 11).getValue() === 'Last retry') rt.getRange(5, 1, rt.getLastRow() - 4, 14).getValues().forEach(function (r) { var u = String(r[0] || ''); if (u) prev[u] = { name: r[1], loc: r[2], amount: Number(r[5]) || 0, since: dOf(r[9]), lastRetry: dOf(r[10]), done: r[11] === true, note: cleanNote(r[12]) }; });
    if (sh.getMaxColumns() < ARR_HEAD.length) sh.insertColumnsAfter(sh.getMaxColumns(), ARR_HEAD.length - sh.getMaxColumns());
    if (n >= 4) sh.getRange(4, 1, n - 3, ARR_HEAD.length).clearContent().clearDataValidations().setBackground(null);
    sh.getRange(4, 1, 1, ARR_HEAD.length).setValues([ARR_HEAD]).setFontWeight('bold').setBackground('#fde8d5');
    ARR_W.forEach(function (w, i) { sh.setColumnWidth(1 + i, w); });
    sh.getRange('A1').setValue('Debtors: members with open invoices'); sh.getRange('A2').setValue(ARR_NOTE); sh.setRowHeight(2, 120);
    n = 4;
  }
  sh.getRange('A2').setValue(ARR_NOTE); sh.getRange(4, 1, 1, ARR_HEAD.length).setValues([ARR_HEAD]);
  var log = logSheet(ss), logRows = [];
  Object.keys(prev).forEach(function (u) { var p = prev[u]; if (p.done) { p.lastRetry = today; p.done = false; logRows.push([euD(today), u, p.name, p.loc, p.amount, euD(p.since), 'yes', p.note, 'retried by hand on ' + euD(today)]); } });
  var last = lastMsgE(dry), sentE = sentPrefixes(dry, leftDates(ss));
  var sorted = rows.slice().sort(function (x, y) { var px = priorityOf(x, info[x.uid]), py = priorityOf(y, info[y.uid]); return px !== py ? px - py : (y.amount !== x.amount ? y.amount - x.amount : y.days - x.days); });
  var current = {};
  var out = sorted.map(function (a) {
    current[a.uid] = true; var c = info[a.uid] || null, p = prev[a.uid] || {};
    return [priorityOf(a, c), a.uid, a.name, a.phone || '', a.email || '', a.loc, euD(a.first), a.days, a.open, a.attempts, a.nextRetry ? euD(a.nextRetry) : 'none', (a.sent ? String(a.sent) : '') + (a.dupes ? ' dup' : ''), a.amount, euD(a.lastDate), a.reason, a.item, c ? (c.lifecycle || 'unknown') : 'not in client list', c ? c.billing : '', stageOf(a), actionOf(a, c, p, today, sentE['E:W4:' + a.uid] || ''), p.lastRetry ? euD(p.lastRetry) : '', false, p.note || '', last[a.uid] || '', now, '', a.debts.map(function (d) { return 'CHF ' + d.amount.toFixed(2) + ' (' + euD(d.date) + '): ' + d.link; }).join('\n')];
  });
  var gone = Object.keys(prev).filter(function (u) { return !current[u]; });
  var paid = gone.length ? paidSince(addDs(today, -45)) : {};
  gone.forEach(function (u) { var p = prev[u]; logRows.push([euD(today), u, p.name, p.loc, p.amount, euD(p.since), '', p.note, paid[u] ? 'paid on ' + euD(paid[u]) : 'voided, no payment found']); }); // three events only (Ruben 09.09.): paid on, voided, retried by hand
  if (n >= 5) { sh.getRange(5, 1, n - 4, ARR_HEAD.length).clearContent().setBackground(null).setFontColor(null); sh.getRange(5, 22, n - 4, 1).clearDataValidations(); }
  if (out.length) {
    sh.getRange(5, 1, out.length, ARR_HEAD.length).setValues(out);
    sh.getRange(5, 13, out.length, 1).setNumberFormat('0.00'); [4, 7, 11, 14, 21].forEach(function (col) { sh.getRange(5, col, out.length, 1).setNumberFormat('@'); });
    sh.getRange(5, 22, out.length, 1).insertCheckboxes(); sh.getRange(5, 20, out.length, 1).setWrap(true); // Action wraps instead of spilling into Last retry (Ruben 10.09.)
    var rich = sorted.map(function (a) { var labels = a.debts.map(function (d) { return 'CHF ' + d.amount.toFixed(2) + ' (' + euD(d.date) + ')'; }); var rt = SpreadsheetApp.newRichTextValue().setText(labels.join('\n')); var pos = 0; a.debts.forEach(function (d, i) { if (d.link) rt.setLinkUrl(pos, pos + labels[i].length, d.link); pos += labels[i].length + 1; }); return [rt.build()]; }); // short clickable labels instead of long addresses (Ruben 09.09.)
    sh.getRange(5, 26, out.length, 1).setRichTextValues(rich).setWrap(true); sh.getRange(5, 27, out.length, 1).setWrap(false); sh.hideColumns(27);
    var bg = sorted.map(function (a) { var c = info[a.uid]; var col = (c && /debt/i.test(c.lifecycle)) ? '#f4cccc' : (a.exhausted ? '#fff2cc' : null); return ARR_HEAD.map(function () { return col; }); }); // red = debt collection (Ruben 08.09.), yellow = Stripe has no automatic attempt left (Ruben 09.09.)
    sh.getRange(5, 1, out.length, ARR_HEAD.length).setBackgrounds(bg);
  }
  if (logRows.length) log.getRange(log.getLastRow() + 1, 1, logRows.length, LOG_HEAD.length).setValues(logRows);
  var acts = out.map(function (r) { return String(r[19]).replace(/^(Void the duplicate sent invoice\. |Sent invoice next to an open subscription invoice: [^.]*\. |Second invoice open, W4 follows 7 days after W3\. )+/, ''); }); // counts without the prefixes
  sh.getRange('A3').setValue(out.length + ' members with open invoices, CHF ' + r2(out.reduce(function (sum, r) { return sum + r[12]; }, 0)) + ' open. Today: ' + acts.filter(function (s) { return /^NOW/.test(s); }).length + ' to escalate to Sam, ' + acts.filter(function (s) { return /^(Retry the oldest|Ask the member)/.test(s); }).length + ' to retry by hand, ' + acts.filter(function (s) { return /^Retried by hand/.test(s); }).length + ' waiting after a manual retry, ' + acts.filter(function (s) { return /^Wait for the Stripe retry|^W4 sent/.test(s); }).length + ' waiting for Stripe or the links. Priority 1 = second invoice open, 2 = retries exhausted, 3 = still in the automatic retry window, 4 = debt collection / paused / unknown, 5 = not in client list. ' + now);
}
function retireRetryTab(ss) { // 09.09. (Ruben): "Retry today" merged into "Debtors"; the old tab is emptied and marked, not deleted
  var rt = ss.getSheetByName('Retry today'); if (!rt || rt.getRange('A3').getValue() === MERGED_NOTE) return;
  var n = rt.getLastRow(); if (n >= 5) rt.getRange(5, 1, n - 4, rt.getMaxColumns()).clearContent().clearDataValidations();
  rt.getRange('A3').setValue(MERGED_NOTE);
}
function refreshPayLinks(rows, today) { // Stripe pay links expire (Waseem 09.09.): re-read every invoice that a message or the lists may use from Stripe via exercise.com, 40 per call.
  // The refreshed invoice also carries the true status: a debt that is paid or void in Stripe drops out right here.
  var need = [], byId = {};
  rows.forEach(function (a) { a.debts.forEach(function (d) { if (d.id && !byId[d.id]) { byId[d.id] = d; need.push(d.id); } }); }); // every open invoice (Ruben 09.09.: all links visible and fresh)
  var fresh = 0, closed = 0;
  for (var i = 0; i < need.length; i += 40) {
    var b = cfPost({ action: 'invoice_refresh', ids: need.slice(i, i + 40) }); if (!b) continue;
    Object.keys(b.invoices || {}).forEach(function (id) { var n = b.invoices[id], d = byId[id]; if (!n || n.error || !d) return; if (n.hosted_invoice_url) { d.link = String(n.hosted_invoice_url); d.fresh = true; fresh++; } if (n.status && n.status !== 'open') { d.closed = String(n.status); closed++; } });
  }
  var out = [];
  rows.forEach(function (a) {
    if (!a.debts.some(function (d) { return d.closed; })) { a.link = a.debts[0].link; out.push(a); return; } // fresh link also for the unchanged rows (Ruben 10.09.)
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
  dry.getRange(TR_ROW0, 1, n - TR_ROW0 + 1, HEAD.length).getValues().forEach(function (r) { if (r[3] === 'E') { var uid = String(r[10] || '').split(':')[2]; if (uid) m[uid] = r[4] + ' ' + euD(dOf(r[0])); } });
  return m;
}
function sentPrefixes(sh, left) { // 'E:W1:uid' -> date of that row. Ruben 10.09.: no 60-day window any more; a stage counts until the member left the Debtors list (Retry log "paid on" / "voided"), then a new episode starts at W1
  var m = {}, n = sh.getLastRow(); if (n < TR_ROW0) return m;
  sh.getRange(TR_ROW0, 1, n - TR_ROW0 + 1, HEAD.length).getValues().forEach(function (r) { var k = String(r[10] || '').split(':'); var d = dOf(r[0]); if (k[0] === 'E' && k.length >= 3 && !(left[k[2]] && d <= left[k[2]])) m[k.slice(0, 3).join(':')] = d; });
  return m;
}
function leftDates(ss) { // uid -> latest date the member left the Debtors list (Retry log events "paid on ..." / "voided, no payment found")
  var m = {}, log = ss.getSheetByName('Retry log'); if (!log || log.getLastRow() < 3) return m;
  log.getRange(3, 1, log.getLastRow() - 2, LOG_HEAD.length).getValues().forEach(function (r) { var u = String(r[1] || '').replace(/\D/g, ''), d = dOf(r[0]), ev = String(r[8] || ''); if (u && d && /^(paid on|voided)/.test(ev) && (!m[u] || d > m[u])) m[u] = d; });
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
var CALL_HEAD = ['Priority', 'Name', 'Phone', 'Language', 'Interest', 'Plan', 'Request', 'Days', 'Call attempts', 'Last call attempt', 'Messages so far', 'Your task', 'Automation next', 'Called, no answer', 'Reached', 'Updated', 'Key']; // Ruben 10.09.: attempts + time of the last attempt
var CALL_NOTE = 'Rebuilt every hour from the Leads Log and the trial lists: every website lead of this studio without a trial booking. Priority 1 (red) = nobody has contacted the lead yet: call today, if nobody answers send M1. Priority 2 (orange) = message 1 is out (or one call was made), no reply: call, if nobody answers send M2. Priority 3 (yellow) = message 2 is out, no reply: last call, if nobody answers send M3. Priority 4 (green) = reached by phone: propose the trial date and book it. Priority 6 (grey) = three messages, no reply: closed, no further action. Tick "Called, no answer" after every unsuccessful call (the tick is collected within the hour, counted in "Call attempts" with the time in "Last call attempt", then cleared; the 48 h clock restarts from your call). Tick "Reached" once you spoke to the lead: the row turns green and the automation stops for this lead. "Automation next" is the moment the automation sends the next message by itself (48 h after the last message or call). Leads leave the list as soon as a trial is booked. The ticks also fill "Anrufe versucht" and "Anrufe geführt" in the day rows of the Probetrainings tab. "Plan" is the training plan the lead built on the website, if any.';
function harvestCalls(now) { // collect the ticks from both call lists into the tabs "Call log ZH" / "Call log WT" (Team KPIs, split per studio by Ruben 10.09.), clear "Called", keep "Reached"; returns the state per lead key
  var ss = SpreadsheetApp.openById(TEAM_ID), state = {};
  ['Zurich', 'Winterthur'].forEach(function (loc) {
    var short = loc === 'Zurich' ? 'ZH' : 'WT', log = ss.getSheetByName('Call log ' + short) || ss.getSheetByName('Call log');
    if (!log) { log = ss.insertSheet('Call log ' + short); log.getRange('A1').setValue('Call log ' + short + ': one line per tick in the call list ("called" = called, nobody answered; "reached" = spoke to the lead). Feeds "Call attempts" / "Last call attempt" in the call list and the day rows "Anrufe versucht" / "Anrufe geführt" in the Probetrainings tab. Read-only.').setFontColor('#666666'); log.getRange(2, 1, 1, 6).setValues([['Date', 'Time', 'Studio', 'Name', 'Key', 'Event']]).setFontWeight('bold').setBackground('#f3f3f3'); log.setFrozenRows(2); [100, 60, 90, 180, 220, 80].forEach(function (w, i) { log.setColumnWidth(1 + i, w); }); }
    if (log.getRange(2, 1).getValue() !== 'Date') log.getRange(2, 1, 1, 6).setValues([['Date', 'Time', 'Studio', 'Name', 'Key', 'Event']]).setFontWeight('bold').setBackground('#f3f3f3');
    var n = log.getLastRow();
    if (n >= 3) log.getRange(3, 1, n - 2, 6).getValues().forEach(function (r) { var k = String(r[4] || '').toLowerCase().trim(), ev = String(r[5] || ''), d = r[0] instanceof Date ? r[0] : new Date(String(r[0]).replace(/^(\d{2})\.(\d{2})\.(\d{4})/, '$3-$2-$1') + 'T' + (String(r[1] || '12:00')) + ':00'); if (!k || isNaN(d.getTime())) return; var st = state[k] = state[k] || { called: [], reached: null, loc: loc }; if (ev === 'reached') st.reached = st.reached && st.reached < d ? st.reached : d; else st.called.push(d); });
    var sh = ss.getSheetByName('Call list ' + short), add = []; if (!sh || sh.getLastRow() < 5) return;
    sh.getRange(5, 1, sh.getLastRow() - 4, CALL_HEAD.length).getValues().forEach(function (r) { var k = String(r[16] || '').toLowerCase().trim(); if (!k) return; var st = state[k] = state[k] || { called: [], reached: null, loc: loc };
      if (r[13] === true) { st.called.push(now); add.push([dayStart(now), fmtT(now), loc, r[1], k, 'called']); }
      if (r[14] === true && !st.reached) { st.reached = now; add.push([dayStart(now), fmtT(now), loc, r[1], k, 'reached']); } });
    if (add.length) { var r0 = log.getLastRow() + 1; log.getRange(r0, 1, add.length, 6).setValues(add); log.getRange(r0, 1, add.length, 1).setNumberFormat('dd.MM.yyyy'); Logger.log('call log ' + short + ': ' + add.length + ' new ticks'); }
  });
  return state;
}
function leadState(l, lastA, calls, now) { // slot = messages so far (automatic ones + the coach's calls, 3 at most), lastAt = last message or call, reached = spoke to the lead
  var id = l.email || l.nname, sentA = lastA[id] || {}, cs = calls[(l.email || '').toLowerCase()] || { called: [], reached: null };
  var done = ['A1', 'A2', 'A3'].filter(function (m) { return sentA[m]; }), times = done.map(function (m) { return sentA[m]; }).concat(cs.called);
  var lastAt = times.length ? new Date(Math.max.apply(null, times.map(function (d) { return d.getTime(); }))) : null;
  var allCalls = cs.called.concat(cs.reached ? [cs.reached] : []), lastCall = allCalls.length ? new Date(Math.max.apply(null, allCalls.map(function (d) { return d.getTime(); }))) : null;
  return { slot: Math.min(RULE.A_MAX, done.length + cs.called.length), lastAt: lastAt, done: done, sentA: sentA, calls: allCalls.length, lastCall: lastCall, reached: cs.reached };
}
function readPlans() { // lead e-mail -> latest training plan link (Leads Log, tab "Trainingsplan": Link col 15, E-Mail col 19)
  var m = {}, sh = SpreadsheetApp.openById(MAIN_ID).getSheetByName('Trainingsplan'); if (!sh || sh.getLastRow() < 2) return m;
  sh.getRange(2, 1, sh.getLastRow() - 1, 19).getValues().forEach(function (r) { var e = String(r[18] || '').toLowerCase().trim(), link = String(r[14] || '').trim(); if (e && /^https?:\/\//.test(link)) m[e] = link; });
  return m;
}
function writeCallLists(leads, trials, trialNames, lastA, calls, now) { // tabs "Call list ZH" / "Call list WT" in Team KPIs (Ruben 10.09.), rebuilt every run
  var ss = SpreadsheetApp.openById(TEAM_ID), h = 3600000, cut = now.getTime() - 30 * 24 * h, rows = { Zurich: [], Winterthur: [] }, plans = readPlans();
  var task = ['Call today. If nobody answers: send M1', 'Call. If nobody answers: send M2', 'Last call. If nobody answers: send M3', 'Closed: three messages, no reply. No further action'];
  var prio = [1, 2, 3, 6], colors = ['#f4cccc', '#fce5cd', '#fff2cc', '#efefef'];
  leads.forEach(function (l) {
    if (!l.loc || l.test || l.status !== 'ok') return;
    if (trialNames[l.nname] || hasTrialLoose(trials, l)) return;
    var st = leadState(l, lastA, calls, now), slot = st.slot, lastAt = st.lastAt, key = (l.email || l.nname).toLowerCase();
    if (l.ts.getTime() < cut && !slot && !st.reached) return; // older than 30 days without any contact: backlog from before the automation
    var p, c, t, next;
    if (st.reached) { if (st.reached.getTime() < now.getTime() - 21 * 24 * h) return; p = 4; c = '#d9ead3'; t = 'Reached on ' + fmtEuD(st.reached) + ': propose the trial date and book it in exercise.com'; next = 'nothing (reached, the automation is off)'; }
    else { if (slot >= RULE.A_MAX && lastAt && lastAt.getTime() < now.getTime() - 7 * 24 * h) return; p = prio[slot]; c = colors[slot]; t = task[slot]; var due = slot >= RULE.A_MAX ? null : new Date(lastAt ? lastAt.getTime() + RULE.NEXT_H * h : l.ts.getTime() + RULE.A1_H * h); next = !due ? 'nothing (lead closed)' : (due.getTime() < now.getTime() - 24 * h ? 'no automatic message (the moment passed before the automation started): call by hand' : fmtEuDT(sendAt(due, 'A')) + ': A' + (slot + 1) + ' goes out automatically'); }
    rows[l.loc].push({ p: p, c: c, ts: l.ts.getTime(), plan: plans[key] || '', r: [p, l.name, l.phone, l.lang.toUpperCase(), l.interest, plans[key] ? 'Plan' : '', fmtEuDT(l.ts), Math.floor((now.getTime() - l.ts.getTime()) / (24 * h)), st.calls, st.lastCall ? fmtEuDT(st.lastCall) : '', st.done.map(function (m) { return m + ' ' + fmtEuD(st.sentA[m]); }).join(', '), t, next, false, !!st.reached, fmtEuDT(now), key] });
  });
  ['Zurich', 'Winterthur'].forEach(function (loc) {
    var name = loc === 'Zurich' ? 'Call list ZH' : 'Call list WT', sh = ss.getSheetByName(name);
    if (!sh) { sh = ss.insertSheet(name); sh.getRange('A1').setValue(name + ': who to call today').setFontSize(14).setFontWeight('bold'); sh.setFrozenRows(4); }
    [60, 200, 130, 70, 150, 60, 130, 50, 60, 130, 200, 300, 260, 90, 80, 120, 10].forEach(function (w, i) { sh.setColumnWidth(1 + i, w); });
    sh.getRange('A2:Q2').breakApart(); sh.getRange('A2').setValue(CALL_NOTE).setFontColor('#666666').setWrap(true); sh.getRange('A2:P2').merge(); sh.setRowHeight(2, 130);
    var list = rows[loc].sort(function (a, b) { return a.p !== b.p ? a.p - b.p : a.ts - b.ts; });
    sh.getRange('A3').setValue(list.length + ' leads: ' + [1, 2, 3, 4, 6].map(function (p) { return list.filter(function (x) { return x.p === p; }).length + ' x priority ' + p; }).join(', ') + '. ' + fmtEuDT(now));
    sh.getRange(4, 1, 1, CALL_HEAD.length).setValues([CALL_HEAD]).setFontWeight('bold').setBackground('#f3f3f3');
    var n = sh.getLastRow(); if (n >= 5) sh.getRange(5, 1, n - 4, CALL_HEAD.length).clearContent().clearDataValidations().setBackground(null);
    if (list.length) {
      sh.getRange(5, 1, list.length, CALL_HEAD.length).setValues(list.map(function (x) { return x.r; }));
      sh.getRange(5, 1, list.length, CALL_HEAD.length).setBackgrounds(list.map(function (x) { return CALL_HEAD.map(function () { return x.c; }); }));
      sh.getRange(5, 3, list.length, 1).setNumberFormat('@'); sh.getRange(5, 12, list.length, 2).setWrap(true); sh.getRange(5, 14, list.length, 2).insertCheckboxes();
      sh.getRange(5, 6, list.length, 1).setRichTextValues(list.map(function (x) { var rt = SpreadsheetApp.newRichTextValue().setText(x.plan ? 'Plan' : ''); if (x.plan) rt.setLinkUrl(0, 4, x.plan); return [rt.build()]; }));
    }
    sh.hideColumns(CALL_HEAD.length);
    fillCallCounts(ss, loc, calls, now);
  });
  Logger.log('call lists: ZH ' + rows.Zurich.length + ', WT ' + rows.Winterthur.length);
}
function fillCallCounts(ss, loc, calls, now) { // day rows of the Probetrainings tab: B "Anrufe versucht" (every call), C "Anrufe geführt" (reached), from the Call log, only for days with ticks
  var per = {};
  Object.keys(calls).forEach(function (k) { var st = calls[k]; if (st.loc !== loc) return; st.called.forEach(function (d) { var day = fmtD(d); (per[day] = per[day] || { a: 0, c: 0 }).a++; }); if (st.reached) { var day = fmtD(st.reached); var e = per[day] = per[day] || { a: 0, c: 0 }; e.a++; e.c++; } });
  var days = Object.keys(per); if (!days.length) return;
  var sh = ss.getSheetByName(TR_SHEETS[loc]); if (!sh || sh.getLastRow() < TR_ROW0) return;
  var labels = sh.getRange(TR_ROW0, 1, sh.getLastRow() - TR_ROW0 + 1, 1).getValues().map(function (r) { return String(r[0] || '').trim(); });
  var wd = { 1: 'Mo', 2: 'Di', 3: 'Mi', 4: 'Do', 5: 'Fr', 6: 'Sa', 7: 'So' }, written = 0;
  days.forEach(function (day) { var d = new Date(day + 'T12:00:00'), label = wd[Number(Utilities.formatDate(d, TZ, 'u'))] + ' ' + Utilities.formatDate(d, TZ, 'dd.MM.'); var i = labels.indexOf(label); if (i < 0) return; sh.getRange(TR_ROW0 + i, 2, 1, 2).setValues([[per[day].a, per[day].c]]); written++; });
  if (written) Logger.log('call counts ' + loc + ': ' + written + ' day rows filled');
}
function lastFlowA(sh) { // lead id -> { A1: Date sent, A2: Date, A3: Date } from the Dry run rows (later: the real outbox)
  var m = {}, n = sh.getLastRow(); if (n < TR_ROW0) return m;
  sh.getRange(TR_ROW0, 1, n - TR_ROW0 + 1, HEAD.length).getValues().forEach(function (r) { var k = String(r[10] || '').split(':'); if (k[0] !== 'A' || k.length < 3) return; var id = k.slice(2).join(':'), when = r[2] instanceof Date ? r[2] : new Date(String(r[2]).replace(' ', 'T') + ':00'); if (isNaN(when.getTime())) when = r[0] instanceof Date ? r[0] : new Date(); (m[id] = m[id] || {})[k[1]] = when; });
  return m;
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
function waRewriteLog() { // one-off (Ruben 10.09.): rewrite the old Retry-log lines into the three events (paid on / voided, no payment found / retried by hand); lines without an event are removed
  var log = SpreadsheetApp.openById(WA_ID).getSheetByName('Retry log'), n = log.getLastRow();
  if (!log || n < 3) { Logger.log('nothing to rewrite'); return; }
  var v = log.getRange(3, 1, n - 2, 9).getValues(), conv = {}, del = [];
  v.forEach(function (r, i) {
    var date = dOf(r[0]), done = String(r[6]).toLowerCase() === 'yes', ev = String(r[8] || ''), note = cleanNote(r[7]), nu = '';
    if (/^(retried by hand on|paid on|voided, no payment found)/.test(ev)) nu = ev;
    else if (/^invoice paid on/.test(ev)) nu = ev.replace(/^invoice paid on/, 'paid on');
    else if (/^left the list/.test(ev)) nu = 'voided, no payment found';
    else if (done) nu = 'retried by hand on ' + date; // old daily archive ("still open", "no open invoice left", "no longer listed") with a tick
    if (!nu) { del.push(3 + i); return; }
    conv[ev.slice(0, 20) + ' -> ' + nu.slice(0, 20)] = (conv[ev.slice(0, 20) + ' -> ' + nu.slice(0, 20)] || 0) + 1;
    if (nu !== ev || note !== String(r[7] || '')) log.getRange(3 + i, 8, 1, 2).setValues([[note, nu]]);
  });
  del.reverse().forEach(function (row) { log.deleteRow(row); });
  Logger.log('rewrite: ' + JSON.stringify(conv) + ' | removed ' + del.length + ' lines without an event');
}
function waProbeGaps() { // one-off (Ruben 10.09.): which debts could the current method miss? log only, no names
  var today = fmtD(new Date()), out = {};
  ['uncollectible', 'draft', 'scheduled', 'past_due'].forEach(function (st) { var b = cfPost({ action: 'invoices', status: st, past_due: false, per: 100 }); out[st] = b ? { count: b.count, total: b.meta && b.meta.total, sample: (b.rows || []).slice(0, 5).map(function (i) { return [i.collection_method, 'att=' + i.attempt_count, 'due=' + i.amount_due, 'cr=' + (i.created_at ? fmtD(new Date(i.created_at * 1000)) : ''), 'sub=' + (i.subscription_id ? 'S' : '-')].join(' '); }) } : 'error'; });
  var open = fetchInvoices('open', 5) || [];
  var att0 = open.filter(function (i) { return i.collection_method !== 'send_invoice' && !(Number(i.attempt_count) || 0); });
  out.open_att0 = { count: att0.length, olderThan2d: att0.filter(function (i) { return i.created_at && daysBetween(fmtD(new Date(i.created_at * 1000)), today) > 2; }).map(function (i) { return 'u=' + i.user_id + ' cr=' + fmtD(new Date(i.created_at * 1000)) + ' due=' + i.amount_due + ' sub=' + (i.subscription_id ? 'S' : '-') + ' pm=' + (i.payment_method_id ? 'yes' : 'none') + ' cd=' + (i.charge_date ? fmtD(new Date(i.charge_date * 1000)) : '-'); }) };
  out.partial = open.filter(function (i) { return (Number(i.amount_paid) || 0) > 0; }).map(function (i) { return 'u=' + i.user_id + ' due=' + i.amount_due + ' paid=' + i.amount_paid + ' rem=' + i.amount_remaining; });
  var byU = {}; open.forEach(function (i) { var u = String(i.user_id); (byU[u] = byU[u] || []).push(i); });
  out.mixed = Object.keys(byU).filter(function (u) { var l = byU[u]; return l.some(function (i) { return i.collection_method === 'send_invoice'; }) && l.some(function (i) { return i.collection_method !== 'send_invoice' && (Number(i.attempt_count) || 0) > 0; }); }).map(function (u) { return 'u=' + u + ' ' + byU[u].map(function (i) { return (i.collection_method === 'send_invoice' ? 'SENT' : 'auto') + ':' + i.amount_due; }).join(','); });
  var fails = [], seen = {};
  for (var page = 1; page <= 2; page++) { var b = cfPost({ action: 'charges', status: 'failed', per: 200, page: page }); if (!b) break; (b.rows || []).forEach(function (c) { fails.push(c); }); if ((b.rows || []).length < 200) break; }
  var noSub = fails.filter(function (c) { return !c.subscription_id; });
  out.failed_no_subscription = { count: noSub.length, sample: noSub.slice(0, 12).map(function (c) { return 'u=' + c.user_id + ' ' + fmtD(new Date(c.created_at * 1000)) + ' ' + c.amount + ' ' + String(c.description || c.item_name || '').slice(0, 30) + ' purchase=' + (c.purchase_id ? 'yes' : '-'); }) };
  var keys = open.length ? Object.keys(open[0]) : []; out.invoice_keys_amount = keys.filter(function (k) { return /amount|remaining|balance|paid/.test(k); });
  var txt = JSON.stringify(out); for (var i = 0; i < txt.length; i += 1500) Logger.log('G' + (i / 1500) + ' ' + txt.slice(i, i + 1500));
}
function reviewCandidates(today) { // members whose first visit lies inside the window and who have >= RULE_R.N completed check-ins since; null = report error
  var start = addDs(today, -RULE_R.WIN_D), fv = {}, out = [];
  for (var i = 0; i < RULE_R.LOCS.length; i++) {
    var loc = RULE_R.LOCS[i], rows = fetchReport('clients_first_visit', start, today, 3000, ['User ID', 'First Name', 'Last Name', 'Start Time'], LOC_ID[loc]); if (rows === null) return null;
    rows.forEach(function (r) { var u = String(r['User ID'] || '').replace(/\D/g, ''), d = chDateUTC(r['Start Time']); if (u && d && d >= start) fv[u] = { name: ((r['First Name'] || '') + ' ' + (r['Last Name'] || '')).trim(), first: d, loc: loc }; });
  }
  if (!Object.keys(fv).length) { Logger.log('review candidates: no first visits since ' + start); return out; }
  var vis = [];
  for (var k = 0; k < RULE_R.LOCS.length; k++) { var part = fetchReport('detailed_visits', start, today, 5000, ['User ID', 'Start Time', 'Status', 'Primary Staff', 'Secondary Staff'], LOC_ID[RULE_R.LOCS[k]]); if (part === null) return null; vis = vis.concat(part); } // per location (package location filter): 45 days Zurich = ~4200 rows, ready in ~11 s
  var by = {}, staff = {};
  vis.forEach(function (r) { [r['Primary Staff'], r['Secondary Staff']].forEach(function (x) { if (x) String(x).split(',').forEach(function (n) { staff[nname(n)] = true; }); }); if (String(r.Status || '') !== 'Completed') return; var u = String(r['User ID'] || '').replace(/\D/g, ''); if (!fv[u]) return; var d = chDateUTC(r['Start Time']); if (d && d >= fv[u].first) (by[u] = by[u] || []).push(d); });
  Object.keys(by).forEach(function (u) { var ds = by[u].sort(); if (ds.length >= RULE_R.N && !staff[nname(fv[u].name)]) out.push({ uid: u, name: fv[u].name, loc: fv[u].loc, first: fv[u].first, count: ds.length, nth: ds[RULE_R.N - 1] }); });
  Logger.log('review candidates: ' + Object.keys(fv).length + ' first visits since ' + start + ', ' + vis.length + ' visit rows, ' + out.length + ' members with >= ' + RULE_R.N + ' check-ins, due today/yesterday: ' + out.filter(function (c) { return c.nth >= addDs(today, -1); }).length);
  return out;
}
function chDateUTC(v) { // report stamps "2026-08-07 12:07:00 +0000" (UTC) -> Swiss date; other formats via dOfAny
  var s = String(v || '').trim(), m = /^(\d{4})[\/-](\d{2})[\/-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?\s*(?:\+0000|UTC|Z)$/.exec(s);
  if (m) return fmtD(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0))));
  return dOfAny(v);
}
function setStage(ss, id, name, stageId, stageName, reason, onlyFrom) { // one lifecycle change via /api/wa (server checks the current stage against onlyFrom), logged in tab "Stage log"; once per id + stage. id = exercise.com user id or the lead's e-mail
  var log = stageLog(ss), key = String(id || '').toLowerCase().trim() + ':' + stageId; if (!id || log.done[key]) return 'already';
  var b = cfPost(Object.assign({ action: 'set_lifecycle', stage_id: stageId, only_from: onlyFrom || LEAD_STAGES }, /@/.test(String(id)) ? { email: String(id).toLowerCase().trim() } : { uid: id }));
  var res = !b ? 'error' : (b.skipped ? 'skipped (' + b.lifecycle + ')' : (b.unchanged ? 'unchanged' : (b.ok ? 'set' : (b.error === 'client_not_found' ? 'skipped (not in exercise.com)' : 'failed ' + (b.status || b.error)))));
  log.sh.appendRow([fmtEuDT(new Date()), id, name || '', b ? (b.before || b.lifecycle || '') : '', stageName, res, reason || '']);
  if (/^(set|unchanged|skipped)/.test(res)) log.done[key] = true;
  return res;
}
function stageLog(ssIgnored) { // tab "Stage log" in Team KPIs (Ruben 10.09.: where Abdi and Bogdan work): one line per lifecycle change the automation made (or refused); done = uid:stageId already handled
  var ss = SpreadsheetApp.openById(TEAM_ID), sh = ss.getSheetByName('Stage log'), done = {};
  if (!sh) { sh = ss.insertSheet('Stage log'); sh.getRange('A1').setValue('Stage log: every lifecycle stage the automation set in exercise.com (or refused: "skipped" = the client was in a protected stage such as Client / Do Not Contact / Debt collection). Read-only.').setFontColor('#666666'); sh.getRange(2, 1, 1, 7).setValues([['Date', 'UID', 'Name', 'From', 'To', 'Result', 'Reason']]).setFontWeight('bold').setBackground('#f3f3f3'); sh.setFrozenRows(2); [120, 80, 180, 130, 130, 120, 300].forEach(function (w, i) { sh.setColumnWidth(1 + i, w); }); }
  var n = sh.getLastRow(); if (n >= 3) sh.getRange(3, 1, n - 2, 7).getValues().forEach(function (r) { var u = String(r[1] || '').toLowerCase().trim(), to = String(r[4] || ''), res = String(r[5] || ''); var id = Object.keys(STAGE).filter(function (k) { return STAGE_NAME[k] === to; }).map(function (k) { return STAGE[k]; })[0]; if (u && id && /^(set|unchanged|skipped)/.test(res)) done[u + ':' + id] = true; });
  return { sh: sh, done: done };
}
var STAGE_NAME = { lead: 'Lead', first: 'First Contact', second: 'Second Contact', third: 'Third Contact', trialBooked: 'Trial Booked', pending: 'Pending Decision', lost: 'Not Interested (Lost)', noshow: 're-engage no-shows', cancelled: 're-engage cancelled trial', debt: 'Debt collection' };
function waProbeStage() { // one-off (10.09.): test the stage change on a TEST lead from the Leads Log (rows marked as test): read, set First Contact, set back; log only
  var tests = readLeads().filter(function (l) { return l.test && l.email; }).map(function (l) { return l.email; });
  Logger.log('test leads in the Leads Log: ' + tests.length);
  var f = null;
  for (var i = tests.length - 1; i >= 0 && !(f && f.ok); i--) { f = cfPost({ action: 'find_client', email: tests[i] }); Logger.log('find ' + tests[i].replace(/^(..)[^@]*@/, '$1***@') + ': ' + (f ? (f.ok ? f.name + ' / stage "' + f.lifecycle + '" cid ' + f.cid + ' uid ' + f.uid : f.error) : 'null')); }
  if (!f || !f.ok) return;
  var a = cfPost({ action: 'set_lifecycle', uid: f.uid, email: f.email, stage_id: STAGE.first, only_from: LEAD_STAGES }); Logger.log('set First Contact: ' + JSON.stringify(a).slice(0, 300));
  var back = f.lifecycle_stage_id || STAGE.lead, b = cfPost({ action: 'set_lifecycle', uid: f.uid, email: f.email, stage_id: back, only_from: [] }); Logger.log('set back to "' + (f.lifecycle || 'Lead') + '": ' + JSON.stringify(b).slice(0, 300));
}
function waEuDates() { // one-off (Ruben 10.09.): existing rows to European dates: Dry run A (date) + C (would send) become real dates formatted dd.MM.yyyy; Retry log A + F, Summary
  var ss = SpreadsheetApp.openById(WA_ID), dry = ss.getSheetByName('Dry run'), n = dry.getLastRow(), conv = 0;
  if (n >= TR_ROW0) {
    var v = dry.getRange(TR_ROW0, 1, n - TR_ROW0 + 1, 3).getValues();
    var out = v.map(function (r) { var a = r[0], c = r[2]; if (!(a instanceof Date)) { var iso = dOf(a); if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) { a = new Date(iso + 'T00:00:00' + Utilities.formatDate(new Date(iso + 'T12:00:00'), TZ, 'XXX')); conv++; } } if (!(c instanceof Date)) { var m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/.exec(String(c || '')); if (m) { c = new Date(m[1] + 'T' + m[2] + ':00' + Utilities.formatDate(new Date(m[1] + 'T12:00:00'), TZ, 'XXX')); conv++; } } return [a, r[1], c]; });
    dry.getRange(TR_ROW0, 1, out.length, 3).setValues(out); dry.getRange(TR_ROW0, 1, out.length, 1).setNumberFormat('dd.MM.yyyy'); dry.getRange(TR_ROW0, 3, out.length, 1).setNumberFormat('dd.MM.yyyy HH:mm');
  }
  var log = ss.getSheetByName('Retry log'), ln = log ? log.getLastRow() : 0;
  if (log && ln >= 3) { var lv = log.getRange(3, 1, ln - 2, 9).getValues(); lv.forEach(function (r) { r[0] = r[0] instanceof Date ? fmtEuD(r[0]) : euD(dOf(r[0])); r[5] = r[5] instanceof Date ? fmtEuD(r[5]) : euD(dOf(r[5])); r[8] = String(r[8] || '').replace(/(\d{4})-(\d{2})-(\d{2})/g, '$3.$2.$1'); }); log.getRange(3, 1, lv.length, 9).setValues(lv); log.getRange(3, 1, lv.length, 1).setNumberFormat('@'); log.getRange(3, 6, lv.length, 1).setNumberFormat('@'); }
  var su = ss.getSheetByName('Summary'); if (su) su.getRange('A3:A400').setNumberFormat('dd.MM.yyyy');
  Logger.log('EU dates: ' + conv + ' dry-run cells converted, retry log ' + (ln >= 3 ? ln - 2 : 0) + ' rows rewritten');
}
function installDryRunTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'waDryRunHourly') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('waDryRunHourly').timeBased().everyHours(1).create();
}
function waRestructureDoc() { // one-off (Ruben 10.09.): Google Doc "WhatsApp Messages IMPACT": A1/M1, A2/M2, A3/M3 in ONE table (rows: When | DE | EN, the id as bold first line of the message), no ID and no Status column (Ruben gives the go in the chat)
  var body = DocumentApp.openById('1EwWEOWUgU1YpO9Ee18DpJTuxuIqcQAmglqPVm65K0VY').getBody(), SEP = '\x1f';
  function cells(r) { var o = []; for (var i = 0; i < r.getNumCells(); i++) o.push(r.getCell(i).getText().trim()); return o; }
  function info(t) { for (var i = 0; i < t.getNumRows(); i++) { var h = cells(t.getRow(i)); if (h[0] === 'ID') return { h: i, hdr: h }; } return null; } // the header row is not always row 0 (tables carry an empty first row)
  function rowsOf(t, from) { var out = []; for (var i = from + 1; i < t.getNumRows(); i++) out.push(cells(t.getRow(i))); return out; }
  var tA = null, tM = null, iA = null, iM = null;
  body.getTables().forEach(function (t, n) { var f = info(t); Logger.log('table ' + n + ': rows ' + t.getNumRows() + ', header row ' + (f ? f.h + ' ' + f.hdr.join('|') : 'none, row0=' + cells(t.getRow(0)).join('|'))); if (!f) return; var ids = rowsOf(t, f.h).map(function (r) { return r[0]; }); if (ids.indexOf('A1') >= 0) { tA = t; iA = f; } if (ids.indexOf('M1') >= 0) { tM = t; iM = f; } });
  if (!tA || !tM) throw new Error('tables not found: A=' + !!tA + ' M=' + !!tM);
  var A = {}, M = {}; rowsOf(tA, iA.h).forEach(function (r) { A[r[0]] = r; }); rowsOf(tM, iM.h).forEach(function (r) { M[r[0]] = r; });
  var spec = [['When', 'DE', 'EN']];
  ['1', '2', '3'].forEach(function (n) { [A['A' + n], M['M' + n]].forEach(function (r) { spec.push([r[1], r[0] + SEP + r[2], r[0] + SEP + r[3]]); }); });
  var nt = body.insertTable(body.getChildIndex(tA), spec.map(function (r) { return r.map(function (c) { return c.split(SEP)[0]; }); }));
  for (var i = 0; i < nt.getNumRows(); i++) for (var j = 0; j < 3; j++) {
    var cell = nt.getRow(i).getCell(j), parts = spec[i][j].split(SEP);
    if (i === 0) { cell.editAsText().setBold(true); continue; }
    if (parts.length === 2) { cell.getChild(0).asParagraph().editAsText().setBold(true); cell.appendParagraph(parts[1]).editAsText().setBold(false); }
  }
  body.removeChild(tA);
  body.insertParagraph(body.getChildIndex(tM), 'The texts M1 to M3 are listed in the Flow A table above, each directly below its automatic counterpart (A1 / M1, A2 / M2, A3 / M3).');
  body.removeChild(tM);
  var dropped = 0;
  body.getTables().forEach(function (t) { var f = info(t); if (!f) return; var k = f.hdr.indexOf('Status'); if (k < 0) return; for (var i = 0; i < t.getNumRows(); i++) { var r = t.getRow(i); if (r.getNumCells() > k) r.removeCell(k); } dropped++; });
  body.replaceText('and set the Status column to "Approved" when a message may go live\\. Version 8 Sep 2026, evening\\.', '. Ruben gives the go per message in the chat, there is no Status column any more. Version 10 Sep 2026.');
  Logger.log('doc restructured: Flow A table rebuilt with ' + (nt.getNumRows() - 1) + ' rows, manual table removed, Status column dropped in ' + dropped + ' tables');
}
function waProbeVisits() { // one-off (10.09.): why does detailed_visits come back empty via /api/wa (refreshing=false, rows=0, filters='')? log only
  var today = fmtD(new Date());
  [[45, 5000, true, 2508], [60, 5000, true, 2508], [60, 10000, true, 0]].forEach(function (t) { // window days, per, refresh, location_id (probe 2: does a 45/60-day window fit, is per 10000 accepted?)
    var t0 = Date.now(), b = cfPost({ action: 'report', key: 'detailed_visits', start: addDs(today, -t[0]), end: today, per: t[1], refresh: t[2], sample: 1, location_id: t[3] || undefined }); Logger.log('V ' + JSON.stringify(t) + ' took ' + Math.round((Date.now() - t0) / 1000) + ' s');
    if (!b) { Logger.log('V ' + JSON.stringify(t) + ' -> null (see log above)'); return; }
    Logger.log('V ' + JSON.stringify(t) + ' -> ready=' + b.ready + ' refreshing=' + b.refreshing + ' count=' + b.count + ' filters=' + String(b.filters || '').slice(0, 160) + ' headers=' + JSON.stringify(b.headers || []).slice(0, 300) + ' top=' + JSON.stringify(b.top || []) + ' sample=' + JSON.stringify(b.sample || []).slice(0, 400));
  });
  var f = cfPost({ action: 'report', key: 'clients_first_visit', start: addDs(today, -60), end: today, per: 3000, refresh: false, sample: 1, location_id: 2508 });
  Logger.log('FV -> ' + (f ? 'ready=' + f.ready + ' refreshing=' + f.refreshing + ' count=' + f.count + ' filters=' + String(f.filters || '').slice(0, 160) + ' headers=' + JSON.stringify(f.headers || []).slice(0, 300) : 'null'));
}
function waProbeLifecycle() { // one-off (10.09.): which lifecycle stages exist in exercise.com (id + name)? read-only, log only
  var b = cfPost({ action: 'lifecycle_stages' });
  if (!b) { Logger.log('lifecycle_stages: null'); return; }
  Logger.log('lifecycle_stages source=' + b.source + ' tried=' + JSON.stringify(b.tried));
  (b.stages || []).forEach(function (s) { Logger.log('STAGE ' + s.id + ' | ' + s.name + ' | pos ' + s.position); });
}
function waDocAddFlowX() { // one-off (Ruben 10.09.): add "Flow X: Cancelled trial" (heading, trigger paragraph, table with X1) to the Google Doc "WhatsApp Messages IMPACT", right after the Flow D table
  var body = DocumentApp.openById('1EwWEOWUgU1YpO9Ee18DpJTuxuIqcQAmglqPVm65K0VY').getBody();
  if (body.findText('Flow X: Cancelled trial')) { Logger.log('Flow X already in the doc'); return; }
  var tD = null; body.getTables().forEach(function (t) { for (var i = 0; i < t.getNumRows(); i++) if (t.getRow(i).getCell(0).getText().trim() === 'D1') tD = t; });
  if (!tD) throw new Error('Flow D table not found');
  var at = body.getChildIndex(tD) + 1;
  var tbl = body.insertTable(at, [['ID', 'When', 'DE', 'EN'], ['X1', 'Next send window after a booked trial was cancelled, no new booking', TEXT.X1.de, TEXT.X1.en]]);
  for (var j = 0; j < 4; j++) tbl.getRow(0).getCell(j).editAsText().setBold(true);
  body.insertParagraph(at, 'Trigger: a booked trial is cancelled in exercise.com and no new trial is booked. One message in the next send window, once per cancelled trial. Stage in exercise.com: re-engage cancelled trial (set by the automation after the go-live). The team proposes the new date.');
  body.insertParagraph(at, 'Flow X: Cancelled trial').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  Logger.log('Flow X added to the doc (draft text by Claude, Ruben decides)');
}
