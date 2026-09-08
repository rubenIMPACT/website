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
// Fehlermails nur an Ruben und hoechstens eine je Problem und Tag (Ruben 06.09.: keine Mailflut). Schluessel = Funktion + Anfang der Meldung,
// Merkzettel in der Script Property errmail (wird taeglich bereinigt).
function mailOnce(key, subject, body) {
  var pr = PropertiesService.getScriptProperties(), day = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), map = {};
  try { map = JSON.parse(pr.getProperty('errmail') || '{}'); } catch (e0) { map = {}; }
  Object.keys(map).forEach(function (k) { if (map[k] !== day) delete map[k]; });
  var sig = key + ':' + String(body || '').replace(/\s+/g, ' ').slice(0, 60);
  if (map[sig]) { pr.setProperty('errmail', JSON.stringify(map)); Logger.log('Fehlermail unterdrueckt (heute schon gesendet): ' + subject); return false; }
  map[sig] = day; pr.setProperty('errmail', JSON.stringify(map));
  MailApp.sendEmail({ to: MAIL.fallback, subject: subject, body: body });
  return true;
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
  var order = ['Monatsabschluss', 'Klassenanalyse', 'Kündigungsrisiko', 'Trainingsplan', 'Events', 'Trainingsplan-Analyse', 'Kündigungen', 'Cancellations', 'Leads', 'Daten', 'PlanDaten', 'KlassenHistorie', 'KlassenHistorieDisziplin', 'RisikoHistorie', 'MonatsHistorie', 'Kohorten'];
  var pos = 1;
  for (var i = 0; i < order.length; i++) { var sh = ss.getSheetByName(order[i]); if (sh) { ss.setActiveSheet(sh); ss.moveActiveSheet(pos); pos++; } }
  // Roh-Logs verstecken (Ruben 04.09.2026): ueber Ansicht > Ausgeblendete Tabellen jederzeit wieder einblendbar
  ['Leads', 'Trainingsplan'].forEach(function (n) { var h = ss.getSheetByName(n); if (h && !h.isSheetHidden()) h.hideSheet(); });
  ss.setActiveSheet(ss.getSheetByName('Monatsabschluss'));
}
function getOrCreate(ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); }
// sh.clear() laesst Zahlenformate stehen (Lehre 05.09.2026: alte Prozent-/Datumsformate machten aus 27 Trials "2700%" und aus
// 15 Leads "15.01.1900"), deshalb zusaetzlich das ganze Blatt auf Standardformat zuruecksetzen.
function clearSheet(sh) {
  var f = sh.getFilter(); if (f) f.remove();
  var cs = sh.getCharts(); for (var i = 0; i < cs.length; i++) sh.removeChart(cs[i]);
  // Alle Zeilen ab 2 loeschen und neu einfuegen: nimmt Zeilengruppen, Verbindungen, Notizen und Formate sicher mit. Lehre 07.09.:
  // shiftRowGroupDepth(-1) und auch getRowGroup().remove() liessen alte Gruppen stehen, Kernzeilen verschwanden in eingeklappten Altgruppen.
  try { var fr = sh.getFrozenRows(); if (fr) sh.setFrozenRows(0); var mr = sh.getMaxRows(); if (mr > 1) sh.deleteRows(2, mr - 1); sh.insertRowsAfter(1, Math.max(mr - 1, 100)); if (fr) sh.setFrozenRows(fr); } catch (e) { Logger.log('clearSheet Zeilen: ' + e); }
  sh.clear();
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearFormat().setNumberFormat('General');
}

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

// Wochen- und Monatswerte des Funnels (seit 07.09.2026 im Monatsabschluss, der eigene Wochenreport entfaellt): Website-Leads aus Daten (Log),
// Gespraeche, Placed Trials, Trials, No-Shows und Verkaeufe aus den Probetrainings-Tabs im Team-Sheet. Woche = Montag bis Sonntag.
var LEAD_WEEK0 = '2026-08-31'; // erste Woche mit Wochenzahlen (Log seit 01.09.2026)
var KANAL_ORDER = ['Google Ads', 'Meta Ads', 'TikTok Ads', 'Google organisch', 'Instagram/Facebook organisch', 'TikTok organisch', 'Direkt', 'Andere']; // Ruben 04.09.: kein X, Meta = Instagram
function kanalOf(gclid, fbclid, ttclid, utm, ref) {
  var u = String(utm || '').toLowerCase(), r = String(ref || '').toLowerCase();
  if (ttclid) return 'TikTok Ads'; if (gclid) return 'Google Ads'; if (fbclid) return 'Meta Ads';
  if (/tiktok/.test(u)) return 'TikTok Ads'; if (/google/.test(u)) return 'Google Ads'; if (/facebook|meta|instagram|ig$/.test(u)) return 'Meta Ads'; if (u) return 'Andere';
  if (/google/.test(r)) return 'Google organisch'; if (/instagram|facebook|fb\.com/.test(r)) return 'Instagram/Facebook organisch'; if (/tiktok/.test(r)) return 'TikTok organisch';
  if (!r || /impact-martialarts/.test(r)) return 'Direkt'; return 'Andere';
}
function mondayOf(d) { var t = new Date(d.getTime()); t.setHours(12, 0, 0, 0); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return t; }
function isoWeek(d) { var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); var day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); var y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 86400000 + 1) / 7); }
function wrMerge(o, x) { o.dup += x.dup; ['leads', 'att', 'calls', 'placed', 't', 'ns', 'sold', 'csold'].forEach(function (f) { o[f].Zurich += x[f].Zurich; o[f].Winterthur += x[f].Winterthur; }); ['kanal', 'inter'].forEach(function (f) { ['Zurich', 'Winterthur'].forEach(function (l) { Object.keys(x[f][l]).forEach(function (k) { o[f][l][k] = (o[f][l][k] || 0) + x[f][l][k]; }); }); }); return o; }
// Woche (Montag) auf die Tage des Monats mk beschraenkt: die Wochen eines Monats ergeben zusammen den Monat
function wrWeekOf(wr, monday, mk) { var o = wrBlank(); for (var i = 0; i < 7; i++) { var d = addDs(monday, i); if (d.slice(0, 7) === mk && wr.day[d]) wrMerge(o, wr.day[d]); } return o; }
function wrBlank() { var pl = function (v) { return { Zurich: v(), Winterthur: v() }; }, z = function () { return 0; }, o = function () { return {}; }; return { dup: 0, leads: pl(z), kanal: pl(o), inter: pl(o), att: pl(z), calls: pl(z), placed: pl(z), t: pl(z), ns: pl(z), sold: pl(z), csold: pl(z) }; }
// Sammelt je Woche (Schluessel = Montag) und je Monat (yyyy-MM) die Funnel-Werte; Monatswerte aus dem Team-Sheet sind erst ab MA_TEAM_FROM vollstaendig
function wrCollect(ss, team) {
  var out = { day: {}, month: {} }; // je Tag, damit Wochen auf die Tage ihres Monats beschraenkt werden koennen (Ruben 08.09.: Wochen muessen den Monat ergeben)
  var D = function (d) { return out.day[d] = out.day[d] || wrBlank(); };
  var M = function (d) { var k = d.slice(0, 7); return out.month[k] = out.month[k] || wrBlank(); };
  var both = function (d) { return [D(d), M(d)]; };
  // Website-Leads aus Daten (A Datum, D Standort, E Interesse, G Zaehlt, H Dublette, J Kanal)
  var dn = ss.getSheetByName('Daten'), dv = dn && dn.getLastRow() > 1 ? dn.getRange(2, 1, dn.getLastRow() - 1, 10).getValues() : [];
  dv.forEach(function (r) {
    var d = dOfCell(r[0]); if (!d || d < LOG_START) return;
    var L = r[3] === 'Zürich' ? 'Zurich' : r[3] === 'Winterthur' ? 'Winterthur' : null;
    both(d).forEach(function (o) {
      if (Number(r[6]) === 1 && L) { o.leads[L]++; var k = r[9] || 'Andere'; o.kanal[L][k] = (o.kanal[L][k] || 0) + 1; var it = r[4] || 'Andere'; o.inter[L][it] = (o.inter[L][it] || 0) + 1; }
      if (Number(r[7]) === 1) o.dup++;
    });
  });
  // Gespraeche, Placed Trials, Trials, No-Shows, Verkaeufe aus den Tagesbloecken; Abschluesse der Probetrainer aus den Personenzeilen
  ['Zurich', 'Winterthur'].forEach(function (loc) {
    var ts = team && team.getSheetByName(TR_SHEETS[loc]); if (!ts || ts.getLastRow() < TR_ROW0) return;
    var n = ts.getLastRow() - TR_ROW0 + 1;
    ts.getRange(TR_ROW0, 1, n, TR_DAY_N).getValues().forEach(function (r) {
      var d = dOfCell(r[DI.day]); if (!d) return;
      both(d).forEach(function (o) { o.att[loc] += Number(r[DI.att]) || 0; o.calls[loc] += Number(r[DI.conv]) || 0; o.placed[loc] += Number(r[DI.placed]) || 0; o.t[loc] += Number(r[DI.trials]) || 0; o.ns[loc] += Number(r[DI.noshow]) || 0; o.sold[loc] += Number(r[DI.sold]) || 0; });
    });
    ts.getRange(TR_ROW0, TR_P0, n, TR_NCOL).getValues().forEach(function (r) { if (!r[CI.uid]) return; var d = dOfCell(r[CI.date]); if (d && trIsTrial(r) && dOfCell(r[CI.start])) both(d).forEach(function (o) { o.csold[loc] += 1; }); }); // Kohorte: Abo bis heute gestartet (Vertragsstart), gleiche Regel wie der Monatsreport
  });
  return out;
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
    try { fpTransfer(); } catch (e3) { mailOnce('fp', '[Sheet] Finanzplan-Uebertrag FEHLGESCHLAGEN', String(e3 && e3.stack ? e3.stack : e3)); }
    MailApp.sendEmail({ to: MAIL.fallback, subject: '[Sheet] Monatsabschluss und Klassenanalyse ' + start.slice(0, 7) + ' sind da', body: 'Monatsabschluss fuer ' + start + ' bis ' + end + ' (Tab Monatsabschluss):\n' + ma + '\n\nKlassenanalyse (Tabs Klassenanalyse und Kuendigungsrisiko):\n' + report + '\n\nhttps://docs.google.com/spreadsheets/d/' + SHEET_ID });
  } catch (e) {
    mailOnce('klassenanalyse', '[Sheet] Klassenanalyse ' + start.slice(0, 7) + ' FEHLGESCHLAGEN', 'Fehler: ' + String(e && e.message ? e.message : e) + '\n\nNaechster Versuch: im Script-Editor runKlassenanalyseMonthly ausfuehren oder Fenster manuell mit runKlassenanalyse(start, end).');
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
  ['Events', 'Kündigungen', 'Cancellations'].forEach(function (name) {
    var sh = ss.getSheetByName(name); if (!sh || sh.getLastRow() < 2) return;
    var v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues(), head = v[0], cols = [], mail = -1;
    head.forEach(function (h, i) { if (['Name', 'Vorname', 'Nachname', 'E-Mail', 'First name', 'Last name', 'Email', 'Reason', 'Friends'].indexOf(String(h)) >= 0) cols.push(i); if (/^(E-Mail|Email)$/.test(String(h))) mail = i; });
    var del = [];
    for (var r = 1; r < v.length; r++) {
      // "test" als eigenes Wort oder "testlead" (nicht "Attest"); ausserdem Rubens Adresse
      var hit = cols.some(function (c) { return /(^|[^a-z\u00e4\u00f6\u00fc])test(lead|[^a-z]|$)/i.test(String(v[r][c] || '')); }) || (mail >= 0 && String(v[r][mail] || '').toLowerCase() === MAIL.fallback);
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
// ------------------------------------------------------------ Werbekosten (05.09.2026, Entscheid Ruben: alles automatisch, keine Handeingabe)
// Quellen: Google Ads ueber ein Google-Ads-Skript direkt in den versteckten Tab WerbekostenDaten (tools/google-ads-spend-script.js),
// Meta ueber die Cloudflare-Funktion (action 'ads', Token META_ADS_TOKEN) taeglich 06:30 (runWerbekostenDaily); TikTok folgt.
// Standort aus dem Kampagnennamen; ohne Standort = "Beide", Aufteilung nach Einstellung. Agenturkosten (3'800 EUR/Monat, Ruben
// 05.09., Agentur wird gekuendigt) stehen im Tab Einstellungen und werden nach Media-Anteil auf die Standorte verteilt; CAC gibt
// es deshalb mit und ohne Agentur. CPL/CAC/LTV stehen je Standort im Monatsabschluss (Block "Werbung und Kundenwert").
var WK_SHEET = 'WerbekostenDaten', WK_VIEW = 'Werbekosten', WK_HEAD = ['Datum', 'Plattform', 'Konto', 'Kampagne', 'Standort', 'Kosten CHF', 'Klicks', 'Impressionen', 'Stand', 'Kampagnen-ID'];
// Kampagnen-ID (Spalte J, seit 08.09.2026): Google Ads schreibt campaign.id (tools/google-ads-spend-script.js), damit Google-Leads ueber
// gad_campaignid im Anzeigen-Link der Kampagne zugeordnet werden koennen (Google haengt keinen Kampagnennamen an den Link,
// Meta und TikTok schon: utm_campaign = Kampagnenname). Solange die ID fehlt: Zuordnung ueber Standort + Little Ninjas/Erwachsene.
var WK_PLATFORMS = ['Google Ads', 'Meta Ads', 'TikTok Ads']; // gleiche Namen wie die Lead-Kanaele (KANAL_ORDER)
var ST_SHEET = 'Einstellungen';
var ST_DEFAULTS = [
  ['Agentur Zürich EUR/Monat', '1000', 'Agentur-Pauschale für Zürich in EUR pro Monat (Ruben 07.09.2026). 0 oder leer = keine.'],
  ['Agentur Winterthur EUR/Monat', '1000', 'Agentur-Pauschale für Winterthur in EUR pro Monat (Ruben 07.09.2026).'],
  ['Agentur TikTok EUR/Monat', '750', 'TikTok-Pauschale für beide Standorte in EUR pro Monat, wird nach den TikTok-Ausgaben des Monats auf Zürich und Winterthur verteilt (ohne TikTok-Ausgaben 50/50). Die Pauschale für das Striking Studio (1000 EUR) zählt hier nicht.'],
  ['Agentur von', '2026-01', 'Erster Monat mit Agenturkosten (yyyy-MM).'],
  ['Agentur bis', '', 'Letzter Monat mit Agenturkosten (yyyy-MM). Leer = laeuft noch.'],
  ['EUR in CHF', '0.94', 'Kurs fuer die Umrechnung der Agenturkosten - bitte pruefen.'],
  ['Werbekosten-Split ohne Standort', '0.5', 'Anteil Zuerich fuer Kampagnen ohne Standort im Namen (Rest Winterthur).'],
];
var ST_OBSOLETE = /^(Agentur EUR\/Monat|Prognose: |Saisonindex )/; // alte Einstellungen (Prognose bis 2030 abgeschafft, Agentur je Standort; Ruben 07.09.2026) werden beim Lesen entfernt
function stGet(ss) {
  var sh = ss.getSheetByName(ST_SHEET);
  if (!sh) {
    sh = ss.insertSheet(ST_SHEET); sh.getRange(2, 2, ST_DEFAULTS.length, 1).setNumberFormat('@');
    sh.getRange(1, 1, 1, 3).setValues([['Einstellung', 'Wert', 'Hinweis']]).setFontWeight('bold'); sh.getRange(2, 1, ST_DEFAULTS.length, 3).setValues(ST_DEFAULTS);
    sh.setColumnWidth(1, 240); sh.setColumnWidth(3, 500); sh.setFrozenRows(1);
  }
  var vals = sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), 2).getValues(), del = [], o = {};
  vals.forEach(function (r, i) { if (!r[0]) return; if (ST_OBSOLETE.test(String(r[0]))) del.push(i + 2); else o[String(r[0])] = r[1]; });
  for (var j = del.length - 1; j >= 0; j--) sh.deleteRow(del[j]);
  // neue Einstellungen mit Standardwert nachtragen (bestehende Werte bleiben)
  var missing = ST_DEFAULTS.filter(function (d) { return !(d[0] in o); });
  if (missing.length) { var at = sh.getLastRow() + 1; sh.getRange(at, 2, missing.length, 1).setNumberFormat('@'); sh.getRange(at, 1, missing.length, 3).setValues(missing); missing.forEach(function (d) { o[d[0]] = d[1]; }); }
  return o;
}
function stSet(ss, key, value) { // eine Einstellung setzen (Wert als Text, damit Sheets nichts umdeutet)
  var sh = ss.getSheetByName(ST_SHEET) || (stGet(ss), ss.getSheetByName(ST_SHEET)), v = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]) === key) { sh.getRange(i + 1, 2).setNumberFormat('@').setValue(String(value)); return true; }
  return false;
}
function wkLocOf(name) { var s = String(name || ''); if (/winterthur|\bWT\b|winti/i.test(s)) return 'Winterthur'; if (/z[üu]e?rich|\bZH\b/i.test(s)) return 'Zurich'; return 'Beide'; }
function wkRead(ss) {
  var sh = ss.getSheetByName(WK_SHEET); if (sh && !sh.isSheetHidden()) sh.hideSheet(); // Rohdaten bleiben versteckt (Ruben 06.09.)
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, WK_HEAD.length).getValues().map(function (r) { return { d: dOfCell(r[0]), plat: String(r[1] || ''), acct: String(r[2] || ''), camp: String(r[3] || ''), loc: String(r[4] || ''), cost: Number(r[5]) || 0, clicks: Number(r[6]) || 0, imp: Number(r[7]) || 0, cid: String(r[9] || '').replace(/\.0$/, '') }; }).filter(function (x) { return x.d && x.plat; });
}
function wkUpsert(ss, rows) {
  var sh = getOrCreate(ss, WK_SHEET);
  if (sh.getLastRow() === 0) { sh.appendRow(WK_HEAD); sh.getRange(1, 1, 1, WK_HEAD.length).setFontWeight('bold'); sh.setFrozenRows(1); }
  else if (String(sh.getRange(1, WK_HEAD.length).getValue()) !== WK_HEAD[WK_HEAD.length - 1]) sh.getRange(1, 1, 1, WK_HEAD.length).setValues([WK_HEAD]).setFontWeight('bold'); // neue Spalte Kampagnen-ID
  if (!sh.isSheetHidden()) sh.hideSheet();
  var n = Math.max(0, sh.getLastRow() - 1), ex = n ? sh.getRange(2, 1, n, WK_HEAD.length).getValues() : [], idx = {};
  ex.forEach(function (r, i) { idx[dOfCell(r[0]) + '|' + r[1] + '|' + r[2] + '|' + r[3]] = i; });
  var stamp = Utilities.formatDate(new Date(), TZ, 'dd.MM. HH:mm'), add = [], upd = 0;
  rows.forEach(function (x) {
    if (!x.date) return;
    var k = x.date + '|' + x.platform + '|' + x.account + '|' + x.campaign;
    var row = [x.date, x.platform, x.account, x.campaign, wkLocOf(x.campaign), Math.round(x.spend * 100) / 100, x.clicks, x.impressions, stamp, x.campaign_id ? String(x.campaign_id) : (k in idx ? ex[idx[k]][9] : '')];
    if (k in idx) { ex[idx[k]] = row; upd++; } else add.push(row);
  });
  if (n) sh.getRange(2, 1, n, WK_HEAD.length).setValues(ex);
  if (add.length) sh.getRange(n + 2, 1, add.length, WK_HEAD.length).setValues(add);
  sh.getRange(2, 1, Math.max(1, n + add.length), 1).setNumberFormat('yyyy-MM-dd');
  return upd + ' aktualisiert, ' + add.length + ' neu';
}
function wkBlank() { return { media: 0, plat: {}, clicks: 0 }; }
// Kosten je Schluessel (Monat oder Woche) und Standort; "Beide" wird nach Einstellung aufgeteilt
function wkAgg(ss, keyFn) {
  var st = stGet(ss), share = Number(st['Werbekosten-Split ohne Standort']); if (!(share >= 0 && share <= 1)) share = 0.5;
  var out = {};
  wkRead(ss).forEach(function (x) {
    var k = keyFn(x.d); if (!k) return;
    var o = out[k] = out[k] || { Zurich: wkBlank(), Winterthur: wkBlank() };
    var parts = x.loc === 'Zurich' ? [['Zurich', 1]] : x.loc === 'Winterthur' ? [['Winterthur', 1]] : [['Zurich', share], ['Winterthur', 1 - share]];
    parts.forEach(function (pt) { var L = o[pt[0]], c = x.cost * pt[1]; L.media += c; L.plat[x.plat] = (L.plat[x.plat] || 0) + c; L.clicks += x.clicks * pt[1]; });
  });
  return out;
}
function wkMonthAgg(ss) { return wkAgg(ss, function (d) { return d.slice(0, 7); }); }
function wkWeekAgg(ss) { return wkAgg(ss, function (d) { return fmtD(mondayOf(new Date(d + 'T12:00:00'))); }); }
// Agenturkosten CHF eines Monats je Standort: Pauschale je Standort plus TikTok-Pauschale nach TikTok-Ausgaben verteilt (Ruben 07.09.2026)
function wkAgency(ss, mk, agg) {
  var st = stGet(ss), rate = Number(st['EUR in CHF']) || 1, zh = Number(st['Agentur Zürich EUR/Monat']) || 0, wt = Number(st['Agentur Winterthur EUR/Monat']) || 0, tk = Number(st['Agentur TikTok EUR/Monat']) || 0;
  var von = st['Agentur von'] ? mkOf(st['Agentur von']) : '', bis = st['Agentur bis'] ? mkOf(st['Agentur bis']) : '';
  if (!(zh + wt + tk) || (von && mk < von) || (bis && mk > bis)) return { Zurich: 0, Winterthur: 0 };
  var o = agg[mk], tz = o ? (o.Zurich.plat['TikTok Ads'] || 0) : 0, tw = o ? (o.Winterthur.plat['TikTok Ads'] || 0) : 0, tot = tz + tw, sz = tot ? tz / tot : 0.5;
  return { Zurich: (zh + tk * sz) * rate, Winterthur: (wt + tk * (1 - sz)) * rate };
}
var WK_NOTE = 'Media-Kosten je Monat und Standort: Google Ads (Skript), Meta (API) und TikTok (Report-Mail) täglich, Agentur aus dem Tab Einstellungen. Unten je Kampagne der letzten 30 Tage: Kosten, Klicks, Website-Leads und Cost per Lead (Notiz an der Spalte). Definitionen im Tab Methodik.';
var WK_NOTE_FULL = 'Kampagnentabelle unten: Website-Leads je Kampagne aus dem Anzeigen-Link (Meta/TikTok: utm_campaign = Kampagnenname; Google: Kampagnen-ID gad_campaignid, zugeordnet über das Google-Ads-Skript, sonst Standort plus Little Ninjas/Erwachsene) und CPL = Kosten / Leads, beides letzte 30 Tage. Media-Kosten je Monat und Standort aus dem versteckten Tab WerbekostenDaten (Google Ads: Google-Ads-Skript täglich; Meta: Marketing API täglich 06:30; TikTok: täglicher Report-Anhang per Mail, Betreff "IMPACT TikTok"). Standort aus dem Kampagnennamen, Kampagnen ohne Standort nach dem Split im Tab Einstellungen aufgeteilt. Agenturkosten aus dem Tab Einstellungen, nach Media-Anteil auf die Standorte verteilt. Kosten pro Lead, CAC und LTV stehen im Monatsabschluss.';
var WK_LEADS_NOTE = 'Website-Leads (Formular, zählend wie im Tab Daten) der letzten 30 Tage, deren Anzeigen-Link diese Kampagne nennt: Meta und TikTok hängen den Kampagnennamen als utm_campaign an, Google nur die Kampagnen-ID (gad_campaignid), die über das Google-Ads-Skript zugeordnet wird; fehlt die ID, zählt Standort plus Little Ninjas/Erwachsene. "ohne Kampagnen-Zuordnung" = bezahlte Leads ohne erkennbare Kampagne.';
var WK_ATTR_FROM = '2026-09-04'; // seit dann steht die Kampagne aus dem Anzeigen-Link (utm_campaign / gad_campaignid) im Lead-Log (Commit d146bdb)
function wkCampKey(name) { return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
// Website-Leads je Monat und Standort: ab LOG_START aus dem Log (Daten, Zaehlt = 1), davor die Monatszahlen aus der MonatsHistorie (leads_web)
function wkLeadsByMonth(ss) {
  var out = {}, hs = ss.getSheetByName(MA_HIST);
  if (hs && hs.getLastRow() > 1) hs.getRange(2, 1, hs.getLastRow() - 1, 4).getValues().forEach(function (r) { if (String(r[2]) !== 'leads_web') return; var mk = mkOf(r[0]); if (!mk || mk >= LOG_START.slice(0, 7)) return; (out[mk] = out[mk] || {})[String(r[1])] = Number(r[3]) || 0; });
  var wr = wrCollect(ss, null).month;
  Object.keys(wr).forEach(function (mk) { out[mk] = { Zurich: wr[mk].leads.Zurich, Winterthur: wr[mk].leads.Winterthur }; });
  return out;
}
// Website-Leads je Kampagne ab 'since': Daten (Datum, Standort, Interesse, Zaehlt, Kanal) und Leads (Seite, utm_campaign) Zeile fuer Zeile
function wkLeadsByCampaign(ss, since, all) {
  var out = { by: {}, open: {} }, dn = ss.getSheetByName('Daten'), ld = ss.getSheetByName('Leads');
  if (!dn || !ld || dn.getLastRow() < 2 || ld.getLastRow() < 2) return out;
  var n = Math.min(dn.getLastRow(), ld.getLastRow()) - 1, dv = dn.getRange(2, 1, n, 10).getValues(), lv = ld.getRange(2, 1, n, 24).getValues();
  var names = {}, byId = {}, cands = {};
  (all || []).forEach(function (x) { if (!x.camp) return; var k = x.plat + '|' + wkCampKey(x.camp); names[k] = x.camp; if (x.cid) byId[x.plat + '|' + x.cid] = x.camp; if (x.d >= since) (cands[x.plat + '|' + x.loc] = cands[x.plat + '|' + x.loc] || {})[x.camp] = 1; });
  for (var i = 0; i < n; i++) {
    var d = dOfCell(dv[i][0]), plat = String(dv[i][9] || ''), loc = String(dv[i][3] || '');
    if (!d || d < since || Number(dv[i][6]) !== 1 || WK_PLATFORMS.indexOf(plat) < 0) continue;
    var camp = '', utm = wkCampKey(lv[i][23]), page = String(lv[i][13] || '');
    if (utm && names[plat + '|' + utm]) camp = names[plat + '|' + utm];
    if (!camp && plat === 'Google Ads') {
      var m = page.match(/[?&]gad_campaignid=(\d+)/); if (m && byId[plat + '|' + m[1]]) camp = byId[plat + '|' + m[1]];
      if (!camp) { // ohne ID: Standort + Little Ninjas/Erwachsene, nur wenn genau eine Kampagne passt
        var kids = /little ninjas|kids/i.test(String(dv[i][4] || '') + ' ' + String(lv[i][7] || '')), lk = loc === 'Zürich' ? 'Zurich' : loc;
        var cs = Object.keys(cands[plat + '|' + lk] || {}).filter(function (c) { return /ninja|kids/i.test(c) === kids; });
        if (cs.length === 1) camp = cs[0];
      }
    }
    if (camp) { var key = plat + '|' + wkCampKey(camp); out.by[key] = (out.by[key] || 0) + 1; } else out.open[plat] = (out.open[plat] || 0) + 1;
  }
  return out;
}
function buildWerbekosten(ss) {
  var sh = getOrCreate(ss, WK_VIEW); clearSheet(sh);
  var agg = wkMonthAgg(ss), months = Object.keys(agg).sort().slice(-12), now = Utilities.formatDate(new Date(), TZ, 'yyyy-MM');
  if (months.indexOf(now) < 0) months.push(now);
  var lm = wkLeadsByMonth(ss); // Website-Leads je Monat und Standort, gleiche Quelle wie der Monatsabschluss (Ruben 08.09.: CPL je Monat und Standort)
  sh.getRange('A1').setValue('IMPACT Werbekosten').setFontSize(16).setFontWeight('bold');
  sh.getRange('A2').setValue(WK_NOTE).setFontColor('#666666').setWrap(true);
  sh.getRange('A2:H2').merge(); sh.setRowHeight(2, 64);
  var r = 4;
  ['Zurich', 'Winterthur'].forEach(function (loc) {
    sh.getRange(r, 1).setValue(loc === 'Zurich' ? 'Zürich' : 'Winterthur').setFontWeight('bold').setFontSize(13); r++;
    var head = ['Monat'].concat(WK_PLATFORMS).concat(['Media gesamt', 'Agentur', 'Gesamt', 'Klicks', 'Leads', 'CPL (CHF)']);
    sh.getRange(r, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#f3f3f3');
    sh.getRange(r, head.length - 1).setNote('Website-Leads des Monats an diesem Standort (Log, ohne Dubletten und Tests; vor September 2026 die von Hand gezählten Monatszahlen), dieselbe Zahl wie "davon über die Website" im Monatsabschluss.');
    sh.getRange(r, head.length).setNote('Cost per Lead = Media-Kosten des Monats geteilt durch die Website-Leads des Monats, dieselbe Zahl wie "Kosten pro Website-Lead" im Monatsabschluss. Ohne Agentur.'); r++;
    var rows = months.map(function (mk) { var o = (agg[mk] || {})[loc] || wkBlank(), ag = wkAgency(ss, mk, agg)[loc], le = (lm[mk] || {})[loc] || 0; return [new Date(mk + '-01T00:00:00')].concat(WK_PLATFORMS.map(function (pn) { return Math.round(o.plat[pn] || 0); })).concat([Math.round(o.media), Math.round(ag), Math.round(o.media + ag), Math.round(o.clicks), le, le && o.media ? Math.round(o.media / le) : '']); });
    sh.getRange(r, 1, rows.length, head.length).setValues(rows); sh.getRange(r, 1, rows.length, 1).setNumberFormat('mmm yyyy'); sh.getRange(r, 2, rows.length, head.length - 1).setNumberFormat('#,##0');
    r += rows.length + 2;
  });
  // Kampagnen je Monat: macht Pausen und Standortwechsel je Kampagne sichtbar (Ruben 05.09.: sauber getrennt beobachtbar)
  var all = wkRead(ss), cm = {};
  all.forEach(function (x) { var k = x.plat + '|' + x.camp, o = cm[k] = cm[k] || { plat: x.plat, camp: x.camp, loc: x.loc, m: {}, tot: 0 }; var mk = x.d.slice(0, 7); o.m[mk] = (o.m[mk] || 0) + x.cost; o.tot += x.cost; });
  var clist = Object.keys(cm).map(function (k) { return cm[k]; }).sort(function (a, b) { return (a.loc + a.plat).localeCompare(b.loc + b.plat) || b.tot - a.tot; });
  sh.getRange(r, 1).setValue('Kampagnen je Monat (CHF, alle geladenen Monate)').setFontWeight('bold').setFontSize(13); r++;
  var ch = ['Standort', 'Plattform', 'Kampagne'].concat(months.map(function (mk) { return new Date(mk + '-01T00:00:00'); }));
  sh.getRange(r, 1, 1, ch.length).setValues([ch]).setFontWeight('bold').setBackground('#f3f3f3'); sh.getRange(r, 4, 1, months.length).setNumberFormat('mmm yy'); r++;
  if (clist.length) {
    var crows = clist.map(function (o) { return [o.loc === 'Zurich' ? 'Zürich' : o.loc, o.plat, o.camp].concat(months.map(function (mk) { return o.m[mk] ? Math.round(o.m[mk]) : ''; })); });
    sh.getRange(r, 1, crows.length, ch.length).setValues(crows); sh.getRange(r, 4, crows.length, months.length).setNumberFormat('#,##0'); r += crows.length;
  }
  r += 2;
  // Fenster: letzte 30 Tage, aber nicht vor WK_ATTR_FROM - die Kampagne im Anzeigen-Link wird erst seit dann im Formular erfasst;
  // Kosten und Leads muessen denselben Zeitraum haben (Lehre 08.09.: Kosten ab 09.08. gegen Leads ab 04.09. ergab CPL 2'000+)
  var since = fmtD(addD(new Date(), -30)), clipped = since < WK_ATTR_FROM; if (clipped) since = WK_ATTR_FROM;
  var by = {};
  all.forEach(function (x) { if (x.d < since) return; var k = x.plat + '|' + x.camp, o = by[k] = by[k] || { plat: x.plat, camp: x.camp, loc: x.loc, cost: 0, clicks: 0 }; o.cost += x.cost; o.clicks += x.clicks; });
  var list = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.cost - a.cost; });
  var lk = wkLeadsByCampaign(ss, since, all); // Website-Leads je Kampagne (Ruben 08.09.: Cost per Lead je Kampagne)
  sh.getRange(r, 1).setValue(clipped ? 'Kampagnen seit ' + deD(since) + ' (Kampagne im Anzeigen-Link wird seit dann erfasst; ab ' + deD(addDs(WK_ATTR_FROM, 30)) + ' rollierend 30 Tage)' : 'Kampagnen der letzten 30 Tage (ab ' + deD(since) + ')').setFontWeight('bold').setFontSize(13); r++;
  sh.getRange(r, 1, 1, 7).setValues([['Plattform', 'Kampagne', 'Standort', 'Kosten CHF', 'Klicks', 'Leads', 'CPL (CHF)']]).setFontWeight('bold').setBackground('#f3f3f3');
  sh.getRange(r, 6).setNote(WK_LEADS_NOTE); sh.getRange(r, 7).setNote('Kosten der Kampagne geteilt durch ihre Website-Leads im gleichen Zeitraum (letzte 30 Tage). Leer = keine Leads.'); r++;
  var lrows = list.map(function (o) { var n = lk.by[o.plat + '|' + wkCampKey(o.camp)] || 0; return [o.plat, o.camp, o.loc === 'Zurich' ? 'Zürich' : o.loc, Math.round(o.cost), Math.round(o.clicks), n, n ? Math.round(o.cost / n) : '']; });
  WK_PLATFORMS.forEach(function (pn) { if (lk.open[pn]) lrows.push([pn, 'ohne Kampagnen-Zuordnung', '', '', '', lk.open[pn], '']); });
  if (lrows.length) { sh.getRange(r, 1, lrows.length, 7).setValues(lrows); sh.getRange(r, 4, lrows.length, 4).setNumberFormat('#,##0'); r += lrows.length; }
  else sh.getRange(r, 1).setValue('noch keine Daten – Google-Ads-Skript und Meta-Token einrichten').setFontColor('#999999');
  sh.setColumnWidth(1, 150); sh.setColumnWidth(2, 320); sh.setColumnWidth(3, 320); sh.setFrozenColumns(0);
}
// ------------------------------------------------------------ TikTok Ads (07.09.2026, Ruben: "TikTok auch anlegen")
// TikTok hat keine Server-API ohne App-Freigabe, deshalb: der TikTok Ads Manager schickt einen Kampagnen-Report (Tagesaufloesung)
// als CSV-Anhang per Mail an Ruben, Betreff enthaelt TK_SUBJECT. tkImport() liest diese Mails der letzten TK_DAYS Tage aus Gmail,
// erkennt die Spalten am Kopf (Datum, Kampagne, Kosten, Klicks, Impressionen, Waehrung) und schreibt sie wie Google/Meta nach
// WerbekostenDaten (Upsert je Tag+Kampagne). Historie: alten Export als CSV an sich selbst mailen, gleicher Betreff, dann
// tkImport(30). Erster Lauf im Editor noetig (Gmail-Freigabe durch Ruben).
var TK_SUBJECT = 'IMPACT TikTok', TK_ACCOUNT = 'TikTok Ads Manager', TK_DAYS = 4;
function tkParseDate(v) {
  var s = String(v || '').trim(), m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[1] + '-' + m[2] + '-' + m[3];
  if ((m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/))) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return m[1] + '-' + m[2] + '-' + m[3];
  if (!/\d{4}/.test(s)) return '';
  var d = new Date(s); return isNaN(d) ? '' : fmtD(d);
}
function tkNum(v) { var s = String(v || '').replace(/[^\d.,\-]/g, ''); if (/,\d{1,2}$/.test(s) && s.indexOf('.') < 0) s = s.replace(',', '.'); return Number(s.replace(/,/g, '')) || 0; }
function tkRowsFromCsv(text) {
  var rows = Utilities.parseCsv(String(text || '').replace(/^﻿/, '')), out = [], hi = -1, col = {};
  for (var i = 0; i < Math.min(rows.length, 10) && hi < 0; i++) {
    var c = {};
    rows[i].forEach(function (cell, j) {
      var x = String(cell || '').trim().toLowerCase();
      if (c.date === undefined && /^(date|day|by day|datum|tag|time|stat_time_day)$/.test(x)) c.date = j;
      if (c.camp === undefined && /campaign.?name|kampagnenname|^campaign$|^kampagne$/.test(x)) c.camp = j;
      if (c.cost === undefined && /^(cost|spend|total cost|kosten|ausgaben)/.test(x)) c.cost = j;
      if (c.clicks === undefined && /^(clicks|klicks|clicks \(destination\)|clicks \(all\))$/.test(x)) c.clicks = j;
      if (c.imp === undefined && /^(impressions|impressionen)$/.test(x)) c.imp = j;
      if (c.cur === undefined && /currency|währung|waehrung/.test(x)) c.cur = j;
    });
    if (c.date !== undefined && c.camp !== undefined && c.cost !== undefined) { hi = i; col = c; }
  }
  if (hi < 0) throw new Error('TikTok-CSV: Spalten Datum/Kampagne/Kosten nicht gefunden (Kopf: ' + (rows[0] || []).join(' | ').slice(0, 200) + ')');
  for (var r = hi + 1; r < rows.length; r++) {
    var d = tkParseDate(rows[r][col.date]); if (!d) continue; // Summenzeilen ohne Datum
    out.push({ date: d, platform: 'TikTok Ads', account: TK_ACCOUNT, campaign: String(rows[r][col.camp] || '').trim(), spend: tkNum(rows[r][col.cost]),
      clicks: col.clicks === undefined ? 0 : tkNum(rows[r][col.clicks]), impressions: col.imp === undefined ? 0 : tkNum(rows[r][col.imp]), currency: col.cur === undefined ? 'CHF' : String(rows[r][col.cur] || 'CHF') });
  }
  return out;
}
function tkImport(days) {
  var ss = SpreadsheetApp.openById(SHEET_ID), st = stGet(ss), rate = Number(st['EUR in CHF']) || 1;
  var threads = GmailApp.search('subject:"' + TK_SUBJECT + '" has:attachment newer_than:' + (days || TK_DAYS) + 'd', 0, 30), all = [], files = 0;
  threads.forEach(function (t) { t.getMessages().forEach(function (msg) { msg.getAttachments().forEach(function (a) {
    if (!/\.csv$/i.test(String(a.getName() || ''))) return;
    files++; all = all.concat(tkRowsFromCsv(a.getDataAsString('UTF-8')));
  }); }); });
  all.forEach(function (x) { if (String(x.currency).toUpperCase() === 'EUR') x.spend = x.spend * rate; });
  return 'TikTok: ' + files + ' CSV, ' + all.length + ' Zeilen, ' + (all.length ? wkUpsert(ss, all) : 'nichts zu schreiben');
}
function tkImportHistory() { return tkImport(60); } // einmalig nach dem Mailen des alten Exports (Editor)
function runWerbekosten() {
  var ss = SpreadsheetApp.openById(SHEET_ID), st = stGet(ss), now = new Date(), notes = [];
  var r = klassenCall({ action: 'ads', start: fmtD(addD(now, -14)), end: fmtD(now) });
  if (r.error === 'no_meta_token') notes.push('Meta: kein Token in Cloudflare (META_ADS_TOKEN)');
  else if (r.error || !r.ok) throw new Error('Werbekosten Meta: ' + JSON.stringify(r).slice(0, 300));
  else {
    var rate = Number(st['EUR in CHF']) || 1;
    (r.rows || []).forEach(function (x) { if (String(x.currency).toUpperCase() === 'EUR') x.spend = x.spend * rate; });
    notes.push('Meta: ' + wkUpsert(ss, r.rows || []));
    if (r.errors && r.errors.length) notes.push('Meta-Fehler: ' + JSON.stringify(r.errors).slice(0, 300));
  }
  try { notes.push(tkImport()); } catch (e) { notes.push('TikTok-Fehler: ' + String(e && e.message ? e.message : e).slice(0, 200)); }
  buildWerbekosten(ss);
  buildMonatsabschluss(ss); // CPL/CAC im Monatsabschluss lesen die Werbedaten beim Bauen, deshalb taeglich mit neu bauen
  Logger.log('Werbekosten: ' + notes.join(' | '));
  return notes.join(' | ');
}
function runWerbekostenDaily() {
  try { var t = runWerbekosten(); if (/Meta-Fehler|TikTok-Fehler/.test(t)) mailOnce('werbekosten', '[Sheet] Werbekosten mit Fehlern', t); }
  catch (e) { mailOnce('werbekosten', '[Sheet] Werbekosten FEHLGESCHLAGEN', String(e && e.stack ? e.stack : e)); }
}

