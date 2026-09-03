---
name: impact-class-analysis
description: Monatliche Klassenanalyse fuer IMPACT Zuerich und Winterthur aus den exercise.com-Reports "Popular Services" und "Itemized Recurring Sessions", direkt ins Google Sheet "IMPACT Website Leads Log" (Tab Klassenanalyse). Nutze diesen Skill immer, wenn Ruben Klassen, Stundenplan, Kursauslastung, Besucherzahlen, Slots, Kurszeiten oder einzelne Kurse (Little Ninjas, Self Defense for Women, Competition, Open Mat, Muay Thai, BJJ) bewerten, vergleichen, aufraeumen, streichen, verlegen oder ausbauen will, auch wenn er den Report nicht namentlich nennt, und bei Fragen wie "welche Klassen laufen schlecht", "sollen wir X streichen", "wann sollen wir Y anbieten", "Klassenanalyse", "Auslastung".
---

# IMPACT Klassenanalyse (Weg 2: Browser-Session -> Sheet)

Beantwortet die Frage "welche Klassen tragen sich, welche nicht, und liegt es am Kurs oder an der Uhrzeit".
Seit 02.09.2026 landet das Ergebnis nicht mehr in einer Excel-Datei, sondern im Tab **Klassenanalyse** des
Google Sheets "IMPACT Website Leads Log" (ID 1nlA8MOSqYFwj-rI0SYRFh06-VmMTdoUPYEsHf3zwtlE). Dort entsteht
ueber die Monate ein Verlauf (Tab KlassenHistorie, versteckt). Ruben will monatlich die Zahlen des Vormonats.

Die Analyse ist nur so gut wie die Bereinigung davor. Die Datenfallen unten (Schedule-Fragmente, Samstags-
Rotation, Gratisklassen, Kids vs. Erwachsene) sind im Ablauf eingebaut, nicht optional.

## Voraussetzungen

- Cowork-Session mit Chrome-MCP, ein Tab auf `app.impact-martialarts.com` ist eingeloggt (Ruben).
- Google-Drive-Connector (zum Hochladen der Import-Datei).
- Die Scripts liegen im Website-Repo unter `tools/klassenanalyse/` und als Kopie in `scripts/` dieses Skills.

## Hinweis: Der Normalfall laeuft ohne diesen Skill

Seit 03.09.2026 rechnet die Cloudflare-Funktion `/api/klassen` die Monatsanalyse serverseitig, und das Apps Script
"IMPACT Website Lead Log" holt sie am 1. des Monats per Zeit-Trigger (`runKlassenanalyseMonthly`) und baut die Tabs.
Dieser Skill ist nur noch der manuelle Fallback (z.B. anderes Fenster, API-Ausfall). Fuer ein beliebiges Fenster
reicht im Script-Editor: `runKlassenanalyse('YYYY-MM-DD', 'YYYY-MM-DD')`.

## Ablauf (ca. 10 Minuten)

**0. Fenster bestimmen.** Standard: der letzte volle Kalendermonat (am 1. Oktober also 01.09. bis 30.09.).
Wenn Ruben ein anderes Fenster nennt, das nehmen. Format YYYY-MM-DD.

**1. Reports per API neu generieren.** In einem exercise.com-Tab mit `javascript_tool` zuerst den Inhalt von
`scripts/fetch_reports.js` ausfuehren (definiert `KA` und `REVENUE`), dann:

```js
window.__ka = KA('2026-08-01', '2026-08-31');
await __ka.refreshOne('recurring'); await __ka.refreshOne('visits'); await __ka.refreshOne('subs')
```

Popular Services teilt sich EINEN Server-Cache, darum Zuerich und Winterthur nacheinander:

```js
await __ka.refreshOne('Zurich');  await __ka.poll('Zurich')      // wiederholen bis 'done', dann
await __ka.refreshOne('Winterthur'); await __ka.poll('Winterthur') // wiederholen bis 'done'
await __ka.poll()                                                   // alle fuenf bis {done:true}
```

