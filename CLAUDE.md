# IMPACT Website – Projektkontext

Statischer Rebuild von impact-martialarts.com (weg von Webflow). Deploy: Cloudflare Pages -> start.impact-martialarts.com (~60s Lag). LAUNCH-ZUSTAND (01.09.): noindex ueberall ENTFERNT (ausser /termin/, /en/booking/, /probetraining/danke/, /en/trial/thanks/), Canonicals auf www.impact-martialarts.com, sitemap.xml (80 URLs, hreflang) + robots.txt + 404.html live, /shop|/gear|/login interim 302 auf /. GELAUNCHT 01.09.2026: www + apex als Custom Domains auf dem Pages-Projekt, DNS geflippt (www CNAME website-2mg.pages.dev, vorher cdn.webflow.com), Apex-301-Redirect-Rule auf www (query-erhaltend), Sitemap in GSC eingereicht (80 Seiten, Success). Webflow-CMS-Vollbackup: tools/backup/webflow-cms + 376 Medien (312MB) in Google Drive "Webflow-Backup-2026-09-01". Webflow abgewickelt (01.09.): Bandwidth-Add-on entfernt (-116.08 USD Gutschrift), Business-Plan-Downgrade auf Starter terminiert per 12.10.2026 (bezahlt bis dahin, KEINE Verlaengerungsrechnung; Projekt bleibt als Gratis-Archiv). Orders-Export nicht noetig (Shop lief nie, Entscheid Ruben). .ch-Domains (impact-martialarts.ch, impactmartialarts.ch, je +www) leiten seit 01.09. via GoDaddy-Forwarding 301 auf www.impact-martialarts.com (vorher via Webflow). Striking Studio: Webflow-Basic-Plan-Downgrade terminiert per 08.09.2026 (keine weitere Abbuchung). WICHTIG: strikingstudio.com laeuft laengst auf GitHub Pages (Custom-Build, Projekt: ~/Documents/Claude/Projects/Website Striking Studio, DNS www=CNAME strikingstudio.github.io) - die Webflow-Kopie war tot, am 08.09. geht NICHTS offline. Redirect-Vollaudit 01.09.: alle 102 _redirects-Regeln auf www gruen; .ch-Roots + littleninjas.ch(+www) leiten korrekt; www.*.ch wartet nur auf GoDaddy-SSL (Stunden). BEKANNTE EINSCHRAENKUNG: GoDaddy-Forwarding der .ch-Domains uebernimmt KEINE Pfade (impact-martialarts.ch/tieferlink -> 404 bei GoDaddy); Root-Aufrufe funktionieren. Falls Pfade je gebraucht werden: .ch-Zonen zu Cloudflare umziehen. Webflow-Zahlungsmethode traegt noch Josefstrasse 92 als Rechnungsadresse. Sprache: Deutsch (CH-Schreibweise, kein ß, KEINE Em-Dashes/Gedankenstriche im Text).

## Regeln (verbindlich)
- Vor JEDEM Push: Playwright-Rendercheck (mobil 390px + Desktop 1280px) + HTML-Parse + Div-Balance (Anzahl `<div` == `</div>`) + JS-Syntax (`new Function` je `<script>`). Rot = kein Push.
- Kein Platzhalter-Content. Fehlt Material (Fotos, Texte, Namen), Karte weglassen oder Typo-Karte, und Ruben fragen.
- Design-Entscheide vor Umsetzung mit Ruben klären. Original-Webflow-Seite ist Referenz: Struktur nahe am Original, Design neu.
- Asset-Pfade absolut (`/assets/...`).
- Excel/Dokumente: nur minimale, gezielte Edits.

