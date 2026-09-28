# Phase 9 — Quality Gate & Launch

**Against:** `specs/base-design.md` §11 Phase 9, §14 QA checklist
**Scope:** Phases 0–8 as built, plus the gaps recorded in `verification-and-plan.md`
**Date:** 2026-09-26

---

## 1. What Phase 9 turned out to be

Phase 9 is "ship it", and the plan document had already worked out that three of
its seven items could not be finished by writing code. So the phase was split
before any of it was built:

| Item | Outcome |
|---|---|
| 1 — Performance | **Done.** Fonts cut to latin, budget measured and enforced. |
| 2 — Accessibility audit | **Done.** axe over 27 routes × 2 themes, clean. |
| 3 — Cross-browser | **Partly done.** WebKit engine verified; the rest needs devices. |
| 4 — Responsive sweep | **Done.** The three named claims are now asserted, not eyeballed. |
| 5 — Content QA | **Done.** 665 links resolved against the build. |
| 6 — Deploy | **Prepared, not performed.** Blocked on three placeholders. |
| 7 — Post-launch | **Not started.** Needs accounts Pamela holds. |

One thing outside Phase 9 was done first, because Phase 9 could not be signed off
without it: **there was no theme control.** `localStorage.theme` was read by the
no-flash script and written by nothing, so `data-theme` could only ever be the OS
preference. §10's persistence requirement was dead code and §14's night-mode
checks had nothing to check. The lamp switch is built and gated.

---

## 2. The seven signature items

### 2.1 Performance — done

**Fonts: 19 faces → 5.** `@fontsource-variable`'s `standard.css` entry points
ship every subset a family covers, so a British writer's site was carrying
Cyrillic, Greek and Vietnamese `unicode-range` blocks.

| | before | after |
|---|---|---|
| `@font-face` blocks | 19 | 5 |
| woff2 files in `dist/_astro` | 19 | 5 |
| font payload | 1031.5 KB | **464.8 KB** |

The variable packages have no `latin.css` entry point — their `exports` map is
keyed on font *axis*, with subsets as separate `unicode-range` blocks inside each
file — so the faces are declared in `src/styles/fonts.css` against the packages'
own latin woff2. Nothing is copied or patched. `check:fonts` asserts the count
and re-derives the dead-range list, so a reverted import fails loudly.

**Budget, measured on the build over a static server:**

| Target (§11 P9.1) | Budget | Measured |
|---|---|---|
| LCP | < 1.2s | 52ms |
| CLS | < 0.02 | 0 |
| INP | < 150ms | 24ms |
| Client JS | < 15 KB gz | **2.79 KB** (18.6%) |
| Long tasks | — | none |
| Framework runtime | none | 0 external scripts |

> **The LCP and INP figures are lab numbers on loopback and should not be read as
> field performance.** There is no network latency, no CPU throttling and no cold
> 4G phone. They are a regression tripwire. CLS and the JS budget are the two that
> transfer — one is a property of the markup, the other of the build.

The baseline is recorded in `scripts/perf-baseline.json` and compared with a
tolerance that scales to the magnitude: 15% above a 300ms floor, 2× below it.
A 15% tolerance on a 48ms figure is a gate that fires at random, and a gate that
fires at random gets switched off. The first run of this gate failed on a
48ms → 64ms swing with no code change.

### 2.2 Accessibility — done

axe 4.13 over **27 routes × 2 themes = 54 page loads: zero violations**, at
`wcag2a/2aa/21a/21aa` plus `best-practice`.

Zero is a suspicious number, so the harness was proved capable of failing: three
violations (`image-alt`, `label`, `tabindex`) were injected into a real page and
all three were reported.

The hand-written suite keeps its place and now runs alongside it — 119 checks for
the things a rule engine cannot know, that the skip link is the *first* focusable
element, that the mobile menu traps focus and closes on Escape, that
`prefers-reduced-motion` reaches the cascade.

### 2.3 Cross-browser — partly done

**Verified in the WebKit engine.** No Safari-specific defect was found. The two
properties §9 P9.3 predicts trouble with are both sound:

- the fixed `body::after` frame renders at 48/36/20px on the right breakpoints,
  with **zero** content outside it across 6 routes × 4 widths, and
  `scrollWidth == innerWidth` on all 30 combinations — no scrollbar, no clipping
- `backdrop-filter: blur(8px)` is supported and does **not** degrade to
  transparency. Scrolled, the header measures `color(srgb … / 0.9)` — exactly
  0.9 alpha — confirmed at the pixel level over a magenta backdrop

**Honest limits of that verification:**

- it is **WKWebView, not Safari.app**. `safaridriver` exists and launches, but
  session creation is refused until "Allow remote automation" is ticked in
  Safari → Develop, which needs a human and sudo.
- a hidden document does not run its animation timeline, so **every result
  depending on a CSS transition or on `:focus` from that harness is void** —
  including the header's 300ms fade and the skip-link reveal. This was
  established with a synthetic control, and one candidate "bug" (a transparent
  scrolled header) was found to be a harness artefact and retracted.
