// IMPACT Website Lead Log - Google Apps Script (Webapp) - Version 6 (02.09.2026)
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

var LEAD_HEAD = ['Zeitpunkt', 'Status', 'Vorname', 'Nachname', 'E-Mail', 'Telefon', 'Standort', 'Interesse', 'Erfahrung', 'Kind', 'Kind-Alter', 'Nachricht', 'Quelle', 'Seite', 'gclid', 'fbclid', 'Referrer', 'Details', 'Technik', 'Ausschluss'];
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
    asText(d.source), s(d.page), s(d.gclid), s(d.fbclid), s(d.referrer), s(p.detail), s(p.tech), '']);
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
  var name = isEv ? 'Events' : 'Kündigungen';
  var head = isEv ? ['Zeitpunkt', 'Event', 'Datum', 'Standort', 'Name', 'E-Mail', 'Telefon', 'Freunde', 'Sprache', 'Seite', 'Event-ID']
                  : ['Zeitpunkt', 'Anonym', 'Vorname', 'Nachname', 'Grund', 'Erwartungen nicht erfüllt', 'Details Erwartungen', 'Zufriedenheit Trainer', 'Details Trainer', 'Pause/Timing', 'Details Timing', 'Preis Einfluss', 'Preis zum Bleiben', 'Preis maximal', 'Verbesserungen', 'Wiedereinstieg', 'Details Wiedereinstieg', 'Sprache'];
  var sh = ss.getSheetByName(name); if (!sh) { sh = ss.insertSheet(name); }
  if (sh.getLastRow() === 0) { sh.appendRow(head); sh.getRange(1, 1, 1, head.length).setFontWeight('bold'); sh.setFrozenRows(1); }
  var row = isEv ? [new Date(), s(d.event_title), s(d.event_date), s(d.location), asText(d.name), asText(d.email), asText(d.phone), s(d.friends), s(d.lang), s(d.page), s(d.event_id)]
                 : [new Date(), d.anonymous ? 'Ja' : 'Nein', asText(d.first_name), asText(d.last_name), asText(d.reason), s(d.expectations), asText(d.expectations_text), s(d.satisfaction), asText(d.satisfaction_text), s(d.timing), asText(d.timing_text), s(d.price), s(d.price_stay), s(d.price_max), asText(d.suggestions), s(d.rejoin), asText(d.rejoin_text), s(d.lang)];
  sh.appendRow(row);
  if (isEv) updateSignupCount(ss, d.event_id);
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
  buildHistorie(ss);
  buildDaten(ss);
  buildPlanDaten(ss);
  buildAnalyse(ss);
  buildPlanAnalyse(ss);
  // Leads: gclid, fbclid, Referrer, Technik, Ausschluss ausblenden (Entscheid Ruben 02.09.2026), Details bleibt sichtbar
  var ls = leadsSheet(ss);
  ls.hideColumns(15, 3); // O, P, Q
  ls.hideColumns(19, 2); // S, T
  // Klassenanalyse-Tab (wird vom Skill impact-class-analysis befuellt)
  var ka = ss.getSheetByName('Klassenanalyse');
  if (!ka) { ka = ss.insertSheet('Klassenanalyse'); ka.getRange('A1').setValue('Klassenanalyse: wird monatlich vom Skill impact-class-analysis aus den exercise.com-Reports befuellt (Popular Services + Itemized Recurring Sessions).').setFontColor('#666666'); }
  // Reihenfolge von Ruben (03.09.2026). Tab-Namen: Analyse, Trainingsplan-Analyse, Leads Historie duerfen umbenannt werden (dann hier nachziehen); Leads, Trainingsplan, Events, Kündigungen, Klassenanalyse und die Hilfstabs NIE umbenennen (Webapp schreibt per Name).
  var order = ['Monatsabschluss', 'Leads-Analyse', 'Klassenanalyse', 'Kündigungsrisiko', 'Trainingsplan', 'Events', 'Trainingsplan-Analyse', 'Kündigungen', 'Leads Historie', 'Leads', 'Daten', 'PlanDaten', 'KlassenHistorie', 'KlassenHistorieDisziplin', 'RisikoHistorie', 'MonatsHistorie', 'Kohorten'];
  var pos = 1;
  for (var i = 0; i < order.length; i++) { var sh = ss.getSheetByName(order[i]); if (sh) { ss.setActiveSheet(sh); ss.moveActiveSheet(pos); pos++; } }
  ss.setActiveSheet(ss.getSheetByName('Leads-Analyse'));
}
function getOrCreate(ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); }
function clearSheet(sh) { var f = sh.getFilter(); if (f) f.remove(); sh.clear(); var cs = sh.getCharts(); for (var i = 0; i < cs.length; i++) sh.removeChart(cs[i]); }

