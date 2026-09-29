# Architecture

## Rendering model

Fully static. Every route is prerendered (`getStaticPaths` throughout, no SSR).
The two "endpoints" are build-time too: `rss.xml.ts` emits the feed,
`og/[...id].png.ts` renders one social card PNG per writing. `dist/` is the
whole product — any static host can serve it (host-specific notes in
[Deploy](deploy.md)).

`trailingSlash: 'never'` is set once in `astro.config.mjs` from
`TRAILING_SLASH` in `src/lib/site.ts`, and shared with the RSS endpoint
(which would otherwise default to appending `/` and filling the feed with
404s). Keep all internal links extensionless and slashless.

## Routes (`src/pages/`)

| Route | Source |
|---|---|
| `/`, `/about`, `/contact`, `/colophon`, `/newsletter` | Thin `.astro` wrappers over `src/content/pages/*.md` via `pageById()` |
| `/library`, `/library/[...id]` | Index + per-piece route; `id` is the file path (`2026/slug`) so disk layout = URL |
| `/services`, `/services/[slug]` | Same pattern over the services collection |
| `/topics/[topic]` | One page per topic in `src/lib/topics.ts` (6 fixed topics) |
| `/rss.xml`, `/og/*.png`, `/404` | Feed, social cards, 404 (noindex, real 404 status via host config) |

Adding an offer/essay/issue never touches routing — it's a content file
(see [Content guide](content.md)).

## Layouts (`src/layouts/`)

Stacked, each with one job:

- **`BaseLayout`** — `<html>` shell: `<head>` (delegated to `BaseHead`),
  font/token/base/prose/utilities/print CSS imports (order matters, print last),
  `ClientRouter` (view-transition crossfade), skip link, scroll-reveal script,
  grain overlay, print URL footer.
- **`PageLayout`** — header + title block (eyebrow/title/description + optional
  breadcrumb trail) + footer. All non-article pages.
- **`WritingLayout`** — article chrome: title/meta, cover, TOC, pull quote,
  body, prev/next neighbours → siblings (`moreLikeThis`) → recent. Takes the
  entry only — head fields are derived, not passed, so page and metadata can't
  disagree.
- **`StaticPage`** — renders a `pages` collection entry (eyebrow/title/prose/TOC).
- **`Measured`** — constrains width for reading columns.

Home (`index.astro`) is the exception: composes `BaseLayout` + header/footer
directly around Manifesto / latest / services teaser / newsletter sections.

## Components (`src/components/`)

~20 Astro-only components, no framework islands. Key ones:

- `SiteHeader` (nav + mobile menu w/ focus trap, active state via
  `isCurrentPath`), `SiteFooter`, `BaseHead` (all meta/canonical/OG tags),
  `JsonLd` (Person / WebSite / BlogPosting / Breadcrumb from `src/lib/seo.ts`)
- `WritingGrid` + `WritingCard` (shelf), `Catalogue` (month/year archive),
  `TopicFilter` (client-side filter over both indexes — full list stays in HTML)
- `Manifesto` (hero), `Newsletter`/`SignupForm`, `ServiceCard`, `Toc`,
  `Prose`, `PullQuote`, `Plate`, `ThemeToggle` (3-state light/dark/system,
  `localStorage.theme` + no-flash head script), `ProgressBar`, `Grain`, `Empty`, `Button`, `Elsewhere`

Conventions: components take **entries and render** — they never call
`getCollection`. Interactive JS is vanilla `<script>` using `astro:page-load`
so it survives `ClientRouter` swaps; reveal-on-scroll uses
`[data-reveal]` + `--i` stagger + one shared `IntersectionObserver`.

## Styles (`src/styles/`, no Tailwind)

| File | Role |
|---|---|
| `tokens.css` | **The design language**: palette (paper/ink/ember/pine), type scale, spacing, photo filter. Read-only variables, no selectors |
| `fonts.css` | 5 hand-declared `@font-face` blocks (Fraunces / Newsreader / Inter Variable, **latin subset only**). Never import fontsource `standard.css` (ships 19 faces incl. unused subsets) |
| `base.css` | Reset, frame, transitions, theme (`[data-theme]`) |
| `prose.css` | Article body typography |
| `utilities.css` | `.shell`, `.section`, `.label`, layout helpers |
| `print.css` | Print overrides, imported **last** |

Warm paper background, ember-terracotta accent (AA-adjusted: both themes must
hit ≥ 4.5:1 for body text), fixed room frame, hearth glow behind headings,
film grain. Dark mode is a full token remap, not an invert.

## Lib (`src/lib/`) — the query layer

**Nothing outside `lib/` touches `getCollection`/`getEntry`.** Each collection
has one module owning sorting, draft filtering, URL building, grouping:

- `site.ts` — identity (name, url, email, nav, socials), `TRAILING_SLASH`,
  `isCurrentPath()`. Header/footer/head/RSS/sitemap all read from here.
- `writings.ts` — `allWritings()`, `featuredWritings()`, `writingsByTopic()`,
  `topicCounts()`, `writingYears()`, `writingHref()`, `minutesFor()`,
  `groupByMonth/Year()`, `neighbours()`, `moreLikeThis()`, UTC date formatters.
- `services.ts`, `newsletter.ts`, `pages.ts` — same idiom (`allServices()`,
  `featuredServices()`, `enquiryHref()` mailto builder; `allIssues()`;
  `pageById()` which **throws** on a missing id).
- `topics.ts` — the 6 fixed topics + labels/descriptions (order is editorial).
- `seo.ts` — `personLd` / `websiteLd` / `articleLd` / breadcrumbs, absolute
  URLs from `Astro.site` (= `SITE.url`).
- `og.ts` + `cover.ts` + `raster.ts` — social-card SVG layout/text-wrap,
  cover resolution, sharp rasterisation. Cards use the generated card, not the
  cover (covers are often absent / wrong aspect).
- `readingTime.ts` — word count ÷ 220wpm, code fences/link URLs stripped.

## Content layer (`src/content.config.ts`)

`glob` loaders over `src/content/{writings,services,newsletter,pages}`.
Schemas enforce the contract: writings require `title/description/publishDate`
(`description` doubles as card excerpt + meta description so they can't drift),
topic defaults to `notes`, `minutes` auto-computed when absent; media
(`cover`, `portrait`) is optional with typographic fallback.