Jeder Aufruf muss unter 45 Sekunden bleiben (Tool-Limit), deshalb kein Warten in einer Schleife im selben Aufruf.
Ein Poll gilt als fertig, wenn `refreshing` leer ist UND der Filtertext das Startdatum und (bei Popular) den
Standort enthaelt. Ohne diesen Check liest man die alte Generierung. `visits` (Itemized Visits, alle Check-ins
des Monats) und `subs` (Active Subscriptions) sind die Basis fuer Umsatz und Kuendigungsrisiko.

**2. Daten aus dem Tab holen, in zwei Teilen.** `javascript_tool` kuerzt Rueckgaben auf rund 1000 Zeichen und
`get_page_text` liefert nur ~50 KB sauber am Stueck. Deshalb:

```js
__ka.dump(1)   // schreibt die Reports als Text in die Seite
```

`get_page_text`, den Text zwischen `KA_JSON_BEGIN` und `KA_JSON_END` als `reports.json` speichern. Dann

```js
__ka.dump(2)   // Umsatz + Mitglieder ohne Besuch
```

und den Text als `revenue.json` speichern. Wird die Ausgabe von `get_page_text` in eine Datei ausgelagert
(passiert bei grossen Seiten), diese Datei mit Python oeffnen und den Text zwischen den Markern
herausschneiden, NICHT von Hand abtippen. Danach die Seite neu laden (navigate), damit der exercise.com-Tab
wieder normal aussieht.

**3. Import-Datei bauen.**

```bash
python scripts/build_import.py reports.json --revenue revenue.json -o klassenanalyse-2026-08.json
```

Das Script fasst Schedule-Fragmente auf Standort + Kurs + Wochentag + Startzeit zusammen, nimmt Termine, Besuche,
Plaetze aus Popular Services (nur "(Class)"-Zeilen), Unique Users, Buchungen, Trainer aus Recurring Sessions,
haengt den verteilten Abo-Umsatz an und meldet Auslastung, Umsatz und Mitglieder ohne Besuch je Standort.
Pruefe die Ausgabe: Zuerich lag im Sommer 2026 bei rund 32 Prozent Auslastung, Winterthur bei rund 25 Prozent;
Umsatz auf Klassen im August 2026 rund 99'000 CHF netto (ZH 68'000, WT 32'000), Mitglieder ohne Besuch rund ein
Drittel. Weicht etwas um mehr als 10 Punkte ab, stimmt etwas mit dem Fenster oder dem Standortfilter nicht.
"rows ohne revenue" darf leer sein; steht dort eine Klasse, passt ein Kursname nicht (Leerzeichen, Umbenennung).

**4. Hochladen.** Die Datei ist rund 90 KB (Namensliste). Erster Versuch: Drive-Connector (`create_file`) in den
Ordner **Klassenanalyse-Import** (ID 1PY7xvkRQlo19r9ARp6_95-MG3bIi1lPI), `contentMimeType: application/json`,
`disableConversionToGoogleType: true`, Dateiname `klassenanalyse-YYYY-MM.json`. Schlaegt das wegen der Groesse
fehl, ueber Chrome hochladen: den Drive-Ordner im Browser oeffnen, per `javascript_tool` ein
`<input type=file id=__ka_upload aria-label="KA upload input">` an `document.body` haengen, mit `find` die Referenz
holen, mit `file_upload` die lokale Datei setzen, dann per JS ein `DragEvent('drop')` mit einem `DataTransfer`, der
`input.files[0]` enthaelt, auf `document.querySelector('c-wiz')` und `document` dispatchen; im Dialog
"Replace existing file" bzw. Upload klicken. Eine aeltere Datei desselben Monats vorher in den Papierkorb (Drive-
Connector `trash_file`), damit das Script die neueste nimmt.

**5. Import ausloesen.** Das Apps-Script "IMPACT Website Lead Log" (Funktion `importKlassenanalyse`) liest die
neueste Datei aus dem Ordner und baut die Tabs Klassenanalyse und Kuendigungsrisiko neu. Es laeuft per Zeit-Trigger (stuendlich, im Trigger-Menue
des Scripts angelegt) oder sofort: im Script-Editor die Funktion `importKlassenanalyseForce` ausfuehren.
Spalte "Aktion" im Tab bleibt beim Neuaufbau erhalten (Schluessel Standort + Klasse + Tag + Zeit).

