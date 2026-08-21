# IMPACT Website – Neue Architektur (start.impact-martialarts.com)

Stand: 21.08.2026 · Quelle: Webflow-Sitemap (101 Seiten + CMS-Collections), 1:1 abgebildet, URLs bereinigt.
DE = Root, EN = /en/. Skeleton-Seiten tragen den Hinweis "Inhalt folgt" im Design-System der Trial-LPs.

## Kern (gebaut)
| Live (Webflow)                          | Neu                                  | Status |
|-----------------------------------------|--------------------------------------|--------|
| /  bzw. /home                           | /  ·  /en/                           | Grundgerüst mit Inhalt |
| /de/zurich · /de/winterthur             | /zurich/ · /winterthur/              | Grundgerüst |
| /en/zurich · /en/winterthur             | /en/zurich/ · /en/winterthur/        | Grundgerüst |
| /de/{stadt}/kurse · /en/{city}/classes  | /{stadt}/kurse/ · /en/{city}/classes/| Übersicht mit allen 10 Kursen |
| /kurse/{slug} (CMS, 21 Items)           | /{stadt}/kurse/{disziplin}/          | Winterthur DE: 9 Kurse VOLL mit Webflow-CMS-Inhalt (What-is, Warum, Quote, FAQ, Bild). Zürich DE + EN: Skeleton, Inhalt liegt im CMS bereit |
| /de/{stadt}/stundenplan · /en timetable | /{stadt}/stundenplan/ · /en/{city}/timetable/ | Skeleton |
| /de/{stadt}/coaches                     | /{stadt}/team/                       | Skeleton |
| /gr/probetraining · /trial-session      | /probetraining/ · /trial/ (Hub)      | Hub live, verlinkt BJJ/MT-LPs |
| (neu)                                   | /probetraining/{bjj,muay-thai}/      | LIVE, konversionsfertig (Endpoint offen) |
| /gr/uber-uns · /about                   | /ueber-uns/ · /en/about/             | Skeleton |
| /gr/faq · /faq                          | /faq/ · /en/faq/                     | Skeleton |
| /gr/kontakt · /contact                  | /kontakt/ · /en/contact/             | Skeleton |
| /de/seminars · /en/seminars             | /seminare/ · /en/seminars/           | Skeleton |
| /events                                 | /events/                             | Skeleton |
| /career (+7 Stellen-Templates)          | /karriere/ · /en/career/             | Skeleton, verlinkt live Karriereseiten |
| /gr/gr---blog · /blog (CMS)             | /blog/                               | Skeleton |

## Noch nicht angelegt (bewusst)
- Team-Einzelseiten (24 CMS-Items, dedupliziert ~14 Personen) → /team/{slug}/ sobald Template steht
- Little Ninjas Alterssplits (10 CMS-Items) → /{stadt}/kurse/little-ninjas/ deckt ab, Alterssplit als Sektion
- Blog-Posts, Seminare-Detail, Shop/Gear (E-Commerce), Login/Account (Webflow Memberships), Legal (AGB/Datenschutz bleiben vorerst auf Webflow verlinkt)
- Danke-/Bestätigungsseiten → kommen mit dem Formular-Endpoint

## Cutover-Redirects (für den Domain-Umzug, noch NICHT aktiv)
/de/zurich→/zurich/ · /de/winterthur→/winterthur/ · /kurse/winterthur-*→/winterthur/kurse/* · /kurse/*→/zurich/kurse/* · /gr/*→/* · /home→/ · /de/*/kurse→/*/kurse/ etc.

## Nächste Schritte Content-Migration
1. Zürich-DE-Kurse (11 CMS-Items, gleiche Struktur wie Winterthur)
2. EN-Kurse (21 Items, Collection 'Classes')
3. Team-Seiten (24 Items je Sprache, dedupliziert per Standort-Suffix)
4. Little-Ninjas-Alterssektionen (10 Items)
Script-Vorlage: tools/enrich_winterthur_de.py – Struktur wiederverwendbar.