- **Firefox, iOS Safari and Android Chrome are unverified.** They need real
  devices and no amount of automation substitutes.

**One manual check closes the material gap:** open Safari, scroll a page, confirm
the header fades to a solid paper band.

### 2.4 Responsive sweep — done

`shoot.ts` already walked all six §9 P9.4 widths over 11 routes, and
`check-manifesto.py` already measured the hero with a real font engine. But both
answer "is anything broken", and neither answers the three things the phase
actually names, which are about specific values. `check:responsive` asserts them:

- **frame width steps** — 20px ≤640, 36px ≤1024, 48px above, measured at 360,
  390, 640, **641**, 768, 1024, **1025**, 1440, 1920, so each breakpoint is
  pinned by both its sides
- **nothing under the frame** — leaf-element scan, tightest margin 0px at 360/768
  and 128px at 1440
- **the catalogue's two-column collapse** — the row is `7rem 1fr` and becomes one
  column at 480px, measured at 480 and 481
- **the hero holds its box** — 0px overflow at all six widths

### 2.5 Content QA — done

**665 internal links across 27 pages, all resolving to a built file.** Checked
against `dist/`, because the dev server answers 200 for things a static host would
404 and a link check run against dev proves nothing about deployment.

Also: no trailing-slash links on a trailing-slash-free site, no off-site links,
no placeholder copy in any rendered page, every content file carrying the fields
its schema requires, every date parsing, no draft in the build, and — on
deploy-shaped behaviour, over real HTTP — a genuine 404 for an unknown path, a
single 301 from `/about/` to `/about`, and hashed assets served rather than
redirected.

> The required frontmatter fields are **read out of `content.config.ts`**, not
> hardcoded. An earlier version listed `summary` and `date` for a collection
> whose schema says `description` and `publishDate`, and reported twelve perfectly
> good essays as broken. A gate that keeps a copy of the schema will disagree with
> the schema, and the schema is the thing that is right.

### 2.6 Deploy — prepared, not performed

Verified against a local static server that reproduces the deployment contract:
`trailingSlash: 'never'`, a real 404 status, correct content types.

**`DEPLOY.md`** carries the configuration for all three hosts in §11 P9.6,
including the one that bites: **Netlify 404s every article** without a
`[[redirects]]` rule, because there is no `library/2026/…` directory — only
`dist/library/2026/….html`. The site works perfectly in dev and 404s in
production.

**Hard blocker, reported on every run by `check:content` and not worked around:**

- `SITE.url` is `https://pamelaroy.com` — a placeholder
- `SITE.email` is `hello@pamelaroy.com` — a placeholder
- `SITE.socials` is empty, so the elsewhere row is the address alone
- `/contact` falls back to `mailto:` rather than a form endpoint

These are baked into every canonical URL, feed link, sitemap entry and social
card in the build. Deploying as-is publishes wrong absolute URLs site-wide: a site
that looks healthy to a crawler and is broken to a reader who clicks a card.
They are Pamela's values to supply; inventing plausible ones would have made the
problem harder to find, not easier.

### 2.7 Post-launch — not started

Google Search Console submission and uptime monitoring both need accounts Pamela
holds. The OG card generator §9 P9.7 mentions **already exists** —
`src/lib/og.ts`, 27 cards, pixel-measured by `check-cards.py` at 49/49.

---

## 3. Defects found and fixed

Every one of these was found by a gate, not by reading the code. The two gates
that had to be debugged hardest were the ones that were themselves wrong.

### 3.1 The lamp switch was invisible

`ThemeToggle` had a working click handler, a correct accessible name, and
`display: none`, always. Astro scopes component CSS by adding a `data-astro-cid-*`
attribute to the last element of every selector — including `.js`, because the
compiler cannot know that class belongs to `<html>`, which the component does not
render. Written as `.js .lamp`, the compiled rule was
`.js[data-astro-cid-x] .lamp[data-astro-cid-x]`, and since `<html>` never carries
a component scope attribute, the rule could never match. Fixed with
`:global(.js)`.

### 3.2 A cover in the documented place silently lost its social card

`src/lib/cover.ts` builds the path to a cover's source file for the OG
compositor. Its own docstring works the example through
`src/content/writings/2026/covers/wrong-way.jpg`. The code omitted the `covers/`
segment. The code and its documentation disagreed, and the code was wrong: a cover
added where the documentation says would resolve to a file that did not exist,
`readCover` caught it, logged a warning nobody reads, and the essay's social card
quietly lost its photograph. **No page broke, so nothing failed.**

This is precisely the class of defect the audit predicted for this phase, and it
was only reachable by generating a real cover and rendering a real card.

### 3.3 No AVIF, and no `<picture>`

§11 P9.1 asks for "AVIF/WebP". The site used `<Image>`, which emits exactly one
format: the first fixture build produced ten WebP files and zero AVIF, with no
`<picture>` and therefore no fallback. All four call sites now use
`<Picture formats={['avif','webp']}>`.

### 3.4 The largest contentful paint was lazy-loading itself

