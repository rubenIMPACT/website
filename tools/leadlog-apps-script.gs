// IMPACT Website Lead Log - Google Apps Script (Webapp) - Version 29 (04.09.2026)
// Projekt "IMPACT Website Lead Log" in script.google.com (ruben@impact-martialarts.com)
// Kopie dieses Codes ohne Token liegt im Website-Repo unter tools/leadlog-apps-script.gs.
//
// Aufgaben:
//  1. doPost: Leads (vom Cloudflare-Endpunkt /api/lead) ins Tab "Leads" schreiben + Mail-Routing
//  2. doPost: Trainingsplaene (vom Endpunkt /api/plan) ins Tab "Trainingsplan" schreiben + Mail bei bekanntem Lead
//  2b. doPost: Formulare ohne CRM (kind=event / cancellation vom Endpunkt /api/form) in die Tabs "Events" / "Kündigungen" (logForm, aus v5 des Events-Chats uebernommen)
//  3. setupAnalyse(): Tabs "Analyse", "Trainingsplan-Analyse", "Leads Historie", "Daten", "PlanDaten" anlegen/erneuern (einmalig manuell ausfuehren)
//  4. repairPhones(): alte "#ERROR!"-Telefonzellen reparieren (einmalig manuell ausfuehren)
//
// Nach dem Einfuegen: Bereitstellen > Bereitstellung verwalten > Bearbeiten > Version "Neue Version" > Bereitstellen.
// Die Webapp-URL bleibt dabei gleich (LEADLOG_URL in Cloudflare muss nicht geaendert werden).

var SHEET_ID = '1nlA8MOSqYFwj-rI0SYRFh06-VmMTdoUPYEsHf3zwtlE';
var TOKEN = 'HIER_DEN_BISHERIGEN_TOKEN_EINSETZEN'; // Zeile "var TOKEN = ..." aus dem bisherigen Script uebernehmen
var MAIL = { zh: 'abdi@impact-martialarts.com', wt: 'bogdan@impact-martialarts.com', fallback: 'ruben@impact-martialarts.com' };
var TZ = 'Europe/Zurich';

var LEAD_HEAD = ['Zeitpunkt', 'Status', 'Vorname', 'Nachname', 'E-Mail', 'Telefon', 'Standort', 'Interesse', 'Erfahrung', 'Kind', 'Kind-Alter', 'Nachricht', 'Quelle', 'Seite', 'gclid', 'fbclid', 'Referrer', 'Details', 'Technik', 'Ausschluss', 'ttclid', 'utm_source', 'utm_medium', 'utm_campaign']; // ab 04.09.2026: ttclid + UTM fuer die Kanal-Zuordnung (Funnel)
var PLAN_HEAD = ['Zeitpunkt', 'Sitzung', 'Quelle', 'Standort', 'Ziel', 'Kampfkunst', 'Level', 'Tage/Woche', 'Zeitfenster', 'Nebensport', 'Nebensport/Woche', 'Sessions', 'Mitgliedschaft', 'Plan', 'Link', 'Lead-ID', 'Vorname', 'Nachname', 'E-Mail', 'Seite'];
var INTERESTS = ['MMA', 'Muay Thai', 'BJJ', 'Fitness Kickboxen', 'Boxen', 'Ringen', 'Street Defense', 'Little Ninjas', 'Personal Training'];
var HISTORY = [ // manuell ermittelte Leads pro Monat (Ruben, Stand 02.09.2026)
  ['2026-01-01', 210, 164], ['2026-02-01', 189, 120], ['2026-03-01', 222, 138], ['2026-04-01', 185, 115],
  ['2026-05-01', 216, 88], ['2026-06-01', 182, 90], ['2026-07-01', 204, 96], ['2026-08-01', 298, 149]
];
var LOG_START = '2026-09-01'; // ab hier kommen die Monatszahlen aus dem Log statt aus der Historie

// ---------------------------------------------------------------- Webapp
function doPost(e) {
  try {
    var p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (p.token !== TOKEN) return out({ error: 'unauthorized' });
    var ss = SpreadsheetApp.openById(SHEET_ID);
    try { if (ss.getSpreadsheetTimeZone() !== TZ) ss.setSpreadsheetTimeZone(TZ); } catch (tz) {}
    if (p.kind === 'event' || p.kind === 'cancellation') return out(logForm(ss, p));
    if (p.type === 'plan') return out(logPlan(ss, p));
    return out(logLead(ss, p));
  } catch (err) {
    return out({ error: String(err) });
  }
}
function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function s(v) { return v == null ? '' : String(v); }
function asText(v) { v = s(v); return v && /^[=+\-@']/.test(v) ? "'" + v : v; } // nie als Formel interpretieren
function routeTo(location, firstname) {
  var loc = s(location).toLowerCase();
  var to = /winterthur/.test(loc) ? MAIL.wt : (/z(u|ü)rich/.test(loc) ? MAIL.zh : MAIL.fallback);
  if (/^testlead/i.test(s(firstname))) to = MAIL.fallback; // Testschutz: Testleads immer an Ruben
  return to;
}

// ---------------------------------------------------------------- Tabs
function leadsSheet(ss) {
  var sh = ss.getSheetByName('Leads');
  if (!sh) { sh = ss.getSheets()[0]; if (sh.getName() !== 'Leads') sh.setName('Leads'); }
  if (sh.getLastRow() === 0) { sh.appendRow(LEAD_HEAD); sh.setFrozenRows(1); }
  // Kopfzeile ergaenzen (Technik, Ausschluss), Telefon-Spalte immer Text
  var head = sh.getRange(1, 1, 1, LEAD_HEAD.length).getValues()[0];
  for (var i = 0; i < LEAD_HEAD.length; i++) if (head[i] !== LEAD_HEAD[i]) sh.getRange(1, i + 1).setValue(LEAD_HEAD[i]);
  sh.getRange(1, 1, 1, LEAD_HEAD.length).setFontWeight('bold');
  sh.getRange('F:F').setNumberFormat('@');
  return sh;
}
// Trainingsplan-Tab (frueher planSheet; umbenannt 03.09.2026, weil der Events-Teil eine eigene Funktion planSheet(sheet) hat)
function planLogSheet(ss) {
  var sh = ss.getSheetByName('Trainingsplan');
  if (!sh) { sh = ss.insertSheet('Trainingsplan'); }
  if (sh.getLastRow() === 0) { sh.appendRow(PLAN_HEAD); sh.getRange(1, 1, 1, PLAN_HEAD.length).setFontWeight('bold'); sh.setFrozenRows(1); }
  sh.getRange('N:O').setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP); // Plan/Link abschneiden statt in leere Nachbarzellen laufen
  return sh;
}

// ---------------------------------------------------------------- Leads
function logLead(ss, p) {
  var sh = leadsSheet(ss);
  var d = p.data || {};
  sh.appendRow([new Date(), s(p.status), asText(d.firstname), asText(d.lastname), asText(d.email), asText(d.phone),
    s(d.location), s(d.discipline), s(d.experience), asText(d.kid_name), s(d.kid_age), asText(d.message),
    asText(d.source), s(d.page), s(d.gclid), s(d.fbclid), s(d.referrer), s(p.detail), s(p.tech), '', s(d.ttclid), s(d.utm_source), s(d.utm_medium), s(d.utm_campaign)]);
  if (p.alert) {
    var to = routeTo(d.location, d.firstname);
    var lc = s(p.locchange);
    if (lc && !/^testlead/i.test(s(d.firstname))) to = MAIL.zh + ',' + MAIL.wt;
    var isDup = /^dublette/.test(s(p.status));
    var name = (s(d.firstname) + ' ' + s(d.lastname)).trim();
    var subject = isDup
      ? '[Website] ' + (lc ? 'STANDORTWECHSEL ' + lc + ': ' : 'Erneute Anfrage: ') + name + ' (' + (d.location || '?') + ' / ' + (d.discipline || '?') + ')'
      : '[Website] Lead NICHT im CRM: ' + name + ' (' + (d.location || '?') + ')';
    var intro = lc
      ? 'STANDORTWECHSEL ' + lc + ': Diese Person hat zuerst am anderen Standort angefragt und meldet sich jetzt fuer ' + (d.location || '?') + '. Der Kontakt in exercise.com wurde auf den neuen Standort umgestellt. Bitte untereinander abstimmen, wer den Lead betreut.\n\n'
      : '';
    var what = isDup
      ? 'Diese Person hat sich erneut ueber die Website gemeldet.'
      : 'ACHTUNG: Dieser Lead konnte NICHT in exercise.com angelegt werden. Bitte manuell erfassen und kontaktieren.';
    var body = intro + what +
      '\n\nName: ' + name + '\nE-Mail: ' + (d.email || '-') + '\nTelefon: ' + (d.phone || '-') +
      '\nStandort: ' + (d.location || '-') + '\nInteresse: ' + (d.discipline || '-') +
      (d.experience ? '\nErfahrung: ' + d.experience : '') +
      (d.kid_name || d.kid_age ? '\nKind: ' + (s(d.kid_name) + ' ' + s(d.kid_age)).trim() : '') +
      '\nNachricht: ' + (d.message || '-') + '\nSeite: ' + (d.page || '-') +
      '\n\nStatus: ' + (p.detail || '-') +
      '\nLog: ' + ss.getUrl();
    MailApp.sendEmail({ to: to, subject: subject, body: body });
  }
  return { ok: true };
}

// ---------------------------------------------------------------- Trainingsplan
function planKey(leadId, sid) { return leadId ? 'L' + leadId : (sid ? 'S' + sid : ''); }
// Entfernt aeltere Zeilen derselben Person (Lead-ID, sonst Sitzung), damit pro Person nur der letzte Plan im Tab steht (Entscheid Ruben 03.09.2026)
function dropOlderPlans(sh, key) {
  if (!key || sh.getLastRow() < 2) return 0;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 16).getValues(), del = [];
  for (var i = 0; i < v.length; i++) if (planKey(s(v[i][15]), s(v[i][1])) === key) del.push(i + 2);
  for (var j = del.length - 1; j >= 0; j--) sh.deleteRow(del[j]);
  return del.length;
}
// Einmalig: bestehende Share-Aufrufe (Quelle 'share') aus dem Tab Trainingsplan entfernen
function dropShareRows() {
  var ss = SpreadsheetApp.openById(SHEET_ID), sh = planLogSheet(ss);
  if (sh.getLastRow() < 2) return;
  var v = sh.getRange(2, 3, sh.getLastRow() - 1, 1).getValues(), del = [];
  for (var i = 0; i < v.length; i++) if (String(v[i][0]) === 'share') del.push(i + 2);
  for (var j = del.length - 1; j >= 0; j--) sh.deleteRow(del[j]);
  Logger.log('Trainingsplan: ' + del.length + ' Share-Aufrufe entfernt');
}
function dedupeTrainingsplan() {
  var sh = planLogSheet(SpreadsheetApp.openById(SHEET_ID));
  if (sh.getLastRow() < 2) return;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 16).getValues(), last = {}, del = [];
  for (var i = 0; i < v.length; i++) { var k = planKey(s(v[i][15]), s(v[i][1])); if (k) last[k] = i; }
  for (var i2 = 0; i2 < v.length; i2++) { var k2 = planKey(s(v[i2][15]), s(v[i2][1])); if (k2 && last[k2] !== i2) del.push(i2 + 2); }
  for (var j = del.length - 1; j >= 0; j--) sh.deleteRow(del[j]);
  Logger.log('Trainingsplan bereinigt: ' + del.length + ' aeltere Zeilen entfernt');
}

function logPlan(ss, p) {
  var sh = planLogSheet(ss);
  var d = p.data || {};
  if (s(d.src) === 'share') return { ok: true, skipped: 'share' }; // Aufrufe geteilter Links nicht loggen (Entscheid Ruben 03.09.2026)
  dropOlderPlans(sh, planKey(s(d.lead_id), s(d.sid)));
  sh.appendRow([new Date(), s(d.sid), s(d.src), s(d.location), s(d.goal), s(d.arts), s(d.level), s(d.freq), s(d.win), s(d.otype), s(d.ofreq),
    s(d.sessions), s(d.pkg), s(d.plan), s(d.share), s(d.lead_id), asText(d.firstname), asText(d.lastname), asText(d.email), s(d.page)]);
  if (p.alert && d.lead_id) {
    var to = routeTo(d.location, d.firstname);
    var name = (s(d.firstname) + ' ' + s(d.lastname)).trim() || 'Unbekannt';
    var subject = '[Website] Trainingsplan: ' + name + ' (' + (d.location || '?') + ' / ' + (d.arts || '?') + ')';
    var lines = ['Diese Person hat nach der Probetraining-Anfrage ihren Trainingsplan im Tool erstellt. Der Plan steht auch als Notiz im CRM-Kontakt.', '',
      'Name: ' + name, 'E-Mail: ' + (d.email || '-'), 'Standort: ' + (d.location || '-'),
      'Ziel: ' + (d.goal || '-'), 'Kampfkunst: ' + (d.arts || '-'), 'Level: ' + (d.level || '-'),
      'Tage pro Woche: ' + (d.freq || '-'), 'Zeitfenster: ' + (d.win || '-'), 'Nebensport: ' + (d.otype || '-') + (d.ofreq ? ' (' + d.ofreq + ')' : ''),
      '', 'Wochenplan (' + (d.sessions || '?') + ' Sessions):', s(d.plan).split(' | ').join('\n'),
      '', 'Plan oeffnen: ' + (d.share || '-'), 'Log: ' + ss.getUrl()];
    var html = lines.map(function (l) {
      if (l.indexOf('Plan oeffnen: ') === 0) return 'Plan oeffnen: <a href="' + d.share + '">' + d.share + '</a>';
      if (l.indexOf('Log: ') === 0) return 'Log: <a href="' + ss.getUrl() + '">' + ss.getUrl() + '</a>';
      return l.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    }).join('<br>');
    MailApp.sendEmail({ to: to, subject: subject, body: lines.join('\n'), htmlBody: html });
  }
  return { ok: true };
}

// ---------------------------------------------------------------- Formulare ohne CRM (Events, Kuendigungs-Feedback) - Spalten 1:1 wie v5 (02.09. 17:32)
function logForm(ss, p) {
  var d = p.data || {};
  var isEv = p.kind === 'event';
  var name = isEv ? 'Events' : 'Cancellations';
  if (!isEv && !ss.getSheetByName('Cancellations') && ss.getSheetByName('Kündigungen')) ss.getSheetByName('Kündigungen').setName('Cancellations'); // 04.09.: English
  var head = isEv ? ['Timestamp', 'Event', 'Date', 'Location', 'Name', 'Email', 'Phone', 'Friends', 'Language', 'Page', 'Event ID']
                  : ['Timestamp', 'Anonymous', 'First name', 'Last name', 'Reason', 'Expectations not met', 'Details expectations', 'Coach satisfaction', 'Details coaches', 'Break/timing', 'Details timing', 'Price influenced', 'Price to stay', 'Max price', 'Suggestions', 'Would rejoin', 'Details rejoin', 'Language'];
  var sh = ss.getSheetByName(name); if (!sh) { sh = ss.insertSheet(name); }
  if (sh.getLastRow() === 0) { sh.appendRow(head); sh.getRange(1, 1, 1, head.length).setFontWeight('bold'); sh.setFrozenRows(1); }
  else if (String(sh.getRange(1, 1).getValue()) === 'Zeitpunkt') { sh.getRange(1, 1, 1, head.length).setValues([head]); } // alte deutsche Kopfzeile auf Englisch umstellen
  var row = isEv ? [new Date(), s(d.event_title), s(d.event_date), s(d.location), asText(d.name), asText(d.email), asText(d.phone), s(d.friends), s(d.lang), s(d.page), s(d.event_id)]
                 : [new Date(), d.anonymous ? 'Yes' : 'No', asText(d.first_name), asText(d.last_name), asText(d.reason), s(d.expectations), asText(d.expectations_text), s(d.satisfaction), asText(d.satisfaction_text), s(d.timing), asText(d.timing_text), s(d.price), s(d.price_stay), s(d.price_max), asText(d.suggestions), s(d.rejoin), asText(d.rejoin_text), s(d.lang)];
  sh.appendRow(row);
  if (isEv) { // Freunde zaehlen als eigene Anmeldungen: je Freund eine Zeile "Friend" ohne Kontaktdaten (Ruben 04.09.)
    var nf = Math.min(parseInt(String(d.friends || '').replace(/[^0-9]/g, ''), 10) || 0, 10);
    for (var fi = 0; fi < nf; fi++) sh.appendRow([new Date(), s(d.event_title), s(d.event_date), s(d.location), 'Friend', '', '', 'Guest of ' + asText(d.name), s(d.lang), s(d.page), s(d.event_id)]);
    updateSignupCount(ss, d.event_id);
  }
  return { ok: true };
}

// ---------------------------------------------------------------- Reparatur alter Telefonzellen
function repairPhones() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = leadsSheet(ss);
  var n = sh.getLastRow(); if (n < 2) return;
  var rng = sh.getRange(2, 6, n - 1, 1);
  var f = rng.getFormulas(), v = rng.getValues(), fixed = 0;
  for (var i = 0; i < f.length; i++) {
    if (f[i][0]) { sh.getRange(i + 2, 6).setValue("'" + f[i][0].replace(/^=/, '')); fixed++; }
    else if (typeof v[i][0] === 'number') { sh.getRange(i + 2, 6).setValue("'" + v[i][0]); fixed++; }
  }
  Logger.log('Telefonzellen repariert: ' + fixed);
}

// ---------------------------------------------------------------- Analyse-Tabs (einmalig ausfuehren, spaeter beliebig wiederholbar)
function setupAnalyse() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  leadsSheet(ss); planLogSheet(ss);
  migrateHistorie(ss);
  buildDaten(ss);
  buildPlanDaten(ss);
  buildWochenreport(ss, teamSs());
  buildPlanAnalyse(ss);
  buildMonatsabschluss(ss);
  // Leads: gclid, fbclid, Referrer, Technik, Ausschluss ausblenden (Entscheid Ruben 02.09.2026), Details bleibt sichtbar
  var ls = leadsSheet(ss);
  ls.hideColumns(15, 3); // O, P, Q
  ls.hideColumns(19, 2); // S, T
  // Klassenanalyse-Tab (wird vom Skill impact-class-analysis befuellt)
  var ka = ss.getSheetByName('Klassenanalyse');
  if (!ka) { ka = ss.insertSheet('Klassenanalyse'); ka.getRange('A1').setValue('Klassenanalyse: wird monatlich vom Skill impact-class-analysis aus den exercise.com-Reports befuellt (Popular Services + Itemized Recurring Sessions).').setFontColor('#666666'); }
  // Reihenfolge von Ruben (03.09.2026). Tab-Namen: Analyse, Trainingsplan-Analyse, Leads Historie duerfen umbenannt werden (dann hier nachziehen); Leads, Trainingsplan, Events, Kündigungen, Klassenanalyse und die Hilfstabs NIE umbenennen (Webapp schreibt per Name).
  var order = ['Monatsabschluss', 'Wochenreport', 'Klassenanalyse', 'Kündigungsrisiko', 'Trainingsplan', 'Events', 'Trainingsplan-Analyse', 'Kündigungen', 'Cancellations', 'Leads', 'Daten', 'PlanDaten', 'KlassenHistorie', 'KlassenHistorieDisziplin', 'RisikoHistorie', 'MonatsHistorie', 'Kohorten'];
  var pos = 1;
  for (var i = 0; i < order.length; i++) { var sh = ss.getSheetByName(order[i]); if (sh) { ss.setActiveSheet(sh); ss.moveActiveSheet(pos); pos++; } }
  // Roh-Logs verstecken (Ruben 04.09.2026): ueber Ansicht > Ausgeblendete Tabellen jederzeit wieder einblendbar
  ['Leads', 'Trainingsplan'].forEach(function (n) { var h = ss.getSheetByName(n); if (h && !h.isSheetHidden()) h.hideSheet(); });
  ss.setActiveSheet(ss.getSheetByName('Monatsabschluss'));
}
function getOrCreate(ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); }
function clearSheet(sh) { var f = sh.getFilter(); if (f) f.remove(); sh.clear(); var cs = sh.getCharts(); for (var i = 0; i < cs.length; i++) sh.removeChart(cs[i]); }

// Leads Historie (manuelle Monatszahlen aus HISTORY) wandert in die MonatsHistorie (Kennzahl leads_web), der Tab entfaellt (Ruben 04.09.2026)
function migrateHistorie(ss) {
  for (var i = 0; i < HISTORY.length; i++) { var mk = HISTORY[i][0].slice(0, 7); maStoreMetrics(ss, mk, 'Zurich', { leads_web: HISTORY[i][1] }); maStoreMetrics(ss, mk, 'Winterthur', { leads_web: HISTORY[i][2] }); }
  ['Leads Historie', 'Historie', 'Leads-Analyse'].forEach(function (n) { var h = ss.getSheetByName(n); if (h && n !== 'Leads-Analyse') ss.deleteSheet(h); });
}

// Daten: Hilfsspalten pro Lead-Zeile (Datum, Woche, Monat, Standort, Interesse, Test, Zaehlt, Dublette, Fehler)
function buildDaten(ss) {
  var sh = getOrCreate(ss, 'Daten'); clearSheet(sh);
  sh.appendRow(['Datum', 'Woche', 'Monat', 'Standort', 'Interesse', 'Test', 'Zählt', 'Dublette', 'Fehler', 'Kanal']);
  var A = 'Leads!A2:A', B = 'LOWER(Leads!B2:B&"")', C = 'LOWER(Leads!C2:C&"")', E = 'LOWER(Leads!E2:E&"")', G = 'LOWER(Leads!G2:G&"")', H = 'LOWER(Leads!H2:H&"")';
  var blank = 'IF(' + A + '="","",';
  sh.getRange('A2').setFormula('=ARRAYFORMULA(' + blank + 'INT(' + A + ')))');
  sh.getRange('B2').setFormula('=ARRAYFORMULA(' + blank + 'INT(' + A + ')-WEEKDAY(INT(' + A + '),2)+1))');
  sh.getRange('C2').setFormula('=ARRAYFORMULA(' + blank + 'DATE(YEAR(' + A + '),MONTH(' + A + '),1)))');
  sh.getRange('D2').setFormula('=ARRAYFORMULA(' + blank + 'IF(REGEXMATCH(' + G + ',"winterthur"),"Winterthur",IF(REGEXMATCH(' + G + ',"z(u|ü)rich"),"Zürich",""))))');
  sh.getRange('E2').setFormula('=ARRAYFORMULA(' + blank +
    'IF(REGEXMATCH(' + H + ',"little ninjas|kids"),"Little Ninjas",' +
    'IF(REGEXMATCH(' + H + ',"muay|thai"),"Muay Thai",' +
    'IF(REGEXMATCH(' + H + ',"bjj|jiu"),"BJJ",' +
    'IF(REGEXMATCH(' + H + ',"kickbox|fitnessbox"),"Fitness Kickboxen",' +
    'IF(REGEXMATCH(' + H + ',"street|krav|defense|selbstverteidigung"),"Street Defense",' +
    'IF(REGEXMATCH(' + H + ',"ringen|wrestling"),"Ringen",' +
    'IF(REGEXMATCH(' + H + ',"personal"),"Personal Training",' +
    'IF(REGEXMATCH(' + H + ',"box"),"Boxen",' +
    'IF(REGEXMATCH(' + H + ',"mma"),"MMA","Andere")))))))))))');
  sh.getRange('F2').setFormula('=ARRAYFORMULA(' + blank + 'IF((REGEXMATCH(' + C + ',"^test")+REGEXMATCH(' + B + ',"^test")+REGEXMATCH(' + E + ',"^(testlead|test-endpunkt|test2@|paulinelowe12|waseasdasd)")+(' + E + '="ruben@impact-martialarts.com")+(Leads!T2:T<>""))>0,1,0)))');
  sh.getRange('G2').setFormula('=ARRAYFORMULA(' + blank + 'IF((' + B + '="ok")*(F2:F=0),1,0)))');
  sh.getRange('H2').setFormula('=ARRAYFORMULA(' + blank + 'IF(REGEXMATCH(' + B + ',"^dublette")*(F2:F=0),1,0)))');
  sh.getRange('I2').setFormula('=ARRAYFORMULA(' + blank + 'IF(REGEXMATCH(' + B + ',"^error")*(F2:F=0),1,0)))');
  // Kanal (seit 04.09.2026): Klick-IDs schlagen UTM, UTM schlaegt Referrer; gleiche Logik wie kanalOf() im Script
  var V = 'LOWER(Leads!V2:V&"")', Q = 'LOWER(Leads!Q2:Q&"")';
  sh.getRange('J2').setFormula('=ARRAYFORMULA(' + blank + 'IF(Leads!U2:U<>"","TikTok Ads",IF(Leads!O2:O<>"","Google Ads",IF(Leads!P2:P<>"","Meta Ads",IF(REGEXMATCH(' + V + ',"tiktok"),"TikTok Ads",IF(REGEXMATCH(' + V + ',"google"),"Google Ads",IF(REGEXMATCH(' + V + ',"facebook|meta|instagram|ig$"),"Meta Ads",IF(Leads!V2:V<>"","Andere",IF(REGEXMATCH(' + Q + ',"google"),"Google organisch",IF(REGEXMATCH(' + Q + ',"instagram|facebook|fb\\.com"),"Instagram/Facebook organisch",IF(REGEXMATCH(' + Q + ',"tiktok"),"TikTok organisch",IF((Leads!Q2:Q="")+REGEXMATCH(' + Q + ',"impact-martialarts"),"Direkt","Andere")))))))))))))');
  sh.getRange('A2:C').setNumberFormat('dd.mm.yyyy');
  sh.getRange(1, 1, 1, 10).setFontWeight('bold'); sh.setFrozenRows(1); sh.hideSheet();
}

