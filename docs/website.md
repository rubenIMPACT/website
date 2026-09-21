# The pages

## Structure
- One folder per URL with an `index.html`. German at the root, English mirror under `/en/` with English slugs
  (`kurse` -> `classes`, `stundenplan` -> `schedule`, `boxen` -> `boxing`, `ringen` -> `wrestling`, `fitness-kickboxen` -> `fitness-kickboxing`).
  Mirrored pages carry `hreflang` de / en / x-default and a language toggle that links to the exact twin.
- City pages `zurich/`, `winterthur/`; below them `kurse/<discipline>/`, `stundenplan/`, `team/`, `kurse/little-ninjas/`.
- Global pages: home, `ueber-uns`, `faq`, `kontakt`, `karriere/*`, `articles/*`, `events`, legal pages.
- Hidden pages (noindex, never in nav or sitemap): `/termin/`, `/en/booking/`, thank-you pages, `/kuendigung/`, `/en/cancellation/`.
- Blog and career pages exist in one language only.

## Every page is self-contained
CSS and JavaScript are inline in each page. There is no shared stylesheet yet (known debt: about half of all inline code is an exact copy).
Shared blocks are tagged with a marker comment so that scripts can find and replace them:

| Marker | What | Pages |
|---|---|---|
| `/*tiktok*/` | TikTok pixel (inside the script tag) | all |
| `/*hdr2*/`, `/*ddtap*/`, `/*solidnav*/`, `/*ddpos*/` | header layout, city dropdown, solid mobile nav (iOS status bar), dropdown position | ~75 |
| `/*wanote*/` | "(nur Nachrichten)" note next to the WhatsApp number | 67 |
| `/*ctahide*/`, `/*adfoot*/` | ad mode: hidden nav and slim footer on course landing pages | 26-29 |
| `/*cards2*/`, `/*trbio*/`, `/*nobio*/` | team cards, bio overlay (reads `<script id="trbios">`), cards without bio | team, city, about |
| `/*herosound*/`, `/*kidsound*/`, `/*appsec*/` | hero video sound button / cinema mode, IMPACT App section | course, kids, home, city |
| `/*spgrid*/`, `/*schedcolors*/`, `/*spfilter*/` | timetable renderer, colours per discipline, level/discipline filter | 4 schedule pages |
| `/*kidsched*/`, `/*kidsform*/` | Little Ninjas times and form | 4 kids pages |
| `/*mtphoto*/` | photo layout of the Muay Thai pages | 4 |
| `/*forms*/`, `/*events*/`, `/*cancel*/`, `/*planlink*/` | event / cancellation forms, thank-you page link to the training-plan tool | few |

## Course pages are landing pages
- Ad mode: when the URL carries `gclid`, `fbclid`, `utm_*` or `?ad=1`, the page adds class `admode`: nav hidden, slim footer with legal links only.
- The trial form posts to `/api/lead`, then redirects to `/probetraining/danke/` (EN `/en/trial/thanks/`) with `loc`, `dis`, `lid`.
- CTA wording everywhere: "Gratis Probetraining" / "Free Trial Class". No prices, no self-booking, no call button (sales process).
- Section order of a course page (example BJJ Zürich): hero (video), `#sportart` (what is it), `#beweis` (reviews), `#ablauf` (how the trial works),
  `#anmelden` (form `#leadform`), `#warum`, `#coach`, `#gi` (discipline extras), `#app` (BJJ only), `#zeiten` (generated from the timetable), `#faq` (also as JSON-LD).
- Review badge and counter are per city (ZH 300+, WT 120+, home 400+). Two places per page: badge link/number and the counter `data-t`.

## Generated parts (do not edit by hand)
- `<script id="spdata">` on the 4 schedule pages, `<script id="lndata">` on the 4 kids pages, the `#zeiten` block on course pages,
  `const SCHEDULE` in `training-plan/index.html`: written by `tools/build_plan.py`.
- Team cards, `<script id="trbios">` and the coach cards (`duosec`): written by `tools/build_team.py`. Text inside elements with `data-ct="..."` on the course pages,
  their `<title>`, meta description and FAQPage JSON-LD: written by `tools/ct_courses.py`. Both come from the sheet "IMPACT Website Content".
- `articles/*` (title, date, photo, body), the card list in `articles/index.html`, article entries in `sitemap.xml`: written by `tools/build_blog.py`.

## Tracking
- GTM `GTM-W6SM24HX` (container belongs to the agency Uconic until the hand-over), GA4 `G-HLBP9H0SZK`, Meta pixel, TikTok pixel.
- `assets/track.js` sends `cta_click`, `trial_form_start`, `trial_form_abandon`. No personal data.
- Click IDs and UTM values are kept 30 days in `localStorage` (`imp_*`) and sent with the form; only the most recent click ID is submitted.

## Redirects
All old Webflow URLs are handled in `functions/_middleware.js` (EXACT table, PREFIX list, slug rules). `_redirects` only holds marketing short links.
`_routes.json` keeps `/assets/*` away from Functions.
