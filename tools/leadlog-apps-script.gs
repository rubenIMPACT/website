// IMPACT Website Lead Log - Google Apps Script (Webapp) - Version 6 (02.09.2026)
// Projekt "IMPACT Website Lead Log" in script.google.com (ruben@impact-martialarts.com)
// Kopie dieses Codes ohne Token liegt im Website-Repo unter tools/leadlog-apps-script.gs.
//
// Aufgaben:
//  1. doPost: Leads (vom Cloudflare-Endpunkt /api/lead) ins Tab "Leads" schreiben + Mail-Routing
//  2. doPost: Trainingsplaene (vom Endpunkt /api/plan) ins Tab "Trainingsplan" schreiben + Mail bei bekanntem Lead
//  2b. doPost: Formulare ohne CRM (kind=event / cancellation vom Endpunkt /api/form) in die Tabs "Events" / "Kündigungen" (logForm, aus v5 des Events-Chats uebernommen)
//  3. setupAnalyse(): Tabs "Analyse", "Trainingsplan-Analyse", "Historie", "Daten", "PlanDaten" anlegen/erneuern (einmalig manuell ausfuehren)
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
function planSheet(ss) {
  var sh = ss.getSheetByName('Trainingsplan');
  if (!sh) { sh = ss.insertSheet('Trainingsplan'); }
  if (sh.getLastRow() === 0) { sh.appendRow(PLAN_HEAD); sh.getRange(1, 1, 1, PLAN_HEAD.length).setFontWeight('bold'); sh.setFrozenRows(1); }
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
function logPlan(ss, p) {
  var sh = planSheet(ss);
  var d = p.data || {};
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
  var head = isEv ? ['Zeitpunkt', 'Event', 'Datum', 'Standort', 'Name', 'E-Mail', 'Telefon', 'Freunde', 'Sprache', 'Seite']
                  : ['Zeitpunkt', 'Anonym', 'Vorname', 'Nachname', 'Grund', 'Erwartungen nicht erfüllt', 'Details Erwartungen', 'Zufriedenheit Trainer', 'Details Trainer', 'Pause/Timing', 'Details Timing', 'Preis Einfluss', 'Preis zum Bleiben', 'Preis maximal', 'Verbesserungen', 'Wiedereinstieg', 'Details Wiedereinstieg', 'Sprache'];
  var sh = ss.getSheetByName(name); if (!sh) { sh = ss.insertSheet(name); }
  if (sh.getLastRow() === 0) { sh.appendRow(head); sh.getRange(1, 1, 1, head.length).setFontWeight('bold'); sh.setFrozenRows(1); }
  var row = isEv ? [new Date(), s(d.event_title), s(d.event_date), s(d.location), asText(d.name), asText(d.email), asText(d.phone), s(d.friends), s(d.lang), s(d.page)]
                 : [new Date(), d.anonymous ? 'Ja' : 'Nein', asText(d.first_name), asText(d.last_name), asText(d.reason), s(d.expectations), asText(d.expectations_text), s(d.satisfaction), asText(d.satisfaction_text), s(d.timing), asText(d.timing_text), s(d.price), s(d.price_stay), s(d.price_max), asText(d.suggestions), s(d.rejoin), asText(d.rejoin_text), s(d.lang)];
  sh.appendRow(row);
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
  leadsSheet(ss); planSheet(ss);
  buildHistorie(ss);
  buildDaten(ss);
  buildPlanDaten(ss);
  buildAnalyse(ss);
  buildPlanAnalyse(ss);
  var order = ['Analyse', 'Trainingsplan-Analyse', 'Leads', 'Trainingsplan', 'Historie', 'Daten', 'PlanDaten'];
  for (var i = 0; i < order.length; i++) { var sh = ss.getSheetByName(order[i]); if (sh) { ss.setActiveSheet(sh); ss.moveActiveSheet(i + 1); } }
  ss.setActiveSheet(ss.getSheetByName('Analyse'));
}
function getOrCreate(ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); }
function clearSheet(sh) { sh.clear(); var cs = sh.getCharts(); for (var i = 0; i < cs.length; i++) sh.removeChart(cs[i]); }