**6. Schriftlich auswerten** (Struktur unten) und Ruben den Link auf den Tab geben. Keine Excel-Datei mehr.

## Die Kennzahlen (unveraendert)

**Auslastung** = Besuche / Plaetze. Hauptzahl, braucht keine Bezugsgroesse. Beobachtete Verteilung: Median
rund 28 Prozent, unteres Viertel unter 16, bestes Viertel ueber 36.

**Oe pro Klasse** daneben, weil Auslastung allein die Raumgroesse versteckt.

**Oe dieser Uhrzeit** und das **Verhaeltnis** beantworten, ob es am Kurs oder an der Uhrzeit liegt (Vergleich
ueber alle Werktage zusammen, Samstag getrennt). Innerhalb einer Uhrzeit unterscheiden sich Wochentage teils um
Faktor 3 bis 5; bei einer schwachen Klasse immer die gleiche Uhrzeit an anderen Tagen anschauen.

**Besuche je Teilnehmer** = Buchungen / Unique Users (beide aus dem Recurring-Report). Niedrig = viele
probieren, bleiben nicht. Hoch = fester Stamm, den eine Schliessung real kostet.

**Bewertung** im Sheet: unter 5 Termine "zu wenig Termine", unter 10 Prozent "tot", unter 16 "schliessen
pruefen", unter 28 "schwach", ueber 45 "Kapazitaet pruefen".

## Value Pricing und Kuendigungsrisiko (seit 03.09.2026, Entscheid Ruben)

`fetch_reports.js` holt zusaetzlich `detailed_visits` (alle Check-ins des Monats, per=5000) und `active_subscription`
(alle laufenden Abos, per=2000) und rechnet im Browser (`REVENUE`): Netto-Abobetrag pro Monat je Mitglied (Payment Plan
Price ohne MwSt, Jahres-/Halbjahresabos auf Monate umgerechnet, Coupon abgezogen; pausierte und geplante Abos raus)
gleichmaessig auf dessen abgeschlossene Check-ins verteilt und je Slot (Standort|Kurs|Wochentag|Uhrzeit) summiert.
Check-ins ohne Abo (Probetraining, Gaeste) = 0 CHF. `collect()` liefert das als `revenue` (slots, members je Standort,
novisit = Mitglieder ohne einen Check-in, mit Name/E-Mail/Abo/CHF). `build_import.py` haengt `revenue` und
`revenue_per_event` an die Klassenzeilen (Kursnamen normalisiert, exercise.com liefert z.B. "Boxing - All Levels " mit
Leerzeichen), `revenue`/`revenue_share` an die Hitlist und gibt `revenue` (ohne slots) an das Apps-Script weiter.
Im Sheet: Klassenanalyse zeigt Umsatz CHF/Monat und CHF/Termin je Klasse, Umsatz je Standort und Umsatzanteil je
Disziplin (nur Umsatz je Termin, KEINE Trainerstunden, alle Klassen dauern 60 Minuten; Entscheid Ruben). Tab
"Kuendigungsrisiko": Statistik pro Monat je Standort (Abos, mit/ohne Besuch, Quote, CHF) aus dem versteckten Tab
RisikoHistorie plus Namensliste des Monats mit manueller Notizspalte (bleibt beim Import erhalten). Kein Grenzumsatz:
faellt eine Klasse weg, wandern die Besuche in andere Klassen.

## Hitlist Kampfsportarten (seit 03.09.2026, Entscheid Ruben)

Mindestschwelle je Standort (Ruben 03.09.2026): Index nur bei Ø >= 3 Personen pro Klasse UND >= 4 Terminen im Monat, sonst `null` (Sheet zeigt n/a); das Mittel nimmt dann nur den anderen Standort.