// PlanDaten: Hilfsspalten pro Trainingsplan-Zeile. Alle Spalten, die die Auswertung zaehlt, liegen HIER,
// weil COUNTIFS nur gleich grosse Bereiche kombinieren kann und zwei Tabs nie garantiert gleich lang sind.
function buildPlanDaten(ss) {
  var sh = getOrCreate(ss, 'PlanDaten'); clearSheet(sh);
  sh.appendRow(['Datum', 'Monat', 'Letzte', 'Zählt', 'Standort', 'Ziel', 'Kampfkunst', 'Level', 'Tage/Woche', 'Zeitfenster', 'Nebensport', 'Nebensport/Woche', 'Lead-ID', 'Schlüssel']);
  var A = 'Trainingsplan!A2:A', blank = 'IF(' + A + '="","",';
  sh.getRange('A2').setFormula('=ARRAYFORMULA(' + blank + 'INT(' + A + ')))');
  sh.getRange('B2').setFormula('=ARRAYFORMULA(' + blank + 'DATE(YEAR(' + A + '),MONTH(' + A + '),1)))');
  // Schluessel = Person: CRM-Kennung (Lead-ID, Spalte P) wenn bekannt, sonst die Sitzung (Spalte B). Gezaehlt wird nur der letzte Plan je Schluessel (Entscheid Ruben 03.09.2026).
  sh.getRange('N2').setFormula('=ARRAYFORMULA(' + blank + 'IF(Trainingsplan!P2:P<>"","L"&Trainingsplan!P2:P,"S"&Trainingsplan!B2:B)))');
  // Nur Bereiche aus dem Tab Trainingsplan vergleichen (gleiche Laenge), sonst #VALUE!
  sh.getRange('C2').setFormula('=ARRAYFORMULA(' + blank + 'IF(IF(Trainingsplan!P2:P<>"",COUNTIFS(Trainingsplan!P2:P,Trainingsplan!P2:P&"",Trainingsplan!A2:A,">"&Trainingsplan!A2:A),COUNTIFS(Trainingsplan!B2:B,Trainingsplan!B2:B&"",Trainingsplan!A2:A,">"&Trainingsplan!A2:A))=0,1,0)))');
  sh.getRange('D2').setFormula('=ARRAYFORMULA(' + blank + 'IF((C2:C=1)*(LOWER(Trainingsplan!C2:C&"")<>"share")*(NOT(REGEXMATCH(LOWER(Trainingsplan!Q2:Q&""),"^test"))),1,0)))');
  var copy = { E: 'D', F: 'E', G: 'F', H: 'G', I: 'H', J: 'I', K: 'J', L: 'K', M: 'P' }; // Ziel <- Quelle (Trainingsplan)
  for (var c in copy) sh.getRange(c + '2').setFormula('=ARRAYFORMULA(' + blank + 'Trainingsplan!' + copy[c] + '2:' + copy[c] + '&""))');
  sh.getRange('A2:B').setNumberFormat('dd.mm.yyyy');
  sh.getRange(1, 1, 1, 14).setFontWeight('bold'); sh.setFrozenRows(1); sh.hideSheet();
}

// Wochenreport (seit 04.09.2026, ersetzt Leads-Analyse): der ganze Funnel pro Woche und Standort, als Werte aus Daten (Leads)
// und den Probetrainings-Tabs im Team-Sheet (Trials, No-Shows, Verkaeufe, Anrufe). Wird bei jedem Probetrainings-Lauf neu gebaut.
var WR_SHEET = 'Wochenreport', WR_WEEKS = 16, LEAD_WEEK0 = '2026-08-31';
var KANAL_ORDER = ['Google Ads', 'Meta Ads', 'TikTok Ads', 'Google organisch', 'Instagram/Facebook organisch', 'TikTok organisch', 'Direkt', 'Andere']; // Ruben 04.09.: kein X, Meta = Instagram
function kanalOf(gclid, fbclid, ttclid, utm, ref) {
  var u = String(utm || '').toLowerCase(), r = String(ref || '').toLowerCase();
  if (ttclid) return 'TikTok Ads'; if (gclid) return 'Google Ads'; if (fbclid) return 'Meta Ads';
  if (/tiktok/.test(u)) return 'TikTok Ads'; if (/google/.test(u)) return 'Google Ads'; if (/facebook|meta|instagram|ig$/.test(u)) return 'Meta Ads'; if (u) return 'Andere';
  if (/google/.test(r)) return 'Google organisch'; if (/instagram|facebook|fb\.com/.test(r)) return 'Instagram/Facebook organisch'; if (/tiktok/.test(r)) return 'TikTok organisch';
  if (!r || /impact-martialarts/.test(r)) return 'Direkt'; return 'Andere';
}
function mondayOf(d) { var t = new Date(d.getTime()); t.setHours(12, 0, 0, 0); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return t; }
function buildWochenreport(ss, team) {
  var old = ss.getSheetByName('Leads-Analyse'); if (old && !ss.getSheetByName(WR_SHEET)) old.setName(WR_SHEET);
  var sh = getOrCreate(ss, WR_SHEET); clearSheet(sh);
  if (sh.getMaxColumns() < 34) sh.insertColumnsAfter(sh.getMaxColumns(), 34 - sh.getMaxColumns());
  var today = fmtD(new Date()), blankW = function () { return { lz: 0, lw: 0, dup: 0, kanal: {}, inter: {}, t: { Zurich: 0, Winterthur: 0 }, ns: { Zurich: 0, Winterthur: 0 }, sold: { Zurich: 0, Winterthur: 0 }, csold: { Zurich: 0, Winterthur: 0 }, calls: { Zurich: 0, Winterthur: 0 } }; };
  var chkOpen = { Zurich: 0, Winterthur: 0 };
  var wk = {}, W = function (d) { var k = fmtD(mondayOf(new Date(d + 'T12:00:00'))); return wk[k] = wk[k] || blankW(); };
  // Leads aus Daten (B Woche, D Standort, E Interesse, G Zaehlt, H Dublette, J Kanal)
  var dn = ss.getSheetByName('Daten'), dv = dn && dn.getLastRow() > 1 ? dn.getRange(2, 1, dn.getLastRow() - 1, 10).getValues() : [];
  dv.forEach(function (r) { var d = dOfCell(r[1]); if (!d) return; var o = W(d); if (Number(r[6]) === 1) { if (r[3] === 'Zürich') o.lz++; else if (r[3] === 'Winterthur') o.lw++; var k = r[9] || 'Andere'; o.kanal[k] = (o.kanal[k] || 0) + 1; var it = r[4] || 'Andere'; o.inter[it] = (o.inter[it] || 0) + 1; } if (Number(r[7]) === 1) o.dup++; });
  // Trials aus dem Team-Sheet
  Object.keys(TR_SHEETS).forEach(function (loc) {
    var ts = team && team.getSheetByName(TR_SHEETS[loc]); if (!ts || ts.getLastRow() < TR_ROW0) return;
    var n = ts.getLastRow() - TR_ROW0 + 1;
    ts.getRange(TR_ROW0, 1, n, TR_DAY_N).getValues().forEach(function (r) { var d = dOfCell(r[DI.day]); if (!d) return; var o = W(d); o.t[loc] += Number(r[DI.trials]) || 0; o.ns[loc] += Number(r[DI.noshow]) || 0; o.sold[loc] += Number(r[DI.sold]) || 0; o.calls[loc] += Number(r[DI.conv]) || 0; });
    ts.getRange(TR_ROW0, TR_P0, n, TR_NCOL).getValues().forEach(function (r) { if (!r[CI.uid]) return; var d = dOfCell(r[CI.date]); if (d && trIsTrial(r) && dOfCell(r[CI.contract])) W(d).csold[loc] += trPers(r); if (r[CI.check]) chkOpen[loc]++; });
  });
  var weeks = [], m0 = mondayOf(new Date()); for (var i = WR_WEEKS - 1; i >= 0; i--) weeks.push(fmtD(addD(m0, -7 * i)));
  var dt = function (k) { return new Date(k + 'T12:00:00'); };
  sh.getRange('A1').setValue('IMPACT Wochenreport').setFontSize(16).setFontWeight('bold');
  sh.getRange('A2').setValue('Der ganze Funnel pro Woche (Montag bis Sonntag): Website-Leads aus dem Log (Status ok, ohne Dubletten, Tests, Ausschluss; vor dem 31.08.2026 leer), Trials, No-Shows und Verkäufe aus den Probetrainings-Tabs im Team-Sheet (Verkauft = Vertragsunterschriften in dieser Woche; Quote = Anteil der Trials dieser Woche, die bis heute abgeschlossen haben), Anrufe aus den Tagestabellen der Verkäufer; offene Prüfungen = Zeilen im Team-Sheet, bei denen Fakt und Lifecycle-Stage nicht zusammenpassen (Stand jetzt). Kanal = Klick-ID (Google, Meta, TikTok) oder UTM oder Referrer der Anfrage. Wird stündlich mit den Probetrainings aktualisiert.').setFontColor('#666666').setWrap(true);
  sh.getRange('A2:R2').merge(); sh.setRowHeight(2, 70);
  // Kennzahlen
  var kh = ['Zeitraum', 'Leads ZH', 'Leads WT', 'Leads', 'Trials ZH', 'Trials WT', 'Trials', 'Verkauft ZH', 'Verkauft WT', 'Verkauft', 'Anrufe geführt ZH', 'Anrufe geführt WT', 'Offene Prüfungen ZH', 'Offene Prüfungen WT'];
  sh.getRange(4, 1).setValue('Kennzahlen').setFontWeight('bold').setFontSize(12);
  sh.getRange(5, 1, 1, kh.length).setValues([kh]).setFontWeight('bold').setBackground('#f3f3f3');
  var kv = function (k) { var o = wk[k] || blankW(), pre = k < LEAD_WEEK0; return [pre ? '' : o.lz, pre ? '' : o.lw, pre ? '' : o.lz + o.lw, o.t.Zurich, o.t.Winterthur, o.t.Zurich + o.t.Winterthur, o.sold.Zurich, o.sold.Winterthur, o.sold.Zurich + o.sold.Winterthur, o.calls.Zurich, o.calls.Winterthur, '', '']; };
  var w0 = weeks[weeks.length - 1], w1 = weeks[weeks.length - 2], w2 = weeks[weeks.length - 3];
  var k1 = kv(w1), k2 = kv(w2), delta = k1.map(function (v, i) { return (v === '' || k2[i] === '' || !k2[i]) ? '' : (v - k2[i]) / k2[i]; });
  var k0 = kv(w0); k0[11] = chkOpen.Zurich; k0[12] = chkOpen.Winterthur;
  sh.getRange(6, 1, 4, kh.length).setValues([['Diese Woche (läuft noch)'].concat(k0), ['Letzte Woche'].concat(k1), ['Vorletzte Woche'].concat(k2), ['Δ letzte vs. vorletzte Woche'].concat(delta)]);
  sh.getRange(9, 2, 1, kh.length - 1).setNumberFormat('0%'); sh.getRange(9, 1, 1, kh.length).setFontWeight('bold');
  sh.getRange(6, 1, 4, kh.length).setBorder(true, true, true, true, true, true, '#dddddd', SpreadsheetApp.BorderStyle.SOLID);
  // Funnel-Tabelle
  var fh = ['Woche ab', 'bis', 'Status', 'Leads ZH', 'Leads WT', 'Leads', 'Δ% Leads', 'Dubletten', 'Trials ZH', 'Trials WT', 'Trials', 'No-Shows', 'Verkauft ZH', 'Verkauft WT', 'Verkauft', 'Quote (Trials der Woche)', 'Anrufe geführt ZH', 'Anrufe geführt WT'];
  var fHead = 12; sh.getRange(fHead - 1, 1).setValue('Funnel pro Woche (letzte ' + WR_WEEKS + ' Wochen)').setFontWeight('bold').setFontSize(12);
  sh.getRange(fHead, 1, 1, fh.length).setValues([fh]).setFontWeight('bold').setBackground('#f3f3f3');
  var frows = [], prevL = null;
  weeks.forEach(function (k, i) {
    var o = wk[k] || blankW(), pre = k < LEAD_WEEK0, end = fmtD(addD(dt(k), 6)), running = end >= today, L = o.lz + o.lw, T = o.t.Zurich + o.t.Winterthur, CS = o.csold.Zurich + o.csold.Winterthur;
    var dl = (pre || running || prevL === null || !prevL) ? '' : (L - prevL) / prevL; if (!pre && !running) prevL = L;
    frows.push([dt(k), dt(end), running ? 'läuft noch' : '', pre ? '' : o.lz, pre ? '' : o.lw, pre ? '' : L, dl, pre ? '' : o.dup, o.t.Zurich, o.t.Winterthur, T, o.ns.Zurich + o.ns.Winterthur, o.sold.Zurich, o.sold.Winterthur, o.sold.Zurich + o.sold.Winterthur, T ? CS / T : '', o.calls.Zurich, o.calls.Winterthur]);
  });
  sh.getRange(fHead + 1, 1, frows.length, fh.length).setValues(frows);
  sh.getRange(fHead + 1, 1, frows.length, 2).setNumberFormat('dd.MM.yyyy'); sh.getRange(fHead + 1, 7, frows.length, 1).setNumberFormat('0%'); sh.getRange(fHead + 1, 16, frows.length, 1).setNumberFormat('0%');
  // Kanal-Tabelle
  var kHead = fHead + WR_WEEKS + 4; sh.getRange(kHead - 1, 1).setValue('Website-Leads pro Woche nach Kanal').setFontWeight('bold').setFontSize(12);
  sh.getRange(kHead, 1, 1, KANAL_ORDER.length + 1).setValues([['Woche ab'].concat(KANAL_ORDER)]).setFontWeight('bold').setBackground('#f3f3f3');
  var krows = weeks.map(function (k) { var o = wk[k] || blankW(), pre = k < LEAD_WEEK0; return [dt(k)].concat(KANAL_ORDER.map(function (c) { return pre ? '' : (o.kanal[c] || 0); })); });
  sh.getRange(kHead + 1, 1, krows.length, KANAL_ORDER.length + 1).setValues(krows); sh.getRange(kHead + 1, 1, krows.length, 1).setNumberFormat('dd.MM.yyyy');
  // Interessen-Tabelle
  var iHead = kHead + WR_WEEKS + 4; sh.getRange(iHead - 1, 1).setValue('Website-Leads pro Woche nach Interesse').setFontWeight('bold').setFontSize(12);
  sh.getRange(iHead, 1, 1, INTERESTS.length + 1).setValues([['Woche ab'].concat(INTERESTS)]).setFontWeight('bold').setBackground('#f3f3f3');
  var irows = weeks.map(function (k) { var o = wk[k] || blankW(), pre = k < LEAD_WEEK0; return [dt(k)].concat(INTERESTS.map(function (c) { return pre ? '' : (o.inter[c] || 0); })); });
  sh.getRange(iHead + 1, 1, irows.length, INTERESTS.length + 1).setValues(irows); sh.getRange(iHead + 1, 1, irows.length, 1).setNumberFormat('dd.MM.yyyy');
  sh.setColumnWidth(1, 200); sh.setColumnWidth(16, 150); sh.setFrozenRows(0);
  // Diagramme rechts
  var cc = 21;
  sh.insertChart(sh.newChart().setChartType(Charts.ChartType.LINE).setNumHeaders(1).addRange(sh.getRange(fHead, 1, WR_WEEKS + 1, 1)).addRange(sh.getRange(fHead, 6, WR_WEEKS + 1, 1)).addRange(sh.getRange(fHead, 11, WR_WEEKS + 1, 1)).addRange(sh.getRange(fHead, 15, WR_WEEKS + 1, 1))
    .setPosition(4, cc, 0, 0).setOption('title', 'Funnel pro Woche: Leads, Trials, Verkauft').setOption('pointSize', 6).setOption('colors', ['#9e9e9e', '#e2c210', '#1a73e8']).setOption('width', 620).setOption('height', 320).setOption('legend', { position: 'bottom' }).setOption('hAxis', { format: 'dd.MM' }).setOption('vAxis', { minValue: 0 }).build());
  sh.insertChart(sh.newChart().setChartType(Charts.ChartType.COLUMN).setNumHeaders(1).addRange(sh.getRange(kHead, 1, WR_WEEKS + 1, KANAL_ORDER.length + 1))
    .setPosition(22, cc, 0, 0).setOption('title', 'Website-Leads pro Woche nach Kanal').setOption('isStacked', true).setOption('width', 620).setOption('height', 340).setOption('legend', { position: 'bottom' }).setOption('hAxis', { format: 'dd.MM' }).setOption('vAxis', { minValue: 0 }).build());
  sh.insertChart(sh.newChart().setChartType(Charts.ChartType.COLUMN).setNumHeaders(1).addRange(sh.getRange(iHead, 1, WR_WEEKS + 1, INTERESTS.length + 1))
    .setPosition(41, cc, 0, 0).setOption('title', 'Website-Leads pro Woche nach Interesse').setOption('isStacked', true).setOption('width', 620).setOption('height', 340).setOption('legend', { position: 'bottom' }).setOption('hAxis', { format: 'dd.MM' }).setOption('vAxis', { minValue: 0 }).build());
}

// Trainingsplan-Analyse: Zaehlungen je Eingabe
function buildPlanAnalyse(ss) {
  var sh = getOrCreate(ss, 'Trainingsplan-Analyse'); clearSheet(sh);
  sh.getRange('A1').setValue('Trainingsplan-Tool – Auswertung der Eingaben').setFontSize(16).setFontWeight('bold');
  sh.getRange('A2').setValue('Gezaehlt wird pro Person nur der zuletzt erstellte Plan (Person = CRM-Kontakt, sonst Sitzung); Aufrufe ueber geteilte Links und Testleads zaehlen nicht. "Monat" = Kalendermonat.').setFontColor('#666666');
  var cur = 'DATE(YEAR(TODAY()),MONTH(TODAY()),1)', prev = 'DATE(YEAR(TODAY()),MONTH(TODAY())-1,1)';
  var base = 'PlanDaten!$D:$D,1';
  var r = 4;
  sh.getRange(r, 1, 1, 4).setValues([['Erstellte Pläne', 'Gesamt', 'Dieser Monat', 'Letzter Monat']]).setFontWeight('bold').setBackground('#f3f3f3');
  sh.getRange(r + 1, 1).setValue('Pläne (letzter Plan je Person)');
  sh.getRange(r + 1, 2).setFormula('=COUNTIFS(' + base + ')');
  sh.getRange(r + 1, 3).setFormula('=COUNTIFS(' + base + ',PlanDaten!$B:$B,' + cur + ')');
  sh.getRange(r + 1, 4).setFormula('=COUNTIFS(' + base + ',PlanDaten!$B:$B,' + prev + ')');
  sh.getRange(r + 2, 1).setValue('davon mit bekanntem Lead (nach Probetraining-Anfrage)');
  sh.getRange(r + 2, 2).setFormula('=COUNTIFS(' + base + ',PlanDaten!$M:$M,"<>")');
  sh.getRange(r + 2, 3).setFormula('=COUNTIFS(' + base + ',PlanDaten!$M:$M,"<>",PlanDaten!$B:$B,' + cur + ')');
  sh.getRange(r + 2, 4).setFormula('=COUNTIFS(' + base + ',PlanDaten!$M:$M,"<>",PlanDaten!$B:$B,' + prev + ')');
  // Quote: Anteil der Website-Leads (Status ok, ohne Tests), die danach einen Trainingsplan erstellt haben (ab 02.09.2026, Start des Tools)
  sh.getRange(r + 3, 1).setValue('Website-Leads (neu im CRM, ohne Tests) seit 02.09.2026');
  sh.getRange(r + 3, 2).setFormula('=COUNTIFS(Daten!$G:$G,1,Daten!$A:$A,">="&DATE(2026,9,2))');
  sh.getRange(r + 3, 3).setFormula('=COUNTIFS(Daten!$G:$G,1,Daten!$C:$C,' + cur + ')');
  sh.getRange(r + 3, 4).setFormula('=COUNTIFS(Daten!$G:$G,1,Daten!$C:$C,' + prev + ')');
  sh.getRange(r + 4, 1).setValue('Quote Leads mit Trainingsplan').setFontWeight('bold');
  for (var qc = 2; qc <= 4; qc++) { var L = String.fromCharCode(64 + qc); sh.getRange(r + 4, qc).setFormula('=IF(' + L + (r + 3) + '=0,"",' + L + (r + 2) + '/' + L + (r + 3) + ')').setNumberFormat('0%').setFontWeight('bold'); }
  r += 6;
  var dims = [
    ['Standort', 'E', ['Zürich', 'Winterthur'], false],
    ['Ziel', 'F', ['Kampfkunst lernen', 'Fit werden', 'Selbstverteidigung', 'Wettkampf'], false],
    ['Kampfkunst (Mehrfachauswahl möglich)', 'G', ['MMA', 'Muay Thai', 'Boxen', 'BJJ', 'Ringen', 'Fitness Kickboxen', 'Unsicher'], true],
    ['Level', 'H', ['Anfänger', 'Fortgeschritten', 'Erfahren'], false],
    ['Tage pro Woche', 'I', ['1', '2', '3', '4', '5', '6'], false],
    ['Zeitfenster (Mehrfachauswahl möglich)', 'J', ['Morgen', 'Mittag', 'Abend'], true],
    ['Nebensport', 'K', ['Nichts', 'Laufen/Cardio', 'Kraft', 'Andere Sportart'], false],
    ['Nebensport pro Woche', 'L', ['1x', '2x', '3+x'], false]
  ];
  for (var i = 0; i < dims.length; i++) {
    var d = dims[i], col = 'PlanDaten!$' + d[1] + ':$' + d[1];
    sh.getRange(r, 1, 1, 4).setValues([[d[0], 'Gesamt', 'Dieser Monat', 'Letzter Monat']]).setFontWeight('bold').setBackground('#f3f3f3');
    for (var v = 0; v < d[2].length; v++) {
      var rr = r + 1 + v, crit = d[3] ? '"*' + d[2][v] + '*"' : '"' + d[2][v] + '"';
      sh.getRange(rr, 1).setValue(d[2][v]);
      sh.getRange(rr, 2).setFormula('=COUNTIFS(' + base + ',' + col + ',' + crit + ')');
      sh.getRange(rr, 3).setFormula('=COUNTIFS(' + base + ',' + col + ',' + crit + ',PlanDaten!$B:$B,' + cur + ')');
      sh.getRange(rr, 4).setFormula('=COUNTIFS(' + base + ',' + col + ',' + crit + ',PlanDaten!$B:$B,' + prev + ')');
    }
    d.push(r); // Kopfzeile merken fuer Diagramme
    r += d[2].length + 3;
  }
  sh.setColumnWidth(1, 300);
  // Zwei Balkendiagramme: Kampfkunst und Ziel (Gesamt)
  var kk = dims[2], zi = dims[1];
  sh.insertChart(sh.newChart().setChartType(Charts.ChartType.BAR).addRange(sh.getRange(kk[4] + 1, 1, kk[2].length, 2))
    .setPosition(4, 7, 0, 0).setOption('title', 'Kampfkunst (gesamt)').setOption('legend', { position: 'none' }).setOption('width', 520).setOption('height', 300).build());
  sh.insertChart(sh.newChart().setChartType(Charts.ChartType.BAR).addRange(sh.getRange(zi[4] + 1, 1, zi[2].length, 2))
    .setPosition(20, 7, 0, 0).setOption('title', 'Ziel (gesamt)').setOption('legend', { position: 'none' }).setOption('width', 520).setOption('height', 260).build());
}

