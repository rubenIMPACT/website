# Accounts and services

No passwords or tokens are written here or anywhere in the repo. This list says which service does what and where its secrets live.

| Service | Used for | Account / owner | Notes |
|---|---|---|---|
| GitHub `rubenIMPACT/website` (public repo) | Code, history, daily workflows | Ruben | The access token on Ruben's Mac has no `workflow` scope: workflow files are created/edited in the GitHub web UI |
| Cloudflare (Pages project "website", DNS zone) | Hosting, Functions, redirects, DNS for impact-martialarts.com | Ruben | Secrets under Settings > Variables and Secrets. A changed secret is active only after the next deployment |
| Google Workspace ruben@impact-martialarts.com | Apps Script, Sheets, Slides, Drive, Calendar, Gmail (TikTok report import) | Ruben | The Apps Script runs as Ruben |
| exercise.com (`app.impact-martialarts.com`) | CRM, bookings, memberships, reports | IMPACT | API user credentials in Cloudflare (`EXERCISE_*`). Location ids: Zürich 2508, Winterthur 2222 |
| Meta Business (app "IMPACT Analytics") | Instagram feed, ad spend | Impact Martial Arts portfolio | System-user tokens without expiry: `IG_TOKEN`, `META_ADS_TOKEN`. Token requests need approval by a second admin |
| Google Ads (account 831-058-5625) | Daily spend script "Werbekosten -> Analytics Sheet" | Ruben | Source: `tools/google-ads-spend-script.js` |
| TikTok Ads Manager | Scheduled daily CSV report "IMPACT TikTok" to ruben@ | IMPACT | Imported from Gmail by the Apps Script |
| Google Tag Manager `GTM-W6SM24HX`, GA4 `G-HLBP9H0SZK` | Tracking | Container owned by the agency Uconic | Agency contract ends 12/2026: all accounts must be transferred to IMPACT before |
| Google Search Console | SEO, sitemap | Ruben | |
| GoDaddy | `.ch` domains, forward to the `.com` site (root only, no paths) | IMPACT | |
| Mailchimp (us14, audience "IMPACT Martial Arts Newsletter") | Newsletter | IMPACT | Essentials 2'500 contacts since 25.09.2026. Website sign-up (pop-up + trial form tick box) via `/api/newsletter`, secret `MAILCHIMP_API_KEY` in Cloudflare |
| Webflow | Old site, archive only | Ruben | Plan downgrade to free on 12.10.2026; full CMS + media backup in Google Drive "Webflow-Backup-2026-09-01" |

## Cloudflare environment variables (names only)
`LEADLOG_URL`, `LEADLOG_TOKEN` (Apps Script web app), `EXERCISE_EMAIL`, `EXERCISE_PASSWORD`, `EXERCISE_ORG_TOKEN` (CRM),
`IG_TOKEN`, `IG_USER_ID`, `META_ADS_TOKEN` (Meta), `MAILCHIMP_API_KEY` (newsletter, optional `MAILCHIMP_LIST_ID`), `WA_HOOK_KEY`, `WA_EVENTS_URL`, `WA_VERIFY_TOKEN` (WhatsApp automation).

## If the person who built this is gone
A successor needs: write access to the GitHub repo, a Cloudflare account invited to the IMPACT account, edit access to the Apps Script project
and the Google Sheets listed in `apps-script.md`, and an admin role in the Meta Business portfolio. With these, everything in this repo can be changed and deployed.
