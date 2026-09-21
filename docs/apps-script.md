# The Google Apps Script

One project does all Google work: **"IMPACT Website Lead Log"** (script.google.com, owner ruben@impact-martialarts.com,
script ID `1IdTPNzezuwg3G0oY0F1epFLJvi1G5r7RjoiyIKV5FCmDqkhBXnet5pH4`). It is a single file `Code.gs` with about 3'300 lines.
The reference copy is `tools/leadlog-apps-script.gs`. The only difference: the editor holds the real `var TOKEN = ...` line,
the repo holds a placeholder. The same token is stored in Cloudflare as `LEADLOG_TOKEN`.

A second, independent project "WhatsApp Automation" belongs to the WhatsApp work stream (`tools/whatsapp/`).

## How the website talks to it
- `doPost` : leads (`/api/lead`), training plans (`type:'plan'`), forms (`kind` event / cancellation).
- `doGet?token=...&what=` : `events`, `image&id=`, `plan`, `blog`, plus maintenance calls (`setup`, `calsync`, `caltrigger`, `spdaily`, `sptrigger`, `recount`, `migrate`, `setreg`).
- The web app URL is stored in Cloudflare as `LEADLOG_URL`. Deploying a new version keeps the URL.

## Map of the file (search for the banner comments)
| Approx. line | Section | Used by |
|---|---|---|
| 1 | Constants, sheet IDs, mail routing | all |
| 29 | Webapp `doPost` | website forms |
| 88 / 123 / 179 | Leads, training-plan log, forms without CRM | website |
| 215 | Analysis tabs (`setupAnalyse`, `buildDaten`, channel rule `kanalOf`) | analytics |
| 436 / 812 | Class analysis import and server-side run | analytics |
| 729 | Cancellation risk | analytics |
| 891 | Events from the planner sheet (`readEvents`, `planSheet`, sign-up counter, `driveImage`) | website `/events/` |
| 1101 | Google Calendar invitations (`syncCalendar`) | event planner |
| 1176 | Blog (`blogRead`, `blogSetup`, `blogSeed`) | website `/articles/` |
| ~1280 | `doGet` | website |
| 1300 / 1696 | Ad spend (Google, Meta, TikTok), advertising tab | analytics |
| 1767 | LTV | analytics |
| ~2200 | Month-end report (`ma*`, `buildMonatsabschluss`) | analytics |
| 2547 | Trial list / team KPIs (`tr*`, `runProbetrainingsHourly`) | team KPI |
| 3055 | Open payments sheet | team KPI |
| 3171 | Transfer into the finance plan (`fp*`) | analytics |
| ~3240 | Timetable reader for the Slides decks (`sp*`) | website timetable |

Function prefixes tell the owner: `sp*` timetable, `blog*` blog, `plan*`/`readEvents`/`syncCalendar` events, `tr*`/`pay*`/`teamMirror*` team KPIs,
`ma*`/`wk*`/`fp*`/`buildLTV` analytics. Before adding a function check for duplicates: `grep '^function' tools/leadlog-apps-script.gs | sort | uniq -d`
(a name collision silently replaces the older function).

## Sheets and files it touches
| Constant | File |
|---|---|
| `SHEET_ID` | "Sales & Marketing Analytics" (leads log, reports) |
| `PLAN_ID` | "Event Planner" |
| `BLOG_ID` | "IMPACT Blog" |
| `TEAM_ID` | "Team KPIs" |
| `WA_SHEET_ID` | "WhatsApp Automation" (mirror of cancellation feedback only) |
| `FP_ID` | copy of the finance plan |
| `SP_DECKS` | the two Google Slides timetable decks |

Tabs that the web app writes by name must never be renamed and their header order never changed: Leads, Trainingsplan, Events, Cancellations, Klassenanalyse, Daten, PlanDaten.

## Time triggers (installed by `installTrialTriggers`, version flag `TR_TRIG_VER`)
| Function | When |
|---|---|
| `runProbetrainingsHourly` | hourly (~:58), paused 01:00-05:00 |
| `importKlassenanalyse` | daily 06:10 |
| `runMonatsabschlussDaily` | daily 06:20 |
| `runWerbekostenDaily` | daily 06:30 |
| `spDaily` (timetable change mail) | daily 06:50 |
| `trDailyMail` | daily 12:00 |
| `syncCalendar` | every 3 hours |
| `runKlassenanalyseMonthly`, `runLTVMonthly` | 1st of the month 06:00 / 07:00 |
One-off chain triggers (`maCatchUp`, `runLTVChain`, `runMonatsabschlussBuild`, `runWerbekostenBuild`) exist because one execution is limited to 6 minutes.

## Changing the script (by hand)
1. `git pull`, edit `tools/leadlog-apps-script.gs`, check the syntax, commit, push.
2. Open the editor. Copy the current `var TOKEN = ...` line somewhere safe (never into the repo or a chat).
3. Replace the whole editor content with the pushed file, put the token line back, save (Cmd+S).
4. If `doGet`, `doPost` or anything they call changed: Deploy > Manage deployments > pencil > Version "New version" > Deploy.
   Time-triggered functions run from the saved code ("Head") and need no new version.
5. New Google permissions (Slides, Calendar, Gmail, Drive ...) must be granted once by Ruben in the editor (Run any function > Review permissions).

Several people/sessions edit this one file. Always paste the pushed GitHub state, never a local draft, and compare the function names
in the editor with your file first, otherwise somebody else's changes disappear silently (happened on 03.09. and 16.09.2026).

## Known weak spots
- One 3'300-line file with very long lines. Splitting it into several `.gs` files per topic is possible (Apps Script shares one namespace across files) and recommended.
- The hourly run takes 2-6 minutes; the platform limit is 6 minutes.
- Helper function `RUN_NOW` as the first line of the file is the trick to run something by hand (the function picker is unreliable). Remove the line afterwards.
