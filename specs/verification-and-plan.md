# Verification & Remaining Plan

**Against:** `specs/base-design.md`
**Scope:** Phases 0–8 as built, audited against the whole spec — not just the phase list, but §2, §4–§10, §13 and §14.
**Date:** 2026-09-26

> **Update — Phase 9 has since been built.** See `specs/phase-9.md` for what was
> done, what was found, and what is still blocked. In brief, of the seven steps in
> §5 below: **1 is drafted but not applied** (the amendments are listed in
> phase-9.md §6 — two are factual corrections, three are design calls that are
> Pamela's), **2, 3, 4 and 5 are done**, **6 is partly done** (WebKit verified, no
> device testing), and **7 is prepared but not performed** (blocked on three
> placeholders in `src/lib/site.ts`).
>
> Three of the findings below were acted on during Phase 9 and the text is left as
> written rather than rewritten, because the record of what was believed at the
> time is the useful part:
>
> - **§3.1, the missing lamp switch** — built. `src/components/ThemeToggle.astro`,
>   three states, `localStorage.theme` written. Gated by `check:lamp` (22 checks).
> - **§3.4, fonts shipping every subset** — fixed. 19 faces → 5, 1031.5 KB →
>   464.8 KB, declared in `src/styles/fonts.css`. Gated by `check:fonts`.
> - **§4, the unexercised image paths** — exercised, against generated fixtures
>   that are removed after each run. This found two real defects: `lib/cover.ts`
>   resolved covers to the wrong path, so a cover in the documented location
>   silently lost its social card; and `<Image>` was emitting no AVIF at all. Both
>   fixed. Gated by `check:images` (29 checks).
>
> The deviations in **§3.2, §3.3 and §3.5** are untouched and still need a decision.

---

## 1. How this was verified

Three kinds of evidence, kept distinct because they have different failure modes.

| Method | Used for | Known weakness |
|---|---|---|
| Running the gate (`./scripts/check.sh`) | Builds, types, behaviour, no-JS, a11y basics, 11 routes × 14 viewports × 2 themes | Only asserts what somebody thought to assert |
| Reading the built HTML/CSS in `dist/` | Two-case rule, heading order, landmarks, `alt` text, pure black/white, font subsets | Sees markup, not paint |
| Reading the spec against the source | Everything the gate does not cover — this document's main source | Reading is not measuring |

The third column is why §2 exists. Both previous phases were "complete" against
their checklists while three spec requirements had never been looked at.

Everything below was checked against the built output or the source, not recalled
from the phase that wrote it. Where a claim is inherited from an earlier phase
without re-measurement, it says so.

---

## 2. What passes

### 2.1 Structure

| Spec | Status |
|---|---|
| §8 component inventory | 16 of 17 present — `ThemeToggle` missing, see §3.1 |
| §8 layouts, `lib/`, `styles/` | all present, plus five additions the spec did not anticipate (`StaticPage`, `Measured`, `pages`, `newsletter`, `seo`, `og`, `cover`, `raster`) |
| §7.1 routes | all 13 built. `/journal` correctly absent — §11 P6.5 says "only if second-collection content exists", and there is no second collection |
| §7.2 collections | `writings`, `services`, `pages` match the spec's schemas. `[^_]*` pattern, closed `topic` enum, `minutes` auto-computed when absent — all confirmed |
| §11 P0–P8 | every item addressed |

### 2.2 The seven signature moves

| Move | Status | Evidence |
|---|---|---|
| 1 — Room frame | pass | `body::after` fixed overlay, `z-index: 200`; mobile panel at `300`; steps 48/36/20 |
| 2 — Grain | pass | `opacity: .035` day, `.05` night — matches §6 Move 2 exactly |
| 3 — Hearth glow | **deviation** | on home and page titles as specced, but *also* on article pages — see §3.2 |
| 4 — Manifesto | pass | Fraunces uppercase with the one `<em>` breaking it |
| 5 — Lamplight button | pass | transparent → ember fill, `.btn--quiet` variant |
| 6 — Shelf | pass | 2-col, 4:5 covers, scale 1.03; **verified one `<a>` per card = one tab stop** |
| 7 — Card catalogue | pass | month-grouped, hairlines, date in the margin |
| Scroll whisper | pass | — |
| Progress hairline | pass | — |

### 2.3 Tone of voice (§3.2, §14)

- 0 exclamation marks in any user-visible string
- 0 emoji
- 0 instances of the banned jargon list
- section headings are thoughts, not nouns
- empty states are written sentences (verified by rendering one, see §2.6)
- one metaphor (the room) held throughout

