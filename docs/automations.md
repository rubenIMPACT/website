# Automations

All Google access goes through ONE Apps Script web app (see `apps-script.md`). Cloudflare Functions call it with
`LEADLOG_URL?token=LEADLOG_TOKEN&what=...`. GitHub never sees a secret: the workflows read public `/api/*` endpoints of the site.

## Timetable from the Google Slides decks
```
Slides (ZH slide 1, WIN) --Apps Script spReadDecks (what=plan)--> /api/plan-nominal --> workflow plan-sync (daily 04:30 UTC)
   tools/plan_from_api.py -> data/plan-nominal.json
   tools/build_plan.py    -> 4 schedule pages, 4 kids pages, #zeiten on course pages, training-plan tool   (35 places, idempotent)
   tools/schedule-check.py -> cell-by-cell verification, red = no commit
```
- The reader uses shape coordinates: day columns by x, time rows by y, coach code badges inside the card. Unknown codes or overlapping
  leftovers produce `warnings`; with warnings the workflow aborts and nothing changes.
- `spDaily` (06:50) mails Ruben the differences to the previous day.
- exercise.com is NOT a source for the website timetable (removed 17.09.2026).

## Blog from the sheet "IMPACT Blog"
```
Sheet --Apps Script blogRead (what=blog)--> /api/blog --> workflow blog-sync (daily 04:50 UTC, or Run workflow)
   tools/blog_from_api.py -> data/blog.json + photos to assets/blog/<slug>.jpg (via /api/event-image, resized to 1600 px)
   tools/build_blog.py    -> articles/<slug>/, articles/index.html, sitemap.xml
```
- Only rows with a tick and Date/Title/Text are exported; the script writes Slug, Website URL and Check back to the sheet.
- Safety: empty or unreadable sheet = abort; more than half of the articles disappearing = abort.
- An existing article page is its own template, so sitewide edits survive. New posts are cloned from the first article folder.

## Team from the sheet "IMPACT Website Content" (tab "Team")
```
Sheet --Apps Script ctTeamRead (what=team)--> /api/content?what=team --> workflow content-sync (daily 05:10 UTC, or the tick box)
   tools/content_from_api.py -> data/team.json + new photos to assets/team/<name>.jpg (max. 1200 px)
   tools/build_team.py       -> team cards + <script id="trbios"> on 12 pages, coach cards on 26 course pages (lineups: data/coach-lineups.json)
```
- Rules: Location decides the city/team pages, tick Homepage = home pages, tick Founder = founders block on the about pages, Order = position everywhere,
  empty bio = card without overlay, empty summary = first bio paragraph is the intro on course pages.
- Safety: fewer than 5 people or an unreadable sheet = abort. A person without a photo is skipped with a warning. A course page never loses its last coach.
- The Apps Script functions for this sheet carry the prefix `ct` (content). `team*`/`tr*` functions belong to the Team KPIs sheet, a different thing.

## Course page texts from the sheet "IMPACT Website Content" (one tab per discipline)
```
Tabs --Apps Script ctCoursesRead (what=courses)--> /api/content?what=courses --> workflow content-sync
   tools/content_from_api.py -> data/courses.json (maps "Section + Field" to the key, e.g. "FAQ / Question 3" -> faq.q3)
   tools/ct_courses.py build -> replaces the text inside every element that carries data-ct="<key>" on the 34 course pages (incl. Little Ninjas)
```
- The page is its own template: only text inside `data-ct` elements changes, plus `<title>`, meta description and the FAQPage JSON-LD.
- Location logic: rows `Both` apply to both cities, `Zürich`/`Winterthur` rows only to that city. Repeatable fields (text, bullet, point+detail, question+answer)
  are cloned from the item with the next smaller number, or removed when their row is gone.
- `python3 tools/ct_courses.py tag` marked the elements once (21.09.2026) and aligned the numbering between the cities; `extract` produced the first fill.
  Both are idempotent and only needed again when new pages or new kinds of elements are added.
