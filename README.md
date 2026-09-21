# IMPACT Martial Arts website

Source of **www.impact-martialarts.com** (Zürich + Winterthur, German at `/`, English at `/en/`).
Plain static HTML, hosted on Cloudflare Pages. No framework, no build step for the pages themselves.
A push to `main` on GitHub (`rubenIMPACT/website`) is live about 90 seconds later.

This README is the entry point for a person taking over. `CLAUDE.md` is the chronological working log of the AI sessions
(decisions, lessons, dates). It is long and not meant as a first read. Start here, then go to `docs/`.

## The system in one picture

```
Visitor ──> Cloudflare Pages ──> static HTML in this repo (87 pages)
                │
                └─ /api/*  (Cloudflare Functions, folder functions/api)
                     ├─ lead.js, form.js, plan.js   forms  ──> exercise.com CRM  +  Google Sheet log
                     ├─ events.js, event-image.js   reads the "Event Planner" sheet (live, cached)
                     ├─ instagram.js                reads the Instagram feed (live, cached)
                     ├─ blog.js, plan-nominal.js    hand sheet/slides data to the GitHub workflows
                     └─ klassen.js, wa.js           data for the analytics sheets and the WhatsApp automation

Google side: ONE Apps Script project "IMPACT Website Lead Log" (copy: tools/leadlog-apps-script.gs)
             web app = the only door between Cloudflare and Google Sheets / Slides / Drive / Calendar

GitHub Actions (daily): plan-sync  = timetable from the Google Slides decks -> pages + training-plan tool
                        blog-sync  = blog posts from the sheet "IMPACT Blog" -> /articles/
```

## Where content comes from

| Content | Source of truth | How it reaches the site | How fast |
|---|---|---|---|
| Timetable (schedule pages, kids pages, course pages, training-plan tool) | Google Slides "Overall Schedule ZH 2.4" (slide 1 only) and "Overall Schedule WIN 2.2" | workflow `plan-sync` -> `tools/build_plan.py` | daily ~06:30, change mail to Ruben |
| Blog `/articles/` | Google Sheet "IMPACT Blog" | workflow `blog-sync` -> `tools/build_blog.py` | daily ~06:50 or "Run workflow" |
| Events `/events/` | Google Sheet "Event Planner" (tick "Website") | read live by the page via `/api/events` | ~5 minutes |
| Instagram tiles | Instagram account @impactmartialarts_ch | read live via `/api/instagram` | ~1 hour |
| Team and staff (cards, bios, coach cards on course pages) | Google Sheet "IMPACT Website Content", tab Team | workflow `content-sync` -> `tools/build_team.py` | tick "Publish now" (~3 min) or daily ~07:10 |
| Everything else (texts, course pages, photos) | the HTML files in this repo | edit, check, push | ~90 seconds |

Course page texts move into the same sheet next (one tab per discipline: Section, Field, Location, Deutsch, English). Until then they are edited in the HTML.

## Folder map

| Path | What |
|---|---|
| `index.html`, `zurich/`, `winterthur/`, `ueber-uns/`, `faq/`, `kontakt/`, `karriere/`, `articles/`, `events/`, `probetraining/` ... | German pages, one folder per URL, each with an `index.html` |
| `en/` | English mirror (36 pages). Change German content = change the English twin too |
| `training-plan/index.html` | Members' training-plan tool, one self-contained file (English) |
| `assets/` | Images, videos, fonts, `track.js` (funnel events) |
| `data/` | `plan-nominal.json` (timetable), `blog.json` (posts), `team.json` (team), `coach-lineups.json` (coaches per course page), `events.json` (emergency fallback). Written by the workflows |
| `functions/api/` | Cloudflare Functions (server code). `functions/_middleware.js` = all redirects from old URLs |
| `tools/` | Active scripts (see below). `tools/archive/` = one-off migration scripts, never run again |
| `.github/workflows/` | `plan-sync.yml`, `blog-sync.yml`, `content-sync.yml` (daily + tick box), `mirror-assets.yml` (one-off from the Webflow migration) |
| `docs/` | Handbook: `how-to.md`, `website.md`, `automations.md`, `apps-script.md`, `accounts.md` |
| `_redirects`, `_routes.json`, `robots.txt`, `sitemap.xml`, `404.html` | Cloudflare Pages / SEO basics |

Active scripts in `tools/`:

| Script | Purpose |
|---|---|
| `plan_from_api.py`, `build_plan.py`, `schedule-check.py` | Timetable: fetch from slides, write all 35 places, verify cell by cell |
| `blog_from_api.py`, `build_blog.py` | Blog: fetch sheet + photos, build article pages, index, sitemap |
| `content_from_api.py`, `build_team.py` | Team: fetch the Team tab + photos, build cards, bio overlays and coach cards everywhere |
| `training-plan-check.py` | Regression check of the training-plan tool (needs the Playwright venv) |
| `build_kurse.py` | Course-page text blocks (content dictionary per discipline, DE/EN). Basis for the planned CMS |
| `leadlog-apps-script.gs` | Reference copy of the Google Apps Script (without the token line) |
| `google-ads-spend-script.js` | Script that runs inside Google Ads and writes daily spend to the analytics sheet |
| `klassenanalyse/`, `whatsapp/` | Class analysis and WhatsApp automation (separate work streams) |

## Making a change

1. `git pull`
2. Edit the HTML (or the sheet / slide, see table above).
3. Preview: `python3 -m http.server 8899` in the repo root, open `http://localhost:8899/`.
4. Checks before every push (rule): page renders at 390 px and 1280 px, `<div>` open/close counts match, every `<script>` parses,
   JSON-LD parses. After any timetable change also `python3 tools/schedule-check.py`. Red = no push.
5. Commit only the files you touched (other people/sessions work in the same repo), push to `main`.
6. Verify live with a cache buster, e.g. `https://www.impact-martialarts.com/zurich/?cb=123`.

Rollback: Cloudflare dashboard > Workers & Pages > project "website" > Deployments > "Rollback to this deployment", or `git revert` + push.

## House rules that are easy to break

- Site language is Swiss German spelling (no ß), no em dashes in copy. Internal documents, sheets and code comments for the team: English.
- No prices, no self-booking of trials, no call button instead of the form: the trial form always leads to a qualification call.
- Approved copy is built exactly as approved. Never invent bios, names or facts.
- Never put Ruben's private phone number anywhere. Contact is the studio WhatsApp (messages only) and support@.
- Secrets (tokens, passwords) live only in Cloudflare environment variables and in the Apps Script editor, never in this repo.