// ---------------------------------------------------------------- Klassenanalyse (Weg 2, 02.09.2026)
// Der Skill impact-class-analysis (Cowork, eingeloggter Browser) holt die exercise.com-Reports, baut mit
// tools/klassenanalyse/build_import.py eine JSON-Datei und legt sie im Drive-Ordner "Klassenanalyse-Import" ab.
// importKlassenanalyse() nimmt die neueste Datei und baut den Tab "Klassenanalyse" neu (Kopf, Standort-Summen,
// Monatsverlauf aus KlassenHistorie, Slot-Tabelle mit Auslastung, Oe pro Klasse, Oe dieser Uhrzeit, Verhaeltnis, Bewertung).
// Spalte "Aktion" bleibt erhalten. Manuell im Editor ausfuehren oder per Zeit-Trigger (Trigger-Menue, stuendlich).
var KA_FOLDER = 'Klassenanalyse-Import';
var KA_SHEET = 'Klassenanalyse';
var KA_HIST = 'KlassenHistorie';
var KA_HIST_D = 'KlassenHistorieDisziplin'; // Monat, Typ (Disziplin|Level), Name, Standort (Zurich|Winterthur|Mittel), Index, Auslastung, Besuche, Termine, Plaetze, Termine mit Vergleich
// Spalten F (Tagtyp) und L (Plätze) werden ausgeblendet; Umsatz steht direkt nach der Zeit (Entscheid Ruben 03.09.2026)
var KA_HEAD = ['Standort', 'Segment', 'Klasse', 'Tag', 'Zeit', 'Tagtyp', 'Umsatz CHF/Termin', 'Umsatz CHF/Monat', 'Termine', 'Besuche', 'Ø pro Klasse', 'Plätze', 'Auslastung', 'Ø dieser Uhrzeit', 'Verhältnis zur Uhrzeit', 'Unique Users', 'Buchungen', 'Besuche je Teilnehmer', 'Trainer', 'Bewertung', 'Aktion'];
var RISK_SHEET = 'Kündigungsrisiko', RISK_HIST = 'RisikoHistorie'; // Value Pricing / Mitglieder ohne Besuch (seit 03.09.2026)

function latestImportFile() {
  var it = DriveApp.getFoldersByName(KA_FOLDER);
  if (!it.hasNext()) return null;
  var files = it.next().getFiles(), best = null;
  while (files.hasNext()) {
    var f = files.next();
    if (!/\.json$/i.test(f.getName())) continue;
    if (!best || f.getLastUpdated().getTime() > best.getLastUpdated().getTime()) best = f;
  }
  return best;
}

function importKlassenanalyse(force) {
  var f = latestImportFile();
  if (!f) { Logger.log('Kein Import-File'); return; }
  var props = PropertiesService.getScriptProperties();
  var stamp = f.getId() + '@' + f.getLastUpdated().getTime();
  if (!force && props.getProperty('KA_LAST') === stamp) { Logger.log('Import unveraendert: ' + f.getName()); return; }
  var data = JSON.parse(f.getBlob().getDataAsString('UTF-8'));
  var ss = SpreadsheetApp.openById(SHEET_ID);
  updateKlassenHistorie(ss, data);
  buildKlassenanalyse(ss, data, f.getName());
  if (data.revenue) { updateRisikoHistorie(ss, data); buildRisiko(ss, data, f.getName()); }
  props.setProperty('KA_LAST', stamp);
  Logger.log('Klassenanalyse importiert: ' + f.getName() + ' (' + (data.rows || []).length + ' Klassen)');
}
function importKlassenanalyseForce() { importKlassenanalyse(true); }

function updateKlassenHistorie(ss, data) {
  var sh = getOrCreate(ss, KA_HIST);
  if (sh.getLastRow() === 0) { sh.appendRow(['Monat', 'Standort', 'Klassen', 'Termine', 'Besuche', 'Plätze', 'Auslastung', 'Fenster']); sh.setFrozenRows(1); sh.hideSheet(); }
  var win = data.window || {}, month = new Date((win.start || '2026-01-01') + 'T00:00:00'), mkey = Utilities.formatDate(month, TZ, 'yyyy-MM');
  var vals = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 8).getValues();
  var sum = data.summary || {};
  for (var loc in sum) {
    var s = sum[loc], row = [new Date(month.getFullYear(), month.getMonth(), 1), loc, s.classes, s.events, s.attended, s.capacity, s.capacity ? s.attended / s.capacity : '', (win.start || '') + ' bis ' + (win.end || '')];
    var found = -1;
    for (var i = 0; i < vals.length; i++) {
      if (vals[i][1] === loc && vals[i][0] instanceof Date && Utilities.formatDate(vals[i][0], TZ, 'yyyy-MM') === mkey) { found = i; break; }
    }
    if (found >= 0) sh.getRange(found + 2, 1, 1, 8).setValues([row]); else sh.appendRow(row);
  }
  sh.getRange('A2:A').setNumberFormat('mmm yyyy'); sh.getRange('G2:G').setNumberFormat('0%');
  updateKlassenHistorieDisziplin(ss, data, mkey);
}

function updateKlassenHistorieDisziplin(ss, data, mkey) {
  var sh = getOrCreate(ss, KA_HIST_D);
  var head = ['Monat', 'Typ', 'Name', 'Standort', 'Index', 'Auslastung', 'Besuche', 'Termine', 'Plätze', 'Termine mit Vergleich'];
  if (sh.getLastRow() === 0) { sh.appendRow(head); sh.getRange(1, 1, 1, head.length).setFontWeight('bold'); sh.setFrozenRows(1); sh.hideSheet(); }
  var keep = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, head.length).getValues().filter(function (r) { return String(r[0]) !== mkey; }) : [];
  [['Disziplin', data.hitlist || []]].forEach(function (pair) { // Level-Liste seit 03.09.2026 nicht mehr (Entscheid Ruben)
    pair[1].forEach(function (h) {
      keep.push([mkey, pair[0], h.name, 'Mittel', h.index == null ? '' : h.index, h.util, h.attended, h.events, h.capacity, h.with_neighbor]);
      ['Zurich', 'Winterthur'].forEach(function (loc) { var g = h[loc]; if (g) keep.push([mkey, pair[0], h.name, loc, g.index, g.util, g.attended, g.events, '', g.with_neighbor]); });
    });
  });
  keep.sort(function (a, b) { return (a[0] + a[1] + a[2]) < (b[0] + b[1] + b[2]) ? -1 : 1; });
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, head.length).clearContent();
  if (keep.length) sh.getRange(2, 1, keep.length, head.length).setValues(keep);
  sh.getRange('E2:E').setNumberFormat('0.00'); sh.getRange('F2:F').setNumberFormat('0%');
}

// Rollierende Hitlist: Mittel der Monats-Indizes (Zeilen Standort=Mittel) ueber die letzten n importierten Monate
function rollingHitlist(ss, typ, n) {
  var sh = ss.getSheetByName(KA_HIST_D); if (!sh || sh.getLastRow() < 2) return { rows: [], months: [] };
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues(), months = {};
  v.forEach(function (r) { if (r[1] === typ && r[3] === 'Mittel') months[String(r[0])] = 1; });
  var keep = Object.keys(months).sort().slice(-n), agg = {};
  v.forEach(function (r) {
    if (r[1] !== typ || r[3] !== 'Mittel' || keep.indexOf(String(r[0])) < 0 || r[4] === '') return;
    var a = agg[r[2]] = agg[r[2]] || { sum: 0, k: 0, att: 0, ev: 0, cap: 0 };
    a.sum += Number(r[4]); a.k++; a.att += Number(r[6] || 0); a.ev += Number(r[7] || 0); a.cap += Number(r[8] || 0);
  });
  var rows = Object.keys(agg).map(function (name) { var a = agg[name]; return [name, a.sum / a.k, a.k, a.cap ? a.att / a.cap : '', a.att, a.ev]; });
  rows.sort(function (a, b) { return b[1] - a[1]; });
  return { rows: rows, months: keep };
}

function hitlistBlock(sh, r, title, list) {
  sh.getRange(r, 1).setValue(title).setFontWeight('bold').setFontSize(12); r++;
  // Reihenfolge und Rang nach Umsatz (Entscheid Ruben 03.09.2026). Spalten F und L sind im Tab ausgeblendet, deshalb dort Leerspalten.
  var hh = ['Rang', 'Disziplin', 'Umsatz CHF/Monat', 'Umsatzanteil', 'Umsatz je Termin', '', 'Index Zürich', 'Index Winterthur', 'Index Mittel', 'Auslastung', 'Besuche', '', 'Termine', 'Termine mit Vergleich', 'Ø pro Klasse', 'Unique Users'];
  var hdr = r;
  sh.getRange(r, 1, 1, hh.length).setValues([hh]).setFontWeight('bold').setBackground('#f3f3f3'); r++;
  var vals = list.map(function (h, i) {
    var z = h.Zurich, w = h.Winterthur;
    var ix = function (o) { return !o ? '' : (o.index == null ? 'n/a' : o.index); };
    var rpe = (h.revenue != null && h.events) ? h.revenue / h.events : '';
    return [i + 1, h.name, h.revenue == null ? '' : h.revenue, h.revenue_share == null ? '' : h.revenue_share, rpe, '', ix(z), ix(w), h.index == null ? 'n/a' : h.index, h.util, h.attended, '', h.events, h.with_neighbor, h.events ? h.attended / h.events : '', h.uniq || 0];
  });
  if (vals.length) {
    sh.getRange(r, 1, vals.length, hh.length).setValues(vals);
    sh.getRange(r, 3, vals.length, 1).setNumberFormat('#,##0'); sh.getRange(r, 4, vals.length, 1).setNumberFormat('0%'); sh.getRange(r, 5, vals.length, 1).setNumberFormat('#,##0');
    sh.getRange(r, 7, vals.length, 3).setNumberFormat('0.00'); sh.getRange(r, 10, vals.length, 1).setNumberFormat('0%'); sh.getRange(r, 11, vals.length, 1).setNumberFormat('0');
    sh.getRange(r, 13, vals.length, 2).setNumberFormat('0'); sh.getRange(r, 15, vals.length, 1).setNumberFormat('0.0'); sh.getRange(r, 16, vals.length, 1).setNumberFormat('0');
    var rg = sh.getRange(r, 9, vals.length, 1), rules = sh.getConditionalFormatRules();
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(1.1).setBackground('#C6E0B4').setRanges([rg]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0.8).setBackground('#F8CBAD').setRanges([rg]).build());
    sh.setConditionalFormatRules(rules);
    // Diagramm rechts neben dem Block: Umsatzanteil je Disziplin
    sh.insertChart(sh.newChart().setChartType(Charts.ChartType.BAR).setNumHeaders(1)
      .addRange(sh.getRange(hdr, 2, vals.length + 1, 1)).addRange(sh.getRange(hdr, 4, vals.length + 1, 1))
      .setPosition(hdr - 1, 18, 0, 0).setOption('title', 'Umsatzanteil: ' + title.split(' (')[0]).setOption('legend', { position: 'none' })
      .setOption('colors', ['#e2c210']).setOption('hAxis', { format: 'percent', minValue: 0 }).setOption('width', 520).setOption('height', Math.min(80 + 22 * vals.length, 540)).build());
  }
  r += vals.length;
  sh.getRange(r, 1).setValue('Rang nach Umsatzanteil. Umsatz je Termin = Umsatz / Termine. n/a = unter der Mindestschwelle am Standort (Ø < 3 Personen pro Klasse oder < 4 Termine im Monat); Index Mittel dann nur aus dem anderen Standort.').setFontColor('#666666').setFontStyle('italic');
  return Math.max(r + 2, hdr + Math.ceil((80 + 22 * vals.length) / 21) + 2);
}

function classBlock(sh, r, title, list, color) {
  sh.getRange(r, 1).setValue(title).setFontWeight('bold').setFontSize(12); r++;
  // Spalten F und L sind im Tab ausgeblendet, deshalb dort Leerspalten
  var hh = ['Rang', 'Standort', 'Klasse (Tag, Zeit)', 'Tag', 'Zeit', '', 'Trainer', 'Umsatz je Termin', 'Umsatz CHF/Monat', 'Termine', 'Ø pro Klasse', '', 'Auslastung'];
  var hdr = r;
  sh.getRange(r, 1, 1, hh.length).setValues([hh]).setFontWeight('bold').setBackground('#f3f3f3'); r++;
  var vals = list.map(function (x, i) {
    return [i + 1, x.location, x.service + ' (' + x.days + ' ' + x.start + ', ' + (x.location === 'Zurich' ? 'ZH' : 'WT') + ')', x.days, x.start, '', x.staff || '', x.revenue_per_event, x.revenue, x.events, x.events ? x.attended / x.events : '', '', x.capacity ? x.attended / x.capacity : ''];
  });
  sh.getRange(r, 1, vals.length, hh.length).setValues(vals);
  sh.getRange(r, 8, vals.length, 2).setNumberFormat('#,##0'); sh.getRange(r, 10, vals.length, 1).setNumberFormat('0'); sh.getRange(r, 11, vals.length, 1).setNumberFormat('0.0'); sh.getRange(r, 13, vals.length, 1).setNumberFormat('0%');
  sh.getRange(r, 8, vals.length, 1).setBackground(color);
  sh.insertChart(sh.newChart().setChartType(Charts.ChartType.BAR).setNumHeaders(1)
    .addRange(sh.getRange(hdr, 3, vals.length + 1, 1)).addRange(sh.getRange(hdr, 8, vals.length + 1, 1))
    .setPosition(hdr - 1, 18, 0, 0).setOption('title', title.split(' (')[0] + ' (CHF)').setOption('legend', { position: 'none' })
    .setOption('colors', [color === '#C6E0B4' ? '#1a73e8' : '#e2c210']).setOption('hAxis', { minValue: 0 }).setOption('width', 620).setOption('height', 80 + 24 * vals.length).build());
  r += vals.length;
  return Math.max(r + 2, hdr + Math.ceil((80 + 24 * vals.length) / 21) + 2);
}

function buildKlassenanalyse(ss, data, fileName) {
  var sh = getOrCreate(ss, KA_SHEET);
  // Bisherige Aktionen sichern (Schluessel: Standort|Klasse|Tag|Zeit)
  var actions = {};
  var lr = sh.getLastRow();
  if (lr > 0) {
    var all = sh.getRange(1, 1, lr, Math.max(KA_HEAD.length, sh.getLastColumn())).getValues(), ac = -1;
    for (var hI = 0; hI < all.length && ac < 0; hI++) ac = all[hI].indexOf('Aktion'); // Spalte "Aktion" suchen (Layout kann sich aendern)
    for (var i = 0; i < all.length; i++) {
      if (ac >= 0 && all[i][0] && all[i][2] && all[i][3] && all[i][ac] && all[i][0] !== 'Standort') actions[[all[i][0], all[i][2], all[i][3], all[i][4]].join('|')] = all[i][ac];
    }
  }
  clearSheet(sh);
  var rows = data.rows || [], win = data.window || {};
  var fmt = function (d) { var p = String(d || '').split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : d; };
  var tot = { cls: 0, ev: 0, att: 0 };
  for (var r0 = 0; r0 < rows.length; r0++) { tot.cls++; tot.ev += rows[r0].events; tot.att += rows[r0].attended; }
  sh.getRange('A1').setValue('IMPACT Klassenanalyse ' + fmt(win.start) + ' bis ' + fmt(win.end)).setFontSize(16).setFontWeight('bold');
  sh.getRange('A2').setValue(tot.cls + ' Klassen, ' + tot.ev + ' durchgeführte Termine, ' + tot.att + ' Besuche. Importiert ' + Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm') + ' aus ' + fileName + ' (exercise.com Popular Services + Itemized Recurring Sessions' + (data.revenue ? '; Umsatz aus Itemized Visits + Active Subscriptions: Netto-Abobetrag je Mitglied gleichmässig auf dessen Check-ins verteilt' : '') + ').').setFontColor('#666666');

  // ---- Standort-Summen mit Vergleich zum Vormonat (aus KlassenHistorie)
  var hist = ss.getSheetByName(KA_HIST);
  var hv = hist && hist.getLastRow() > 1 ? hist.getRange(2, 1, hist.getLastRow() - 1, 7).getValues() : [];
  var month = new Date((win.start || '2026-01-01') + 'T00:00:00');
  var prevKey = Utilities.formatDate(new Date(month.getFullYear(), month.getMonth() - 1, 1), TZ, 'yyyy-MM');
  var prevUtil = {};
  for (var h = 0; h < hv.length; h++) if (hv[h][0] instanceof Date && Utilities.formatDate(hv[h][0], TZ, 'yyyy-MM') === prevKey) prevUtil[hv[h][1]] = hv[h][6];
  sh.getRange(4, 1, 1, 10).setValues([['Standort', 'Klassen', 'Termine', 'Besuche', 'Plätze', 'Auslastung', 'Δ% zum Vormonat', 'Abo-Umsatz CHF/Monat (alle Abos)', 'davon auf Klassen verteilt', 'davon Mitglieder ohne Besuch']]).setFontWeight('bold').setBackground('#f3f3f3').setWrap(true);
  var sum = data.summary || {}, locs = Object.keys(sum).sort(), r = 5, mem = (data.revenue || {}).members || {};
  for (var l = 0; l < locs.length; l++) {
    var s = sum[locs[l]], util = s.capacity ? s.attended / s.capacity : '';
    var d = (util !== '' && prevUtil[locs[l]]) ? (util - prevUtil[locs[l]]) / prevUtil[locs[l]] : '';
    var mm = mem[locs[l]] || {};
    sh.getRange(r, 1, 1, 10).setValues([[locs[l], s.classes, s.events, s.attended, s.capacity, util, d, mm.chf == null ? '' : mm.chf, s.revenue == null ? '' : s.revenue, mm.chf_novisit == null ? '' : mm.chf_novisit]]);
    sh.getRange(r, 6).setNumberFormat('0%'); sh.getRange(r, 7).setNumberFormat('+0.0%;-0.0%'); sh.getRange(r, 8, 1, 3).setNumberFormat('#,##0');
    r++;
  }

  // ---- Monatsverlauf (letzte 12 Monate je Standort) aus KlassenHistorie
  var vr = r + 1;
  sh.getRange(vr, 1).setValue('Monatsverlauf Auslastung (aus allen Importen)').setFontWeight('bold').setFontSize(12);
  sh.getRange(vr + 1, 1, 1, 5).setValues([['Monat', 'Zurich Auslastung', 'Winterthur Auslastung', 'Zurich Besuche', 'Winterthur Besuche']]).setFontWeight('bold').setBackground('#f3f3f3');
  var byMonth = {};
  for (var h2 = 0; h2 < hv.length; h2++) {
    if (!(hv[h2][0] instanceof Date)) continue;
    var k = Utilities.formatDate(hv[h2][0], TZ, 'yyyy-MM');
    byMonth[k] = byMonth[k] || { d: hv[h2][0] };
    byMonth[k][hv[h2][1]] = { util: hv[h2][6], att: hv[h2][4] };
  }
  var keys = Object.keys(byMonth).sort().slice(-12), vrow = vr + 2;
  for (var m = 0; m < keys.length; m++) {
    var b = byMonth[keys[m]], z = b.Zurich || {}, w = b.Winterthur || {};
    sh.getRange(vrow + m, 1, 1, 5).setValues([[b.d, z.util === undefined ? '' : z.util, w.util === undefined ? '' : w.util, z.att === undefined ? '' : z.att, w.att === undefined ? '' : w.att]]);
  }
  if (keys.length) {
    sh.getRange(vrow, 1, keys.length, 1).setNumberFormat('mmm yyyy'); sh.getRange(vrow, 2, keys.length, 2).setNumberFormat('0%');
    sh.insertChart(sh.newChart().setChartType(Charts.ChartType.COLUMN).setNumHeaders(1)
      .addRange(sh.getRange(vr + 1, 1, keys.length + 1, 3)).setPosition(4, 12, 0, 0)
      .setOption('title', 'Auslastung pro Monat').setOption('colors', ['#e2c210', '#1a73e8']).setOption('width', 620).setOption('height', 280)
      .setOption('legend', { position: 'bottom' }).setOption('vAxis', { format: 'percent', minValue: 0 }).build());
  }

  // ---- Hitlist Kampfsportarten (uhrzeitbereinigt; Entscheid Ruben 03.09.2026: Levels zusammen, BJJ Gi/No-Gi getrennt,
  //      Competition und Kids drin, Open Mat und Self Defense for Women raus; erst je Standort, dann Mittel)
  var hr = Math.max(vrow + keys.length + 2, 20);
  hr = hitlistBlock(sh, hr, 'Hitlist Kampfsportarten ' + fmt(win.start) + ' bis ' + fmt(win.end) + ' (Slot-Index: Ø pro Klasse geteilt durch Ø der Uhrzeit, gewichtet mit Terminen; 1.00 = wie der Slot im Schnitt)', data.hitlist || []);
  var roll = rollingHitlist(ss, 'Disziplin', 3);
  if (roll.months.length > 1) {
    sh.getRange(hr, 1).setValue('Hitlist rollierend, letzte ' + roll.months.length + ' Monate (' + roll.months.join(', ') + ')').setFontWeight('bold').setFontSize(12); hr++;
    sh.getRange(hr, 1, 1, 8).setValues([['Rang', 'Disziplin', 'Index Mittel', 'Monate', 'Auslastung', '', 'Besuche', 'Termine']]).setFontWeight('bold').setBackground('#f3f3f3'); hr++;
    var rv = roll.rows.map(function (x, i) { return [i + 1, x[0], x[1], x[2], x[3], '', x[4], x[5]]; }); // Spalte F ist ausgeblendet
    sh.getRange(hr, 1, rv.length, 8).setValues(rv); sh.getRange(hr, 3, rv.length, 1).setNumberFormat('0.00'); sh.getRange(hr, 5, rv.length, 1).setNumberFormat('0%');
    hr += rv.length + 1;
  }
  // Klassen-Hitlist (Entscheid Ruben 03.09.2026, ersetzt die Level-Liste): Umsatz je Termin ist ueber alle Klassen vergleichbar
  // (60 Minuten, ein Trainer). Nur Klassen mit mindestens 4 Terminen, Open Mat raus.
  var ranked = rows.filter(function (x) { return x.segment !== 'Gratis' && x.events >= 4 && x.revenue_per_event != null && x.revenue_per_event !== ''; })
    .sort(function (a, b) { return b.revenue_per_event - a.revenue_per_event; });
  if (ranked.length) {
    hr = classBlock(sh, hr, 'Top 10 Klassen nach Umsatz je Termin (mindestens 4 Termine im Monat)', ranked.slice(0, 10), '#C6E0B4');
    hr = classBlock(sh, hr, 'Bottom 10 Klassen nach Umsatz je Termin (mindestens 4 Termine im Monat)', ranked.slice(-10).reverse(), '#F8CBAD');
  }
  // ---- Slot-Tabelle
  var HR = hr + 1, D0 = HR + 1, last = D0 + rows.length - 1;
  sh.getRange(HR - 1, 1).setValue('Klassen nach Standort, Wochentag und Uhrzeit (liest sich wie der Stundenplan; Rangliste per Filter)').setFontWeight('bold').setFontSize(12);
  sh.getRange(HR, 1, 1, KA_HEAD.length).setValues([KA_HEAD]).setFontWeight('bold').setBackground('#1F3864').setFontColor('#ffffff').setWrap(true);
  if (!rows.length) return;
  var statics = [], formulas = [];
  // Spalten: A Standort, B Segment, C Klasse, D Tag, E Zeit, F Tagtyp (ausgeblendet), G Umsatz/Termin, H Umsatz/Monat, I Termine, J Besuche,
  // K Ø pro Klasse, L Plätze (ausgeblendet), M Auslastung, N Ø dieser Uhrzeit, O Verhältnis, P Unique Users, Q Buchungen, R Besuche je Teilnehmer, S Trainer, T Bewertung, U Aktion
  var NG = '$B$' + D0 + ':$B$' + last + ',"<>Gratis"';
  for (var i2 = 0; i2 < rows.length; i2++) {
    var x = rows[i2], rr = D0 + i2, free = x.segment === 'Gratis';
    statics.push([x.location, x.segment, x.service, x.days, x.start, x.daytype, x.revenue_per_event == null ? '' : x.revenue_per_event, x.revenue == null ? '' : x.revenue, x.events, x.attended, '', x.capacity, '', '', '', x.uniq, x.rec_visits, '', x.staff, '', actions[[x.location, x.service, x.days, x.start].join('|')] || '']);
    var b = '$A$' + D0 + ':$A$' + last + ',$A' + rr + ',$E$' + D0 + ':$E$' + last + ',$E' + rr + ',$F$' + D0 + ':$F$' + last + ',$F' + rr + ',' + NG;
    formulas.push({
      K: '=IF(I' + rr + '=0,"",J' + rr + '/I' + rr + ')',
      M: '=IFERROR(J' + rr + '/L' + rr + ',"")',
      N: free ? 'n/a' : '=IFERROR(SUMIFS($J$' + D0 + ':$J$' + last + ',' + b + ')/SUMIFS($I$' + D0 + ':$I$' + last + ',' + b + '),"")',
      O: free ? 'n/a' : '=IFERROR(K' + rr + '/N' + rr + ',"")',
      R: '=IFERROR(Q' + rr + '/P' + rr + ',"")',
      T: free ? 'gratis, kein Massstab' : '=IF(I' + rr + '<5,"zu wenig Termine",IF(M' + rr + '<0.1,"tot",IF(M' + rr + '<0.16,"schliessen prüfen",IF(M' + rr + '<0.28,"schwach",IF(M' + rr + '>0.45,"Kapazität prüfen","ok")))))',
    });
  }
  sh.getRange(D0, 1, rows.length, KA_HEAD.length).setValues(statics);
  var cols = { K: 11, M: 13, N: 14, O: 15, R: 18, T: 20 };
  for (var c in cols) sh.getRange(D0, cols[c], rows.length, 1).setFormulas(formulas.map(function (f) { return [f[c]]; }));
  sh.getRange(D0, 7, rows.length, 2).setNumberFormat('#,##0'); sh.getRange(D0, 11, rows.length, 1).setNumberFormat('0.0'); sh.getRange(D0, 13, rows.length, 1).setNumberFormat('0%');
  sh.getRange(D0, 14, rows.length, 1).setNumberFormat('0.0'); sh.getRange(D0, 15, rows.length, 1).setNumberFormat('0.00'); sh.getRange(D0, 18, rows.length, 1).setNumberFormat('0.0');
  var mr = sh.getRange(D0, 13, rows.length, 1);
  sh.setConditionalFormatRules(sh.getConditionalFormatRules().concat([
    SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0.16).setBackground('#F8CBAD').setRanges([mr]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0.45).setBackground('#C6E0B4').setRanges([mr]).build(),
  ]));
  sh.hideColumns(6); sh.hideColumns(12);
  sh.setFrozenRows(0); sh.setColumnWidth(3, 200); sh.setColumnWidth(8, 120); sh.setColumnWidth(9, 120); sh.setColumnWidth(10, 120); sh.setColumnWidth(19, 220); sh.setColumnWidth(21, 260);
  var notes = [
    'Termine, Besuche und Plätze aus "Popular Services" (Events zählt nur durchgeführte Termine; Ferien, Ausfälle, Trainer-Rotation sind damit erledigt). Unique Users, Buchungen, Trainer aus "Itemized Recurring Sessions", verbunden über Standort, Kurs, Wochentag, Startzeit.',
    'Auslastung = Besuche / Plätze (Hauptkennzahl). Ø dieser Uhrzeit = Schnitt aller Klassen zur selben Uhrzeit, am selben Standort, gleicher Tagtyp (Werktag/Samstag). Verhältnis < 1 = schwächer als die Nachbarklassen zur selben Zeit.',
    'Besuche je Teilnehmer = Buchungen / Unique Users (beide aus dem Recurring-Report, enthalten No-Shows). Gratisklassen (Open Mat) sind aus Vergleichen ausgeschlossen. Spalte "Aktion" ist manuell und bleibt beim nächsten Import erhalten.',
    'Bewertung: < 5 Termine = zu wenig Termine; < 10% tot; < 16% schliessen prüfen; < 28% schwach; > 45% Kapazität prüfen. Competition-Klassen nicht nach Ø bewerten (Kaderaufbau), Kids in Ferienmonaten nach unten verzerrt.',
    'Umsatz (Value Pricing, seit 03.09.2026): Netto-Abobetrag pro Monat je Mitglied (ohne MwSt, Jahres-/Halbjahresabos auf Monate umgerechnet, Coupon abgezogen) gleichmässig auf dessen Check-ins des Monats verteilt und je Klasse summiert. Umsatz je Termin = Umsatz / Termine. Check-ins ohne Abo (Probetraining, Gäste) = 0 CHF. Das Abo-Geld der Mitglieder ohne Besuch (Tab Kündigungsrisiko) steckt in keiner Klasse, darum ist die Summe der Klassen kleiner als der Abo-Umsatz. Kein Grenzumsatz: fällt eine Klasse weg, wandern die Besuche in andere Klassen.',
  ];
  for (var n = 0; n < notes.length; n++) sh.getRange(last + 2 + n, 1).setValue(notes[n]).setFontStyle('italic').setFontColor('#666666');
}