A read-only audit of every user-visible string returned 16 defects and 21
borderline findings. All 16 defects were applied. One finding was **rejected on
evidence**: it claimed `A House of Seventeen Books` was Title Case among
sentence-case siblings, but all twelve titles are Title Case, so "fixing" it
would have broken consistency. Three of my own follow-up assertions were also
wrong and were corrected rather than the code.

### 2.4 Anti-goals (§13)

| Rule | Status |
|---|---|
| No pure `#000` or `#fff` | **0 occurrences** in any page stylesheet, both themes. (Print uses white for paper — documented exception) |
| No carousel, no modal, no pop-up, no chat widget | pass |
| No framework island, no Tailwind | pass — 0 external JS files |
| ≤ 2 type families | pass — 3, all variable, self-hosted |
| One accent per viewport | pass — ember worst case 0.18% of viewport (budget 5%) |
| ≤ 15 KB client JS | pass — **1,815 B gzipped** worst page, 11.8% of budget |

### 2.5 Accessibility and semantics

| §14 check | Result |
|---|---|
| Skip-link first focusable, on every page | pass — 27/27 |
| `<main>` landmark on every page | pass — 27/27 |
| Heading levels descend without gaps | pass — 27/27 |
| Every `<img>` has meaningful `alt` | pass — 0 missing |
| Contrast ≥ 4.5:1 body, both themes | pass — worst 4.65:1 |
| `prefers-reduced-motion` disables all animation | pass — verified via computed style on every element, not via the class list |
| Visible `:focus-visible` | pass |
| Mobile menu traps focus, closes on `Escape` | pass |

### 2.6 Behaviour proven against real renders

Three things were verified by looking at output rather than by reading code,
because reading the code would have passed all three:

- **Print.** A real 7-page PDF. This caught three bugs a code reading would not:
  night-mode ink would have printed invisible (a specificity loss), the measure
  sat flush against the margin, and a scrollbar stripe ran down the page.
- **Empty state.** The `WritingGrid` empty branch is unreachable with the
  current content, so it was proven with a temporary fixture — one topic's only
  piece removed, page screenshotted, fixture restored byte-identical. It reads
  as an absence with a sentence in it.
- **Social cards.** 12 cards, measured at the pixel level. A contact sheet caught
  the SVG reserving the cover plate at x=524 while the composite drew it at
  x=732 — a stray beige stripe across every card.

### 2.7 Automated gates

| Gate | Result |
|---|---|
| `astro check` | 0 errors, 0 warnings, 41 hints |
| `bun run build` | 27 pages, 0 warnings |
| SEO (`check-seo.ts`) | **169/169** |
| Social cards (`check-cards.py`) | **49/49** |
| Behaviour / no-JS / a11y | **119/119** |
| Visual: 11 routes × 14 viewports × 2 themes | no overflow, nothing under the frame, no console output |
| Hero fit at every viewport | pass |

**Two of these gates were green for the wrong reason and were fixed at the
harness, not the assertion:**

1. `prefers-reduced-motion` was never actually being applied — navigation cleared
   the CDP media emulation, so the reveal check passed regardless of the CSS. The
   fix was to make the harness verify its own precondition.
2. `check.sh` ran gates as `gate | tail -2`, which returns `tail`'s exit status.
   A behaviour suite reporting 117/119 would have printed a green run and exited
   0. All gates now go through a `run_gate` helper that can fail.

---

## 3. Deviations found

Five, in descending order of how much they matter.

### 3.1 There is no lamp switch — night mode is OS-only

**Spec:** §8 lists `ThemeToggle.astro` — "the lamp switch". §10: "Default follows
`prefers-color-scheme`; **user choice persists in `localStorage`**." §15 gives
the rationale: "A lamp is the core metaphor. Being able to dim the room is the
most on-brand feature available."

**Actual:** the no-flash script *reads* `localStorage.theme` and falls back to the
OS preference. Nothing anywhere in `src/` ever *writes* it. There is no control
of any kind. The persistence half of §10 is dead code.

**Why it matters:** this is the feature §15 singles out as the most on-brand
thing available, and it is the one feature a reader on a desktop cannot reach.
On a phone it works by accident, because iOS follows the OS.

**Severity:** high. It is the largest single gap between spec and build.

### 3.2 The hearth glow is on article pages

**Spec:** §6 Move 3 — "Only on the home hero and page titles. **Never on article
pages** — those stay flat and calm for reading."

**Actual:** `WritingLayout.astro:110` renders a `.hearth` in the article header.
The code comment rationalises it: "The same bloom the page title gets. It stops
at the top of the reading column."