Der Tab enthaelt ueber der Klassentabelle eine gewichtete Hitlist je Disziplin, uhrzeitbereinigt: Slot-Index =
Oe pro Klasse geteilt durch Oe aller Nicht-Gratis-Klassen zur selben Uhrzeit am selben Standort (Werktag und
Samstag getrennt), gewichtet mit Terminen, ZUERST je Standort gerechnet (Spalten Index Zuerich, Index
Winterthur), dann Mittel beider Standorte. 1.00 = zieht so viele Leute wie der Slot im Schnitt, 1.30 = 30 Prozent
mehr. Daneben rohe Auslastung, Besuche, Termine, "Termine mit Vergleich" (Termine in Slots, in denen eine andere
Disziplin laeuft; steht eine Disziplin allein, ist ihr Faktor per Definition 1.0) und Unique Users.
Regeln: Levels zusammengefasst (Basics + All Levels + Competition), BJJ Gi und BJJ No-Gi getrennt ("BJJ -
Competition" zaehlt zu Gi, "Striking - Competition" zu Muay Thai), Kids in derselben Liste, Open Mat und Self
Defense for Women ausgeschlossen. Zweite Liste nach Disziplin und Level. Ab dem zweiten Import zusaetzlich eine
rollierende Liste ueber die letzten drei Monate (Tab KlassenHistorieDisziplin, versteckt). Alles rechnet
`build_import.py` (Feld `hitlist`; die Level-Liste ist seit 03.09.2026 weg, stattdessen zeigt das Apps Script Top 10 / Bottom 10 Klassen nach Umsatz je Termin aus den Zeilen), das Apps-Script rendert nur.

## Datenfallen

- **Schedule-Fragmente**: jede Stundenplan-Aenderung legt eine neue Serie an; zusammengefasst wird auf Standort,
  Kurs, Wochentag, Startzeit (macht build_import.py).
- **Samstags-Rotation**: zwei Trainer im Wechsel = zwei Serien. Popular Services zaehlt pro Serie nur die
  tatsaechlich gelaufenen Termine, die Summe stimmt also. Der Recurring-Report verdoppelt Sessions; darum nie
  Total Sessions als Nenner.
- **Gratisklassen** (Open Mat) sind aus allen Vergleichen ausgeschlossen, stehen aber in der Tabelle.
- **Kids gegen Erwachsene** getrennt lesen. Ferienmonate (Kanton Zuerich) verzerren Kids nach unten; das in der
  Auswertung nennen.
- **Nicht-Klassen** (Anmeldegespraech, Personal Training, Workshops, Sparring) werden ausgefiltert.
- **Unique Users** sind Koepfe, nicht Besuche. Nicht ueber Klassen summieren.

## Was Zahlen allein nicht entscheiden

Widersprich Ruben, wenn eine dieser Situationen vorliegt. Er will das explizit.

- **Competition-Klassen** nicht nach Oe bewerten, sie tragen Positionierung und Kaderaufbau. Frag, wie viele der
  Teilnehmer tatsaechlich kaempfen.
- **Reichweite von Bindung trennen**: viele Unique Users bei niedrigem Oe = Nachfrage ohne Format, also
  Retentionsproblem, nicht Nachfrageproblem.
- **Wer muss umziehen**: vor jeder Schliessungsempfehlung sagen, wie viele Personen betroffen sind und ob es eine
  Alternative im Plan gibt.
- **Ein toter Slot ist kein totes Produkt**: laeuft dieselbe Uhrzeit an einem anderen Tag, ist Verlegen die
  Antwort, nicht Streichen.

## Aufbau der schriftlichen Auswertung

Kurz, Substanz vor Vollstaendigkeit, kein Fliesstext um Zahlen herum.

1. Datenbasis in zwei Zeilen: Fenster, Anzahl Slots, Auslastung je Standort, Vergleich zum Vormonat (steht im Tab).
2. Vorgenommene Korrekturen, falls noetig.
3. Befunde nach Groesse des Hebels sortiert.
4. Antwort auf jede konkrete Hypothese von Ruben, auch wenn die Daten sie widerlegen.
5. Was die Daten nicht hergeben.

Bewaehrte Analysewinkel: Striking gegen Grappling in derselben Uhrzeit, gleicher Kurs mit gleichem Trainer an
zwei Wochentagen, Werktag gegen Samstag im selben Slot, Anteil der Slots unter 16 Prozent gemessen am Anteil
der Besuche, den sie liefern.

## Details

`references/method.md` erklaert die Spaltensemantik der Reports und die Datenfallen im Detail (weiterhin gueltig;
der Text-Dump-Weg dort ist nur noch Fallback, wenn die JSON-API einmal nicht antwortet).
