# How to ...

Short recipes for the most common jobs. "Push" always means: checks from the README, commit your files, push to `main`.

## Publish a blog post
Open the Google Sheet "IMPACT Blog" > new row: Date, Title, Description, Photo URL (normal Drive link), Text, then tick "Website".
Column "Check" must say `OK`. Online next morning, or at once: tick the box "PUBLISH NOW" in cell A1 (the status next to it confirms the start, online ~3 minutes later).
Take a post offline: remove the tick. Never edit title/date/photo/body of an article in the HTML, the next build overwrites it.

## Add or change an event
Google Sheet "Event Planner" (yearly tab). Tick "Website" to show it, "Registration" = Form / App / empty, "Image URL" = Drive link.
The page reads the sheet live, changes show within ~5 minutes. `https://www.impact-martialarts.com/api/events?refresh=1` forces a refresh.

## Change the timetable
Change the Google Slides deck (ZH: slide 1 only). Nothing else. Next morning all places are rebuilt (schedule pages, kids pages,
"Wann trainiert wird" on the course pages, training-plan tool) and Ruben gets a mail listing the differences.
At once: GitHub > Actions > "Stundenplan aus den Slides" > Run workflow. New coach code on the slide? Add it to `SP_CODES` in the Apps Script.
If the slide cannot be read cleanly the workflow stops and nothing changes.

## Change a text on a course page
Google Sheet "IMPACT Website Content", one tab per discipline (BJJ, Muay Thai, MMA, Boxing, Wrestling, Fitness Kickboxing, Street Defense, Personal Training, Little Ninjas).
Rows run from the top of the page to the bottom: Section | Field | Location | Deutsch | English. Change the text, tick "PUBLISH NOW" in A1.
- Location: `Both` = same text in Zürich and Winterthur. Different texts = two rows (one `Zürich`, one `Winterthur`). A field with only one location row exists only on that page.
- `*gold*` = accent colour, line break in the cell = line break on the page, `_word_` = underlined (only in the three steps),
  `**bold**` (Little Ninjas quote), `[-]` = place where a long word may break on small screens (e.g. `Trainings[-]zeiten`).
- Add or remove repeating fields by adding/deleting rows: `Text n`, `Bullet n`, `Point n` + `Detail n`, `Question n` + `Answer n`. FAQ changes also update the FAQ data for Google.
- Column "Check" says `OK`, `Missing: ...` or `Conflict: ...`. Keep the spelling of Section and Field, the website finds the place through them.
- Not in the sheet: timetable block (comes from the slides), coach cards (Team tab), trial form, review quotes and counters of the adult pages, the Little Ninjas times (slides), photos.
Never edit these texts in the HTML, the next build overwrites them. A developer adds a completely new kind of element by putting `data-ct="section.field"` on it.

## Change a text or photo on a normal page
Find the page folder (URL = folder), edit `index.html`, and do the same in the `/en/` twin. Photos go to `assets/` (absolute paths `/assets/...`,
JPEG/AVIF, long edge max. ~2000 px). Videos: H.264 yuv420p + AAC, `+faststart`, poster image, `preload="none"` below the fold.

## Add or change a trainer / staff member
Google Sheet "IMPACT Website Content", tab "Team": one row per person (Name, Location Both/Zürich/Winterthur, roles, highlight, photo link, summary, bio,
ticks for Website / Homepage / Founder, Order). Column "Check" must say `OK`. Then tick "PUBLISH NOW" in A1 (or wait for the next morning).
The build rewrites the cards and bio overlays on all team, city, about and home pages and the coach cards on the course pages, German and English.
Never edit these cards in the HTML, the next build overwrites them. WHO coaches which course (and in which order) is in `data/coach-lineups.json`
until the course tabs exist; a new coach must be added there once by a developer. The head coach block on the BJJ pages is hand-made HTML.

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
