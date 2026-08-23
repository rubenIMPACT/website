# IMPACT Website – Projektkontext

Statischer Rebuild von impact-martialarts.com (weg von Webflow). Deploy: Cloudflare Pages -> start.impact-martialarts.com (~60s Lag). Alle Seiten noindex bis Launch. Sprache: Deutsch (CH-Schreibweise, kein ß, KEINE Em-Dashes/Gedankenstriche im Text).

## Regeln (verbindlich)
- Vor JEDEM Push: Playwright-Rendercheck (mobil 390px + Desktop 1280px) + HTML-Parse + Div-Balance (Anzahl `<div` == `</div>`) + JS-Syntax (`new Function` je `<script>`). Rot = kein Push.
- Kein Platzhalter-Content. Fehlt Material (Fotos, Texte, Namen), Karte weglassen oder Typo-Karte, und Ruben fragen.
- Design-Entscheide vor Umsetzung mit Ruben klären. Original-Webflow-Seite ist Referenz: Struktur nahe am Original, Design neu.
- Asset-Pfade absolut (`/assets/...`).
- Excel/Dokumente: nur minimale, gezielte Edits.

## Architektur
- 76 Seiten, statisch. Kursseiten = Landing Pages: URL-Param-Erkennung (gclid/fbclid/utm/?ad=1) blendet Nav aus (admode). Alte /probetraining/-URLs -> 301 auf Kursseiten.
- Nav: Standortseiten + alle Kursseiten teilen dieselbe Stadt-Nav (navwrap + topbar + mobmenu + burger). Team-Menüpunkt = Dropdown (.teamdd) mit Trainerliste je Stadt, Links auf Live-Webflow-Trainerprofile (noch nicht migriert).
- Footer v2 auf allen 25 navwrap-Seiten, 1:1 nach Original. Newsletter aktuell mailto-Übergang (Zielsystem offen, Ruben fragen). Nur Instagram, kein Facebook (Entscheid Ruben).
- Stundenplan (/{stadt}/stundenplan/): Zeitraster, Zeit links gold, zwei Slot-Spalten (Zürich mit Mat A/B-Kopf, Winterthur ohne). Mobil 1 Tag, Desktop 3 Tage nebeneinander. Statischer Plan als Fallback im HTML; Live-Layer (`/*splive*/`) ersetzt ihn mit Daten von `/api/schedule?loc=...`.
- functions/api/schedule.js: liest öffentlichen exercise.com-Endpunkt `https://app.impact-martialarts.com/api/v4/calendar` (liefert ~4 Wochen, beide Standorte, location_id 2222=Winterthur / 2508=Zürich), filtert 7 Tage, cached 15min, gibt KEINE client_names weiter (Endpunkt leakt Teilnehmernamen – DSGVO-Meldung an exercise.com via Bogdan offen). Browser-Header nötig, sonst 502 von deren Cloudflare. Live-Verifikation Stand jetzt offen: Prüfen ob unter den Tages-Tabs Datumszeilen erscheinen; wenn nicht, Plan B: native exercise.com-Domain als Upstream.
- functions/api/lead.js: Formular -> exercise.com (sign_in mit env EXERCISE_*, dann POST /api/v2/clients, lifecycle_stage_id 9398).
- Kursübersichten /{stadt}/kurse/: Foto-Grid (.kgrid/.kcard). Ringen + Little Ninjas: Typo-Karten, Fotos von Ruben ausstehend.

## Offene Punkte
1. Live-API-Verifikation Stundenplan (siehe oben).
2. Namen der 3 Winterthur-Google-Rezensionen (aktuell "Google-Rezension · Winterthur").
3. Fotos: Ringen, Little Ninjas (Kursgrid). 5 Trainer-Erfolge (Laszlo, Natassja, Dario, Florian, Quentz) für Trainer-Grid.
4. Newsletter-Zielsystem (Make/Mailtool/exercise.com?).
5. 14 Kursseiten inhaltlich ausbauen nach MT/BJJ-Vorbild – wartet auf Material von Ruben (Coach+Satz, 3-4 Fotos, 2-3 Sätze je Disziplin+Standort).
6. Entscheid Ruben: "Self Defense Women" (ZH Mi 16:30) im Stundenplan lassen? Sonntag ZH "MMA Wrestling" (Zeit unbekannt) weggelassen.
7. SEO-Titel + Schema.org NACH Keyword-Daten (Regel: Daten vor Copy).
8. Shop, Blog, EN-Seiten, Trainerprofile: Migration ausstehend. Cutover = DNS-Flip am Ende.
9. GitHub-PAT läuft ~30.08. ab – Ruben erneuern lassen.
10. Visuelle Gesamtabnahme aller Seiten durch Ruben.

## Referenzen
- Original: https://www.impact-martialarts.com (Webflow, siteId 651f0961164dd76d2ce8fd23; MCP-Zugriff vorhanden).
- exercise.com Dashboard: app.impact-martialarts.com. my.impact-martialarts.com ist Magicline/MySports (anderes System, vermutlich Striking Studio).
- IDs: GTM-W6SM24HX, GA4 G-HLBP9H0SZK, Meta Pixel 372030385687058.