// ------------------------------------------------------------ Kuendigungsrisiko (Value Pricing, seit 03.09.2026)
// data.revenue.members = { Zurich: {subs, visited, novisit, chf, chf_visited, chf_novisit}, ... }
// data.revenue.novisit = [ {name, email, location, package, chf, since}, ... ] (Mitglieder ohne einen Check-in im Monat)
function monthKey(data) {
  var win = data.window || {}, month = new Date((win.start || '2026-01-01') + 'T00:00:00');
  return { month: new Date(month.getFullYear(), month.getMonth(), 1), key: Utilities.formatDate(month, TZ, 'yyyy-MM') };
}
function updateRisikoHistorie(ss, data) {
  var sh = getOrCreate(ss, RISK_HIST), head = ['Monat', 'Standort', 'Abos', 'mit Besuch', 'ohne Besuch', 'Quote ohne Besuch', 'CHF Abos/Monat', 'CHF ohne Besuch'];
  if (sh.getLastRow() === 0) { sh.appendRow(head); sh.setFrozenRows(1); sh.hideSheet(); }
  var mk = monthKey(data), mem = (data.revenue || {}).members || {};
  var keep = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, head.length).getValues().filter(function (r) { return !(r[0] instanceof Date) || Utilities.formatDate(r[0], TZ, 'yyyy-MM') !== mk.key; }) : [];
  Object.keys(mem).sort().forEach(function (loc) { var m = mem[loc]; keep.push([mk.month, loc, m.subs, m.visited, m.novisit, m.subs ? m.novisit / m.subs : '', m.chf, m.chf_novisit]); });
  keep.sort(function (a, b) { return (a[0].getTime() - b[0].getTime()) || (a[1] < b[1] ? -1 : 1); });
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, head.length).clearContent();
  if (keep.length) sh.getRange(2, 1, keep.length, head.length).setValues(keep);
  sh.getRange('A2:A').setNumberFormat('mmm yyyy'); sh.getRange('F2:F').setNumberFormat('0%'); sh.getRange('G2:H').setNumberFormat('#,##0');
}
function buildRisiko(ss, data, fileName) {
  var sh = getOrCreate(ss, RISK_SHEET), rv = data.revenue || {}, mk = monthKey(data);
  // manuelle Notizen (letzte Spalte der Namensliste) ueber E-Mail bzw. Name merken
  var notes = {}, lr = sh.getLastRow();
  if (lr > 0) {
    var all = sh.getRange(1, 1, lr, Math.max(7, sh.getLastColumn())).getValues(), inList = false;
    for (var i = 0; i < all.length; i++) {
      if (all[i][0] === 'Name' && all[i][5] === 'E-Mail') { inList = true; continue; }
      if (inList && all[i][0] && all[i][6]) notes[all[i][5] || all[i][0]] = all[i][6];
    }
  }
  clearSheet(sh);
  sh.getRange('A1').setValue('Kündigungsrisiko: Mitglieder ohne Besuch').setFontSize(16).setFontWeight('bold');
  sh.getRange('A2').setValue('Laufende Abos (ohne pausierte und erst geplante) aus "Active Subscriptions", Check-ins aus "Itemized Visits" (exercise.com). Ohne Besuch = im Monat kein einziger abgeschlossener Check-in, egal an welchem Standort. CHF = Netto-Abobetrag pro Monat (ohne MwSt, nach Coupon; Jahres- und Halbjahresabos auf Monate umgerechnet). Importiert ' + Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm') + ' aus ' + fileName + '.').setFontColor('#666666').setWrap(true);
  sh.getRange('A2:I2').merge();
  // ---- Statistik pro Monat (aus RisikoHistorie) + Total je Monat
  var hist = ss.getSheetByName(RISK_HIST), hv = hist && hist.getLastRow() > 1 ? hist.getRange(2, 1, hist.getLastRow() - 1, 8).getValues() : [];
  sh.getRange(4, 1).setValue('Statistik pro Monat').setFontWeight('bold').setFontSize(12);
  var head = ['Monat', 'Standort', 'Abos', 'mit Besuch', 'ohne Besuch', 'Quote ohne Besuch', 'CHF Abos/Monat', 'CHF ohne Besuch', 'Anteil CHF ohne Besuch'];
  sh.getRange(5, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#f3f3f3');
  var byM = {}, order = [];
  hv.forEach(function (r) { if (!(r[0] instanceof Date)) return; var k = Utilities.formatDate(r[0], TZ, 'yyyy-MM'); if (!byM[k]) { byM[k] = { d: r[0], rows: [] }; order.push(k); } byM[k].rows.push(r); });
  order.sort(); var out = [], piv = [];
  order.forEach(function (k) {
    var b = byM[k], t = [b.d, 'Total', 0, 0, 0, '', 0, 0, ''], q = { Monat: b.d };
    b.rows.forEach(function (r) { out.push([r[0], r[1], r[2], r[3], r[4], r[2] ? r[4] / r[2] : '', r[6], r[7], r[6] ? r[7] / r[6] : '']); t[2] += r[2]; t[3] += r[3]; t[4] += r[4]; t[6] += r[6]; t[7] += r[7]; q[r[1]] = r[2] ? r[4] / r[2] : ''; });
    t[5] = t[2] ? t[4] / t[2] : ''; t[8] = t[6] ? t[7] / t[6] : ''; out.push(t);
    piv.push([b.d, q.Zurich === undefined ? '' : q.Zurich, q.Winterthur === undefined ? '' : q.Winterthur]);
  });
  var r = 6;
  if (out.length) {
    sh.getRange(r, 1, out.length, head.length).setValues(out);
    sh.getRange(r, 1, out.length, 1).setNumberFormat('mmm yyyy'); sh.getRange(r, 6, out.length, 1).setNumberFormat('0%'); sh.getRange(r, 9, out.length, 1).setNumberFormat('0%'); sh.getRange(r, 7, out.length, 2).setNumberFormat('#,##0');
    for (var t2 = 0; t2 < out.length; t2++) if (out[t2][1] === 'Total') sh.getRange(r + t2, 1, 1, head.length).setFontWeight('bold');
    // Pivot fuer das Diagramm (rechts, ab Spalte K)
    sh.getRange(5, 11, 1, 3).setValues([['Monat', 'Zurich', 'Winterthur']]).setFontWeight('bold').setBackground('#f3f3f3');
    sh.getRange(6, 11, piv.length, 3).setValues(piv); sh.getRange(6, 11, piv.length, 1).setNumberFormat('mmm yyyy'); sh.getRange(6, 12, piv.length, 2).setNumberFormat('0%');
    sh.insertChart(sh.newChart().setChartType(Charts.ChartType.COLUMN).setNumHeaders(1).addRange(sh.getRange(5, 11, piv.length + 1, 3)).setPosition(4, 15, 0, 0)
      .setOption('title', 'Quote Mitglieder ohne Besuch').setOption('colors', ['#e2c210', '#1a73e8']).setOption('width', 560).setOption('height', 280)
      .setOption('legend', { position: 'bottom' }).setOption('vAxis', { format: 'percent', minValue: 0 }).build());
    r += out.length;
  }
  // ---- Namensliste des aktuellen Monats
  var list = rv.novisit || [];
  r += 2;
  sh.getRange(r, 1).setValue('Mitglieder ohne Besuch im ' + Utilities.formatDate(mk.month, TZ, 'MMMM yyyy') + ' (' + list.length + ' Personen, sortiert nach Standort und Abobetrag)').setFontWeight('bold').setFontSize(12); r++;
  var lh = ['Name', 'Standort', 'Abo', 'CHF/Monat', 'Mitglied seit', 'E-Mail', 'Notiz (manuell, bleibt beim Import erhalten)'];
  sh.getRange(r, 1, 1, lh.length).setValues([lh]).setFontWeight('bold').setBackground('#1F3864').setFontColor('#ffffff'); r++;
  if (list.length) {
    var rows = list.map(function (m) {
      var since = /^\d{4}-\d{2}-\d{2}/.test(m.since || '') ? new Date(m.since.slice(0, 10) + 'T00:00:00') : (m.since || '');
      return [m.name, m.location, m.package, m.chf, since, m.email, notes[m.email || m.name] || ''];
    });
    sh.getRange(r, 1, rows.length, lh.length).setValues(rows);
    sh.getRange(r, 4, rows.length, 1).setNumberFormat('#,##0'); sh.getRange(r, 5, rows.length, 1).setNumberFormat('dd.mm.yyyy');
    sh.getRange(r - 1, 1, rows.length + 1, lh.length).createFilter();
  }
  sh.setColumnWidth(1, 200); sh.setColumnWidth(3, 260); sh.setColumnWidth(6, 240); sh.setColumnWidth(7, 300);
  sh.setFrozenRows(0);
  // Position: direkt nach Klassenanalyse; RisikoHistorie versteckt (neue Tabs landen sonst neben dem aktiven Tab)
  var ka = ss.getSheetByName(KA_SHEET); if (ka) { ss.setActiveSheet(sh); ss.moveActiveSheet(ka.getIndex() + 1); }
  var hs = ss.getSheetByName(RISK_HIST); if (hs && !hs.isSheetHidden()) hs.hideSheet();
  var an = ss.getSheetByName('Leads-Analyse'); if (an) ss.setActiveSheet(an);
}

// ------------------------------------------------------------ Klassenanalyse serverseitig (seit 03.09.2026)
// Holt die fertige Import-Struktur von der Cloudflare-Funktion /api/klassen (exercise.com-Reports per API-Login,
// Rechnung dort), legt eine Archivkopie in den Drive-Ordner und baut die Tabs. Kein Browser, kein Cowork mehr noetig.
var KLASSEN_URL = 'https://www.impact-martialarts.com/api/klassen';
function klassenCall(body) {
  body.token = TOKEN;
  var r = UrlFetchApp.fetch(KLASSEN_URL, { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true });
  var t = r.getContentText(), j;
  try { j = JSON.parse(t); } catch (e) { j = { error: 'bad_json', text: String(t).slice(0, 200) }; }
  j.http = r.getResponseCode();
  return j;
}
function runKlassenanalyse(start, end) {
  var p1 = klassenCall({ phase: 1, start: start, end: end });
  if (p1.error) throw new Error('Phase 1: ' + JSON.stringify(p1).slice(0, 300));
  Logger.log('Phase 1 gestartet: ' + JSON.stringify(p1.started));
  var p2 = null, p3 = null, i;
  for (i = 0; i < 8; i++) { Utilities.sleep(25000); p2 = klassenCall({ phase: 2, start: start, end: end }); if (p2.error) throw new Error('Phase 2: ' + JSON.stringify(p2).slice(0, 300)); if (p2.ready) break; }
  if (!p2 || !p2.ready) throw new Error('Phase 2 nicht fertig: ' + JSON.stringify(p2).slice(0, 200));
  Logger.log('Phase 2: Popular Zuerich ' + (p2.popular_zh || []).length + ' Services');
  for (i = 0; i < 8; i++) { Utilities.sleep(25000); p3 = klassenCall({ phase: 3, start: start, end: end, popular_zh: p2.popular_zh }); if (p3.error) throw new Error('Phase 3: ' + JSON.stringify(p3).slice(0, 300)); if (p3.ready) break; }
  if (!p3 || !p3.ready) throw new Error('Phase 3 nicht fertig: ' + JSON.stringify(p3).slice(0, 200));
  var data = p3.data, ss = SpreadsheetApp.openById(SHEET_ID), name = 'klassenanalyse-' + start.slice(0, 7) + '.json';
  // Archivkopie (ersetzt eine aeltere Datei desselben Monats); der Drive-Import ueberspringt sie per Stempel
  var it = DriveApp.getFoldersByName(KA_FOLDER);
  if (it.hasNext()) {
    var folder = it.next(), old = folder.getFilesByName(name);
    while (old.hasNext()) old.next().setTrashed(true);
    var f = folder.createFile(name, JSON.stringify(data), 'application/json');
    PropertiesService.getScriptProperties().setProperty('KA_LAST', f.getId() + '@' + f.getLastUpdated().getTime());
  }
  updateKlassenHistorie(ss, data);
  buildKlassenanalyse(ss, data, name + ' (API)');
  if (data.revenue) { updateRisikoHistorie(ss, data); buildRisiko(ss, data, name + ' (API)'); }
  var sum = data.summary || {}, mem = (data.revenue || {}).members || {}, lines = [];
  Object.keys(sum).sort().forEach(function (loc) { var x = sum[loc], m = mem[loc] || {}; lines.push(loc + ': ' + x.classes + ' Klassen, ' + x.events + ' Termine, ' + x.attended + ' Besuche, Auslastung ' + Math.round(100 * x.attended / x.capacity) + '%, Umsatz auf Klassen ' + Math.round(x.revenue) + ' CHF, ohne Besuch ' + (m.novisit || 0) + ' von ' + (m.subs || 0) + ' Abos (' + (m.chf_novisit || 0) + ' CHF)'); });
  Logger.log('Klassenanalyse ' + start + ' bis ' + end + ' fertig. ' + lines.join(' | '));
  return lines.join('\n');
}
// Monatlich am 1. (Zeit-Trigger installMonthlyTrigger): letzter voller Kalendermonat, Kurzbericht an Ruben
function runKlassenanalyseMonthly() {
  var now = new Date(), firstThis = new Date(now.getFullYear(), now.getMonth(), 1), lastPrev = new Date(firstThis.getTime() - 86400000);
  var start = Utilities.formatDate(new Date(lastPrev.getFullYear(), lastPrev.getMonth(), 1), TZ, 'yyyy-MM-dd'), end = Utilities.formatDate(lastPrev, TZ, 'yyyy-MM-dd');
  try {
    var report = runKlassenanalyse(start, end);
    var ma = '';
    try { ma = runMonatsabschluss(start, end); } catch (e2) { ma = 'Monatsabschluss FEHLGESCHLAGEN: ' + String(e2 && e2.message ? e2.message : e2); }
    MailApp.sendEmail({ to: MAIL.fallback, subject: '[Sheet] Monatsabschluss und Klassenanalyse ' + start.slice(0, 7) + ' sind da', body: 'Monatsabschluss fuer ' + start + ' bis ' + end + ' (Tab Monatsabschluss):\n' + ma + '\n\nKlassenanalyse (Tabs Klassenanalyse und Kuendigungsrisiko):\n' + report + '\n\nhttps://docs.google.com/spreadsheets/d/' + SHEET_ID });
  } catch (e) {
    MailApp.sendEmail({ to: MAIL.fallback, subject: '[Sheet] Klassenanalyse ' + start.slice(0, 7) + ' FEHLGESCHLAGEN', body: 'Fehler: ' + String(e && e.message ? e.message : e) + '\n\nNaechster Versuch: im Script-Editor runKlassenanalyseMonthly ausfuehren oder Fenster manuell mit runKlassenanalyse(start, end).' });
    throw e;
  }
}
function installMonthlyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'runKlassenanalyseMonthly') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('runKlassenanalyseMonthly').timeBased().onMonthDay(1).atHour(6).inTimezone(TZ).create();
  Logger.log('Monats-Trigger angelegt: runKlassenanalyseMonthly am 1. um 06:00');
}
// Einmalig: Testeintraege aus Events und Kuendigungen entfernen (Kriterien Ruben 03.09.2026: "test" in Name/Vorname/Nachname/E-Mail oder Rubens Adresse)
function dropTestRows() {
  var ss = SpreadsheetApp.openById(SHEET_ID), total = 0;
  ['Events', 'Kündigungen'].forEach(function (name) {
    var sh = ss.getSheetByName(name); if (!sh || sh.getLastRow() < 2) return;
    var v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues(), head = v[0], cols = [], mail = -1;
    head.forEach(function (h, i) { if (['Name', 'Vorname', 'Nachname', 'E-Mail'].indexOf(String(h)) >= 0) cols.push(i); if (String(h) === 'E-Mail') mail = i; });
    var del = [];
    for (var r = 1; r < v.length; r++) {
      var hit = cols.some(function (c) { return /test/i.test(String(v[r][c] || '')); }) || (mail >= 0 && String(v[r][mail] || '').toLowerCase() === MAIL.fallback);
      if (hit) { del.push(r + 1); Logger.log(name + ' geloescht: ' + cols.map(function (c) { return v[r][c]; }).join(' / ')); }
    }
    for (var j = del.length - 1; j >= 0; j--) sh.deleteRow(del[j]);
    total += del.length;
  });
  Logger.log('Testzeilen entfernt: ' + total);
}


