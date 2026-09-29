# Content Guide

Everything publishable is a Markdown file. No CMS, no admin, no route edits.

## Writings — `src/content/writings/YYYY/slug.md`

URL becomes `/library/YYYY/slug` automatically (file path = route).

```md
---
title: The Middle of the Book
description: One line — card excerpt, meta description, AND feed text. Write it well.
publishDate: 2026-01-21        # calendar date, read back via UTC getters
topic: craft                   # craft | process | place | people | reading | notes
tags: [structure, drafts]
pullQuote: A line worth stopping on.   # optional
pullQuoteCite: Attribution             # optional, when quoting someone else
cover: ./covers/foo.webp               # optional, colocated; typographic fallback otherwise
coverAlt: Alt text                     # required if cover set
featured: false                        # true → eligible for home hero
draft: false                           # true → dev-only, never in production build
minutes: 8                             # optional override; else auto from body
---

Body in Markdown. `##` headings feed the TOC via `render()`.
```

Notes: `updatedDate` optional (feeds `dateModified`/JSON-LD). Keep the
filename slug stable — it *is* the URL. Year folder = the `/YYYY/` segment.

## Services — `src/content/services/slug.md`

One file = listed card + detail page + sitemap entry + enquiry link. No other
edit needed.

```md
---
title: Ghostwriting
order: 1                       # list position (ties → title); default 99
summary: One-line offer.
engagement: Projects from six weeks   # optional
price: From £4,000                    # optional
forWhom: [...]                 # bullets
includes: [...]                # bullets
draft: false
---
```

The "Let's talk" button is a `mailto:` with the offer in the subject
(`enquiryHref()` in `src/lib/services.ts`).

## Newsletter issues — `src/content/newsletter/YYYY-MM-slug.md`

Listed on `/newsletter`, newest first. The **body is unused** — issues are
listed, not archived. Don't create per-issue routes speculatively.

```md
---
title: ...
summary: One line on what the issue was about.
sendDate: 2026-03-01   # month resolution; coerced to the 1st
draft: false
---
```

Signup panels (`Newsletter`/`SignupForm`) are presentational until a provider
is wired — check the component before promising behaviour.

## Static pages — `src/content/pages/{about,colophon,contact,newsletter}.md`

Rendered through `StaticPage.astro`: `title`, `description`, optional
`eyebrow`, `showToc`, `pullQuote`/`pullQuoteCite`, `portrait`/`portraitAlt`.
If a page can't be expressed in that shape, it doesn't belong in this
collection — build a route instead. Routes are thin wrappers calling
`pageById('about')` etc.; a wrong id throws at build time (deliberate — a
silent empty page is worse).

## Topics

Fixed set of six in `src/lib/topics.ts` + the `topic` enum in
`src/content.config.ts`. Adding a topic means touching both plus filter UI —
treat as a design decision, not a content edit.

## Media & social cards

- Covers live next to the piece (`covers/`), referenced relatively, rendered
  via `astro:assets` (`<Picture>`, AVIF emitted). Global `--filter-cover`
  unifies photography; card hover intentionally opts out.
- OG cards (`/og/<id>.png`) are **generated at build** from title/topic/date
  (`src/lib/og.ts`) — never commit PNGs. Article JSON-LD points at the card,
  not the cover.
- Favicons are generated (`bun run favicon` from `scripts/make-favicon.py`
  palette). Re-run after token changes; `check.sh` auto-regenerates if stale.