function buildHistorie(ss) {
  var sh = getOrCreate(ss, 'Historie');
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

// PlanDaten: Hilfsspalten pro Trainingsplan-Zeile (Datum, Monat, Letzte Version pro Sitzung, Zaehlt)
function buildPlanDaten(ss) {
  var sh = getOrCreate(ss, 'PlanDaten'); clearSheet(sh);
  sh.appendRow(['Datum', 'Monat', 'Letzte', 'Zählt']);
  var A = 'Trainingsplan!A2:A', blank = 'IF(' + A + '="","",';
  sh.getRange('A2').setFormula('=ARRAYFORMULA(' + blank + 'INT(' + A + ')))');
  sh.getRange('B2').setFormula('=ARRAYFORMULA(' + blank + 'DATE(YEAR(' + A + '),MONTH(' + A + '),1)))');
  sh.getRange('C2').setFormula('=ARRAYFORMULA(' + blank + 'IF(COUNTIFS(Trainingsplan!B2:B,Trainingsplan!B2:B&"",Trainingsplan!A2:A,">"&Trainingsplan!A2:A)=0,1,0)))');
  sh.getRange('D2').setFormula('=ARRAYFORMULA(' + blank + 'IF((C2:C=1)*(LOWER(Trainingsplan!C2:C&"")<>"share")*(NOT(REGEXMATCH(LOWER(Trainingsplan!Q2:Q&""),"^test"))),1,0)))');
  sh.getRange('A2:B').setNumberFormat('dd.mm.yyyy');
  sh.getRange(1, 1, 1, 4).setFontWeight('bold'); sh.setFrozenRows(1); sh.hideSheet();
}

// Analyse: Kennzahlen, Wochen- und Monatstabelle, Diagramme
function buildAnalyse(ss) {
  var sh = getOrCreate(ss, 'Analyse'); clearSheet(sh);
  var WEEKS = 16, MONTHS = 12;
  var pct = '0.0%';
  sh.getRange('A1').setValue('IMPACT Website Leads – Analyse').setFontSize(16).setFontWeight('bold');
  sh.getRange('A2').setValue('Leads = Status "ok" (neu im CRM), ohne Dubletten, Tests und Ausschluss-Markierungen (Spalte "Ausschluss" im Tab Leads mit x markieren). Dubletten = erneute Anfragen bestehender Kontakte. Woche = Montag bis Sonntag. Prozent = Vergleich der letzten abgeschlossenen Periode mit der davor. Monate vor September 2026 aus dem Tab Historie (manuell gezaehlt).').setFontColor('#666666').setWrap(true);
  sh.getRange('A2:R2').merge();

  // ---- Wochentabelle
  var wHead = 20, wFirst = wHead + 1, wLast = wHead + WEEKS; // Zeilen 21..36
  var head = ['Woche ab', 'bis', 'Status', 'Zürich', 'Winterthur', 'Total', 'Δ% Vorwoche', 'Dubletten'].concat(INTERESTS);
  sh.getRange(wHead - 1, 1).setValue('Leads pro Woche (letzte ' + WEEKS + ' Wochen)').setFontWeight('bold').setFontSize(12);
  sh.getRange(wHead, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#f3f3f3');
  for (var i = 0; i < WEEKS; i++) {
    var r = wFirst + i, off = WEEKS - 1 - i;
    sh.getRange(r, 1).setFormula('=TODAY()-WEEKDAY(TODAY(),2)+1-7*' + off);
    sh.getRange(r, 2).setFormula('=A' + r + '+6');
    sh.getRange(r, 3).setFormula('=IF(B' + r + '>=TODAY(),"läuft noch","")');
    sh.getRange(r, 4).setFormula('=COUNTIFS(Daten!$B:$B,$A' + r + ',Daten!$D:$D,"Zürich",Daten!$G:$G,1)');
    sh.getRange(r, 5).setFormula('=COUNTIFS(Daten!$B:$B,$A' + r + ',Daten!$D:$D,"Winterthur",Daten!$G:$G,1)');
    sh.getRange(r, 6).setFormula('=COUNTIFS(Daten!$B:$B,$A' + r + ',Daten!$G:$G,1)');
    sh.getRange(r, 7).setFormula(i === 0 ? '=""' : '=IF(OR(F' + (r - 1) + '="",F' + (r - 1) + '=0),"",(F' + r + '-F' + (r - 1) + ')/F' + (r - 1) + ')');
    sh.getRange(r, 8).setFormula('=COUNTIFS(Daten!$B:$B,$A' + r + ',Daten!$H:$H,1)');
    for (var k = 0; k < INTERESTS.length; k++) sh.getRange(r, 9 + k).setFormula('=COUNTIFS(Daten!$B:$B,$A' + r + ',Daten!$E:$E,"' + INTERESTS[k] + '",Daten!$G:$G,1)');
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
    sh.getRange(r2, 3).setFormula('=IF(' + h + ',IFERROR(VLOOKUP(A' + r2 + ',Historie!$A:$C,2,FALSE),""),COUNTIFS(Daten!$C:$C,$A' + r2 + ',Daten!$D:$D,"Zürich",Daten!$G:$G,1))');
    sh.getRange(r2, 4).setFormula('=IF(' + h + ',IFERROR(VLOOKUP(A' + r2 + ',Historie!$A:$C,3,FALSE),""),COUNTIFS(Daten!$C:$C,$A' + r2 + ',Daten!$D:$D,"Winterthur",Daten!$G:$G,1))');
    sh.getRange(r2, 5).setFormula('=IF(AND(C' + r2 + '="",D' + r2 + '=""),"",N(C' + r2 + ')+N(D' + r2 + '))');
    sh.getRange(r2, 6).setFormula(j === 0 ? '=""' : '=IF(OR(E' + (r2 - 1) + '="",E' + (r2 - 1) + '=0,E' + r2 + '=""),"",(E' + r2 + '-E' + (r2 - 1) + ')/E' + (r2 - 1) + ')');
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
  var chartCol = 8;
  sh.insertChart(sh.newChart().setChartType(Charts.ChartType.LINE).setNumHeaders(1)
    .addRange(sh.getRange(wHead, 1, WEEKS + 1, 1)).addRange(sh.getRange(wHead, 4, WEEKS + 1, 3))
    .setPosition(4, chartCol, 0, 0).setOption('title', 'Leads pro Woche').setOption('colors', ['#e2c210', '#1a73e8', '#9e9e9e']).setOption('width', 620).setOption('height', 300)
    .setOption('legend', { position: 'bottom' }).setOption('hAxis', { format: 'dd.MM' }).setOption('vAxis', { minValue: 0 }).build());
  sh.insertChart(sh.newChart().setChartType(Charts.ChartType.COLUMN).setNumHeaders(1)
    .addRange(sh.getRange(mHead, 1, MONTHS + 1, 1)).addRange(sh.getRange(mHead, 3, MONTHS + 1, 2))
    .setPosition(wHead - 2, chartCol + 8, 0, 0).setOption('title', 'Leads pro Monat (Zürich / Winterthur)').setOption('colors', ['#e2c210', '#1a73e8']).setOption('width', 620).setOption('height', 320)
    .setOption('legend', { position: 'bottom' }).setOption('hAxis', { format: 'MMM yyyy' }).setOption('vAxis', { minValue: 0 }).build());
  sh.insertChart(sh.newChart().setChartType(Charts.ChartType.COLUMN).setNumHeaders(1)
    .addRange(sh.getRange(mHead, 1, MONTHS + 1, 1)).addRange(sh.getRange(mHead, 8, MONTHS + 1, INTERESTS.length))
    .setPosition(mHead - 2, chartCol + 8, 0, 0).setOption('title', 'Leads pro Monat nach Interesse (ab September 2026)').setOption('isStacked', true).setOption('width', 620).setOption('height', 340)
    .setOption('legend', { position: 'bottom' }).setOption('hAxis', { format: 'MMM yyyy' }).setOption('vAxis', { minValue: 0 }).build());
}

// Trainingsplan-Analyse: Zaehlungen je Eingabe
function buildPlanAnalyse(ss) {
  var sh = getOrCreate(ss, 'Trainingsplan-Analyse'); clearSheet(sh);
  sh.getRange('A1').setValue('Trainingsplan-Tool – Auswertung der Eingaben').setFontSize(16).setFontWeight('bold');
  sh.getRange('A2').setValue('Gezaehlt wird pro Sitzung nur der zuletzt erstellte Plan; Aufrufe ueber geteilte Links und Testleads zaehlen nicht. "Monat" = Kalendermonat.').setFontColor('#666666');
  var cur = 'DATE(YEAR(TODAY()),MONTH(TODAY()),1)', prev = 'DATE(YEAR(TODAY()),MONTH(TODAY())-1,1)';
  var base = 'PlanDaten!$D:$D,1';
  var r = 4;
  sh.getRange(r, 1, 1, 4).setValues([['Erstellte Pläne', 'Gesamt', 'Dieser Monat', 'Letzter Monat']]).setFontWeight('bold').setBackground('#f3f3f3');
  sh.getRange(r + 1, 1).setValue('Pläne (letzte Version je Sitzung)');
  sh.getRange(r + 1, 2).setFormula('=COUNTIFS(' + base + ')');
  sh.getRange(r + 1, 3).setFormula('=COUNTIFS(' + base + ',PlanDaten!$B:$B,' + cur + ')');
  sh.getRange(r + 1, 4).setFormula('=COUNTIFS(' + base + ',PlanDaten!$B:$B,' + prev + ')');
  sh.getRange(r + 2, 1).setValue('davon mit bekanntem Lead (nach Probetraining-Anfrage)');
  sh.getRange(r + 2, 2).setFormula('=COUNTIFS(' + base + ',Trainingsplan!$P:$P,"<>")');
  sh.getRange(r + 2, 3).setFormula('=COUNTIFS(' + base + ',Trainingsplan!$P:$P,"<>",PlanDaten!$B:$B,' + cur + ')');
  sh.getRange(r + 2, 4).setFormula('=COUNTIFS(' + base + ',Trainingsplan!$P:$P,"<>",PlanDaten!$B:$B,' + prev + ')');
  r += 4;
  var dims = [
    ['Standort', 'D', ['Zürich', 'Winterthur'], false],
    ['Ziel', 'E', ['Kampfkunst lernen', 'Fit werden', 'Selbstverteidigung', 'Wettkampf'], false],
    ['Kampfkunst (Mehrfachauswahl möglich)', 'F', ['MMA', 'Muay Thai', 'Boxen', 'BJJ', 'Ringen', 'Fitness Kickboxen', 'Unsicher'], true],
    ['Level', 'G', ['Anfänger', 'Fortgeschritten', 'Erfahren'], false],
    ['Tage pro Woche', 'H', ['1', '2', '3', '4', '5', '6'], false],
    ['Zeitfenster (Mehrfachauswahl möglich)', 'I', ['Morgen', 'Mittag', 'Abend'], true],
    ['Nebensport', 'J', ['Nichts', 'Laufen/Cardio', 'Kraft', 'Andere Sportart'], false],
    ['Nebensport pro Woche', 'K', ['1x', '2x', '3+x'], false]
  ];
  for (var i = 0; i < dims.length; i++) {
    var d = dims[i], col = 'Trainingsplan!$' + d[1] + ':$' + d[1];
    sh.getRange(r, 1, 1, 4).setValues([[d[0], 'Gesamt', 'Dieser Monat', 'Letzter Monat']]).setFontWeight('bold').setBackground('#f3f3f3');
    for (var v = 0; v < d[2].length; v++) {
      var rr = r + 1 + v, crit = d[3] ? '"*' + d[2][v] + '*"' : '"' + d[2][v] + '"';
      if (d[1] === 'H') crit = d[2][v];
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