/* ===== Events aus dem Planungs-Sheet (Website /events/) – Events-Chat 03.09.2026 =====
   doGet?token=...&what=events  -> JSON der Zeilen mit Haken "Website" (nie Company events)
   doGet?what=setup -> legt die Website-Spalten im Planungs-Sheet an; what=seed -> fuellt Open Doors 26.09.
   logForm (kind=event) schreibt zusaetzlich die Event-ID und zaehlt Anmeldungen in Spalte "Anmeldungen" des Planungs-Sheets. */
var PLAN_ID = '1cjW80tiosj7-STr-9qsi5CFHesVEoURRj_RAmXIS4S0';
var PLAN_COLS = ['ID','Website','Registration','App link','Friends','Rewards','Text','Image URL','Sign-ups','CalId','Invite']; // English (company default) // Titel = Spalte Notes (Rubens Wunsch 03.09.)
var PLAN_DROP = ['Titel EN','Text EN','Kurzort','Link']; // 03.09.: auf Rubens Wunsch entfernt, Ort kommt aus Location, Link aus Notes
var REG_MODES = ['Form', 'App']; // Registration: Form = website form, App = booking in the IMPACT app (exercise.com), empty = no sign-up
var PLAN_RENAME = { 'Titel DE': 'Titel', 'Text DE': 'Text', 'Anmeldung': 'Registration', 'Freunde': 'Friends', 'Bild-URL': 'Image URL', 'Anmeldungen': 'Sign-ups', 'Einladen': 'Invite' };
function migratePlanSheet() {
  var changedAll = [];
  SpreadsheetApp.openById(PLAN_ID).getSheets().forEach(function (sh) { if (String(sh.getRange(1, 1).getValue() || '').trim().toLowerCase() === 'activity') changedAll = changedAll.concat(migrateOne(sh)); });
  return changedAll;
}
function migrateOne(sh) {
  var head = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String);
  var changed = [];
  head.forEach(function (h, i) { var t = h.trim(); if (PLAN_RENAME[t]) { sh.getRange(1, i + 1).setValue(PLAN_RENAME[t]); changed.push(t + '>' + PLAN_RENAME[t]); } });
  SpreadsheetApp.flush(); // sonst liefert das erneute Lesen der Kopfzeile alte Werte (hat am 03.09. doppelte Titel/Text-Spalten erzeugt)
  head = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String);
  for (var i = head.length - 1; i >= 0; i--) { if (PLAN_DROP.indexOf(head[i].trim()) >= 0) { sh.deleteColumn(i + 1); changed.push('-' + head[i].trim()); } }
  SpreadsheetApp.flush();
  // leere Duplikat-Spalten (gleicher Kopf, keine Daten) entfernen
  head = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String);
  var seen = {}; var last = sh.getLastRow();
  for (var j = head.length - 1; j >= 0; j--) { var t = head[j].trim(); if (!t) continue; var dup = head.slice(0, j).some(function (x) { return x.trim() === t; }); if (!dup) continue;
    var vals = last > 1 ? sh.getRange(2, j + 1, last - 1, 1).getValues() : []; var empty = vals.every(function (v) { return String(v[0] || '') === '' || v[0] === false; });
    if (empty) { sh.deleteColumn(j + 1); changed.push('-dup:' + t); } }
  function moveColTo(name, afterName) { // Spalte "name" direkt hinter "afterName" stellen
    var c = planSheet(sh).col; if (!c[name] || !c[afterName]) return;
    var from = c[name], to = c[afterName] + 1; if (from === to) return;
    if (from > to) sh.moveColumns(sh.getRange(1, from, 1, 1), to); else sh.moveColumns(sh.getRange(1, from, 1, 1), to + 1);
    SpreadsheetApp.flush(); changed.push('move:' + name);
  }
  try {
    // Titel -> Notes uebernehmen, Spalte Titel loeschen (Notes ist ab jetzt der Titel)
    var c0 = planSheet(sh).col;
    if (c0['Titel'] && c0['Notes']) {
      var last0 = sh.getLastRow();
      if (last0 > 1) { var tv = sh.getRange(2, c0['Titel'], last0 - 1, 1).getValues(); var nv = sh.getRange(2, c0['Notes'], last0 - 1, 1).getValues(); var upd = false;
        for (var i = 0; i < tv.length; i++) { if (String(tv[i][0] || '').trim()) { nv[i][0] = tv[i][0]; upd = true; } }
        if (upd) sh.getRange(2, c0['Notes'], last0 - 1, 1).setValues(nv); }
      SpreadsheetApp.flush(); sh.deleteColumn(c0['Titel']); SpreadsheetApp.flush(); changed.push('-Titel>Notes');
    }
    moveColTo('Text', 'Notes');
    moveColTo('Google event', 'Text');
    moveColTo('Invite', 'Google event');
    moveColTo('App link', 'Registration');
    moveColTo('Friends', 'App link');
    // Registration: old checkbox (TRUE/FALSE) -> dropdown Form / App
    var cR = planSheet(sh).col; if (cR['Registration']) {
      var lastR = sh.getLastRow(); if (lastR > 1) {
        var rg = sh.getRange(2, cR['Registration'], lastR - 1, 1); var rv = rg.getValues(); var hadBool = rv.some(function (x) { return x[0] === true || x[0] === false; });
        if (hadBool) { rg.removeCheckboxes(); rg.setValues(rv.map(function (x) { return [x[0] === true ? 'Form' : (x[0] === false ? '' : x[0])]; })); changed.push('reg:checkbox>dropdown'); }
      }
      setRegDropdown(sh, cR['Registration']);
      sh.getRange(1, cR['Registration']).setNote('REGISTRATION\nForm = sign-up form on the website (Name, Email, Phone, optional Friends). Sign-ups are collected in the Lead Log, tab Events, and Abdi/Bogdan get an email.\nApp = members book in the IMPACT app (exercise.com) like a regular class. The website shows a "Book in the app" button and the live number of booked spots. Use this for trainings such as the Wrestling Sparring.\nEmpty = no sign-up button.');
      if (cR['Sign-ups']) sh.getRange(1, cR['Sign-ups']).setNote('SIGN-UPS\nNumber of registrations via the website form, friends included (each friend counts as one and appears in the Lead Log as "Friend" without contact details). Click the number to open the list in the Lead Log, tab Events.\nFor Registration = App the booked spots are shown on the website directly from the IMPACT app.');
      if (cR['App link']) sh.getRange(1, cR['App link']).setNote('APP LINK (optional, only for Registration = App)\nLeave empty: the website finds the class in the exercise.com schedule by title and date and links to it automatically (works once the class has at least one booking).\nOtherwise paste the booking link of the class from app.impact-martialarts.com, or just the service ID.');
    }
    var cI = planSheet(sh).col; if (cI['ID']) { sh.hideColumns(cI['ID']); changed.push('hide:ID'); } if (cI['CalId']) { sh.hideColumns(cI['CalId']); changed.push('hide:CalId'); }
    if (cI['Location']) sh.getRange(1, cI['Location']).setNote('LOCATION / ADDRESS\nJust type or paste the address, multiple lines are fine, e.g.\nWaldmannhalle\nNeugasse 55, 6340 Baar\n\nFor our studios "Zürich" or "Winterthur" is enough (for trainings and community events the website adds the studio address automatically).\nThe website shows the address with a Google Maps link.');
    if (cI['Invite']) sh.getRange(1, cI['Invite']).setNote('INVITE (optional)\nEmpty = the whole team gets the calendar invitation.\nOtherwise first names separated by commas, e.g. "Abdi, Bogdan, Nate".\nPossible: Abdi, Bogdan, Ruben, Sam, Joao, Laszlo, Sergei, Nate (or email addresses).\nChanges are applied to the calendar event within 10 minutes.');
    if (cI['Google event']) sh.getRange(1, cI['Google event']).setNote('GOOGLE CALENDAR\nTick = within 10 minutes the script creates a calendar event (title from Notes, time, address, Text) and sends the invitation to the whole team (or only to the people in the "Invite" column). The script is the single source: please do not create these events manually in the calendar. Untick = the event is deleted again.');
  } catch (mv) { changed.push('move-fehler:' + mv); }
  // Bild-URL: Kopfzeile verlinkt auf den Drive-Ordner + Notiz mit Anleitung
  try {
    var ps1 = planSheet(sh); if (ps1.col['Image URL']) {
      var hc = sh.getRange(1, ps1.col['Image URL']); // Kopfzeile einer Google-"Tabelle": keine Formeln erlaubt, darum nur Notiz
      hc.setNote('EVENT IMAGES\nFolder "' + IMG_FOLDER_NAME + '": ' + IMG_FOLDER_URL + '\n\nHow to: 1) Put the image in the folder. 2) Right-click the file > Share > Copy link. 3) Paste the link into this cell.\nNo sharing settings needed, the website fetches the image itself. Portrait flyers are shown in full.');
      SpreadsheetApp.flush();
    }
  } catch (nt) { changed.push('note-fehler:' + nt); }
  planSheet(sh);
  return changed;
}
var IMG_FOLDER_URL = 'https://drive.google.com/drive/folders/1-FjLvXhXBjdYUZOFaNRvIIM1OB-rdF-d';
var IMG_FOLDER_NAME = 'Event Images';
function planSheets() { // alle Tabs (z.B. 2026, 2027), deren A1 "Activity" heisst
  var ss = SpreadsheetApp.openById(PLAN_ID);
  return ss.getSheets().filter(function (sh) { return String(sh.getRange(1, 1).getValue() || '').trim().toLowerCase() === 'activity'; }).map(function (sh) { return planSheet(sh); });
}
function planSheet(sheet) {
  var ss = SpreadsheetApp.openById(PLAN_ID);
  var sh = sheet || ss.getSheets().filter(function (x) { return String(x.getRange(1, 1).getValue() || '').trim().toLowerCase() === 'activity'; })[0] || ss.getSheets()[0];
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var head = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  var col = {};
  head.forEach(function (h, i) { var t = h.trim(); if (t && !col[t]) col[t] = i + 1; }); // erste Spalte gewinnt bei Duplikaten
  var need = PLAN_COLS.filter(function (c) { return !col[c]; });
  if (need.length) {
    var start = lastCol + 1;
    sh.getRange(1, start, 1, need.length).setValues([need]).setFontWeight('bold');
    need.forEach(function (c, i) { col[c] = start + i; });
    var last = Math.max(sh.getLastRow(), 2);
    ['Website', 'Friends', 'Rewards'].forEach(function (c) { if (need.indexOf(c) >= 0) sh.getRange(2, col[c], last - 1, 1).insertCheckboxes(); });
    if (need.indexOf('Registration') >= 0) setRegDropdown(sh, col['Registration']);
  }
  return { sh: sh, col: col };
}
function setRegDropdown(sh, c) { // Registration: dropdown Form / App (empty allowed)
  var last = Math.max(sh.getLastRow(), 2);
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(REG_MODES, true).setAllowInvalid(false).build();
  sh.getRange(2, c, Math.max(last - 1, 1) + 200, 1).setDataValidation(rule);
}
function regMode(v) { // true/'Form' -> 'form', 'App' -> 'app', else ''
  if (v === true) return 'form'; var t = String(v || '').trim().toLowerCase();
  return t === 'form' || t === 'true' ? 'form' : t === 'app' ? 'app' : '';
}
function slugify(s) { return String(s || '').toLowerCase().replace(/[äöü]/g, function (c) { return { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue' }[c]; }).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); }
function fmtDate(d) { return (d instanceof Date && !isNaN(d)) ? Utilities.formatDate(d, 'Europe/Zurich', "yyyy-MM-dd'T'HH:mm") : ''; }
function ensureIds(ps) {
  var sh = ps.sh, col = ps.col, last = sh.getLastRow(); if (last < 2) return;
  var all = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  var ids = sh.getRange(2, col['ID'], last - 1, 1).getValues();
  var changed = false;
  for (var i = 0; i < all.length; i++) {
    var acts = [[all[i][(col['Activity'] || 1) - 1], all[i][(col['Activity type'] || 2) - 1], all[i][(col['Start time'] || 3) - 1]]];
    if (String(ids[i][0] || '').trim() || !String(acts[0][0] || '').trim()) continue;
    var d = acts[0][2]; var ds = (d instanceof Date && !isNaN(d)) ? Utilities.formatDate(d, 'Europe/Zurich', 'yyyyMMdd') : 'tbd';
    ids[i][0] = 'ev-' + ds + '-' + slugify(acts[0][0]); changed = true;
  }
  if (changed) sh.getRange(2, col['ID'], last - 1, 1).setValues(ids);
}
function readEvents() {
  var all = [];
  planSheets().forEach(function (ps) { all = all.concat(readEventsFrom(ps)); });
  // Tab-Kopien (2026/2027) mit gleichen IDs: bevorzugt die Zeile aus dem Tab, dessen Name das Jahr des Events ist (dort wird gepflegt)
  var byKey = {}; all.forEach(function (x) { var k = x.id || (x.activity + x.start); (byKey[k] = byKey[k] || []).push(x); });
  all = Object.keys(byKey).map(function (k) { var c = byKey[k]; if (c.length === 1) return c[0];
    var yr = String((c[0].start || '').slice(0, 4)); var m = c.filter(function (x) { return String(x.tab).trim() === yr; })[0];
    return m || c.filter(function (x) { return x.registration || x.app || x.friends || x.rewards; })[0] || c[c.length - 1]; });
  all.sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
  return all;
}
function readEventsFrom(ps) {
  ensureIds(ps);
  var sh = ps.sh, col = ps.col, last = sh.getLastRow(); if (last < 2) return [];
  var rows = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  var g = function (r, name) { return col[name] ? r[col[name] - 1] : ''; };
  var out = [];
  rows.forEach(function (r) {
    var type = String(g(r, 'Activity type') || '').trim();
    if (!String(g(r, 'Activity') || '').trim() || !type || /company/i.test(type)) return;
    if (g(r, 'Website') !== true) return;
    var notes = String(g(r, 'Notes') || ''); var lm = notes.match(/https?:\/\/[^\s)]+/);
    var title = notes.replace(/https?:\/\/[^\s)]+/g, '').replace(/\s+/g, ' ').trim(); // Notes = Titel, Links werden herausgenommen
    out.push({ id: String(g(r, 'ID') || ''), tab: sh.getName(), activity: String(g(r, 'Activity')), type: type, start: fmtDate(g(r, 'Start time')), end: fmtDate(g(r, 'End time')),
      location: String(g(r, 'Location') || ''), owner: String(g(r, 'Owner') || ''), title: title, text: String(g(r, 'Text') || ''),
      registration: regMode(g(r, 'Registration')) === 'form', app: regMode(g(r, 'Registration')) === 'app', app_link: String(g(r, 'App link') || '').trim(), friends: g(r, 'Friends') === true, rewards: g(r, 'Rewards') === true,
      link: lm ? lm[0] : '', image: String(g(r, 'Image URL') || ''), signups: Number(g(r, 'Sign-ups') || 0) });
  });
  return out;
}
function updateSignupCount(ss, eventId) {
  try {
    if (!eventId) return;
    var ev = ss.getSheetByName('Events'); if (!ev || ev.getLastRow() < 2) return;
    var head = ev.getRange(1, 1, 1, ev.getLastColumn()).getValues()[0].map(String);
    var idCol = 10; // Position von Event-ID in der Zeile aus logForm (11. Spalte)
    if (String(head[idCol] || '') !== 'Event ID') { ev.getRange(1, idCol + 1).setValue('Event ID').setFontWeight('bold'); var stray = head.indexOf('Event-ID'); if (stray < 0) stray = head.indexOf('Event ID'); if (stray >= 0 && stray !== idCol) ev.getRange(1, stray + 1).setValue(''); }
    var vals = ev.getRange(2, 1, ev.getLastRow() - 1, ev.getLastColumn()).getValues();
    var n = 0; vals.forEach(function (r) { if (String(r[idCol]) === String(eventId)) n++; });
    var yr = String(eventId).match(/^ev-(\d{4})/); var list = planSheets(); if (yr) list.sort(function (a, b) { return (String(a.sh.getName()).trim() === yr[1] ? -1 : 0) - (String(b.sh.getName()).trim() === yr[1] ? -1 : 0); });
    list.forEach(function (ps) { var last = ps.sh.getLastRow(); if (last < 2) return;
      var ids = ps.sh.getRange(2, ps.col['ID'], last - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) { if (String(ids[i][0]) === String(eventId)) {
        var link = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit#gid=' + ev.getSheetId();
        ps.sh.getRange(i + 2, ps.col['Sign-ups']).setFormula('=HYPERLINK("' + link + '";' + n + ')'); return; } } });
  } catch (e) {}
}
function setRegistration(eventId, mode) { // one-off helper: ?what=setreg&id=<event id>&mode=App|Form|
  var val = mode === 'App' ? 'App' : mode === 'Form' ? 'Form' : ''; var done = [];
  planSheets().forEach(function (ps) { ensureIds(ps); var last = ps.sh.getLastRow(); if (last < 2) return;
    var ids = ps.sh.getRange(2, ps.col['ID'], last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(eventId)) { ps.sh.getRange(i + 2, ps.col['Registration']).setValue(val); done.push(ps.sh.getName() + ':' + (i + 2)); } });
  return done;
}
function recountSignups() { // zaehlt Sign-ups aller Events neu (nach manuellem Loeschen von Zeilen im Tab Events); laeuft im Kalender-Trigger mit und per ?what=recount
  var ss = SpreadsheetApp.openById(SHEET_ID); var ev = ss.getSheetByName('Events'); var counts = {};
  if (ev && ev.getLastRow() > 1) ev.getRange(2, 11, ev.getLastRow() - 1, 1).getValues().forEach(function (r) { var k = String(r[0] || '').trim(); if (k) counts[k] = (counts[k] || 0) + 1; });
  var link = ev ? 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit#gid=' + ev.getSheetId() : ''; var changed = [];
  planSheets().forEach(function (ps) { var last = ps.sh.getLastRow(); if (last < 2 || !ps.col['Sign-ups']) return;
    var ids = ps.sh.getRange(2, ps.col['ID'], last - 1, 1).getValues(); var cur = ps.sh.getRange(2, ps.col['Sign-ups'], last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) { var id = String(ids[i][0] || '').trim(); if (!id) continue; var n = counts[id] || 0; if (Number(cur[i][0] || 0) === n) continue;
      var cell = ps.sh.getRange(i + 2, ps.col['Sign-ups']); if (n > 0) cell.setFormula('=HYPERLINK("' + link + '";' + n + ')'); else cell.setValue(0); changed.push(ps.sh.getName() + ':' + id + '=' + n); } });
  return changed;
}
function seedOpenDoors() {
  var ps = planSheet(); ensureIds(ps); var sh = ps.sh, col = ps.col, last = sh.getLastRow();
  var ids = sh.getRange(2, col['ID'], last - 1, 1).getValues(); var done = [];
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) !== 'ev-20260926-community-event-open-doors-zuerich') continue;
    var r = i + 2;
    sh.getRange(r, col['Website']).setValue(true); sh.getRange(r, col['Registration']).setValue('Form'); sh.getRange(r, col['Rewards']).setValue(true);
    sh.getRange(r, col['Titel']).setValue('Community Event: Open Doors Zürich');
    sh.getRange(r, col['Text']).setValue('Ein Nachmittag voller Action: Open Mat, BJJ, Muay Thai und MMA. Exklusive Angebote, lerne die Coaches kennen, Snacks und Drinks. Verbring ein paar Stunden mit uns auf der Matte und erlebe die Energie unserer Community.'); done.push(r);
  }
  return done;
}
function driveImage(id) {
  try {
    var f = DriveApp.getFileById(String(id).replace(/[^\w-]/g, ''));
    var blob = f.getBlob(); var mime = blob.getContentType() || '';
    if (mime.indexOf('image/') !== 0) return { error: 'not-image' };
    if (blob.getBytes().length > 6 * 1024 * 1024) return { error: 'too-large' };
    return { ok: true, mime: mime, b64: Utilities.base64Encode(blob.getBytes()) };
  } catch (err) { return { error: String(err) }; }
}
function authDrive() { return DriveApp.getRootFolder().getName(); } // einmal im Editor ausfuehren, um den Drive-Zugriff zu autorisieren
/* ===== Google-Kalender: Termin + Einladungen bei Haken "Google event" ===== */
// Verteiler aller Mitarbeitenden (Ruben, 04.09.2026). Kurzname -> E-Mail; Spalte "Einladen" im Sheet: leer = alle, sonst Kurznamen/E-Mails mit Komma
var STAFF = { abdi: 'abdi@impact-martialarts.com', bogdan: 'bogdan@impact-martialarts.com', ruben: 'ruben@impact-martialarts.com', info: 'info@impact-martialarts.com',
  joao: 'joao@impact-martialarts.com', laszlo: 'lasz.simo7@gmail.com', sergei: 'surgejlubcenko@gmail.com', nate: 'nathan@thomasmelliger.ch' };
