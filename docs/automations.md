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
No runs between 01:00 and 05:00. Manual runs never between :55 and :12 (hourly job).

## WhatsApp automation
`functions/api/wa.js`, `functions/api/wahook/`, `tools/whatsapp/`. Own Apps Script project "WhatsApp Automation". Separate work stream.