// ------------------------------------------------------------ LTV (05.09.2026, Entscheide Ruben: Netto-Umsatz mit allem; VERLOREN ist nur,
// wer offiziell gekuendigt hat (Kuendigung wirksam, Report cancelled_subscriptions ohne Converted) oder wegen Nichtzahlung rausfliegt
// (Lifecycle-Uebergang nach "Debt collection") - Zahlungsluecken zaehlen nicht; Migrierte ueber die Tags Migrating/imported/Bexio;
// Kohorten, ARPU, Retention und Prognose nur aus nicht migrierten Kunden).
// Drei Monatsreihen aus der Cloudflare-Funktion (action 'ltv', kind charges/cancelled/lifecycle, ein Monat je Aufruf wegen des
// Report-Caches) in versteckten Tabs, Nachladen ab LTV_START in Etappen (Kette ueber Einmal-Trigger, Script-Lock), monatlich am 1.
// um 05:00 der Vormonat; Kunden-Flags (action 'clients_flags') werden bei jedem Lauf komplett neu geholt.
var LTV_SHEET = 'LTV', LTV_DATA = 'ZahlungenMonat', LTV_START = '2025-06', LTV_HEAD = ['Monat', 'UID', 'E-Mail', 'Standort', 'Typ', 'Netto', 'Brutto', 'Anzahl'];
var LTV_INIT = '2026-09-06 Cash'; // Marke aendern = fehlende Monate werden beim naechsten Stundenlauf nachgeladen
var LTV_TABS = {
  charges: { name: LTV_DATA, head: LTV_HEAD },
  cancelled: { name: 'KuendigungenMonat', head: ['Monat', 'UID', 'E-Mail', 'Standort', 'Ende', 'Converted', 'Paket', 'Grund'] },
  lifecycle: { name: 'LifecycleMonat', head: ['Monat', 'E-Mail', 'Datum', 'Von', 'Nach'] },
  sums: { name: 'ZahlungenTag', head: ['Monat', 'Datum', 'Standort', 'Anzahl', 'Betrag', 'Gebuehr', 'Refund', 'MwSt', 'Auszahlung'] }, // Cash-Block (06.09.)
};
var LTV_FLAGS = 'KundenFlags', LTV_FLAGS_HEAD = ['UID', 'E-Mail', 'Migriert', 'Erstellt', 'TrialZH', 'TrialWT', 'StageID'];
function nextMonth(mk) { return monthKeyStr(new Date(+mk.slice(0, 4), +mk.slice(5, 7), 1)); }
function prevMonth(mk) { return monthKeyStr(new Date(+mk.slice(0, 4), +mk.slice(5, 7) - 2, 1)); }
function addMonths(mk, n) { return monthKeyStr(new Date(+mk.slice(0, 4), +mk.slice(5, 7) - 1 + n, 1)); }
function ltvTab(ss, kind) {
  var t = LTV_TABS[kind], sh = getOrCreate(ss, t.name);
  if (sh.getLastRow() === 0) { sh.getRange(1, 1, sh.getMaxRows(), 1).setNumberFormat('@'); sh.getRange(1, 1, 1, t.head.length).setValues([t.head]).setFontWeight('bold'); sh.setFrozenRows(1); }
  if (!sh.isSheetHidden()) sh.hideSheet();
  return sh;
}
function ltvRows(ss, kind) {
  var t = LTV_TABS[kind], sh = ss.getSheetByName(t.name); if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, t.head.length).getValues().map(function (r) { r[0] = mkOf(r[0]); return r; }).filter(function (r) { return /^\d{4}-\d{2}$/.test(r[0]); });
}
function ltvRead(ss) { return ltvRows(ss, 'charges').map(function (r) { return { mk: r[0], uid: String(r[1]), email: String(r[2] || ''), loc: String(r[3] || ''), type: String(r[4] || ''), net: Number(r[5]) || 0, gross: Number(r[6]) || 0, n: Number(r[7]) || 0 }; }); }
function ltvQueue(ss) {
  var now = new Date(), last = monthKeyStr(new Date(now.getFullYear(), now.getMonth() - 1, 1)), out = [];
  Object.keys(LTV_TABS).forEach(function (kind) {
    var done = {}; ltvRows(ss, kind).forEach(function (r) { done[r[0]] = 1; });
    for (var mk = LTV_START; mk <= last; mk = nextMonth(mk)) if (!done[mk]) out.push({ mk: mk, kind: kind });
  });
  out.sort(function (a, b) { return a.mk < b.mk ? -1 : a.mk > b.mk ? 1 : 0; });
  return out;
}
function ltvFetch(ss, mk, kind) {
  var base = { action: 'ltv', month: mk, kind: kind, start: mk + '-01', end: mk + '-01' };
  var r1 = klassenCall(Object.assign({ phase: 'cr' }, base)); if (r1.error) throw new Error('LTV ' + kind + ' ' + mk + ' cr: ' + JSON.stringify(r1).slice(0, 300));
  var r2 = null, i;
  // 5xx von Cloudflare/exercise.com (grosse Reports, z. B. Lifecycle im Migrationsmonat) sind voruebergehend: weiter pollen
  for (i = 0; i < 15; i++) { Utilities.sleep(8000); r2 = klassenCall(Object.assign({ phase: 'cg' }, base)); if (r2.error && !(Number(r2.http) >= 500)) throw new Error('LTV ' + kind + ' ' + mk + ' cg: ' + JSON.stringify(r2).slice(0, 300)); if (r2.ready) break; }
  if (!r2 || !r2.ready) throw new Error('LTV ' + kind + ' ' + mk + ' nicht fertig: ' + JSON.stringify(r2).slice(0, 300));
  var sh = ltvTab(ss, kind), w = LTV_TABS[kind].head.length, rows = (r2.rows || []).map(function (a) { var row = [mk].concat(a); while (row.length < w) row.push(''); return row.slice(0, w); });
  if (!rows.length) { var mark = [mk, '-']; while (mark.length < w) mark.push(''); rows = [mark]; } // Marke: Monat geprueft, leer
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, w).setValues(rows);
  return rows.length;
}
function ltvFlagsRefresh(ss) {
  var r = klassenCall({ action: 'clients_flags', start: '2026-01-01', end: '2026-01-01' });
  if (r.error || !r.ok) throw new Error('Kunden-Flags: ' + JSON.stringify(r).slice(0, 300));
  var sh = getOrCreate(ss, LTV_FLAGS); sh.clear(); if (!sh.isSheetHidden()) sh.hideSheet();
  sh.getRange(1, 1, 1, LTV_FLAGS_HEAD.length).setValues([LTV_FLAGS_HEAD]).setFontWeight('bold');
  var rows = (r.rows || []).map(function (a) { return a.slice(0, LTV_FLAGS_HEAD.length); });
  if (rows.length) { sh.getRange(2, 1, rows.length, 2).setNumberFormat('@'); sh.getRange(2, 4, rows.length, 1).setNumberFormat('@'); sh.getRange(2, 1, rows.length, LTV_FLAGS_HEAD.length).setValues(rows); }
  return rows.length;
}
function ltvFlags(ss) {
  var sh = ss.getSheetByName(LTV_FLAGS), out = {}; if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, LTV_FLAGS_HEAD.length).getValues().forEach(function (r) { var u = String(r[0] || ''); if (u) out[u] = { email: String(r[1] || ''), mig: Number(r[2]) === 1, created: mkOf(r[3]), stage: String(r[6] || '') }; });
  return out;
}
function ltvDropChain() { ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'runLTVChain') ScriptApp.deleteTrigger(t); }); }
function ltvQueueInit() {
  var pr = PropertiesService.getScriptProperties(); if (pr.getProperty('ltvInit') === LTV_INIT) return;
  pr.setProperty('ltvInit', LTV_INIT); ltvDropChain(); ScriptApp.newTrigger('runLTVChain').timeBased().after(3 * 60 * 1000).create();
}
function runLTV() {
  // Sperre: Kette (Einmal-Trigger), Monats-Trigger und manueller Start duerfen nie parallel laufen (sonst doppelte Monatszeilen)
  var lock = LockService.getScriptLock(); if (!lock.tryLock(5000)) { Logger.log('LTV: laeuft bereits, uebersprungen'); return []; }
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID), q = ltvQueue(ss), done = [], t0 = Date.now();
    ltvDropChain();
    // Sicherheitsnetz: falls diese Ausfuehrung am 6-Minuten-Limit stirbt (Lehre 12:18: ein Abruf kann 2 Minuten dauern), laeuft die
    // Kette ueber diesen Trigger trotzdem weiter; bei normalem Ende wird er unten ersetzt bzw. geloescht
    if (q.length) ScriptApp.newTrigger('runLTVChain').timeBased().after(7 * 60 * 1000).create();
    while (q.length && done.length < 8 && Date.now() - t0 < 150000) { var it = q.shift(); done.push(it.kind + ' ' + it.mk + ': ' + ltvFetch(ss, it.mk, it.kind)); }
    ltvDropChain();
    if (q.length) ScriptApp.newTrigger('runLTVChain').timeBased().after(60 * 1000).create();
    else { done.push('Flags: ' + ltvFlagsRefresh(ss)); buildLTV(ss); }
    Logger.log('LTV: ' + done.join(', ') + (q.length ? ' | offen: ' + q.length : ' | fertig, Tab LTV gebaut'));
    return done;
  } finally { lock.releaseLock(); }
}
function runLTVChain() {
  var pr = PropertiesService.getScriptProperties();
  try { runLTV(); pr.deleteProperty('ltvRetry'); }
  catch (e) {
    // voruebergehende Fehler (502 etc.): bis zu drei neue Anlaeufe im Abstand von 5 Minuten, Mail erst beim endgueltigen Abbruch
    var n = Number(pr.getProperty('ltvRetry') || 0) + 1; pr.setProperty('ltvRetry', String(n)); ltvDropChain();
    if (n <= 3) { ScriptApp.newTrigger('runLTVChain').timeBased().after(5 * 60 * 1000).create(); Logger.log('LTV Fehler, Anlauf ' + n + ': ' + e); }
    else { pr.deleteProperty('ltvRetry'); mailOnce('ltv', '[Sheet] LTV FEHLGESCHLAGEN (nach 3 Anlaeufen)', String(e && e.stack ? e.stack : e)); }
  }
}
function runLTVMonthly() { runLTVChain(); }
var LTV_NOTE_FULL = 'Brutto zuerst (Ruben 07.09.2026): alle Werte aus den Bruttobelastungen im Report Charges (Betrag nach Rückerstattungen, inkl. MwSt), netto = brutto geteilt durch 1.081. Kunde = mindestens eine Abo-Belastung; Testzahlungen unter CHF 5 ausgeschlossen. Jahreszahler zählen im Monat der Zahlung. '
  + 'VERLOREN ist nur, wer offiziell gekündigt hat (Kündigung wirksam, Paketwechsel zählen nicht) oder wegen Nichtzahlung in "Debt collection" ging (Entscheid Ruben 05.09.2026); Zahlungslücken zählen nicht, solche Kunden stehen in "ohne Abo-Zahlung im Monat". '
  + 'Migrierte = Konten mit den Tags Migrating / imported / Bexio (Startdatum unbekannt), sie bleiben aus Kohorten und Prognose draussen. '
  + 'EINE Methode für den Kundenwert: Abo-Belastungen der letzten 3 vollen Monate geteilt durch alle Neukunden mit laufendem Abo in diesen Monaten, auch die ohne Zahlung im Monat; dieselbe Rechnung steht im Monatsabschluss als "Abo-Umsatz je Kunde" für alle Kunden. Starterpaket (Einmalkäufe ±1 Monat um die erste Abo-Belastung plus Mehrbetrag der ersten Abo-Belastung, in Zürich meist mit dem Abo zusammen abgebucht) und übrige Einmalkäufe stehen getrennt und zählen im LTV dazu: Starterpaket einmal, übrige Einmalkäufe je Monat mal Dauer (Ruben 08.09.2026). '
  + 'LTV netto = Abo-Umsatz netto je Kunde und Monat × erwartete Dauer + Starterpaket + übrige Einmalkäufe × Dauer; Dauer = 1 / monatliche Verlustquote; Verlustquote = wirksame Kündigungen und Debt collection der letzten 6 Monate geteilt durch die aktiven Neukunden. Kohorten unter 10 Kunden oder jünger als 3 Monate sind grau, weil Kündigungen dort noch nicht wirksam sein können.';