var STAFF_ALIAS = { sam: 'info', samuel: 'info', 'joão': 'joao', jo: 'joao', lasz: 'laszlo', laszlo: 'laszlo', sergey: 'sergei', sergei: 'sergei', nathan: 'nate', nate: 'nate', abdallah: 'abdi', abdi: 'abdi', bogdan: 'bogdan', ruben: 'ruben', info: 'info', joao: 'joao' };
var INVITE_LIST = Object.keys(STAFF).map(function (k) { return STAFF[k]; });
function guestsFor(spec) { // "Abdi, Bogdan, nate" oder E-Mails -> Liste; leer = alle
  var txt = String(spec || '').trim(); if (!txt) return INVITE_LIST.slice();
  var out = [];
  txt.split(/[,;\/\n]+/).forEach(function (t) { t = t.trim(); if (!t) return;
    if (t.indexOf('@') > 0) { out.push(t.toLowerCase()); return; }
    var k = t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/)[0];
    var key = STAFF_ALIAS[k] || k; if (STAFF[key]) out.push(STAFF[key]); });
  return out.filter(function (e, i, a) { return a.indexOf(e) === i; });
}
var CAL_TAG = '[IMPACT Events]';
function authCalendar() { return CalendarApp.getDefaultCalendar().getName(); } // einmal im Editor ausfuehren (Kalender-Freigabe)
function installCalendarTrigger() {
  var have = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'syncCalendar'; });
  if (!have) ScriptApp.newTrigger('syncCalendar').timeBased().everyMinutes(10).create();
  return have ? 'trigger existiert' : 'trigger angelegt';
}
function syncCalendar() {
  try { recountSignups(); } catch (rc) {} // Sign-ups alle 10 Min nachzaehlen (geloeschte Testzeilen)
  var cal = CalendarApp.getDefaultCalendar(); var log = []; var today = new Date(); today.setHours(0, 0, 0, 0);
  // Gleiche ID in mehreren Jahres-Tabs (Tab-Kopien): nur der Tab, dessen Name das Jahr des Events ist, legt Termine an
  var sheets = planSheets(); var owner = {};
  sheets.forEach(function (ps) { var sh = ps.sh, col = ps.col, last = sh.getLastRow(); if (last < 2 || !col['ID']) return;
    sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues().forEach(function (r) { var id = String(r[col['ID'] - 1] || '').trim(); if (!id) return;
      var st = r[(col['Start time'] || 3) - 1]; var yr = (st instanceof Date && !isNaN(st)) ? String(st.getFullYear()) : ''; var tab = String(sh.getName()).trim();
      if (!owner[id] || tab === yr) owner[id] = tab; }); });
  sheets.forEach(function (ps) {
    var sh = ps.sh, col = ps.col, last = sh.getLastRow(); if (last < 2 || !col['Google event'] || !col['CalId']) return;
    var rows = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
    var g = function (r, name) { return col[name] ? r[col[name] - 1] : ''; };
    rows.forEach(function (r, i) {
      var act = String(g(r, 'Activity') || '').trim(); if (!act) return;
      var id = String(g(r, 'ID') || '').trim(); var canonical = !id || owner[id] === String(sh.getName()).trim();
      var want = canonical && g(r, 'Google event') === true; var calId = String(g(r, 'CalId') || '').trim();
      if (!canonical && !calId) return;
      var st = g(r, 'Start time'), en = g(r, 'End time');
      var okDate = st instanceof Date && !isNaN(st);
      if (want && !okDate) return;
      if (want && st < today) return; // Vergangenes nicht nachtragen
      var title = String(g(r, 'Notes') || '').replace(/https?:\/\/[^\s)]+/g, '').replace(/\s+/g, ' ').trim() || act;
      var loc = String(g(r, 'Location') || '').replace(/\r?\n+/g, ', ');
      var isComp = /compet/i.test(String(g(r, 'Activity type') || '')); // Wettkaempfe: "Zürich" bleibt "Zürich" (nicht unser Studio)
      if (!isComp && /^(z(u|ü)rich)$/i.test(loc.trim())) loc = 'IMPACT Martial Arts, Walchestrasse 15, 8006 Zürich';
      if (!isComp && /^winterthur$/i.test(loc.trim())) loc = 'IMPACT Martial Arts, Technoparkstrasse 3, 8406 Winterthur';
      if (/impact martial arts z/i.test(loc)) loc = 'IMPACT Martial Arts, Walchestrasse 15, 8006 Zürich';
      if (/impact martial arts w/i.test(loc)) loc = 'IMPACT Martial Arts, Technoparkstrasse 3, 8406 Winterthur';
      var desc = [String(g(r, 'Text') || ''), 'Type: ' + String(g(r, 'Activity type') || ''), 'Owner: ' + String(g(r, 'Owner') || ''), 'Website: https://www.impact-martialarts.com/events/', CAL_TAG].filter(Boolean).join('\n');
      var allDay = okDate && st.getHours() === 0 && st.getMinutes() === 0 && (!(en instanceof Date) || isNaN(en) || (en.getHours() === 0 && en.getMinutes() === 0));
      var endOk = en instanceof Date && !isNaN(en) && en > st;
      try {
        var ev = calId ? (function () { try { return cal.getEventById(calId); } catch (x) { return null; } })() : null;
        if (want && !ev) {
          var gl = guestsFor(g(r, 'Invite'));
          ev = allDay ? cal.createAllDayEvent(title, st, { location: loc, description: desc, guests: gl.join(','), sendInvites: true })
                      : cal.createEvent(title, st, endOk ? en : new Date(st.getTime() + 90 * 60000), { location: loc, description: desc, guests: gl.join(','), sendInvites: true });
          sh.getRange(i + 2, col['CalId']).setValue(ev.getId()); log.push('+' + title);
        } else if (want && ev) {
          if (ev.getTitle() !== title) ev.setTitle(title);
          if (ev.getLocation() !== loc) ev.setLocation(loc);
          if (!allDay && endOk && (ev.getStartTime().getTime() !== st.getTime() || ev.getEndTime().getTime() !== en.getTime())) ev.setTime(st, en);
          var want2 = guestsFor(g(r, 'Invite')); var have = ev.getGuestList().map(function (x) { return x.getEmail().toLowerCase(); });
          want2.forEach(function (m) { if (have.indexOf(m) < 0 && m !== 'ruben@impact-martialarts.com') { ev.addGuest(m); log.push('gast+' + m + ':' + title); } });
          have.forEach(function (m) { if (want2.indexOf(m) < 0) { ev.removeGuest(m); log.push('gast-' + m + ':' + title); } });
        } else if (!want && ev) { ev.deleteEvent(); sh.getRange(i + 2, col['CalId']).setValue(''); log.push('-' + title); }
      } catch (err) { log.push('fehler:' + title + ':' + err); }
    });
  });
  return log;
}
function doGet(e) {
  var q = (e && e.parameter) || {};
  if (q.token !== TOKEN) return out({ error: 'unauthorized' });
  try {
    if (q.what === 'events') return out({ ok: true, events: readEvents() });
    if (q.what === 'seed') return out({ ok: true, rows: seedOpenDoors() });
    if (q.what === 'setup') { planSheets(); return out({ ok: true }); }
    if (q.what === 'calsync') return out({ ok: true, log: syncCalendar() });
    if (q.what === 'caltrigger') return out({ ok: true, trigger: installCalendarTrigger() });
    if (q.what === 'image' && q.id) return out(driveImage(q.id));
    if (q.what === 'migrate') return out({ ok: true, changed: migratePlanSheet() });
    if (q.what === 'recount') return out({ ok: true, changed: recountSignups() });
    if (q.what === 'setreg' && q.id) return out({ ok: true, set: setRegistration(q.id, q.mode || '') });
  } catch (err) { return out({ error: String(err) }); }
  return out({ ok: true });
}

// ------------------------------------------------------------ Monatsabschluss (seit 03.09.2026, Entscheid Ruben)
// Kennzahlen des Finanzplans und Funnel je Standort, Monate als Spalten. Daten aus der Cloudflare-Funktion (action 'monat'),
// gespeichert im versteckten Tab MonatsHistorie (Monat, Standort, Kennzahl, Wert) und Kohorten (Probetrainer je Monat).
// Kohorten-Conversion wird bei jedem Lauf fuer die letzten drei Monate neu gerechnet (Nachzuegler).
var MA_SHEET = 'Monatsabschluss', MA_HIST = 'MonatsHistorie', MA_COHORT = 'Kohorten';
var MA_ROWS = [
  ['leads_web', 'Leads Website (Log)', '0'],
  ['leads_all', 'Leads gesamt in exercise.com (alle Quellen)', '0'],
  ['trial_booked_transitions', 'Probetraining gebucht (Lifecycle)', '0'],
  ['first_visits', 'Erstbesuche laut Report', '0'],
  ['first_visits_excluded', 'davon keine Probetrainer (Altkunden, Staff)', '0'],
  ['trial_noshow', 'Nicht erschienen', '0'],
  ['trial_attended', 'Probetraining stattgefunden', '0'],
  ['noshow_rate', 'No-Show-Quote', '0%'],
  ['signed_at_trial', 'davon Abo bis zum ersten Training abgeschlossen', '0'],
  ['sales_signed', 'Verkäufe (Vertrag unterschrieben)', '0'],
  ['sales_open', 'davon Zahlung noch offen', '0'],
  ['new_customers', 'Abos gestartet (ohne Wechsel, ohne PT)', '0'],
  ['conv_sales_trial', 'Quote Verkäufe / Probetrainings', '0%'],
  ['conv_sales_lead', 'Quote Verkäufe / Leads (alle Quellen)', '0%'],
  ['conv_simple', 'Quote Abos gestartet / Probetrainings', '0%'],
  ['conv_cohort_n', 'Kohorte: Probetrainer des Monats mit Abo bis heute', '0'],
  ['conv_cohort_rate', 'Kohorten-Conversion (reift 3 Monate nach)', '0%'],
  ['switches', 'Paketwechsel', '0'],
  ['cancellations', 'Kündigungen (ohne Wechsel)', '0'],
  ['net_growth', 'Nettowachstum', '0'],
  ['lost_after_trial', 'Nach Probetraining verloren (Lifecycle)', '0'],
  ['active_subs', 'Aktive Abos (Stand Lauf)', '0'],
  ['paused_subs', 'Pausierte Abos', '0'],
  ['pending_cancel', 'Abos mit Kündigung auf Periodenende', '0'],
  ['churn_rate', 'Churn (Kündigungen / Abos)', '0.0%'],
  ['mrr_net', 'Abo-Umsatz netto pro Monat (laufende Abos)', '#,##0'],
  ['avg_sub_net', 'Ø Abo-Wert netto', '#,##0'],
  ['rev_membership_gross', 'Abo-Einnahmen brutto (Sales by Category)', '#,##0'],
  ['rev_membership_net', 'Abo-Einnahmen netto', '#,##0'],
  ['starter_count', 'Starter Packs Stück', '0'],
  ['rev_starter_gross', 'Starter Packs brutto', '#,##0'],
  ['pt_count', 'Personal Training Käufer', '0'],
  ['rev_pt_gross', 'Personal Training brutto', '#,##0'],
  ['rev_gear_gross', 'Gear brutto', '#,##0'],
  ['rev_total_gross', 'Verkäufe gesamt brutto', '#,##0'],
  ['rev_total_net', 'Verkäufe gesamt netto', '#,##0'],
];
function maCall(body) { body.action = 'monat'; return klassenCall(body); }
// Monatsschluessel 'yyyy-MM' auch dann, wenn Sheets die Zelle als Datum interpretiert hat
function mkOf(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM') : String(v); }
function dOfCell(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v || '').slice(0, 10); }
function monthKeyStr(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM'); }
function runMonatsabschluss(start, end) {
  var mk = start.slice(0, 7), m0 = new Date(start + 'T00:00:00');
  var cohortStart = Utilities.formatDate(new Date(m0.getFullYear(), m0.getMonth() - 2, 1), TZ, 'yyyy-MM-dd'), today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  var base = { start: start, end: end, cohort_start: cohortStart, today: today };
  var p1 = maCall(Object.assign({ phase: 'm1' }, base)); if (p1.error) throw new Error('Monat m1: ' + JSON.stringify(p1).slice(0, 300));
  var p2 = null, p3 = null, i;
  for (i = 0; i < 7; i++) { Utilities.sleep(20000); p2 = maCall(Object.assign({ phase: 'm2' }, base)); if (p2.error) throw new Error('Monat m2: ' + JSON.stringify(p2).slice(0, 300)); if (p2.ready) break; }
  if (!p2 || !p2.ready) throw new Error('Monat m2 nicht fertig: ' + JSON.stringify(p2).slice(0, 200));
  for (i = 0; i < 7; i++) { Utilities.sleep(20000); p3 = maCall(Object.assign({ phase: 'm3', fv_zh: p2.fv_zh, sales_zh: p2.sales_zh }, base)); if (p3.error) throw new Error('Monat m3: ' + JSON.stringify(p3).slice(0, 300)); if (p3.ready) break; }
  if (!p3 || !p3.ready) throw new Error('Monat m3 nicht fertig: ' + JSON.stringify(p3).slice(0, 400));
  var data = p3.data, ss = SpreadsheetApp.openById(SHEET_ID);
  maStoreCohorts(ss, mk, data.cohort || {});
  var lines = [];
  ['Zurich', 'Winterthur'].forEach(function (loc) {
    var L = data.locations[loc] || {}, m = {};
    Object.keys(L).forEach(function (k) { if (typeof L[k] === 'number') m[k] = L[k]; });
    var fvNet = (L.first_visits || 0) - (L.first_visits_excluded || 0);
    m.noshow_rate = fvNet ? (L.trial_noshow || 0) / fvNet : 0;
    m.conv_simple = L.trial_attended ? (L.new_customers || 0) / L.trial_attended : 0;
    m.conv_sales_trial = L.trial_attended ? (L.sales_signed || 0) / L.trial_attended : 0;
    m.conv_sales_lead = L.leads_all ? (L.sales_signed || 0) / L.leads_all : 0;
    maStoreMetrics(ss, mk, loc, m);
    lines.push(loc + ': ' + (L.trial_attended || 0) + ' Probetrainings, ' + (L.new_customers || 0) + ' Neukunden, ' + (L.cancellations || 0) + ' Kuendigungen, netto ' + (L.net_growth || 0) + ', Abo-Umsatz brutto ' + (L.rev_membership_gross || 0) + ' CHF');
  });
  // Kohorten-Conversion fuer diesen und die zwei Vormonate
  var since = data.started_since || [];
  for (var back = 0; back < 3; back++) {
    var mkB = monthKeyStr(new Date(m0.getFullYear(), m0.getMonth() - back, 1));
    ['Zurich', 'Winterthur'].forEach(function (loc) {
      var coh = maReadCohort(ss, mkB, loc); if (!coh.length) return;
      var n = 0;
      coh.forEach(function (c) { if (since.some(function (s) { return (s.uid === c.uid || (c.email && s.email === c.email)) && s.date >= c.date; })) n++; });
      maStoreMetrics(ss, mkB, loc, { conv_cohort_n: n, conv_cohort_rate: n / coh.length });
    });
  }
  buildMonatsabschluss(ss);
  Logger.log('Monatsabschluss ' + mk + ': ' + lines.join(' | '));
  return lines.join('\n');
}
// Einmalige Nachberechnung ganzer Monate, wenn sich die Kennzahlen geaendert haben (der Funktionswaehler im Editor
// reagiert nicht auf Automations-Klicks, deshalb stoesst der Stundenlauf den Nachlauf selbst an). Ein Monat je Ausfuehrung,
// weil ein Monatslauf mit den Wartezeiten fast das 6-Minuten-Limit braucht; die Warteschlange steht in den Script Properties.
var MA_CATCHUP = '2026-09-05 Verkaufsquoten'; // Marke aendern = Nachlauf laeuft erneut
var MA_CATCHUP_MONTHS = ['2026-08', '2026-09'];
function maQueueCatchUp() {
  var pr = PropertiesService.getScriptProperties(); if (pr.getProperty('maCatchUp') === MA_CATCHUP) return;
  pr.setProperty('maCatchUp', MA_CATCHUP); pr.setProperty('maQueue', JSON.stringify(MA_CATCHUP_MONTHS));
  maDropCatchUpTriggers(); ScriptApp.newTrigger('maCatchUp').timeBased().after(5 * 60 * 1000).create(); // erst nach dem laufenden Stundenlauf
}
function maDropCatchUpTriggers() { ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'maCatchUp') ScriptApp.deleteTrigger(t); }); }
function maCatchUp() {
  var pr = PropertiesService.getScriptProperties(), q = JSON.parse(pr.getProperty('maQueue') || '[]');
  maDropCatchUpTriggers();
  if (!q.length) return;
  var mk = q.shift(); pr.setProperty('maQueue', JSON.stringify(q));
  var d = new Date(mk + '-01T12:00:00'), last = new Date(d.getFullYear(), d.getMonth() + 1, 0), now = new Date();
  try { runMonatsabschluss(mk + '-01', fmtD(last < now ? last : now)); } catch (e) {
    MailApp.sendEmail({ to: MAIL.fallback, subject: '[Monatsabschluss] Nachlauf ' + mk + ' FEHLGESCHLAGEN', body: String(e && e.stack ? e.stack : e) });
  }
  if (q.length) ScriptApp.newTrigger('maCatchUp').timeBased().after(60 * 1000).create();
}
function maStoreCohorts(ss, mk, cohort) {
  var sh = getOrCreate(ss, MA_COHORT), head = ['Monat', 'Standort', 'UID', 'E-Mail', 'Name', 'Erstbesuch'];
  if (sh.getLastRow() === 0) { sh.appendRow(head); sh.setFrozenRows(1); sh.hideSheet(); }
  var keep = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, head.length).getValues().filter(function (r) { return mkOf(r[0]) !== mk; }) : [];
  keep.forEach(function (r) { r[0] = mkOf(r[0]); });
  Object.keys(cohort).forEach(function (loc) { (cohort[loc] || []).forEach(function (c) { keep.push([mk, loc, String(c.uid), c.email || '', c.name || '', c.date || '']); }); });
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, head.length).clearContent();
  if (keep.length) { sh.getRange(2, 1, keep.length, 1).setNumberFormat('@'); sh.getRange(2, 3, keep.length, 1).setNumberFormat('@'); sh.getRange(2, 6, keep.length, 1).setNumberFormat('@'); sh.getRange(2, 1, keep.length, head.length).setValues(keep); }
}
function maReadCohort(ss, mk, loc) {
  var sh = ss.getSheetByName(MA_COHORT); if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues().filter(function (r) { return mkOf(r[0]) === mk && r[1] === loc; }).map(function (r) { return { uid: String(r[2]), email: String(r[3] || '').toLowerCase(), date: dOfCell(r[5]) }; });
}
function maStoreMetrics(ss, mk, loc, metrics) {
  var sh = getOrCreate(ss, MA_HIST), head = ['Monat', 'Standort', 'Kennzahl', 'Wert'];
  if (sh.getLastRow() === 0) { sh.appendRow(head); sh.setFrozenRows(1); sh.hideSheet(); }
  var rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues() : [];
  rows.forEach(function (r) { r[0] = mkOf(r[0]); });
  var idx = {}; rows.forEach(function (r, i) { idx[r[0] + '|' + r[1] + '|' + r[2]] = i; });
  Object.keys(metrics).forEach(function (k) {
    var key = mk + '|' + loc + '|' + k;
    if (idx[key] !== undefined) rows[idx[key]][3] = metrics[k]; else { rows.push([mk, loc, k, metrics[k]]); idx[key] = rows.length - 1; }
  });
  sh.getRange(2, 1, rows.length, 1).setNumberFormat('@'); sh.getRange(2, 1, rows.length, 4).setValues(rows);
}
// Kopftext (Methodik) steht in B2, damit Spalte A eingefroren werden kann (Ruben 05.09.2026)
var MA_NOTE = 'Automatisch aus exercise.com (Lifecycle, Erstbesuche, Check-ins, Vertragsunterschriften, gestartete und gekündigte Abos, Sales by Category). '
  + 'Probetraining stattgefunden = Erstbesucher mit Check-in im Monat, ohne Altkunden und Staff. Verkäufe = Vertragsunterschriften im Monat (Waiver), auch wenn das Abo später startet; '
  + 'Abos gestartet = Abo-Starts ohne Paketwechsel und ohne Personal Training. Kündigungen ohne Wechsel. Kohorten-Conversion = Probetrainer des Monats, die bis heute ein Abo gestartet haben; wird drei Monate lang nachgeführt. '
  + 'Abo-Bestand und Abo-Umsatz netto = Stand am Tag des Laufs. Leads Website vor September 2026 = manuell gezählte Monatszahlen (Ruben, 02.09.2026); Website-Leads nach Kanal je Standort ab September 2026. '
  + 'Diagramme rechts: "Leads" = alle Quellen aus exercise.com, für Monate ohne diesen Wert (vor August 2026) die Website-Leads. Interessen stehen nur noch im Diagramm, nicht mehr in der Liste.';