**Why it matters:** it is a direct contradiction of an unambiguous instruction.
The code's own reasoning elsewhere argues against it — `WritingLayout` says the
article title "is neither" the hero manifesto nor the page title for §5.2
purposes, and by that same logic the bloom does not belong there either. The
bloom is confined to the title block, so the practical harm is small; the
precedent is not.

**Severity:** low visually, medium as a rule. Either remove it or amend §6 Move 3
to say "never in the reading column" instead of "never on article pages". The
spec should be amended rather than the code bent — but this is a design call,
not a bug fix, so it is yours.

### 3.3 View transitions are not implemented

**Resolved — implemented, and the cost paid rather than avoided.**
`ClientRouter` is in `BaseLayout`, the crossfade is in `base.css`, and the two
things this audit flagged as the cost are the two that had to be done: the
no-flash theme script re-runs on every navigation (`data-astro-rerun`, because
a swap replaces `<html>`'s attributes along with everything else), and every
script that wires the page re-wires it per document. Both failures were silent
— a night reader handed the day room halfway down a link, a lamp made invisible
by the loss of the `js` class — so `scripts/check-transitions.ts` is the gate
(25 checks) and it asserts the room and the controls, not the class names.
`TopicFilter`'s `popstate` handler is now reachable, as noted below.

**Spec:** §9 motion table — "View transition | crossfade, no slide | 300ms
ease-out", and the note that `ClientRouter` from `astro:transitions` "gives the
crossfade for free".

**Actual (was):** no `ClientRouter`, no `astro:transitions`, no `transition:animate`.
Pages were ordinary full document loads.

**Why it matters:** small on its own. It is listed here mainly because it has a
second-order effect: `TopicFilter`'s `popstate` handler is unreachable in a
static multi-page site, since going back to a filtered URL is a document load, not
a same-document navigation. View transitions make that handler live — and, in the
other direction, the filter's `write()` has to stop nulling the history state, or
it leaves the router unable to answer the back button.

**Severity:** low, and paid. It is a nicety, and it carried real cost — it
interacts badly with the inline no-flash theme script and requires scripts to be
re-bound after navigation. Both costs are now paid rather than argued about; what
is left is one external script file, the router, which `scripts/check-perf.ts`
allows by name and no other.

### 3.4 Fonts ship every subset, not latin

**Spec:** §11 Phase 9 item 1 — "Self-hosted subset fonts (`@fontsource` with
**latin** subset)".

**Actual:** `BaseLayout` imports `/standard.css` and the bare package, which ship
every subset. Measured in `dist/_astro`: Fraunces 3 faces, Newsreader 3 faces,
**Inter 7 faces** — including Cyrillic, Greek and Vietnamese `unicode-range`
blocks. A British writer's site ships Greek and Vietnamese subsets.

**Why it matters:** pure waste against the LCP and byte targets. The fix is a
one-line-per-family import change to the `latin` entry points, plus a
`fontsource` unicode-range check. This is the cheapest performance win available.

**Severity:** medium. Easy fix, measurable gain, explicitly specced.

### 3.5 The two-case rule contradicts the rest of the spec

**Spec:** §5.2 — "Uppercase is a *shouting device*, so it is rationed to exactly
**two places per page**: the hero manifesto, and the page title."

**But the same spec mandates uppercase throughout:**

- §5.1 role table: "Label / meta / nav / buttons | Inter | **uppercase**"
- §2.1 reference extraction: micro-labels are `UPPERCASE`
- §2.2: "Small uppercase tracked labels — **Keep**"
- Move 5: `.btn { text-transform: uppercase }`
- Move 6: `.card__more { text-transform: uppercase }`
- Move 7: catalogue group headers "are Inter labels"

**Measured, per page:** up to 5 uppercasing classes. But the sizes matter:

| Class | Size | Face | Shouting? |
|---|---|---|---|
| `page-title` | `--fs-display-l` (40–80px) | Fraunces | yes — this is the rationed one |
| `manifesto` | `--fs-display-xl` | Fraunces | yes — the other rationed one |
| `btn`, `card__more`, `filter__button`, `filter__select` | `--fs-label` (11px) | Inter | no |
| `writing__tag`, `service__terms`, `toc__label`, `elsewhere__link`, `issues__meta` | `--fs-label` (11px) | Inter | no |

**Assessment: the build is right and the spec is wrong.** The intent of §5.2 —
rationed shouting in *display type*, sentence case for prose — is honoured
exactly. Every display face that shouts is one of the two permitted slots.
Everything else is the 11px tracked label the spec asks for in five other places.
De-uppercasing the labels would break Move 5, Move 6 and Move 7, and would
diverge from the reference site the spec was built from.

