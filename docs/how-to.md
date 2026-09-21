# How to ...

Short recipes for the most common jobs. "Push" always means: checks from the README, commit your files, push to `main`.

## Publish a blog post
Open the Google Sheet "IMPACT Blog" > new row: Date, Title, Description, Photo URL (normal Drive link), Text, then tick "Website".
Column "Check" must say `OK`. Online next morning, or at once: GitHub > Actions > "Blog aus dem Google Sheet" > Run workflow (~3 min).
Take a post offline: remove the tick. Never edit title/date/photo/body of an article in the HTML, the next build overwrites it.

## Add or change an event
Google Sheet "Event Planner" (yearly tab). Tick "Website" to show it, "Registration" = Form / App / empty, "Image URL" = Drive link.
The page reads the sheet live, changes show within ~5 minutes. `https://www.impact-martialarts.com/api/events?refresh=1` forces a refresh.

## Change the timetable
Change the Google Slides deck (ZH: slide 1 only). Nothing else. Next morning all places are rebuilt (schedule pages, kids pages,
"Wann trainiert wird" on the course pages, training-plan tool) and Ruben gets a mail listing the differences.
At once: GitHub > Actions > "Stundenplan aus den Slides" > Run workflow. New coach code on the slide? Add it to `SP_CODES` in the Apps Script.
If the slide cannot be read cleanly the workflow stops and nothing changes.

## Change a text or photo on a normal page
Find the page folder (URL = folder), edit `index.html`, and do the same in the `/en/` twin. Photos go to `assets/` (absolute paths `/assets/...`,
JPEG/AVIF, long edge max. ~2000 px). Videos: H.264 yuv420p + AAC, `+faststart`, poster image, `preload="none"` below the fold.

## Add or change a trainer / staff member (today, before the CMS)
A person appears in several places. Search the repo for the name. Usual places:
`zurich/team/`, `winterthur/team/`, the city pages `zurich/`, `winterthur/`, `ueber-uns/`, the course pages of their disciplines
(coach section: `<p class="sum">` = first paragraph, `<div class="biofull">` = rest), plus all `/en/` twins.
On team/city/about pages the long bio sits in the JSON block `<script id="trbios">`. Cards without a bio carry class `nobio`.

## Change something on ALL pages (header, footer, tracking)
Shared CSS/JS is copied into every page and tagged with a marker comment such as `/*solidnav*/` or `/*hdr2*/` (list in `docs/website.md`).
Write a small script that replaces the block by marker in all `index.html` files, assert the number of replacements per file,
then run the checks on a sample of page types (home, city, course, schedule, team, article, trial form) before pushing.

## Add a redirect for an old URL
`functions/_middleware.js` > table `EXACT` (lower case, no trailing slash). Do not use `_redirects` for this:
Cloudflare Pages silently ignores rules after the first 100. After bigger URL changes test all URLs from Search Console, not only the sitemap.

## Change server code (`functions/api/*.js`)
Edit, syntax check, push. New or changed secrets are set in Cloudflare (Settings > Variables and Secrets) and only become active
with the next deployment (an empty commit is enough).

## Change the Google Apps Script
See `docs/apps-script.md`. Short version: edit `tools/leadlog-apps-script.gs`, push, paste the pushed file into the editor while keeping
the editor's `var TOKEN = ...` line, save. If `doGet`/`doPost` or anything they call changed: Deploy > Manage deployments > edit > New version.

## Something is broken
| Symptom | Look at |
|---|---|
| Trial form does not arrive | Cloudflare > project "website" > Functions logs for `/api/lead`; Sheet "Sales & Marketing Analytics" tab Leads, column Status |
| Events page empty | `/api/events?debug=1` shows each step |
| Instagram tiles old | `/api/instagram?debug=1` (token, page, account). Static tiles remain as fallback |
| Timetable not updated | GitHub > Actions > "Stundenplan aus den Slides": red run = slide unreadable, the log says why |
| Blog post missing | Column "Check" in the sheet, then GitHub > Actions > "Blog aus dem Google Sheet" |
| Old page still shown after deleting it | Cloudflare edge cache, wait some minutes, test with `?cb=1` |