- Safety: a tab with fewer than 30 rows, a missing hero headline or a page that would lose more than 40 % of its fields aborts the build.
- Little Ninjas pages use another template (no section ids): `TOKEN_KIDS` and `KIDS_SECTION` in `ct_courses.py` name their sections (benefits, beweis, kurse, zeiten, faq).
- The Apps Script creates every tab of `CT_COURSE_TABS` that is missing and fills it from `data/courses.json` on GitHub.
- `tools/content_build.py` runs all builders of this sheet (team, courses); the workflow calls only this script.

## "Publish now" tick box in the content sheets
Row 1 of a content sheet ("IMPACT Blog", every tab of "IMPACT Website Content") has a tick box in A1. An installable onEdit trigger of the Apps Script (`publishOnEdit`, runs as Ruben,
so it works for every editor of the sheet) starts the matching GitHub workflow through the GitHub API, unticks the box and writes the status into D1.
G1 shows when the website build last read the sheet. The GitHub token (fine-grained, repository `rubenIMPACT/website`, permission "Actions: read and write")
is stored ONLY in the Apps Script project settings > Script properties > `GITHUB_TOKEN`. New sheets are registered in `PUB_TARGETS`; afterwards call
`/api/blog?what=pubtrigger` once to install the trigger. Two starts within 2 minutes are ignored.

## Events from the sheet "Event Planner"
- The events page calls `/api/events` in the browser (stale-while-revalidate cache, fresh after 5 minutes). Only ticked rows, never "Company event",
  no internal fields. Photos through `/api/event-image?id=<Drive id>` (file is read as Ruben, no public sharing needed).
- Sign-ups: `/api/form` (kind=event) -> tab "Events" of the analytics sheet -> mirrored into the planner tab "IMPACT Event sign-ups"; the counter in the planner updates itself.
- Tick "Google event" creates a calendar entry with invitations (`syncCalendar`, every 3 hours).
- Registration = App: the page links to the class in the exercise.com app and shows booked spots.

## Instagram tiles
`/api/instagram` reads the last posts through the Instagram Graph API (system user token `IG_TOKEN`, never expires), list cached 1 hour,
images proxied through `?img=<id>` for 7 days. The pages swap the 8 static tiles after load; without the feed the static tiles stay.

## Leads (trial form)
```
Form --> /api/lead --> exercise.com: sign in, create client (lifecycle "Lead"); existing e-mail = update message/tags/location instead
                   --> Apps Script doPost: row in tab "Leads" + alert mail to the studio manager for repeat requests and errors
                   --> returns "lid" (signed client id) -> thank-you page -> training-plan tool -> /api/plan (note in the CRM profile + sheet row)
```
- Honeypot field, server-side validation. First name "Testlead..." always routes mails to Ruben.
- Duplicate lookup in exercise.com must use `q[client_search]=<email>`.

## Forms without CRM
`/api/form`: event sign-ups and the cancellation survey. Sheet only, no mail, no CRM.

## Analytics sheets (separate work streams, same Apps Script)
Hourly trial list and team KPIs, daily month-end report, ad spend (Google Ads script, Meta API, TikTok report mail), LTV, class analysis.
Server side in `functions/api/klassen.js` (exercise.com report API). Details and definitions are in `CLAUDE.md`.
Class analysis since 21.09.2026 also splits the time-of-day ranking into weekday / Saturday and adds the "Mitglieder nach Zeitfenster" block (members training only / mostly in off-peak slots, exposed revenue for the planned off-peak membership); parameters "Randzeit bis Uhrzeit" and "Randzeiten-Abo Preis brutto CHF/Monat" live in the sheet tab Einstellungen and are passed to `/api/klassen` phase 3 (`rand_before`, `rand_price`). Method: `tools/klassenanalyse/SKILL.md`.
No runs between 01:00 and 05:00. Manual runs never between :55 and :12 (hourly job).

## WhatsApp automation
`functions/api/wa.js`, `functions/api/wahook/`, `tools/whatsapp/`. Own Apps Script project "WhatsApp Automation". Separate work stream.