function buildLTV(ss) {
  var sh = getOrCreate(ss, LTV_SHEET); clearSheet(sh);
  var rows = ltvRead(ss).filter(function (x) { return x.uid !== '-' && x.gross >= 5; }); // Testzahlungen (CHF 1-3) raus
  sh.getRange('A1').setValue('IMPACT Kundenwert (LTV)').setFontSize(16).setFontWeight('bold');
  if (!rows.length) { sh.getRange('A2').setValue('Noch keine Zahlungsdaten – das Nachladen läuft.').setFontColor('#666666'); return; }
  var mset = {}; rows.forEach(function (x) { mset[x.mk] = 1; }); var months = Object.keys(mset).sort(), lastFull = months[months.length - 1], cur = Utilities.formatDate(new Date(), TZ, 'yyyy-MM');
  var flags = ltvFlags(ss), hasFlags = Object.keys(flags).length > 100;
  var kMonths = {}; ltvRows(ss, 'cancelled').forEach(function (r) { kMonths[r[0]] = 1; }); var kLast = Object.keys(kMonths).sort().pop() || '';
  // Brutto zuerst (Ruben 07.09.2026): alle Werte aus den Bruttobelastungen, netto = brutto / 1.081. Keine Verteilung von Jahreszahlern
  // mehr (sie zaehlen im Monat der Zahlung), damit Abo + Einmalkaeufe = Zahlungen brutto im Monatsabschluss.
  var per = rows.filter(function (x) { return x.type === 'Abo'; }).map(function (x) { return x.gross / Math.max(1, x.n); }).sort(function (a, b) { return a - b; });
  var med = per.length ? per[Math.floor(per.length / 2)] : 180;
  // Kunde = mindestens eine Abo-Belastung. m = Brutto gesamt je Monat (Kohorten), abo = Abo-Brutto, one = Einmalkaeufe brutto, pay = Monate mit Abo-Belastung
  var cust = {};
  rows.forEach(function (x) {
    var c = cust[x.uid] = cust[x.uid] || { uid: x.uid, email: x.email, loc: x.loc, gross: 0, m: {}, abo: {}, one: {}, pay: {}, first: '', lastAbo: '', endCand: '', debt: '' };
    c.gross += x.gross; c.m[x.mk] = (c.m[x.mk] || 0) + x.gross;
    if (x.type === 'Abo') { c.loc = x.loc; if (!c.first || x.mk < c.first) c.first = x.mk; if (x.mk > c.lastAbo) c.lastAbo = x.mk; c.abo[x.mk] = (c.abo[x.mk] || 0) + x.gross; c.pay[x.mk] = 1; }
    else c.one[x.mk] = (c.one[x.mk] || 0) + x.gross;
  });
  var byEmail = {}; Object.keys(cust).forEach(function (u) { if (cust[u].email) byEmail[cust[u].email] = cust[u]; });
  // Ende = wirksame Kuendigung (ohne Converted = Paketwechsel) oder Uebergang nach Debt collection; hinfaellig, wenn danach wieder Abo-Zahlungen kamen
  ltvRows(ss, 'cancelled').forEach(function (r) { var c = cust[String(r[1])]; if (!c || String(r[1]) === '-' || Number(r[5]) === 1) return; var e = dOfCell(r[4]).slice(0, 7); if (/^\d{4}-\d{2}$/.test(e) && e > c.endCand) c.endCand = e; });
  ltvRows(ss, 'lifecycle').forEach(function (r) { if (!/debt/i.test(String(r[4] || ''))) return; var c = byEmail[String(r[1] || '').toLowerCase().trim()]; if (!c) return; var d = dOfCell(r[2]).slice(0, 7); if (/^\d{4}-\d{2}$/.test(d) && (!c.debt || d < c.debt)) c.debt = d; });
  var list = Object.keys(cust).map(function (u) { return cust[u]; }).filter(function (c) { return c.first; });
  list.forEach(function (c) {
    var e = c.endCand && c.lastAbo <= c.endCand ? c.endCand : ''; if (c.debt && c.lastAbo <= c.debt && (!e || c.debt < e)) e = c.debt;
    c.end = e; c.migrated = hasFlags ? !!(flags[c.uid] && flags[c.uid].mig) : false;
    // Gebuendelte erste Belastung (v. a. Zuerich: Abo + Starterpaket in EINER Charge, Purchase Type "Subscription/Package, ProductVariant"):
    // der Mehrbetrag der ersten Abo-Zahlung gegenueber der ueblichen Monatszahlung des Kunden zaehlt als Starterpaket, nicht als Abo
    var later = Object.keys(c.abo).filter(function (mk) { return mk > c.first && c.abo[mk] > 0; }).map(function (mk) { return c.abo[mk]; }).sort(function (a, b) { return a - b; });
    if (later.length) { var reg = later[Math.floor(later.length / 2)], ex = (c.abo[c.first] || 0) - reg; if ((c.abo[c.first] || 0) > 1.5 * reg && ex > 20) { c.abo[c.first] -= ex; c.one[c.first] = (c.one[c.first] || 0) + ex; c.bundled = ex; } }
  });
  // Starterpaket = Einmalkaeufe im Startfenster (Monat vor der ersten Abo-Zahlung bis Monat danach); uebrige Einmalkaeufe = Shop, Events usw.
  var inStart = function (c, mk) { return mk >= prevMonth(c.first) && mk <= nextMonth(c.first); };
  var starterOf = function (c) { var s = 0; Object.keys(c.one).forEach(function (mk) { if (inStart(c, mk)) s += c.one[mk]; }); return s; };
  var otherOf = function (c, mk) { return inStart(c, mk) ? 0 : (c.one[mk] || 0); };
  sh.getRange('A2').setValue('Kundenwert und LTV aus den Zahlungen in exercise.com (Charges-Report), Zahlungen bis ' + lastFull + ', Kündigungen bis ' + (kLast || '–') + '. Übliche Abo-Belastung brutto (Median) ' + Math.round(med) + ' CHF. ' + (hasFlags ? '' : '⚠️ Kunden-Flags fehlen noch, Migrierte nicht ausgeschlossen. ') + 'Kurzdefinitionen als Notiz an den Zeilen, alles Weitere im Tab Methodik.').setFontColor('#666666').setWrap(true);
  sh.getRange('A2:J2').merge(); sh.setRowHeight(2, 44);
  var r = 4, N = [3, 6, 9, 12], store = [];
  ['Zurich', 'Winterthur', 'Gesamt'].forEach(function (loc) {
    var locDE = loc === 'Zurich' ? 'Zürich' : loc === 'Winterthur' ? 'Winterthur' : 'Gesamt (beide Standorte)', L = loc === 'Gesamt' ? list : list.filter(function (c) { return c.loc === loc; }), fresh = L.filter(function (c) { return !c.migrated; });
    sh.getRange(r, 1).setValue(locDE).setFontWeight('bold').setFontSize(13); r++;
    if (!L.length) { sh.getRange(r, 1).setValue('keine Abo-Zahlungen'); r += 3; return; }
    var active = function (set, mk) { return set.filter(function (c) { return c.first <= mk && (!c.end || c.end >= mk); }); };
    var lostIn = function (set, mk) { return set.filter(function (c) { return c.end === mk; }); };
    var rate = function (set) { var aN = 0, lN = 0, mk = lastFull; for (var i = 0; i < 6 && mk >= months[0]; i++, mk = prevMonth(mk)) { aN += active(set, mk).length; lN += lostIn(set, mk).length; } return { loss: aN ? lN / aN : 0, aN: aN, lN: lN }; };
    var rf = rate(fresh), ra = rate(L);
    var last3 = [lastFull, prevMonth(lastFull), prevMonth(prevMonth(lastFull))], aN = 0, aAbo = 0, aOther = 0, noPay = 0;
    last3.forEach(function (mk) { var act = active(fresh, mk); aN += act.length; act.forEach(function (c) { if (c.pay[mk]) aAbo += c.abo[mk] || 0; else noPay++; aOther += otherOf(c, mk); }); });
    // EINE Methode (Ruben 07.09.2026): Abo-Belastungen brutto geteilt durch alle Kunden mit laufendem Abo (auch ohne Zahlung im Monat), netto = brutto / 1.081
    var arpuG = aN ? aAbo / aN : 0, arpu = arpuG / VAT, other = aN ? aOther / aN / VAT : 0, life = rf.loss > 0 ? 1 / rf.loss : 0;
    var stSet = fresh.filter(function (c) { return c.first <= prevMonth(lastFull); }), starter = stSet.length ? stSet.reduce(function (s, c) { return s + starterOf(c); }, 0) / stSet.length / VAT : 0;
    var ltv = Math.round(arpu * life + starter + other * life); // Abo x Dauer + Starterpaket + uebrige Einmalkaeufe x Dauer (Ruben 08.09.: eine LTV-Zahl)
    var gone = fresh.filter(function (c) { return c.end && c.end <= lastFull; }), aboOf = function (c) { var s = 0; Object.keys(c.abo).forEach(function (mk) { s += c.abo[mk]; }); return s; };
    var realized = gone.length ? gone.reduce(function (a, c) { return a + aboOf(c); }, 0) / gone.length / VAT : 0;
    var kv = [
      ['Kunden mit Abo-Zahlungen seit ' + months[0], L.length, '0', 'Konten mit mindestens einer Abo-Belastung ab CHF 5 im Charges-Report.'],
      ['   davon migriert', L.length - fresh.length, '0', 'Konten mit den Tags Migrating / imported / Bexio. Startdatum unbekannt, deshalb nicht in Kohorten und Prognose.'],
      ['   davon Neukunden (Stichprobe für die Prognose)', fresh.length, '0', 'Alle Kunden ohne Migrations-Tag.'],
      ['Abo-Umsatz brutto je Kunde und Monat', Math.round(arpuG), '#,##0', 'Abo-Belastungen der letzten 3 vollen Monate geteilt durch die Neukunden mit laufendem Abo in diesen Monaten, auch die ohne Zahlung im Monat. Jahreszahler zählen im Monat der Zahlung.'],
      ['Abo-Umsatz netto je Kunde und Monat', Math.round(arpu), '#,##0', 'Brutto geteilt durch 1.081. Basis des LTV.'],
      ['   Kunden ohne Abo-Zahlung im Monat (Ø der 3 Monate)', Math.round(noPay / 3), '0', 'Laufendes Abo, aber keine Belastung im Monat: Pause, geplatzte Zahlung oder ausgelaufener Vertrag ohne Kündigungseintrag.'],
      ['   Übrige Einmalkäufe netto je Kunde und Monat', Math.round(other), '#,##0', 'Shop, Events, Personal Training usw. ausserhalb des Startfensters. Zählt im LTV mal Dauer.'],
      ['Starterpaket netto je Neukunde (einmalig)', Math.round(starter), '#,##0', 'Ø über ' + stSet.length + ' Neukunden mit vollem Fenster: Einmalkäufe von einem Monat vor bis einen Monat nach der ersten Abo-Belastung plus Mehrbetrag der ersten Abo-Belastung. Zählt einmal im LTV; im Finanzplan getrennt geführt.'],
      ['Verlustquote pro Monat (Neukunden)', rf.loss, '0.0%', 'Wirksame Kündigungen und Debt collection der letzten 6 Monate geteilt durch aktive Kundenmonate: ' + rf.lN + ' von ' + rf.aN + '.'],
      ['   alle Kunden inkl. migriert', ra.loss, '0.0%', 'Zum Vergleich: ' + ra.lN + ' von ' + ra.aN + ' Kundenmonaten.'],
      ['Erwartete Dauer (Monate)', Math.round(life * 10) / 10, '0.0', '1 geteilt durch die Verlustquote.'],
      ['LTV netto (Prognose)', ltv, '#,##0', 'Abo-Umsatz netto je Kunde und Monat mal erwartete Dauer, plus Starterpaket, plus übrige Einmalkäufe mal Dauer (Ruben 08.09.2026).'],
      ['Realisierter Abo-Umsatz netto je verlorenem Neukunden', Math.round(realized), '#,##0', gone.length + ' Neukunden mit wirksamer Kündigung oder Debt collection: was sie an Abo-Belastungen bis zum Ende tatsächlich bezahlt haben.'],
    ];
    kv.forEach(function (x) { sh.getRange(r, 1, 1, 2).setValues([[x[0], x[1]]]); sh.getRange(r, 2).setNumberFormat(x[2]); if (x[3]) sh.getRange(r, 1).setNote(x[3]); if (/^(LTV netto|Abo-Umsatz netto je Kunde)/.test(x[0])) sh.getRange(r, 1, 1, 2).setFontWeight('bold'); r++; });
    r++;
    var size = {}; fresh.forEach(function (c) { size[c.first] = (size[c.first] || 0) + 1; }); var cks = Object.keys(size).sort();
    var head = ['Startmonat (erste Abo-Zahlung, Neukunden)', 'Kunden', 'Ø Netto 1. Monat'].concat(N.map(function (n) { return 'Ø kumuliert nach ' + n + ' Mon.'; })).concat(['noch aktiv', 'verloren']);
    sh.getRange(r, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#f3f3f3'); r++;
    var age = function (ck) { return (+lastFull.slice(0, 4) - +ck.slice(0, 4)) * 12 + (+lastFull.slice(5, 7) - +ck.slice(5, 7)) + 1; };
    var cum = function (c, ck, n) { var s = 0; for (var i = 0; i < n; i++) s += c.m[addMonths(ck, i)] || 0; return s; };
    var crow = cks.map(function (ck) {
      var cs = fresh.filter(function (c) { return c.first === ck; }), n = cs.length, a = age(ck), avg = function (fn) { return Math.round(cs.reduce(function (s, c) { return s + fn(c); }, 0) / n / VAT); };
      var lost = cs.filter(function (c) { return c.end && c.end <= lastFull; }).length;
      return [new Date(ck + '-01T00:00:00'), n, avg(function (c) { return c.m[ck] || 0; })].concat(N.map(function (k) { return a >= k ? avg(function (c) { return cum(c, ck, k); }) : ''; })).concat([(n - lost) / n, lost]);
    });
    if (crow.length) {
      sh.getRange(r, 1, crow.length, head.length).setValues(crow); sh.getRange(r, 1, crow.length, 1).setNumberFormat('mmm yyyy'); sh.getRange(r, 3, crow.length, N.length + 1).setNumberFormat('#,##0'); sh.getRange(r, head.length - 1, crow.length, 1).setNumberFormat('0%');
      // grau = zu klein oder zu jung, "noch aktiv" sagt dort nichts (Ruben 06.09.: 100 % bei 2 Kunden bzw. bei Kohorten ohne wirksame Kuendigung)
      cks.forEach(function (ck, k) { if (size[ck] < 10 || age(ck) < 3) sh.getRange(r + k, 1, 1, head.length).setFontColor('#999999'); });
      r += crow.length;
      sh.getRange(r, 1).setValue('Grau = Kohorte unter 10 Kunden oder jünger als 3 Monate: Kündigungen können dort noch nicht wirksam sein, "noch aktiv" ist nicht aussagekräftig.').setFontColor('#999999').setFontSize(9); r++;
    }
    r += 2;
    // Monatswerte fuer den Monatsabschluss (alle Kunden inkl. migriert; Einmalkaeufe auch von Kunden ohne Abo)
    var allC = Object.keys(cust).map(function (u) { return cust[u]; }).filter(function (c) { return loc === 'Gesamt' || c.loc === loc; });
    months.forEach(function (mk) {
      var act = L.filter(function (c) { return c.first <= mk && (!c.end || c.end >= mk); }), nP = act.filter(function (c) { return c.pay[mk]; }).length, sAbo = 0, sOne = 0;
      L.forEach(function (c) { sAbo += c.abo[mk] || 0; }); allC.forEach(function (c) { sOne += c.one[mk] || 0; });
      store.push({ mk: mk, loc: loc, metrics: { cv_active: act.length, cv_nopay: act.length - nP, abo_gross: Math.round(sAbo), one_gross: Math.round(sOne) } });
    });
    store.push({ mk: cur, loc: loc, metrics: { ltv_forecast: ltv, ltv_arpu: Math.round(arpu), ltv_arpu_gross: Math.round(arpuG), ltv_starter: Math.round(starter), ltv_other: Math.round(other), ltv_retention: 1 - rf.loss, ltv_loss_all: ra.loss, ltv_lifetime: Math.round(life * 10) / 10, ltv_sample: fresh.length } });
  });
  maStoreMetricsMany(ss, store);
  sh.setColumnWidth(1, 340);
  buildMonatsabschluss(ss);
}

// Kennzahlen des Funnels und des Abo-Bestands je Standort, Monate (und ab Sep 2026 Kalenderwochen) als Spalten. Daten aus der Cloudflare-
// Funktion (action 'monat'), gespeichert im versteckten Tab MonatsHistorie (Monat, Standort, Kennzahl, Wert) und Kohorten (Probetrainer je
// Monat); Wochenwerte aus dem Log, dem Team-Sheet (wrCollect) und den Tageswerten starts_d:/cancels_d: aus exercise.com.
var MA_SHEET = 'Monatsabschluss', MA_HIST = 'MonatsHistorie', MA_COHORT = 'Kohorten', MA_FROM = '2026-01'; // Spalten ab Jan 2026 (Kundenwert-Reihen reichen bis Jun 2025 zurueck)
// [key, Beschriftung, Zahlenformat, Flags]: d = Detailzeile (grau, eingeklappt), w = auch je Woche, b = fett; ['_h', Titel] = Zwischentitel (Ruben 07.09.: lesbar, keine Redundanzen)
var MA_ROWS = [
  ['leads_all', 'Neue Kontakte in exercise.com', '0', 'wb'],
  ['leads_web', '   davon über die Website', '0', 'w'],
  ['kanal:Google Ads', '      Google Ads', '0', 'dw'],
  ['kanal:Meta Ads', '      Meta Ads', '0', 'dw'],
  ['kanal:TikTok Ads', '      TikTok Ads', '0', 'dw'],
  ['kanal_org', '      organisch und direkt', '0', 'dw'],
  ['calls', 'Geführte Gespräche', '0', 'w'],
  ['trial_booked_transitions', 'Probetraining gebucht', '0', 'w'],
  ['trial_attended', 'Probetrainings durchgeführt', '0', 'wb'],
  ['trial_noshow', '   No-Shows', '0', 'dw'],
  ['showup_rate', 'Show-up-Rate', '0%', 'w'],
  ['sales_signed', 'Verkäufe (Paket aktiviert)', '0', 'wb'],
  ['sales_open', '   davon Zahlung noch offen', '0', 'd'],
  ['conv_sales_trial', 'Quote Verkäufe / Probetrainings', '0%', 'w'],
  ['conv_sales_lead', 'Quote Verkäufe / neue Kontakte', '0%', 'w'],
  ['conv_cohort_rate', 'Kohorten-Conversion', '0%', 'w'],
  ['losses', 'Verluste (Kündigungen + Debt collection)', '0', 'wb'],
  ['cancellations', '   davon wirksame Kündigungen', '0', 'dw'],
  ['debt_collection', '   davon Debt collection (Nichtzahler)', '0', 'dw'],
  ['switches', '   Paketwechsel (kein Verlust)', '0', 'd'],
  ['net_growth', 'Nettowachstum (Abo-Starts − Verluste)', '0', 'wb'],
  ['cv_active', 'Kunden mit laufendem Abo', '0', 'b'],
  ['cv_nopay', '   davon ohne Abo-Zahlung im Monat', '0', 'd'],
  ['subs_total', '   Abos laut exercise.com-Report (Stand Lauf)', '0', 'd'],
  ['pending_cancel', '      davon mit Kündigung auf Periodenende', '0', 'd'],
  ['paused_subs', '      davon pausiert', '0', 'd'],
  ['scheduled_subs', '      davon geplanter Start', '0', 'd'],
  ['churn_rate', 'Churn (Verluste / Kunden)', '0.0%', ''],
];
// Kurzdefinitionen als Notiz an der Zeilenbezeichnung (ausfuehrlich im Tab Methodik)
var MA_NOTES = {
  leads_all: 'Alle neu angelegten Kontakte in exercise.com, egal auf welchem Weg (Website, Telefon, Walk-in, App), je Woche und Monat nach Datum des Eintrags. Geht so in den Finanzplan.',
  leads_web: 'Anfragen über die Website (Log, ohne Dubletten und Tests), je Woche und Monat. Vor September 2026 von Hand gezählte Monatszahlen.',
  kanal_org: 'Website-Anfragen ohne Werbeklick: Google organisch, Instagram/Facebook organisch, TikTok organisch, direkt, andere.',
  calls: 'Geführte Gespräche laut Tagestabelle im Team-Sheet (Eingabe von Abdi und Bogdan). Ab September 2026.',
  trial_booked_transitions: 'An diesen Tagen angelegte Trial-Buchungen (Team-Sheet), je Woche und ab September 2026 auch je Monat; davor Monatsreport (Lifecycle-Stage Trial Booked).',
  trial_attended: 'Erstbesucher mit erstem Check-in überhaupt, ohne Altkunden und Staff (Regel Team-Sheet). Ab September 2026 Woche und Monat aus derselben Quelle, davor Monatsreport von exercise.com. Geht so in den Finanzplan (Anzahl Trials).',
  trial_noshow: 'Gebucht und nicht erschienen.',
  showup_rate: 'Erschienene Probetrainer geteilt durch erschienene plus No-Shows.',
  sales_signed: 'Verkauf = erstes Abo-Paket aktiviert (Ruben 08.09.): Abo-Start in exercise.com (geplante Starts am Starttag) oder, bei Kunden ohne Abo (Rechnung), das manuell aktivierte Paket. Paketwechsel, Verlängerungen und Personal Training zählen nicht. Je Woche und Monat; geht so als "Neue Verkäufe" in den Finanzplan.',
  new_customers: 'Gleiche Zahl wie Verkäufe (Paket aktiviert): Abo-Starts ohne Paketwechsel und Personal Training plus Rechnungskunden ohne Abo. Geht so in den Finanzplan.',
  conv_sales_trial: 'Verkäufe des Monats geteilt durch durchgeführte Probetrainings des Monats.',
  conv_sales_lead: 'Verkäufe des Monats geteilt durch neue Kontakte in exercise.com.',
  conv_cohort_rate: 'Probetrainer des Zeitraums, deren Abo bis heute gestartet ist, reift drei Monate nach. Ab September 2026 Woche und Monat aus dem Team-Sheet, davor Monatsreport.',
  losses: 'Verlorene Kunden: wirksam gewordene Kündigungen (Enddatum in exercise.com, ohne Paketwechsel) plus Übergänge in die Lifecycle-Stage Debt collection. Dieselbe Regel wie die Verlustquote im LTV. Geht so in den Finanzplan (Kündigungen).',
  cancellations: 'Wirksam gewordene Kündigungen nach Enddatum in exercise.com, ohne Paketwechsel.',
  debt_collection: 'Kontakte, die im Monat auf die Lifecycle-Stage Debt collection gewechselt sind (Nichtzahler).',
  net_growth: 'Abos gestartet minus Verluste.',
  cv_active: 'Kunden, die ein Abo gestartet und bis zu diesem Monat nicht wirksam gekündigt haben (aus den Zahlungen in exercise.com, deshalb bis 2025 zurück). Personen, nicht Abos.',
  cv_nopay: 'Davon Kunden ohne Abo-Belastung in diesem Monat: Pause, geplatzte Zahlung oder ausgelaufener Vertrag ohne Kündigungseintrag.',
  subs_total: 'Zum Vergleich: alle Abos am Tag des Laufs laut Report Active Subscriptions (laufend, Kündigung auf Periodenende, pausiert, geplanter Start). Zählt Abos, nicht Personen. Erst ab September 2026.',
  churn_rate: 'Verluste des Monats geteilt durch Kunden mit laufendem Abo. Jahr: alle Verluste geteilt durch alle Kundenmonate, nur Monate mit beiden Werten.',
  cash_paid: 'Alle erfolgreichen Belastungen in exercise.com im Monat, brutto inkl. MwSt, nach Rückerstattungen. Jahreszahler zählen im Monat der Zahlung.',
  abo_gross: 'Belastungen mit Abo-Bezug. Der Mehrbetrag der ersten Abo-Belastung (Zürich bucht das Starterpaket mit dem Abo zusammen ab) zählt bei den Einmalkäufen.',
  one_gross: 'Belastungen ohne Abo-Bezug: Starterpakete, Shop, Personal Training, Events.',
  cash_vat: 'Brutto minus brutto geteilt durch 1.081.',
  cash_net: 'Brutto geteilt durch 1.081. Eine Regel für alles, wie im Finanzplan (Total MWST 8.1 %).',
  cv_abo_gross: 'Abo-Belastungen brutto geteilt durch Kunden mit laufendem Abo, auch die ohne Zahlung im Monat. Vergleichbar mit dem Kundenwert im Finanzplan.',
  cv_abo_net: 'Brutto je Kunde geteilt durch 1.081. Basis des LTV.',
  cash_total: 'Alle Gutschriften auf dem Konto im Monat laut Tab Bank. Geht so in den Finanzplan (Total Sales from Bank).',
  cash_bank: 'Gutschriften von Stripe. Stripe zieht 2 % Gebühr ab und zahlt sieben Tage nach der Belastung aus.',
  cash_diff: 'Kontrolle: Stripe-Gutschriften laut Konto minus erwartete Auszahlung (Belastungen minus Gebühr, um sieben Tage verschoben). Abweichungen sind Timing.',
  wk_media: 'Media-Kosten Google, Meta und TikTok, je Standort nach Kampagnenname.',
  wk_agency: 'Agentur-Pauschalen aus dem Tab Einstellungen: je Standort plus TikTok-Pauschale nach TikTok-Ausgaben verteilt.',
  cpl: 'Media-Kosten geteilt durch Website-Leads.',
  cac: 'Media-Kosten geteilt durch Verkäufe. Belastbare Zahl.',
  cac_all: 'Media plus Agentur geteilt durch Verkäufe.',
  ltv: 'Abo-Umsatz netto je Kunde und Monat mal erwartete Dauer, plus Starterpaket, plus übrige Einmalkäufe mal Dauer (Tab LTV). Stand des letzten Laufs.',
  ltv_cac_all: 'Wie viel ein Kunde über seine Dauer an Abo-Umsatz bringt, geteilt durch die Kosten je gewonnenem Kunden.',
  payback: 'Monate, bis der Abo-Umsatz netto eines Kunden die Kosten je gewonnenem Kunden eingespielt hat.'
};
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
  var data = p3.data, ss = SpreadsheetApp.openById(SHEET_ID), leadMap = trLeadMap(ss);
  maStoreCohorts(ss, mk, data.cohort || {});
  var lines = [];
  ['Zurich', 'Winterthur'].forEach(function (loc) {
    var L = data.locations[loc] || {}, m = {};
    Object.keys(L).forEach(function (k) { if (typeof L[k] === 'number') m[k] = L[k]; });
    [['starts_by_day', 'starts_d:'], ['cancels_by_day', 'cancels_d:'], ['leads_by_day', 'leads_d:'], ['debt_by_day', 'debt_d:'], ['signed_by_day', 'signed_d:']].forEach(function (dk) { var o = L[dk[0]] || {}; Object.keys(o).forEach(function (d) { m[dk[1] + d] = o[d]; }); }); // Tageswerte fuer die Wochenspalten (Ruben 07.09.)
    var fvNet = (L.first_visits || 0) - (L.first_visits_excluded || 0);
    m.noshow_rate = fvNet ? (L.trial_noshow || 0) / fvNet : 0;
    m.conv_simple = L.trial_attended ? (L.new_customers || 0) / L.trial_attended : 0;
    m.conv_sales_trial = L.trial_attended ? (L.sales_signed || 0) / L.trial_attended : 0;
    m.conv_sales_lead = L.leads_all ? (L.sales_signed || 0) / L.leads_all : 0;
    var cnt = {}; ((data.signed || {})[loc] || []).forEach(function (sg) { var ld = trFindLead(leadMap, sg.email, '', sg.date); if (ld && ld.kanal) cnt[ld.kanal] = (cnt[ld.kanal] || 0) + 1; });
    KANAL_ORDER.forEach(function (kn) { m['sales_kanal:' + kn] = cnt[kn] || 0; });
    maStoreMetricsMany(ss, [{ mk: mk, loc: loc, metrics: m, drop: ['starts_d:', 'cancels_d:', 'leads_d:', 'debt_d:', 'signed_d:'] }]);
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
var MA_CATCHUP = '2026-09-08e Verkauf = Paket aktiviert Jun-Aug'; // Marke aendern = Nachlauf laeuft erneut
var MA_CATCHUP_MONTHS = ['2026-06', '2026-07', '2026-08'];
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
    mailOnce('monatsabschluss', '[Monatsabschluss] Nachlauf ' + mk + ' FEHLGESCHLAGEN', String(e && e.stack ? e.stack : e));
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
function maStoreMetrics(ss, mk, loc, metrics) { maStoreMetricsMany(ss, [{ mk: mk, loc: loc, metrics: metrics }]); }
function maStoreMetricsMany(ss, entries) { // viele Monate in einem Lese-/Schreibvorgang (Kundenwert je Monat aus buildLTV)
  var sh = getOrCreate(ss, MA_HIST), head = ['Monat', 'Standort', 'Kennzahl', 'Wert'];
  if (sh.getLastRow() === 0) { sh.appendRow(head); sh.setFrozenRows(1); sh.hideSheet(); }
  var rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues() : [];
  rows.forEach(function (r) { r[0] = mkOf(r[0]); });
  var prevN = rows.length, drops = []; entries.forEach(function (en) { (en.drop || []).forEach(function (p) { drops.push([en.mk, en.loc, p]); }); });
  if (drops.length) rows = rows.filter(function (r) { return !drops.some(function (d) { return r[0] === d[0] && r[1] === d[1] && String(r[2]).indexOf(d[2]) === 0; }); }); // alte Tageswerte des Monats weg
  var idx = {}; rows.forEach(function (r, i) { idx[r[0] + '|' + r[1] + '|' + r[2]] = i; });
  entries.forEach(function (en) {
    Object.keys(en.metrics).forEach(function (k) {
      var key = en.mk + '|' + en.loc + '|' + k;
      if (idx[key] !== undefined) rows[idx[key]][3] = en.metrics[k]; else { rows.push([en.mk, en.loc, k, en.metrics[k]]); idx[key] = rows.length - 1; }
    });
  });
  if (!rows.length) return;
  sh.getRange(2, 1, rows.length, 1).setNumberFormat('@'); sh.getRange(2, 1, rows.length, 4).setValues(rows);
  if (prevN > rows.length) sh.getRange(rows.length + 2, 1, prevN - rows.length, 4).clearContent();
}
// Kopftext (Methodik) steht in B2, damit Spalte A eingefroren werden kann (Ruben 05.09.2026)
var MA_NOTE_FULL = 'Automatisch aus exercise.com (Lifecycle, Erstbesuche, Check-ins, Vertragsunterschriften, gestartete und gekündigte Abos, Charges), aus dem Log (Website-Anfragen) und aus den Probetrainings-Tabs im Team-Sheet (Gespräche, Trials, No-Shows, Verkäufe je Tag). '
  + 'Spalten: Monate ab Januar 2026; ab September 2026 stehen die Kalenderwochen (Montag bis Sonntag) vor ihrem Monat, eine Woche gehört zum Monat, in dem ihr Donnerstag liegt, und zählt nur die Tage dieses Monats, damit die Wochen eines Monats zusammen den Monat ergeben. Wochenspalten zeigen nur, was es je Woche gibt: Website-Leads, Gespräche, gebuchte und durchgeführte Probetrainings, No-Shows, Verkäufe, Abo-Starts und Kündigungen (nach Start- bzw. Enddatum in exercise.com), Werbekosten, Kosten pro Lead. Graue Wochenzellen = gibt es nur je Monat. Jahresspalte = Summe der Monate, Bestandswerte = letzter Monat, Quoten neu aus den Summen. '
  + 'Neue Kontakte = alle im Monat neu angelegten Kontakte in exercise.com (Website, Telefon, Walk-in, App); davon über die Website = Anfragen aus dem Log (ohne Dubletten und Tests), nach Kanal = Klick-ID, UTM oder Referrer. Vor September 2026 sind die Website-Leads von Hand gezählte Monatszahlen. '
  + 'Probetrainings durchgeführt = Erstbesucher mit Check-in, ohne Altkunden und Staff; Show-up-Rate = erschienen geteilt durch erschienen plus No-Shows. Verkäufe = erstes Abo-Paket aktiviert (Abo-Start in exercise.com oder Rechnungspaket ohne Abo), ohne Paketwechsel und Personal Training; Abos gestartet = Abo-Starts ohne Paketwechsel und ohne Personal Training; Kündigungen = wirksam gewordene Kündigungen ohne Paketwechsel. Kohorten-Conversion = Probetrainer des Monats, die bis heute ein Abo gestartet haben, drei Monate nachgeführt. '
  + 'EINE METHODE für Kunden und Umsatz (Ruben 07.09.2026): alles aus den Belastungen im Charges-Report, brutto zuerst. Kunden mit laufendem Abo = Kunden, die ein Abo gestartet und bis zu diesem Monat nicht wirksam gekündigt haben, auch wenn sie im Monat nichts bezahlt haben (Personen). Zahlungen brutto = alle Belastungen nach Rückerstattungen, davon Abo und davon Einmalkäufe (Mehrbetrag der ersten Abo-Belastung = Starterpaket zählt bei den Einmalkäufen); MwSt = brutto minus brutto/1.081; netto = brutto/1.081. Abo-Umsatz je Kunde = Abo-Belastungen geteilt durch Kunden mit laufendem Abo. Jahreszahler zählen im Monat der Zahlung. Zum Vergleich zählt der Report Active Subscriptions die Abos am Tag des Laufs (erst ab September 2026). '
  + 'Bank (Tab Bank, von Hand): alle Gutschriften laut Konto, davon Stripe (zieht 2 % Gebühr ab, zahlt sieben Tage nach der Belastung aus), Magicline (Adyen, altes System), Überweisungen von Mitgliedern, übrige (kein Umsatz). Kontrolle = Stripe laut Konto minus erwartete Auszahlung. '
  + 'Werbung: Media-Kosten aus Google Ads (Skript), Meta (API) und TikTok (Report-Mail) je Standort nach Kampagnenname; Agentur = Pauschalen je Standort plus TikTok-Pauschale nach TikTok-Ausgaben verteilt (Tab Einstellungen); CPL/CAC je Kanal nach Klick-ID des Leads (letzter Klick, Richtwert), CAC gesamt = belastbare Zahl; LTV = Abo-Umsatz netto je Kunde und Monat × erwartete Dauer plus Starterpaket plus übrige Einmalkäufe × Dauer (Tab LTV); Payback = CAC inkl. Agentur geteilt durch Abo-Umsatz netto je Kunde.';
var MA_NOTE = 'Kennzahlen je Standort aus exercise.com, Log und Team-Sheet, Zahlungen aus dem Charges-Report, Werbekosten aus Google, Meta und TikTok; darunter Gesamt. '
  + 'Ab September 2026 stehen die Kalenderwochen vor ihrem Monat: weisse Spalten = Woche (grau = gibt es nur je Monat), blaue = Monat, dunkelgraue = Jahr. Zeilen mit + zeigen Details, Kurzdefinitionen stehen als Notiz an der Zeile, alles Weitere im Tab Methodik.';
// Spaltenbuchstabe (A, Z, AA, ...) fuer 1-basierte Spaltennummer
function colA1(n) { var t = ''; while (n > 0) { var m = (n - 1) % 26; t = String.fromCharCode(65 + m) + t; n = Math.floor((n - 1) / 26); } return t; }
var MA_SNAP_FROM = '2026-09', MA_TEAM_FROM = '2026-09', VAT = 1.081; // Report-Stichtagszeilen erst ab Sep 2026 echt gemessen; Team-Sheet-Monatswerte (Gespraeche) erst ab Sep 2026 vollstaendig
var MA_SNAP = ['subs_total', 'active_subs', 'paused_subs', 'pending_cancel', 'scheduled_subs'];
var MA_ADD = ['leads_all', 'leads_web', 'calls', 'losses', 'debt_collection', 'trial_booked_transitions', 'first_visits', 'first_visits_excluded', 'trial_noshow', 'trial_attended', 'signed_at_trial', 'sales_signed', 'sales_open', 'new_customers', 'switches', 'cancellations', 'net_growth', 'lost_after_trial', 'subs_total', 'active_subs', 'paused_subs', 'pending_cancel', 'scheduled_subs', 'rev_membership_gross', 'rev_membership_net', 'starter_count', 'rev_starter_gross', 'pt_count', 'rev_pt_gross', 'rev_gear_gross', 'rev_total_gross', 'rev_total_net', 'conv_cohort_n', 'cv_active', 'cv_nopay', 'abo_gross', 'one_gross'];
var MA_STOCK = ['cv_active', 'cv_nopay', 'subs_total', 'active_subs', 'paused_subs', 'pending_cancel', 'scheduled_subs', 'ltv'];
function buildMonatsabschluss(ss) { // nie zwei Baue gleichzeitig (Stundenlauf, Tageslauf, Nachlauf): sonst doppelte Diagramme und leeres Blatt (Lehre 07.09.)
  var lock = LockService.getUserLock(); if (!lock.tryLock(0)) { Logger.log('Monatsabschluss: Bau laeuft bereits, uebersprungen'); return; }
  try { buildMonatsabschlussCore(ss); } finally { lock.releaseLock(); }
}
function buildMonatsabschlussCore(ss) {
  var sh = getOrCreate(ss, MA_SHEET); clearSheet(sh);
  var oldWr = ss.getSheetByName('Wochenreport'); if (oldWr) { try { ss.deleteSheet(oldWr); } catch (e0) { Logger.log('Wochenreport: ' + e0); } } // seit 07.09.2026 im Monatsabschluss
  var now = new Date(), curK = monthKeyStr(now), curMon = fmtD(mondayOf(now)), logM = LOG_START.slice(0, 7);
  var cohN = {}, csh = ss.getSheetByName(MA_COHORT);
  if (csh && csh.getLastRow() > 1) csh.getRange(2, 1, csh.getLastRow() - 1, 2).getValues().forEach(function (r) { var k = mkOf(r[0]) + '|' + r[1]; cohN[k] = (cohN[k] || 0) + 1; });
  var wr = wrCollect(ss, teamSs()), wkD = wkAgg(ss, function (d) { return d; }), wkM = wkMonthAgg(ss), bankM = bankRead(ss), cashZ = cashMonth(ss, 'Zurich'), cashW = cashMonth(ss, 'Winterthur');
  // Probetrainings ab MA_TEAM_FROM auch je Monat aus dem Team-Sheet (gleiche Regel wie die Wochen: erster Check-in ueberhaupt). Lehre 07.09.: der
  // Monatsreport "First Visits" datiert neu gebuchte No-Shows auf den Buchungsmonat (September ZH 23 statt 29). Wird in die Historie geschrieben,
  // damit auch der Finanzplan-Uebertrag diese Zahl nimmt.
  var ov = [];
  Object.keys(wr.month).forEach(function (mk) { if (mk < MA_TEAM_FROM || mk > curK) return; ['Zurich', 'Winterthur'].forEach(function (l) { var o = wr.month[mk], t = o.t[l], ns = o.ns[l]; ov.push({ mk: mk, loc: l, metrics: { trial_attended: t, trial_noshow: ns, noshow_rate: t + ns ? ns / (t + ns) : 0 } }); }); });
  if (ov.length) maStoreMetricsMany(ss, ov);
  var hs = ss.getSheetByName(MA_HIST), hv = hs && hs.getLastRow() > 1 ? hs.getRange(2, 1, hs.getLastRow() - 1, 4).getValues() : [];
  var val = {}; hv.forEach(function (r) { val[mkOf(r[0]) + '|' + r[1] + '|' + r[2]] = r[3]; });
  var num = function (v) { return v === '' || v === null || v === undefined ? 0 : Number(v); };
  var cashG = {}; Object.keys(cashZ).concat(Object.keys(cashW)).forEach(function (kk) { if (cashG[kk]) return; var a = cashZ[kk] || {}, b = cashW[kk] || {}, o = {}; ['paid', 'refund', 'fee', 'tax', 'netvat', 'net', 'expect'].forEach(function (f) { if (a[f] !== undefined || b[f] !== undefined) o[f] = num(a[f]) + num(b[f]); }); cashG[kk] = o; });
  var cashOf = { Zurich: cashZ, Winterthur: cashW, Gesamt: cashG };
  var bankOf = function (loc, kk, f) { if (loc !== 'Gesamt') { var b = bankM[kk + '|' + loc]; return b && b[f] !== '' ? b[f] : ''; } var x = bankM[kk + '|Zurich'], y = bankM[kk + '|Winterthur']; if (!x && !y) return ''; var vx = x ? x[f] : '', vy = y ? y[f] : ''; return vx === '' && vy === '' ? '' : num(vx) + num(vy); };
  // Tageswerte (starts_d:yyyy-MM-dd, cancels_d:yyyy-MM-dd) je Woche summieren; '' wenn der Monat des Tages noch nicht geladen ist
  var daySumFor = function (locs, monday, mk, prefix) { var s = 0, any = false; for (var i = 0; i < 7; i++) { var d = addDs(monday, i); if (d.slice(0, 7) !== mk) continue; locs.forEach(function (l) { if (val[mk + '|' + l + '|new_customers'] === undefined) return; any = true; s += num(val[mk + '|' + l + '|' + prefix + d]); }); } return any ? s : ''; }; // nur Tage des Monats mk
  var wkCache = {}, weekOf = function (monday, mk) { var key = monday + '|' + mk; if (!wkCache[key]) wkCache[key] = wrWeekOf(wr, monday, mk); return wkCache[key]; };
  // Spalten: Monate ab MA_FROM bis zum laufenden Monat; ab LEAD_WEEK0 die Kalenderwochen vor ihrem Monat (Monat des Donnerstags); nach Dezember und nach dem laufenden Monat eine Jahresspalte
  var cols = [], yearMonths = {}, k = MA_FROM;
  var weeksOf = function (mk) { var out = [], m = LEAD_WEEK0; while (m <= curMon) { if (addDs(m, 3).slice(0, 7) === mk) out.push(m); m = addDs(m, 7); } return out; };
  while (k <= curK) {
    weeksOf(k).forEach(function (m) { cols.push({ w: true, k: m, mk: k }); });
    cols.push({ m: true, k: k }); (yearMonths[k.slice(0, 4)] = yearMonths[k.slice(0, 4)] || []).push(cols.length - 1);
    if (k.slice(5) === '12' || k === curK) cols.push({ y: true, k: k.slice(0, 4), partial: k === curK && k.slice(5) !== '12' });
    k = nextMonth(k);
  }
  var hkeys = cols.filter(function (c) { return c.m; }).map(function (c) { return c.k; }), wkeys = cols.filter(function (c) { return c.w; }).map(function (c) { return c.k; });
  var need = cols.length + 3; if (sh.getMaxColumns() < need) sh.insertColumnsAfter(sh.getMaxColumns(), need - sh.getMaxColumns());
  sh.setFrozenColumns(0); sh.getRange(2, 1, 1, sh.getMaxColumns()).breakApart();
  var dt = function (kk) { return new Date(kk + '-01T00:00:00'); }, dtW = function (m) { return new Date(m + 'T12:00:00'); }, colOf = function (ci) { return colA1(2 + ci); };
  var both = function (kk, name) { var a = val[kk + '|Zurich|' + name], b = val[kk + '|Winterthur|' + name]; var ea = a === undefined || a === '', eb = b === undefined || b === ''; return ea && eb ? '' : num(a) + num(b); };
  var div = function (a, b) { return a === '' || b === '' || !num(b) ? '' : num(a) / num(b); };
  var gOf = function (kk, name) { // Gesamt = Summe beider Standorte, Quoten aus den Summen neu gerechnet
    if (MA_ADD.indexOf(name) >= 0 || name.indexOf('sales_kanal:') === 0) return both(kk, name);
    if (name.indexOf('ltv_') === 0) { var v = val[kk + '|Gesamt|' + name]; return v === undefined || v === '' ? '' : v; }
    switch (name) {
      case 'noshow_rate': var fv = both(kk, 'first_visits'), ex = both(kk, 'first_visits_excluded'); return fv === '' || !(num(fv) - num(ex)) ? '' : num(both(kk, 'trial_noshow')) / (num(fv) - num(ex));
      case 'conv_sales_trial': return div(both(kk, 'sales_signed'), both(kk, 'trial_attended'));
      case 'conv_sales_lead': return div(both(kk, 'sales_signed'), both(kk, 'leads_all'));
      case 'conv_simple': return div(both(kk, 'new_customers'), both(kk, 'trial_attended'));
      case 'conv_cohort_rate': var n = both(kk, 'conv_cohort_n'), c = (cohN[kk + '|Zurich'] || 0) + (cohN[kk + '|Winterthur'] || 0); return n === '' || !c ? '' : num(n) / c;
    }
    return '';
  };
  // Kopf
  sh.getRange('A1').setValue('IMPACT Monatsabschluss').setFontSize(16).setFontWeight('bold');
  sh.getRange('A2').setValue('Methodik').setFontColor('#999999');
  sh.getRange('B2').setValue(MA_NOTE).setFontColor('#666666').setWrap(true);
  sh.getRange('B2:N2').merge(); sh.setRowHeight(2, 44);
  var r = 4, blocks = [], ORG = KANAL_ORDER.filter(function (x) { return WK_PLATFORMS.indexOf(x) < 0; }), agencyCache = {};
  var agencyM = function (kk) { if (!(kk in agencyCache)) agencyCache[kk] = wkAgency(ss, kk, wkM); return agencyCache[kk]; }; // einmal je Monat (wkAgency liest Einstellungen)
  ['Zurich', 'Winterthur', 'Gesamt'].forEach(function (loc) {
    var locDE = loc === 'Zurich' ? 'Zürich' : loc === 'Winterthur' ? 'Winterthur' : 'Gesamt', wrLocs = loc === 'Gesamt' ? ['Zurich', 'Winterthur'] : [loc], rowIdx = {}, det = [], yearRule = {}, rowMeta = {};
    sh.getRange(r, 1).setValue(locDE + (loc === 'Gesamt' ? ' (Zürich + Winterthur)' : '')).setFontWeight('bold').setFontSize(13); r++;
    var head = ['Kennzahl'].concat(cols.map(function (c) { return c.m ? dt(c.k) : c.w ? 'KW ' + isoWeek(dtW(c.k)) + (c.k === curMon ? ' (läuft)' : '') : c.k + (c.partial ? ' (bis heute)' : ''); }));
    sh.getRange(r, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#f3f3f3');
    cols.forEach(function (c, ci) {
      var cell = sh.getRange(r, 2 + ci);
      if (c.m) { cell.setNumberFormat(c.k === curK ? 'mmm yyyy" (laufend)"' : 'mmm yyyy').setBackground('#d9e2ef'); if (c.k === curK) cell.setNote('Laufender Monat: Zahlungen und Kunden kommen erst nach Monatsende.'); }
      else if (c.w) { var wd0 = c.k.slice(0, 7) === c.mk ? c.k : c.mk + '-01', we = addDs(c.k, 6), wd1 = we.slice(0, 7) === c.mk ? we : addDs(nextMonth(c.mk) + '-01', -1); cell.setFontColor('#666666').setNote('Woche ' + deD(wd0) + '–' + deD(wd1) + c.mk.slice(0, 4) + (c.k === curMon ? ', läuft noch' : '') + '. Zählt nur die Tage dieses Monats, die Wochen eines Monats ergeben zusammen den Monat. Grau = nur je Monat.'); }
      else cell.setBackground('#e0e0e0').setNumberFormat('@').setNote('Jahr: Summe der Monate, Bestandswerte = letzter Monat, Quoten neu aus den Summen.');
    });
    var hdr = r; r++;
    var vOf = function (kk, name) { if (loc === 'Gesamt') return gOf(kk, name); var v = val[kk + '|' + loc + '|' + name]; return v === undefined || v === '' ? '' : v; };
    var wrSum = function (o, f) { return wrLocs.reduce(function (s, l) { return s + (o[f][l] || 0); }, 0); };
    var wrKan = function (o, names) { var s = 0; wrLocs.forEach(function (l) { names.forEach(function (nm) { s += o.kanal[l][nm] || 0; }); }); return s; };
    var mediaOf = function (agg, kk, pn) { var w = agg[kk]; if (!w) return ''; var pick = function (o) { return pn ? (o.plat[pn] || 0) : o.media; }; return Math.round(wrLocs.reduce(function (s, l) { return s + pick(w[l]); }, 0)); };
    var agencyOf = function (kk) { if (kk > curK || kk < '2026-01') return ''; var a = agencyM(kk); return Math.round(wrLocs.reduce(function (s, l) { return s + a[l]; }, 0)); };
    var daySum = function (c, prefix) { return daySumFor(wrLocs, c.k, c.mk, prefix); };
    var mediaWeek = function (c, pn) { var s = 0, any = false; for (var i = 0; i < 7; i++) { var d = addDs(c.k, i); if (d.slice(0, 7) !== c.mk) continue; var w = wkD[d]; if (!w) continue; any = true; wrLocs.forEach(function (l) { s += pn ? (w[l].plat[pn] || 0) : w[l].media; }); } return any ? Math.round(s) : ''; };
    var V = function (key) { // Wert einer Kennzahl je Spalte: Woche aus Log, Team-Sheet und Tageswerten, Monat aus exercise.com (Team-Sheet-Monatswerte ab MA_TEAM_FROM)
      return function (c) {
        var kk = c.k, logOk = c.w ? kk >= LEAD_WEEK0 : kk >= logM, teamOk = c.w || kk >= MA_TEAM_FROM, o = c.w ? weekOf(kk, c.mk) : (wr.month[kk] || wrBlank());
        switch (key) {
          case 'leads_all': return c.w ? daySum(c, 'leads_d:') : vOf(kk, key);
          case 'leads_web': return logOk ? wrSum(o, 'leads') : (c.w ? '' : vOf(kk, 'leads_web'));
          case 'conv_cohort_rate': if (c.w || (kk >= MA_TEAM_FROM && wr.month[kk])) { var tt = wrSum(o, 't'); return tt ? wrSum(o, 'csold') / tt : ''; } return vOf(kk, key);
          case 'kanal_org': return logOk ? wrKan(o, ORG) : '';
          case 'calls': return teamOk ? wrSum(o, 'calls') : '';
          case 'trial_booked_transitions': return (c.w || (kk >= MA_TEAM_FROM && wr.month[kk])) ? wrSum(o, 'placed') : vOf(kk, key);
          case 'trial_attended': return c.w ? wrSum(o, 't') : vOf(kk, key);
          case 'trial_noshow': return c.w ? wrSum(o, 'ns') : vOf(kk, key);
          case 'showup_rate': if (c.w) { var t = wrSum(o, 't'), ns = wrSum(o, 'ns'); return t + ns ? t / (t + ns) : ''; } var nsv = vOf(kk, 'noshow_rate'); return nsv === '' ? '' : 1 - Number(nsv);
          case 'sales_signed': return c.w ? daySum(c, 'signed_d:') : vOf(kk, key); // gleiche Quelle wie der Monat (Paket aktiviert: Abo-Start oder Rechnungspaket)
          case 'new_customers': return c.w ? daySum(c, 'starts_d:') : vOf(kk, key);
          case 'cancellations': return c.w ? daySum(c, 'cancels_d:') : vOf(kk, key);
          case 'debt_collection': return c.w ? daySum(c, 'debt_d:') : vOf(kk, key);
          case 'losses': var lc = c.w ? daySum(c, 'cancels_d:') : vOf(kk, 'cancellations'), ld = c.w ? daySum(c, 'debt_d:') : vOf(kk, 'debt_collection'); return lc === '' && ld === '' ? '' : num(lc) + num(ld);
          case 'net_growth': var s1 = c.w ? daySum(c, 'starts_d:') : vOf(kk, 'new_customers'), s2 = V('losses')(c); return s1 === '' && s2 === '' ? '' : num(s1) - num(s2);
          case 'subs_total': if (kk < MA_SNAP_FROM) return ''; var st = vOf(kk, key); if (st !== '') return st; var a = vOf(kk, 'active_subs'); return a === '' ? '' : num(a) + num(vOf(kk, 'paused_subs')) + num(vOf(kk, 'scheduled_subs'));
          case 'cash_paid': var ag = vOf(kk, 'abo_gross'), og = vOf(kk, 'one_gross'); return ag === '' && og === '' ? '' : num(ag) + num(og);
          case 'cash_total': var ff = ['stripe', 'adyen', 'customers', 'other'].map(function (f) { return bankOf(loc, kk, f); }); return ff.every(function (x) { return x === ''; }) ? '' : ff.reduce(function (s, x) { return s + num(x); }, 0);
          case 'cash_diff': var bs = bankOf(loc, kk, 'stripe'), ex = cashOf[loc][kk] ? cashOf[loc][kk].expect : undefined; return bs === '' || ex === undefined ? '' : Math.round(num(bs) - ex);
          case 'wk_media': return c.w ? mediaWeek(c) : mediaOf(wkM, kk);
          case 'wk_agency': return c.w ? '' : agencyOf(kk);
        }
        if (key.indexOf('kanal:') === 0) return logOk ? wrKan(o, [key.slice(6)]) : '';
        if (key.indexOf('wk:') === 0) return c.w ? mediaWeek(c, key.slice(3)) : mediaOf(wkM, kk, key.slice(3));
        if (key.indexOf('bank:') === 0) return c.w ? '' : bankOf(loc, kk, key.slice(5));
        if (MA_SNAP.indexOf(key) >= 0 && kk < MA_SNAP_FROM) return '';
        return c.w ? '' : vOf(kk, key);
      };
    };
    var writeRow = function (key, label, fn, fmt, opts) {
      opts = opts || {}; var row = [label];
      cols.forEach(function (c, ci) {
        if (c.m) { row.push(fn(c, ci)); return; }
        if (c.w) { row.push(opts.weekly ? fn(c, ci) : ''); return; }
        // Jahresspalte: Summe der Monate des Jahres, Bestand = letzter Monat, Quoten neu aus den Summen, sonst leer
        var rule = yearRule[key] !== undefined ? yearRule[key] : (MA_STOCK.indexOf(key) >= 0 ? 'last' : (MA_ADD.indexOf(key) >= 0 || /^(kanal|sk:|wk:|cash_|wk_|bank:)/.test(key)) ? 'sum' : '');
        var mi = yearMonths[c.k] || [], mc = function (rr) { return mi.map(function (i) { return colOf(i) + rr; }).join(','); };
        if (!mi.length) { row.push(''); return; }
        if (rule === 'sum') row.push('=IF(COUNT(' + mc('{r}') + ')=0,"",SUM(' + mc('{r}') + '))');
        else if (rule === 'last') { var lastC = colOf(mi[mi.length - 1]) + '{r}'; row.push('=IF(' + lastC + '="","",' + lastC + ')'); }
        else if (rule === 'showup') { var at = mc(rowIdx.trial_attended), nn = mc(rowIdx.trial_noshow); row.push('=IF(SUM(' + at + ')+SUM(' + nn + ')=0,"",SUM(' + at + ')/(SUM(' + at + ')+SUM(' + nn + ')))'); }
        else if (rule === 'cacall') { // nur Monate mit Verkaufszahl (sonst zaehlen Agenturkosten aus Monaten ohne Verkaeufe mit)
          var g = function (key) { return mi.map(function (i) { var sgc = colOf(i) + rowIdx.sales_signed; return 'IF(' + sgc + '<>"",N(' + colOf(i) + rowIdx[key] + '),0)'; }).join(','); };
          row.push('=LET(mm,SUM(' + g('wk_media') + '),aa,SUM(' + g('wk_agency') + '),ss,SUM(' + g('sales_signed') + '),IF(OR(ss=0,mm=0),"",(mm+aa)/ss))'); }
        else if (typeof rule === 'object' && rule.div) { var src = colOf(ci) + rowIdx[rule.div]; row.push('=IF(' + src + '="","",' + src + '/' + VAT + ')'); }
        else if (typeof rule === 'object' || String(rule).indexOf('ratio:') === 0) { // Quote aus den Summen, aber nur Monate, in denen Zaehler UND Nenner stehen (Lehre 07.09.: Churn 1.9 % statt 3-4 %)
          var p = typeof rule === 'object' ? ['', rule.n, rule.d] : rule.split(':'), n1 = rowIdx[p[1]], d1 = rowIdx[p[2]];
          if (n1 && d1) { var pair = function (rr) { return mi.map(function (i) { var a = colOf(i) + n1, b = colOf(i) + d1; return 'IF(AND(' + a + '<>"",' + b + '<>""),' + colOf(i) + rr + ',0)'; }).join(','); }; row.push('=LET(nn,SUM(' + pair(n1) + '),dd,SUM(' + pair(d1) + '),IF(dd=0,"",nn/dd))'); } else row.push(''); }
        else row.push('');
      });
      row = row.map(function (v) { return typeof v === 'string' ? v.replace(/\{r\}/g, String(r)) : v; });
      sh.getRange(r, 1, 1, row.length).setValues([row]);
      if (fmt) sh.getRange(r, 2, 1, cols.length).setNumberFormat(fmt);
      if (opts.detail) { sh.getRange(r, 1).setFontColor('#666666'); det.push(r); }
      if (opts.bold) sh.getRange(r, 1, 1, row.length).setFontWeight('bold');
      if (MA_NOTES[key]) sh.getRange(r, 1).setNote(MA_NOTES[key]);
      rowMeta[r] = { weekly: !!opts.weekly }; rowIdx[key] = r; r++;
    };
    var put = writeRow, D = { detail: true }, B = { bold: true };
    var block = function (t) { sh.getRange(r, 1).setValue(t).setFontWeight('bold'); rowMeta[r] = { title: true }; r++; };
    var cellOf = function (key, ci) { return colOf(ci) + rowIdx[key]; };
    var ratio = function (n1, d1) { return function (c, ci) { var a = cellOf(n1, ci), b = cellOf(d1, ci); return '=IF(OR(' + a + '="",' + b + '="",' + b + '=0),"",' + a + '/' + b + ')'; }; };
    var divVat = function (key) { return function (c, ci) { var a = cellOf(key, ci); return '=IF(' + a + '="","",' + a + '/' + VAT + ')'; }; };
    yearRule.conv_sales_trial = 'ratio:sales_signed:trial_attended'; yearRule.conv_sales_lead = 'ratio:sales_signed:leads_all'; yearRule.showup_rate = 'showup'; yearRule.churn_rate = 'ratio:losses:cv_active'; yearRule.conv_cohort_rate = '';
    yearRule.cv_abo_gross = 'ratio:abo_gross:cv_active'; yearRule.cv_abo_net = { div: 'cv_abo_gross' };
    yearRule.cpl = 'ratio:wk_media:leads_web'; yearRule.cpt = 'ratio:wk_media:trial_attended'; yearRule.cac = 'ratio:wk_media:sales_signed'; yearRule.cac_all = 'cacall';
    WK_PLATFORMS.forEach(function (pn) { yearRule['cpl:' + pn] = { n: 'wk:' + pn, d: 'kanal:' + pn }; yearRule['cac:' + pn] = { n: 'wk:' + pn, d: 'sk:' + pn }; }); // Schluessel enthalten ':' -> Objekt statt 'ratio:a:b'
    MA_ROWS.forEach(function (def) {
      if (def[0] === '_h') { block(def[1]); return; }
      var fl = def[3] || '', fn = def[0] === 'churn_rate' ? ratio('losses', 'cv_active') : def[0] === 'conv_sales_trial' ? ratio('sales_signed', 'trial_attended') : def[0] === 'conv_sales_lead' ? ratio('sales_signed', 'leads_all') : V(def[0]);
      put(def[0], def[1], fn, def[2], { detail: fl.indexOf('d') >= 0, weekly: fl.indexOf('w') >= 0, bold: fl.indexOf('b') >= 0 });
    });
    // Umsatz: brutto zuerst, davon netto und MwSt (Ruben 07.09.2026), alles aus derselben Quelle (Charges); Bank als eine Kontrollzeile mit Details
    put('cash_paid', 'Zahlungen der Kunden brutto (inkl. MwSt)', V('cash_paid'), '#,##0', B);
    put('abo_gross', '   davon Abo', V('abo_gross'), '#,##0', D);
    put('one_gross', '   davon Einmalkäufe (Starterpakete, Shop, PT)', V('one_gross'), '#,##0', D);
    put('cash_vat', 'MwSt darin (8.1 %)', function (c, ci) { var a = cellOf('cash_paid', ci); return '=IF(' + a + '="","",' + a + '-' + a + '/' + VAT + ')'; }, '#,##0');
    put('cash_net', 'Umsatz netto', divVat('cash_paid'), '#,##0', B);
    put('cv_abo_gross', 'Abo-Umsatz brutto je Kunde', ratio('abo_gross', 'cv_active'), '#,##0', B);
    put('cv_abo_net', 'Abo-Umsatz netto je Kunde', divVat('cv_abo_gross'), '#,##0');
    put('cash_total', 'Bankeingang gesamt laut Konto', V('cash_total'), '#,##0', B);
    put('bank:stripe', '   davon Stripe', V('bank:stripe'), '#,##0', D);
    put('bank:adyen', '   davon Magicline (Adyen)', V('bank:adyen'), '#,##0', D);
    put('bank:customers', '   davon Überweisungen von Mitgliedern', V('bank:customers'), '#,##0', D);
    put('bank:other', '   übrige Eingänge (kein Umsatz)', V('bank:other'), '#,##0', D);
    put('cash_diff', '   Kontrolle Stripe: Konto minus erwartet', V('cash_diff'), '#,##0', D);
    put('wk_media', 'Werbekosten Media (CHF)', V('wk_media'), '#,##0', { bold: true, weekly: true });
    WK_PLATFORMS.forEach(function (pn) { put('wk:' + pn, '   davon ' + pn, V('wk:' + pn), '#,##0', { detail: true, weekly: true }); });
    put('wk_agency', 'Agenturkosten (CHF' + (loc === 'Gesamt' ? '' : ', Anteil ' + locDE) + ')', V('wk_agency'), '#,##0');
    put('cpl', 'Kosten pro Website-Lead (CHF)', ratio('wk_media', 'leads_web'), '#,##0', { weekly: true });
    WK_PLATFORMS.forEach(function (pn) { put('cpl:' + pn, '   CPL ' + pn + ' (CHF)', ratio('wk:' + pn, 'kanal:' + pn), '#,##0', { detail: true, weekly: true }); });
    put('cpt', '   Kosten pro Probetraining (CHF)', ratio('wk_media', 'trial_attended'), '#,##0', D);
    WK_PLATFORMS.forEach(function (pn) { put('sk:' + pn, '   Verkäufe aus ' + pn + '-Leads', V('sales_kanal:' + pn), '0', D); });
    put('cac', 'CAC Media (CHF je Verkauf)', ratio('wk_media', 'sales_signed'), '#,##0', B);
    put('cac_all', 'CAC inkl. Agentur (CHF je Verkauf)', function (c, ci) { var m = cellOf('wk_media', ci), a = cellOf('wk_agency', ci), sg = cellOf('sales_signed', ci); return '=IF(OR(' + m + '="",' + sg + '="",' + sg + '=0),"",(' + m + '+N(' + a + '))/' + sg + ')'; }, '#,##0', B);
    WK_PLATFORMS.forEach(function (pn) { put('cac:' + pn, '   CAC ' + pn + ' (CHF je Verkauf)', ratio('wk:' + pn, 'sk:' + pn), '#,##0', D); });
    put('ltv', 'LTV netto (CHF, Prognose)', V('ltv_forecast'), '#,##0', B);
    put('ltv_cac', '   LTV : CAC (Media)', ratio('ltv', 'cac'), '0.0', D);
    put('ltv_cac_all', 'LTV : CAC (inkl. Agentur)', ratio('ltv', 'cac_all'), '0.0');
    put('payback', 'Payback in Monaten', ratio('cac_all', 'cv_abo_net'), '0.0');
    // Hintergruende in einem Aufruf: Titelzeilen grau, Monatsspalten blau, Jahresspalten grau, Wochenzellen ohne Wochenwert grau (Ruben 07.09.)
    var bg = [];
    for (var rr = hdr + 1; rr < r; rr++) { var meta = rowMeta[rr] || {}; bg.push(cols.map(function (c) { return meta.title ? '#f3f3f3' : c.m ? '#eef2f8' : c.y ? '#f1f1f1' : (meta.weekly ? null : '#f3f3f3'); })); }
    if (bg.length) { sh.getRange(hdr + 1, 2, bg.length, cols.length).setBackgrounds(bg); Object.keys(rowMeta).forEach(function (rr) { if (rowMeta[rr].title) sh.getRange(Number(rr), 1).setBackground('#f3f3f3'); }); }
    cols.forEach(function (c, ci) { if (c.y) sh.getRange(hdr + 1, 2 + ci, r - hdr - 1, 1).setFontWeight('bold'); });
    var groups = []; det.sort(function (a, b) { return a - b; }).forEach(function (x) { var g = groups[groups.length - 1]; if (g && x === g[1] + 1) g[1] = x; else groups.push([x, x]); });
    groups.forEach(function (g) { try { sh.getRange(g[0], 1, g[1] - g[0] + 1, 1).shiftRowGroupDepth(1); } catch (e) { Logger.log('Zeilengruppe ' + g + ': ' + e); } });
    blocks.push({ loc: loc, locDE: locDE, hdr: hdr });
    r += 2;
  });
  // Diagramme unten in eigenen Baendern (Ruben 07.09.: genug Platz, keine Ueberlappung), Daten im versteckten Tab MADiagramm
  var dsh = getOrCreate(ss, 'MADiagramm'); clearSheet(dsh); if (!dsh.isSheetHidden()) dsh.hideSheet();
  var chartRow = r + 1, BAND = 17, d = 1;
  sh.getRange(chartRow, 1).setValue('Diagramme').setFontWeight('bold').setFontSize(13); chartRow += 1;
  blocks.forEach(function (b, bi) {
    var wrLocs = b.loc === 'Gesamt' ? ['Zurich', 'Winterthur'] : [b.loc];
    var sumW = function (o, f) { return wrLocs.reduce(function (s, l) { return s + (o[f][l] || 0); }, 0); };
    var kanW = function (o, names) { var s = 0; wrLocs.forEach(function (l) { names.forEach(function (nm) { s += o.kanal[l][nm] || 0; }); }); return s; };
    var g = function (kk, name) { if (b.loc === 'Gesamt') return gOf(kk, name); var v = val[kk + '|' + b.loc + '|' + name]; return v === undefined || v === '' ? '' : v; };
    var tbl = function (headRow, rows, fmt, dateFmt) {
      dsh.getRange(d, 1, 1, headRow.length).setValues([headRow]).setFontWeight('bold');
      if (rows.length) { dsh.getRange(d + 1, 1, rows.length, headRow.length).setValues(rows); dsh.getRange(d + 1, 1, rows.length, 1).setNumberFormat(dateFmt || 'mmm yyyy'); if (fmt) dsh.getRange(d + 1, 2, rows.length, headRow.length - 1).setNumberFormat(fmt); }
      var at = d; d += rows.length + 2; return at;
    };
    var fun = tbl([b.locDE + ' Monat', 'Neue Kontakte', 'Probetrainings', 'Verkäufe', 'Kündigungen'], hkeys.map(function (kk) { var la = g(kk, 'leads_all'), lw = g(kk, 'leads_web'); return [dt(kk), num(la) || num(lw), num(g(kk, 'trial_attended')), num(g(kk, 'new_customers')), num(g(kk, 'cancellations'))]; }));
    var quo = tbl([b.locDE + ' Quoten', 'Show-up-Rate', 'Verkäufe / Probetrainings', 'Verkäufe / Kontakte', 'Kohorten-Conversion'], hkeys.map(function (kk) { var nsv = g(kk, 'noshow_rate'); return [dt(kk), nsv === '' ? 0 : 1 - num(nsv), num(g(kk, 'conv_sales_trial')), num(g(kk, 'conv_sales_lead')), num(g(kk, 'conv_cohort_rate'))]; }), '0%');
    var wfun = tbl([b.locDE + ' Woche', 'Website-Leads', 'Gespräche', 'Probetrainings', 'Verkäufe', 'Kündigungen'], wkeys.map(function (m) { var mkw = addDs(m, 3).slice(0, 7), o = weekOf(m, mkw); return [dtW(m), sumW(o, 'leads'), sumW(o, 'calls'), sumW(o, 't'), num(daySumFor(wrLocs, m, mkw, 'signed_d:')), num(daySumFor(wrLocs, m, mkw, 'cancels_d:'))]; }), null, 'dd.MM.');
    var wkan = tbl([b.locDE + ' Kanal'].concat(WK_PLATFORMS).concat(['organisch/direkt']), wkeys.map(function (m) { var o = weekOf(m, addDs(m, 3).slice(0, 7)); return [dtW(m)].concat(WK_PLATFORMS.map(function (pn) { return kanW(o, [pn]); })).concat([kanW(o, ORG)]); }), null, 'dd.MM.');
    var C = function (type, at, w, n, row, col, title, opts) {
      if (!n) return;
      var ch = sh.newChart().setChartType(type).setNumHeaders(1).addRange(dsh.getRange(at, 1, n + 1, w)).setPosition(row, col, 0, 0)
        .setOption('title', title).setOption('width', 600).setOption('height', 320).setOption('legend', { position: 'bottom' }).setOption('vAxis', { minValue: 0 });
      Object.keys(opts || {}).forEach(function (o) { ch = ch.setOption(o, opts[o]); });
      sh.insertChart(ch.build());
    };
    var row0 = chartRow + bi * 2 * BAND;
    sh.getRange(row0, 1).setValue(b.locDE).setFontWeight('bold');
    try {
      C(Charts.ChartType.COLUMN, fun, 5, hkeys.length, row0 + 1, 1, 'Funnel ' + b.locDE + ' pro Monat', { colors: ['#9e9e9e', '#e2c210', '#1a73e8', '#d93025'], hAxis: { format: 'MMM yy' } });
      C(Charts.ChartType.LINE, quo, 5, hkeys.length, row0 + 1, 8, 'Quoten ' + b.locDE + ' (höher = besser)', { colors: ['#34a853', '#1a73e8', '#f29900', '#9e9e9e'], pointSize: 6, vAxis: { format: '#%', minValue: 0 }, hAxis: { format: 'MMM yy' } });
      C(Charts.ChartType.LINE, wfun, 7, wkeys.length, row0 + BAND + 1, 1, 'Funnel ' + b.locDE + ' pro Woche', { colors: ['#9e9e9e', '#34a853', '#e2c210', '#1a73e8', '#0b8043', '#d93025'], pointSize: 6, hAxis: { format: 'dd.MM' } });
      C(Charts.ChartType.COLUMN, wkan, WK_PLATFORMS.length + 2, wkeys.length, row0 + BAND + 1, 8, 'Website-Leads ' + b.locDE + ' pro Woche nach Kanal', { isStacked: true, hAxis: { format: 'dd.MM' } });
    } catch (e) { Logger.log('Diagramme ' + b.locDE + ': ' + e); }
  });
  sh.setRowHeights(chartRow, blocks.length * 2 * BAND + 1, 21);
  sh.setColumnWidth(1, 300); cols.forEach(function (c, ci) { sh.setColumnWidth(2 + ci, c.w ? 58 : 84); });
  sh.setFrozenColumns(1); // Spalte A bleibt beim seitlichen Scrollen stehen (Ruben 05.09.2026)
  try { sh.setRowGroupControlPosition(SpreadsheetApp.GroupControlTogglePosition.BEFORE); sh.collapseAllRowGroups(); } catch (e) { Logger.log('Zeilengruppen: ' + e); }
  [MA_HIST, MA_COHORT].forEach(function (n) { var h = ss.getSheetByName(n); if (h && !h.isSheetHidden()) h.hideSheet(); });
  try { buildMethodik(ss); } catch (e1) { Logger.log('Methodik: ' + e1); }
  try { maArrangeTabs(ss); } catch (e2) { Logger.log('Tabs: ' + e2); }
}
// Sichtbare Tabs in fester Reihenfolge (Ruben 07.09.): Berichte, dann Formular-Eingaenge (gelb), dann Eingabe-Tabs (gruen), Protokoll und Methodik (grau)
var MA_TAB_HIDE = ['Kündigungsrisiko', 'Cancellations', 'Bank', 'Einstellungen', 'Finanzplan-Übertrag', 'Methodik']; // Ruben 07.09.: braucht er nicht, versteckt (Bank/Einstellungen zum Eintragen einblenden)
var MA_TAB_COLOR = { Events: '#f4b400', Cancellations: '#f4b400', Bank: '#34a853', Einstellungen: '#34a853', 'Finanzplan-Übertrag': '#9e9e9e', Methodik: '#9e9e9e' };
function maArrangeTabs(ss) { // Reihenfolge bestimmt Ruben selbst (07.09.), das Skript versteckt nur die Hilfstabs und setzt Farben
  MA_TAB_HIDE.forEach(function (n) { var sh = ss.getSheetByName(n); if (sh && !sh.isSheetHidden()) sh.hideSheet(); });
  Object.keys(MA_TAB_COLOR).forEach(function (n) { var sh = ss.getSheetByName(n); if (sh && (sh.getTabColor() || null) !== MA_TAB_COLOR[n]) sh.setTabColor(MA_TAB_COLOR[n]); });
}
// Tab Methodik: alle ausfuehrlichen Definitionen an einem Ort (Ruben 07.09.: keine Textwaende ueber den Tabellen)
var METHODIK_SHEET = 'Methodik';
function buildMethodik(ss) {
  var sh = getOrCreate(ss, METHODIK_SHEET); clearSheet(sh);
  sh.getRange('A1').setValue('Methodik: Definitionen aller Berichte').setFontSize(16).setFontWeight('bold');
  sh.getRange('A2').setValue('Automatisch gepflegt (Stand ' + Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm') + '). Kurzdefinitionen stehen zusätzlich als Notiz an den Zeilenbezeichnungen der Berichte.').setFontColor('#666666');
  var secs = [
    ['Monatsabschluss (Monate und Wochen)', MA_NOTE_FULL],
    ['Werbekosten', WK_NOTE_FULL],
    ['LTV und Kundenwert', LTV_NOTE_FULL],
    ['Bank', 'Gutschriften je Monat und Standort aus dem Kontoauszug (nur Eingänge), von Hand eingetragen: Stripe = alle Gutschriften "Stripe Payments UK Ltd" (exercise.com), Magicline (Adyen) = Auszahlungen des alten Studio-Systems, Customer transfers = Überweisungen von Mitgliedern und Stiftungen (Umsatz, fehlt in exercise.com), Other = kein Umsatz (Steuerrückzahlungen, Versicherungen, unbenannte Eingänge). Stripe zahlt 7 Kalendertage nach der Belastung aus; der Abgleich steht im Monatsabschluss (Erwarteter Bankeingang, Differenz).'],
    ['Finanzplan-Übertrag', FP_NOTE],
    ['Einstellungen', 'Agentur-Pauschalen je Standort und für TikTok in EUR pro Monat mit Von/Bis, Wechselkurs EUR in CHF, Anteil Zürich für Kampagnen ohne Standort im Namen.'],
    ['Team KPIs (Probetrainings Zürich und Winterthur)', TR_T.de.rule],
    ['Open Payments', 'Eigenes Sheet fürs Geldeintreiben: Personen mit der Lifecycle-Stage "Signed but no payment" (Vertrag unterschrieben, keine Zahlungsmethode), beide Standorte, älteste zuerst, ab 30 Tagen rot. Stündlich aus exercise.com. Wer in exercise.com auf "Client" gesetzt wird, verschwindet beim nächsten Lauf.']
  ];
  var r = 4;
  secs.forEach(function (x) {
    sh.getRange(r, 1).setValue(x[0]).setFontWeight('bold').setFontSize(12); r++;
    sh.getRange(r, 1).setValue(x[1]).setWrap(true).setVerticalAlignment('top'); r += 2;
  });
  sh.setColumnWidth(1, 1000);
}
// Cash je Monat und Standort aus ZahlungenTag (Monat|Datum|Standort|Anzahl|Betrag|Gebuehr|Refund|MwSt|Auszahlung)
function cashMonth(ss, loc) {
  var out = {}, rows = ltvRows(ss, 'sums'), O = function (k) { return out[k] = out[k] || { paid: 0, refund: 0, fee: 0, tax: 0, netvat: 0, net: 0, expect: 0 }; };
  rows.forEach(function (r) {
    if (String(r[1]) === '-' || String(r[2]) !== loc) return;
    var d = dOfCell(r[1]); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    var amt = Number(r[4]) || 0, fee = Number(r[5]) || 0, ref = Number(r[6]) || 0, tax = Number(r[7]) || 0, net = Number(r[8]) || 0, o = O(d.slice(0, 7));
    o.paid += amt - ref; o.refund += ref; o.fee += fee; o.tax += tax; o.netvat += amt - ref - tax; o.net += net;
    var p = new Date(d + 'T12:00:00'); p.setDate(p.getDate() + 7); while (p.getDay() === 0 || p.getDay() === 6) p.setDate(p.getDate() + 1);
    O(fmtD(p).slice(0, 7)).expect += net;
  });
  // laufender Monat: erwarteter Eingang unvollstaendig, deshalb nur bis zum letzten vollen Datenmonat ausweisen
  var last = rows.filter(function (r) { return String(r[1]) !== '-'; }).map(function (r) { return dOfCell(r[1]); }).sort().pop() || '';
  Object.keys(out).forEach(function (k) { if (k > last.slice(0, 7)) delete out[k]; else if (k === last.slice(0, 7) && last < addDs(last.slice(0, 7) + '-01', 27)) delete out[k].expect; });
  return out;
}
// Tab Bank (persistent, von Hand aus dem Kontoauszug, spaeter UBS-CSV): Month|Location|Stripe credits|Adyen|Customer transfers|Other credits|Note.
// Stripe = exercise.com-Auszahlungen; Adyen = Auszahlungen von Magicline (altes Studio-System, Ruben 07.09.: dort werden noch Mitglieder abgebucht); Customer transfers =
// Ueberweisungen von Mitgliedern und Stiftungen (Umsatz, fehlt in exercise.com); Other = kein Umsatz (Eidg. Finanzverwaltung, SVA, unbenannt).
// Juni-August 2026 aus den UBS-PDFs vom 03.09. (Nachrechnung 06.09.: Summen = Kontoumsatz 371'919.94 ZH / 138'125.54 WT). Altes Layout mit
// einer Transfers-Spalte war unvollstaendig (Eintraege mit Betrag auf derselben Zeile fehlten) und wird beim Lesen ersetzt.
var BANK_SHEET = 'Bank', BANK_HEAD = ['Month', 'Location', 'Stripe credits', 'Magicline (Adyen)', 'Customer transfers', 'Other credits (no revenue)', 'Note'];
var BANK_SEED = [
  ['2026-06', 'Zurich', 111628.63, 3102.03, 11861.65, 15840.50, 'UBS statement 03.09.2026; other = Eidg. Finanzverwaltung 14765.50 + SVA 1075.00; transfers = 30 members/foundations'],
  ['2026-06', 'Winterthur', 45775.61, 0, 0, 0, ''],
  ['2026-07', 'Zurich', 113395.25, 4811.15, 3596.56, 545.70, 'transfers = Stiftung Schloss Regensberg 2382.45, Helwig 775.21, 2 members; other = China Import Service'],
  ['2026-07', 'Winterthur', 49731.89, 0, 0, 0, ''],
  ['2026-08', 'Zurich', 103030.13, 2103.54, 1149.90, 854.90, 'transfers = OKey Stiftung 711.00, 2 members; other = credit without payer name 06.08.'],
  ['2026-08', 'Winterthur', 42618.04, 0, 0, 0, '']];
function bankRead(ss) {
  var sh = ss.getSheetByName(BANK_SHEET), w = BANK_HEAD.length;
  var head = sh && sh.getLastRow() ? sh.getRange(1, 1, 1, w).getValues()[0].map(String) : [];
  if (sh && head[3] === 'Adyen') { sh.getRange(1, 4).setValue(BANK_HEAD[3]); head[3] = BANK_HEAD[3]; } // Umbenennung 07.09. ohne Neuaufbau
  if (!sh || head.join('|') !== BANK_HEAD.join('|')) {
    if (!sh) sh = ss.insertSheet(BANK_SHEET); else sh.clear();
    sh.getRange(1, 1, 200, 1).setNumberFormat('@');
    var rows = [BANK_HEAD].concat(BANK_SEED);
    sh.getRange(1, 1, rows.length, w).setValues(rows); sh.getRange(1, 1, 1, w).setFontWeight('bold'); sh.setFrozenRows(1);
    sh.getRange(2, 3, rows.length - 1, 4).setNumberFormat('#,##0.00');
    sh.getRange(1, 1).setNote('Credits per month from the bank statement (credits only), one row per month and location. Stripe credits = all "Stripe Payments UK Ltd" entries (exercise.com). Magicline (Adyen) = payouts of the old studio software Magicline via Adyen (members still debited there). Customer transfers = bank transfers from members and foundations (revenue, not in exercise.com). Other = credits that are no revenue (tax refunds, insurance, unnamed). The Monatsabschluss reads this tab.');
    sh.setColumnWidth(7, 420);
  }
  var out = {}; if (sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues().forEach(function (r) {
    var mk = mkOf(r[0]); if (!/^\d{4}-\d{2}$/.test(mk) || !r[1]) return;
    var n = function (v) { return v === '' ? '' : Number(v) || 0; };
    out[mk + '|' + String(r[1])] = { stripe: n(r[2]), adyen: n(r[3]), customers: n(r[4]), other: n(r[5]) };
  });
  return out;
}
// COUNTIFS ueber den Tab Daten: C Monat, D Standort, G zaehlt, E Interesse, J Kanal
function maCountLeads(monthRef, locDE, col, name) {
  return '=COUNTIFS(Daten!$C:$C,' + monthRef + ',Daten!$D:$D,"' + locDE + '",Daten!$G:$G,1' + (col ? ',Daten!$' + col + ':$' + col + ',"' + name + '"' : '') + ')';
}

// ------------------------------------------------------------ Probetrainings-Liste (seit 04.09.2026, Entscheid Ruben)
// Liegt im TEAM-SHEET (TEAM_ID, "Team KPIs", frueher "IMPACT Team", umbenannt 05.09.): Tabs "Events" (Spiegel, nur lesen), "Probetrainings ZH" (deutsch, Abdi),
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
var TR_ROW0 = 5, TR_DAY_N = 7, TR_P0 = 8, TR_NCOL = 19, TR_CHECK_DAYS = 1, TR_PAY_DAYS = 7;
// Ruben 08.09. (mittags, ersetzt die Unterschrift-Regel vom Vormittag): Verkauf = ERSTES ABO-PAKET AKTIVIERT = Abo-Start in exercise.com
// (geplante Starts am Starttag) oder Rechnungspaket ohne Abo (client_packages, Melvin Pappu). Die Unterschrift liefert nur den Verkaeufer.
// Unterschreiber ohne Zeile werden ab TR_SALE_FROM nachgetragen (Zeile am ersten Check-in bis TR_FV_BACK Tage zurueck, sonst am
// Unterschriftstag mit "ohne Check-in" als Klasse; zaehlt sofort als Trial und Verkauf, kein roter Hinweis). PT-Pakete, Paketwechsel
// und Verlaengerungen sind keine Verkaeufe (klassen.js saleOf / computeMonat). Zahlungshinweis entfaellt bei geplantem Abo-Start.
var TR_SALE_FROM = '2026-09-01', TR_FV_BACK = 60;
var TR_CID_SHEET = 'ClientIds'; // versteckter Tab im Team-Sheet: Report-User-ID -> Profilnummer (CRM-Link), waechst je Lauf
var DI = { day: 0, att: 1, conv: 2, placed: 3, trials: 4, noshow: 5, sold: 6 };
// Ruben 06.09.: Spalte Personen raus (zwei Kinder = Zeile kopieren und Namen aendern, die Kopie bleibt erhalten), Vertragsstart neu
var CI = { date: 0, name: 1, art: 2, cls: 3, coach: 4, booked: 5, kanal: 6, lifecycle: 7, check: 8, contract: 9, start: 10, seller: 11, pkg: 12, note: 13, crm: 14, created: 15, uid: 16, ns: 17, stamp: 18 };
var LC_POST = ['Client', 'Dependant client', 'Signed but no payment', 'Pending Decision', 'Missed the talk', 'Not Interested (Lost)'];
var LC_CLIENT = ['Client', 'Dependant client', 'Signed but no payment'];
var LC_NOSHOW_OK = ['re-engage no-shows', 're-engage cancelled trial'].concat(LC_POST);
var LC_EXCLUDE = ['Non-Client']; // Assistant Coach, Friends & Family: kein Trial
var LC_PAY_OPEN = 'Signed but no payment';
var TR_TRIG_VER = 'wm2'; // Marke aendern = Trigger werden beim naechsten Stundenlauf neu angelegt // aendert sich, wenn die Trigger neu gesetzt werden muessen; der Stundenlauf zieht das selbst nach
var TR_T = {
  de: {
    title: 'Probetrainings Zürich',
    ruleShort: 'Trial = erster Check-in überhaupt bei IMPACT (ohne Staff, Gäste, Altkunden; Events und Open Mat zählen nicht). Eure Eingaben: nur „Anrufe versucht“ und „Anrufe geführt“, alles andere kommt aus exercise.com. Rote Zeilen: Fakt und Lifecycle-Stage passen nicht zusammen, bitte in exercise.com nachziehen. Verkauf = erstes Abo-Paket aktiviert (Abo-Start in exercise.com, bei Rechnungskunden das aktivierte Paket), auch vor dem Probetraining oder ohne Check-in (dann steht „ohne Check-in“ bei der Klasse). Alle Regeln stehen als Notiz an dieser Zelle.',
    dHead: ['Tag', 'Anrufe versucht', 'Anrufe geführt', 'Gebuchte Trials', 'Trials', 'No-Shows', 'Verkauft'],
    dNotes: ['Kalendertag. Die Personen dieses Tages stehen rechts daneben.', 'EURE SPALTE: Anrufversuche an diesem Tag.', 'EURE SPALTE: tatsächlich geführte Gespräche an diesem Tag.', 'An diesem Tag angelegte Trial-Buchungen (egal, wann das Trial stattfindet). Automatisch.', 'Probetrainings, die an diesem Tag stattgefunden haben. Automatisch.', 'An diesem Tag gebucht und nicht erschienen. Automatisch aus den Besuchsdaten.', 'Erste Abo-Pakete, die an diesem Tag aktiviert wurden (Abo-Start oder Rechnungspaket), auch vor dem Probetraining oder ohne Check-in. Automatisch.'],
    head: ['Trial-Datum', 'Name', 'Art', 'Klasse', 'Trainer', 'Gebucht von', 'Kanal', 'Personen', 'Lifecycle-Stage', 'Prüfen', 'Abschluss am', 'Verkäufer', 'Paket', 'Letzte Notiz', 'CRM', 'Buchung erstellt am', 'UID', 'NS', 'Stand'],
    notes: ['Datum des ersten Check-ins. Bei No-Show, Storniert oder Gebucht: Datum des gebuchten Termins. Automatisch aus exercise.com.', 'Name in exercise.com. Automatisch.', 'Trial stattgefunden = die Person war da (erster Check-in überhaupt). Gebucht (kommend) = Termin liegt noch vor uns. No-Show = nicht erschienen. Storniert. Wiederholer (prüfen). Rückkehrer. Event (kein Trial). Automatisch.', 'Uhrzeit und Klasse des ersten Check-ins (bei Gebucht: des Termins). Die Personen eines Tages stehen nach Uhrzeit sortiert. Automatisch.', 'Trainer dieser Klasse. Automatisch.', 'Wer die Buchung in exercise.com angelegt hat. Automatisch.', 'Herkunft der Website-Anfrage: Klick-ID (Google Ads, Meta Ads, TikTok Ads), sonst UTM, sonst verweisende Seite. "kein Web-Lead" = kein Formular auf der Website gefunden. Automatisch.', 'Anzahl Personen, automatisch 2 bei Geschwistern auf einem Account ("&" oder "+" im Namen).', 'Aktuelle Lifecycle-Stage in exercise.com. Wird dort gepflegt, hier nur gelesen. "Non-Client" (Assistant Coach, Friends & Family) nimmt die Zeile aus der Zählung. Automatisch.', 'Abweichung zwischen Fakt (Buchung, Check-in, Vertrag) und Lifecycle-Stage, ab einem Tag nach dem Termin. Rot = bitte in exercise.com die Stage setzen; beim nächsten Lauf verschwindet der Hinweis. Automatisch.', 'Tag, an dem das erste Abo-Paket aktiviert wurde: Abo-Start in exercise.com oder bei Rechnungskunden das manuell aktivierte Paket. Das ist der Verkauf. Die Unterschrift allein zählt nicht. Automatisch.', 'Wer den Vertrag (Waiver) unterschreiben liess. Automatisch.', 'Abgeschlossenes Paket. Automatisch.', 'Datum und Typ der letzten Notiz in exercise.com. Automatisch.', 'Link auf die Notizen der Person in exercise.com.', 'Wann die Trial-Buchung in exercise.com erstellt wurde. Zählt als Placed Trial für diesen Tag. Automatisch.', 'exercise.com User-ID, der Schlüssel der Zeile. Nicht ändern.', 'No-Show-Daten dieser Person, Grundlage der Tageszählung. Nicht ändern.', 'Letzte Aktualisierung (stündlich 09–22 Uhr).'],
    noVisit: 'ohne Check-in', art: { 'Trial': 'Trial stattgefunden', 'Gebucht': 'Gebucht (kommend)' }, kanal: {},
    payHead: ['Zahlung offen', 'seit', 'Tage', 'CRM'],
    nsNote: 'No-Show am {ns}, neu gebucht für {d}.',
    chk: { nolc: 'Trial am {d} vorbei, keine Lifecycle-Stage bekannt', stuck: 'Trial am {d} vorbei, Stage noch "{lc}"', noshow: 'No-Show am {d}, Stage noch "{lc}"', canc: 'Storniert am {d}, Stage noch "{lc}"', booked: 'Termin {d} gebucht, Stage "{lc}" statt Trial Booked', wdh: 'Wiederholer: Stage in exercise.com setzen oder auf "Non-Client" stellen', clientNoContract: 'Stage Client, aber kein aktiviertes Abo-Paket gefunden', contractNoClient: 'Paket am {d} aktiviert, Stage aber "{lc}"', pay: 'Seit {n} Tagen Paket aktiv, Zahlung fehlt', noteYes: ' (letzte Notiz {n})', noteNo: ' (keine Notiz seit dem Termin)' },
    mail: { subject: '[Team] Probetrainings Zürich {d}', today: 'Heute', yest: 'Gestern', checks: 'Bitte in exercise.com nachziehen', pay: 'Zahlung offen (ab 7 Tagen)', none: 'keine', month: 'Monat bisher: {t} Trials, {s} verkauft, {c} zu prüfen' },
    rule: 'Regel (Ruben, 04.09.2026): Trial = erster Check-in überhaupt bei IMPACT, egal welches Paket exercise.com dranhängt; ohne Staff, Gäste und Altkunden. Events, Seminare und Open Mat sind keine Trials. Zwei Kinder auf einem Account = 2 Personen. Kein Trial (Assistant Coach, Friends & Family, Datenfehler) = Stage "Non-Client" in exercise.com setzen. Der Zustand einer Person ist ihre Lifecycle-Stage in exercise.com; das Sheet hat keine eigenen Status-Spalten. "Prüfen" zeigt ab einem Tag nach dem Termin, wo Fakt und Stage nicht zusammenpassen (rot): bitte in exercise.com nachziehen, der Hinweis verschwindet beim nächsten Lauf. Abschluss am = Tag der Paket-Aktivierung (Abo-Start). Verkauf (Ruben 08.09.): das erste Abo-Paket einer Person wird aktiviert, also der Abo-Start in exercise.com (geplante Starts zählen am Starttag) oder bei Rechnungskunden das manuell aktivierte Paket; PT-Pakete, Paketwechsel und Verlängerungen zählen nicht. Die Unterschrift allein ist kein Verkauf. Wer kauft, ohne dass ein Check-in da ist, steht am Verkaufstag mit „ohne Check-in“ bei der Klasse und zählt als Trial und Verkauf. Links der Tagesblock: eure einzigen Eingaben sind Anrufe versucht und Anrufe geführt. Ganz rechts "Zahlung offen": unterschrieben, aber ohne Zahlungsdaten. Aktualisierung stündlich 09–22 Uhr. Spaltenerklärungen: Notiz auf der Überschrift.'
  },
  en: {
    title: 'Trials Winterthur',
    ruleShort: 'Trial = first ever check-in at IMPACT (no staff, guests or existing members; events and open mat do not count). Your inputs: only "Calls attempted" and "Calls conducted", everything else comes from exercise.com. Red rows: fact and lifecycle stage do not match, please update in exercise.com. Sale = first membership package activated (subscription start in exercise.com, for invoice clients the activated package), even before the trial or without a check-in (then "no check-in" is shown as the class). All rules are in the note on this cell.',
    dHead: ['Day', 'Calls attempted', 'Calls conducted', 'Placed trials', 'Trials', 'No-shows', 'Sold'],
    dNotes: ['Calendar day. The people of that day are listed to the right.', 'YOUR COLUMN: call attempts on that day.', 'YOUR COLUMN: conversations actually held on that day.', 'Trial bookings created on that day (no matter when the trial takes place). Automatic.', 'Trials that took place on that day. Automatic.', 'Booked for that day and did not show up. Automatic from the visit data.', 'First membership packages activated on that day (subscription start or invoice package), even before the trial or without a check-in. Automatic.'],
    head: ['Trial date', 'Name', 'Type', 'Class', 'Coach', 'Booked by', 'Channel', 'People', 'Lifecycle stage', 'Check', 'Contract signed', 'Sold by', 'Package', 'Last note', 'CRM', 'Booking created', 'UID', 'NS', 'Updated'],
    notes: ['Date of the first check-in. For No-show, Cancelled or Booked: date of the booked session. Automatic from exercise.com.', 'Name in exercise.com. Automatic.', 'Trial done = the person came (first ever check-in). Booked (upcoming) = session still ahead. No-show. Cancelled. Repeat visitor (check). Returning ex-member. Event (no trial). Automatic.', 'Time and class of the first check-in (for Booked: of the session). People of a day are sorted by time. Automatic.', 'Coach of that class. Automatic.', 'Who created the booking in exercise.com. Automatic.', 'Origin of the website enquiry: click ID (Google Ads, Meta Ads, TikTok Ads), otherwise UTM, otherwise referring site. "no web lead" = no form found on the website. Automatic.', 'Number of people, automatically 2 for siblings on one account ("&" or "+" in the name).', 'Current lifecycle stage in exercise.com. Maintained there, only read here. "Non-Client" (assistant coach, friends & family) removes the row from the count. Automatic.', 'Mismatch between fact (booking, check-in, contract) and lifecycle stage, from one day after the session. Red = please set the stage in exercise.com; the hint disappears with the next run. Automatic.', 'Day the first membership package was activated: subscription start in exercise.com or, for invoice clients, the manually activated package. That is the sale. The signature alone does not count. Automatic.', 'Who had the contract signed. Automatic.', 'Package sold. Automatic.', 'Date and type of the last note in exercise.com. Automatic.', 'Link to the notes of that person in exercise.com.', 'When the trial booking was created in exercise.com. Counts as a placed trial for that day. Automatic.', 'exercise.com user ID, the key of the row. Do not change.', 'No-show dates of this person, the basis of the daily count. Do not change.', 'Last update (hourly 9am-10pm).'],
    noVisit: 'no check-in', art: { 'Trial': 'Trial done', 'No-Show': 'No-show', 'Storniert': 'Cancelled', 'Gebucht': 'Booked (upcoming)', 'Wiederholer (prüfen)': 'Repeat visitor (check)', 'Rückkehrer (Ex-Mitglied)': 'Returning ex-member', 'Event (kein Trial)': 'Event (no trial)' },
    kanal: { 'Google organisch': 'Google organic', 'Instagram/Facebook organisch': 'Instagram/Facebook organic', 'TikTok organisch': 'TikTok organic', 'Direkt': 'Direct', 'Andere': 'Other', 'kein Web-Lead': 'no web lead' },
    payHead: ['Payment open', 'since', 'days', 'CRM'],
    nsNote: 'No-show on {ns}, re-booked for {d}.',
    chk: { nolc: 'Trial on {d} is over, no lifecycle stage known', stuck: 'Trial on {d} is over, stage still "{lc}"', noshow: 'No-show on {d}, stage still "{lc}"', canc: 'Cancelled on {d}, stage still "{lc}"', booked: 'Session {d} booked, stage "{lc}" instead of Trial Booked', wdh: 'Repeat visitor: set the stage in exercise.com or set it to "Non-Client"', clientNoContract: 'Stage Client, but no activated membership package found', contractNoClient: 'Package activated on {d}, but stage "{lc}"', pay: 'Package active for {n} days, payment still missing', noteYes: ' (last note {n})', noteNo: ' (no note since the session)' },
    mail: { subject: '[Team] Trials Winterthur {d}', today: 'Today', yest: 'Yesterday', checks: 'Please update in exercise.com', pay: 'Payment open (7 days and more)', none: 'none', month: 'Month so far: {t} trials, {s} sold, {c} to check' },
    rule: 'Rule (Ruben, 4 Sep 2026): Trial = first ever check-in at IMPACT, whatever package exercise.com attaches; no staff, guests or existing members. Events, seminars and open mat are not trials. Two kids on one account = 2 people. Not a trial (assistant coach, friends & family, data error) = set the stage "Non-Client" in exercise.com. A person\'s state is their lifecycle stage in exercise.com; the sheet has no status columns of its own. "Check" shows, from one day after the session, where fact and stage do not match (red): please update in exercise.com, the hint disappears with the next run. Contract signed = day the package was activated (subscription start). Sale (Ruben, 8 Sep): a person\'s first membership package is activated, i.e. the subscription start in exercise.com (scheduled starts count on their start day) or, for invoice clients, the manually activated package; PT packages, package changes and renewals do not count. The signature alone is not a sale. Whoever buys without a check-in is listed on the sale day with "no check-in" as the class and counts as trial and sale. On the left the day block: your only inputs are calls attempted and calls conducted. On the far right "Payment open": signed, but no payment details. Updated every hour 9am-10pm. Column explanations: note on the header cell.'
  }
};
// Umbau 06.09.2026 (Ruben): Spalte "Personen" entfaellt, "Vertragsstart" kommt hinter "Abschluss am"; Kinder = Zeile kopieren
(function () {
  var add = { de: ['Vertragsstart', 'Startdatum des Abos laut exercise.com (kann nach dem Abschluss liegen). Automatisch.', ' Zwei Kinder auf einem Account: Zeile kopieren und den Namen des zweiten Kindes eintragen, die Kopie bleibt bei jedem Lauf erhalten. Kanal: Klick-ID/UTM/Referrer der Website-Anfrage seit 02.09.2026; "kein Web-Lead" = keine Website-Anfrage gefunden (Telefon, Walk-in, App, oder vor dem 02.09.), dann steht die Quelle aus exercise.com dahinter; "Direkt" = Website ohne Werbe-Klick.'],
    en: ['Contract start', 'Subscription start date from exercise.com (may be after the signing date). Automatic.', ' Two kids on one account: copy the row and enter the second child\'s name, the copy survives every run. Channel: click ID/UTM/referrer of the website request since 2 Sep 2026; "no web lead" = no website request found (phone, walk-in, app, or before 2 Sep), then the exercise.com source follows; "Direct" = website without an ad click.'] };
  ['de', 'en'].forEach(function (l) { var T = TR_T[l]; if (T.head.length !== 19 || T.head[7] === add[l][0] || T.head[10] === add[l][0]) return; T.head.splice(7, 1); T.notes.splice(7, 1); T.head.splice(10, 0, add[l][0]); T.notes.splice(10, 0, add[l][1]); T.rule += add[l][2]; });
})();
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
function trPers(r) { return 1; } // seit 06.09.: eine Zeile = eine Person (Kinder als eigene Zeilen)
function trSold(r) { return !trNoTrial(r) && !!dOfCell(r[CI.contract]); } // Paket aktiviert = Verkauf, auch bei Gebucht/No-Show (Ruben 08.09.)
function trNsDates(r) { return String(r[CI.ns] || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); }
// Pruefung Fakt gegen Lifecycle-Stage (Ruben 04.09.2026: ein Tag nach dem Termin; Zahlung offen ab 7 Tagen)
function trCheck(r, today, T) {
  var d = dOfCell(r[CI.date]), art = trC(r[CI.art]), lc = String(r[CI.lifecycle] || '').trim(), contract = dOfCell(r[CI.contract]);
  if (!d || trNoTrial(r)) return '';
  var due = today > addDs(d, TR_CHECK_DAYS), msg = '', dd = deD(d), noteD = String(r[CI.note] || '').slice(0, 10), noteIso = noteD ? noteD.slice(6, 10) + '-' + noteD.slice(3, 5) + '-' + noteD.slice(0, 2) : '';
  var f = function (key, dx) { return T.chk[key].replace('{d}', dx || dd).replace('{lc}', lc); };
  var startD = dOfCell(r[CI.start]); // Abo mit Start in der Zukunft: Zahlung ist geregelt, kein Hinweis (Ruben 08.09.)
  if (lc === LC_PAY_OPEN && contract && !(startD && startD > today)) { var age = Math.round((new Date(today + 'T12:00:00') - new Date(contract + 'T12:00:00')) / 864e5); if (age >= TR_PAY_DAYS) return T.chk.pay.replace('{n}', age); }
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
  var base = { start: start, end: end, today: today, sales_start: fmtD(addD(now, -180)), fv_back: TR_FV_BACK, sale_rows_from: TR_SALE_FROM };
  var main = SpreadsheetApp.openById(SHEET_ID), ss = teamSs(), open = [];
  Object.keys(TR_SHEETS).forEach(function (loc) { open = open.concat(trOpenRows(ss, loc, start)); });
  var p1 = trCall(Object.assign({ phase: 't1' }, base)); if (p1.error) throw new Error('Trials t1: ' + JSON.stringify(p1).slice(0, 300));
  var p2 = null, p3 = null, i;
  var errs = 0; // voruebergehende Fetch-Fehler (z.B. fetch_t2 am 07.09.) nicht sofort abbrechen, sondern bis 3x wiederholen
  for (i = 0; i < 9; i++) { Utilities.sleep(20000); p2 = trCall(Object.assign({ phase: 't2' }, base)); if (p2.error) { if (++errs >= 3) throw new Error('Trials t2: ' + JSON.stringify(p2).slice(0, 300)); continue; } if (p2.ready) break; }
  if (!p2 || !p2.ready) throw new Error('Trials t2 nicht fertig: ' + JSON.stringify(p2).slice(0, 200));
  // Lifecycle in Bloecken nacheinander (ein Cache je Report), waehrend fvWT und v2 im Hintergrund generieren
  var life = [], nb = Number(p1.life_blocks) || 0, b, lg;
  for (b = 1; b <= nb; b++) {
    var lr = trCall(Object.assign({ phase: 'lr', i: b }, base)); if (lr.error) throw new Error('Trials Lifecycle ' + b + ': ' + JSON.stringify(lr).slice(0, 300));
    lg = null;
    errs = 0;
    for (i = 0; i < 8; i++) { Utilities.sleep(8000); lg = trCall(Object.assign({ phase: 'lg', i: b }, base)); if (lg.error) { if (++errs >= 3) throw new Error('Trials Lifecycle ' + b + ': ' + JSON.stringify(lg).slice(0, 300)); continue; } if (lg.ready) break; }
    if (!lg || !lg.ready) throw new Error('Trials Lifecycle-Block ' + b + ' nicht fertig: ' + JSON.stringify(lg).slice(0, 200));
    life = life.concat(lg.rows || []);
  }
  errs = 0;
  for (i = 0; i < 9; i++) { Utilities.sleep(20000); p3 = trCall(Object.assign({ phase: 't3', fv_zh: p2.fv_zh, v1: p2.v1, open_uids: open, life: life }, base)); if (p3.error) { if (++errs >= 3) throw new Error('Trials t3: ' + JSON.stringify(p3).slice(0, 300)); continue; } if (p3.ready) break; }
  if (!p3 || !p3.ready) throw new Error('Trials t3 nicht fertig: ' + JSON.stringify(p3).slice(0, 200));
  var data = p3.data, lines = [], leadMap = trLeadMap(main);
  var uids = trSheetUids(ss);
  Object.keys(TR_SHEETS).forEach(function (loc) { (data.rows[loc] || []).forEach(function (x) { uids.push(String(x.uid)); }); ((data.payopen || {})[loc] || []).forEach(function (x) { if (x.uid) uids.push(String(x.uid)); }); });
  var cidMap = {}; try { cidMap = trCidLookup(ss, uids); } catch (e5) { Logger.log('ClientIds: ' + e5); cidMap = trCidMap(ss); }
  Object.keys(TR_SHEETS).forEach(function (loc) { lines.push(trUpsert(ss, loc, data.rows[loc] || [], data.sales || {}, (data.payopen || {})[loc] || [], start, today, leadMap, cidMap)); });
  try { lines.push('Open payments: ' + payWrite(data.payopen || {}, today, cidMap)); } catch (e0) { Logger.log('Open payments: ' + e0); }
  try { teamMirrorEvents(main, ss); } catch (e1) { Logger.log('Events-Spiegel: ' + e1); }
  try { maScheduleBuild(); } catch (e2) { Logger.log('Monatsabschluss-Bau: ' + e2); } // Wochenwerte stehen im Monatsabschluss (seit 07.09.); Bau eine Minute spaeter in eigener Ausfuehrung
  Logger.log('Probetrainings ' + start + '..' + end + ': ' + lines.join(' | '));
  try { PropertiesService.getScriptProperties().setProperty('trLastOk', String(Date.now())); } catch (e9) {}
  return lines.join('\n');
}
// exercise.com: die Reports liefern die User-ID, die Profil-Adresse /ex4/clients/<id> braucht die Client-ID (Lehre 08.09.2026:
// alle CRM-Links liefen ins Leere). Zuordnung einmal je Person ueber die Cloudflare-Funktion (Phase 'cid'), im versteckten Tab gemerkt.
function trCidMap(ss) { var sh = ss.getSheetByName(TR_CID_SHEET), m = {}; if (!sh || sh.getLastRow() < 2) return m; sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) { if (r[0] && r[1]) m[String(r[0])] = String(r[1]); }); return m; }
function trCidLookup(ss, uids) {
  var map = trCidMap(ss), miss = {}; uids.forEach(function (u) { u = String(u || ''); if (u && !map[u]) miss[u] = 1; });
  var list = Object.keys(miss); if (!list.length) return map;
  var d = fmtD(new Date()), res = trCall({ phase: 'cid', uids: list.slice(0, 2000), start: d, end: d });
  if (res.error || !res.map) { Logger.log('ClientIds: ' + JSON.stringify(res).slice(0, 200)); return map; }
  var sh = ss.getSheetByName(TR_CID_SHEET) || ss.insertSheet(TR_CID_SHEET), add = [];
  if (sh.getLastRow() < 1) sh.getRange(1, 1, 1, 3).setValues([['User ID', 'Client ID', 'Since']]).setFontWeight('bold');
  Object.keys(res.map).forEach(function (u) { map[u] = String(res.map[u]); add.push([u, String(res.map[u]), d]); });
  if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, 3).setNumberFormat('@').setValues(add);
  try { sh.hideSheet(); } catch (e) {}
  Logger.log('ClientIds: ' + add.length + ' neu, ' + (list.length - add.length) + ' nicht gefunden (' + res.pages + ' Seiten)');
  return map;
}
function trCrmLink(map, uid, name) {
  var cid = map && uid ? map[String(uid)] : '';
  if (cid) return '=HYPERLINK("https://app.impact-martialarts.com/ex4/clients/' + cid + '/notes","CRM")';
  if (name) return '=HYPERLINK("https://app.impact-martialarts.com/ex4/clients?client_search=' + encodeURIComponent(String(name)).replace(/"/g, '') + '","CRM (Suche)")'; // Profilnummer (noch) unbekannt: Kundensuche
  return '';
}
function trSheetUids(ss) {
  var out = [];
  Object.keys(TR_SHEETS).forEach(function (loc) { var sh = ss.getSheetByName(TR_SHEETS[loc]); if (!sh || sh.getLastRow() < TR_ROW0) return; sh.getRange(TR_ROW0, TR_P0 + CI.uid, sh.getLastRow() - TR_ROW0 + 1, 1).getValues().forEach(function (r) { if (r[0]) out.push(String(r[0])); }); });
  return out;
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
  sh.getRange('A2').setValue(T.ruleShort).setNote(T.rule).setFontColor('#666666').setWrap(true).setVerticalAlignment('top'); // kurz in der Zelle, alles als Notiz (Ruben 07.09.)
  sh.getRange('A2:Z2').merge(); sh.setRowHeight(2, 48);
  sh.getRange(4, 1, 1, TR_DAY_N).setValues([T.dHead]).setNotes([T.dNotes]).setFontWeight('bold').setBackground('#e8eaed');
  sh.getRange(4, TR_P0, 1, TR_NCOL).setValues([T.head]).setNotes([T.notes]).setFontWeight('bold').setBackground('#f3f3f3');
  sh.setFrozenRows(4); // keine fixierten Spalten: A2:Z2 ist verbunden, Google erlaubt das Einfrieren dann nicht
  [95, 110, 110, 95, 60, 75, 70].forEach(function (w, i) { sh.setColumnWidth(1 + i, w); });
  [95, 200, 150, 200, 150, 150, 170, 170, 330, 95, 95, 150, 220, 150, 50, 110, 90, 160, 100].forEach(function (w, i) { sh.setColumnWidth(TR_P0 + i, w); });
  sh.hideColumns(TR_P0 + CI.uid, 2); // UID und NS sind nur Schluessel (Ruben 04.09.)
  trProtect(sh, TR_ACCESS[loc] || [], 'Nur Ruben und ' + (TR_ACCESS[loc] || []).join(', '));
  ss.setActiveSheet(sh); ss.moveActiveSheet(loc === 'Zurich' ? 1 : 2); // Events-Spiegel kommt ans Ende
}
function trUpsert(ss, loc, rows, sales, payopen, start, today, leadMap, cidMap) {
  var T = trT(loc), sh = getOrCreate(ss, TR_SHEETS[loc]);
  // erst die bisherigen Zeilen lesen (Anrufe, Kopien), dann bei geaenderter Kopfzeile neu aufbauen - so ueberleben die Handeingaben den Umbau
  var n = Math.max(0, sh.getLastRow() - TR_ROW0 + 1);
  var old = n ? sh.getRange(TR_ROW0, TR_P0, n, TR_NCOL).getValues() : [];
  var oldDays = n ? sh.getRange(TR_ROW0, 1, n, TR_DAY_N).getValues() : [];
  if (sh.getLastRow() < 4 || sh.getRange(4, TR_P0, 1, TR_NCOL).getValues()[0].join('|') !== T.head.join('|') || sh.getRange(4, 1, 1, TR_DAY_N).getValues()[0].join('|') !== T.dHead.join('|') || String(sh.getRange('A2').getValue()) !== T.ruleShort) { trInit(ss, sh, loc); n = 0; }
  // alte Dropdown-Regeln (Spalte "Gespraech" des fruehen Layouts) liegen noch auf Zellen unterhalb der Daten und blockierten am
  // 06.09. das Schreiben ("cell J172 violates the data validation rules"): vor jedem Schreiben alle Validierungen im Block loeschen
  sh.getRange(TR_ROW0, 1, Math.max(1, sh.getMaxRows() - TR_ROW0 + 1), sh.getMaxColumns()).clearDataValidations();
  var calls = {}; oldDays.forEach(function (r) { var d = dOfCell(r[DI.day]); if (d && (r[DI.att] !== '' || r[DI.conv] !== '')) calls[d] = [r[DI.att], r[DI.conv]]; });
  // Kopien mit gleicher UID und anderem Namen (zweites Kind, von Hand kopiert) bleiben erhalten
  var byUid = {}, extras = {};
  old.forEach(function (r) { var u = String(r[CI.uid] || ''); if (!u) return; if (!byUid[u]) byUid[u] = r; else if (String(r[CI.name]) !== String(byUid[u][CI.name])) (extras[u] = extras[u] || []).push(String(r[CI.name])); });
  var stamp = Utilities.formatDate(new Date(), TZ, 'dd.MM. HH:mm');
  var toDate = function (s) { return s ? new Date(s + 'T12:00:00') : ''; };
  var noteTxt = function (nt) { return nt && nt.date ? nt.date.slice(8, 10) + '.' + nt.date.slice(5, 7) + '.' + nt.date.slice(0, 4) + (nt.type ? ' ' + nt.type : '') : ''; };
  var crm = function (uid, name) { return trCrmLink(cidMap, uid, name); }; // Profilnummer statt Report-User-ID (Ruben 08.09.: Links liefen ins Leere)
  var seen = {};
  rows.forEach(function (x) {
    var o = byUid[x.uid], s = x.sale || {}, lead = leadMap ? trFindLead(leadMap, x.email, x.name, x.date) : null, r = [];
    r[CI.date] = toDate(x.date); r[CI.name] = x.name; r[CI.art] = trL(loc, 'art', x.art); r[CI.cls] = x.noVisit ? T.noVisit : (x.time ? String(x.time).slice(0, 5) + ' ' : '') + (x.cls || ''); // Uhrzeit vor der Klasse (Ruben 07.09.) r[CI.coach] = x.trainer || ''; r[CI.booked] = x.bookedBy || '';
    r[CI.kanal] = trL(loc, 'kanal', lead ? lead.kanal : 'kein Web-Lead'); r.srcNote = !lead && x.source ? 'Quelle in exercise.com: ' + String(x.source).replace(/^\s*-\s*/, '') : ''; // Quelle als Notiz statt im Text (Ruben 07.09.)
    r[CI.lifecycle] = x.lifecycle || (o ? o[CI.lifecycle] : ''); r[CI.check] = '';
    r[CI.contract] = toDate(s.date); r[CI.start] = toDate(s.start); r[CI.seller] = s.by || ''; r[CI.pkg] = s.pkg || '';
    r[CI.note] = x.lastNote ? noteTxt(x.lastNote) : (o ? o[CI.note] : ''); r[CI.crm] = crm(x.uid, x.name);
    r[CI.created] = toDate((x.bk && x.bk.length ? x.bk[x.bk.length - 1] : x.bookedAt) || ''); r[CI.uid] = String(x.uid);
    r[CI.ns] = (x.ns || []).join(','); r[CI.stamp] = stamp;
    byUid[x.uid] = r; seen[x.uid] = true;
  });
  Object.keys(sales).forEach(function (uid) { var o = byUid[uid]; if (!o || seen[uid]) return; var s = sales[uid] || {}; o[CI.contract] = toDate(s.date); o[CI.start] = toDate(s.start); o[CI.seller] = s.by || ''; o[CI.pkg] = s.pkg || ''; o[CI.stamp] = stamp; });
  var all = Object.keys(byUid).map(function (k) { return byUid[k]; });
  Object.keys(extras).forEach(function (u) { var base = byUid[u]; if (!base) return; extras[u].forEach(function (nm) { var c = base.slice(); c[CI.name] = nm; all.push(c); }); });
  all.forEach(function (r) { r[CI.check] = trCheck(r, today, T); r[CI.crm] = crm(r[CI.uid], r[CI.name]); if (/^(ohne Website-Lead|no website lead)/.test(String(r[CI.kanal] || ''))) r[CI.kanal] = trL(loc, 'kanal', 'kein Web-Lead'); }); // alte Beschriftung angleichen
  // Tageswerte: Trials, No-Shows (aus den NS-Daten, nicht aus der Art), Verkauft (Vertragstag), Placed Trials (Buchungstag)
  var day = {}, D = function (d) { return day[d] = day[d] || { placed: 0, trials: 0, ns: 0, sold: 0 }; };
  var byDate = {};
  all.forEach(function (r) {
    var d = dOfCell(r[CI.date]); if (!d) return;
    (byDate[d] = byDate[d] || []).push(r);
    if (trNoTrial(r)) return;
    var p = trPers(r), c = dOfCell(r[CI.contract]), b = dOfCell(r[CI.created]);
    if (trIsTrial(r)) D(d).trials += p;
    if (c) D(c).sold += p; // Verkauf zaehlt am Tag der Paket-Aktivierung, auch bei Gebucht/No-Show (Ruben 08.09.)
    if (b) D(b).placed += 1;
    trNsDates(r).forEach(function (x) { D(x).ns += 1; });
  });
  // Datumsliste: Fenster, alle Personentage, alle Tage mit Anrufen; neueste zuerst
  var dates = {}, d0 = addDs(today, 14);
  for (var dd = d0; dd >= start; dd = addDs(dd, -1)) dates[dd] = 1;
  Object.keys(byDate).forEach(function (k) { dates[k] = 1; }); Object.keys(calls).forEach(function (k) { dates[k] = 1; }); Object.keys(day).forEach(function (k) { dates[k] = 1; });
  var order = Object.keys(dates).sort().reverse();
  var dayOut = [], perOut = [], notes = [], kNotes = [];
  order.forEach(function (d) {
    var tOf = function (x) { var m = String(x[CI.cls] || '').match(/^(\d{2}):(\d{2})/); return m ? m[1] + m[2] : '9999'; }; // Personen des Tages nach Trainingszeit, frueheste zuerst (Ruben 07.09.)
    var ppl = (byDate[d] || []).sort(function (a, b) { var ta = tOf(a), tb = tOf(b); return ta < tb ? -1 : ta > tb ? 1 : String(a[CI.name]).localeCompare(String(b[CI.name])); });
    var v = day[d] || { placed: 0, trials: 0, ns: 0, sold: 0 }, c = calls[d] || ['', ''];
    var lines = Math.max(1, ppl.length), fut = d > today; // kuenftige Tage ohne Nullen (Ruben 07.09.)
    for (var i = 0; i < lines; i++) {
      dayOut.push(i === 0 ? [toDate(d), c[0], c[1], fut ? '' : v.placed, fut ? '' : v.trials, fut ? '' : v.ns, fut ? '' : v.sold] : ['', '', '', '', '', '', '']);
      var r = ppl[i] || [];
      var row = []; for (var k = 0; k < TR_NCOL; k++) row[k] = (r[k] === undefined || r[k] === null) ? '' : r[k];
      perOut.push(row);
      var ns = r.length ? trNsDates(r) : [], art = r.length ? trC(r[CI.art]) : '';
      notes.push([(ns.length && art !== 'No-Show') ? T.nsNote.replace('{ns}', ns.map(deD).join(', ')).replace('{d}', deD(dOfCell(r[CI.date]))) : '']);
      kNotes.push([r.srcNote || '']);
    }
  });
  var oldRows = Math.max(n, 1);
  sh.getRange(TR_ROW0, 1, oldRows, TR_DAY_N + TR_NCOL + TR_P0 - 1).clearContent().clearNote().setBackground(null);
  if (dayOut.length) {
    sh.getRange(TR_ROW0, 1, dayOut.length, TR_DAY_N).setValues(dayOut);
    // Wochentag in der Sprache des Tabs (Zahlenformat mit Text, der Wert bleibt ein Datum)
    var WD = TR_LANG[loc] === 'de' ? ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    sh.getRange(TR_ROW0, 1, dayOut.length, 1).setNumberFormats(dayOut.map(function (row) { var d = row[0]; return [d instanceof Date ? '"' + WD[d.getDay()] + ' "dd.MM.' : 'dd.MM.']; }));
    sh.getRange(TR_ROW0, DI.att + 1, dayOut.length, 2).setBackground('#fff8e1');
    sh.getRange(TR_ROW0, TR_P0, perOut.length, TR_NCOL).setValues(perOut);
    sh.getRange(TR_ROW0, TR_P0 + CI.art, perOut.length, 1).setNotes(notes);
    sh.getRange(TR_ROW0, TR_P0 + CI.kanal, perOut.length, 1).setNotes(kNotes);
    [CI.date, CI.contract, CI.start, CI.created].forEach(function (c) { sh.getRange(TR_ROW0, TR_P0 + c, perOut.length, 1).setNumberFormat('dd.MM.yyyy'); });
    sh.getRange(TR_ROW0, TR_P0 + CI.uid, perOut.length, 2).setNumberFormat('@');
    sh.getRange(TR_ROW0, TR_P0 + CI.check, perOut.length, 1).setWrap(true);
  }
  trFormat(sh, dayOut.length, loc);
  var nChk = all.filter(function (r) { return !!r[CI.check]; }).length;
  return trLocDE(loc) + ': ' + all.length + ' Personen, ' + dayOut.length + ' Zeilen, zu pruefen ' + nChk + ', Zahlung offen ' + payopen.length;
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
  if (dst.getIndex() !== team.getNumSheets()) { team.setActiveSheet(dst); team.moveActiveSheet(team.getNumSheets()); } // ans Ende (Ruben 07.09.)
}
// Freigabe des Team-Sheets erst nach der Einfuehrung (Ruben 06.09.: noch nichts im Team gezeigt). Solange TEAM_SHARED false ist,
// nimmt teamShare() die Freigaben fuer Abdi, Bogdan und support weg (Stundenlauf prueft die Marke einmal je Wert).
var TEAM_SHARED = false;
function teamShare() {
  var f = DriveApp.getFileById(TEAM_ID), have = {};
  f.getEditors().forEach(function (u) { have[u.getEmail()] = 'e'; }); f.getViewers().forEach(function (u) { have[u.getEmail()] = have[u.getEmail()] || 'v'; });
  if (!TEAM_SHARED) {
    var gone = [];
    [MAIL.zh, MAIL.wt].concat(TEAM_VIEWERS).forEach(function (e) { if (have[e] === 'e') { f.removeEditor(e); gone.push(e); } else if (have[e] === 'v') { f.removeViewer(e); gone.push(e); } });
    return 'Team-Sheet nicht geteilt (TEAM_SHARED = false); Freigaben entfernt: ' + (gone.join(', ') || 'keine');
  }
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
    lines.push(''); lines.push(T.mail.month.replace('{t}', cnt(mv, trIsTrial)).replace('{s}', cnt(mv, trSold)).replace('{c}', chk.length));
    lines.push(''); lines.push('Stand (letzter erfolgreicher Lauf): ' + trLastOkText());
    lines.push('https://docs.google.com/spreadsheets/d/' + TEAM_ID);
    var to = TR_MAIL_TEAM ? (TR_ACCESS[loc] || [MAIL.fallback]).join(',') : MAIL.fallback;
    var msg = { to: to, subject: T.mail.subject.replace('{d}', deD(today) + today.slice(0, 4)), body: lines.join('\n') };
    if (TR_MAIL_TEAM) msg.cc = MAIL.fallback;
    MailApp.sendEmail(msg);
  });
  try { payDailyMail(); } catch (e) { Logger.log('Open payments Mail: ' + e); }
}
// ------------------------------------------------------------ Open Payments (06.09.2026, Entscheid Ruben): eigenes Sheet fuers Geld
// eintreiben (Waseem + weitere, nicht Abdi/Bogdan). Beide Standorte in einem Tab, aelteste zuerst, stuendlich aus den Trials-Daten
// (Stage "Signed but no payment"). Die Datei wird beim ersten Lauf angelegt (ID in den Script Properties) und liegt im Team-Ordner.
var PAY_SHEET = 'Open payments', PAY_HEAD = ['Name', 'Location', 'Signed since', 'Days open', 'Lifecycle stage', 'Last note', 'CRM', 'Updated'];
var PAY_ACCESS = []; // E-Mails der Bearbeiter (traegt Ruben nach) - bekommen Schreibrecht und die Tagesmail
function paySs() {
  var pr = PropertiesService.getScriptProperties(), id = pr.getProperty('payId');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) { Logger.log('Open Payments neu anlegen: ' + e); } }
  var ss = SpreadsheetApp.create('IMPACT Open Payments');
  try { var f = DriveApp.getFileById(ss.getId()), parents = DriveApp.getFileById(TEAM_ID).getParents(); if (parents.hasNext()) { var folder = parents.next(); folder.addFile(f); DriveApp.getRootFolder().removeFile(f); } } catch (e2) { Logger.log('Open Payments Ordner: ' + e2); }
  pr.setProperty('payId', ss.getId());
  return ss;
}
function payWrite(payopen, today, cidMap) {
  var ss = paySs(), sh = ss.getSheets()[0]; if (sh.getName() !== PAY_SHEET) sh.setName(PAY_SHEET);
  clearSheet(sh);
  if (PAY_ACCESS.length) { try { ss.addEditors(PAY_ACCESS); } catch (e) { Logger.log('Open Payments Freigabe: ' + e); } }
  sh.getRange('A1').setValue('IMPACT Open Payments').setFontSize(16).setFontWeight('bold');
  sh.getRange('A2').setValue('People with the lifecycle stage "Signed but no payment" in exercise.com (contract signed, no payment method yet), both locations, oldest first. Updated hourly 09-22 from exercise.com; rows turn red after 30 days. When the payment is in, set the stage to "Client" in exercise.com and the row disappears with the next run. Notes belong in exercise.com (CRM link), not here.').setFontColor('#666666').setWrap(true);
  sh.getRange('A2:H2').merge(); sh.setRowHeight(2, 64);
  sh.getRange(4, 1, 1, PAY_HEAD.length).setValues([PAY_HEAD]).setFontWeight('bold').setBackground('#fde8d5');
  var list = []; ['Zurich', 'Winterthur'].forEach(function (loc) { (payopen[loc] || []).forEach(function (x) { list.push(Object.assign({ loc: loc }, x)); }); });
  list.sort(function (a, b) { return (a.since || '') < (b.since || '') ? -1 : 1; });
  var stamp = Utilities.formatDate(new Date(), TZ, 'dd.MM. HH:mm');
  var rows = list.map(function (x) {
    var age = x.since ? Math.round((new Date(today + 'T12:00:00') - new Date(x.since + 'T12:00:00')) / 864e5) : '';
    var nt = x.note && x.note.date ? x.note.date.slice(8, 10) + '.' + x.note.date.slice(5, 7) + '.' + (x.note.type ? ' ' + x.note.type : '') : '';
    return [x.name, trLocDE(x.loc), x.since ? new Date(x.since + 'T12:00:00') : '', age, x.stage || LC_PAY_OPEN, nt, trCrmLink(cidMap, x.uid, x.name), stamp];
  });
  if (rows.length) { sh.getRange(5, 1, rows.length, PAY_HEAD.length).setValues(rows); sh.getRange(5, 3, rows.length, 1).setNumberFormat('dd.MM.yyyy'); for (var i = 0; i < rows.length; i++) if (Number(rows[i][3]) >= 30) sh.getRange(5 + i, 1, 1, PAY_HEAD.length).setBackground('#fce4e4'); }
  else sh.getRange(5, 1).setValue('none').setFontColor('#999999');
  sh.setFrozenRows(4); [220, 95, 100, 80, 190, 200, 50, 100].forEach(function (w, i) { sh.setColumnWidth(1 + i, w); });
  return rows.length;
}
function payDailyMail() {
  var ss = paySs(), sh = ss.getSheetByName(PAY_SHEET); if (!sh || sh.getLastRow() < 5) return;
  var v = sh.getRange(5, 1, sh.getLastRow() - 4, PAY_HEAD.length).getValues().filter(function (r) { return r[0] && r[0] !== 'none' && Number(r[3]) >= TR_PAY_DAYS; });
  var lines = ['Signed, but no payment for ' + TR_PAY_DAYS + '+ days: ' + v.length, ''];
  v.forEach(function (r) { lines.push('  - ' + r[0] + ' (' + r[1] + '): ' + r[3] + ' days'); });
  lines.push('', 'https://docs.google.com/spreadsheets/d/' + ss.getId());
  MailApp.sendEmail({ to: [MAIL.fallback].concat(PAY_ACCESS).join(','), subject: '[Open payments] ' + Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy'), body: lines.join('\n') });
}
function runProbetrainingsHourly() {
  var h = Number(Utilities.formatDate(new Date(), TZ, 'H')); if (h < 9 || h > 22) return;
  try { var pr = PropertiesService.getScriptProperties(); if (pr.getProperty('trTrigVer') !== TR_TRIG_VER) { installTrialTriggers(); pr.setProperty('trTrigVer', TR_TRIG_VER); } } catch (e0) { Logger.log('Trigger-Update: ' + e0); }
  try { var pr1 = PropertiesService.getScriptProperties(); if (pr1.getProperty('teamShareVer') !== String(TEAM_SHARED)) { Logger.log(teamShare()); pr1.setProperty('teamShareVer', String(TEAM_SHARED)); } } catch (e3) { Logger.log('Team-Freigabe: ' + e3); }
  try { maQueueCatchUp(); } catch (e1) { Logger.log('Monats-Nachlauf: ' + e1); }
  try { ltvQueueInit(); } catch (e2) { Logger.log('LTV-Nachladen: ' + e2); }
  try { runProbetrainings(); }
  catch (e) {
    Logger.log('Probetrainings Fehler (1. Versuch): ' + e);
    try { Utilities.sleep(30000); runProbetrainings(); Logger.log('Probetrainings: 2. Versuch ok'); }
    catch (e2) { Logger.log('Probetrainings Fehler (2. Versuch): ' + e2); mailOnce('probetrainings', '[Team] Probetrainings FEHLGESCHLAGEN', String(e2 && e2.stack ? e2.stack : e2) + '\n\nZeit: ' + Utilities.formatDate(new Date(), TZ, 'dd.MM. HH:mm') + '\n\n' + trStaleText()); }
  }
  trStaleAlarm();
}
function trLastOkText() { // "07.09. 12:04" oder "nie"
  var t = Number(PropertiesService.getScriptProperties().getProperty('trLastOk') || 0);
  return t ? Utilities.formatDate(new Date(t), TZ, 'dd.MM. HH:mm') : 'nie';
}
function trStaleText() { return 'Letzter erfolgreicher Probetrainings-Lauf: ' + trLastOkText() + '. Bis dahin ist das Team-Sheet vollstaendig; der naechste erfolgreiche Lauf holt alle Buchungen der letzten 33 Tage nach (nichts geht verloren).'; }
function trStaleAlarm() { // kein erfolgreicher Lauf seit > 3 h innerhalb 10-22 Uhr -> Alarm (einmal je Tag und Stand)
  try {
    var h = Number(Utilities.formatDate(new Date(), TZ, 'H')); if (h < 12 || h > 22) return;
    var t = Number(PropertiesService.getScriptProperties().getProperty('trLastOk') || 0);
    if (t && Date.now() - t < 3 * 3600 * 1000) return;
    mailOnce('trStale', '[Team] Probetrainings seit ' + (t ? Math.round((Date.now() - t) / 3600000) + ' h' : 'unbekannt') + ' nicht aktualisiert', trStaleText() + '\n\nBitte Ruben/Claude informieren, wenn das laenger als einen halben Tag anhaelt.');
  } catch (e) { Logger.log('Stale-Alarm: ' + e); }
}
function installTrialTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (['runProbetrainingsHourly', 'trDailyMail', 'runWerbekostenDaily', 'runLTVMonthly', 'runMonatsabschlussDaily'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('runProbetrainingsHourly').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('trDailyMail').timeBased().atHour(12).nearMinute(0).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('runWerbekostenDaily').timeBased().atHour(6).nearMinute(30).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('runLTVMonthly').timeBased().onMonthDay(1).atHour(5).inTimezone(TZ).create();
  ScriptApp.newTrigger('runMonatsabschlussDaily').timeBased().atHour(4).nearMinute(30).everyDays(1).inTimezone(TZ).create(); // laufender Monat + Finanzplan-Uebertrag (07.09.)
  Logger.log('Trigger installiert: runProbetrainingsHourly (stuendlich, 09-22), trDailyMail (12:00), runWerbekostenDaily (06:30)');
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

// ---------------------------------------------------------------- Monatsabschluss-Bau in eigener Ausfuehrung (Laufzeit) und Tageslauf
function maScheduleBuild() { // vom Stundenlauf: Wochenwerte stehen im Monatsabschluss, der Bau laeuft eine Minute spaeter in eigener Ausfuehrung
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'runMonatsabschlussBuild') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('runMonatsabschlussBuild').timeBased().after(60 * 1000).create();
}
function runMonatsabschlussBuild() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'runMonatsabschlussBuild') ScriptApp.deleteTrigger(t); });
  try { buildMonatsabschluss(SpreadsheetApp.openById(SHEET_ID)); } catch (e) { mailOnce('mabuild', '[Sheet] Monatsabschluss-Bau FEHLGESCHLAGEN', String(e && e.stack ? e.stack : e)); }
}
function runMonatsabschlussDaily() { // 04:30: laufender Monat neu aus exercise.com, dann Uebertrag in den Finanzplan (auch die laufenden Zahlen, Ruben 07.09.2026)
  var now = new Date(), start = fmtD(new Date(now.getFullYear(), now.getMonth(), 1));
  try { runMonatsabschluss(start, fmtD(now)); } catch (e) { mailOnce('madaily', '[Sheet] Monatsabschluss laufender Monat FEHLGESCHLAGEN', String(e && e.stack ? e.stack : e)); }
  try { fpTransfer(); } catch (e2) { mailOnce('fp', '[Sheet] Finanzplan-Uebertrag FEHLGESCHLAGEN', String(e2 && e2.stack ? e2.stack : e2)); }
}
// ---------------------------------------------------------------- Finanzplan-Uebertrag (Ruben 07.09.2026): Ist-Zahlen in die Monatsspalten des Finanzplans
// Schreibt je Standort in den Tab des Finanzplans (Zeile per Bezeichnung, Spalte per Monatskopf "M.yyyy") die Ist-Werte ab FP_FROM bis zum
// laufenden Monat. Nie ueber Formeln, nur in leere oder Zahlenzellen; jede Aenderung steht im Tab "Finanzplan-Übertrag" in Analytics (alt/neu).
var FP_ID = '1vBD3eIxE5huSL8k_s0ky--fVbhe_ugJkQD51RB6zxUw'; // KOPIE des Finanzplans zum Testen (Ruben 07.09.2026). Original 1RJ1UoQuiDBc52kNgRn3l5DfopAErSxsnI0X68vzvi60 erst nach Freigabe.
var FP_TABS = { Zurich: 'IMP ZH', Winterthur: 'IMP WIN' }, FP_FROM = '2026-06', FP_LOG = 'Finanzplan-Übertrag';
var FP_ROWS = [ // [Zeilenbezeichnung im Plan (Anfang, Spalten A-E), Kennzahl, Beschreibung]
  [/^Anzahl Leads/i, 'leads_all', 'Neue Kontakte in exercise.com (alle Wege)'],
  [/^Anzahl Trials/i, 'trial_attended', 'Probetrainings durchgeführt (Erstbesucher mit Check-in)'],
  [/^Neue Verk/i, 'new_customers', 'Verkäufe = erstes Abo-Paket aktiviert (Abo-Start oder Rechnungspaket), ohne Paketwechsel und Personal Training'],
  [/^K.ndigungen/i, 'losses', 'Verluste: wirksame Kündigungen plus Debt collection (ohne Paketwechsel)'],
  [/^Sold Gear through Exercise/i, 'rev_gear_gross', 'Gear brutto (Sales by Category)'],
  [/Total Sales from Bank/i, 'cash_total', 'Alle Gutschriften laut Kontoauszug (Tab Bank)']
];
var FP_NOTE = 'Der Tageslauf (04:30) und der Monatslauf (1. des Monats) schreiben die Ist-Zahlen in die Kopie des Finanzplans (Tabs IMP ZH und IMP WIN), ab Juni 2026 bis zum laufenden Monat: '
  + 'Anzahl Leads = neue Kontakte in exercise.com (alle Wege); Anzahl Trials = durchgeführte Probetrainings (Ruben 07.09.); Neue Verkäufe = Abo-Starts ohne Paketwechsel; Kündigungen = Verluste, also wirksame Kündigungen plus Debt collection, ohne Paketwechsel (Ruben 07.09.); Sold Gear = Gear brutto; Total Sales from Bank = alle Gutschriften laut Tab Bank (Entscheide Ruben 07.09.2026). '
  + 'Die Spalte wird über den Monatskopf (z. B. "9.2026") gefunden, die Zeile über ihre Bezeichnung. In diesen Eingabezeilen werden ab Juni 2026 bis zum laufenden Monat auch Planformeln durch die Ist-Zahl ersetzt (Ruben 08.09.), die alte Formel steht im Protokoll; ab dem Folgemonat bleibt alles unberührt. '
  + 'Starterpakete, Personal Training und Kundenwert werden nicht übertragen: der Plan führt sie je Typ (Bronze, Silber, ...) bzw. als Formel. Jede geänderte Zelle steht mit altem und neuem Wert in diesem Tab.';
