# Archive: one-off migration scripts (do NOT run)

These scripts built the first version of the site from the Webflow export in August 2026.
The pages have been edited heavily since then. Running any of these scripts again would overwrite live pages with an old state.
They are kept only as a reference for how the pages were first generated.

| File | What it did | Date |
|---|---|---|
| `generate_site.py` | First skeleton of all pages from the Webflow sitemap | 21.08.2026 |
| `enrich_winterthur_de.py`, `enrich_zurich_de.py` | Filled course pages with the Webflow CMS texts | 23.08.2026 |
| `build_course_lp.py` + `templates/lp-*.html` | Turned course pages into landing pages (BJJ / Muay Thai blueprint) | 22.08.2026 |
| `build_schedule_grid.py` | One-time conversion of the timetable into the grid layout (still contains the exercise.com live merge that was removed on 17.09.2026) | 23.08.2026 |
| `migrate_career_blog.py` | Imported the career pages and the six blog posts from Webflow | 28.08.2026 |

Removed on 21.09.2026: `functions/api/schedule.js` (exercise.com live timetable, unused since 17.09.2026; see git history).
Not in the repo anymore (they lived in temporary folders and are lost): the builders for the events, cancellation, about, contact and FAQ pages. Those pages are maintained directly in their HTML.