function buildHistorie(ss) {
  var sh = ss.getSheetByName('Historie') || getOrCreate(ss, 'Leads Historie'); if (sh.getName() === 'Historie') sh.setName('Leads Historie');
  if (sh.getLastRow() > 0) return; // manuelle Werte nie ueberschreiben
  sh.appendRow(['Monat', 'Zürich', 'Winterthur', 'Quelle']);
  for (var i = 0; i < HISTORY.length; i++) sh.appendRow([new Date(HISTORY[i][0] + 'T00:00:00'), HISTORY[i][1], HISTORY[i][2], 'manuell (Ruben, 02.09.2026)']);
  sh.getRange('A2:A').setNumberFormat('mmm yyyy');
  sh.getRange(1, 1, 1, 4).setFontWeight('bold'); sh.setFrozenRows(1);
}

// Daten: Hilfsspalten pro Lead-Zeile (Datum, Woche, Monat, Standort, Interesse, Test, Zaehlt, Dublette, Fehler)
function buildDaten(ss) {
  var sh = getOrCreate(ss, 'Daten'); clearSheet(sh);
  sh.appendRow(['Datum', 'Woche', 'Monat', 'Standort', 'Interesse', 'Test', 'Zählt', 'Dublette', 'Fehler']);
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
  sh.getRange('A2:C').setNumberFormat('dd.mm.yyyy');
  sh.getRange(1, 1, 1, 9).setFontWeight('bold'); sh.setFrozenRows(1); sh.hideSheet();
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

// Analyse: Kennzahlen, Wochen- und Monatstabelle, Diagramme
function buildAnalyse(ss) {
  var old = ss.getSheetByName('Analyse'); if (old && !ss.getSheetByName('Leads-Analyse')) old.setName('Leads-Analyse'); // umbenannt 03.09.2026 (Ruben)
  var sh = getOrCreate(ss, 'Leads-Analyse'); clearSheet(sh);
  var WEEKS = 16, MONTHS = 12;
  var pct = '0.0%';
  sh.getRange('A1').setValue('IMPACT Website Leads – Analyse').setFontSize(16).setFontWeight('bold');
  sh.getRange('A2').setValue('Leads = Status "ok" (neu im CRM), ohne Dubletten, Tests und Ausschluss-Markierungen (Spalte "Ausschluss" im Tab Leads mit x markieren). Dubletten = erneute Anfragen bestehender Kontakte. Woche = Montag bis Sonntag. Prozent = Vergleich der letzten abgeschlossenen Periode mit der davor. Monate vor September 2026 aus dem Tab Leads Historie (manuell gezaehlt). Wochen vor dem 31.08.2026 bleiben leer (Log-Start).').setFontColor('#666666').setWrap(true);
  sh.getRange('A2:R2').merge();

  // ---- Wochentabelle
  var wHead = 20, wFirst = wHead + 1, wLast = wHead + WEEKS; // Zeilen 21..36
  var head = ['Woche ab', 'bis', 'Status', 'Zürich', 'Winterthur', 'Total', 'Δ% Vorwoche', 'Dubletten'].concat(INTERESTS);
  sh.getRange(wHead - 1, 1).setValue('Leads pro Woche (letzte ' + WEEKS + ' Wochen)').setFontWeight('bold').setFontSize(12);
  sh.getRange(wHead, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#f3f3f3');
  for (var i = 0; i < WEEKS; i++) {
    var r = wFirst + i, off = WEEKS - 1 - i, pre = 'A' + r + '<DATE(2026,8,31)'; // vor Log-Start: leer statt 0
    var W = function (f) { return '=IF(' + pre + ',"",' + f + ')'; };
    sh.getRange(r, 1).setFormula('=TODAY()-WEEKDAY(TODAY(),2)+1-7*' + off);
    sh.getRange(r, 2).setFormula('=A' + r + '+6');
    sh.getRange(r, 3).setFormula(W('IF(B' + r + '>=TODAY(),"läuft noch","")'));
    sh.getRange(r, 4).setFormula(W('COUNTIFS(Daten!$B:$B,$A' + r + ',Daten!$D:$D,"Zürich",Daten!$G:$G,1)'));
    sh.getRange(r, 5).setFormula(W('COUNTIFS(Daten!$B:$B,$A' + r + ',Daten!$D:$D,"Winterthur",Daten!$G:$G,1)'));
    sh.getRange(r, 6).setFormula(W('COUNTIFS(Daten!$B:$B,$A' + r + ',Daten!$G:$G,1)'));
    sh.getRange(r, 7).setFormula(i === 0 ? '=""' : W('IF(C' + r + '="läuft noch","",IF(OR(F' + (r - 1) + '="",F' + (r - 1) + '=0),"",(F' + r + '-F' + (r - 1) + ')/F' + (r - 1) + '))'));
    sh.getRange(r, 8).setFormula(W('COUNTIFS(Daten!$B:$B,$A' + r + ',Daten!$H:$H,1)'));
    for (var k = 0; k < INTERESTS.length; k++) sh.getRange(r, 9 + k).setFormula(W('COUNTIFS(Daten!$B:$B,$A' + r + ',Daten!$E:$E,"' + INTERESTS[k] + '",Daten!$G:$G,1)'));
  }
  sh.getRange(wFirst, 1, WEEKS, 2).setNumberFormat('dd.mm.yyyy');
  sh.getRange(wFirst, 7, WEEKS, 1).setNumberFormat(pct);

  // ---- Monatstabelle
  var mHead = wLast + 4, mFirst = mHead + 1, mLast = mHead + MONTHS;
  var mhead = ['Monat', 'Status', 'Zürich', 'Winterthur', 'Total', 'Δ% Vormonat', 'Dubletten'].concat(INTERESTS);
  sh.getRange(mHead - 1, 1).setValue('Leads pro Monat (letzte ' + MONTHS + ' Monate, vor September 2026 aus Historie)').setFontWeight('bold').setFontSize(12);
  sh.getRange(mHead, 1, 1, mhead.length).setValues([mhead]).setFontWeight('bold').setBackground('#f3f3f3');
  var hist = 'A{r}<DATE(2026,9,1)';
  for (var j = 0; j < MONTHS; j++) {
    var r2 = mFirst + j, off2 = MONTHS - 1 - j, h = hist.replace('{r}', r2);
    sh.getRange(r2, 1).setFormula('=DATE(YEAR(TODAY()),MONTH(TODAY())-' + off2 + ',1)');
    sh.getRange(r2, 2).setFormula('=IF(A' + r2 + '>=DATE(YEAR(TODAY()),MONTH(TODAY()),1),"läuft noch","")');
    sh.getRange(r2, 3).setFormula('=IF(' + h + ',IFERROR(VLOOKUP(A' + r2 + ',\'Leads Historie\'!$A:$C,2,FALSE),""),COUNTIFS(Daten!$C:$C,$A' + r2 + ',Daten!$D:$D,"Zürich",Daten!$G:$G,1))');
    sh.getRange(r2, 4).setFormula('=IF(' + h + ',IFERROR(VLOOKUP(A' + r2 + ',\'Leads Historie\'!$A:$C,3,FALSE),""),COUNTIFS(Daten!$C:$C,$A' + r2 + ',Daten!$D:$D,"Winterthur",Daten!$G:$G,1))');
    sh.getRange(r2, 5).setFormula('=IF(AND(C' + r2 + '="",D' + r2 + '=""),"",N(C' + r2 + ')+N(D' + r2 + '))');
    sh.getRange(r2, 6).setFormula(j === 0 ? '=""' : '=IF(B' + r2 + '="läuft noch","",IF(OR(E' + (r2 - 1) + '="",E' + (r2 - 1) + '=0,E' + r2 + '=""),"",(E' + r2 + '-E' + (r2 - 1) + ')/E' + (r2 - 1) + '))');
    sh.getRange(r2, 7).setFormula('=IF(' + h + ',"",COUNTIFS(Daten!$C:$C,$A' + r2 + ',Daten!$H:$H,1))');
    for (var k2 = 0; k2 < INTERESTS.length; k2++) sh.getRange(r2, 8 + k2).setFormula('=IF(' + h + ',"",COUNTIFS(Daten!$C:$C,$A' + r2 + ',Daten!$E:$E,"' + INTERESTS[k2] + '",Daten!$G:$G,1))');
  }
  sh.getRange(mFirst, 1, MONTHS, 1).setNumberFormat('mmm yyyy');
  sh.getRange(mFirst, 6, MONTHS, 1).setNumberFormat(pct);

  // ---- Kennzahlen oben (beziehen sich auf die Tabellen)
  var cw = wLast, lw = wLast - 1, pw = wLast - 2, cm = mLast, lm = mLast - 1, pm = mLast - 2;
  sh.getRange(4, 1).setValue('Kennzahlen').setFontWeight('bold').setFontSize(12);
  sh.getRange(5, 1, 1, 5).setValues([['Zeitraum', 'Zürich', 'Winterthur', 'Total', 'Dubletten']]).setFontWeight('bold').setBackground('#f3f3f3');
  var rows = [
    ['Diese Woche (läuft noch)', cw, 'w'], ['Letzte Woche', lw, 'w'], ['Vorletzte Woche', pw, 'w'], ['Δ letzte vs. vorletzte Woche', null, 'wd'],
    ['Dieser Monat (läuft noch)', cm, 'm'], ['Letzter Monat', lm, 'm'], ['Vorletzter Monat', pm, 'm'], ['Δ letzter vs. vorletzter Monat', null, 'md']];
  for (var q = 0; q < rows.length; q++) {
    var rr = 6 + q; sh.getRange(rr, 1).setValue(rows[q][0]);
    if (rows[q][2] === 'w') { sh.getRange(rr, 2).setFormula('=D' + rows[q][1]); sh.getRange(rr, 3).setFormula('=E' + rows[q][1]); sh.getRange(rr, 4).setFormula('=F' + rows[q][1]); sh.getRange(rr, 5).setFormula('=H' + rows[q][1]); }
    if (rows[q][2] === 'm') { sh.getRange(rr, 2).setFormula('=C' + rows[q][1]); sh.getRange(rr, 3).setFormula('=D' + rows[q][1]); sh.getRange(rr, 4).setFormula('=E' + rows[q][1]); sh.getRange(rr, 5).setFormula('=G' + rows[q][1]); }
    if (rows[q][2] === 'wd' || rows[q][2] === 'md') {
      var a = rr - 2, b = rr - 1; // Zeilen "Letzte" und "Vorletzte"
      for (var c = 2; c <= 4; c++) { var L = String.fromCharCode(64 + c); sh.getRange(rr, c).setFormula('=IF(OR(' + L + b + '="",' + L + b + '=0),"",(' + L + a + '-' + L + b + ')/' + L + b + ')').setNumberFormat(pct); }
      sh.getRange(rr, 1, 1, 5).setFontWeight('bold');
    }
  }
  sh.getRange(6, 1, 8, 5).setBorder(true, true, true, true, true, true, '#dddddd', SpreadsheetApp.BorderStyle.SOLID);
  sh.setColumnWidth(1, 240); sh.setFrozenRows(0);

  // ---- Diagramme (rechts neben den Kennzahlen)
  var chartCol = 19; // Spalte S, rechts neben der breitesten Tabelle (A..Q), Diagramme untereinander
  sh.insertChart(sh.newChart().setChartType(Charts.ChartType.LINE).setNumHeaders(1)
    .addRange(sh.getRange(wHead, 1, WEEKS + 1, 1)).addRange(sh.getRange(wHead, 4, WEEKS + 1, 3))
    .setPosition(4, chartCol, 0, 0).setOption('title', 'Leads pro Woche').setOption('pointSize', 6).setOption('colors', ['#e2c210', '#1a73e8', '#9e9e9e']).setOption('width', 620).setOption('height', 300)
    .setOption('legend', { position: 'bottom' }).setOption('hAxis', { format: 'dd.MM' }).setOption('vAxis', { minValue: 0 }).build());
  sh.insertChart(sh.newChart().setChartType(Charts.ChartType.COLUMN).setNumHeaders(1)
    .addRange(sh.getRange(mHead, 1, MONTHS + 1, 1)).addRange(sh.getRange(mHead, 3, MONTHS + 1, 2))
    .setPosition(21, chartCol, 0, 0).setOption('title', 'Leads pro Monat (Zürich / Winterthur)').setOption('colors', ['#e2c210', '#1a73e8']).setOption('width', 620).setOption('height', 320)
    .setOption('legend', { position: 'bottom' }).setOption('hAxis', { format: 'MMM yyyy' }).setOption('vAxis', { minValue: 0 }).build());
  sh.insertChart(sh.newChart().setChartType(Charts.ChartType.COLUMN).setNumHeaders(1)
    .addRange(sh.getRange(mHead, 1, MONTHS + 1, 1)).addRange(sh.getRange(mHead, 8, MONTHS + 1, INTERESTS.length))
    .setPosition(39, chartCol, 0, 0).setOption('title', 'Leads pro Monat nach Interesse (ab September 2026)').setOption('isStacked', true).setOption('width', 620).setOption('height', 340)
    .setOption('legend', { position: 'bottom' }).setOption('hAxis', { format: 'MMM yyyy' }).setOption('vAxis', { minValue: 0 }).build());
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
var PLAN_COLS = ['ID','Website','Anmeldung','Freunde','Rewards','Titel','Text','Bild-URL','Anmeldungen'];
var PLAN_DROP = ['Titel EN','Text EN','Kurzort','Link']; // 03.09.: auf Rubens Wunsch entfernt, Ort kommt aus Location, Link aus Notes
var PLAN_RENAME = { 'Titel DE': 'Titel', 'Text DE': 'Text' };
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
  // Reihenfolge: Freunde direkt nach Anmeldung
  try {
    var ps0 = planSheet(sh); var c = ps0.col;
    if (c['Freunde'] && c['Anmeldung'] && c['Freunde'] !== c['Anmeldung'] + 1) {
      var dest = c['Anmeldung'] + 1; if (c['Freunde'] > dest) sh.moveColumns(sh.getRange(1, c['Freunde'], 1, 1), dest); else sh.moveColumns(sh.getRange(1, c['Freunde'], 1, 1), dest + 1);
      changed.push('move:Freunde');
    }
    SpreadsheetApp.flush();
  } catch (mv) { changed.push('move-fehler:' + mv); }
  // Bild-URL: Kopfzeile verlinkt auf den Drive-Ordner + Notiz mit Anleitung
  try {
    var ps1 = planSheet(sh); if (ps1.col['Bild-URL']) {
      var hc = sh.getRange(1, ps1.col['Bild-URL']); // Kopfzeile einer Google-"Tabelle": keine Formeln erlaubt, darum nur Notiz
      hc.setNote('EVENT-BILDER\nOrdner "' + IMG_FOLDER_NAME + '": ' + IMG_FOLDER_URL + '\n\nSo geht es: 1) Bild in den Ordner legen. 2) Rechtsklick auf die Datei > Freigeben > Link kopieren. 3) Link hier in die Zelle einfuegen.\nKeine Freigabe-Einstellung noetig, die Website holt das Bild selbst. Hochkant-Flyer werden komplett gezeigt.');
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
    ['Website', 'Anmeldung', 'Freunde', 'Rewards'].forEach(function (c) { if (need.indexOf(c) >= 0) sh.getRange(2, col[c], last - 1, 1).insertCheckboxes(); });
  }
  return { sh: sh, col: col };
}
function slugify(s) { return String(s || '').toLowerCase().replace(/[äöü]/g, function (c) { return { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue' }[c]; }).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); }
function fmtDate(d) { return (d instanceof Date && !isNaN(d)) ? Utilities.formatDate(d, 'Europe/Zurich', "yyyy-MM-dd'T'HH:mm") : ''; }
function ensureIds(ps) {
  var sh = ps.sh, col = ps.col, last = sh.getLastRow(); if (last < 2) return;
  var acts = sh.getRange(2, 1, last - 1, 3).getValues();
  var ids = sh.getRange(2, col['ID'], last - 1, 1).getValues();
  var changed = false;
  for (var i = 0; i < acts.length; i++) {
    if (String(ids[i][0] || '').trim() || !String(acts[i][0] || '').trim()) continue;
    var d = acts[i][2]; var ds = (d instanceof Date && !isNaN(d)) ? Utilities.formatDate(d, 'Europe/Zurich', 'yyyyMMdd') : 'tbd';
    ids[i][0] = 'ev-' + ds + '-' + slugify(acts[i][0]); changed = true;
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
    return m || c.filter(function (x) { return x.registration || x.friends || x.rewards; })[0] || c[c.length - 1]; });
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
    var type = String(r[1] || '').trim();
    if (!String(r[0] || '').trim() || !type || /company/i.test(type)) return;
    if (g(r, 'Website') !== true) return;
    var notes = String(r[7] || ''); var lm = notes.match(/https?:\/\/[^\s)]+/);
    out.push({ id: String(g(r, 'ID') || ''), tab: sh.getName(), activity: String(r[0]), type: type, start: fmtDate(r[2]), end: fmtDate(r[3]),
      location: String(r[4] || ''), owner: String(r[5] || ''), title: String(g(r, 'Titel') || g(r, 'Titel DE') || ''), text: String(g(r, 'Text') || g(r, 'Text DE') || ''),
      registration: g(r, 'Anmeldung') === true, friends: g(r, 'Freunde') === true, rewards: g(r, 'Rewards') === true,
      link: lm ? lm[0] : '', image: String(g(r, 'Bild-URL') || ''), signups: Number(g(r, 'Anmeldungen') || 0) });
  });
  return out;
}
function updateSignupCount(ss, eventId) {
  try {
    if (!eventId) return;
    var ev = ss.getSheetByName('Events'); if (!ev || ev.getLastRow() < 2) return;
    var head = ev.getRange(1, 1, 1, ev.getLastColumn()).getValues()[0].map(String);
    var idCol = 10; // Position von Event-ID in der Zeile aus logForm (11. Spalte)
    if (String(head[idCol] || '') !== 'Event-ID') { ev.getRange(1, idCol + 1).setValue('Event-ID').setFontWeight('bold'); var stray = head.indexOf('Event-ID'); if (stray >= 0 && stray !== idCol) ev.getRange(1, stray + 1).setValue(''); }
    var vals = ev.getRange(2, 1, ev.getLastRow() - 1, ev.getLastColumn()).getValues();
    var n = 0; vals.forEach(function (r) { if (String(r[idCol]) === String(eventId)) n++; });
    var yr = String(eventId).match(/^ev-(\d{4})/); var list = planSheets(); if (yr) list.sort(function (a, b) { return (String(a.sh.getName()).trim() === yr[1] ? -1 : 0) - (String(b.sh.getName()).trim() === yr[1] ? -1 : 0); });
    list.forEach(function (ps) { var last = ps.sh.getLastRow(); if (last < 2) return;
      var ids = ps.sh.getRange(2, ps.col['ID'], last - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) { if (String(ids[i][0]) === String(eventId)) {
        var link = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit#gid=' + ev.getSheetId();
        ps.sh.getRange(i + 2, ps.col['Anmeldungen']).setFormula('=HYPERLINK("' + link + '";' + n + ')'); return; } } });
  } catch (e) {}
}
function seedOpenDoors() {
  var ps = planSheet(); ensureIds(ps); var sh = ps.sh, col = ps.col, last = sh.getLastRow();
  var ids = sh.getRange(2, col['ID'], last - 1, 1).getValues(); var done = [];
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) !== 'ev-20260926-community-event-open-doors-zuerich') continue;
    var r = i + 2;
    sh.getRange(r, col['Website']).setValue(true); sh.getRange(r, col['Anmeldung']).setValue(true); sh.getRange(r, col['Rewards']).setValue(true);
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
function doGet(e) {
  var q = (e && e.parameter) || {};
  if (q.token !== TOKEN) return out({ error: 'unauthorized' });
  try {
    if (q.what === 'events') return out({ ok: true, events: readEvents() });
    if (q.what === 'seed') return out({ ok: true, rows: seedOpenDoors() });
    if (q.what === 'setup') { planSheets(); return out({ ok: true }); }
    if (q.what === 'image' && q.id) return out(driveImage(q.id));
    if (q.what === 'migrate') return out({ ok: true, changed: migratePlanSheet() });
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
  ['new_customers', 'Neukunden (Abos ohne Wechsel, ohne PT)', '0'],
  ['conv_simple', 'Quote Neukunden / Probetrainings im Monat', '0%'],
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
function buildMonatsabschluss(ss) {
  var sh = getOrCreate(ss, MA_SHEET); clearSheet(sh);
  var hist = ss.getSheetByName(MA_HIST), hv = hist && hist.getLastRow() > 1 ? hist.getRange(2, 1, hist.getLastRow() - 1, 4).getValues() : [];
  var months = {}; hv.forEach(function (r) { months[mkOf(r[0])] = 1; });
  var keys = Object.keys(months).sort().slice(-12);
  var val = {}; hv.forEach(function (r) { val[mkOf(r[0]) + '|' + r[1] + '|' + r[2]] = r[3]; });
  sh.getRange('A1').setValue('IMPACT Monatsabschluss').setFontSize(16).setFontWeight('bold');
  sh.getRange('A2').setValue('Automatisch am 1. des Monats aus exercise.com (Lifecycle, Erstbesuche, Check-ins, gestartete und gekündigte Abos, Sales by Category). Probetraining stattgefunden = Erstbesucher mit Check-in im Monat, ohne Altkunden und Staff. Neukunden = gestartete Abos ohne Paketwechsel und ohne Personal Training. Kündigungen ohne Wechsel. Kohorten-Conversion = Probetrainer des Monats, die bis heute ein Abo gestartet haben; wird drei Monate lang nachgeführt. Abo-Bestand und Abo-Umsatz netto = Stand am Tag des Laufs. Leads Website vor September 2026 aus dem Tab Leads Historie.').setFontColor('#666666').setWrap(true);
  sh.getRange('A2:N2').merge();
  var r = 4;
  ['Zurich', 'Winterthur'].forEach(function (loc) {
    var locDE = loc === 'Zurich' ? 'Zürich' : 'Winterthur';
    sh.getRange(r, 1).setValue(locDE).setFontWeight('bold').setFontSize(13); r++;
    var head = ['Kennzahl'].concat(keys.map(function (k) { return new Date(k + '-01T00:00:00'); }));
    sh.getRange(r, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#f3f3f3');
    sh.getRange(r, 2, 1, keys.length).setNumberFormat('mmm yyyy');
    var hdr = r; r++;
    var rowIdx = {};
    MA_ROWS.forEach(function (def) {
      var row = [def[1]];
      keys.forEach(function (k, ci) {
        if (def[0] === 'leads_web') {
          var col = String.fromCharCode(66 + ci), lc = loc === 'Zurich' ? 2 : 3;
          row.push('=IF(' + col + '$' + hdr + '<DATE(2026,9,1),IFERROR(VLOOKUP(' + col + '$' + hdr + ",'Leads Historie'!$A:$C," + lc + ',FALSE),""),COUNTIFS(Daten!$C:$C,' + col + '$' + hdr + ',Daten!$D:$D,"' + locDE + '",Daten!$G:$G,1))');
        } else { var v = val[k + '|' + loc + '|' + def[0]]; row.push(v === undefined ? '' : v); }
      });
      sh.getRange(r, 1, 1, row.length).setValues([row]);
      if (keys.length) sh.getRange(r, 2, 1, keys.length).setNumberFormat(def[2]);
      if (['trial_attended', 'new_customers', 'net_growth', 'rev_total_gross'].indexOf(def[0]) >= 0) sh.getRange(r, 1, 1, row.length).setFontWeight('bold');
      rowIdx[def[0]] = r; r++;
    });
    if (keys.length) {
      // Hilfstabelle fuer das Diagramm (Monate als Zeilen) rechts neben dem Block, Spalte P..S
      var hc = 16, piv = [['Monat', 'Probetrainings', 'Neukunden', 'Kündigungen']];
      keys.forEach(function (k) { piv.push([new Date(k + '-01T00:00:00'), val[k + '|' + loc + '|trial_attended'] || 0, val[k + '|' + loc + '|new_customers'] || 0, val[k + '|' + loc + '|cancellations'] || 0]); });
      sh.getRange(hdr, hc, piv.length, 4).setValues(piv); sh.getRange(hdr, hc, 1, 4).setFontWeight('bold').setBackground('#f3f3f3').setFontColor('#999999');
      sh.getRange(hdr + 1, hc, keys.length, 1).setNumberFormat('mmm yyyy'); sh.getRange(hdr, hc, piv.length, 4).setFontColor('#999999');
      sh.insertChart(sh.newChart().setChartType(Charts.ChartType.COLUMN).setNumHeaders(1).addRange(sh.getRange(hdr, hc, piv.length, 4))
        .setPosition(hdr, hc + 5, 0, 0).setOption('title', 'Funnel ' + locDE + ': Probetrainings, Neukunden, Kündigungen').setOption('colors', ['#9e9e9e', '#1a73e8', '#e2c210']).setOption('width', 620).setOption('height', 320).setOption('legend', { position: 'bottom' }).build());
    }
    r += 2;
  });
  sh.setColumnWidth(1, 330); // keine fixierte Spalte: A2:N2 ist verbunden, Google erlaubt das Einfrieren dann nicht
  var ma = ss.getSheetByName(MA_SHEET); if (ma) { ss.setActiveSheet(ma); ss.moveActiveSheet(1); }
  [MA_HIST, MA_COHORT].forEach(function (n) { var h = ss.getSheetByName(n); if (h && !h.isSheetHidden()) h.hideSheet(); });
}