function fpValues(ss) { // Kennzahl je Monat und Standort aus der MonatsHistorie und dem Tab Bank
  var hs = ss.getSheetByName(MA_HIST), val = {}, num = function (v) { return v === '' || v === null || v === undefined ? 0 : Number(v); };
  if (hs && hs.getLastRow() > 1) hs.getRange(2, 1, hs.getLastRow() - 1, 4).getValues().forEach(function (r) { val[mkOf(r[0]) + '|' + r[1] + '|' + r[2]] = r[3]; });
  var bank = bankRead(ss);
  return function (mk, loc, key) {
    var v = function (k) { var x = val[mk + '|' + loc + '|' + k]; return x === undefined || x === '' ? null : Number(x); };
    if (key === 'losses') { var kc = v('cancellations'), kd = v('debt_collection'); return kc === null && kd === null ? null : (kc || 0) + (kd || 0); }
    if (key === 'cash_total') { var b = bank[mk + '|' + loc]; if (!b || b.stripe === '') return null; return Math.round(num(b.stripe) + num(b.adyen) + num(b.customers) + num(b.other)); }
    return v(key);
  };
}
function fpTransfer() {
  var ss = SpreadsheetApp.openById(SHEET_ID), plan = SpreadsheetApp.openById(FP_ID), get = fpValues(ss), cur = monthKeyStr(new Date()), log = [], n = 0;
  Object.keys(FP_TABS).forEach(function (loc) {
    var sh = plan.getSheetByName(FP_TABS[loc]); if (!sh) { log.push([new Date(), FP_TABS[loc], '', '', 'Tab nicht gefunden', '', '']); return; }
    var w = sh.getLastColumn(), head = sh.getRange(1, 1, 1, w).getValues()[0], disp = sh.getRange(1, 1, 1, w).getDisplayValues()[0], colOfMk = {};
    head.forEach(function (h, i) {
      var mk = ''; if (h instanceof Date) mk = monthKeyStr(h); else { var m = String(disp[i] || '').match(/(\d{1,2})\.(\d{4})/); if (m) mk = m[2] + '-' + ('0' + m[1]).slice(-2); }
      if (mk && !colOfMk[mk]) colOfMk[mk] = i + 1;
    });
    var labels = sh.getRange(1, 1, sh.getLastRow(), 5).getValues(), rowOf = {};
    FP_ROWS.forEach(function (fr) { for (var i = 0; i < labels.length && !rowOf[fr[1]]; i++) for (var j = 0; j < 5; j++) if (fr[0].test(String(labels[i][j] || '').trim())) { rowOf[fr[1]] = i + 1; break; } });
    for (var mk = FP_FROM; mk <= cur; mk = nextMonth(mk)) {
      var col = colOfMk[mk]; if (!col) continue;
      FP_ROWS.forEach(function (fr) {
        var row = rowOf[fr[1]]; if (!row) return;
        var v = get(mk, loc, fr[1]); if (v === null) return;
        var cell = sh.getRange(row, col), f = cell.getFormula(), old = f ? f : cell.getValue(); // Eingabezeilen: ab FP_FROM bis zum laufenden Monat auch Planformeln ersetzen (Ruben 08.09.), alte Formel steht im Protokoll
        if (!f && old !== '' && old !== null && Math.abs(Number(old) - v) < 2) return; // Rundungsdifferenzen (Bank +-1 CHF) nicht als Aenderung
        cell.setValue(v); n++;
        log.push([new Date(), FP_TABS[loc], cell.getA1Notation(), mk, fr[2], old, v]);
      });
    }
  });
  fpLog(ss, log);
  Logger.log('Finanzplan-Uebertrag: ' + n + ' Zellen geschrieben');
  return n;
}
function fpLog(ss, rows) {
  var sh = getOrCreate(ss, FP_LOG), head = ['Zeitpunkt', 'Tab im Finanzplan', 'Zelle', 'Monat', 'Kennzahl', 'alt', 'neu'];
  if (sh.getLastRow() === 0) { sh.appendRow(head); sh.getRange(1, 1, 1, head.length).setFontWeight('bold'); sh.setFrozenRows(1); sh.setColumnWidth(1, 130); sh.setColumnWidth(2, 130); sh.setColumnWidth(5, 340); sh.getRange('A1').setNote(FP_NOTE); }
  if (rows.length) { sh.getRange(sh.getLastRow() + 1, 1, rows.length, head.length).setValues(rows); sh.getRange(2, 1, sh.getLastRow() - 1, 1).setNumberFormat('dd.MM.yyyy HH:mm'); sh.getRange(2, 4, sh.getLastRow() - 1, 1).setNumberFormat('@'); }
  var max = 1000; if (sh.getLastRow() > max + 1) sh.deleteRows(2, sh.getLastRow() - max - 1);
}
