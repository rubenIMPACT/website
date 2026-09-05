// IMPACT Martial Arts - Werbekosten Google Ads -> Google Sheet "Analytics", Tab "WerbekostenDaten" (05.09.2026)
// Einrichten (einmalig, Ruben): Google Ads Konto "IMPACT Martial Arts" (831-058-5625) > Tools > Bulk-Aktionen > Skripte > "+"
// > diesen Code einfuegen > Autorisieren > "Vorschau" (schreibt noch nichts) > "Ausfuehren" > Haeufigkeit: Taeglich 06:00.
// Das Skript schreibt die letzten DAYS Tage je Kampagne als Upsert (Schluessel Datum|Plattform|Konto|Kampagne), damit
// nachtraegliche Kostenkorrekturen von Google greifen. Der Standort kommt aus dem Kampagnennamen (Zuerich/Winterthur),
// alles andere = "Beide" (wird im Sheet nach der Einstellung "Werbekosten-Split ohne Standort" aufgeteilt).
var SHEET_ID = '1nlA8MOSqYFwj-rI0SYRFh06-VmMTdoUPYEsHf3zwtlE';
var TAB = 'WerbekostenDaten';
var DAYS = 14;
var HEAD = ['Datum', 'Plattform', 'Konto', 'Kampagne', 'Standort', 'Kosten CHF', 'Klicks', 'Impressionen', 'Stand'];

function main() {
  var ss = SpreadsheetApp.openById(SHEET_ID), sh = ss.getSheetByName(TAB) || ss.insertSheet(TAB);
  if (sh.getLastRow() === 0) { sh.appendRow(HEAD); sh.getRange(1, 1, 1, HEAD.length).setFontWeight('bold'); sh.setFrozenRows(1); }
  var acc = AdsApp.currentAccount(), tz = acc.getTimeZone(), name = acc.getName(), cur = acc.getCurrencyCode();
  // Erstlauf: solange keine Google-Zeile aelter als 60 Tage im Tab liegt, 400 Tage nachladen (Historie fuer den Monatsabschluss)
  var days = DAYS, old = new Date(Date.now() - 60 * 86400000), hasOld = false;
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) { if (r[1] === 'Google Ads' && dOf(r[0]) < Utilities.formatDate(old, 'Europe/Zurich', 'yyyy-MM-dd')) hasOld = true; });
  if (!hasOld) days = 400;
  var end = new Date(), start = new Date(end.getTime() - days * 86400000);
  var f = function (d) { return Utilities.formatDate(d, tz, 'yyyy-MM-dd'); };
  var q = "SELECT segments.date, campaign.name, metrics.cost_micros, metrics.clicks, metrics.impressions FROM campaign " +
    "WHERE segments.date BETWEEN '" + f(start) + "' AND '" + f(end) + "' AND metrics.cost_micros > 0";
  var it = AdsApp.report(q).rows(), out = [];
  while (it.hasNext()) {
    var r = it.next();
    out.push({ date: String(r['segments.date']), campaign: String(r['campaign.name']), cost: Number(r['metrics.cost_micros']) / 1e6, clicks: Number(r['metrics.clicks']), imp: Number(r['metrics.impressions']) });
  }
  if (cur !== 'CHF') Logger.log('ACHTUNG: Kontowaehrung ist ' + cur + ', Kosten werden unveraendert als CHF eingetragen');
  var res = upsert(sh, out, name);
  Logger.log('Google Ads: ' + out.length + ' Zeilen gelesen, ' + res);
}

function locOf(s) { s = String(s || ''); if (/winterthur|\bWT\b|winti/i.test(s)) return 'Winterthur'; if (/z[üu]e?rich|\bZH\b/i.test(s)) return 'Zurich'; return 'Beide'; }
function dOf(v) { return v instanceof Date ? Utilities.formatDate(v, 'Europe/Zurich', 'yyyy-MM-dd') : String(v || '').slice(0, 10); }

function upsert(sh, rows, account) {
  var n = Math.max(0, sh.getLastRow() - 1), ex = n ? sh.getRange(2, 1, n, HEAD.length).getValues() : [], idx = {};
  ex.forEach(function (r, i) { idx[dOf(r[0]) + '|' + r[1] + '|' + r[2] + '|' + r[3]] = i; });
  var stamp = Utilities.formatDate(new Date(), 'Europe/Zurich', 'dd.MM. HH:mm'), add = [], upd = 0;
  rows.forEach(function (x) {
    var row = [x.date, 'Google Ads', account, x.campaign, locOf(x.campaign), Math.round(x.cost * 100) / 100, x.clicks, x.imp, stamp];
    var k = x.date + '|Google Ads|' + account + '|' + x.campaign;
    if (k in idx) { ex[idx[k]] = row; upd++; } else add.push(row);
  });
  if (n) sh.getRange(2, 1, n, HEAD.length).setValues(ex);
  if (add.length) sh.getRange(n + 2, 1, add.length, HEAD.length).setValues(add);
  sh.getRange(2, 1, Math.max(1, n + add.length), 1).setNumberFormat('yyyy-MM-dd');
  return upd + ' aktualisiert, ' + add.length + ' neu';
}