`loading="lazy"` on the first shelf card's cover — the element the page cannot
paint without. §11 P9.1 says "lazy-load *below-fold* images", and the qualifier is
doing real work. `WritingGrid` now takes `priorityFirst`, set on `/library` only,
because that is the only shelf on the site near the top of a page; the home page's
is below the manifesto and a section of prose, and lazy is correct there.

### 3.5 A bug in the gate that was checking the images

`scripts/lib/serve.ts` redirected `isFile()` paths that had no trailing slash —
which is every hashed asset. `/_astro/cover.webp` returned `301` to itself. The
browser followed it until it gave up, every image failed to load, and the image
gate reported `naturalWidth: 0` with no console error to explain it. Meanwhile the
CSS checks, which grepped only `dist/_astro/*.css`, were reporting that no card
styles existed in a build where every one of them was present — because Astro
inlines component styles into each page and emits a file only for the larger
sheets. Both were measurement faults, and both are the reason this document quotes
measured values rather than conclusions.

### 3.6 Gates that were green for the wrong reason

Recorded because the pattern recurred, and because a gate that cannot fail is
worse than no gate:

- the fixture essay was a **draft**, so its cover never rendered — every image
  check read an empty page and came out green having proved nothing. There is now
  an explicit precondition assertion before anything is measured.
- the OG composite check used an **absolute** stdev threshold, which passed on a
  card with *nothing composited into it*; the card background is not a flat fill.
  It is now differential against a coverless card, and on the mean rather than the
  spread, because a flat grey fixture has low spread and cancels against the
  card's typography.
- `:hover` was read after a synthetic `mouseover` event, which does not apply CSS
  hover at all. Now forced through the CSS domain, with `transform: scale(1.03)` as
  a positive control asserted *first*.
- the axe harness was fed three deliberate violations to confirm it reports any.
- `report()` ended in `process.exit`, which skipped the image gate's `finally` and
  left a half-written `cover:` key in two content files. The next run then failed
  differently, having inserted a second one.

---

## 4. The gates

`./scripts/check.sh` runs the lot. Every gate can fail the run; the `run_gate`
helper exists because `gate | tail -2` returns `tail`'s exit status.

| Gate | Result |
|---|---|
| `astro check` | 0 errors, 0 warnings, 41 hints |
| `check:seo` | 169/169 |
| `check:cards` | 49/49 |
| `check:behaviour` (behaviour, no-JS, a11y) | 119/119 |
| `check:content` (links, copy, deploy contract) | **18/18** + 5 launch-blocker warnings |
| `check:fonts` | **10/10** |
| `check:responsive` | **26/26** |
| `check:lamp` | **22/22** |
| `check:a11y` (axe) | **54/54** |
| `check:images` (with fixtures) | **29/29** |
| `check:perf` | **8/8** |
| visual sweep, 11 routes × 14 viewports × 2 themes | no overflow, no console output |

The new gates read `dist/` rather than the dev server, because the claims they
make are about what would be deployed. `check:a11y` is the deliberate exception
and says so in its header.

---

## 5. Still not done

- **Firefox, iOS Safari, Android Chrome.** No automation substitutes for a device.
  The two properties most likely to differ — the fixed frame and `backdrop-filter`
  — are verified sound in WebKit, which is the engine §9 P9.3 flagged first.
- **WebKit transition and focus behaviour.** Void in the available harness; needs
  one manual pass in Safari.app.
- **Deploy, Search Console, uptime.** Blocked on credentials and three
  placeholders in `src/lib/site.ts`.
- **A real newsletter endpoint.** The form works and is progressively enhanced, but
  it opens the reader's mail client.
- **Real cover art and a portrait.** The image pipeline is now *verified* rather
  than *assumed* — but against generated fixtures, which are removed after each
  run. The first real photograph is still the first thing to load through
  `astro:assets` in production.

---

## 6. Spec amendments this phase supports

From `verification-and-plan.md` §5 Step 1, still unamended and still making the
site fail its own checklist. The build is right and the spec is wrong on all three:

1. **§5.2** — scope the two-case rule to display type. "Uppercase is rationed to
   exactly two places per page" is contradicted by §5.1, §2.2, Move 5, Move 6 and
   Move 7, all of which mandate uppercase 11px labels. Every *display* face that
   shouts is one of the two permitted slots.
2. **§14** — "Exactly two uppercase elements per page maximum" needs the same
   "display type" qualifier, for the same reason.
3. **§6 Move 3** — decide whether the hearth glow belongs on article pages. The
   spec says never; `WritingLayout` renders one. Either amend the spec to "never in
   the reading column" or remove it. A design call, not a bug.
4. **§9** — the view-transition row was unimplemented and recommended against.
   It is now implemented, and `scripts/check-transitions.ts` is the gate for
   it: `ClientRouter` in `BaseLayout`, the crossfade in `base.css`, and a
   per-document re-wire of every script that binds the page.
5. **§4** — record the two token moves from Phase 0 (`--ink-muted`, `--ember`),
   which were moved to clear 4.5:1 and are documented nowhere.