function buildMonatsabschluss(ss) {
  var sh = getOrCreate(ss, MA_SHEET); clearSheet(sh);
  if (sh.getMaxColumns() < 30) sh.insertColumnsAfter(sh.getMaxColumns(), 30 - sh.getMaxColumns());
  sh.setFrozenColumns(0); sh.getRange(2, 1, 1, sh.getMaxColumns()).breakApart();
  var hist = ss.getSheetByName(MA_HIST), hv = hist && hist.getLastRow() > 1 ? hist.getRange(2, 1, hist.getLastRow() - 1, 4).getValues() : [];
  var months = {}; hv.forEach(function (r) { months[mkOf(r[0])] = 1; });
  months[Utilities.formatDate(new Date(), TZ, 'yyyy-MM')] = 1; // laufender Monat immer dabei (Leads Website, Kanal live)
  var keys = Object.keys(months).sort().slice(-12);
  var val = {}; hv.forEach(function (r) { val[mkOf(r[0]) + '|' + r[1] + '|' + r[2]] = r[3]; });
  var vOf = function (k, loc, name) { var v = val[k + '|' + loc + '|' + name]; return v === undefined || v === '' ? '' : v; };
  var dt = function (k) { return new Date(k + '-01T00:00:00'); };
  sh.getRange('A1').setValue('IMPACT Monatsabschluss').setFontSize(16).setFontWeight('bold');
  sh.getRange('A2').setValue('Methodik').setFontColor('#999999');
  sh.getRange('B2').setValue(MA_NOTE).setFontColor('#666666').setWrap(true);
  sh.getRange('B2:N2').merge(); sh.setRowHeight(2, 88);
  var r = 4, blocks = [];
  ['Zurich', 'Winterthur'].forEach(function (loc) {
    var locDE = loc === 'Zurich' ? 'Zürich' : 'Winterthur';
    sh.getRange(r, 1).setValue(locDE).setFontWeight('bold').setFontSize(13); r++;
    var head = ['Kennzahl'].concat(keys.map(dt));
    sh.getRange(r, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#f3f3f3');
    sh.getRange(r, 2, 1, keys.length).setNumberFormat('mmm yyyy');
    var hdr = r; r++;
    var rowsDef = [];
    MA_ROWS.forEach(function (def) { rowsDef.push(def); if (def[0] === 'leads_web') KANAL_ORDER.forEach(function (kn) { rowsDef.push(['kanal:' + kn, '   davon ' + kn, '0']); }); });
    rowsDef.forEach(function (def) {
      var row = [def[1]];
      keys.forEach(function (k, ci) {
        var col = String.fromCharCode(66 + ci);
        if (def[0] === 'leads_web' && k >= LOG_START.slice(0, 7)) row.push(maCountLeads(col + '$' + hdr, locDE, null, null));
        else if (def[0].indexOf('kanal:') === 0) row.push(k < LOG_START.slice(0, 7) ? '' : maCountLeads(col + '$' + hdr, locDE, 'J', def[0].split(':')[1]));
        else row.push(vOf(k, loc, def[0]));
      });
      sh.getRange(r, 1, 1, row.length).setValues([row]);
      if (def[0].indexOf('kanal:') === 0) sh.getRange(r, 1).setFontColor('#666666');
      if (keys.length) sh.getRange(r, 2, 1, keys.length).setNumberFormat(def[2]);
      if (['trial_attended', 'sales_signed', 'new_customers', 'net_growth', 'rev_total_gross'].indexOf(def[0]) >= 0) sh.getRange(r, 1, 1, row.length).setFontWeight('bold');
      r++;
    });
    blocks.push({ loc: loc, locDE: locDE, hdr: hdr });
    r += 2;
  });
  // Diagrammdaten unten (Monate als Zeilen), Diagramme rechts neben den Zahlen ab Spalte O
  if (keys.length) {
    var d = r + 1;
    sh.getRange(d, 1).setValue('Diagrammdaten – automatisch, bitte nicht bearbeiten').setFontWeight('bold').setFontColor('#999999'); d += 2;
    blocks.forEach(function (b) {
      var mo = keys.map(function (k) { return [dt(k)]; });
      var tbl = function (headRow, rows, fmt) {
        sh.getRange(d, 1, 1, headRow.length).setValues([headRow]).setFontWeight('bold');
        sh.getRange(d + 1, 1, rows.length, headRow.length).setValues(rows);
        sh.getRange(d + 1, 1, rows.length, 1).setNumberFormat('mmm yyyy');
        if (fmt) sh.getRange(d + 1, 2, rows.length, headRow.length - 1).setNumberFormat(fmt);
        sh.getRange(d, 1, rows.length + 1, headRow.length).setFontColor('#999999').setFontSize(9);
        var at = d; d += rows.length + 2; return at;
      };
      var num = function (v) { return v === '' || v === null || v === undefined ? 0 : Number(v); };
      var fun = tbl([b.locDE + ' Funnel', 'Leads', 'Probetrainings', 'Abos gestartet', 'Kündigungen'], keys.map(function (k) {
        var la = vOf(k, b.loc, 'leads_all'), lw = vOf(k, b.loc, 'leads_web');
        return [dt(k), num(la) || num(lw), num(vOf(k, b.loc, 'trial_attended')), num(vOf(k, b.loc, 'new_customers')), num(vOf(k, b.loc, 'cancellations'))];
      }));
      var quo = tbl([b.locDE + ' Quoten', 'No-Show', 'Verkäufe / Probetrainings', 'Verkäufe / Leads', 'Kohorten-Conversion'], keys.map(function (k) {
        return [dt(k), num(vOf(k, b.loc, 'noshow_rate')), num(vOf(k, b.loc, 'conv_sales_trial')), num(vOf(k, b.loc, 'conv_sales_lead')), num(vOf(k, b.loc, 'conv_cohort_rate'))];
      }), '0%');
      var kan = tbl([b.locDE + ' Kanal'].concat(KANAL_ORDER), keys.map(function (k, ci) {
        return [dt(k)].concat(KANAL_ORDER.map(function (kn) { return k < LOG_START.slice(0, 7) ? 0 : maCountLeads('$A' + (d + 1 + ci), b.locDE, 'J', kn); }));
      }));
      var inr = tbl([b.locDE + ' Interesse'].concat(INTERESTS), keys.map(function (k, ci) {
        return [dt(k)].concat(INTERESTS.map(function (it) { return k < LOG_START.slice(0, 7) ? 0 : maCountLeads('$A' + (d + 1 + ci), b.locDE, 'E', it); }));
      }));
      var C = function (type, at, w, row, col, title, opts) {
        var ch = sh.newChart().setChartType(type).setNumHeaders(1).addRange(sh.getRange(at, 1, keys.length + 1, w))
          .setPosition(row, col, 0, 0).setOption('title', title).setOption('width', 620).setOption('height', 320)
          .setOption('legend', { position: 'bottom' }).setOption('hAxis', { format: 'MMM yy' }).setOption('vAxis', { minValue: 0 });
        Object.keys(opts || {}).forEach(function (o) { ch = ch.setOption(o, opts[o]); });
        sh.insertChart(ch.build());
      };
      C(Charts.ChartType.COLUMN, fun, 5, b.hdr, 15, 'Funnel ' + b.locDE + ': Leads, Probetrainings, Abos, Kündigungen', { colors: ['#9e9e9e', '#e2c210', '#1a73e8', '#d93025'] });
      C(Charts.ChartType.LINE, quo, 5, b.hdr, 22, 'Quoten ' + b.locDE, { colors: ['#d93025', '#1a73e8', '#34a853', '#9e9e9e'], pointSize: 6, vAxis: { format: '#%', minValue: 0 } });
      C(Charts.ChartType.COLUMN, kan, KANAL_ORDER.length + 1, b.hdr + 16, 15, 'Website-Leads ' + b.locDE + ' nach Kanal', { isStacked: true });
      C(Charts.ChartType.COLUMN, inr, INTERESTS.length + 1, b.hdr + 16, 22, 'Website-Leads ' + b.locDE + ' nach Interesse', { isStacked: true });
    });
  }
  sh.setColumnWidth(1, 330); sh.setFrozenColumns(1); // Spalte A bleibt beim seitlichen Scrollen stehen (Ruben 05.09.2026)
  var ma = ss.getSheetByName(MA_SHEET); if (ma) { ss.setActiveSheet(ma); ss.moveActiveSheet(1); }
  [MA_HIST, MA_COHORT].forEach(function (n) { var h = ss.getSheetByName(n); if (h && !h.isSheetHidden()) h.hideSheet(); });
}
// COUNTIFS ueber den Tab Daten: C Monat, D Standort, G zaehlt, E Interesse, J Kanal
function maCountLeads(monthRef, locDE, col, name) {
  return '=COUNTIFS(Daten!$C:$C,' + monthRef + ',Daten!$D:$D,"' + locDE + '",Daten!$G:$G,1' + (col ? ',Daten!$' + col + ':$' + col + ',"' + name + '"' : '') + ')';
}

// ------------------------------------------------------------ Probetrainings-Liste (seit 04.09.2026, Entscheid Ruben)
// Liegt im TEAM-SHEET (TEAM_ID, "IMPACT Team"): Tabs "Events" (Spiegel, nur lesen), "Probetrainings ZH" (deutsch, Abdi),
// "Probetrainings WT" (englisch, Bogdan). Aufbau des Tabs (Entscheid Ruben 04.09. abends):
//   A..G  Tagesblock, LINKS und auf Hoehe der Personen dieses Tages: Tag, Anrufe versucht*, Anrufe gefuehrt*, Placed Trials,
//         Trials, No-Shows, Verkauft. Der Trichter liest sich von links nach rechts. * = einzige manuelle Felder.
//   H..Z  eine Zeile pro Erstbesucher (User-ID), stuendlich 09-22 Uhr aus der Cloudflare-Funktion (action 'trials').
//   AB..AE "Zahlung offen": alle Personen mit Stage "Signed but no payment", unabhaengig vom Trial-Fenster, aelteste zuerst.
// Der Zustand einer Person ist ihre Lifecycle-Stage in exercise.com. Das Sheet fuehrt keinen eigenen Status; "Pruefen" zeigt,
// wo Fakt (Buchung, Check-in, Vertrag) und Stage nicht zusammenpassen. Ausschluss = Stage "Non-Client".
// No-Shows werden aus den Besuchsdaten gezaehlt (versteckte Spalte "NS"), nicht aus der Art-Spalte: wer nach einem No-Show neu
// bucht, zeigt in der Zeile "Gebucht (kommend)", der No-Show bleibt aber in der Tageszahl und als Notiz auf der Art-Zelle.
// Placed Trials = an diesem Tag angelegte Trial-Buchungen (Quelle "Buchung erstellt am"), passend zum Anruf-Trichter.
// Mail: 12:00 mittags je Standort (Entscheid Ruben: morgens, wenn die Sales-Leute starten), vorerst nur an Ruben.
var TEAM_ID = '1mU0eQbnn02JoH6yg1v-o8-ACei44mLiirWNTP1-avjg';
var TEAM_VIEWERS = ['support@impact-martialarts.com'];
var TR_ACCESS = { Zurich: [MAIL.zh], Winterthur: [MAIL.wt] };
var TR_MAIL_TEAM = false; // Mail an Abdi/Bogdan erst nach der Einfuehrung (Ruben 04.09.); bis dahin nur an Ruben
var TR_SHEETS = { Zurich: 'Probetrainings ZH', Winterthur: 'Probetrainings WT' };
var TR_LANG = { Zurich: 'de', Winterthur: 'en' };
var TR_ROW0 = 5, TR_DAY_N = 7, TR_P0 = 8, TR_NCOL = 19, TR_PAY0 = 28, TR_PAY_N = 4, TR_CHECK_DAYS = 1, TR_PAY_DAYS = 7;
var DI = { day: 0, att: 1, conv: 2, placed: 3, trials: 4, noshow: 5, sold: 6 };
var CI = { date: 0, name: 1, art: 2, cls: 3, coach: 4, booked: 5, kanal: 6, pers: 7, lifecycle: 8, check: 9, contract: 10, seller: 11, pkg: 12, note: 13, crm: 14, created: 15, uid: 16, ns: 17, stamp: 18 };
var LC_POST = ['Client', 'Dependant client', 'Signed but no payment', 'Pending Decision', 'Missed the talk', 'Not Interested (Lost)'];
var LC_CLIENT = ['Client', 'Dependant client', 'Signed but no payment'];
var LC_NOSHOW_OK = ['re-engage no-shows', 're-engage cancelled trial'].concat(LC_POST);
var LC_EXCLUDE = ['Non-Client']; // Assistant Coach, Friends & Family: kein Trial
var LC_PAY_OPEN = 'Signed but no payment';
var TR_TRIG_VER = 'mail12'; // aendert sich, wenn die Trigger neu gesetzt werden muessen; der Stundenlauf zieht das selbst nach
var TR_T = {
  de: {
    title: 'Probetrainings Zürich',
    dHead: ['Tag', 'Anrufe versucht', 'Anrufe geführt', 'Placed Trials', 'Trials', 'No-Shows', 'Verkauft'],
    dNotes: ['Kalendertag. Die Personen dieses Tages stehen rechts daneben.', 'EURE SPALTE: Anrufversuche an diesem Tag.', 'EURE SPALTE: tatsächlich geführte Gespräche an diesem Tag.', 'An diesem Tag angelegte Trial-Buchungen (egal, wann das Trial stattfindet). Automatisch.', 'Probetrainings, die an diesem Tag stattgefunden haben. Automatisch.', 'An diesem Tag gebucht und nicht erschienen. Automatisch aus den Besuchsdaten.', 'Verträge, die an diesem Tag unterschrieben wurden. Automatisch.'],
    head: ['Trial-Datum', 'Name', 'Art', 'Klasse', 'Trainer', 'Gebucht von', 'Kanal', 'Personen', 'Lifecycle-Stage', 'Prüfen', 'Abschluss am', 'Verkäufer', 'Paket', 'Letzte Notiz', 'CRM', 'Buchung erstellt am', 'UID', 'NS', 'Stand'],
    notes: ['Datum des ersten Check-ins. Bei No-Show, Storniert oder Gebucht: Datum des gebuchten Termins. Automatisch aus exercise.com.', 'Name in exercise.com. Automatisch.', 'Trial stattgefunden = die Person war da (erster Check-in überhaupt). Gebucht (kommend) = Termin liegt noch vor uns. No-Show = nicht erschienen. Storniert. Wiederholer (prüfen). Rückkehrer. Event (kein Trial). Automatisch.', 'Klasse des ersten Check-ins. Automatisch.', 'Trainer dieser Klasse. Automatisch.', 'Wer die Buchung in exercise.com angelegt hat. Automatisch.', 'Herkunft der Website-Anfrage: Klick-ID (Google Ads, Meta Ads, TikTok Ads), sonst UTM, sonst verweisende Seite. "ohne Website-Lead" = kein Formular auf der Website gefunden. Automatisch.', 'Anzahl Personen, automatisch 2 bei Geschwistern auf einem Account ("&" oder "+" im Namen).', 'Aktuelle Lifecycle-Stage in exercise.com. Wird dort gepflegt, hier nur gelesen. "Non-Client" (Assistant Coach, Friends & Family) nimmt die Zeile aus der Zählung. Automatisch.', 'Abweichung zwischen Fakt (Buchung, Check-in, Vertrag) und Lifecycle-Stage, ab einem Tag nach dem Termin. Rot = bitte in exercise.com die Stage setzen; beim nächsten Lauf verschwindet der Hinweis. Automatisch.', 'Tag der Vertragsunterschrift in exercise.com (Waiver). Das ist der Verkauf, nicht der Abo-Start; der Start kann später liegen. Automatisch.', 'Wer den Vertrag unterschreiben liess. Automatisch.', 'Abgeschlossenes Paket. Automatisch.', 'Datum und Typ der letzten Notiz in exercise.com. Automatisch.', 'Link auf die Notizen der Person in exercise.com.', 'Wann die Trial-Buchung in exercise.com erstellt wurde. Zählt als Placed Trial für diesen Tag. Automatisch.', 'exercise.com User-ID, der Schlüssel der Zeile. Nicht ändern.', 'No-Show-Daten dieser Person, Grundlage der Tageszählung. Nicht ändern.', 'Letzte Aktualisierung (stündlich 09–22 Uhr).'],
    art: { 'Trial': 'Trial stattgefunden', 'Gebucht': 'Gebucht (kommend)' }, kanal: {},
    payHead: ['Zahlung offen', 'seit', 'Tage', 'CRM'],
    nsNote: 'No-Show am {ns}, neu gebucht für {d}.',
    chk: { nolc: 'Trial am {d} vorbei, keine Lifecycle-Stage bekannt', stuck: 'Trial am {d} vorbei, Stage noch "{lc}"', noshow: 'No-Show am {d}, Stage noch "{lc}"', canc: 'Storniert am {d}, Stage noch "{lc}"', booked: 'Termin {d} gebucht, Stage "{lc}" statt Trial Booked', wdh: 'Wiederholer: Stage in exercise.com setzen oder auf "Non-Client" stellen', clientNoContract: 'Stage Client, aber kein Vertrag gefunden', contractNoClient: 'Vertrag am {d}, Stage aber "{lc}"', pay: 'Seit {n} Tagen unterschrieben, Zahlung fehlt', noteYes: ' (letzte Notiz {n})', noteNo: ' (keine Notiz seit dem Termin)' },
    mail: { subject: '[Team] Probetrainings Zürich {d}', today: 'Heute', yest: 'Gestern', checks: 'Bitte in exercise.com nachziehen', pay: 'Zahlung offen (ab 7 Tagen)', none: 'keine', month: 'Monat bisher: {t} Trials, {s} verkauft, {c} zu prüfen' },
    rule: 'Regel (Ruben, 04.09.2026): Trial = erster Check-in überhaupt bei IMPACT, egal welches Paket exercise.com dranhängt; ohne Staff, Gäste und Altkunden. Events, Seminare und Open Mat sind keine Trials. Zwei Kinder auf einem Account = 2 Personen. Kein Trial (Assistant Coach, Friends & Family, Datenfehler) = Stage "Non-Client" in exercise.com setzen. Der Zustand einer Person ist ihre Lifecycle-Stage in exercise.com; das Sheet hat keine eigenen Status-Spalten. "Prüfen" zeigt ab einem Tag nach dem Termin, wo Fakt und Stage nicht zusammenpassen (rot): bitte in exercise.com nachziehen, der Hinweis verschwindet beim nächsten Lauf. Abschluss am = Unterschrift (Waiver), nicht Abo-Start. Links der Tagesblock: eure einzigen Eingaben sind Anrufe versucht und Anrufe geführt. Ganz rechts "Zahlung offen": unterschrieben, aber ohne Zahlungsdaten. Aktualisierung stündlich 09–22 Uhr. Spaltenerklärungen: Notiz auf der Überschrift.'
  },
  en: {
    title: 'Trials Winterthur',
    dHead: ['Day', 'Calls attempted', 'Calls conducted', 'Placed trials', 'Trials', 'No-shows', 'Sold'],
    dNotes: ['Calendar day. The people of that day are listed to the right.', 'YOUR COLUMN: call attempts on that day.', 'YOUR COLUMN: conversations actually held on that day.', 'Trial bookings created on that day (no matter when the trial takes place). Automatic.', 'Trials that took place on that day. Automatic.', 'Booked for that day and did not show up. Automatic from the visit data.', 'Contracts signed on that day. Automatic.'],
    head: ['Trial date', 'Name', 'Type', 'Class', 'Coach', 'Booked by', 'Channel', 'People', 'Lifecycle stage', 'Check', 'Contract signed', 'Sold by', 'Package', 'Last note', 'CRM', 'Booking created', 'UID', 'NS', 'Updated'],
    notes: ['Date of the first check-in. For No-show, Cancelled or Booked: date of the booked session. Automatic from exercise.com.', 'Name in exercise.com. Automatic.', 'Trial done = the person came (first ever check-in). Booked (upcoming) = session still ahead. No-show. Cancelled. Repeat visitor (check). Returning ex-member. Event (no trial). Automatic.', 'Class of the first check-in. Automatic.', 'Coach of that class. Automatic.', 'Who created the booking in exercise.com. Automatic.', 'Origin of the website enquiry: click ID (Google Ads, Meta Ads, TikTok Ads), otherwise UTM, otherwise referring site. "no website lead" = no form found on the website. Automatic.', 'Number of people, automatically 2 for siblings on one account ("&" or "+" in the name).', 'Current lifecycle stage in exercise.com. Maintained there, only read here. "Non-Client" (assistant coach, friends & family) removes the row from the count. Automatic.', 'Mismatch between fact (booking, check-in, contract) and lifecycle stage, from one day after the session. Red = please set the stage in exercise.com; the hint disappears with the next run. Automatic.', 'Day the contract was signed in exercise.com (waiver). That is the sale, not the subscription start, which can be later. Automatic.', 'Who had the contract signed. Automatic.', 'Package sold. Automatic.', 'Date and type of the last note in exercise.com. Automatic.', 'Link to the notes of that person in exercise.com.', 'When the trial booking was created in exercise.com. Counts as a placed trial for that day. Automatic.', 'exercise.com user ID, the key of the row. Do not change.', 'No-show dates of this person, the basis of the daily count. Do not change.', 'Last update (hourly 9am-10pm).'],
    art: { 'Trial': 'Trial done', 'No-Show': 'No-show', 'Storniert': 'Cancelled', 'Gebucht': 'Booked (upcoming)', 'Wiederholer (prüfen)': 'Repeat visitor (check)', 'Rückkehrer (Ex-Mitglied)': 'Returning ex-member', 'Event (kein Trial)': 'Event (no trial)' },
    kanal: { 'Google organisch': 'Google organic', 'Instagram/Facebook organisch': 'Instagram/Facebook organic', 'TikTok organisch': 'TikTok organic', 'Direkt': 'Direct', 'Andere': 'Other', 'ohne Website-Lead': 'no website lead' },
    payHead: ['Payment open', 'since', 'days', 'CRM'],
    nsNote: 'No-show on {ns}, re-booked for {d}.',
    chk: { nolc: 'Trial on {d} is over, no lifecycle stage known', stuck: 'Trial on {d} is over, stage still "{lc}"', noshow: 'No-show on {d}, stage still "{lc}"', canc: 'Cancelled on {d}, stage still "{lc}"', booked: 'Session {d} booked, stage "{lc}" instead of Trial Booked', wdh: 'Repeat visitor: set the stage in exercise.com or set it to "Non-Client"', clientNoContract: 'Stage Client, but no contract found', contractNoClient: 'Contract on {d}, but stage "{lc}"', pay: 'Signed {n} days ago, payment still missing', noteYes: ' (last note {n})', noteNo: ' (no note since the session)' },
    mail: { subject: '[Team] Trials Winterthur {d}', today: 'Today', yest: 'Yesterday', checks: 'Please update in exercise.com', pay: 'Payment open (7 days and more)', none: 'none', month: 'Month so far: {t} trials, {s} sold, {c} to check' },
    rule: 'Rule (Ruben, 4 Sep 2026): Trial = first ever check-in at IMPACT, whatever package exercise.com attaches; no staff, guests or existing members. Events, seminars and open mat are not trials. Two kids on one account = 2 people. Not a trial (assistant coach, friends & family, data error) = set the stage "Non-Client" in exercise.com. A person\'s state is their lifecycle stage in exercise.com; the sheet has no status columns of its own. "Check" shows, from one day after the session, where fact and stage do not match (red): please update in exercise.com, the hint disappears with the next run. Contract signed = signature (waiver), not subscription start. On the left the day block: your only inputs are calls attempted and calls conducted. On the far right "Payment open": signed, but no payment details. Updated every hour 9am-10pm. Column explanations: note on the header cell.'
  }
};
var TR_REV = {};
(function () { var e = TR_T.en, d = TR_T.de; ['art', 'kanal'].forEach(function (kind) { Object.keys(e[kind]).forEach(function (k) { TR_REV[e[kind][k]] = k; }); Object.keys(d[kind]).forEach(function (k) { TR_REV[d[kind][k]] = k; }); }); })();
function trC(v) { v = String(v || ''); return TR_REV[v] || v; }
function trT(loc) { return TR_T[TR_LANG[loc] || 'de']; }
function trL(loc, kind, v) { var T = trT(loc); return (T[kind] && T[kind][v]) || v; }
function trLocDE(loc) { return loc === 'Zurich' ? 'Zürich' : 'Winterthur'; }
function teamSs() { return SpreadsheetApp.openById(TEAM_ID); }
function fmtD(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }
function addD(d, n) { var t = new Date(d.getTime()); t.setDate(t.getDate() + n); return t; }
function addDs(s, n) { return fmtD(addD(new Date(s + 'T12:00:00'), n)); }
function deD(s) { return s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' : ''; }
function colL(n) { return String.fromCharCode(64 + n); }
function trCall(body) { body.action = 'trials'; return klassenCall(body); }
function trNoTrial(r) { return LC_EXCLUDE.indexOf(String(r[CI.lifecycle] || '').trim()) >= 0; }
function trIsTrial(r) { var art = trC(r[CI.art]), lc = String(r[CI.lifecycle] || ''); if (trNoTrial(r)) return false; return art === 'Trial' || (art.indexOf('Wiederholer') === 0 && LC_POST.indexOf(lc) >= 0); }
function trPers(r) { var n = Number(r[CI.pers]); return n > 0 ? n : 1; }
function trSold(r) { return trIsTrial(r) && !!dOfCell(r[CI.contract]); }
function trNsDates(r) { return String(r[CI.ns] || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); }
// Pruefung Fakt gegen Lifecycle-Stage (Ruben 04.09.2026: ein Tag nach dem Termin; Zahlung offen ab 7 Tagen)
function trCheck(r, today, T) {
  var d = dOfCell(r[CI.date]), art = trC(r[CI.art]), lc = String(r[CI.lifecycle] || '').trim(), contract = dOfCell(r[CI.contract]);
  if (!d || trNoTrial(r)) return '';
  var due = today > addDs(d, TR_CHECK_DAYS), msg = '', dd = deD(d), noteD = String(r[CI.note] || '').slice(0, 10), noteIso = noteD ? noteD.slice(6, 10) + '-' + noteD.slice(3, 5) + '-' + noteD.slice(0, 2) : '';
  var f = function (key, dx) { return T.chk[key].replace('{d}', dx || dd).replace('{lc}', lc); };
  if (lc === LC_PAY_OPEN && contract) { var age = Math.round((new Date(today + 'T12:00:00') - new Date(contract + 'T12:00:00')) / 864e5); if (age >= TR_PAY_DAYS) return T.chk.pay.replace('{n}', age); }
  if (art === 'Trial') {
    if (due) { if (!lc) msg = f('nolc'); else if (LC_POST.indexOf(lc) < 0) msg = f('stuck'); else if (lc === 'Client' && !contract && today > addDs(d, 2)) msg = f('clientNoContract'); }
    if (!msg && contract && LC_CLIENT.indexOf(lc) < 0 && today > addDs(contract, 2)) msg = f('contractNoClient', deD(contract));
  } else if (art === 'No-Show') { if (due && LC_NOSHOW_OK.indexOf(lc) < 0) msg = f('noshow'); }
  else if (art === 'Storniert') { if (due && LC_NOSHOW_OK.indexOf(lc) < 0) msg = f('canc'); }
  else if (art === 'Gebucht') { if (lc && lc !== 'Trial Booked' && LC_CLIENT.indexOf(lc) < 0) msg = f('booked'); }
  else if (art.indexOf('Wiederholer') === 0) { if (LC_POST.indexOf(lc) < 0) msg = f('wdh'); }
  if (msg && (art === 'Trial' || art === 'No-Show' || art === 'Storniert')) msg += (noteIso && noteIso >= d) ? T.chk.noteYes.replace('{n}', noteD) : T.chk.noteNo;
  return msg;
}
// Leads-Log -> Kanal je E-Mail (Fallback: Name). Spalten: A Zeitpunkt, C/D Name, E E-Mail, O gclid, P fbclid, Q Referrer, U ttclid, V utm_source
function trLeadMap(main) {
  var sh = main.getSheetByName('Leads'), map = { email: {}, name: {} };
  if (!sh || sh.getLastRow() < 2) return map;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 24).getValues();
  v.forEach(function (r) {
    var d = dOfCell(r[0]); if (!d) return;
    var L = { date: d, kanal: kanalOf(r[14], r[15], r[20], r[21], r[16]) };
    var e = String(r[4] || '').toLowerCase().trim(), n = (String(r[2] || '') + ' ' + String(r[3] || '')).toLowerCase().replace(/\s+/g, ' ').trim();
    if (e) (map.email[e] = map.email[e] || []).push(L);
    if (n) (map.name[n] = map.name[n] || []).push(L);
  });
  return map;
}
function trFindLead(map, email, name, date) {
  var list = map.email[String(email || '').toLowerCase().trim()] || map.name[String(name || '').toLowerCase().replace(/\s+/g, ' ').trim()] || [];
  if (!list.length) return null;
  var lim = addDs(date, 1), before = list.filter(function (l) { return l.date <= lim; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  return before[0] || list.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0];
}
function runProbetrainings(startOpt) {
  var now = new Date(), today = fmtD(now), end = fmtD(addD(now, 14));
  var start = startOpt || fmtD(addD(now, -33)); // Fenster ~47 Tage (2 Besuche-Bloecke); aeltere Zeilen bleiben im Tab stehen
  var base = { start: start, end: end, today: today, sales_start: fmtD(addD(now, -180)) };
  var main = SpreadsheetApp.openById(SHEET_ID), ss = teamSs(), open = [];
  Object.keys(TR_SHEETS).forEach(function (loc) { open = open.concat(trOpenRows(ss, loc, start)); });
  var p1 = trCall(Object.assign({ phase: 't1' }, base)); if (p1.error) throw new Error('Trials t1: ' + JSON.stringify(p1).slice(0, 300));
  var p2 = null, p3 = null, i;
  for (i = 0; i < 9; i++) { Utilities.sleep(20000); p2 = trCall(Object.assign({ phase: 't2' }, base)); if (p2.error) throw new Error('Trials t2: ' + JSON.stringify(p2).slice(0, 300)); if (p2.ready) break; }
  if (!p2 || !p2.ready) throw new Error('Trials t2 nicht fertig: ' + JSON.stringify(p2).slice(0, 200));
  for (i = 0; i < 9; i++) { Utilities.sleep(20000); p3 = trCall(Object.assign({ phase: 't3', fv_zh: p2.fv_zh, v1: p2.v1, open_uids: open }, base)); if (p3.error) throw new Error('Trials t3: ' + JSON.stringify(p3).slice(0, 300)); if (p3.ready) break; }
  if (!p3 || !p3.ready) throw new Error('Trials t3 nicht fertig: ' + JSON.stringify(p3).slice(0, 200));
  var data = p3.data, lines = [], leadMap = trLeadMap(main);
  Object.keys(TR_SHEETS).forEach(function (loc) { lines.push(trUpsert(ss, loc, data.rows[loc] || [], data.sales || {}, (data.payopen || {})[loc] || [], start, today, leadMap)); });
  try { teamMirrorEvents(main, ss); } catch (e1) { Logger.log('Events-Spiegel: ' + e1); }
  try { buildWochenreport(main, ss); } catch (e2) { Logger.log('Wochenreport: ' + e2); }
  Logger.log('Probetrainings ' + start + '..' + end + ': ' + lines.join(' | '));
  return lines.join('\n');
}
function trOpenRows(ss, loc, start) {
  var sh = ss.getSheetByName(TR_SHEETS[loc]); if (!sh || sh.getLastRow() < TR_ROW0) return [];
  var v = sh.getRange(TR_ROW0, TR_P0, sh.getLastRow() - TR_ROW0 + 1, TR_NCOL).getValues(), out = [];
  v.forEach(function (r) { var d = dOfCell(r[CI.date]); if (d && d < start && r[CI.uid] && !dOfCell(r[CI.contract])) out.push({ uid: String(r[CI.uid]), date: d }); });
  return out.slice(0, 600);
}
function trProtect(sh, editors, desc) {
  sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) { p.remove(); });
  var p = sh.protect().setDescription(desc), me = Session.getEffectiveUser();
  p.addEditor(me);
  var others = p.getEditors().filter(function (u) { return u.getEmail() !== me.getEmail(); }); if (others.length) p.removeEditors(others);
  if (editors && editors.length) p.addEditors(editors);
  if (p.canDomainEdit()) p.setDomainEdit(false);
}
function trInit(ss, sh, loc) {
  var T = trT(loc);
  clearSheet(sh);
  if (sh.getMaxColumns() < 34) sh.insertColumnsAfter(sh.getMaxColumns(), 34 - sh.getMaxColumns());
  sh.showColumns(1, sh.getMaxColumns());
  sh.getRange('A1').setValue(T.title).setFontSize(16).setFontWeight('bold');
  sh.getRange('A2').setValue(T.rule).setFontColor('#666666').setWrap(true).setVerticalAlignment('top');
  sh.getRange('A2:Z2').merge(); sh.setRowHeight(2, 110);
  sh.getRange(4, 1, 1, TR_DAY_N).setValues([T.dHead]).setNotes([T.dNotes]).setFontWeight('bold').setBackground('#e8eaed');
  sh.getRange(4, TR_P0, 1, TR_NCOL).setValues([T.head]).setNotes([T.notes]).setFontWeight('bold').setBackground('#f3f3f3');
  sh.getRange(4, TR_PAY0, 1, TR_PAY_N).setValues([T.payHead]).setFontWeight('bold').setBackground('#fde8d5');
  sh.setFrozenRows(4); // keine fixierten Spalten: A2:Z2 ist verbunden, Google erlaubt das Einfrieren dann nicht
  [95, 110, 110, 95, 60, 75, 70].forEach(function (w, i) { sh.setColumnWidth(1 + i, w); });
  [95, 200, 150, 200, 150, 150, 130, 70, 170, 330, 95, 150, 220, 150, 50, 110, 90, 160, 100].forEach(function (w, i) { sh.setColumnWidth(TR_P0 + i, w); });
  sh.setColumnWidth(TR_PAY0 - 1, 30);
  [200, 95, 60, 50].forEach(function (w, i) { sh.setColumnWidth(TR_PAY0 + i, w); });
  sh.hideColumns(TR_P0 + CI.uid, 2); // UID und NS sind nur Schluessel (Ruben 04.09.)
  trProtect(sh, TR_ACCESS[loc] || [], 'Nur Ruben und ' + (TR_ACCESS[loc] || []).join(', '));
  ss.setActiveSheet(sh); ss.moveActiveSheet(loc === 'Zurich' ? 2 : 3);
}
function trUpsert(ss, loc, rows, sales, payopen, start, today, leadMap) {
  var T = trT(loc), sh = getOrCreate(ss, TR_SHEETS[loc]);
  if (sh.getLastRow() < 4 || sh.getRange(4, TR_P0, 1, TR_NCOL).getValues()[0].join('|') !== T.head.join('|') || sh.getRange(4, 1, 1, TR_DAY_N).getValues()[0].join('|') !== T.dHead.join('|')) trInit(ss, sh, loc);
  var n = Math.max(0, sh.getLastRow() - TR_ROW0 + 1);
  var old = n ? sh.getRange(TR_ROW0, TR_P0, n, TR_NCOL).getValues() : [];
  var oldDays = n ? sh.getRange(TR_ROW0, 1, n, TR_DAY_N).getValues() : [];
  var calls = {}; oldDays.forEach(function (r) { var d = dOfCell(r[DI.day]); if (d && (r[DI.att] !== '' || r[DI.conv] !== '')) calls[d] = [r[DI.att], r[DI.conv]]; });
  var byUid = {}; old.forEach(function (r) { if (r[CI.uid]) byUid[String(r[CI.uid])] = r; });
  var stamp = Utilities.formatDate(new Date(), TZ, 'dd.MM. HH:mm');
  var toDate = function (s) { return s ? new Date(s + 'T12:00:00') : ''; };
  var noteTxt = function (nt) { return nt && nt.date ? nt.date.slice(8, 10) + '.' + nt.date.slice(5, 7) + '.' + nt.date.slice(0, 4) + (nt.type ? ' ' + nt.type : '') : ''; };
  var crm = function (uid) { return uid ? '=HYPERLINK("https://app.impact-martialarts.com/ex4/clients/' + uid + '/notes","CRM")' : ''; };
  var seen = {};
  rows.forEach(function (x) {
    var o = byUid[x.uid], s = x.sale || {}, lead = leadMap ? trFindLead(leadMap, x.email, x.name, x.date) : null, r = [];
    r[CI.date] = toDate(x.date); r[CI.name] = x.name; r[CI.art] = trL(loc, 'art', x.art); r[CI.cls] = x.cls || ''; r[CI.coach] = x.trainer || ''; r[CI.booked] = x.bookedBy || '';
    r[CI.kanal] = trL(loc, 'kanal', lead ? lead.kanal : 'ohne Website-Lead');
    r[CI.pers] = x.personen;
    r[CI.lifecycle] = x.lifecycle || (o ? o[CI.lifecycle] : ''); r[CI.check] = '';
    r[CI.contract] = toDate(s.date); r[CI.seller] = s.by || ''; r[CI.pkg] = s.pkg || '';
    r[CI.note] = x.lastNote ? noteTxt(x.lastNote) : (o ? o[CI.note] : ''); r[CI.crm] = crm(x.uid);
    r[CI.created] = toDate((x.bk && x.bk.length ? x.bk[x.bk.length - 1] : x.bookedAt) || ''); r[CI.uid] = String(x.uid);
    r[CI.ns] = (x.ns || []).join(','); r[CI.stamp] = stamp;
    byUid[x.uid] = r; seen[x.uid] = true;
  });
  Object.keys(sales).forEach(function (uid) { var o = byUid[uid]; if (!o || seen[uid]) return; var s = sales[uid] || {}; o[CI.contract] = toDate(s.date); o[CI.seller] = s.by || ''; o[CI.pkg] = s.pkg || ''; o[CI.stamp] = stamp; });
  var all = Object.keys(byUid).map(function (k) { return byUid[k]; });
  all.forEach(function (r) { r[CI.check] = trCheck(r, today, T); if (!r[CI.crm]) r[CI.crm] = crm(r[CI.uid]); });
  // Tageswerte: Trials, No-Shows (aus den NS-Daten, nicht aus der Art), Verkauft (Vertragstag), Placed Trials (Buchungstag)
  var day = {}, D = function (d) { return day[d] = day[d] || { placed: 0, trials: 0, ns: 0, sold: 0 }; };
  var byDate = {};
  all.forEach(function (r) {
    var d = dOfCell(r[CI.date]); if (!d) return;
    (byDate[d] = byDate[d] || []).push(r);
    if (trNoTrial(r)) return;
    var p = trPers(r), c = dOfCell(r[CI.contract]), b = dOfCell(r[CI.created]);
    if (trIsTrial(r)) D(d).trials += p;
    if (c && trIsTrial(r)) D(c).sold += p;
    if (b) D(b).placed += 1;
    trNsDates(r).forEach(function (x) { D(x).ns += 1; });
  });
  // Datumsliste: Fenster, alle Personentage, alle Tage mit Anrufen; neueste zuerst
  var dates = {}, d0 = addDs(today, 14);
  for (var dd = d0; dd >= start; dd = addDs(dd, -1)) dates[dd] = 1;
  Object.keys(byDate).forEach(function (k) { dates[k] = 1; }); Object.keys(calls).forEach(function (k) { dates[k] = 1; }); Object.keys(day).forEach(function (k) { dates[k] = 1; });
  var order = Object.keys(dates).sort().reverse();
  var dayOut = [], perOut = [], notes = [];
  order.forEach(function (d) {
    var ppl = (byDate[d] || []).sort(function (a, b) { return String(a[CI.name]).localeCompare(String(b[CI.name])); });
    var v = day[d] || { placed: 0, trials: 0, ns: 0, sold: 0 }, c = calls[d] || ['', ''];
    var lines = Math.max(1, ppl.length);
    for (var i = 0; i < lines; i++) {
      dayOut.push(i === 0 ? [toDate(d), c[0], c[1], v.placed, v.trials, v.ns, v.sold] : ['', '', '', '', '', '', '']);
      var r = ppl[i] || [];
      var row = []; for (var k = 0; k < TR_NCOL; k++) row[k] = (r[k] === undefined || r[k] === null) ? '' : r[k];
      perOut.push(row);
      var ns = r.length ? trNsDates(r) : [], art = r.length ? trC(r[CI.art]) : '';
      notes.push([(ns.length && art !== 'No-Show') ? T.nsNote.replace('{ns}', ns.map(deD).join(', ')).replace('{d}', deD(dOfCell(r[CI.date]))) : '']);
    }
  });
  var oldRows = Math.max(n, 1);
  sh.getRange(TR_ROW0, 1, oldRows, TR_DAY_N + TR_NCOL + TR_P0 - 1).clearContent().clearNote().setBackground(null);
  if (dayOut.length) {
    sh.getRange(TR_ROW0, 1, dayOut.length, TR_DAY_N).setValues(dayOut);
    sh.getRange(TR_ROW0, 1, dayOut.length, 1).setNumberFormat('ddd dd.MM.');
    sh.getRange(TR_ROW0, DI.att + 1, dayOut.length, 2).setBackground('#fff8e1');
    sh.getRange(TR_ROW0, TR_P0, perOut.length, TR_NCOL).setValues(perOut);
    sh.getRange(TR_ROW0, TR_P0 + CI.art, perOut.length, 1).setNotes(notes);
    [CI.date, CI.contract, CI.created].forEach(function (c) { sh.getRange(TR_ROW0, TR_P0 + c, perOut.length, 1).setNumberFormat('dd.MM.yyyy'); });
    sh.getRange(TR_ROW0, TR_P0 + CI.uid, perOut.length, 2).setNumberFormat('@');
    sh.getRange(TR_ROW0, TR_P0 + CI.check, perOut.length, 1).setWrap(true);
  }
  trPayBlock(sh, payopen, today, T, Math.max(dayOut.length, 1));
  trFormat(sh, dayOut.length, loc);
  var nChk = all.filter(function (r) { return !!r[CI.check]; }).length;
  return trLocDE(loc) + ': ' + all.length + ' Personen, ' + dayOut.length + ' Zeilen, zu pruefen ' + nChk + ', Zahlung offen ' + payopen.length;
}
function trPayBlock(sh, payopen, today, T, rows) {
  var maxR = Math.max(rows, 1);
  sh.getRange(4, TR_PAY0, maxR + 1, TR_PAY_N).clearContent().setBackground(null);
  sh.getRange(4, TR_PAY0, 1, TR_PAY_N).setValues([T.payHead]).setFontWeight('bold').setBackground('#fde8d5');
  var out = (payopen || []).map(function (x) {
    var age = x.since ? Math.round((new Date(today + 'T12:00:00') - new Date(x.since + 'T12:00:00')) / 864e5) : '';
    return [x.name, x.since ? new Date(x.since + 'T12:00:00') : '', age, x.uid ? '=HYPERLINK("https://app.impact-martialarts.com/ex4/clients/' + x.uid + '/notes","CRM")' : ''];
  });
  if (out.length) {
    sh.getRange(TR_ROW0, TR_PAY0, out.length, TR_PAY_N).setValues(out);
    sh.getRange(TR_ROW0, TR_PAY0 + 1, out.length, 1).setNumberFormat('dd.MM.yyyy');
    var rng = sh.getRange(TR_ROW0, TR_PAY0, out.length, TR_PAY_N);
    rng.setBackground('#fff4e5');
    var old = sh.getRange(TR_ROW0, TR_PAY0 + 2, out.length, 1);
    old.setFontWeight('normal');
    for (var i = 0; i < out.length; i++) if (Number(out[i][2]) >= 30) sh.getRange(TR_ROW0 + i, TR_PAY0, 1, TR_PAY_N).setBackground('#fce4e4');
  }
}
function trFormat(sh, n, loc) {
  var rules = [], T = trT(loc), q = function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; };
  if (n) {
    var rng = sh.getRange(TR_ROW0, TR_P0, n, TR_NCOL), r0 = TR_ROW0;
    var cA = colL(TR_P0 + CI.art), cK = colL(TR_P0 + CI.check), cL = colL(TR_P0 + CI.lifecycle), cV = colL(TR_P0 + CI.contract);
    var ns = trL(loc, 'art', 'No-Show'), st = trL(loc, 'art', 'Storniert'), gb = trL(loc, 'art', 'Gebucht');
    var wd = trL(loc, 'art', 'Wiederholer (prüfen)'), ev = trL(loc, 'art', 'Event (kein Trial)'), rk = trL(loc, 'art', 'Rückkehrer (Ex-Mitglied)');
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + cL + r0 + '="Non-Client"').setFontColor('#9e9e9e').setStrikethrough(true).setRanges([rng]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + cK + r0 + '<>""').setBackground('#fce4e4').setRanges([rng]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($' + cV + r0 + '<>"",$' + cL + r0 + '="' + LC_PAY_OPEN + '")').setBackground('#fdead1').setRanges([rng]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + cV + r0 + '<>""').setBackground('#e6f4ea').setRanges([rng]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=OR($' + cA + r0 + '=' + q(ns) + ',$' + cA + r0 + '=' + q(st) + ',$' + cA + r0 + '=' + q(gb) + ')').setFontColor('#9e9e9e').setRanges([rng]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=OR($' + cA + r0 + '=' + q(wd) + ',$' + cA + r0 + '=' + q(ev) + ',$' + cA + r0 + '=' + q(rk) + ')').setBackground('#fce8b2').setRanges([rng]).build());
  }
  sh.setConditionalFormatRules(rules);
}
// Events-Tab aus dem Leads-Log als Werte ins Team-Sheet spiegeln (nur lesen, nur Ruben darf editieren)
function teamMirrorEvents(main, team) {
  var src = main.getSheetByName('Events'); if (!src || src.getLastRow() < 1) return;
  var dst = getOrCreate(team, 'Events'), v = src.getDataRange().getValues();
  dst.clearContents();
  if (v.length) { dst.getRange(1, 1, v.length, v[0].length).setValues(v); dst.getRange(1, 1, 1, v[0].length).setFontWeight('bold'); dst.setFrozenRows(1); dst.getRange(2, 1, Math.max(1, v.length - 1), 1).setNumberFormat('dd.MM.yyyy HH:mm'); }
  trProtect(dst, [], 'Spiegel aus dem Leads-Log, nur lesen');
}
function teamShare() {
  var f = DriveApp.getFileById(TEAM_ID), have = {};
  f.getEditors().forEach(function (u) { have[u.getEmail()] = 'e'; }); f.getViewers().forEach(function (u) { have[u.getEmail()] = have[u.getEmail()] || 'v'; });
  [MAIL.zh, MAIL.wt].forEach(function (e) { if (have[e] !== 'e') f.addEditor(e); });
  TEAM_VIEWERS.forEach(function (e) { if (!have[e]) f.addViewer(e); });
  return 'Team-Sheet geteilt: Editoren ' + [MAIL.zh, MAIL.wt].join(', ') + '; Leser ' + TEAM_VIEWERS.join(', ');
}
// Mittagsmail je Standort: heute, gestern, offene Pruefungen, Zahlung offen. Vorerst nur an Ruben (TR_MAIL_TEAM).
function trDailyMail() {
  var ss = teamSs(), today = fmtD(new Date()), yest = addDs(today, -1);
  Object.keys(TR_SHEETS).forEach(function (loc) {
    var T = trT(loc), sh = ss.getSheetByName(TR_SHEETS[loc]); if (!sh || sh.getLastRow() < TR_ROW0) return;
    var n = sh.getLastRow() - TR_ROW0 + 1;
    var v = sh.getRange(TR_ROW0, TR_P0, n, TR_NCOL).getValues().filter(function (r) { return !!r[CI.uid]; });
    var pay = sh.getRange(TR_ROW0, TR_PAY0, n, TR_PAY_N).getValues().filter(function (r) { return r[0] && Number(r[2]) >= TR_PAY_DAYS; });
    var td = v.filter(function (r) { return dOfCell(r[CI.date]) === today; });
    var yd = v.filter(function (r) { return dOfCell(r[CI.date]) === yest; });
    var chk = v.filter(function (r) { return !!r[CI.check]; });
    var mk = today.slice(0, 7), mv = v.filter(function (r) { return dOfCell(r[CI.date]).slice(0, 7) === mk; });
    var cnt = function (rows, f) { return rows.reduce(function (a, r) { return a + (f(r) ? trPers(r) : 0); }, 0); };
    var lines = [];
    lines.push(T.mail.today + ' (' + td.length + '):'); if (!td.length) lines.push('  ' + T.mail.none);
    td.forEach(function (r) { lines.push('  - ' + r[CI.name] + ' | ' + r[CI.cls] + ' | ' + trC(r[CI.art]) + ' | ' + r[CI.kanal]); });
    lines.push(''); lines.push(T.mail.yest + ' (' + yd.length + '):'); if (!yd.length) lines.push('  ' + T.mail.none);
    yd.forEach(function (r) { lines.push('  - ' + r[CI.name] + ' | ' + trC(r[CI.art]) + ' | ' + (r[CI.lifecycle] || '?') + (dOfCell(r[CI.contract]) ? ' | ' + T.head[CI.contract] + ' ' + deD(dOfCell(r[CI.contract])) : '')); });
    lines.push(''); lines.push(T.mail.checks + ' (' + chk.length + '):'); if (!chk.length) lines.push('  ' + T.mail.none);
    chk.forEach(function (r) { lines.push('  - ' + r[CI.name] + ': ' + r[CI.check]); });
    lines.push(''); lines.push(T.mail.pay + ' (' + pay.length + '):'); if (!pay.length) lines.push('  ' + T.mail.none);
    pay.forEach(function (r) { lines.push('  - ' + r[0] + ': ' + r[2] + ' Tage'); });
    lines.push(''); lines.push(T.mail.month.replace('{t}', cnt(mv, trIsTrial)).replace('{s}', cnt(mv, trSold)).replace('{c}', chk.length));
    lines.push(''); lines.push('https://docs.google.com/spreadsheets/d/' + TEAM_ID);
    var to = TR_MAIL_TEAM ? (TR_ACCESS[loc] || [MAIL.fallback]).join(',') : MAIL.fallback;
    var msg = { to: to, subject: T.mail.subject.replace('{d}', deD(today) + today.slice(0, 4)), body: lines.join('\n') };
    if (TR_MAIL_TEAM) msg.cc = MAIL.fallback;
    MailApp.sendEmail(msg);
  });
}
function runProbetrainingsHourly() {
  var h = Number(Utilities.formatDate(new Date(), TZ, 'H')); if (h < 9 || h > 22) return;
  try { var pr = PropertiesService.getScriptProperties(); if (pr.getProperty('trTrigVer') !== TR_TRIG_VER) { installTrialTriggers(); pr.setProperty('trTrigVer', TR_TRIG_VER); } } catch (e0) { Logger.log('Trigger-Update: ' + e0); }
  try { maQueueCatchUp(); } catch (e1) { Logger.log('Monats-Nachlauf: ' + e1); }
  try { runProbetrainings(); } catch (e) { Logger.log('Probetrainings Fehler: ' + e); MailApp.sendEmail({ to: MAIL.fallback, subject: '[Team] Probetrainings FEHLGESCHLAGEN ' + Utilities.formatDate(new Date(), TZ, 'HH:mm'), body: String(e && e.stack ? e.stack : e) }); }
}
function installTrialTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (['runProbetrainingsHourly', 'trDailyMail'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('runProbetrainingsHourly').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('trDailyMail').timeBased().atHour(12).nearMinute(0).everyDays(1).inTimezone(TZ).create();
  Logger.log('Trigger installiert: runProbetrainingsHourly (stuendlich, 09-22), trDailyMail (12:00)');
}
// Einmalig (04.09.2026): Team-Sheet aufbauen, Tabs aus dem Leads-Log entfernen, Analyse neu bauen
function setupTeam() {
  var main = SpreadsheetApp.openById(SHEET_ID), team = teamSs();
  var lines = runProbetrainings('2026-08-01');
  ['Probetrainings ZH', 'Probetrainings WT'].forEach(function (n) { var s = main.getSheetByName(n); if (s) main.deleteSheet(s); });
  ['Events', 'Probetrainings ZH', 'Probetrainings WT'].forEach(function (n, i) { var s = team.getSheetByName(n); if (s) { team.setActiveSheet(s); team.moveActiveSheet(i + 1); } });
  var shared = teamShare();
  setupAnalyse();
  Logger.log(lines + '\n' + shared);
  return lines + '\n' + shared;
}