## Architektur
- 76 Seiten, statisch. Kursseiten = Landing Pages: URL-Param-Erkennung (gclid/fbclid/utm/?ad=1) blendet Nav aus (admode). Alte /probetraining/-URLs -> 301 auf Kursseiten.
- Nav: Standortseiten + alle Kursseiten teilen dieselbe Stadt-Nav (navwrap + topbar + mobmenu + burger). Desktop: Menüpunkte + CTA rechtsbündig (.navlinks margin-left:auto). Menü-Reihenfolge überall: Kurse, Stundenplan, Kids, Team (Team-Seite = Trainer-Grid je Standort inkl. Studio Manager Abdi/Bogdan; Trainerkarten oeffnen seit 28.08. ein Bio-Overlay mit den vollen CMS-Texten (#trbios JSON je Seite, /*trbio*/-Script) statt externer Links). Mobil: Stadt-Dropdown (.citydd, zeigt andere Stadt) links neben dem Burger; Hamburger enthält Stadt-Punkte + Über uns/Karriere/Blog/English, KEIN Standort-wechseln mehr. Kicker ohne Nummern (kein 01/02). ACHTUNG Altlast behoben: 12 Kursseiten hatten navwrap+mobmenu DOPPELT im HTML und die Kursseiten hatten flaches (un-gescoptes) Mobile-Nav-CSS – beides gefixt, nicht wieder einschleppen.
- CTA-Wording überall "Gratis Probetraining" (auch Footer-Button, einzeilig). /probetraining/ = reine Fragebogen-Seite (nur Logo, kein Menü, Formular -> /api/lead -> /probetraining/danke/). Vorbelegung per ?loc=zurich|winterthur&dis=MMA möglich.
- Footer v2 auf allen 25 navwrap-Seiten, 1:1 nach Original. Newsletter aktuell mailto-Übergang (Zielsystem offen, Ruben fragen). Nur Instagram, kein Facebook (Entscheid Ruben).
- Stundenplan (/{stadt}/stundenplan/): EINE Zeitachse links (gold), Tage als Spalten (#spgrid, Renderer `/*spgrid*/`). Zürich: je Tag Mat A/Mat B, Desktop 3 Tage / mobil 1. Winterthur: eine Matte, Desktop Mo–Sa komplett (Tabs ausgeblendet) / mobil 2 Tage. Statische Daten als JSON in `<script id="spdata">`; Live-Layer ersetzt sie mit `/api/schedule?loc=...`. Migrationsskript: tools/build_schedule_grid.py (einmalig, nicht erneut laufen lassen).
- functions/api/schedule.js: liest öffentlichen exercise.com-Endpunkt `https://app.impact-martialarts.com/api/v4/calendar` (liefert ~4 Wochen, beide Standorte, location_id 2222=Winterthur / 2508=Zürich), filtert 7 Tage, cached 15min, gibt KEINE client_names weiter (Endpunkt leakt Teilnehmernamen – DSGVO-Meldung an exercise.com via Bogdan offen). Browser-Header nötig, sonst 502 von deren Cloudflare. ABER (verifiziert 23.08.2026): der öffentliche Kalender-Endpunkt liefert nur Stunden MIT Buchungen, und mit Login (Lead-Account) ist der Kalender leer; andere API-Pfade geben 500. Es gibt KEINEN vollständigen Plan-Feed. Deshalb: Live-MERGE statt Ersatz (Entscheid Ruben 23.08.): statischer Wochenplan (JSON in #spdata) ist immer die Basis und wird auf Zuruf gepflegt; der Feed aktualisiert Karten (Match über Zeit+Kurs-URL: Trainer/Level; deutscher Name aus dem statischen Plan bleibt) und VERSCHIEBT eine Stunde, wenn sie im Feed am selben Tag zu anderer Zeit steht (Zeitwechsel greift so automatisch am richtigen Datum, nie doppelt). Unbekannte Feed-Stunden werden ignoriert, entfernt wird nie etwas (abgesagte Stunden bleiben sichtbar – bewusst so, Entscheid Ruben). Parallele Stunden nebeneinander in der Tagesspalte, alle Zeilen gleich hoch (grid-auto-rows:1fr). Tagesköpfe zeigen echte Daten, Woche beginnt heute. functions/api/schedule.js bleibt für später; ggf. exercise.com-Support nach echtem Schedule-Feed fragen (läuft eh Kontakt wegen DSGVO/client_names via Bogdan).
- functions/api/lead.js: Formular -> exercise.com (sign_in mit env EXERCISE_*, dann POST /api/v2/clients, lifecycle_stage_id 9398). Seit 02.09.: JEDER Lead wird zusaetzlich ins Google Sheet "IMPACT Website Leads Log" (ID 1nlA8MOSqYFwj-rI0SYRFh06-VmMTdoUPYEsHf3zwtlE, Drive ruben@) geloggt via Apps-Script-Webapp (Projekt "IMPACT Website Lead Log" in script.google.com, env LEADLOG_URL + LEADLOG_TOKEN in Cloudflare Pages). Status-Spalte: ok | dublette_ergaenzt | dublette_NICHT_ergaenzt | error_signin | error_add | error_exception. Mail-Routing (Script v3, 02.09.): JEDE erneute Anfrage (dublette_*) und jeder error_* geht per Mail an den Studio Manager des Standorts: Zuerich -> abdi@, Winterthur -> bogdan@, unbekannter Standort -> ruben@; Leads mit Vorname "Testlead" gehen immer an ruben@ (Testschutz). support@ bekommt KEINE Mails (Entscheid Ruben). Sheet-Zeitzone wird vom Script auf Europe/Zurich gesetzt. Dubletten (E-Mail existiert im CRM): bestehender Client wird per Lookup gefunden und Message/Tags (repeat-lead-DATUM) ergaenzt, Lifecycle-Stage bleibt (Entscheid Ruben). Token liegt nur in Cloudflare-Env + Apps-Script-Code. exercise.com-Listenformat: GET /api/v2/clients?email= liefert {client:[...],meta} (Array unter Singular-Key); Update via PUT /api/v2/clients/{id} (verifiziert 02.09., Client 3024406 = Testlead "Websitelog", darf im CRM geloescht werden). Sheet ist mit support@ geteilt (Schreibrecht). Testzeilen vom 02.09. 00:05-00:15 im Sheet sind Tests.
- Kids-Seiten (little-ninjas): eigene Little-Ninjas-Zeiten-Sektion (#kidsched, JSON in #lndata) mit gleicher Live-Merge-Logik wie der Stundenplan (Trainer-Update/Zeitverschiebung via /api/schedule, nie entfernen). Bei Aenderungen am LN-Plan BEIDE Stellen pflegen: stundenplan-spdata UND lndata der Kids-Seite. Hero-Videos: Desktop = Hintergrund (SD, ZH-Home) bzw. daneben (Kids), Mobile = 16:9 volle Breite UNTER dem Text (SD, ZH-Home) bzw. Hintergrund (Kids); Cinema-Modus (Text weg bei Sound) nur wo Video hinter dem Text liegt. Videos IMMER H.264 8-bit yuv420p + AAC (main-trailer war H.264 High-10 ohne Ton - 31.08. neu codiert; Quellen in ~/Desktop/Impact/IMPACT Trailers).
- Kursseiten-Konventionen: Review-Sektion heisst 'Reviews.' (idx MEMBERS); jede Kurs-FAQ hat die city-spezifische Standortfrage (ZH: 3 Gehmin vom HB); Topbar enthaelt 'English' -> /en/ (redirect auf / bis EN-Version existiert). Kids-Seiten: Benefits direkt unter Hero, Reviews-Sektion (Edwin-Roth-Zitat vom LN-Profil), Trainingszeiten-Widget, Eltern-FAQ mit FAQPage-Schema. Stundenplan-Desktop: beide Staedte 3 Tage + Tabs.
- Kursübersichten /{stadt}/kurse/: Foto-Grid (.kgrid/.kcard), alle 9 Karten mit Foto (Ringen: /assets/wf/a1372fc2..., Little Ninjas: /assets/kids-10-14.png).
- /termin/ + /en/booking/: versteckte Anmeldegespräch-Seiten (After-Trial-Sales via Gioele Perretta, Telefon/Google Meet). Dauerhaft noindex, NIE in Nav/Sitemap. Buchung nativ via exercise.com (Entscheid Ruben 01.09., KEIN Calendly): iframe auf `/a/booking/?serviceId=38595&staffId=3102737&embedded=true&iframe=true&web_embed=true` + Fallback-Link (gleiche URL ohne embed-Params, neuer Tab). Service "Anmeldegespräch" 30min in exercise.com: public (nötig für Gast-Buchung, erscheint dadurch auch auf /a/booking/ zwischen den Klassen), ohne Account buchbar, nur für Accounts ohne je gekauftes Package, Cutoff 2h, Location versteckt; Gioeles Slots Mo-Fr 12-13 + 18-19 (2 Availability Schedules). Gioele-Karte (.gcard) nutzt Team-Foto /assets/wf/b37d63dc-gioele-l.jpg. Kein Conversion-Event mehr (Cross-Origin-iframe; Buchungen in exercise.com unter Visits sichtbar).

- **Training-Plan-Tool** `/training-plan/` (seit 02.09.2026 im Repo, vorher Webflow-iframe auf steady-tulumba-054bc6.netlify.app): eine selbst-enthaltene HTML-Datei (EN, ~920 KB, Bilder als data-URIs). Stundenplan liegt hart im JS (`const SCHEDULE`, nur Erwachsenenkurse, keine Little Ninjas/Open Mat) und wurde am 02.09. mit dem Website-Stundenplan (#spdata in /{stadt}/stundenplan/) abgeglichen; bei Stundenplan-Aenderungen SCHEDULE mitpflegen. Regelwerk = Google Doc "IMPACT Training Plan — Rule Book v1.9" (Drive-Ordner 1aPbGT8sMrcs8PVtpQBt-Ox5U7KtaPjfl). Share-Link im Tool zeigt auf www.impact-martialarts.com/training-plan?... (Query-Parameter werden vom Tool selbst gelesen). Nicht in Sitemap/Nav, kein noindex (wie frueher). REGEL-UPDATE 03.09.2026 (Rule Book v2.0, Entscheide Ruben): vier Zeitfenster morning/midday/early (16:30-17:40)/late (18:50-20:00), alte Links `w=evening` = early+late (normWin), Doppel im Abend nur back-to-back <=90 Min; Selbstverteidigung + "Not sure" = Bundle mit Street-Defense-Anker (nur ZH Di 17:40) und Samuel als fixem Kontakt, in WT Boxen+BJJ mit Hinweis, Street Defense bewusst NICHT im Art-Picker; MMA-Mix fuer jedes Ziel (auch defense) mit hartem Drittel-Cap und Wrestling/Muay Thai/BJJ je mindestens einmal vor zweiter MMA-Stunde/Boxen; Tagewahl bewertet alle Kombinationen (Stundenzahl > Disziplin-Abdeckung > Abstand > Level > Abend), Klassen je Tag "engster Tag zuerst"; richtige Kampfkunst schlaegt Level (kein Near-Wechsel wegen Basics), dafuer Hinweis wenn weniger als die Haelfte Basics; immer ein kompletter Ruhetag (Heim-Einheiten auf freie Tage minus einen, nie zwei am Tag, Rest geteilt mit Einzel-Mattentag "hours apart", Sonntag kein fixer Ruhetag); Compete + Fitness Kickboxing = Plan wie gehabt + Hinweis + Sergei, Near-Map FKB -> Muay Thai/Boxen. plan.js kennt die Fenster early/late (Label). NACHTRAG 03.09. (Ruben): im MMA-Plan kommt die ERSTE MMA-Stunde vor Wrestling/Muay Thai/BJJ (1 Tag = 1 MMA-Stunde); Kontakt muss die gewaehlte Kunst am Standort unterrichten (`pickContact`: MMA -> Joao, sonst Laszlo/Nathan wenn im Plan, NIE Sergei; Compete+FKB -> Sergei fix; Bundle ZH -> Samuel fix); Tagewahl: Abstand 2 reicht, groesserer Abstand nur Tie-Breaker nach Level. REGRESSION vor jedem Push: `.venv/bin/python tools/training-plan-check.py` (laedt die Datei headless mit Share-Links, druckt Kontakt/Stunden/Hinweise, meldet Page-Errors).

- **Danke-Seiten + Training-Plan-Block (02.09.2026):** `/probetraining/danke/` und `/en/trial/thanks/` haben unter den drei Schritten den Block `#plan` (Kicker/Titel/Text/CTA `#planlink`, DE mit Hinweis 'Das Tool ist auf Englisch'). Alle 38 Formulare (probetraining, en/trial, 36 Kurs-LPs) leiten nach dem Submit mit `?loc=<Standort>&dis=<Disziplin>` (Formularwerte, keine Personendaten) auf die Danke-Seite; das `/*planlink*/`-Script mappt das auf `/training-plan/?loc=z|w&a=<art>` (Street Defense -> `g=defense&a=explore`, Personal Training -> nur loc) und blendet den Block bei Little Ninjas aus (Tool ist nur fuer Erwachsene). Body der Danke-Seiten scrollt jetzt (overflow-x:hidden statt overflow:hidden). Marker-Regel: `/*tiktok*/` gehoert INNERHALB des Script-Tags (stand nach dem TikTok-Pixel-Commit ausserhalb und war auf 84 Seiten als Text sichtbar, 02.09. gefixt).

TEAM-SHEET (04.09.2026 mittags, Entscheid Ruben): eigene Datei "IMPACT Team" (ID 1mU0eQbnn02JoH6yg1v-o8-ACei44mLiirWNTP1-avjg, gleicher
Drive-Ordner wie das Leads-Log), weil Google nur pro Datei teilt. Tabs: Events (Werte-Spiegel des Events-Tabs aus dem Leads-Log, stuendlich,
nur Ruben editiert), Probetrainings ZH (Schutz: nur Ruben + abdi@), Probetrainings WT (nur Ruben + bogdan@). Freigabe per teamShare():
Editoren abdi@/bogdan@, Leser support@. setupTeam() einmalig ausgefuehrt (Backfill ab 01.08., Tabs aus dem Leads-Log geloescht, setupAnalyse).
Im Leads-Log: Tab "Wochenreport" (ersetzt Leads-Analyse; buildWochenreport(main, team) baut den ganzen Funnel pro Woche als Werte:
Leads je Standort/Kanal/Interesse aus Daten, Trials/No-Shows/Verkauft (Vertragswoche)/Kohorten-Quote/Anrufe aus dem Team-Sheet; laeuft mit
jedem Probetrainings-Lauf). "Leads Historie" geloescht: HISTORY liegt als leads_web in MonatsHistorie (migrateHistorie), Monatsabschluss zeigt
Monate ab Januar 2026 und unten Bloecke "Website-Leads nach Kanal/Interesse" (COUNTIFS auf Daten, Spalte J = Kanal: Klick-ID > UTM > Referrer).
TEAM-SHEET LAYOUT AB 04.09. ABENDS (Entscheid Ruben): Personenliste hat KEINE manuellen Spalten mehr. Aufbau je Tab:
A..G Tagesblock LINKS, auf Hoehe der Personen dieses Tages (erste Zeile der Gruppe traegt die Werte; Tage ohne Personen bekommen
eine eigene Zeile): Tag, Anrufe versucht*, Anrufe gefuehrt*, Placed Trials, Trials, No-Shows, Verkauft (* = einzige Eingaben).
H..Z Personen (CI, 19 Spalten): Trial-Datum, Name, Art, Klasse, Trainer, Gebucht von, Kanal, Personen, Lifecycle-Stage, Pruefen,
Abschluss am, Verkaeufer, Paket, Letzte Notiz, CRM, Buchung erstellt am, UID (versteckt), NS (versteckt), Stand.
AB..AE "Zahlung offen": Stage "Signed but no payment", unabhaengig vom Trial-Fenster, aelteste zuerst, ab 30 Tagen rot.
No-Shows werden aus der versteckten NS-Spalte gezaehlt, nicht aus Art: wer nach einem No-Show neu bucht, zeigt "Gebucht (kommend)",
der No-Show bleibt in der Tageszahl und als Notiz auf der Art-Zelle (Fall Ghulam Reza Kazimi, 02.09. No-Show, 16.09. neu gebucht).
Placed Trials = an dem Tag angelegte Buchungen (Re-Buchung verschiebt die Zaehlung auf den neuen Tag, bewusst so).
Abschluss am = Waiver-Unterschrift, NICHT Abo-Start: seit 01.08. weichen 20 von 79 Faellen ab, 7 davon im Monat (Beispiel Gianna
Kling 13.08. unterschrieben, Abo ab 01.09.). Monatsabschluss fuehrt deshalb "Verkaeufe (Vertrag unterschrieben)" + "davon Zahlung
noch offen" getrennt von "Abos gestartet". Mail: 12:00 mittags (Sales-Start), vorerst nur an Ruben (TR_MAIL_TEAM=false), Inhalt:
Heute, Gestern, Pruefen, Zahlung offen ab 7 Tagen, Monatsstand. Trigger-Umstellung laeuft ueber TR_TRIG_VER + ScriptProperties,
der naechste Stundenlauf zieht sie selbst nach. Stand "Zahlung offen" 04.09.: 19 Faelle, 8 davon aelter als 30 Tage (aeltester
Obada Aljabawi seit 04.06.).
LEHRE 05.09. 09:10: Der Stundenlauf stand seit 04.09. 20:36 still (Mails "[Team] Probetrainings FEHLGESCHLAGEN"): das Lifecycle-
Fenster ueber 180 Tage (fuer "Zahlung offen") liefert `too_large`. Reports haben ein Groessenlimit pro Fenster - lifecycle laeuft
jetzt in 45-Tage-Bloecken (life1..life4, `lifeKeys(U)` in klassen.js), detailed_visits weiter in 4-Wochen-Bloecken. Bei jeder
Fenster-Vergroesserung eines Reports also zuerst an too_large denken. ZWEITE LEHRE 09:52: JEDER Report-Typ hat genau EINEN
Server-Cache, auch ueber verschiedene Datumsfenster (Block 2 zeigte "Start Date" von Block 1) - nicht nur bei Standortfiltern.
Mehrere Fenster desselben Reports gehen deshalb nur nacheinander: Phasen `lr` (refresh Block i) und `lg` (abholen, kompakt je
E-Mail: [email, letztes Datum, Current, Location, Name, Datum "Signed but no payment"]) im Apps Script zwischen t2 und t3, 8-s-Polls;
t3 bekommt die Liste als `p.life`, `lifeExpand()` macht daraus wieder Report-Zeilen. Genau so laufen v1/v2 (v2 wird erst in t2
nach dem Abholen von v1 angestossen).
LEHRE 05.09. 10:10: `Sheet.clear()` laesst Zahlenformate stehen - nach dem Wochenreport-Umbau standen alte Prozent- und Datumsformate
unter neuen Zahlen ("2700 %", "15.01.1900"). clearSheet setzt deshalb das ganze Blatt per clearFormat()+setNumberFormat('General')
zurueck; jeder Builder setzt seine Formate danach selbst. Erster erfolgreicher Lauf mit Lifecycle-Bloecken: 05.09. 10:08.
RUN-TRICK 05.09. 10:07: In einem FRISCHEN Editor-Tab funktioniert der Weg `function RUN_NOW() { ... }` als erste Zeile einfuegen ->
Cmd+S -> Seite neu laden (RUN_NOW ist vorgewaehlt) -> Klick auf "Run" (Vollbild-Koordinate ca. 458,86) -> Zeile entfernen, Cmd+S.
Die laufende Ausfuehrung nutzt den Code-Stand beim Start, das Entfernen der Zeile stoert sie nicht.
EDITOR-PASTE NEU (05.09., viel einfacher als Zwischenablage/Diff): das Repo ist oeffentlich, also im Editor
`fetch('https://raw.githubusercontent.com/rubenIMPACT/website/main/tools/leadlog-apps-script.gs')`, Token-Zeile vorher aus dem
Modell sichern (`window.__tk`), im geholten Text den Platzhalter per `.replace(/^var TOKEN = .*$/m, () => tk)` ersetzen, dann
`model.pushEditOperations([], [{range: model.getFullModelRange(), text: next}], () => null)` und synthetisches Cmd+S. Keine
Umlaut-Probleme, kein Token im Kontext.
MONATSABSCHLUSS-UMBAU (Ruben 05.09.): Spalte A eingefroren (Methodiktext liegt deshalb in B2:N2, A2 nur "Methodik" - eine
Verbindung ueber die Einfrier-Grenze verbietet setFrozenColumns). Interessen stehen nicht mehr als Zeilen in der Liste, sondern
nur noch im Diagramm; Kanaele bleiben als Zeilen unter den Standorten. Vier Diagramme je Standort rechts ab Spalte O
(Funnel Leads/Probetrainings/Abos/Kuendigungen, Quoten, Kanal gestapelt, Interesse gestapelt), Diagrammdaten grau unter den
Bloecken (Tabellen sind nur 13 Zeilen hoch, deshalb keine Kollision zwischen den Standorten). Neue Kennzahlen: "Quote Verkaeufe /
Probetrainings" und "Quote Verkaeufe / Leads (alle Quellen)". "Leads" im Diagramm = leads_all, fuer Monate ohne diesen Wert
(vor August 2026) die Website-Leads. Nachberechnung ganzer Monate laeuft ueber MA_CATCHUP/maQueueCatchUp: der Stundenlauf legt
einen Einmal-Trigger `maCatchUp` an, der die Monate aus MA_CATCHUP_MONTHS einzeln abarbeitet (ein Monat je Ausfuehrung wegen des
6-Minuten-Limits). Marke aendern = Nachlauf laeuft erneut.
WOCHENREPORT-UMBAU (Ruben 05.09. 09:45): gleiche Logik wie der Monatsabschluss - Kennzahlen als Zeilen, Zeit als Spalten, je Standort
ein Block in der Reihenfolge Leads, Anrufe gefuehrt, Trials, Verkauft (Offene Pruefungen = rote Zeilen im Team-KPIs-Sheet, nur "Stand
jetzt"), dann Gesamt. Funnel-Tabelle: 16 Wochen als Spalten (laufende Woche gelb markiert), je Standort Leads + Kanalzeilen grau,
Anrufe, Trials, No-Shows, Verkauft, Quote; Gesamt zusaetzlich Delta % Leads und Dubletten. Spalte A eingefroren, Methodik in B2:N2.
Diagramme rechts ab Spalte S, links Zuerich, rechts Winterthur (Funnel-Linien, Kanal, Interesse), Diagrammdaten grau unten.
Die Kohorten-ANZAHL ("Kohorte: Probetrainer des Monats mit Abo bis heute") ist aus dem Monatsabschluss raus (Ruben: Zeilen 34/87
unnoetig), die Kohorten-Quote bleibt. Das Team-Sheet heisst seit 05.09. "Team KPIs" (Datei-ID unveraendert, TEAM_ID).
STUNDENLAUF-MINUTE: installTrialTriggers legt everyHours(1) neu an, Google waehlt dann eine neue Minute - seit 04.09. 20:36 laeuft der
Lauf um :52 (vorher :32). Beim Pruefen eines Laufs also erst die letzte Fehlermail bzw. den Stand-Stempel im Tab anschauen.
EDITOR-TAB HAENGT (05.09. 09:47): nach dem zweiten fetch/pushEditOperations reagierte der Tab nicht mehr (Script injection timed out,
selbst setTimeout lief nicht weiter). Ausweg: neuen Tab oeffnen, Editor dort laden, gleiche Prozedur, alten Tab schliessen.
WERBEKOSTEN + LTV (05.09.2026 vormittags, Entscheide Ruben: alles automatisch, keine Handeingabe; Agentur 3'800 EUR/Monat mit und
ohne ausweisen, weil sie gekuendigt wird; LTV auf Netto-Umsatz mit allem; Kohorten nur aus nicht migrierten Kunden):
- Supermetrics-Trial ist am 20.07.2026 abgelaufen (Meta + TikTok verbunden, Google Ads nicht) - NICHT nutzen. Stattdessen:
  Google Ads = Google-Ads-Skript `tools/google-ads-spend-script.js` (Ruben fuegt es im Konto 831-058-5625 unter Tools > Skripte ein,
  taeglich 06:00, schreibt Upsert der letzten 14 Tage direkt in den versteckten Tab WerbekostenDaten); Meta = klassen.js action `ads`
  (Graph API v23, Konten act_1029100348842658 IMPACT + act_744755113940510 Little Ninjas, Env META_ADS_TOKEN = System-User-Token
  ohne Ablauf mit ads_read, legt Ruben im Business Manager an), Apps Script runWerbekostenDaily 06:30; TikTok noch offen
  (Vorschlag: Report-Mail aus dem Ads Manager parsen). Kampagnennamen tragen bei Meta und Google den Standort (Zuerich/Zürich/
  Winterthur), wkLocOf() ordnet zu, sonst "Beide" und Split nach Tab Einstellungen.
- Tabs: WerbekostenDaten (versteckt: Datum|Plattform|Konto|Kampagne|Standort|Kosten CHF|Klicks|Impressionen|Stand), Werbekosten
  (Monatsmatrix je Standort + Kampagnen 30 Tage), Einstellungen (persistent, nie geloescht: Agentur EUR/Monat, von, bis, EUR in CHF
  0.94 = ANNAHME, Split ohne Standort 0.5). Agenturkosten werden nach Media-Anteil auf die Standorte verteilt.
- Monatsabschluss je Standort Block "Werbung und Kundenwert": Media (davon je Plattform), Agentur, CPL gesamt und je Kanal (Leads
  nach Klick-ID), Kosten je Probetraining, Verkaeufe je Lead-Kanal (Metrik sales_kanal:<Kanal>, E-Mail der Vertragsunterschrift
  gegen trLeadMap), CAC Media, CAC inkl. Agentur, CAC je Kanal, LTV-Prognose (Metrik ltv_forecast), LTV:CAC, Payback. Quoten sind
  Sheet-Formeln auf die Zeilen des Blocks; leere Zellen zaehlen in Sheets als 0, deshalb IF(OR(...="")) statt IFERROR.
- LTV: klassen.js action `ltv` (Report charges je Monat, Phasen cr/cg, Netto = Betrag - Refund - anteilige MwSt aus Spalte Tax; "Net
  After Refunds" des Reports ist nach Stripe-Gebuehr, nicht nach MwSt). Apps Script: Tab ZahlungenMonat (versteckt, je Monat/Kunde/
  Kaufart), runLTV in Etappen (max. 4 Monate je Ausfuehrung, Kette ueber Einmal-Trigger runLTVChain, Script-Lock), Nachladen ab
  LTV_START 2025-06 ueber LTV_INIT-Marke im Stundenlauf, monatlich runLTVMonthly am 1. um 05:00. Tab LTV: je Standort Kennzahlen
  (ARPU letzte 3 Monate, Retention letzte 6 Monate, Dauer 1/(1-r), Prognose-LTV, realisierter Umsatz Abgesprungener) + Kohorten
  (Startmonat, kumuliert nach 3/6/9/12 Monaten, noch aktiv, Spalte Kohorte = Migration/Neukunden).
  METHODE (verfeinert 05.09. 10:56, nach dem ersten Lauf): Kunde = mindestens eine Abo-Zahlung, Testzahlungen < CHF 5 raus (Waseem/
  Ruben Aug-Sep 2025). Die Migration lief GESTAFFELT (ZH Dez 2025 bis Maerz 2026 = 515 Kunden, WT nur Okt 2025 = 53, WT ist der
  neue Standort): Migrationsmonate = Kohorte > 2x Median der letzten 5 Monatskohorten, zusammenhaengend vom Anfang; Neukunden =
  Kohorten danach (ZH ab Apr 2026: 239, WT ab Nov 2025: 269). Vorauszahlungen: eine Abo-Zahlung deckt round(Betrag/Median einer
  Abo-Zahlung) Monate (max 12), sonst gaelten Quartals-/Jahreszahler als abgesprungen. ARPU, Retention und Prognose nur aus den
  Neukunden. Erster Stand 05.09.: ZH ARPU 216, Retention 90.8 %, Dauer 10.9 Monate, LTV 2'344; WT 171 / 92.7 % / 13.8 / 2'358;
  WT-Kohorten liegen nach 9 Monaten bereits bei ~1'750 kumuliert mit 75-86 % aktiv - die Prognose ist konservativ (junge Stichprobe).
  ENTSCHEID RUBEN 05.09. 12:00 (nach Pruefung): VERLOREN ist nur, wer offiziell gekuendigt hat (cancelled_subscriptions, Ended At,
  ohne Converted) oder wegen Nichtzahlung rausfliegt (Lifecycle-Uebergang nach "Debt collection"). Zahlungsluecken zaehlen NICHT -
  der LTV-Check hatte gezeigt, dass viele "Verlorene" im uebernaechsten Monat wieder zahlen (Kartenfehler, Pausen; der Charges-Report
  enthaelt nur erfolgreiche Zahlungen). Bereinigt lag die Verlustquote bei ZH 4.1 % / WT 2.9 % je Monat statt 9 %. Migrierte werden
  jetzt ueber die Tags erkannt (Migrating / imported 2025/11/10 / imported 2025/11/26 / Bexio; Tab KundenFlags aus der v2-Clients-API,
  action clients_flags, 4'347 Konten). Drei Monatsreihen: ZahlungenMonat, KuendigungenMonat, LifecycleMonat (Uebergaenge nach
  Debt collection / Inactive / Client), alle ueber action 'ltv' mit kind charges|cancelled|lifecycle. Tag-Double-Check der Trials
  (Ruben): Konten mit Tag "Trial Winterthur" erstellt im August 2026 = 119 (ZH 102) vs. 137 Trial-Booked-Uebergaenge / 84
  stattgefunden - die Zahlen halten. Funnel-Diagramm im Monatsabschluss hat jetzt "Probetrainings gebucht" zwischen Leads und
  Probetrainings. STAND 05.09. 13:30 (neue Definition, Kette nach zwei Neustarts durch - Lehren: 502 bei grossen Reports weiter pollen,
  ein Abruf kann 2 Minuten dauern, deshalb Zeitbudget 150 s je Ausfuehrung plus Sicherheitstrigger VOR dem Abrufen): ZH 754 Abo-Kunden,
  349 migriert per Tag, 405 Neukunden, ARPU 178, Verlustquote 2.6 %/Monat (alle inkl. migriert 3.2 %), Dauer 39 Monate, LTV 6'956;
  WT 322 Kunden, 0 migriert (neuer Standort), ARPU 153, Verlust 2.0 %, Dauer 51 Monate, LTV 7'800. Vorbehalt: 80 (ZH) / 27 (WT)
  Abos mit Kuendigung auf Periodenende sind noch nicht wirksam - die Verlustquote steigt in den naechsten Monaten.
- GOOGLE-ADS-SKRIPT LIVE (05.09. 11:03, in Rubens Chrome eingerichtet): Skript "Werbekosten -> Analytics Sheet" (scriptId 12252568)
  im Konto 831-058-5625, autorisiert (Sheets + Ads, 2FA per Gmail-Prompt durch Ruben), taeglich 06:00-07:00. Erstlauf 400 Tage:
  ab 2025-08-01 (der Drive-Export schneidet versteckte Tabs bei ~275 Zeilen ab - daraus entstand kurz die FALSCHE Aussage einer
  Spend-Luecke Feb-Aug 2026; der Tab Werbekosten zeigt die volle Historie: WT durchgehend seit Okt 2025, 470 -> 885 Jan -> ~2'300
  Maerz-Mai -> ~3'000 Jun-Aug; ZH Erwachsene seit Okt 2025 pausiert, ab Feb 2026 nur Little Ninjas 165-456, ab Jun plus Search,
  Aug 946). LEHRE: Zahlen aus versteckten Daten-Tabs nie aus dem Drive-Export ableiten, immer aus dem gebauten Tab oder per Script. Der Ads-Editor ist CodeMirror 5: `document.querySelector('.CodeMirror')
  .CodeMirror.setValue(txt)` mit txt per fetch von raw.githubusercontent ersetzt den Code sauber (kein Tippen, keine Auto-Klammern);
  danach Save, Run > "Run without preview". Frequenz ueber die Scripts-Liste (Spalte Frequency, Stift).
- Probe-Aktion `probe` in klassen.js + PROBE_REPORTS im Apps Script (Ergebnis per Mail) fuer kuenftige Report-Erkundungen.
  Reports mit 403 fuer den API-User: payments, transactions, invoices, client_charges, revenue, refunds, started_subscription.
BANKABGLEICH + CASH-BLOCK (06.09.2026, Entscheid Ruben nach Abgleich mit den UBS-Kontoauszuegen Juni-August): Stripe zahlt EXAKT
7 Kalendertage nach der Belastung aus (Wochenende -> Montag); mit dieser Verschiebung stimmen Juli/August auf 0.2 % mit dem Konto
(beide Standorte zusammen). Ein Bankmonat = Belastungen ~24. Vormonat bis ~23. - deshalb sehen Monatsabschluss (Belastungsdatum)
und Konto je Monat um bis zu +-9'500 CHF anders aus, ueber 3 Monate aber fast gleich. Weitere Unterschiede: Stripe-Gebuehr 2.05 %,
Rueckerstattungen, Sales-by-Category liegt 1-2k/Monat unter den Charges (nicht kategorisierte Einmalkaeufe), Ueberweisungen ohne
Stripe (nur ZH, 700-4'600/Monat, fehlen in exercise.com). GEBAUT: vierte LTV-Monatsreihe ZahlungenTag (action ltv kind sums:
Datum|Standort|Anzahl|Betrag|Gebuehr|Refund|MwSt|Auszahlung), Cash-Block je Standort im Monatsabschluss (Zahlungen inkl. MwSt,
Rueckerstattungen, Gebuehren, MwSt, Umsatz ohne MwSt, Auszahlung nach Belastungsdatum, erwarteter Bankeingang nach 7-Tage-Regel,
Bankeingang laut Tab Bank, Differenz, Ueberweisungen). Tab Bank ist persistent (Month|Location|Stripe credits|Transfers|Note),
vorbefuellt Juni-August aus den PDFs; spaeter UBS-CSV-Import. Lehre: Monatsabschluss "netto" = nach Stripe-Gebuehr, NICHT ohne MwSt.
TEAM-TABS AB 06.09. (Ruben): Spalte "Personen" weg (zwei Kinder = Zeile kopieren und Namen aendern; Kopien mit gleicher UID und
anderem Namen bleiben bei jedem Lauf erhalten, `extras` in trUpsert), neue Spalte "Vertragsstart" (Abo-Start, sale.start) hinter
"Abschluss am", CI: date0 name1 art2 cls3 coach4 booked5 kanal6 lifecycle7 check8 contract9 start10 seller11 pkg12 note13 crm14
created15 uid16 ns17 stamp18. Kanal ohne Website-Lead zeigt die exercise.com-"Source" in Klammern. Der Block "Zahlung offen"
(AB..AE) ist RAUS aus den Team-Tabs: eigenes Sheet "IMPACT Open Payments" (paySs(): beim ersten Lauf angelegt, ID in Script
Properties 'payId', im Team-Ordner; Tab "Open payments": Name|Location|Signed since|Days open|Lifecycle stage|Last note|CRM|Updated,
beide Standorte, aelteste zuerst, ab 30 Tagen rot; PAY_ACCESS = Bearbeiter, z. B. Waseem - Ruben nennt die E-Mails); Tagesmail
"[Open payments]" 12:00 an Ruben (+PAY_ACCESS), die Mittagsmails an Abdi/Bogdan enthalten keinen Zahlungsteil mehr. Alte
Datenvalidierungen (Dropdown "Gespraech") blockierten am 06.09. 09:48 das Schreiben (J172) -> clearDataValidations vor jedem Lauf.
RUNDE 06./07.09. (Ruben: "ganz langsam", nichts ist im Team veroeffentlicht): (1) MAILS: alle Script-Mails gehen nur an Ruben;
einzige Ausnahme sind die Website-Lead-Warnungen (routeTo -> abdi@/bogdan@ je Standort, seit dem Launch, Ruben gefragt ob auch die
vorerst an ihn sollen). Fehlermails laufen ueber mailOnce(key, subject, body): hoechstens eine je Problem und Tag (Script Property
errmail = {signatur: tag}); Signatur = key + erste 60 Zeichen der Meldung. Die Probe-Funktionen (PROBE_*, LTV_CHECK) sind geloescht,
die Cloudflare-Endpunkte probe/probe_clients bleiben (keine Mails). (2) FREIGABE: TEAM_SHARED=false -> teamShare() ENTFERNT abdi@,
bogdan@ (Editoren) und support@ (Leser) vom Team-KPIs-Sheet; Stundenlauf prueft die Marke (Property teamShareVer). Beim Einfuehren
auf true setzen. (3) BANK-TAB neu: Month|Location|Stripe credits|Adyen|Customer transfers|Other credits (no revenue)|Note (altes Layout
wird beim Lesen ersetzt, Header-Vergleich). Meine erste PDF-Auswertung hatte nur Eintraege mit Betrag auf der Folgezeile erfasst -
Nicht-Stripe-Eingaenge ZH real: Juni 30'804 (Personen/Stiftungen 11'862, Adyen 3'102, Staat 15'841), Juli 8'953, Aug 4'108; WT 100 %
Stripe. Adyen N.V. zahlt woechentlich aus (Zuordnung offen, Ruben gefragt); Mitglieder-Ueberweisungen (229/359, zwei Dauerauftraege)
fehlen in exercise.com. Monatsabschluss-Cash: "Umsatz ausserhalb Stripe" (Adyen + Kundenueberweisungen), "Uebrige Eingaenge (kein
Umsatz)", "Bankeingang gesamt". (4) SHOW-UP-RATE statt No-Show-Quote (Zeile showup_rate = 1 - noshow_rate, Quoten-Grafik gruen; alle
Linien sollen nach oben zeigen). (5) WerbekostenDaten wird in wkRead() versteckt (der Google-Ads-Skript-Lauf hatte den Tab sichtbar
angelegt). (6) LTV-KOHORTEN: Zeilen unter 10 Kunden oder juenger als 3 Monate grau (100 % bei 2 Kunden / ohne wirksame Kuendigung).
(7) KUNDENWERT (Ruben: Starterpaket darf den Monatswert nicht verfaelschen): buildLTV rechnet je Kunde abo (Abo-Netto, Jahres-/
Halbjahreszahler ab 3x Median-Monatszahlung auf die bezahlten Monate verteilt, coverOf), one (Einmalkaeufe), pay (Monate mit
Abo-Deckung). Starterpaket = Einmalkaeufe im Fenster +-1 Monat um die erste Abo-Zahlung (starterOf), uebrige Einmalkaeufe = Rest
(otherOf). LTV-Tab: Oe Monat = Abo + uebrige Einmalkaeufe je aktivem Neukunden (3 Monate, ohne Starterpaket); LTV = Oe Monat x Dauer +
Starterpaket; Monatlicher Kundenwert = Oe Monat + Starterpaket/Dauer. Monatsabschluss-Block "Kundenwert (aus Zahlungen, Tab LTV)" je
Monat ueber ALLE Kunden inkl. migriert: cv_paying, cv_abo, cv_other, cv_starter, cv_month (MonatsHistorie, geschrieben von buildLTV
ueber maStoreMetricsMany in einem Rutsch); Payback = CAC inkl. Agentur / cv_month (laufender Monat leer, weil Charges nur bis zum
letzten vollen Monat geladen werden).
NACHTRAG 07.09.: In Zuerich wird das Starterpaket meist mit der ersten Abo-Belastung in EINER Charge abgebucht (Purchase Type
"Subscription/Package, ProductVariant", Juni 35 Charges a ~415) und landet damit im Abo-Netto - deshalb war cv_starter ZH 12-75 vs. WT
~150. Heuristik in buildLTV: Mehrbetrag der ersten Abo-Zahlung gegenueber der ueblichen (Median der spaeteren) Monatszahlung des Kunden
(wenn > 1.5x und > 20 CHF) wandert von abo nach one (c.bundled). Monatsabschluss-Spalten ab MA_FROM = 2026-01 (die Kundenwert-Reihen
reichen bis Jun 2025 zurueck und haetten das 12-Monats-Fenster sonst nach Okt 2025 verschoben).
META ADS LIVE (07.09.2026): Meta-Werbekosten laufen ueber die Marketing API. Setup: Meta-for-Developers-Konto (Ruben, Handy-
Verifizierung), App "IMPACT Analytics" (ID 1756500978891417, Use Case "Create & manage ads with Marketing API", Portfolio Impact
Martial Arts, Business-Verifizierung abgeschlossen), System-User "Conversions API System User" (ID 61556572779052) mit den
Werbekonten IMPACT Martial Arts + Little Ninjas (View performance) und der App (Develop app); Token: Ablauf nie, Berechtigung
ads_read, von Ruben erzeugt und als Secret META_ADS_TOKEN in Cloudflare Pages (Projekt website) eingetragen; neues Deployment noetig,
weil Pages Secrets erst beim naechsten Deploy in die Funktion kommen. Erster Lauf runWerbekosten 07.09. 11:23: 60 Zeilen fuer
14 Tage. Historie seit 2025-10 per RUN_NOW monatsweise nachgeladen (klassen.js metaAds pagt mit limit=500). Ich erzeuge/kopiere
KEINE Tokens (Ruben klickt "Generate token" und "Save"); LEADLOG_TOKEN liegt in Cloudflare als Typ "Text" im Klartext - Ruben
gebeten, ihn als Secret neu anzulegen. Meta-Business-Suite-Dialoge oeffnen im MCP-Tab oft erst beim zweiten Klick (Viewport 1000x515),
Dialog-Optionen per find() + ref klicken; Klassifizierer blockt Batches mit "Escape"-Taste im Token-Dialog.
ADYEN = MAGICLINE (Ruben 07.09.): die woechentlichen Adyen-Gutschriften auf dem ZH-Konto sind Auszahlungen des alten Studio-Systems
Magicline (Mitglieder, die noch dort abgebucht werden; Jun 3'102, Jul 4'811, Aug 2'104). Bank-Tab-Spalte heisst "Magicline (Adyen)",
Monatsabschluss "davon Magicline". Diese Mitglieder fehlen in exercise.com (Kandidaten fuer die Migration). Ruben ist nicht technisch:
Cloudflare-/Token-Dinge in einfachen Worten erklaeren, keine Fachbegriffe ohne Erklaerung.
TIKTOK LIVE (07.09.2026): Ads Manager "IMPACT Martial Arts AG" (aadvid 7649350938695876624), zwei Kampagnen mit Standort im
Namen ("UC // MK // Lead // Zuerich // Brand", "UC // Lead // Brand // Winterthur"), Spend seit 29.06.2026 (~25 CHF/Tag je
Kampagne). Custom Report "IMPACT TikTok" (reportId 7682730287242018834; Dimensionen Campaign name + By Day, Metriken Spend,
Impressions, Clicks (destination)) mit Scheduled running: taeglich (Zeitraum "Yesterday"), CSV, Empfaenger ruben@. Apps Script
tkImport() liest Gmail (Betreff "IMPACT TikTok", CSV-Anhang, letzte TK_DAYS Tage) im Werbekosten-Lauf 06:30; Gmail-Freigabe hat
Ruben am 07.09. erteilt (neuer Scope -> Autorisierungsdialog, blockiert bis dahin auch die Trigger). Historie 29.06.-06.09.2026
(137 Zeilen, 3'208.84 CHF) per RUN_NOW aus dem Bericht uebernommen: TikTok signiert seine API-Aufrufe (msToken/X-Bogus/CSRF),
Nachbauen scheitert; funktioniert hat ein XMLHttpRequest-Hook in der Seite, der die eigenen Requests des Berichts mitliest (und
per window.__wantPage die Seitenzahl im Body umschreibt, 20 Zeilen/Seite, page_size wird serverseitig gedeckelt). Lehren TikTok-UI
im MCP-Tab: Nav-Menues und Toolbar-Knoepfe (Save, Scheduled running, Export) reagieren nicht auf synthetische Klicks/dispatchEvent,
solange die Onboarding-Tour (.visual-guide-area) liegt; nach Speichern und Neuoeffnen des Berichts gingen die Knoepfe per find()+ref.
Pager ">" bleibt haengen; cmd+a im Namensfeld markiert die ganze Seite. TikTok-Report-Export = Download (nicht genutzt).
LESBARKEIT (Ruben 07.09., "ja" zum Vorschlag): Monatsabschluss zeigt je Standort ~35 Kernzeilen, Detailzeilen (MA_ROWS 4. Element 'd',
Kanal-Unterzeilen, put(..., {detail:true})) liegen in einklappbaren Google-Sheets-Zeilengruppen (shiftRowGroupDepth, Toggle BEFORE,
collapseAllRowGroups; clearSheet entfernt alte Gruppen). Kurzdefinitionen als Zellnotiz an der Zeilenbezeichnung (MA_NOTES, LTV kv[3]),
Methodik-Texte oben nur noch 2 Saetze (MA_NOTE/WR_NOTE/WK_NOTE), Volltexte (MA_NOTE_FULL, WR_NOTE_FULL, WK_NOTE_FULL, LTV_NOTE_FULL,
TR_T.de.rule) im Tab "Methodik" (buildMethodik, aus buildMonatsabschluss). Laufender Monat im Kopf "Sep 2026 (laufend)" per
Zahlenformat. Tab-Reihenfolge/-Farben: maArrangeTabs (MA_TAB_ORDER; Events/Cancellations gelb, Bank/Einstellungen gruen, Methodik grau).
Wochenreport: 16-Wochen-Block ohne Kanal-Unterzeilen, nur "davon bezahlt". dropTestRows() auch fuer Cancellations (First name/Last
name/Email/Reason, Wortgrenze, "Attest" bleibt). Team-Tabs: A2 = ruleShort mit Volltext als Notiz (Rebuild, wenn A2 abweicht),
"Gebuchte Trials" statt "Placed Trials" (de), Wochentage per Zahlenformat "Mo "dd.MM. (Wert bleibt Datum), Kanal "kein Web-Lead" mit
exercise.com-Quelle als Zellnotiz (r.srcNote -> kNotes), kuenftige Tage ohne Nullen, Events-Spiegel als letzter Tab, ZH/WT auf 1/2.
Rote Zeile mit Zukunftstermin = Pruefregel "booked" (Stage nicht Trial Booked), korrekt. LTV-Labels kurz, Spalte A 340.
PROGNOSE BIS 2030 IM MONATSABSCHLUSS (Ruben 07.09., nach Lektuere des alten Finanzplans
https://docs.google.com/spreadsheets/d/1RJ1UoQuiDBc52kNgRn3l5DfopAErSxsnI0X68vzvi60 und der Kopie ohne Expansion
https://docs.google.com/spreadsheets/d/1vBD3eIxE5huSL8k_s0ky--fVbhe_ugJkQD51RB6zxUw): Bloecke Zuerich, Winterthur, Gesamt untereinander,
Spalten = Monate ab MA_FROM (2026-01) bis MA_FC_END (2030-12) plus Jahressumme nach jedem Dezember (Summe fuer MA_ADD/Cash/Werbung,
Dezemberwert fuer MA_STOCK, Quoten aus Jahressummen per yearRule). Prognosemonate (> laufender Monat) blau (#e8f0fe, Kopf "Sep 26 P"),
Werte aus forecast(loc): Kunden(t) = Kunden(t-1) + Verkaeufe - round(Kunden x Verlustquote), Verkaeufe = Basis x Saisonindex (Ist-Verkaeufe
Zuerich 2025 aus dem alten Plan), Abo-Umsatz = Kunden x Abo-Wert (+Preisanpassung %/Jahr), + Starterpaket x Verkaeufe + uebrige Einmalkaeufe
x Kunden + Magicline-Abbau (ZH, ab letztem Bank-Wert). Annahmen im Tab Einstellungen ("Prognose: ..." + 12 Saisonindizes; leer = automatisch
aus den letzten 6 bzw. 3 Monaten / Tab LTV; stGet traegt fehlende Defaults nach). Gefuellte Prognosezeilen: sales_signed, cancellations,
net_growth, cv_paying, cv_abo, cv_starter, cv_other, abo_paid, cash_net, cash_paid (x1.081), cash_nonstripe/cash_adyen. Verwendete
Annahmen stehen im Tab Methodik (MA_FC_INFO). GESAMT: gOf() summiert MA_ADD-Keys, rechnet Quoten aus Summen (Kohorten ueber Tab Kohorten),
LTV/Kundenwert aus dem Gesamt-Durchgang in buildLTV (loc 'Gesamt', L = alle Kunden). Neue LTV-Stores: abo_paid (Summe Abo-Netto),
cv_other_sum, cv_starter_sum, cv_new, ltv_loss_all. STICHTAGSZEILEN (active_subs, paused_subs, pending_cancel, churn_rate, mrr_net,
avg_sub_net) vor MA_SNAP_FROM = 2026-09 leer: die Nachlaeufe vom 05./06.09. hatten den Bestand von Anfang September in Juni-August
geschrieben (Ruben hat es an den vierfach gleichen Werten gesehen); rueckwaerts belastbar ist "Abo-Zahlungen netto (Kasse)" = abo_paid.
DIAGRAMME jetzt unten (je Block 34 Zeilen), Daten im versteckten Tab MADiagramm (Chart-Ranges auf anderem Tab). colA1() fuer Spalten > Z.
LEHREN aus dem alten Finanzplan: Verkaeufe Zuerich Ist 2025 = 48,41,52,33,48,53,29,48,67,59,37,27 (Saison), Plan 2026 Umsatz ZH 1.47 Mio /
WT 839k liegt weit ueber Ist (ZH ~1.15 Mio, WT ~0.5 Mio Hochrechnung), Vertrieb (ZH 45, WT 30/Monat) und Kuendigungen (WT 0-10) stimmen
mit dem Plan - der Abstand kommt aus der Umsatzherleitung (Abo-Mix x Preise) des alten Plans. Meine Fehler dabei (nicht wiederholen):
WT-Verkaeufe und WT-Kuendigungen aus dem Kopf geschaetzt statt aus dem Sheet gelesen.
LEHRE Editor 04.09. abends: Funktionswaehler und Toolbar-Klicks reagieren zeitweise gar nicht; Ausweg ist ein Selbstheilungs-Flag
im Code statt eines manuellen Laufs. Speichern klappt zuverlaessig ueber ein synthetisches Cmd+S auf .monaco-editor textarea.inputarea.
LIFECYCLE ALS EINZIGE SPRACHE (Ruben 04.09. 13:50, 15:00 verschaerft): Team-Sheet hat KEINE manuellen Spalten mehr (Personen automatisch aus
"&"/"+" im Namen; Kein Trial = Stage "Non-Client" = Assistant Coach / Friends & Family; Kommentare nur in exercise.com-Notizen). Spalten (CI,
19): Trial-Datum, Name, Art, Klasse, Trainer, Gebucht von, Kanal, Personen, Lifecycle-Stage (exercise.com "Current"), Pruefen
(Fakt vs. Stage ab 1 Tag nach Termin, rot; Texte TR_T.*.chk), Vertrag am, Verkaeufer, Paket, Tage bis Vertrag, Letzte Notiz (Report
account_notes: Datum + Titel), CRM (HYPERLINK auf /ex4/clients/<uid>/notes), Buchung erstellt am, UID (versteckt), Stand. Stages: LC_POST =
Client, Dependant client, Signed but no payment, Pending Decision, Missed the talk (neu 04.09.), Not Interested (Lost); LC_CLIENT = die ersten drei.
Regeln: Trial stattgefunden -> Stage muss in LC_POST sein; No-Show/Storniert -> re-engage-Stage oder eine LC_POST-Stage (LC_NOSHOW_OK); Gebucht ->
Trial Booked; Wiederholer zaehlt erst mit LC_POST-Stage. Verkauft = Vertragsdatum vorhanden. Abendmail trDailyMail je Standort an abdi@/bogdan@,
Ruben cc: Trials heute, Pruefungen, Buchungen morgen, Monatsstand. Wochenreport Kennzahlen: "Offene Pruefungen ZH/WT". Offen (Ruben-Task):
Kinder sauber auf "Dependant client". LEHRE Editor 04.09. nachmittags: Tastatur-Paste/cmd+s kommen nicht mehr an; Diff als Monaco-Ops
(scratchpad editor_ops*.js aus difflib gegen die Editor-Basisversion), speichern per Klick auf das Disketten-Symbol (331,73) NACH dem
Wegklicken des Konto-Popups (1445,202); find/screenshot melden zeitweise "Page still loading", javascript_tool geht trotzdem.
Probetrainings-Spalten (Stand mittags, ueberholt): Trial-Datum, Name, Art ("Trial stattgefunden"/"Gebucht (kommend)"/No-Show/...), Klasse,
Trainer, Gebucht von, Kanal, Wie gehoert, Personen*, Gespraech*, Kommentar*, Vertrag am, Verkaeufer, Paket, Tage bis Vertrag, Status
(unser Verkaufsergebnis), Lifecycle-Stage (exercise.com "Current" aus dem Lifecycle-Report, per E-Mail), Buchung erstellt am, UID (versteckt),
Stand (* = Verkaeufer-Spalten); Monatsuebersicht V..AE, Tagestabelle AG..AM (AL/AM Anrufe manuell). Kopfzeile != TR_T.head -> Tab wird neu
aufgebaut (manuelle Eintraege gehen dann verloren, also Layout nur bewusst aendern). Kanaele (Ruben 04.09.): Google Ads, Meta Ads (= Instagram),
TikTok Ads, Google organisch, Instagram/Facebook organisch, TikTok organisch, Direkt, Andere; kein X. Leads nach Kanal/Interesse stehen im
Monatsabschluss je Standort direkt unter "Leads Website (Log)" (keine eigene Sektion). LEHRE Editor: Tastatur-Paste kam am 04.09. nachmittags
nicht mehr im Monaco an -> Diff als pushEditOperations per javascript_tool (tools: scratchpad editor_ops.js aus difflib), speichern ueber den
Toolbar-Knopf "Save project to Drive" (find), nicht cmd+s. Kanal/Wie gehoert per E-Mail-Abgleich (Fallback Name) mit dem Leads-Log (trLeadMap).
PROBETRAININGS-LISTE (04.09.2026, Entscheid Ruben nach Abgleich mit Bogdans Strichliste 50 vs. 84): Tabs "Probetrainings ZH" und
"Probetrainings WT" (seit mittags im Team-Sheet, s.o.), eine Zeile pro Erstbesucher (UID), stuendlich 09-22 Uhr (Trigger runProbetrainingsHourly,
Tagesmail trDailyMail 21:45 an TR_MAIL = Ruben; Abdi/Bogdan erst nach Freigabe). Server: functions/api/klassen.js action 'trials'
(Phasen t1/t2/t3, Reports clients_first_visit je Standort, detailed_visits ab Fenster-30 Tage, active_subscription, cancelled_subscriptions,
waiver = "Waivers and Contracts" mit Signed/Signed By = Vertragsabschluss und Verkaeufer). Regel (TR_RULE im Script): Trial = erster
Check-in ueberhaupt, egal welches Paket; ohne Staff/Gaeste/Altkunden; Events/Seminare/Open Mat keine Trials; 2 Kinder = 2 Personen;
Wiederholer (prüfen) = Check-in ohne Paket/Abo, 30 Tage nicht da; Rueckkehrer = Ex-Mitglied; No-Show/Storniert/Gebucht (Zukunft).
Verkaufsstatus: Verkauft am Trial-Tag / Verkauft / Verkauft, wieder gekuendigt / Unterschrieben, kein Abo aktiv / Offen; Abschlussdatum =
Waiver Signed >= Trialdatum, sonst Abo-Start; PT zaehlt nicht. Editierbare Spalten (bleiben bei Upsert erhalten): Personen, Gespraech
(Dropdown TR_TALK, "Kein Trial" nimmt Zeile aus der Zaehlung), Kommentar, Anruf-Spalten der Tagestabelle (AC..AI, per Datum).
Monatsuebersicht S..AA wird pro Lauf in JS berechnet. Aeltere offene Zeilen bekommen den Verkaufsstatus ueber open_uids (t3).
SPRACHE (Ruben 04.09.): Tab ZH deutsch (Abdi), Tab WT englisch (Bogdan): TR_LANG/TR_T im Script, intern bleiben Werte deutsch,
trL() uebersetzt beim Schreiben, trC()/TR_REV beim Lesen; Spaltennotizen erklaeren jede Spalte (Notiz auf der Ueberschrift). Spalten:
Trial-Datum (erster Check-in bzw. gebuchter Termin), ..., Vertrag am (Waiver), Verkaeufer, Paket, Tage bis Vertrag, Status, Buchung
erstellt am, UID, Stand. Tabs Leads und Trainingsplan sind seit 04.09. versteckt (setupAnalyse haelt sie versteckt).
FUNNEL-ATTRIBUTION (04.09.2026): Website-Snippet speichert utm_*, gclid, fbclid, ttclid 30 Tage in localStorage (imp_<key>
= {v,t}); hidden input t_tt/ttclid in allen 38 Lead-Formularen + 2 Templates; lead.js schreibt ttclid in die exercise.com-Notiz;
Leads-Tab hat neue Spalten U..X ttclid, utm_source, utm_medium, utm_campaign. Geplant: Kanal-Spalte in Daten/Probetrainings
(gclid=Google Ads, fbclid=Meta, ttclid=TikTok, sonst utm_source/Referrer/direkt), Wochenreport statt Leads-Analyse, Leads
Historie in den Monatsabschluss. TikTok-Pixel-ID D8ON10BC77UDGOQMBTHG ist die Pixel-ID (Script im Head), NICHT die Click-ID.
Bogdans "Probetrainings" im Sheet "Sales KPIs WIN" = Sales Talks + Missed (48+2); die Sales-KPI-Sheets (ZH/WIN, Drive) sollen nach einem
Parallelmonat eingefroren werden. LEHRE: Abo-Startdatum ist nicht das Abschlussdatum (geplante Starts), darum Waiver-Report; Zeitstempel
der Abo-/Waiver-Reports sind UTC (22:00:02 +0000 = Mitternacht CEST) -> chDate(). Backfill: runProbetrainings('2026-08-01').
- **Lead-Log v6 + Trainingsplan-Auswertung (02.09.2026, LIVE: Apps-Script Version 6 deployed 18:17 via Rubens Chrome, setupAnalyse + repairPhones 18:20 ausgefuehrt):** Apps-Script-Quelle ohne Token liegt in `tools/leadlog-apps-script.gs` (Projekt "IMPACT Website Lead Log", ruben@; enthaelt auch `logForm` fuer Events/Kuendigungen aus dem Events-Chat - bei Aenderungen IMMER diese Datei als Basis nehmen, nicht den alten v4/v5-Stand; beim Einfuegen die Zeile `var TOKEN = ...` behalten, dann "Neue Version" bereitstellen, URL bleibt). Trick fuer den Funktionswaehler im Editor (reagiert nicht auf Automations-Klicks): temporaer `function RUN_SETUP(){setupAnalyse();repairPhones();}` als ERSTE Zeile einfuegen, speichern, Seite neu laden (erste Funktion ist vorgewaehlt), Run, Zeile wieder entfernen. Script-Funktionen: doPost (Leads + `type:'plan'`), `setupAnalyse()` (baut Tabs Analyse / Trainingsplan-Analyse / Historie / Daten / PlanDaten mit Formeln + Diagrammen, wiederholbar), `repairPhones()` (alte #ERROR!-Telefonzellen). Tab "Sheet1" wird zu "Leads" (Spalten +S Technik, +T Ausschluss = manuelle Spam/Test-Markierung; O gclid, P fbclid, Q Referrer, S, T sind AUSGEBLENDET, Entscheid Ruben 02.09.). Tab-Reihenfolge (Ruben): Analyse, Leads, Klassenanalyse (Tab fuer den Skill impact-class-analysis, Weg 2 = monatlich aus Cowork mit Browser in dieses Sheet statt xlsx; exercise.com-Reports haben JSON-APIs /api/v4/reports/popular_services und /recurring_sessions, Zeilen in cached_stats, generiert per REFRESH mit Datumsfilter), Events, Kuendigungen, Trainingsplan, Trainingsplan-Analyse, Historie. Trainingsplan-Analyse zaehlt NUR innerhalb von PlanDaten (Kopien der Trainingsplan-Spalten per ARRAYFORMULA), weil COUNTIFS ueber zwei Tabs mit ungleicher Zeilenzahl #VALUE! liefert. Auswertung zaehlt nur Status ok ohne Tests (Vorname/Status ^test, bekannte Testmails, Ausschluss); Dubletten separat; Historie Jan-Aug 2026 manuell (ZH 210/189/222/185/216/182/204/298, WT 164/120/138/115/88/90/96/149), ab 09/2026 aus dem Log. `/api/lead` gibt jetzt `lid` = "<clientId>.<hmac16>" (HMAC mit LEADLOG_TOKEN) zurueck; Formulare haengen `&lid=` an die Danke-URL; Danke-Seite gibt lid an `/training-plan/?...&lid=` weiter; Tool (`sendPlan`, SID in sessionStorage, SRC danke/share/direct, Share-Link traegt `&s=1`) POSTet jeden Plan an `functions/api/plan.js` -> Sheet-Tab "Trainingsplan" + bei gueltiger lid Notiz "TRAININGSPLAN ..." ins CRM-Profilfeld Message + Mail an Studio Manager. CRM-Notiz seit 03.09. kurz und zeilenweise (Link zuerst, je Punkt eine Zeile, Stunden als Liste); fruehere TRAININGSPLAN-Notizen im Feld werden beim naechsten Plan ersetzt, der Rest der Nachricht bleibt. ABMACHUNG (03.09.): In diesem Chat wird `training-plan/index.html` NICHT mehr angefasst (anderer Chat arbeitet am Tool); plan.js, Danke-Seiten und Sheet gehoeren hierher. Lead-Mails ohne Rohdaten ("Status:" statt "Technisch:"), Rohdaten nur in Spalte Technik. STAND 03.09.2026 (Apps-Script Version 7, 09:39): Tab Trainingsplan haelt je Person (Lead-ID, sonst Sitzung) nur den letzten Plan (`logPlan` ruft `dropOlderPlans` vor dem Append, `dedupeTrainingsplan()` einmalig 13 Altzeilen entfernt); Trainingsplan-Analyse zeigt 'Website-Leads (neu im CRM, ohne Tests) seit 02.09.2026' und 'Quote Leads mit Trainingsplan' (Plaene mit bekanntem Lead / Website-Leads); Share-Aufrufe und Testleads zaehlen nicht. plan.js sendet `alert:false` = KEINE Mail je Plan an Abdi/Bogdan (Entscheid Ruben 03.09., CRM-Notiz reicht). Klassenanalyse-Hitlist: Mindestschwellen je Standort seit 03.09.2026 (build_import.py MIN_AVG=3 Personen, MIN_EV=4 Termine, sonst Index n/a; Grund: BJJ Gi Competition mit 2.5 Personen in einem toten 10:50-Slot bekam Index 1.33). SHEET-TABS (Ruben 03.09.2026): 'Historie' heisst jetzt 'Leads Historie'; Reihenfolge Analyse, Klassenanalyse, Trainingsplan, Events, Trainingsplan-Analyse, Kündigungen, Leads Historie, Leads (+ Hilfstabs); setupAnalyse setzt diese Reihenfolge. Analyse, Trainingsplan-Analyse, Leads Historie duerfen umbenannt/verschoben werden (Script nachziehen); Leads, Trainingsplan, Events, Kündigungen, Klassenanalyse, Daten, PlanDaten, KlassenHistorie* NIE umbenennen und dort Kopfzeile/Spaltenreihenfolge nie aendern (Webapp schreibt per Name/appendRow). Testzeilen in Events/Kündigungen duerfen manuell geloescht werden. Analyse: Diagramme stehen ab Spalte S untereinander (rechts neben allen Tabellen), Wochenzeilen vor dem 31.08.2026 bleiben leer. VALUE PRICING (Konzept 03.09.2026, noch nicht gebaut, Ruben will die genaue Methode): exercise.com-Reports per JSON-API wie die Klassenreports: `detailed_visits` (Itemized Visits, per=5000 laedt den ganzen Monat, Zeilen in cached_stats.reports[].items, Header in cached_stats.headers; Status Completed, User ID, Service, Location, 'Client Package Used') und `active_subscription` (per=2000, Zeilen in cached_stats[1..]; 'Payment Plan Price' = Netto ohne MwSt z.B. 'Fr194.17/month for 12 months' oder 'Fr1,580.94/year', 'Est Next Payment' = brutto nach Coupon, 'Current Coupon Discount' z.B. '10% off forever', 'Paused?', 'Active Subscription Type' Renewing/Pending Cancel/Paused/Scheduled). Verknuepfung ueber User ID. August 2026: 2873 Check-ins (ZH 1968, WT 905), 742 Personen; 893 laufende Abos (ZH 604, WT 294) = netto ZH 101k / WT 50k CHF pro Monat (brutto x1.081: ZH 109k, deckt sich mit Rubens 110k); 2572 Check-ins von Abo-Mitgliedern, 301 ohne Abo (Probetrainings etc. = 0 CHF); 307 Mitglieder (ZH 33k, WT 18k CHF/Monat) hatten im August keinen Besuch (Ferien!). GEBAUT 03.09.2026 (Entscheid Ruben: genaue Methode, netto, nur Umsatz je Termin ohne Trainerstunden, alle Klassen 60 Min): fetch_reports.js holt zusaetzlich detailed_visits + active_subscription und rechnet REVENUE() im Browser (Abobetrag je Mitglied gleichmaessig auf eigene Check-ins, je Slot summiert, Kursnamen trimmen!); build_import.py apply_revenue() haengt revenue/revenue_per_event an die Zeilen und revenue/revenue_share an die Hitlist; Apps-Script: Klassenanalyse-Spalten 'Umsatz CHF/Monat' + 'Umsatz CHF/Termin' vor 'Aktion' (Aktion-Spalte wird per Header gesucht), Umsatz je Standort, Hitlist-Spalten Umsatz + Anteil; neuer Tab 'Kündigungsrisiko' (buildRisiko: Statistik pro Monat aus verstecktem Tab RisikoHistorie + Namensliste ohne Besuch mit Notizspalte, Notizen bleiben ueber E-Mail erhalten), Tab-Reihenfolge nach Klassenanalyse. Upload-JSON wird schlank gehalten (nur Felder, die das Script liest; ~90 KB). KLASSENANALYSE SERVERSEITIG (03.09.2026, LIVE, Entscheid Ruben nach gescheitertem Cowork-Testlauf auf Sonnet): `functions/api/klassen.js` (POST mit LEADLOG_TOKEN, phase 1/2/3, Login wie lead.js; die exercise.com-Report-API akzeptiert den API-TOKEN-Login, Status 200) rechnet alles (Port von build_import.py + REVENUE, mit jsc gegen den Python-Lauf verifiziert, nur 1-Rappen-Rundungsunterschiede). Apps Script: `runKlassenanalyse(start,end)` (3 Phasen mit Utilities.sleep 25 s, Archivkopie in den Drive-Ordner, KA_LAST-Stempel gesetzt, baut Tabs), `runKlassenanalyseMonthly()` (letzter voller Monat, Mail an ruben@ mit Kurzbericht bzw. Fehler), `installMonthlyTrigger()` (1. des Monats 06:00), `dropTestRows()`, `dropShareRows()`. Erster API-Lauf August 2026 am 03.09. 13:27 identisch mit dem manuellen Lauf (ZH 56/224/1948/32%/67'632, WT 39/123/905/25%/31'589). OAuth-Scopes external_request und script.scriptapp wurden mit Rubens Zustimmung erteilt; Monats-Trigger runKlassenanalyseMonthly (1. um 06:00) am 03.09. 13:32 angelegt; Webapp-Version 8 (03.09. 13:35) mit logPlan-Share-Filter, Tab 'Leads-Analyse', neuer Hitlist/Slot-Tabelle deployt. NACHMITTAG 03.09.: Level-Hitlist entfernt (unfair, Ruben), stattdessen classBlock() Top 10 / Bottom 10 Klassen nach Umsatz je Termin (nur Klassen mit >= 4 Terminen, Open Mat raus) mit je einem Balkendiagramm; hitlist_levels aus klassen.js und build_import.py entfernt, KlassenHistorieDisziplin schreibt nur noch Typ Disziplin. Sheet-Korrekturen vom 03.09. mittags sind live (Umsatz zuerst, Rang nach Umsatz, Umsatzanteil-Diagramme rechts der Hitlists, Abo-Gesamtumsatz + Aufteilung im Kopf, Share-Zeilen und 9 Testzeilen entfernt). Die lokalen Scheduled Tasks (klassenanalyse-monatlich, -test-august) sind geloescht, die Cloud-Erinnerung trig_01NDuDq5dC3C5Xbck6uMz39j deaktiviert; der Cowork-Skill bleibt nur als manueller Fallback fuer beliebige Fenster. LEHRE: `pbcopy` ohne LC_ALL=en_US.UTF-8 zerstoert Umlaute (Editor-Paste ueber die Zwischenablage: `LC_ALL=en_US.UTF-8 pbcopy`, danach im Editor Umlaute pruefen, Token-Zeile vorher per JS sichern und nach dem Paste zuruecksetzen). MONATSABSCHLUSS (03.09.2026 abends, LIVE; erster Lauf August 22:00: ZH 79 Probetrainings, 42 Neukunden, 25 Kuendigungen, netto 17, Abo brutto 101'151; WT 84 / 31 / 11 / 20 / 45'049; Webapp-Version 20 mit planLogSheet-Fix; Token nach Editor-Paste ueber Projekthistorie (Version anklicken, Monaco-Modelle durchsuchen) zurueckgeholt, nie in den Kontext; LEHRE 22:07: Sheets wandelt 'yyyy-MM-dd' im Tab Kohorten in Date um -> Vergleich mit started_since schlug fehl, Kohorte war 0; Fix dOfCell + '@'-Format fuer UID/Datum; ZH-Kohorte August = 26/79 = 33 %, WT siehe Tab): Tab 'Monatsabschluss' ganz vorne, Monate als Spalten, je Standort Block (Funnel, Neukunden, Wechsel, Kuendigungen, Abo-Bestand, Umsatz aus Sales by Category) + Funnel-Diagramm; Daten in versteckten Tabs MonatsHistorie (Monat|Standort|Kennzahl|Wert) und Kohorten. Cloudflare `/api/klassen` action 'monat' (Phasen m1/m2/m3, Reports lifecycle, detailed_visits, cancelled_subscriptions, active_subscription, clients_first_visit je Standort, sales_by_category je Standort). ACHTUNG: `started_subscription` liefert dem API-Benutzer 403, Abo-Starts werden aus active_subscription (Start Date) abgeleitet. Definitionen (Ruben): Probetraining gebucht = Erstbesuche laut Report; stattgefunden = Erstbesucher mit Check-in im Monat ohne Altkunden (Abo-Start vor dem Monat) und ohne Staff; Neukunden = Abo-Starts ohne Paketwechsel und ohne Personal Training; Kuendigungen ohne Converted; Kohorten-Conversion wird 3 Monate nachgefuehrt (runMonatsabschluss). runKlassenanalyseMonthly ruft beides. LEHRE: Der Events-Chat hat im selben Script eine Funktion planSheet(sheet); mein Trainingsplan-Helfer heisst deshalb planLogSheet (Kollision hatte logPlan in Webapp v8 gebrochen, v9 deployt). Namen vor dem Anlegen neuer Funktionen mit `grep '^function'` auf Dubletten pruefen. SKILL-SYNC (03.09.2026 entdeckt): Der Ordner ~/Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin/<org>/<account>/skills/impact-class-analysis ist nur der lokale Cache der claude.ai-Account-Skills (manifest.json: skill_015RPfzAvnqQtFwDGKYZfAog, Cloud-Stand 13.08.2026 = alte Excel-Version mit build_workbook.py). Cloud-Sessions (Routine) nutzen die alte Version und erzeugen ein separates Google Sheet 'Klassenanalyse_YYYYMM'; lokale Edits im Cache koennen bei einem Sync ueberschrieben werden. Fix: Ruben laedt ~/Desktop/impact-class-analysis.zip (SKILL.md + scripts/fetch_reports.js + build_import.py + references/method.md, ohne build_workbook/parse_*) in claude.ai unter Einstellungen > Skills als Ersatz hoch; danach den Cache pruefen. ROUTINE-REALITAET (03.09.2026 geprueft): Die Cloud-Routine trig_01NDuDq5dC3C5Xbck6uMz39j 'Klassenanalyse monatlich (Erinnerung)' (1. des Monats 07:00) ist NUR eine Erinnerung ohne Browser; die eigentliche Analyse startet Ruben in Cowork mit offenem Chrome per Satz 'Klassenanalyse fuer TT.MM.JJJJ bis TT.MM.JJJJ' (Skill impact-class-analysis). Transfer aus dem Browser seit 03.09. in zwei Teilen (__ka.dump(1) reports.json, __ka.dump(2) revenue.json), build_import.py --revenue. UPLOAD-WEG bei >50 KB (Drive-Connector/Read-Limit reichen nicht): in Rubens Chrome den Drive-Ordner oeffnen, per JS ein <input type=file id=__ka_upload> anlegen, mit dem Chrome-MCP file_upload die Datei setzen (Pfad muss im Repo-Ordner liegen, Muster klassenanalyse-20*.json ist gitignored), dann DragEvent 'drop' mit DataTransfer auf c-wiz/document dispatchen, im Dialog 'Replace existing file' > Upload; danach importKlassenanalyseForce. Im Klassenanalyse-Tab sind Spalten F und L global ausgeblendet, Hitlist-Bloecke lassen diese Spalten leer. clearSheet entfernt Filter (createFilter sonst Fehler beim 2. Import). August 2026: 99'271 CHF netto auf Klassen verteilt (ZH 67'632, WT 31'589), 443 CHF andere Services. Reihenfolge bei kuenftigen Aenderungen am Sheet-Protokoll: Script deployen, dann pushen (ein altes Script wuerde unbekannte POST-Typen als Lead-Zeile loggen und Fehl-Mails ausloesen).

- **Klassenanalyse Weg 2 (02.09.2026, gebaut):** `tools/klassenanalyse/` = `fetch_reports.js` (exercise.com Report-JSON-API im eingeloggten Tab: GET /api/v4/reports/{recurring_sessions|popular_services}?page=1&per=400&start_date=<unix>&start_date_string=YYYY-MM-DD&end_date=<unix>&end_date_string=...&refresh=true, danach ohne refresh pollen bis `refreshing` leer + Filtertext passt; Popular braucht `location_id` 2508 ZH / 2222 WT und teilt EINEN Cache, also nacheinander), `build_import.py` (Aggregation wie im Skill), `SKILL.md` (neuer Skill-Text, Kopie im Cowork-Skill-Ordner), `SKILL-alt-2026-08-18.md` (Archiv). Datenuebergabe aus dem Browser: javascript_tool kuerzt auf ~1000 Zeichen, deshalb JSON in ein <pre> schreiben und mit get_page_text lesen (34 KB ok). Import-Datei -> Drive-Ordner "Klassenanalyse-Import" (1PY7xvkRQlo19r9ARp6_95-MG3bIi1lPI) -> Apps-Script `importKlassenanalyse` (im Script vorhanden, braucht Drive-Berechtigung; Zeit-Trigger stuendlich muss Ruben im Trigger-Menue anlegen, `installTriggers` im Code wurde vom Sicherheitsfilter blockiert) -> Tab Klassenanalyse + KlassenHistorie (Monatsverlauf, Aktion-Spalte bleibt). Routine trig_01NDuDq5dC3C5Xbck6uMz39j = monatlich am 1. um 09:00 CH. Erster Import August 2026 am 02.09. 22:36 erfolgreich (96 Slots, ZH 32%, WT 25%); Drive-Berechtigung (voller Drive-Scope, weil DriveApp) mit Rubens Freigabe erteilt. Stuendlicher Zeit-Trigger fuer importKlassenanalyse am 03.09. 09:08 im Trigger-Menue angelegt (Head, time-based, every hour); neue Import-Dateien werden damit automatisch innerhalb einer Stunde importiert, sofort per importKlassenanalyseForce im Editor. NACHTRAG 03.09. (Hitlist, Entscheid Ruben): build_import.py liefert `hitlist` + `hitlist_levels` (Slot-Index = Oe pro Klasse / Oe der Uhrzeit, gewichtet mit Terminen, ERST je Standort dann Mittel; Levels zusammen, BJJ Gi/No-Gi getrennt, BJJ-Competition -> zaehlt zu Gi UND No-Gi (Entscheid Ruben 03.09.), Striking-Competition -> Muay Thai, Competition+Kids drin, Open Mat + Self Defense for Women raus; 'Termine mit Vergleich' = Slots mit anderer Disziplin). Apps-Script rendert die Bloecke zwischen Monatsverlauf und Slot-Tabelle (hitlistBlock, rollingHitlist ueber Tab KlassenHistorieDisziplin, ab 2 Monaten). August 2026: Muay Thai 1.21, FKB 1.20, BJJ No-Gi 1.09, Boxing 0.97, Wrestling 0.92, MMA 0.87, BJJ Gi 0.71. Datenuebergabe-Tipp: get_page_text persistiert nur >~50 KB als Datei, sonst Inhalt manuell sichern.

## Offene Punkte
1. exercise.com: echten Stundenplan-Feed erfragen (aktuell nur Buchungs-Feed; darum Live-Merge statt Voll-Live).
2. Namen der 3 Winterthur-Google-Rezensionen (aktuell "Google-Rezension · Winterthur").
3. (erledigt 27.08.) Trainer-Highlights ergänzt; Trainer-Karten sind NICHT mehr verlinkt (alte Webflow-Profil-Links entfernt; Trainer-Einzelseiten weiterhin nicht migriert). Legal-Seiten lokal migriert: /agb/, /agb-kindertraining/, /datenschutz/, /en/terms/, /en/privacy/. Verbleibende Alt-Links: 5 Karriere-Stellen + 6 Blogposts (Migration offen).
4. Newsletter-Zielsystem (Make/Mailtool/exercise.com?).
5. Kursseiten: Fotos seit 23.08. je Disziplin korrekt zugeordnet (Shooting 20.08. für MMA/Boxen/Ringen unter assets/kurse/, FKB/Street-Defense/PT nur je 1 Thumbnail – Shooting-Fotos fehlen). Coach-Sektionen (duosec im MT-Stil) seit 31.08. auf allen 12 Kursseiten, Zuordnung 1:1 von der Original-Website je Standort (WT Street Defense: wie ZH = Sam, Original hat keine WT-Seite). Bios/Summaries aus Webflow-CMS.
6. Frauen-Selbstverteidigung wird abgebaut (Entscheid Ruben 31.08.): aus ZH-Stundenplan entfernt, KEINE Frauen-Sektion bauen. Preise werden bewusst NICHT gezeigt (Sales-Prozess). Extern offen (Ruben/Rania): Google Maps/GBP ist KORREKT (Walchestrasse 15, verifiziert 31.08.). Noch falsch (Josefstrasse 92): SEPARATES Google-Business-Profil 'Little Ninjas' (Josefstrasse 92, Website littleninjas.ch -> alte Site, Tel 076 291 24 46; 3 Rezensionen, 5.0) - Adresse+Website von Ruben fixen lassen; local.ch + search.ch (beide via localsearch.ch/MyLOCALSEARCH fixen, ein Portal fuer beide), Facebook, Kleinverzeichnisse (finde-offen, firmania, fitfit, maptons = Scraper, ignorieren) + alte Webflow-Seiten (FAQ, /gr/uber-uns). Rania nach URL der indexierten Test-Site fragen.
7. SEO: Titles/Descriptions seit 31.08. datenbasiert (12 Monate GSC-Export, Analyse-Daten unter /private/tmp .../scratchpad/gsc bzw. Zip in Downloads; Kernbefunde: 'mma zuerich' #1, Muay Thai>Thaiboxen 5:1, FKB auf 'Kickboxen' optimiert, Street Defense mit Krav-Maga-Begriff - Wording von Ruben noch absegnen lassen). Schema.org: SportsActivityLocation auf Home+Stadtseiten; NOCH OFFEN: FAQ-/Course-Schema, beim Launch noindex entfernen + Sitemap einreichen.
8. Shop, Trainerprofile: Migration ausstehend. EN-VERSION LIVE (01.09.): 35 Seiten unter /en/ (Home, /en/{stadt}/, classes/schedule/team, trial(+thanks), about, contact, faq) mit nativem Copywriting; Slugs EN (boxen->boxing, ringen->wrestling, fitness-kickboxen->fitness-kickboxing); Sprach-Toggle je Seite (Topbar English/Deutsch, seitengenau verlinkt); hreflang de/en/x-default auf allen gespiegelten Seiten; EN-Coach-Bios aus Webflow-CMS "Team - en"; EN-Stundenplan mit EN-Tagen und Slug-Mapping im Live-Merge. Karriere/Blog bleiben DE (EN-Topbar verlinkt darauf). Bei DE-Inhaltsaenderungen: EN-Pendant mitpflegen! Cutover = DNS-Flip am Ende. Über-uns seit 27.08. neu (Standards+Story, /assets/ueberuns-*).
9. GitHub-PAT läuft ~30.08. ab – Ruben erneuern lassen.
10. Visuelle Gesamtabnahme aller Seiten durch Ruben.

## Referenzen
- Original: https://www.impact-martialarts.com (Webflow, siteId 651f0961164dd76d2ce8fd23; MCP-Zugriff vorhanden).
- exercise.com Dashboard: app.impact-martialarts.com. my.impact-martialarts.com ist Magicline/MySports (anderes System, vermutlich Striking Studio).
- IDs: GTM-W6SM24HX, GA4 G-HLBP9H0SZK, Meta Pixel 372030385687058.

## Stand 02.09.2026: Standortwechsel-Routing, Team-Sektion, globaler Burger
- **Lead-Dubletten** (`functions/api/lead.js` dupUpdate): Standort (`location_id` 2508 ZH / 2222 WT) und Profilfelder (`profile_fields` als `[{label,value}]`) haengen am USER-Objekt, nicht am Client: `GET/PUT /api/v4/users/{user_id}` mit Body `{user:{location_id, profile_fields, phone_number}}`. ACHTUNG: `profile_fields` wird komplett ersetzt, darum immer die bestehende Liste mitschicken (Message wird angehaengt, "Interested in" aktualisiert). Tags weiterhin via `PUT /api/v2/clients/{id}` `{client:{tag_list}}`. Alter Standort = user.location_id, Fallback Tags. Bei Wechsel: Notiz "STANDORTWECHSEL alt -> neu", Log-Extra `locchange`. Apps Script v4 (deployed 02.09. 09:56) mailt bei `locchange` an abdi@ UND bogdan@ mit Betreff `[Website] STANDORTWECHSEL alt -> neu: Name (loc / disc)`; ohne Wechsel abdi@ (ZH) / bogdan@ (WT); Vorname `Testlead*` immer an ruben@. End-to-end getestet (Client 3024423 / User 3105457, WT -> ZH). Testclients "Testlead Routing"/"Testlead Websitelog" im CRM loeschen.
- **Stadtseiten** (`zurich/`, `winterthur/`, `en/zurich/`, `en/winterthur/`): Sektion heisst "Unser Team in Zürich/Winterthur" (EN "Our team in ..."), erste Karte = Studio Manager (Abdallah Elshahaibi ZH / Bogdan Cristea WT), Bio in `#trbios`.
- **Globale Seiten** (Home, ueber-uns, karriere/*, articles/*, en/, en/about): Burger + `#mobmenu` mit Zürich / Winterthur / Über uns / Karriere / Blog + DE/EN. NICHT auf kontakt/ und faq/ (aeltere Nav ohne mobmenu-Struktur).
- **Mobile-Nav solide** (`/*solidnav*/` Style in jedem head): `.navwrap nav{background:#0a0908}` unter 900px, damit die iOS-Statusleiste keinen Seiteninhalt durchscheinen laesst.

## Stand 02.09.2026 (nachmittags): Über uns neu, Kontakt/FAQ auf neuer Nav, Team-Grid
- **Über uns / About** (`ueber-uns/`, `en/about/`) nach Aufbau der alten Webflow-Seite: Hero "Unser IMPACT" (Gruppenfoto `assets/about-hero-group.avif`), "The Story Behind" (Text der alten Seite, Foto `assets/about-story-founders.avif`), "Wir glauben"-Statement, die fuenf Standards (ersetzen "Bei IMPACT findest du"), Team-Grid (11 Personen, Karten + Bios aus den Team-Seiten, Bogdan aus Winterthur), Founders (Sam, Ruben), "Besuch uns noch heute" mit beiden Standorten (Bilder aus assets/wf, Kontaktdaten wie Footer). Generator: Scratchpad `build_about.py` (Karten/Bios werden per Regex aus `zurich/team` + `winterthur/team` gezogen; bei Team-Aenderungen neu laufen lassen oder Karten manuell nachziehen).
- **Kontakt/FAQ (DE+EN)** laufen jetzt auf dem Ueber-uns-Template (Topbar, Standorte-Dropdown, globaler Burger, f4-Footer); Seiten-CSS (`/*pagecss*/`) aus den alten Seiten uebernommen.
- **Mobile-Nav**: `/*ddpos*/`-Block auf allen globalen Seiten: Standorte-Trigger sitzt rechts neben dem Burger, exakt dort, wo auf Stadtseiten "Zürich/Winterthur" steht (rechte Kante 302px bei 390px Breite).
- **Team-Grids** ueberall: `gap:clamp(14px,2.4vw,28px)`, kein Hair-Hintergrund mehr. EN-Karten sagen "Learn more +" (vorher faelschlich "Mehr erfahren +").
- **Nachtrag 02.09.**: Rania Spinnler (Social Media & Marketing Manager) und Paloma Carela (Facility Manager) im Team: Zürich-Team beide, Winterthur-Team nur Paloma, Über uns beide. Fotos aus dem Webflow-CDN in assets/wf. Webflow hatte fuer beide KEINE Beschreibung; auf Rubens Anweisung keine Bios erfunden: Karten tragen Klasse `nobio` (kein "Mehr erfahren", kein Modal), bis Ruben Texte liefert. Über uns: kein "Wir glauben"-Block, kein Story-Kicker, Team/Founders heissen "Lern uns kennen." / "Get to know us.", Hero auf Mobile = Text, darunter Gruppenfoto mit Fade. Team-Modal zeigt das Bild unbeschnitten (object-fit:contain, sitewide).
- **Nachtrag 02.09. (2)**: Stadtseiten-Teamsektionen (`zurich/`, `winterthur/`, EN) enthalten jetzt dieselben Personen wie die Team-Seiten inkl. Rania (ZH) und Paloma (ZH+WT); doppelte Karten auf zurich/ entfernt. Über uns: keine CTAs zwischen den Sektionen (nur Floating-CTA + Footer), Founders nur mit Kicker. `.final.deep` hat `align-items:center`, damit der CTA auf Desktop nicht gestreckt wird.

## Stand 02.09.2026 (abends): Sam-Feedback-Runde
- **Team-Kacheln** (`/*cards2*/` auf allen Seiten mit trcard): nur Name + Rolle, Erfolgszeile (`em`) und "Mehr erfahren" per CSS ausgeblendet (bleiben im DOM, Modal zeigt `em` weiterhin), Textfeld solid schwarz, max. 4 Spalten. Ganze Kachel bleibt klickbar (Modal), `nobio`-Karten nicht.
- **Rania Spinnler** ist in beiden Teams (Stadtseiten + Team-Seiten, DE/EN), jeweils nach Paloma vor Sam/Ruben.
- **iOS-Statusleiste**: `<meta name="theme-color" content="#0a0908">` auf allen Seiten (Safari faerbt die Leiste damit schwarz).
- **Stundenplan**: Farbcodierung je Disziplin (`.slot.d-<slug>`, Slug aus dem Kurs-Link, DE- und EN-Slugs), `/*schedcolors*/` in den 4 Stundenplan-Seiten.
- **TikTok-Pixel** D8ON10BC77UDGOQMBTHG (`/*tiktok*/` im Head aller Seiten), `ttq.track('SubmitForm')` auf /probetraining/danke/ und /en/trial/thanks/. Der Events-API-Token von Michelle ist NICHT im Code (serverseitig, nicht noetig).
- **Header Desktop** (`/*hdr2*/`): Topbar-Links rechts neben DE/EN, Logo 40px, Abstand Nav-Links zum CTA.
- **Home**: Zürich-Standortkarte mit Foto mit Leuten (`assets/zuerich-standort-team.jpg`, aus IMPACT-Website-41), Google-Badge steht auf Desktop unter dem Hero-Button.

## Stand 02.09.2026 (spaet): Events, Kuendigungs-Feedback, Dubletten-Suche
- **Events** `/events/` + `/en/events/`: Inhalt kommt aus `data/events.json` (Liste; Felder id/date/time/time_en/location/address/image + de/en Texte). Seite zeigt nur Events mit Datum >= heute, sonst Hinweis. Neues Event = Eintrag in events.json, kein HTML anfassen. Anmeldung -> `POST /api/form` (kind=event) -> Apps Script `logForm` -> Sheet-Tab "Events". Keine Mail, kein CRM. TikTok SubmitForm + dataLayer `event_signup` bei Erfolg.
- **Kuendigungs-Feedback** `/kuendigung/` + `/en/cancellation/` (noindex): 8-Schritt-Umfrage wie die alte Webflow-Seite, anonym moeglich -> `POST /api/form` (kind=cancellation) -> Tab "Kündigungen". Keine Mail. Redirect `/cancellation` -> `/en/cancellation/`.
- **`functions/api/form.js`**: Honeypot `hp`, Validierung, POST an LEADLOG_URL mit `redirect:"manual"` (302 von Apps Script = ausgefuehrt; den Redirect zu folgen war langsam/502). Nach 9s optimistisch ok, kein Nachlegen (sonst Dubletten). Apps Script v5 (deployed 02.09. 17:32) hat `logForm(ss,p)` fuer kind event/cancellation.
- **Sheet** ist mit abdi@ und bogdan@ (Writer) geteilt, alle Tabs.
- **Dubletten-Suche gefixt**: exercise.com ignoriert `email=`/`search=` und liefert nur Seite 1 (25 von 4300 Clients). Richtige Suche: `q[client_search]=<email>&per=25` (v2/v3/v4). Vorher wurden echte Wiederholungs-Anfragen (5 Stueck am 02.09.) als "dublette_NICHT_ergaenzt" gemeldet; die Alerts gingen an Abdi zum manuellen Nachtragen.
- Generatoren im Scratchpad: `build_forms.py` (Events/Kuendigung), `rebuild_kontakt_faq.py`, `build_about.py`. Testeintraege in den Tabs "Events"/"Kündigungen" (Testlead ..., TEST ...) koennen geloescht werden.
- **Stundenplan-Filter** (`/*spfilter*/` in den 4 Stundenplan-Seiten): Zwei aufklappbare Knoepfe Level (Alle/Beginner/Intermediate/Advanced, Einfachauswahl) + Kampfsport (Mehrfachauswahl); Knopf zeigt die aktive Wahl. Regeln: Beginner = Basics gross, All Levels normal, Competition gedimmt; Intermediate = All Levels gross, Rest normal; Advanced = Competition gross (`big`), All Levels etwas kleiner gross (`big2`), Basics normal; Fitness Kickboxing zaehlt als Basics, Open Mat als All Levels und bleibt bei Disziplin-Filter immer normal; Little Ninjas werden gedimmt, sobald eine andere Disziplin gewaehlt ist. Kombination: gedimmt, wenn ein Filter dimmt; gross nur, wenn beide aktiven Filter gross sagen. Keine Speicherung, Plan startet neutral. Klassen `.sess.big` / `.sess.dim`, Hook `applyFilters()` nach jedem render().

## Stand 03.09.2026: Events aus dem Planungs-Sheet
- **Kalender-Einladungen (Version 22/23, 04.09.2026)**: Haken "Google event" im Planungs-Sheet -> `syncCalendar()` (zeitgesteuerter Trigger alle 10 Min, installiert via `what=caltrigger`; manuell `what=calsync`) legt den Termin in Rubens Standardkalender an (Titel aus Notes, Start/Ende oder ganztaegig bei 00:00, Adresse aus Location bzw. Studio-Adresse (seit v26, 04.09.: bei Activity type "Competition" bleibt ein blosses "Zürich"/"Winterthur" stehen, weil Wettkaempfe nicht bei uns stattfinden), Beschreibung aus Text) und laedt `INVITE_LIST` ein (seit v24, 04.09.: alle Mitarbeitenden laut STAFF-Map: abdi, bogdan, ruben, info, joao, lasz.simo7@gmail.com, surgejlubcenko@gmail.com, nathan@thomasmelliger.ch). Spalte "Einladen" (hinter Google event): leer = alle, sonst Kurznamen/E-Mails mit Komma; Gaeste werden bei jedem Sync abgeglichen (addGuest/removeGuest). Das Script ist die einzige Quelle, manuelle Kalendertermine des Teams (z.B. von Bogdan) sind Duplikate und sollen geloescht werden. Hinweis: Google mailt dem Organisator (Ruben) keine Einladung zu eigenen Terminen. Event-ID wird in versteckter Spalte "CalId" gespeichert; Haken entfernen loescht den Termin. Nur der massgebliche Jahres-Tab legt Termine an (Tab-Kopien werden bereinigt). Kalender-Scope wurde am 04.09. per OAuth freigegeben (`authCalendar`). Vergangene Events werden nicht nachgetragen.
- **Location-Spalte** ist jetzt Typ Text (vorher Ortschip -> "Invalid"-Markierung bei freien Adressen), Kopfzeilen Location und Google event haben Notizen mit Anleitung.

- **Quelle**: Planungs-Sheet "Event Planner" (ID 1cjW80tiosj7-STr-9qsi5CFHesVEoURRj_RAmXIS4S0, erstes Tab). Website-Spalten rechts (Stand 03.09. abends, auf Rubens Wunsch reduziert): ID (automatisch `ev-YYYYMMDD-slug`, nicht anfassen), Website (Haken = online), Anmeldung (Haken = Formular), Rewards (Haken = Standardblock Mitglieder-werben-Mitglieder), Titel, Text (nur eine Sprache, EN-Seite zeigt denselben Text), Bild-URL (optional; Google-Drive-Links werden in `drive.google.com/thumbnail?id=` umgeschrieben, Datei muss "Jeder mit dem Link" freigegeben sein, sonst Standardbild), Anmeldungen (Zaehler). Ort kommt aus Spalte E "Location" (IMPACT ... Zürich/Winterthur -> Studio-Adresse, sonst Text wie er ist), Link fuer Wettkaempfe = erste URL in Spalte H "Notes", Owner (Spalte F) wird als Coach mit Foto angezeigt (Mapping ueber Team-Karten + Aliase abdi/nate/sam/joao in `build_forms.py`; unbekannte Namen nur als Text). Company events erscheinen nie. Ohne Titel wird "Activity" angezeigt.
- **Apps Script** (Projekt "IMPACT Website Lead Log", gemeinsam mit dem Analyse-Chat; Repo-Kopie `tools/leadlog-apps-script.gs` ist die Referenz, danach in den Editor einfuegen und neue Version bereitstellen): `doGet?token&what=events|setup|seed`, `readEvents()`, `planSheet()` legt fehlende Spalten + Checkboxen an, `updateSignupCount()` zaehlt Zeilen im Tab "Events" (Event-ID fest in Spalte K, Kopfzeile selbstheilend) und schreibt sie ins Planungs-Sheet (verifiziert: Zaehler = 3 nach Tests). Deployed als Version 21 (03.09. 22:43): Spalten jetzt Activity | Activity type | Start | End | Location | Owner | Notes (= Titel auf der Website, URLs werden entfernt und als Link-Button genutzt) | Text | Google event | Website | Anmeldung | Freunde | Rewards | Bild-URL | Anmeldungen; Spalte ID versteckt (bleibt fuer die Zuordnung der Anmeldungen), Spalte Titel geloescht (Inhalt nach Notes kopiert). readEvents liest alle Spalten per Kopfzeile. Location darf mehrzeilig sein (Website zeigt sie mit Google-Maps-Link, Studio-Adresse nur bei Training/Community mit "Zürich"/"Winterthur"). Wettkaempfe: Button "Anmelden per WhatsApp" an João (+41 77 290 44 17, Grappling/BJJ/MMA) oder Nate (+41 77 286 35 08, Muay Thai/Boxen) mit vorgefertigtem Text, Zuordnung ueber Stichworte im Titel/Text, sonst Owner. Version 19: Spalte Freunde steht zwischen Anmeldung und Rewards (migratePlanSheet verschiebt sie), Zaehler "Anmeldungen" ist ein HYPERLINK auf den Tab "Events" des Lead-Logs (Klick zeigt die Anmeldungen), Kopfzeile "Bild-URL" hat eine Notiz mit Drive-Ordner "Event Images" (1-FjLvXhXBjdYUZOFaNRvIIM1OB-rdF-d) und Anleitung. ACHTUNG: Das Planungs-Sheet ist eine Google-"Tabelle", Formeln in der Kopfzeile sind verboten (Fehler kommt erst beim flush). Website: "Jetzt anmelden" oeffnet das Formular als Modal mit Backdrop (Klick daneben/Escape schliesst). Version 17: bei gleicher ID in mehreren Tabs gewinnt der Tab, dessen Name = Jahr des Events (dort pflegt Ruben), Zaehler schreibt ebenfalls bevorzugt dorthin. Version 16: Spalte "Freunde" (Checkbox) steuert, ob das Formular nach mitgebrachten Freunden fragt (nur Community events, nicht Sparring); ab 3 Freunden Hinweis "vorher mit Abdallah/Bogdan absprechen" je nach Standort. Version 15: liest ALLE Tabs mit "Activity" in A1 (2026, 2027, ...), Duplikate gleicher ID werden entfernt (Tab-Kopien), `what=image&id=` liefert Drive-Bilder als base64 (DriveApp, als Ruben), Cloudflare `functions/api/event-image.js` cached 7 Tage und liefert das Bild -> Bild-URL im Sheet darf ein normaler Drive-Link sein, keine Freigabe noetig. Owner-E-Mails werden nie angezeigt (Alias-Mapping ueber lokalen Teil, sonst weggelassen). ACHTUNG Parallelarbeit: Der Analyse-Chat speichert denselben Code.gs; wer deployt, muss vorher die komplette Repo-Kopie `tools/leadlog-apps-script.gs` (Token-Zeile aus dem Editor uebernehmen) in den Editor laden, sonst verschwinden Funktionen des anderen (ist am 03.09. passiert: doGet weg, Events-Seite lief auf Fallback). Import-Trick, wenn Einfuegen per Browser scheitert: Datei kurz unter /data/ mit `_headers` (CORS) veroeffentlichen, im Editor per fetch laden, danach wieder entfernen.
- **Cloudflare** `functions/api/events.js`: GET, 5 Min Cache, gibt nur oeffentliche Felder weiter (kein Owner, keine Notes). Seite `/events/` + `/en/events/` liest `/api/events`, Fallback `data/events.json` (nur noch Notnagel). Typen: Community (Formular), Training (Hinweis "nur Mitglieder", kein Formular ausser Haken Anmeldung), Competition (Link-Button). Standardbilder je Typ/Ort in der Seite (IMG-Map im Generator `build_forms.py`).
- **Zeiten**: Anzeige nimmt Start/Ende aus dem Sheet (00:00 = ganztaegig, keine Zeit). Rewards-Text korrigiert: Reward gibt es, wenn der Freund IMPACT-Mitglied wird, nicht bei Event-Anmeldung.
- **Freunde als Anmeldungen (04.09., Script v28, Entscheid Ruben)**: logForm schreibt je angegebenem Freund (max. 10) eine eigene Zeile in Tab Events mit Name "Friend", ohne E-Mail/Telefon, Spalte Friends = "Guest of <Name>"; updateSignupCount zaehlt damit Freunde automatisch mit. Notiz am Kopf "Sign-ups" erklaert das.
- **Kursseiten-Feinschliff (09.09.2026 spaet, Ruben)**: Sektion `#sportart` hat neu Kicker = Frage ("WAS IST BJJ?", bei Boxen/Ringen/Personal Training "WAS DICH ERWARTET", weil "Was ist Boxen?" naiv klingt) und H2 = Sportart + Stadt ("Brazilian Jiu-Jitsu in Zuerich.", Muay Thai: "Muay Thai und Thaiboxen in Zuerich." faengt beide Schreibweisen). Begruendung: Frage-Suchanfragen sind irrelevant (alle zusammen 240 Impressionen/Jahr von 293'000), die H2 traegt deshalb das Geld-Keyword, der Kicker die Leserfrage. H1 von BJJ ("Kontrolle. IMPACT. Flow.") und Muay Thai ("Technik. Praezision. IMPACT.") enthielten kein Keyword und heissen jetzt "BJJ mit IMPACT." / "Muay Thai mit IMPACT."; die Wort-fuer-Wort-Animation `<span class="rw">` bleibt. Open-Mat-Absatz vom Text ins FAQ ("Was ist die Open Mat?", nur Zuerich). "KUNST DER ACHT GLIEDMASSEN" aus dem Muay-Thai-Banner entfernt (Umbruch auf Desktop), bleibt aber in der Hero-Subline. `.sportintro` ohne max-width = volle Breite auf Desktop (Entscheid Ruben trotz langer Zeilen). Kapitel-Ueberschriften waren auf Desktop 96px, Mobile 26px: neue Regel `@media(min-width:900px){.chaphead h2{font-size:clamp(44px,4.4vw,62px)}}` am Ende des style-Blocks auf ALLEN 75 Seiten mit chaphead (also auch Startseite, Stadtseiten, Events usw.).
- **Kursseiten-Ausbau (09.09.2026, Ruben freigegeben im Google Doc "Kursseiten: Banner und Beschreibungen")**: Jede Kursseite hat neu direkt unter dem Laufband die Sektion `#sportart` ("DIE SPORTART / Was dich beim X erwartet") mit 1-4 Absaetzen Sportart-Beschreibung. Der Zeiten-Block `.sptwrap` steht seit 09.09. abends als eigene Sektion `#zeiten` ("STUNDENPLAN / Wann trainiert wird.") direkt VOR dem FAQ "Keine Ausreden" (Entscheid Ruben), Satz lautet "In Zuerich haben wir neun Fitness-Kickbox-Sessions pro Woche" (Tage einzeilig, Uhrzeit + Klassenname/Level als `<small>`, Link auf den Stundenplan). Erzeugt aus `#spdata` der jeweiligen Stundenplan-Seite, deshalb je Standort verschieden (BJJ ZH 12 Klassen vs WT 7 usw.) - das ist die Loesung fuer das Duplicate-Content-Problem. Bau-Skript: scratchpad/build_kurse.py (Content-Dict `C` je Disziplin de/en, Banner + Absaetze + FAQ). Achtung: Es ist ein BUILD-Skript, kein Generator im Repo - bei Stundenplan-Aenderungen muessen die Zahlen/Zeiten neu erzeugt werden. Ausserdem: Laufband-Slogans je Disziplin (vorher stand auf 7 von 9 Seiten der Muay-Thai-Slogan "ACHT GLIEDMASSEN", auch auf den EN-Seiten in Deutsch), neue FAQ "Wie laeuft eine Lektion ab?" (sichtbar + JSON-LD) auf allen Kampfsportseiten ausser Personal Training (hatte sie schon), EN-FAQ "Passe ich dazu?" auf "Will I fit in?" uebersetzt. Fakten von Ruben: Sparring bei Boxen/Muay Thai/MMA gehoert dazu (locker, technisch), Wettkampfteam bei Muay Thai + BJJ (Commitment: min. 3 Trainings/Woche), MMA-Team im Aufbau, Boxen ohne Wettkampfteam, BJJ-Graduierung durch Joao, Open Mat auch fuer Anfaenger, FKB ueber 60 % Frauenanteil und Handschuhe inklusive, Personal Training nur "individuell mit dem Coach". CSS-Klassen `.sportintro/.sptwrap/.sptimes/.splink` liegen in jeder Seite im `<style>`.
- **Kursseiten-Korrekturen (09.09.2026)**: (1) Sparring-FAQ auf Boxen/Muay Thai/MMA (12 Seiten) sagte "Nein, Sparring ist freiwillig" - laut Ruben falsch, neu "Ein bisschen Sparring gehoert bei uns dazu, locker und technisch". Fitness Kickboxen bleibt "kein Sparring". (2) Bewertungs-Badge war standortverkehrt: alle 16 Zuerich-Kursseiten zeigten 120+ und verlinkten das Winterthur-Profil, die Winterthur-Standortseiten zeigten 300+ und verlinkten Zuerich. Neu: ZH 300+ mit maps.app.goo.gl/1ow5T1yypnd7zvXM6 (308 Bew./4.9), WT 120+ mit maps.app.goo.gl/4WLKoHRziA7jtjWp9 (127 Bew./5.0), Startseiten 400+ mit ZH-Link. Bei Aenderungen beide Stellen anfassen: gbadge-Link/Zahl UND den Counter `data-t` im Reviews-Block. (3) Street Defense Winterthur geloescht (Seite DE+EN, Karte in der Kursuebersicht, 2 Sitemap-Eintraege), weil im Winterthurer Stundenplan keine solche Klasse laeuft; Weiterleitung auf /winterthur/kurse/ bzw. /en/winterthur/classes/, alte Middleware-Ziele umgebogen, Stadt-Umschalter auf den Zuerich-Street-Defense-Seiten korrigiert. 489 URLs (GSC + Middleware + Sitemap) nachgeprueft, 0 Fehler. LEHRE: Nach dem Loeschen einer Seite serviert Cloudflare die alte HTML noch einige Minuten aus dem Edge-Cache (200 statt 301); mit `?cb=` gegenpruefen statt vorschnell zu debuggen. Restliche Kursseiten-Arbeit (Banner je Sportart, Beschreibungsbloecke, 18 offene Fragen) liegt im Google Doc "Kursseiten: Banner und Beschreibungen" im Drive-Ordner IMPACT Website.
- **Funnel-Messung (09.09.2026)**: `assets/track.js` (auf allen 89 Seiten vor `</body>`) sendet `cta_click` (cta_text, cta_href, cta_kind = trial_page|trial_form|whatsapp|phone|cta), `trial_form_start` (form_loc, form_dis) und `trial_form_abandon` (last_field, form_loc, form_dis) plus page_path/page_lang - per `gtag('event')` (gtag.js kommt vom GTM-Google-Tag G-HLBP9H0SZK, verifiziert im Collect-Request) und als dataLayer.push. Keine Personendaten. GTM-Container GTM-W6SM24HX gehoert der Agentur (Ruben hat nur Striking-Container), GA4-Property p418515354 hat Ruben als Editor. Custom Dimensions (Event-Scope) am 09.09. in GA4 Admin > Custom definitions registriert: last_field, cta_text, cta_href, cta_kind, form_loc, form_dis, page_lang sowie lead_location, lead_discipline (waren fuer generate_lead vorher nie registriert). Ereignisse in GA4 Realtime verifiziert (Headless-Chrome-Tests werden von GA4 als Bot gefiltert, Test nur im echten Chrome). Beobachtung 09.09.: page_view wird pro Seitenaufruf zweimal gesendet (GTM), Views ~2x Sessions - noch nicht geklaert.
- **Probetrainings-Robustheit (08.09.2026, nach Ausfall 07.09. 13:47 'fetch_t2')**: klassen.js `getJson` versucht bis 3x (exercise.com liefert gelegentlich 200 ohne JSON); Apps Script `runProbetrainings` bricht in den Phasen t2/lg/t3 erst nach 3 aufeinanderfolgenden Fehlern ab; `runProbetrainingsHourly` wiederholt den ganzen Lauf einmal nach 30 s, bevor die Fehlermail geht; Script-Property `trLastOk` = letzter Erfolg; `trStaleAlarm()` mailt 12-22 Uhr, wenn > 3 h kein Erfolg; Tagesmail zeigt 'Stand (letzter erfolgreicher Lauf)'. Daten gehen bei Ausfaellen nicht verloren: jeder Lauf holt 33 Tage nach (Upsert je UID).
- **REDIRECTS SEIT 04.09.2026 IN `functions/_middleware.js`** (EXACT-Tabelle, PREFIX-Liste, SLUG-Regeln mit ASSETS-Existenzpruefung fuer /kurse/, /career/, /blog/); `_redirects` enthaelt nur noch die Marketing-Kurzlinks. GRUND: Cloudflare Pages wertete nur die ersten 100 statischen `_redirects`-Regeln aus (empirisch: Regel 101 ff. still ignoriert, obwohl Doku 2000 verspricht). `_routes.json` nimmt /assets/* von Functions aus. Neue Alt-URLs: in EXACT eintragen (ohne Endslash, klein), dann GSC-Pruefskript laufen lassen.
- **REDIRECT-LUECKE 04.09.2026 (schwerer Fehler, von Ruben entdeckt)**: /winterthur-de (2600 Klicks/Jahr, Google-Unternehmensprofil Winterthur) und 197 weitere alte URLs aus dem GSC-Export waren seit dem Launch 404. Ursache: Die Redirect-Liste basierte nur auf der letzten Webflow-Sitemap/Seitenliste; Webflow hatte intern eine eigene 301-Liste fuer noch aeltere Slugs (/class/*, /trainer/*, /coach/*, /winterthur-de, /zurich-de, /timetable, Seminare, Shop), die nie uebernommen wurde. Fix: 90 Regeln oben in _redirects, Pruefskript = alle URLs aus GSC Pages.csv (tools/backup/... bzw. ~/Downloads/impact-martialarts.com-Performance-on-Search-2026-08-31.zip) per curl -L auf 200 pruefen. REGEL: Vor jedem Cutover/Slug-Wechsel ALLE URLs aus GSC (12 Monate) + Webflow-Seitenliste + Webflow-Redirects pruefen, nicht nur die Sitemap. Cloudflare Pages: max 100 dynamische Regeln (Stand: 28).
- **Activity type Seminar (04.09., von Ruben im Dropdown ergaenzt)**: Website-Kind `seminar` (Regex seminar|workshop) mit Label "Seminar" DE/EN, Standardbild about-hero-group.avif (kein eigenes Seminar-Bild vorhanden, bitte Bild-URL im Sheet setzen), Bild 21:9 wie Training. Formular/Friends/Rewards/Kalender funktionieren wie bei Community Events. Unbekannte weitere Typen fallen auf "Community Event" zurueck.
- **Sign-ups nachzaehlen (v29)**: `recountSignups()` zaehlt die Spalte Sign-ups aus Tab Events neu (laeuft in jedem syncCalendar-Trigger, manuell `?what=recount`); nach manuellem Loeschen von Zeilen stimmt der Zaehler damit innerhalb von 10 Min.
- **events.js Debug (04.09.)**: `?debug=1` liefert Schritt-Log (Apps Script, exercise.com-Kalender, attachApp) ohne Cache; `?refresh=1` baut den Cache sofort neu. LEHRE: `new Response(res.body, res)` verbraucht den Body der Original-Response -> Cloudflare 1101 beim Senden (Cache wurde trotzdem geschrieben, darum fiel es erst mit refresh=1 auf); jetzt zwei getrennte Responses.
- **Registration = App (04.09., Script v27, Entscheid Ruben)**: Spalte "Registration" im Planungs-Sheet ist ein Dropdown `Form` / `App` / leer (vorher Checkbox; Migration `what=migrate` wandelt TRUE -> Form, Notizen im Kopf). `App` = Anmeldung als normaler Kurs in der IMPACT-App (exercise.com), z.B. Wrestling Sunday Sparring: Website zeigt Button "In der App anmelden" (Link `app.impact-martialarts.com/a/booking/?serviceId=<id>`) + Hinweis + live "x von y Plaetzen belegt"; kein Formular, keine Friends. `functions/api/events.js attachApp()` sucht den Kurs im exercise.com-Buchungsfeed (`/api/v4/calendar`, wie schedule.js: nur Termine mit >= 1 Buchung!) ueber Titel/Activity-Woerter + Datum + location_id; ohne Treffer allgemeine Buchungsseite `/a/booking/`. Neue Spalte "App link" (hinter Registration, optional): voller Link oder nur Service-ID ueberschreibt die Suche. Helfer `what=setreg&id=<event id>&mode=App|Form|` setzt die Spalte per URL. Deep-Link in die native App (Universal Link) ist ungetestet; Fallback ist die Web-App mit Login.
- **Englisch (04.09., v25)**: Alle von mir angelegten Sheet-Spalten, Notizen, Tabs und Kalendertexte sind Englisch (Firmenstandard, siehe Memory "dokumente-englisch"): Planungs-Sheet Website | Registration | Friends | Rewards | Text | Image URL | Sign-ups | Invite (ID/CalId versteckt); Lead-Log-Tabs "Events" (Timestamp, Event, Date, Location, Name, Email, Phone, Friends, Language, Page, Event ID) und "Cancellations" (vorher Kündigungen). "Sam" = info@ im Invite-Alias. Der Analyse-Chat hat eigene deutsche Tabs (Leads, Trainingsplan, Analyse ...), die habe ich nicht angefasst.

UMBAU 07.09.2026 ABEND (Ruben: "alles deutlich vereinfachen", Entscheide 1-4 + Team-KPIs): Commit 48da4f3.
- WOCHEN IM MONATSABSCHLUSS: der Tab Wochenreport ist weg (buildMonatsabschluss loescht ihn). Spalten = Monate ab Jan 2026; ab
  September 2026 stehen die Kalenderwochen (KW, Montag-Sonntag, Monat des Donnerstags) VOR ihrem Monat; Jahresspalte nach Dezember
  und nach dem laufenden Monat ("2026 (bis heute)", Summe/letzter Monat/Quoten aus Summen ueber die Monatsspalten des Jahres).
  Wochenwerte (wrCollect: Log + Team-Sheet-Tagesbloecke): Website-Leads + Kanaele, Gefuehrte Gespraeche (DI.conv), Probetraining
  gebucht (placed), durchgefuehrt (t), No-Shows, Show-up, Verkaeufe (sold), Werbekosten, CPL. Alles andere nur je Monat.
  Monatswerte aus dem Team-Sheet (Gespraeche) erst ab MA_TEAM_FROM = 2026-09. Der Stundenlauf baut den Monatsabschluss nicht
  mehr inline, sondern per Einmal-Trigger runMonatsabschlussBuild (maScheduleBuild, +1 Minute) wegen der 6-Minuten-Grenze.
- KEINE PROGNOSE MEHR (Ruben: der alte Finanzplan bleibt der einzige Plan). Prognose-/Saisonindex-Einstellungen werden von stGet
  geloescht (ST_OBSOLETE). Kein Tab Ueberblick (Ruben: waere nur komplexer).
- ZEILEN: "Neue Kontakte in exercise.com" (leads_all) zuerst, "davon ueber die Website" mit Kanaelen als Details (Google/Meta/TikTok
  Ads, organisch und direkt); "Abos laut exercise.com" (subs_total, neu in klassen.js = alle Typen wie der Report Active
  Subscriptions, Ruben sah 647 vs meine 605 = ohne Paused 34 und Scheduled 9) mit Details laufend/Periodenende/pausiert/geplant;
  "Kunden ohne Abo-Zahlung im Monat" (cv_nopay). Kundenwert-Zeilen "Zahlende Abo-Kunden"/"Oe Abo-Umsatz" waren durch ALTE
  ZEILENGRUPPEN versteckt (shiftRowGroupDepth(-1) auf ungruppierte Zeilen wirft -> alte Gruppen blieben): clearSheet ruft jetzt
  dropRowGroups (getRowGroup().remove() je Zeile) VOR sh.clear() auf.
- LTV OHNE STARTERPAKET (Ruben): LTV Abo netto = Oe Abo-Umsatz je ZAHLENDEM Neukunden x Dauer; Starterpaket und uebrige
  Einmalkaeufe als eigene Zeilen, "Monatlicher Kundenwert" weg. Winterthur 154 war der Schnitt ueber alle aktiven Neukunden inkl.
  Kunden ohne Zahlung im Monat (Aug: 238 Zahler, Oe 172, 44 ohne Zahlung); Zuerich 557 Zahler Oe 178, 124 ohne Augustzahlung.
- AGENTUR (Ruben): 1000 EUR Zuerich, 1000 Winterthur, 750 TikTok fuer beide (Verteilung nach TikTok-Ausgaben, sonst 50/50);
  Striking Studio 1000 zaehlt hier nicht. Einstellungen: Agentur Zuerich/Winterthur/TikTok EUR/Monat.
- FINANZPLAN-UEBERTRAG (fpTransfer, in runMonatsabschlussDaily 04:30 und im Monatslauf): schreibt in die KOPIE
  1vBD3eIxE5huSL8k_s0ky--fVbhe_ugJkQD51RB6zxUw (Tabs IMP ZH / IMP WIN), Spalte per Monatskopf "M.yyyy" (Zeile 1), Zeile per
  Bezeichnung (Spalten A-E), ab 2026-06 bis zum laufenden Monat (Ruben will die laufenden Zahlen sehen): Anzahl Leads = leads_all,
  Anzahl Trials = attended + noshow, Neue Verkaeufe = new_customers (Abo-Starts), Kuendigungen = cancellations (ohne Paketwechsel),
  Sold Gear = rev_gear_gross, Total Sales from Bank = Bank-Tab gesamt. Nie ueber Formeln; Protokoll im Tab "Finanzplan-Uebertrag".
  Das ORIGINAL 1RJ1UoQuiDBc52kNgRn3l5DfopAErSxsnI0X68vzvi60 erst nach Rubens Freigabe (FP_ID umstellen).
  Struktur des Plans (beide Dateien gleich): Zeile 1 Monatskoepfe (5..16 = 2025, 18..25 = 1-8.2026, 26..29 = 9-12.2026, 30 TOT,
  31.. 2027), Zeilen ZH: 4 Leads, 5 Trials, 6 Neue Verkaeufe, 10 Kuendigungen, 12 Total Kunden (Formel), 13 Kundenwert-Annahme
  (160-165), 14 Kundenwert aus Konto (Formel), 18 Total Umsatz Gruppentraining = Kunden x Kundenwert (auch fuer Ist-Monate!),
  21-36 Starterpakete je Typ, 38-41 PT, 43 Gear, 46 Weitere (Darlehen/PSP), 48 Total Sales Brutto, 53 Total Sales from Bank (UBS,
  stimmt auf den Franken mit unserem Bank-Tab), 58 Net Sales. WIN gleich, ab Zeile 15 um eins versetzt (48 Bank, 53 Net Sales).
  KORREKTUR meiner Aussage "25-40 % neben der Kasse": FALSCH. Plan 2026 ZH 1.469 Mio enthaelt ~270k Darlehen/PSP; ohne = ~1.2 Mio
  vs Kasse ~1.15 Mio; WT Plan 539k vs ~0.5 Mio.
- TEAM-KPIS: Klasse = "HH:MM Klasse" (time aus klassen.js: Start Time der Buchung/des Check-ins), Personen eines Tages nach
  Uhrzeit aufsteigend sortiert (Rubens Beispiel 12:00 Boxen, 16:30 Kindertraining, 17:40 MMA; sein "nach oben die spaeteren Kurse"
  als Diktierfehler gelesen - bei Widerspruch einfach umdrehen: tOf-Sortierung in trUpsert).
- EVENTS/CANCELLATIONS leer = nur Testzeilen, von dropTestRows entfernt; gelb = Formular-Tabs. Funktionieren unveraendert.
- Trigger neu (TR_TRIG_VER wm2): runMonatsabschlussDaily 04:30 (laufender Monat aus exercise.com + fpTransfer).
NACHTRAG 07.09. spaet: (1) exercise.com-Reports liefern "Start Time" als "yyyy/MM/dd hh:mm AM/PM" - slice(11,19) verlor das PM
(Team-KPIs zeigten 04:30 statt 16:30); klassen.js to24() rechnet auf 24 h um (56186c8). (2) clearSheet loescht jetzt alle Zeilen ab 2
und fuegt sie neu ein (aafe97d): getRowGroup().remove() liess Altgruppen ebenfalls stehen. (3) Editor-Run: nach dem Konto-Popup
"OK" registriert der erste Run-Klick oft nicht; IMMER per find "Stop the execution"/"Execution started" pruefen und sonst nochmals
klicken; browser_batch mit >~150 s Wartezeit bricht ab. (4) Der Stundenlauf stoesst den Monatsabschluss-Bau per Einmal-Trigger
runMonatsabschlussBuild an (gesehen 19:28, laeuft ~1-2 min). (5) Finanzplan-Uebertrag Erstlauf: 34 Zellen, Trials-Zeile im Plan
bekommt jetzt Erstbesuche inkl. No-Shows (ZH Jun 145 statt Rubens 93) - Definition mit Ruben klaeren; laufender Monat ueberschreibt
Rubens Planwert (Neue Verkaeufe Sep 45 -> 8), so gewollt; Kuendigungen ab Sep sind im Plan Formeln und bleiben unangetastet.
EINE METHODE (Ruben 07.09.2026 spaet, Commit b4a4e66): Kunden und Umsatz nur noch aus den Charges, BRUTTO ZUERST.
- Block "Abos": Kuendigungen (auch je Woche, aus cancels_d:yyyy-MM-dd = Enddatum), Paketwechsel (d), Nettowachstum (w), "Kunden mit
  laufendem Abo" = cv_active aus buildLTV (gestartet, nicht wirksam gekuendigt, PERSONEN; Aug ZH 642 = 567 Zahler + 75 ohne Zahlung),
  Details: davon ohne Abo-Zahlung (cv_nopay), Abos laut Report (subs_total, ab Sep; 649 Abos = 641 Personen), Periodenende, pausiert,
  geplant; Churn = Kuendigungen / cv_active (Formel). Abo-Starts auch je Woche (starts_d: = Startdatum). Tageswerte kommen aus
  klassen.js (starts_by_day/cancels_by_day) und werden vom Monatslauf als Keys starts_d:/cancels_d: gespeichert (drop-Prefix bei
  Neulauf). MA_CATCHUP '2026-09-07 Tageswerte August' laedt Aug nach (fuer den 31.08. in KW 36).
- Block "Umsatz": Zahlungen brutto (abo_gross + one_gross aus ZahlungenMonat, ohne Verteilung von Jahreszahlern, mit Buendel-
  Heuristik Starterpaket -> Einmalkaeufe), davon Abo (d), davon Einmalkaeufe (d), MwSt = brutto - brutto/1.081, Umsatz netto =
  brutto/1.081, Abo-Umsatz brutto je Kunde = abo_gross/cv_active (Aug ZH 168, Plan-Kundenwert 160 ist brutto!), netto je Kunde
  (/1.081, Basis LTV), Bankeingang gesamt laut Konto mit Details Stripe/Magicline/Ueberweisungen/uebrige + Kontrolle Stripe
  (Konto - erwartet). WEG: Preislisten-MRR (war faelschlich "netto", rechnete brutto), Ø je zahlendem Kunden, Refund/Gebuehr/
  MwSt-Detail, Erwarteter Bankeingang, Stripe-Auszahlung. Der Charges-Report hat eine unsaubere MwSt-Spalte (7.6-8.0 % des
  Betrags statt 7.49 %) -> ueberall /1.081 wie im Plan.
- LTV: Abo-Umsatz brutto/netto je Kunde und Monat ueber ALLE Neukunden mit laufendem Abo (inkl. Nichtzahler; Ruben: eine Methode,
  Winterthurer Luecke ist echt), LTV = netto x Dauer. Cohort-Tabelle netto (/VAT). Keine Jahreszahler-Verteilung mehr.
- Wochenzellen ohne Wochenwert grau (#f3f3f3) per setBackgrounds-Matrix je Block (ein Aufruf). Finanzplan: Anzahl Trials =
  trial_attended (Ruben: "durchgefuehrt").
NACHTRAG 07.09. 23:xx (Commit 37fee5b, Rubens Punkte): (1) exercise.com-Monatsreport "First Visits" datiert neu gebuchte No-Shows auf
den Buchungsmonat -> September ZH 23 statt 29 (Team-Sheet-Tageswerte). Ab MA_TEAM_FROM schreibt buildMonatsabschluss die
Team-Monatswerte (trial_attended, trial_noshow, noshow_rate) VOR dem Lesen in die MonatsHistorie; damit Woche = Monat und der
Finanzplan bekommt dieselbe Zahl. Davor (Jun-Aug) bleibt der Monatsreport. (2) Neue Kontakte auch je Woche (leads_by_day aus dem
Lifecycle-Datum -> leads_d:), Quoten als Formeln (auch je Woche), Kohorten-Conversion je Woche = Vertraege der Probetrainer der
Woche (csold/t). (3) Keine leeren Titelzeilen mehr (Ruben: "Zeile 23 ist leer"). (4) CHF in den Werbe-Beschriftungen.
(5) buildMonatsabschluss mit LockService.getUserLock().tryLock(0): parallele Baue (Stundenlauf-Trigger, Tageslauf, Nachlauf) legten
Diagramme doppelt uebereinander und Ruben sah ein leeres Blatt waehrend des Baus. (6) Frage Ruben "39 Monate": Dauer = 1 / Verlust-
quote; Verlustquote = wirksame Kuendigungen + Debt collection der letzten 6 Monate / aktive Neukunden-Monate (nicht aus 3 Monaten).
(7) Chrome: gviz mit tqx=out:csv loest einen Download aus und haengt den Tab; out:html + get_page_text funktioniert.
NACHTRAG 07.09. 23:30 (Commit 413c4ae): (1) VERLUSTE = wirksame Kuendigungen + Debt collection (debt_collection aus Lifecycle
"to ~ /debt/", auch je Tag debt_d:), Details davon Kuendigungen / davon Debt collection / Paketwechsel; Churn = Verluste / Kunden;
Finanzplan "Kuendigungen" bekommt die Verluste (Ruben: Kuendigungen kamen zu niedrig vor). Nachlauf Jun-Aug fuer debt_collection
(MA_CATCHUP '2026-09-07 Debt collection Jun-Aug'). (2) Jahresquoten: LET-Formel, Zaehler und Nenner nur aus Monaten, in denen
BEIDE stehen (Churn-Jahr war 1.9 % statt 3-4 %, weil Kunden ab Januar, Verluste erst ab Juni summiert wurden). (3) Tabs: keine
Reihenfolge mehr erzwungen (Ruben schiebt selbst), MA_TAB_HIDE versteckt Kuendigungsrisiko, Cancellations, Bank, Einstellungen,
Finanzplan-Uebertrag, Methodik. Bank/Einstellungen zum Eintragen einblenden. (4) Ruben-Frage "manuell reinschreiben": alle
Berichtstabs werden bei jedem Lauf komplett neu gebaut (clearSheet loescht Zeilen) - Handaenderungen dort halten hoechstens eine
Stunde. Eingaben nur in Bank, Einstellungen, Team-KPIs Anrufspalten, Finanzplan-Kopie.
DEFINITIONEN ABGENOMMEN (Ruben 08.09.2026 frueh, Commit 3bc1745): Abos verlaengern sich immer automatisch, es gibt keine
auslaufenden Vertraege -> Verlust = Kuendigung oder Debt collection, sonst nichts (Paketwechsel nicht). Zeile 35 Umsatz = nur
exercise.com (Stripe), Magicline/Ueberweisungen nur im Bankeingang. EINE LTV-Zahl: Abo-Umsatz netto je Kunde x Dauer + Starterpaket
+ uebrige Einmalkaeufe x Dauer ("LTV netto (CHF, Prognose)"); dazu der monatliche Abo-Wert brutto/netto. Finanzplan-Uebertrag
ersetzt in den Eingabezeilen ab Juni bis zum laufenden Monat auch Planformeln (alte Formel im Protokoll), ab Folgemonat nichts.
ARBEITSWEISE (Ruben 07.09. spaet, "red wie ein 60-jaehriger CEO"): weniger bauen, mehr pruefen; Definitionen sind eingefroren,
Aenderungen nur mit Rubens Ja; Berichte in Geschaeftssprache (Hebel: Verluste, Show-up, Zahlungsausfaelle), nicht in Zeilen.
Parallele Session hat f7926d5 (tools/whatsapp/dryrun.gs) committet - nur eigene Pfade adden.
WOCHEN = MONAT (Ruben 08.09. 00:50, Commit e36f8b8): Eine Woche zaehlt nur die Tage ihres Monats (KW 36 ohne den 31.08.), wrCollect
sammelt je TAG (out.day) und wrWeekOf/weekOf summiert die Tage der Woche innerhalb des Monats; daySumFor und mediaWeek ebenso.
Wochenquellen = Monatsquellen: Verkaeufe je Woche aus signed_d: (Waiver-Datum, klassen.js signed_by_day), Buchungen (placed) und
Kohorte (csold = Vertragsstart gesetzt) ab MA_TEAM_FROM je Woche UND Monat aus dem Team-Sheet. Damit ergeben die Wochen eines
Monats zusammen exakt den Monat (Team-"sold" wird nicht mehr genutzt).
VERKAUF = UNTERSCHRIFT DES ERSTEN ABOS (Ruben 08.09.2026 vormittags, nach Fund "Cain Schmid fehlt im Team-Sheet"): Befund: ZH September
14 Unterschriften in exercise.com, Team-Sheet zeigte 10 - Unterschrift vor dem gebuchten Trial (Corina Buralli, Max Taubenheim) hing
nicht an der Zeile (saleOf nahm nur Waiver >= Trial-Datum), Unterschreiber ohne Check-in/Buchung (Cain Schmid, Nicolaj Welten) hatten
keine Zeile. Rubens Entscheide: (1) Verkauf zaehlt am Tag der Unterschrift, auch vor dem Probetraining (klassen.js SALE_BACK = 60 Tage
vor dem Trial-Datum) oder ohne Check-in. (2) Nur Abos, nur der ERSTE Vertrag: lief > 60 Tage vor der Unterschrift schon ein Abo (nicht
PT) = Paketwechsel/Verlaengerung (Baraa Selmi), kein Verkauf; Stage "Client" ohne (auch geplantes) Abo und ohne Kuendigung = Einmalkauf
(Nicolaj Welten, 16x PT), kein Verkauf. Gilt im Team-Sheet (saleOf) UND im Monatsabschluss (computeMonat signedBy-Filter; Nachlauf
MA_CATCHUP '2026-09-08b' Jun-Aug). (3) Unterschreiber ohne Zeile ab TR_SALE_FROM 2026-09-01: Zeile am ersten Check-in bis TR_FV_BACK
60 Tage vor dem Fenster (fv-Reports laufen ab start-60, computeTrials fvOld; Zeilen entstehen daraus NUR fuer Unterschreiber), sonst
am Unterschriftstag mit Klasse "ohne Check-in"/"no check-in" (T.noVisit); zaehlt SOFORT als Trial und Verkauf, KEIN roter Hinweis
(Ruben: irrelevant, rote Hinweise an nicht verkaufsrelevanten Stellen verwirren die Sales-Leute). Standort aus dem Profil (Lifecycle
Location), zur Not Verkaeufer (Bogdan = WT). (4) Zahlungshinweis "Seit n Tagen unterschrieben, Zahlung fehlt" und Liste "Zahlung
offen" NICHT bei Abo mit geplantem Start in der Zukunft (Guipie, Start 01.10.). (5) CRM-Links: exercise.com-Reports liefern die
User-ID, die Profil-URL /ex4/clients/<id> braucht die Client-ID (Jamie Cujak: Report 3074376, Profil 2989977) - alle bisherigen Links
liefen ins Leere. Neue Phase 'cid' in klassen.js liest /api/v4/clients (4401 Kunden, je 500, parallel, kein Filter moeglich) und
liefert user_id -> id; Apps Script merkt die Zuordnung im versteckten Team-Sheet-Tab 'ClientIds' (trCidLookup, nur fehlende UIDs),
Fallback ohne Nummer = Kundensuche-Link "CRM (Suche)". Offen: Rubens Team meldete 6 ZH-Verkaeufe am 07.09., exercise.com kennt 5
(Waiver, Lifecycle, Assessments); kein geplantes Abo vom 07.09. - Name des sechsten von Ruben ausstehend.
NACHTRAG 08.09. ~09:30 (Commit de73b90 + Lauf): (a) Baraa Selmi (WT, Mitglied seit 09/2025) bekam trotzdem eine "no check-in"-Zeile:
sein altes Abo steht in keinem Report mehr (active_subscription zeigt nur das neue ab 01.09., cancelled_subscriptions Aug-Sep leer).
Neue Regel in saleOf/computeMonat: Waiver-Spalte "Created Account" mehr als 90 Tage vor der Unterschrift UND kein Erstbesuch
(3 Monate) UND kein Besuch im Fenster = bestehendes/frueheres Mitglied, kein Verkauf. (b) Tageszahl "Verkauft" zaehlt jede Zeile
mit Abschlussdatum (auch Gebucht/No-Show), trSold ebenso. (c) LEHRE: trUpsert behaelt alte Zeilen (byUid aus dem Blatt) - eine
Zeile, die klassen.js nicht mehr liefert, bleibt stehen. Falsche Zeile loswerden = UID-Zelle leeren (Zeilen ohne UID fallen beim
naechsten Lauf weg), so bei Selmi gemacht. (d) Editor: Run-Klick per Koordinate wird vom Konto-Popup geschluckt; zuverlaessig ist
find "OK button" + find "Run button" und Klick per ref, dann find "Execution started". get_page_text NIE auf der Editor-Seite
(zeigt die Token-Zeile). Ergebnis: ZH September Verkauft 13 (= 14 Unterschriften - Nicolaj PT), WT 9 (= 10 - Selmi).
KORREKTUR 08.09. 10:30 (Commit nach 1ad27f5): Baraa Selmi war KEIN Altmitglied - Lead seit 09/2025, Trial Booked 02/2026, Assessment +
Unterschrift 01.09.2026, einziges Paket IMPACT PRO ab 01.09. = echter Neukunde (WT September 10 Verkaeufe sind richtig). Die
"90-Tage-Konto"-Regel (de73b90/1ad27f5) war auf einer falschen Annahme gebaut und schloss auch Marina Knoepfel (Lead seit 11/2025,
Kauf 03.09.) aus -> ENTFERNT in saleOf und computeMonat. Bleibt: nur Abos (kein PT), nur erster Vertrag = kein aelteres laufendes Abo
UND kein Paketwechsel (cancelled_subscriptions "Converted" oder Ende zwischen 60 Tage vor und 30 Tage nach der Unterschrift).
Nachlauf MA_CATCHUP '2026-09-08d'. LEHRE: "Sign up"-Datum in exercise.com = Konto-/Lead-Anlage, NICHT Mitgliedschaftsbeginn.
COST PER LEAD JE KAMPAGNE (Ruben 08.09.2026 mittags, Tab Werbekosten, Tabelle "Kampagnen der letzten 30 Tage"): neue Spalten Leads und
CPL (CHF) hinter Klicks. Leads = Website-Leads (Daten "Zaehlt" = 1, Kanal = bezahlte Plattform) der letzten 30 Tage, Kampagne aus
dem Anzeigen-Link: Meta/TikTok haengen utm_campaign = exakter Kampagnenname an (Leads Spalte X), Google nur gad_campaignid in der
Seite (Leads N) -> WerbekostenDaten Spalte J "Kampagnen-ID" (Google-Ads-Skript schreibt campaign.id; Ruben muss das Skript in
Google Ads neu einfuegen), bis dahin Heuristik Standort + Little Ninjas/Erwachsene, wenn genau eine Kampagne passt. Nicht
zuordenbare bezahlte Leads stehen als Zeile "ohne Kampagnen-Zuordnung" je Plattform. wkLeadsByCampaign liest Daten und Leads
zeilenweise (Daten ist eine ARRAYFORMULA ueber Leads, gleiche Zeilennummern). Kein CPL in der Monatstabelle (der Monatsabschluss hat
CPL je Standort = Media / Website-Leads; keine parallele Methode).
NACHTRAG CPL (08.09. 11:30, Ruben: "CPL ist nicht 2'000+, hoechstens 100"): Ursache = Zeitraeume passten nicht: Kosten ab 09.08.
(30 Tage), Leads aber nur ab 01.09. (Daten "Zaehlt" gilt ab LOG_START) und Kampagne im Link erst seit 04.09. (WK_ATTR_FROM). Die
Kampagnentabelle nimmt jetzt Kosten UND Leads ab max(heute-30, WK_ATTR_FROM); Titel sagt es. Monatstabelle je Standort hat Leads +
CPL (CHF) = Media / Website-Leads des Monats (wkLeadsByMonth: ab LOG_START aus wrCollect, davor MonatsHistorie leads_web) - dieselbe
Zahl wie "Kosten pro Website-Lead" im Monatsabschluss, keine neue Methode.
VERKAUF = PAKET AKTIVIERT (Ruben 08.09.2026 13:xx, ersetzt "Verkauf = Unterschrift" vom Vormittag; Anlass Melvin Pappu: Trial 19.08.,
Unterschrift 20.08., Jahresrechnung am 01.09. bezahlt, Paket am 07.09. manuell aktiviert, kein Stripe-Abo -> "Sold Packages" des Teams
zaehlt 6 am 07.09., Waiver nur 5). Definition in BEIDEN Sheets: Verkauf = erstes Abo-Paket einer Person aktiviert = Abo-Start in
exercise.com (active_subscription "Start Date", geplante Starts am Starttag; Report liefert ALLE laufenden Abos unabhaengig vom
Fenster) ODER, fuer Personen ohne Abo und ohne Kuendigung, das Paket aus dem Report client_packages ("Activation"; Vorsicht: bei
Monatsabos ist Activation der Start der LAUFENDEN Abrechnungsperiode, deshalb nur fuer Personen ohne Abo = Rechnungskunden).
Mitgliedschaftspakete = alles ausser Personal Training / Single Session / Trial / Event (isMemberPkg). Kein Verkauf: aelteres Abo,
Paketwechsel (cancelled Converted / Ende nahe), PT. Die Unterschrift (Waiver) liefert nur noch den Verkaeufer. Monatsabschluss:
sales_signed = new_customers = Abo-Starts ohne Wechsel/PT + Rechnungspakete (eine Zahl; Zeile "Abos gestartet" und Wochenspalte
"Abo-Starts" entfernt), starts_d: = signed_d:, sales_open = davon Stage "Signed but no payment", sales_invoice = davon Rechnung.
Team-Sheet: "Abschluss am" = Aktivierungstag, "Kaeufer ohne Zeile" aus Abo-Starts + Rechnungspaketen (nur Datum <= heute).
Verworfen: sold_packages-Report (JSON nur Summen ohne Datum/E-Mail, CSV-Endpunkt liefert HTML). Nachlauf MA_CATCHUP 'e' Jun-Aug
(Historie = Abo-Starts wie bisher new_customers; gekuendigte Abos fehlen dort, bekannte Luecke).
NACHTRAG 08.09. 14:00: computeMonat nahm fuer Abo-Start, Kuendigungs-Ende und Besuchszeit dOf (UTC-Datum abgeschnitten) statt chDate
(Schweizer Datum) -> Starts nach 22:00 UTC landeten am Vortag, am Monatsanfang sogar im Vormonat (WT September 12 statt 13, Tage
verschoben). Jetzt ueberall chDate wie im Team-Sheet. Nachlauf 'e' rechnet Jun-Aug damit neu.
NACHTRAG 08.09. 14:10 (Abgleich Team-Sheet 17/13 vs Monatsabschluss 19/14): Antonio Vieni, Andreas March (Familienkonto, Little
Ninjas) und Aline Roig sind echte Abo-Starts ohne Kuendigung davor. Team-Sheet uebersprang sie: (1) saleOf schloss aus, wenn auf dem
Konto schon ein aelteres Abo lief (zweites Kind = neuer Verkauf, Ruben-Regel "Paket aktiviert") -> Ausschluss entfernt, Paketwechsel-
Regel bleibt; (2) "Kaeufer ohne Zeile" uebersprang prior (Besuch vor dem Fenster) -> entfernt. Monatsabschluss: cancelled-Report 60
Tage vor dem Monat laden, Paketwechsel wie im Team-Sheet (Converted oder Ende -60/+30 Tage um den Start), Kuendigungszahlen inMonth.
NACHTRAG 08.09. 14:20: Andreas March (Familienkonto) fehlte im Team-Sheet, weil saleOf jede "Converted"-Kuendigung im 180-Tage-Fenster
als Paketwechsel nahm (seine lag im April). Jetzt in beiden Sheets: Paketwechsel = Kuendigung zwischen 60 Tagen vor und 30 Tagen nach
dem neuen Start, egal ob "Converted". Damit Team-Sheet = Monatsabschluss (September ZH 19, WT 14). Parallel laufende Report-Fenster
(Nachlauf maCatchUp, Tageslauf) lassen runProbetrainings mit "t3 nicht fertig" scheitern - vor Handlaeufen die Executions pruefen.
ENDSTAND 08.09. 14:40 (Commits 2e5566d, 819ae6f): Paketwechsel-Pruefung im Team-Sheet relativ zum ABO-START (nicht zum Trial-Datum;
Leonid Berisha, Trial 08.07., Upgrade 07.09.). trOpenRows liefert alte Zeilen auch MIT Abschluss ab TR_SALE_FROM, damit ein spaeter
erkannter Paketwechsel den Abschluss wieder entfernt. September: ZH 19 Verkaeufe, WT 14 in Team-Sheet und Monatsabschluss identisch.
Apps Script UrlFetch auf /api/klassen meldete einmal "Address unavailable" (kurz nach einem Cloudflare-Deploy) - der Stundenlauf hat
den zweiten Versuch, Handlaeufe einfach wiederholen.
WERBEKOSTEN-TAB NEU (Ruben 08.09.2026 nachmittags, "konsistent wie der Monatsabschluss"): maContext(ss) liefert Daten + Spalten fuer
BEIDE Tabs (aus buildMonatsabschlussCore herausgeloest), maHeader(sh, r, ctx) die Kopfzeile. buildWerbekostenCore(ss, ctx): drei
Bloecke ZH/WT/Gesamt, Zeilen = Werbekosten Media (+ Plattform, ++ Kampagne), Agentur, gesamt, CPL (+ Plattform, ++ Kampagne), CPT
(+ Plattform aus Team-Sheet-Kanal, wrCollect tk), CAC Media (+ Verkaeufe je Plattform, + CAC je Plattform), CAC inkl. Agentur, Anteil
Verkaeufe aus bezahlten Kanaelen, LTV : CAC, Payback; Werte (keine Zellformeln), Jahr = Summe bzw. Quote aus Summen (yRatio); zwei
Gruppenstufen (det/det2); drei Diagramme je Block (Media gestapelt, CPL/CPT/CAC, LTV:CAC + Payback), Daten in WKDiagramm. Kampagnen:
wkCampAgg (Tag/Monat, "Beide" anteilig), Leads je Kampagne wkLeadsByCampaignDaily (ab WK_ATTR_FROM). Im Monatsabschluss sind die
Werbezeilen weg (nur LTV bleibt). Bau: buildMonatsabschlussCore plant wkScheduleBuild -> runWerbekostenBuild eine Minute spaeter
(eigene Ausfuehrung, 6-Minuten-Limit); runWerbekosten (06:30) ruft nur noch buildMonatsabschluss. Alte Tabellen (Monatsliste,
Kampagnen je Monat, letzte 30 Tage) und wkLeadsByMonth/wkLeadsByCampaign sind entfernt. Marketing-Quote bewusst NICHT (Ruben).
FEHLER 09.09.2026 (Review): Rechnungskunden-Regel zaehlte Altkunden. client_packages ist FENSTERABHAENGIG: mit Monatsfenster liefert
der Report die Abrechnungsperioden aller Mitglieder dieses Monats (Activation = Periodenstart, 759 Pakete im Juni), nicht nur laufende
Pakete. Der Nachlauf 'e' zaehlte in ZH Juni 44 / Juli 27 "Rechnungskunden" (Verkaeufe Juni 84 statt ~40) und fpTransfer schrieb das
in die Plan-Kopie. Fix: invoicePackages nur bei Amount leer (keine Kartenbelastung), Person neu (Waiver "Created Account" <= 120 Tage
vor der Aktivierung; Waiver-Report im Monatslauf 90 Tage vor dem Monat), Nachlauf 'f' Jun-Aug, Tageslauf schreibt den Plan neu.
Werbekosten-Bau 09.09. 15:06 lief in den 30-Minuten-Timeout (Tab eine Stunde leer, 16:07 wieder gefuellt) - Ursache unbekannt,
Verbesserung: Bloecke mit einem setValues schreiben statt je Zeile.

## VERKAUF = SOLD PACKAGES, VERLUST = CANCELLED SUBSCRIPTIONS (09.09.2026, Entscheid Ruben, "Variante A")
- EIN Report je Seite: Verkäufe = Personen im exercise.com-Report "Sold Packages" des Monats (Rubens Liste), Verluste = Personen im Report
  "Cancelled Subscriptions" mit "Ended At" im Monat. Was nicht zählt, ist auf beiden Seiten deckungsgleich: nur Mitgliedschaftspakete
  (`isMemberPkg`: kein Personal Training, keine Single/Trial-Session, keine Events), keine Gratis-Abos (Payment Type "free"; Gratis-Ende ist
  keine Kündigung), eine Person zählt einmal, Paketwechsel weder Verkauf noch Verlust (Converted = Yes; Abo-Ende −60/+30 Tage um den
  Verkaufstag ⇄ neues Abo −30/+60 Tage um das Ende). Debt collection ist KEIN Verlust mehr (nur Info-Zeile), auch im LTV nicht.
- Ausnahme Rechnungszahler (z. B. Melvin Pappu, Paket erscheint als "free"): zählt nur mit Tag "Rechnung" oder "Invoice" am Kunden
  in exercise.com (klassen.js `tagsOf`, Tags aus der v4-Kundenliste bzw. `/api/v4/clients/<cid>`). Ruben muss den Tag setzen (offen).
- Verkaufstag (für die Wochenspalten) = Aktivierung des verkauften Pakets im Report client_packages (Monatsfenster), sonst Abo-Start,
  sonst Monatsanfang. Sold Packages hat keine Datumsspalte, nur Name/Users/Location/Payment Type/Amount.
- Sold Packages zeigt ein Paket erst, wenn das Abo gestartet ist (Ruben 09.09.) → Verkaufsmonat = Startmonat, kein Unterschrift-Datum mehr.
- Ein Cache je Report-Typ: m1 refresht sold_packages mit 12-Monats-Fenster (Gratis-Personen), m2 liest es und refresht das Monatsfenster,
  m3 wartet darauf. Namen aus Sold Packages werden über die v4-Kundenliste (`clientIndex`, Name → User-ID/E-Mail) zugeordnet;
  nicht zuordenbare Namen zählen trotzdem (Standort-Annahme) und stehen als "sold_no_uid" im Log.
- Team-Sheet: Gratis-Abo (Payment Plan Price 0 / Coupon 100 %) ist kein Verkauf, ausser Tag Rechnung; Rechnungspakete ohne Abo nur mit Tag.
- Nachlauf Jun–Aug über MA_CATCHUP 'g'; Kontrolle Juli ZH gegen Abdis Liste (45 Pakete = 42 Personen, davon 3 Bestandskunden,
  1 Gratis, 1 August-Start) in der Chat-Antwort vom 09.09.
- NACHTRAG 09.09. 17:40: Staff (Trainer laut Check-ins, @impact-martialarts.com) zählt weder als Verkauf noch als Verlust. "Nur der erste Vertrag":
  Sold Packages listet auch Bestandskunden, deren laufendes Abo nur neu verbucht wurde (Juli: Roman Smagulov, Mladen Arsov, Shpend Gashi,
  Gentian Sopi, Jan Zihler) → hatte die Person in den 12 Vormonaten (sold12 = [Monatsanfang−365, Monatsanfang−1]) schon Abo-Pakete und nicht
  mehr laufende Abos als Vorpakete (kein zusätzliches Abo, z. B. zweites Kind), ist es kein Verkauf (`isReactivation`).
- exercise.com-Report-Cache ist je Login-Session: Browser-Reads/Refreshes (Rubens Session) stören die Cloudflare-Läufe nicht; Kollisionen nur
  zwischen Apps-Script-Läufen. Die v4-Kundenliste liefert `tags` als Komma-String.
- NACHTRAG 09.09. 18:00: Sold Packages hat für migrierte/ältere Abos KEIN Vorpaket (Roman Smagulov seit Jan 2026 taucht in 12 Vormonaten nicht auf) →
  zusätzliche Regel `isOlderMember`: älteres laufendes Abo (Start vor dem Monat) und KEIN Abo-Start im Monat oder später = kein Verkauf
  (Familienkonten haben einen neuen Abo-Start und zählen). Kundenliste kommt aus Phase `mc` (Apps Script ruft sie mit dem Monatsfenster
  auf und gibt `clients_by_name` an m3 weiter); m3 wurde sonst mit 502 abgebrochen. Erwartung Sep 2026 (bis 09.09.): ZH 22 Verkäufe / 11 Verluste,
  WT 15 / 0; Juli ZH 37 / 24, WT 14 / 4.
- ENDSTAND 09.09. 19:00 (e4b659c, Editor identisch + Token): Nachlauf Jun–Sep gelaufen, Finanzplan-Kopie aktualisiert (Log 18:57, 9 Zellen).
  Verkäufe/Verluste neu: Jun ZH 43/20, WT 21/4 · Jul ZH 37/24, WT 14/4 · Aug ZH 36/24, WT 28/9 · Sep (bis 09.09.) ZH 23/11, WT 16/0.
  Vorher (Abo-Starts + Rechnungspakete, Verluste inkl. Debt collection): Jun 40/20, 20/4 · Jul 36/27, 13/5 · Aug 38/27, 28/14 · Sep 23/11, 15/2.
  Staff-Liste `STAFF_EXTRA` (Waseem Samour) in klassen.js, weil der Check-in-Trainername vom Kundenkonto abweicht.
  Offen für Ruben: Tag "Rechnung"/"Invoice" bei Rechnungszahlern setzen (Melvin Pappu, evtl. Cayque Rodrigues/Stiftung), sonst zählen sie als Gratis.

## TEAM-SHEET UMBAU 09.09.2026 abends (1bc2386, 05be08d, Entscheide Ruben)
- Tageskopf A–H: Tag | Anrufe versucht | Anrufe geführt | Gebuchte Trials | Trials | No-Shows | Vertragsunterschrift | Paketstart.
  Personenzeile ab I (17 Spalten): Trial-Datum, Name, Art, Klasse, Kanal, Lifecycle-Stage, Prüfen, Vertragsunterschrift (Waiver-Datum),
  Paketstart (= Verkauf, gleich wie Analytics), Verkäufer, Paket, Letzte Notiz, CRM, dann eingeklappt: Buchung erstellt am, UID, NS, Stand.
  Trainer und Gebucht von entfernt (waren ohnehin leer). WT-Tab Englisch: Contract signed / Package start / No check-in (check).
- Neuer Zustand "Kein Check-in (prüfen)" (gelb): Buchung vorbei (früherer Tag oder heute > 2 h nach Klassenbeginn), kein Check-in, kein
  No-Show, nicht storniert. Vorher blieb die alte Zeile "Gebucht (kommend)" stehen (Victor Vigodski, Lucijana Dinkel).
- Beim Spaltenumbau baut trUpsert die Tabs neu (trInit); Anrufe (B/C) bleiben über oldDays erhalten, alte Personenzeilen werden verworfen
  (Handkopien für zweite Kinder müssen neu kopiert werden). trHeadOk() schützt trOpenRows/trSheetUids vor dem alten Layout.
- Cancellations-Feedback (Analytics-Tab "Cancellations", seit 07.09. versteckt) wird stündlich als Lese-Spiegel in das WhatsApp-Automation-
  Sheet (125Uy-sdroaNF25ZLO11O36iRfOVuxCBDNe6s-Od7ep0, Tab "Cancellations") geschrieben: nur dieser Tab, nur die gespiegelten Spalten,
  rechts davon "Your notes" für Waseem. Das Sheet gehört zum WhatsApp-Chat, sonst nichts anfassen.
- Monatsabschluss "Probetraining gebucht" kommt seit September aus dem Team-Sheet (Gebuchte Trials je Tag), davor Lifecycle-Report.
- NACHTRAG 09.09. 20:15 (a821119): Trainer-Spalte bleibt (neben Klasse) und wird jetzt gefüllt (die Zuweisung stand seit 07.09. in einem
  Kommentar → war immer leer); nur "Gebucht von" ist raus (18 Personenspalten, CI.coach = 4). Farben: Paketstart = satt grün #34a853 mit
  weisser Schrift, nur Vertragsunterschrift ohne Paketstart = hellgrün #b7e1cd, Kein Check-in/Wiederholer/Event = gelb, Prüfen-Text = rot.

## ZWEI CHATS FÜR DIE SHEETS (ab 09.09.2026 abends, Rubens Wunsch)
- Chat A "Team-KPI-Sheet": Team-Sheet (Tabs Probetrainings ZH/WT, ClientIds, Events-Spiegel), Open-Payments-Sheet, WhatsApp-Spiegel
  "Cancellations", Tages-Mails; Code: klassen.js `computeTrials`/Phasen t1–t3/lr/lg/cid, Apps Script `tr*`, `pay*`, `teamMirror*`,
  `waMirror*`, `TR_*`/`CI`/`DI`, `runProbetrainings*`.
- Chat B "Analytics-Sheet": Monatsabschluss, Werbekosten, LTV, Klassenanalyse, Kündigungsrisiko, MonatsHistorie, Finanzplan-Übertrag;
  Code: klassen.js `computeMonat`/`monat`/`ltv`/Klassen, Apps Script `ma*`, `wk*`, `buildLTV`, `fp*`, `runMonatsabschluss*`, `maCatchUp`.
- Geteilt (nur nach Absprache ändern): `DI`/`CI`/`TR_T` (Chat B liest das Team-Sheet in `wrCollect`), `klassenCall`, `clearSheet`,
  `getOrCreate`, `mailOnce`, Trigger-Installation, `runProbetrainingsHourly` (ruft `maQueueCatchUp`/`maScheduleBuild`).
- Regeln, damit sich die Chats nicht überschreiben: (1) vor jeder Änderung `git pull`; (2) nur eigene Dateien/Hunks committen und sofort
  pushen; (3) ins Apps Script IMMER aus dem gepushten GitHub-HEAD einspielen (Editor-Rezept holt die Raw-Datei per Commit-SHA), nie aus
  einem lokalen Zwischenstand; (4) manuelle Läufe (RUN_NOW) nie zwischen :55 und :08 und nicht gleichzeitig mit dem anderen Chat, weil
  exercise.com-Report-Caches und das 6-Minuten-Limit geteilt sind; (5) nach dem Einspielen kurz im Editor prüfen, dass Marker des anderen
  Chats noch da sind (z. B. `WA_SHEET_ID` und `MA_CATCHUP`).
- ERLEDIGT in Chat A am 09.09. 21:30 (Variante A, Entscheid Ruben 20:40): Orange = Vertragsunterschrift seit 7 Tagen oder länger,
  KEIN Paketstart, Stage "Signed but no payment"; geplante Starts sind automatisch draussen (dann steht ein Datum in Paketstart).
  klassen.js `saleOf` gibt `signed`/`by` jetzt auch ohne Verkauf zurück (vorher blieb die Spalte Vertragsunterschrift bei diesen Leuten
  leer), `trCheck` prüft die Unterschrift statt den Paketstart, `T.chk.pay` neu formuliert, und die Orange-Regel steht in `trFormat` VOR
  der roten Prüfen-Regel (sonst hätte Rot sie überdeckt). Die alte Regel (Paketstart + Signed but no payment) war unsinnig: mit Paketstart
  wird die Stage automatisch "Client". Ruben: vor solchen Regeländerungen erst fragen.

## ZEILE 2 IM TEAM-SHEET = NUR FARB-LEGENDE (09.09.2026, Entscheid Ruben)
- Zeile 2 (A2, verbunden A2:Z2) zeigt nur noch die Farben der Zeilen (`TR_T.legend`), als Notiz an der Zelle hängt die ausführliche
  Erklärung je Farbe (`TR_T.legendNote`). Alle anderen Erklärungen sind dort weg: `ruleShort` gibt es nicht mehr, `TR_T.rule` bleibt nur
  noch als Quelle für den Abschnitt "Team KPIs" im Tab Methodik des Analytics-Sheets. Die Spaltenerklärungen bleiben als Notiz auf den
  Überschriften (Zeile 4).
- Farben (gelten immer für die ganze Personenzeile): satt grün #34a853 = Paketstart da (Verkauf) · hellgrün #b7e1cd = unterschrieben,
  kein Paketstart · orange #fdead1 = Unterschrift ≥ 7 Tage, kein Paketstart, Stage "Signed but no payment" · rot #fce4e4 = "Prüfen" hat
  Text · gelb #fce8b2 = Kein Check-in/Wiederholer/Rückkehrer/Event · graue Schrift = No-Show/Storniert/Gebucht · grau durchgestrichen =
  Non-Client. Reihenfolge in `trFormat` ist die Priorität: Non-Client, orange, rot, satt grün, hellgrün, grau, gelb.
- Neuer Legendentext löst KEINEN Neuaufbau der Tabs mehr aus: `trUpsert` vergleicht A2 nur noch, um über `trA2()` die Zeile 2
  nachzuziehen; neu aufgebaut (mit Verlust der handkopierten Zeilen) wird nur bei geänderten Überschriften.
- EINGESPIELT 09.09. 21:38 (Commit f21f716 aus dem GitHub-HEAD ins Apps Script, Token-Zeile behalten, gespeichert = "cloud_done").
  KEINE neue Webapp-Version nötig: `runProbetrainingsHourly` läuft als "Head", die Webapp-Funktionen (doGet/doPost) sind unverändert
  auf Version 29. Der Stundenlauf startet bei ~:58 (deshalb die Regel, zwischen :55 und :08 nie von Hand zu starten), Zeile 2 und die
  neue Orange-Regel greifen also ab dem Lauf um ~21:58.
- Geprüft ohne Live-Lauf mit jsc-Stubs (/tmp/trcheck_test.js, /tmp/trformat_test.js): Unterschrift 28 Tage alt ohne Paketstart = Hinweis,
  unter 7 Tagen = nichts, geplanter Start 01.10. = nichts, alter Fall (Paketstart + Stage) = kein Hinweis mehr, Non-Client = nichts.
  Erzeugte Regeln in der richtigen Reihenfolge: Non-Client, orange `=AND($Q5<>"",$R5="",$O5="Signed but no payment",TODAY()-$Q5>=7)`,
  rot `=$P5<>""`, satt grün `=$R5<>""`, hellgrün, grau, gelb.
- LIVE BESTÄTIGT 09.09. 22:04 (Stundenlauf 21:58:35, 364.7 s, Completed): Probetrainings WT Zeile 79 Deniz Kaya ist orange,
  "Contract signed" 31.08.2026, "Package start" leer, Stage "Signed but no payment", Prüfen-Text "Signed 9 days ago, no package
  start: payment still missing"; Myriam Hofer analog mit 13 Tagen. Zeile 2 zeigt die englische Farb-Legende. Vorher (Lauf 20:58 mit
  altem Code) war die Spalte leer - genau die Lücke, die Variante A geschlossen hat.
- ⚠️ LAUFZEIT AM LIMIT: runProbetrainingsHourly braucht 137-365 s (19:58: 352.9 s, 21:58: 364.7 s) gegen das 6-Minuten-Limit von
  Apps Script. Nicht von dieser Änderung verursacht (die alten Läufe waren schon so lang), aber der nächste Umbau in Chat A sollte
  Phasen/Sleeps kürzen, sonst kippen die Läufe irgendwann in "Exceeded maximum execution time".
- ⚠️ EDITOR-LEHRE 09.09. 21:47: Im Apps-Script-Editor NICHT über Element-Referenzen des Browser-Tools klicken - die Referenz-Nummern
  werden zwischen zwei Abfragen neu vergeben (ref_161 war zuerst "Save project to Drive", beim nächsten Blick "Run the selected
  function"). Dadurch sind zwei ungewollte Läufe meiner Hilfsfunktion gestartet (21:42 Failed, 21:47 Completed). Speichern zuverlässig
  nur per synthetischem Cmd+S aus der Seite heraus (KeyboardEvent mit metaKey auf document.activeElement); der echte Tastendruck des
  Browser-Tools hat NICHT gespeichert.

## LAUFZEIT TEAM-SHEET: WARTEZEITEN, MESSUNG, SCHREIBSCHUTZ (09.09.2026, 94c1920, eingespielt 22:20, Ruben: "mach wie du denkst")
- Der Lauf besteht aus t1 (8 Reports anstossen), t2, 5 Lifecycle-Bloecken (180 Tage in 45-Tage-Stuecken, ein Cache => strikt
  nacheinander), t3 (8 Reports holen und rechnen) und dem Schreiben. Feste Schlafzeit war 20 + 5x8 + 20 = 80 s pro Lauf, dazu
  ~30 Abfragen NACHEINANDER (Reports bis 8000 Zeilen). Beobachtet: 137 s / 353 s / 365 s bei 360 s Limit.
- GEBAUT: `TR_WAIT` [6,10,14,20,20,20,22,24,24] s und `TR_WAIT_LIFE` [4,6,8,10,12,12,12,12] s statt pauschal 20 bzw. 8 s
  (`trNap` klammert ueber das Listenende). Bei einer Runde je Etappe 32 s statt 80 s, bei zwei Runden 82 s statt 160 s
  (mit jsc gerechnet: gespart 48 / 78 / 90 s bei 1 / 2 / 3 Runden).
- GEBAUT: `trTimer` loggt "Probetrainings Zeiten: t1 .. | t2 (Nx) .. | life 5 Bloecke/N Abfragen .. | t3 (Nx) .. | schreiben .. |
  gesamt ..s". Damit sind die naechsten Optimierungen gemessen statt geschaetzt.
- GEBAUT: `TR_BUDGET_MS` = 300 s. Ueber dem Budget wird GAR NICHT geschrieben (trUpsert loescht vor dem Schreiben; ein Abbruch
  dazwischen liesse den Tab leer stehen); der Lauf endet mit einer Log-Zeile, ohne `trLastOk` zu setzen, der naechste Lauf holt alles nach.
- GEBAUT: `runProbetrainingsHourly` startet den kompletten Neuversuch nur, wenn erst < 120 s verbraucht sind. Vorher lief bei einem
  Fehler nach 150+ s der ganze Lauf ein zweites Mal und riss das Limit sicher.
- GEMESSEN 09.09. 22:58 (erster Lauf mit den neuen Wartezeiten): 115.1 s gesamt, Completed. Log:
  `t1 9s | t2 (2x) 19s | life 5 Bloecke/5 Abfragen 26s | t3 (1x) 14s | schreiben 44s | gesamt 111s`
  (Laeufe davor mit altem Code: 137 s, 352.9 s, 364.7 s). Ergebnis der Etappen: die Reports von exercise.com sind schnell fertig
  (jeder Lifecycle-Block war schon bei der ERSTEN Abfrage nach 4 s bereit, t3 in einer Runde), die Zeit lag frueher fast nur im
  pauschalen Schlafen.
- ENTSCHIED nach der Messung: (2) Reports parallel holen und (3) alte Lifecycle-Bloecke nicht neu erzeugen werden NICHT gebaut.
  (2) braechte nur ein paar Sekunden (t1 9 s, t3 14 s inkl. 6 s Schlafen), (3) hoechstens ~20 s und dafuer das payopen-Risiko.
  Der Lauf hat mit 111 s jetzt rund 250 s Luft zum Limit.
- Groesster Posten ist neu das SCHREIBEN mit 44 s (beide Team-Tabs, Open Payments, Events-Spiegel, WA-Spiegel, ClientIds-Lookup).
  Falls je wieder Luft fehlt, dort ansetzen (z. B. Spiegel nur schreiben, wenn sich etwas geaendert hat) - nicht bei den Reports.
- ⚠️ OFFEN GEBLIEBEN (nur relevant, falls (3) doch je gebaut wird): `payopen` in klassen.js laeuft ueber die Roh-Zeilen und nimmt die
  erste Zeile mit "Signed but no payment" statt die neueste je E-Mail (`lifeBy` macht es richtig). Mit aelteren Bloecken koennte
  jemand in Waseems Liste stehen bleiben, der schon bezahlt hat. Heute unkritisch, weil jeder Block frisch erzeugt wird.
- ⚠️ PARALLELARBEIT 09.09. 22:20: Der Analytics-Chat hatte 80bd192 (`clearSheet` legt Tabs mit defekten Diagrammen neu an und gibt
  das Blatt zurueck, `trInit` gibt `sh` zurueck) schon eingespielt. Vor dem Einfuegen deshalb IMMER: Funktionsnamen des Editors gegen
  den eigenen Stand vergleichen (`onlyInEditor` muss leer sein) UND den Editor gegen den letzten gemeinsamen Commit diffen. Hier war
  der Editor exakt 80bd192 und mein Commit dessen Nachfolger - sonst haette ich seinen Fix geloescht.
- NACHTRAG 09.09. 21:45 (64cc2bf): Werbekosten-Bau hat jetzt denselben User-Lock wie der Monatsabschluss-Bau (parallele Baue aus
  Nachlauf-Kette + Stundenlauf + RUN_NOW hatten leere "Add a series"-Diagramme und überlagerte Diagramme erzeugt). Werbekosten ohne
  Skriptfarben im Datenbereich; von Hand gefärbte ZEILEN (Farbe in Spalte A) werden beim Neuaufbau über Block+Zeilentext zurückgeschrieben,
  einzelne Zellfarben nicht (Spalten verschieben sich mit jeder neuen KW). Eine Gruppenstufe (Plattform + Kampagnen zusammen), Meta violett.
  Events-Tab im Analytics-Sheet versteckt (Bogdan sieht den Spiegel im Team-Sheet). Nachlauf Jan–Mai 2026 angestossen (M6/M7 Jahreswerte
  "Neue Kontakte" fehlten, weil Jan–Mai nie berechnet waren); ⚠️ Migrationsmonate (WT Nov 2025, ZH Dez–März) können Lifecycle-Effekte zeigen.
- NACHLAUF JAN–MAI 2026 gelaufen (09.09. 22:09–22:34): MonatsHistorie hat jetzt Jan–Mai (Neue Kontakte ZH 223/213/252/196/242, WT 174/139/143/114/95;
  Verkäufe ZH 106/76/73/55/39, WT 34/28/38/24/27; Verluste ZH 16/15/16/14/18, WT 2/3/2/1/7). Jahresspalte "Neue Kontakte" 2026: ZH 2011, WT 1083.
  ⚠️ Verkäufe Jan–Mär ZH sind durch die Migration (Abos in exercise.com neu angelegt, Sold Packages listet sie) überhöht; Entscheid Ruben offen,
  ob Verkäufe/Nettowachstum vor April 2026 ausgeblendet werden. Mai-Lauf brauchte 763 s (Workspace-Limit 30 min, kein Abbruch).


## GESCHWISTERKINDER UND HERKUNFT (10.09.2026, Entscheide Ruben)
- GESCHWISTER (c837a9f, eingespielt 10.09.): Konten mit zwei Kindern im Namen (`TR_SIB` = "&", "+", " und ", " and ") bekommen die
  zweite Zeile automatisch, nicht mehr als Handkopie (die ging beim Spaltenumbau am 09.09. verloren). Eine umbenannte Kopie
  (`extras`) hat Vorrang, dann erzeugt das Skript keine zweite. Erkennung an 38 echten Namen geprueft: 4 von 4 Geschwister erkannt,
  0 Fehltreffer. Betroffen sind heute Andreas March (fuer Ricardo und Leonardo), Giancarlo + Amea Stasi, Giorgio & Gabrielle
  Radaelli, Linus Moel & Nicola (Joana) Welti.
- REGEL RUBEN 10.09.: zwei Pakete auf einem Konto = ZWEI Verkaeufe, ein Paket = einer. Deshalb meldet `saleOf` ein zweites Abo als
  `second`, und nur damit bekommt die zweite Zeile Vertragsunterschrift/Paketstart/Verkaeufer/Paket. Auf der zweiten Zeile steht
  KEIN Pruefen-Hinweis (die Stage gehoert dem Konto) und kein zweites "Buchung erstellt am" (eine Buchung fuer beide Kinder).
- Monatsabschluss zaehlt jetzt die Abo-Starts des Monats je Konto statt der Personen (`salesExp`, `L.sales_siblings` zur Kontrolle).
  Ein Paketwechsel erzeugt keinen zweiten Start im Monat, wird also nicht doppelt gezaehlt. WIRKUNG GEPRUEFT (Juni-Sep, nur laufende
  Abos): nur DREI Konten haben ueberhaupt zwei Abo-Starts im selben Monat (2x Mai NINJA BASIC + NINJA BASIC, 1x Juli NINJA BASIC +
  IMPACT BASIC). Juni, August und September aendern sich dadurch NICHT, Juli bekommt +1.
- HERKUNFT (9d1f8d2): Die Seiten lasen `document.referrer` nur von der Seite mit dem Formular. Wer ueber Google auf der Startseite
  landete und dann intern zur Kursseite klickte, kam als "Direkt" an - deshalb standen bei 43 Zeilen mit Kanal 27x "Direkt" und nur
  1x "Google organisch". Jetzt wird die erste FREMDE Herkunft 30 Tage in `localStorage.imp_ref` gemerkt (gleiches Muster wie die
  Klick-IDs) und verwendet, sobald der aktuelle Referrer intern oder leer ist. 36 Seiten + 2 Templates, mit jsc an 5 Besucherwegen
  geprueft. Klick-IDs (gclid/fbclid/ttclid) waren schon vorher korrekt, die sind 30 Tage gespeichert.
- BEWIESEN 10.09. (Rubens Einwand war richtig, meine Schlussfolgerung falsch): Seit dem 02.09. wurden 161 neue exercise.com-Konten
  angelegt, im selben Zeitraum kamen 157 neue Website-Anfragen - der Weg ins System fuehrt praktisch nur ueber die Website. Von den
  25 Personen, die am 09.09. ohne Kanal gebucht haben, haben 24 ihr Konto VOR dem 02.09. (meist Mitte August); nur eine ist neu.
  Der fehlende Kanal ist also ein Zeitfenster-Effekt, kein Kundenverhalten und kein Zuordnungsfehler. Zwischen Anfrage und
  Probetraining liegen bei IMPACT oft zwei bis vier Wochen.
- Anrufliste im Sheet: NICHT bauen (Ruben 10.09.), das bilden die Jungs in exercise.com ueber Trial Booked und die Lead-Liste ab.
## AUSSCHLUSS-TAB "MonthlySalesCheck" (10.09.2026, Auftrag Ruben via Team-KPI-Chat, gebaut 3d4e804)
- klassen.js computeMonat liefert `sold_excluded_list` (je Person aus Sold Packages, die nicht als Verkauf zählt: loc, name, pkg, date,
  reason, member, uid). Gründe in Filterreihenfolge: "Not a membership package" (PT/Single/Event, nicht in sold_raw), "One-time purchase
  (no subscription)", "Free (no invoice tag)", "Staff", "Package change" (isSwitchSale), "Reactivation" (isReactivation), "Existing member"
  (isOlderMember). Je Standort in der MonatsHistorie: `sold_raw` (Abo-Paket-Personen vor den Filtern + zweite Paketstarts je Konto),
  `sold_excluded` (Zeilen ausser "Not a membership package"), `sold_nonmember`, `sold_real` = `sales_signed`; sold_raw − sold_excluded = sales_signed.
- Apps Script `maWriteSalesCheck(ss, mk, list)` (in runMonatsabschluss nach maStoreCohorts): versteckter Tab "MonthlySalesCheck", Kopf
  Month | Location | Name | Package | Sale date | Reason (alles Text), Zeilen des Monats werden je Lauf ersetzt, ältere Monate bleiben.
  Anzeige "Paketstarts − Ausschlüsse = reale Verkäufe" im Team-Sheet macht der Team-KPI-Chat.