**Action:** amend §5.2 to read "uppercase is rationed to two places per page *in
display type*; 11px labels, buttons and card links are uppercase throughout" and
amend the §14 checklist item "Exactly two uppercase elements per page maximum" to
say "display type". Otherwise the site permanently fails its own QA checklist
while being correct.

---

## 4. Untested code paths

Not deviations — a limit on what the passing gates actually prove.

**There are zero cover images and no portrait in the collection.** That leaves a
whole body of code that has never run against real content:

- the `astro:assets` optimisation pipeline (AVIF/WebP, `width`/`height` for CLS)
- `WritingCard`'s cover branch and its `--filter-cover` treatment
- `WritingLayout`'s article cover
- `/about`'s portrait and its 13rem mobile clamp
- the OG card's cover plate (proven separately with a throwaway fixture, then removed)
- print's cover-hiding

So §11 Phase 9 item 1's image targets — LCP, CLS — **cannot be signed off**, and
§14's "image filter cohesion applied across all covers" is unverified, because
there are no covers to apply it to. The `WritingCard` fallback plate (§12) is
what every reader currently sees, and it is the *designed* placeholder, not the
designed cover.

This is the item most likely to surface a real defect late, because it is the
last thing exercised before launch and the code path is a decade of photography
reshaped by a filter.

---

## 5. Plan for the rest

Seven items, in dependency order. Effort is in working hours for someone who
knows the codebase; "risk" is the chance the item *breaks* something.

### Step 1 — Reconcile the spec (0.5h, no code)

No code changes, but everything below is easier to verify afterwards, and §3.5
currently makes the site fail its own checklist.

- Amend §5.2 to scope the two-case rule to display type (see §3.5)
- Amend the §14 checklist item to match
- Decide §3.2 (hearth) — amend §6 Move 3, or remove it from `WritingLayout`
- Decide §3.3 (view transitions) — implement, or remove the row from §9
- Record the two token moves from Phase 0 (`--ink-muted`, `--ember`) in §4, which
  currently documents values the build does not use, with the reason

**Risk:** none. **Do this first** — it is the cheapest item and it unblocks
sign-off on the rest.

### Step 2 — The lamp switch (3–4h, low risk)

The largest genuine gap. §3.1.

- `src/components/ThemeToggle.astro` — a lamp glyph button in the header
- Three states, not two: follow the OS / force day / force night. A two-state
  toggle on an OS-following site is a trap — the reader cannot get back to
  "follow the system" once they have touched it
- Write `localStorage.theme`; the existing no-flash script already reads it
- `aria-pressed`, and a label that changes with the state
- Transition on `background-color` and `color` only, per §9's animation rules
- Set `color-scheme` on the root so form controls and scrollbars follow
- Update the behaviour suite: assert the toggle writes `localStorage`, that a
  stored value survives a reload, and that keyboard operation works

**Risk:** low, and the header has room. **Verify by:** toggling in both directions
with the OS preference set both ways.

### Step 3 — Real content for the image paths (1–2h + art, low risk)

§4. This is a content task, not an engineering one, but it gates Phase 9.

- Add at least one real cover image and the `/about` portrait
- Re-run the build and confirm: AVIF/WebP emitted, `width`/`height` set, the
  `--filter-cover` treatment applied, the OG card plate composites, the mobile
  portrait clamp holds, print hides the cover
- Add a CLS assertion to the gate so this cannot silently regress
- If the covers are photography, check the filter at 100% — the whole point of
  `--filter-cover` is that a shelf shot over years reads as one body of work

**Risk:** low. **This is where a late defect is most likely** — see §4.

### Step 4 — Performance budget, measured and enforced (3–4h, low risk)

§3.4 and §11 Phase 9 item 1.

- Switch the font imports to the `latin` entry points. Expected: Inter drops from
  7 `@font-face` blocks to 2
- Add Lighthouse to the dev dependencies and a `check:perf` gate. Targets from
  §11 P9.1: **LCP < 1.2s, CLS < 0.02, INP < 150ms, JS < 15 KB gzipped**
- Assert on the built output with `astro preview`, not the dev server — dev is
  slower and unminified, so it measures the wrong thing
- Fail the gate on regression against a recorded baseline, so the number cannot
  drift upward unnoticed

**Risk:** low. **Verify by:** the gate fails when a font subset is added back.

### Step 5 — Accessibility audit (2–3h, low risk)

§11 Phase 9 item 2. The hand-written checks cover a lot, but they only assert
what was thought of.

- `@axe-core/playwright` (or `axe-core` injected over the existing CDP harness)
- Run against all 27 routes in both themes, fail on any serious or critical issue
- Add to `check.sh`
- The existing behaviour suite keeps its place — axe will not tell you the skip
  link is the first focusable element, or that the mobile menu traps focus

**Risk:** low. Expect a small number of findings; none should require a design change.

### Step 6 — Cross-browser (3–4h + devices, medium risk)

§11 Phase 9 item 3. **The least verified thing in the project** — everything so
far has been measured in one browser.

- Safari and iOS Safari first. The fixed `body::after` frame plus
  `backdrop-filter` on the sticky header is the classic Safari failure: the frame
  is a fixed overlay, and Safari has historically handled fixed elements and
  `backdrop-filter` differently. §9 P9.3 already predicts this
- Firefox second — check `text-wrap: balance` and the `overflow-wrap` on display type
- Confirm `backdrop-filter` degrades to a solid paper background, not a
  transparent header over unreadable text
- Confirm the frame produces no scrollbar or clipping artefact (spec calls this
  out explicitly, twice)
- This cannot be automated in the current harness; it needs real devices

**Risk:** medium — this is where unknown unknowns live. **Do it before deploy,
not after.**

### Step 7 — Deploy and post-launch (2h setup, then wait)

§11 Phase 9 items 6–7.

- Resolve the placeholders in `src/lib/site.ts` first, or every canonical, every
  feed link, every social card and the sitemap will point at the wrong host:
  - `url: 'https://pamelaroy.com'`
  - `email: 'hello@pamelaroy.com'`
  - `socials: []` — add real profiles, or the elsewhere row is the address alone
- Replace the `mailto:` fallback on `/contact` with a real endpoint
  (Buttondown / Basin / Formspree). The current form works and is
  progressively enhanced, but it opens the reader's mail client
- Deploy static output to Cloudflare Pages / Netlify / Vercel
- Then, in order:
  1. `bun run check:live --origin https://pamelaroy.com` — already written, and
     it catches exactly the deployment-shaped failures the build cannot: HTTPS
     redirect, trailing-slash handling, sitemap at the advertised origin, feed
     links resolving against the live host
  2. Submit to Google Search Console
  3. Uptime monitoring

**Risk:** low, but **the placeholders are a hard blocker** — deploying without
fixing them publishes wrong canonicals site-wide.

---

## 6. Effort summary

| Step | Effort | Risk | Blocks launch | Status |
|---|---|---|---|---|
| 1 — Reconcile the spec | 0.5h | none | no | amendments drafted, **not applied** |
| 2 — The lamp switch | 3–4h | low | no | **done** |
| 3 — Real cover + portrait | 1–2h + art | low | **yes** (Phase 9.1 unmeasurable) | code path **verified** with fixtures; real art still needed |
| 4 — Performance, measured | 3–4h | low | no | **done** |
| 5 — axe audit | 2–3h | low | no | **done**, 54/54 clean |
| 6 — Cross-browser | 3–4h + devices | **medium** | **yes** | WebKit **done**; devices outstanding |
| 7 — Deploy | 2h + wait | low | **yes** | config **prepared**; not performed |

Steps 1, 2 and 4 are independent and can run in parallel. Step 3 should precede
Step 4, because the performance numbers are meaningless without a cover to load.

Step 3 turned out to be the load-bearing one, and not for the reason given. The
image pipeline could be *verified* with generated fixtures, which is what made
Step 4's numbers mean something and what surfaced the two defects recorded at the
top of this file. What fixtures cannot supply is the art itself — and the first
real photograph is still the first thing to go through `astro:assets` in
production.

---

## 7. What is already done well enough not to revisit

Recording this so a later pass does not re-open settled questions:

- **Vanilla CSS with tokens**, not Tailwind. The type scale *is* the design and
  utility classes obscure it.
- **No framework runtime.** 0 external JS files, 1,815 B inline on the heaviest
  page. Every kilobyte is a tax on the calm, and the tax is 12% of budget.
- **Services as a collection.** Adding `workshops.md` produces a listed, linked,
  styled page with zero code changes. That is §11 P5's extensibility test, met.
- **The measure lives in one place.** `--measure` on `.prose` in `prose.css`,
  replacing three per-layout declarations.
- **One place queries each collection.** `lib/writings.ts`, `lib/services.ts`,
  `lib/pages.ts` are the only callers of `getCollection`. This is what made the
  draft guarantee, the sitemap and the feed all agree without coordination.
- **Gates that state where they are true.** The draft check runs against `dist/`,
  not dev, because dev deliberately shows drafts. When a claim can only be made in
  one place, the gate moved there rather than being loosened.
- **Print.** Working, and verified against a real PDF.
