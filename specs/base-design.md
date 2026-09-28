# Base Design & Build Plan — Pamela Roy

**A cozy, minimal, editorial library for a blogger & ghostwriter.**

Status: ready to implement · Target: Astro 7.3.5 (already installed) · Output: static, zero-framework, no client UI runtime

---

## Table of Contents

1. [The Brief](#1-the-brief)
2. [Reference Decoded — jasonkenny.com](#2-reference-decoded--jasonkennycom)
3. [Our Design Language — "The Mountain Room"](#3-our-design-language--the-mountain-room)
4. [Design Tokens](#4-design-tokens)
5. [Typography System](#5-typography-system)
6. [The Signature Moves](#6-the-signature-moves)
7. [Content Architecture](#7-content-architecture)
8. [Component Inventory](#8-component-inventory)
9. [Motion](#9-motion)
10. [Night Reading Mode](#10-night-reading-mode)
11. [Step-by-Step Build Plan](#11-step-by-step-build-plan)
12. [Author Workflows](#12-author-workflows)
13. [Anti-Goals](#13-anti-goals)
14. [QA Checklist](#14-qa-checklist)
15. [Decisions & Tradeoffs](#15-decisions--tradeoffs)

---

## 1. The Brief

**What it is.** A personal portfolio and, primarily, *a library* — a browsable, warm, quiet home for everything Pamela has written. Secondary to that, a place to describe professional services (ghostwriting, coaching) and eventually sell or book them.

**The feeling.** A corner of a mountain room at the end of the day. Lamp on. Chair pulled in. Someone is thinking out loud, and you are welcome to sit down. Not a magazine, not a SaaS landing page, not a personal brand funnel. A *room*.

**Three words to test every decision against:** cozy, minimal, homely.

**Success criteria — a visitor should be able to:**
1. Land and feel the room within ~1 second (before reading a single word).
2. Understand within 5 seconds that this is a library of writing, and that it is extensive.
3. Find any specific piece of writing in under 3 clicks, without using a search box.
4. Read a 2,000-word essay without eye strain, and want to read the next one.
5. Find out what Pamela does professionally, and how to reach her, without leaving the site.

---

## 2. Reference Decoded — jasonkenny.com

I fetched and analysed the live site (HTML + the 918 KB compiled `site.css`) to extract the real design tokens rather than guessing from screenshots.

### 2.1 Extracted design tokens

**Colour**
| Role | Value | Notes |
|---|---|---|
| Primary ink | `#1a1f2d` | deep blue-black, dominant (77 uses) |
| Deep bg | `#0b0d13`, `#202537` | near-black variants |
| Neutral dark | `#272727`, `#1d1d1d`, `#3e3e3e` | |
| Light surface | `#f6f6f6`, `#ebebeb` | |
| Muted text | `rgba(34,34,34,.4)`, `rgba(26,31,45,.3/.5/.6)` | alpha-based, never a flat grey |
| **Accent 1** | **`#ffea00`** | acid yellow — buttons, selected state, loader. The "torchlight" |
| **Accent 2** | **`#f0523d`** | warm red — "ember" |
| **Accent 3** | **`#ce8464`** | warm clay, used at 50% alpha |

**Typography**
| Slot | Face | Spec |
|---|---|---|
| Display h1 | **Ambroise** (serif) | `900`, `110px`, `line-height: .9`, `letter-spacing: -3px`, `UPPERCASE` |
| h2 | Ambroise (serif) | `700`, `25px`, `UPPERCASE`, `ls: .05em`, `lh: 1.2` |
| h3 / labels | **DIN Condensed** | `300`, `14px`, `UPPERCASE`, `ls: .05em` |
| Body | **Proxima Nova** → falls back to Helvetica Neue/Arial | `16px`, `lh: 1.5` |
| Micro-labels | — | `11px`, `500`, `UPPERCASE`, `ls: .5px` |

Supporting size distribution: 12/13/14/16/18px dominate; 32/34/36/60px for section heads; a deliberate jump to 110px for the hero. Line-height `1em` for display, `1.5–1.6em` for body.

**Layout & signature moves**
- **The room frame:** `.tweak-site-border-show .Site { border-width: 48px }` → `36px` tablet → `20px` mobile. A thick border framing the *entire* viewport. This is the site's single most identifying trait.
- **Full-viewport hero** with fade slideshow + autoplay + thin **line indicators**.
- **Right-side nav**, stacked footer, uppercase tracked footer links.
- **Blog grid:** 2 columns, **1:1 square** thumbnails, `50px` gap, image → title → excerpt → `Read more →`.
- **Chronological archive** below the grid, grouped by month (`Aug 19, 2026` + title).
- **Buttons:** `color: #ffea00; border: 1px solid #ffea00; background: transparent` → hover `background: #ffea00; color: #201d1d`.
- **Link hover:** `1px` underline `rgba(0,0,0,.3)` → `rgba(0,0,0,.15)`, `0.15s ease-out`.
- **Easing:** `cubic-bezier(0,0,.28,1)` and `cubic-bezier(0,0,0.618)`.
- Newsletter as a quiet bordered panel; thin horizontal rules as section dividers.

### 2.2 Adapt / keep / reject

| Reference move | Decision | Reasoning |
|---|---|---|
| Thick viewport frame | **Keep — signature #1** | It literally *is* a room/window. Perfect for the brief. |
| Big uppercase serif display | **Keep, warm it** | Editorial authority. Use a softer, warmer serif. |
| Small uppercase tracked labels | **Keep** | Cheap, elegant, reinforces "quiet". |
| Hairline rules + 50px-ish rhythm | **Keep** | Structure without boxes. |
| Transparent → filled accent buttons | **Keep** | Exactly right for "minimal, homely". |
| Link underline 150ms ease-out | **Keep** | The micro-motion that makes it feel alive. |
| Blue-black ink + acid yellow | **Swap** | Too cold/dramatic for "cozy mountain room". Warm the ink, replace acid yellow with **ember amber**. |
| Sans-serif body copy | **Swap** | Pamela is a *reader*. Long-form gets a warm serif. Cozy ≠ cold. |
| Autoplaying hero slideshow | **Reject** | Hostile to reading comfort and an a11y problem. Use a static or manually-crossfaded hero. |
| 100vh hero on every view | **Adapt** | Full-bleed on desktop; on mobile reduce to ~70vh so content isn't pushed below the fold. |
| Muted text as flat grey | **Adapt** | Use warm alpha-ink instead, so "grey" still feels like the same room. |
| Newsletter block | **Keep** | The newsletter is the growth engine of a writer's site. |
| Month-grouped archive | **Keep** | Feels like a card catalogue. Perfect for "library". |

---

## 3. Our Design Language — "The Mountain Room"

### 3.1 The concept

Three layers, painted in this order, sum to the feeling:

1. **The wall** — a warm oat-paper background, subtly textured with grain. Not white. Not grey. Paper.
2. **The light** — one warm ember accent used *sparingly*, like a lamp. It appears on buttons, active nav, hover states, and a soft radial bloom behind hero/section headings. Nowhere else.
3. **The furniture** — structure from hairlines and generous whitespace only. No cards with drop shadows, no boxes, no gradients-as-decoration. A 48px frame contains it all.

Because everything is warm and low-contrast except the type, the site reads as *lit by a lamp* rather than *rendered by a computer*.

### 3.2 Tone of voice (writing guidance, applies to all copy)

Pamela's reference voice is plain, declarative, and confident. It avoids marketing superlatives and uses concrete detail. Rules for all site copy:
- Short declaratives. "Writing a book takes time and expertise."
- Second person for the reader. "You have built your philosophy."
- **No exclamation marks. No emoji. No "unlock / elevate / supercharge / journey" jargon.**
- Use a recurring extended metaphor from one natural source (Jason uses *light and torches*; Pamela should use hers — *rooms, lamps, mountain paths, seasons, seeds, maps*). Pick one and hold it across the whole site.
- Section headings can be a full thought, not just a noun. "Where the ideas come from" beats "About".

---

## 4. Design Tokens

File: `src/styles/tokens.css` — imported once in `BaseLayout.astro`.

```css
:root {
  /* ---- Colour: the wall ---- */
  --paper:         #F2EDE4;   /* page background — warm oat */
  --paper-deep:    #E7DFD1;   /* recessed panels, the archive band */
  --paper-raised:  #FBF8F3;   /* cards, form fields */
  --frame:         #DED4C3;   /* the 48px room frame */

  /* ---- Colour: the ink ---- */
  --ink:           #221E1A;   /* primary text — warm near-black */
  --ink-soft:      #4A423A;   /* secondary text */
  --ink-muted:     #8A7F72;   /* meta, dates, captions */
  --rule:          #D8CEBE;   /* hairlines and dividers */

  /* ---- Colour: the light (use sparingly) ---- */
  --ember:         #C2603A;   /* THE accent — lamp/ember terracotta */
  --ember-bright:  #E0813F;   /* hover / glow */
  --ember-wash:    #F6E7DC;   /* accent tint background */
  --hearth:        #F0D9A8;   /* warm bloom behind headings */

  /* ---- Colour: the mountain (secondary accent) ---- */
  --pine:          #4C5F52;   /* tags, secondary emphasis */
  --pine-wash:     #E3E7E1;

  /* ---- Type families ---- */
  --font-display: 'Fraunces Variable', Georgia, serif;
  --font-prose:   'Newsreader Variable', Georgia, serif;
  --font-ui:      'Inter Variable', system-ui, sans-serif;

  /* ---- Fluid type scale ---- */
  --fs-display-xl: clamp(3.25rem, 10.5vw, 8rem);   /* hero manifesto      */
  --fs-display-l:  clamp(2.5rem,  6.5vw, 5rem);    /* page titles         */
  --fs-display-m:  clamp(1.875rem,4vw, 3rem);      /* section headings    */
  --fs-display-s:  clamp(1.375rem,2.2vw, 1.875rem); /* card titles         */
  --fs-title:      clamp(1.125rem,1.4vw, 1.3125rem);
  --fs-prose:      clamp(1.0625rem, 0.9vw + 0.9rem, 1.1875rem); /* 17→19px */
  --fs-body:       1rem;
  --fs-small:      0.875rem;
  --fs-label:      0.6875rem;  /* 11px uppercase tracked */

  /* ---- Tracking ---- */
  --track-display: -0.03em;    /* tight, big type           */
  --track-label:    0.16em;    /* uppercase micro-labels    */
  --track-tight:    0.01em;

  /* ---- Leading ---- */
  --lh-display: 0.92;   /* display: very tight  */
  --lh-heading: 1.15;
  --lh-prose:   1.65;   /* reading comfort       */
  --lh-ui:      1.5;

  /* ---- Space (8px base) ---- */
  --sp-1: 0.5rem;  --sp-2: 0.75rem; --sp-3: 1rem;
  --sp-4: 1.5rem;  --sp-5: 2rem;     --sp-6: 3rem;
  --sp-7: 4rem;    --sp-8: 6rem;     --sp-9: 8rem;
  --sp-section: clamp(4rem, 9vw, 8.5rem);   /* vertical section rhythm */

  /* ---- Measure & frame ---- */
  --measure: 34rem;         /* ~68ch prose line length */
  --measure-wide: 68rem;
  --frame-w: 48px;          /* 36px ≤1024px, 20px ≤640px */
  --header-h: 76px;

  /* ---- Motion ---- */
  --ease-out:  cubic-bezier(0, 0, 0.28, 1);    /* from the reference */
  --ease-soft: cubic-bezier(0, 0, 0.618, 0.62);
  --t-micro: 150ms;   /* links, colour    */
  --t-base:  300ms;   /* layout, reveals  */
  --t-slow:  700ms;   /* page transitions */
}
```

**Usage discipline:** `--ember` and `--hearth` are accents, not decoration. If more than ~5% of any viewport is ember, it has been overused.

---

## 5. Typography System

Three self-hosted variable families. Installed via Fontsource so there are no third-party font requests and no layout shift.

```bash
bun add @fontsource-variable/fraunces @fontsource-variable/newsreader @fontsource-variable/inter
bunx astro add mdx sitemap        # MDX only if we embed components in posts
```

Import once in `BaseLayout.astro` frontmatter:

```astro
---
import '@fontsource-variable/fraunces';
import '@fontsource-variable/newsreader';
import '@fontsource-variable/inter';
---
```

### 5.1 Roles

| Role | Family | Treatment |
|---|---|---|
| **Manifesto** (hero only) | Fraunces | `opsz 144`, `wght 500`, **uppercase**, `--fs-display-xl`, `lh .92`, `track -.03em` |
| **Page title** | Fraunces | `opsz 90`, `wght 500`, **uppercase**, `--fs-display-l`, `lh .95` |
| **Section heading** | Fraunces | `opsz 60`, `wght 500`, **sentence case**, `--fs-display-m`, `lh 1.15` |
| **Card title** | Fraunces | `opsz 30`, `wght 600`, `--fs-display-s` |
| **Article title** | Fraunces | `opsz 90`, `wght 500`, sentence case, `--fs-display-l` |
| **Prose body** | Newsreader | `opsz` auto, `wght 400`, `--fs-prose`, `lh 1.65`, `measure 34rem` |
| **Pull quote** | Newsreader | italic, `1.35rem`, `--ink`, left hairline border in `--ember` |
| **Label / meta / nav / buttons** | Inter | `wght 500`, `--fs-label`, **uppercase**, `track .16em` |
| **Card excerpt** | Newsreader | `--fs-body`, `lh 1.6`, `--ink-soft`, clamped 3 lines |

### 5.2 Two-case rule

Uppercase is a *shouting device*, so it is rationed to exactly two places per page:
1. the hero manifesto, and
2. the page title.

Everything below the fold is sentence case. This is the difference between "editorial" and "shouting at the reader", and it is what makes the site feel calm.

### 5.3 Prose styling (`src/styles/prose.css`)

Hand-written, not a plugin. Targets: comfortable measure, generous rhythm, real character.

- `p` — `margin-block: 0 1.35em;` never more than two consecutive unstyled paragraphs get a gap (Pamela's voice uses short punchy paragraphs, which reads beautifully here).
- `h2` — `Fraunces`, `--fs-display-m`, `margin-block: 2.2em .6em`
- `h3` — `Fraunces`, `--fs-display-s`, `margin-block: 1.8em .4em`
- `a` — `color: var(--ink)`, `text-decoration: underline`, `text-decoration-color: rgb(34 30 26 / .3)`, `text-underline-offset: .18em`; on hover → `text-decoration-color: rgb(34 30 26 / .15)` (lift the line, don't change colour)
- `blockquote` — `border-left: 2px solid var(--ember)`, `padding-left: 1.5rem`, Newsreader italic
- `ul/ol` — `padding-left: 1.25rem`, markers in `--ink-muted`
- `hr` — 1px `--rule`, `width: 4rem` (short rules, not full-width — cheaper and more designed)
- `img` — `border-radius: 2px`, `margin-block: 2.5rem`, full measure
- `figure figcaption` — Inter `--fs-small`, `--ink-muted`
- `code` — Inter, `--paper-deep` background, 2px radius
- First paragraph after a heading: **no** indent (we don't indent paragraphs; spacing is the hierarchy).
- Drop cap on the opening paragraph of an article: `float: left; font-size: 3.4em; line-height: .82; padding-right: .08em;` in Fraunces `--ink`. Optional but it strongly signals "a book worth settling into with".

---

## 6. The Signature Moves

These seven are what make the site *feel* like something. Implement all of them.

### Move 1 — The Room Frame
A thick warm border framing the entire viewport, echoing the reference's 48px frame.

```css
body { background: var(--paper); }
body::after {
  content: '';
  position: fixed;
  inset: 0;
  border: var(--frame-w) solid var(--frame);
  pointer-events: none;
  z-index: 200;
}
.site { padding-inline: var(--frame-w); }
@media (max-width: 1024px) { :root { --frame-w: 36px; } }
@media (max-width:  640px) { :root { --frame-w: 20px; } }
```

**Why a fixed pseudo-element and not `border` on `<body>`:** a real border on `<body>` breaks `position: fixed` children and creates scroll artefacts. A fixed overlay with `pointer-events: none` lets full-bleed hero images run *under* the frame — so the photograph fills the window and the frame reads as the casing. That is the whole trick. Give the frame a z-index above all content (200) and below the mobile nav overlay (300).

### Move 2 — The Grain
A barely-there paper texture over everything, so the background is not a flat digital colour.

```css
.grain {
  position: fixed; inset: 0; z-index: 150;
  pointer-events: none; opacity: .035;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E");
}
```
One fixed element, ~300 bytes of CSS, no image request. Raise opacity to `.05` in night mode.

### Move 3 — The Hearth Glow
A soft radial warm bloom behind the hero and behind major section headings. It should be impossible to consciously notice — you should just feel the page is warmer in the middle.

```css
.hearth {
  position: absolute; inset-inline: 0; top: -10%;
  height: 70%; pointer-events: none; z-index: 0;
  background: radial-gradient(60% 100% at 50% 0%,
              color-mix(in srgb, var(--hearth) 55%, transparent) 0%, transparent 70%);
  filter: blur(12px);
}
```
Only on the home hero and page titles. Never on article pages — those stay flat and calm for reading.

### Move 4 — The Manifesto
The hero statement. The one moment the site is allowed to be loud.

```astro
<h1 class="manifesto">
  A quiet room full of<br />
  <em>half-finished thoughts</em><br />
  and the long way home.
</h1>
```
Fraunces, uppercase, `--fs-display-xl`, `lh .92`, `track -.03em`, `max-width: 18ch`. **One line (the `<em>`) breaks the uppercase** and is set lowercase italic — that single breath is what keeps the shout from becoming a wall. Fraunces italic + uppercase on the rest is a real optical pairing.

### Move 5 — The Lamplight Button
Verbatim behaviour from the reference, warmed.

```css
.btn {
  font-family: var(--font-ui);
  font-size: var(--fs-label);
  font-weight: 500;
  letter-spacing: var(--track-label);
  text-transform: uppercase;
  color: var(--ember);
  background: transparent;
  border: 1px solid var(--ember);
  border-radius: 2px;
  padding: .95em 2em;
  transition: color var(--t-micro) var(--ease-out),
              background-color var(--t-micro) var(--ease-out);
}
.btn:hover, .btn:focus-visible {
  color: var(--paper);
  background: var(--ember);
  border-color: var(--ember);
}
.btn--quiet { color: var(--ink); border-color: var(--rule); }
.btn--quiet:hover { color: var(--paper); background: var(--ink); border-color: var(--ink); }
```
`.btn--quiet` is the neutral variant, used for secondary actions. Never use a filled/solid ember button as the *default* state — the lamplight only turns on on interaction.

### Move 6 — The Shelf (library grid)
2 columns, generous `clamp(2rem, 4vw, 3.5rem)` gap, 4:5 covers, hover raises the cover slightly and warms it.

```css
.shelf { display: grid; gap: var(--sp-6) clamp(2rem, 4vw, 3.5rem);
         grid-template-columns: repeat(auto-fill, minmax(19rem, 1fr)); }
.card__cover { aspect-ratio: 4 / 5; overflow: hidden; border-radius: 2px; }
.card__cover img { width: 100%; height: 100%; object-fit: cover;
  transition: transform var(--t-slow) var(--ease-soft),
              filter var(--t-base) var(--ease-out); }
.card:hover .card__cover img { transform: scale(1.03); filter: saturate(1.05); }
.card__title { font-family: var(--font-display); transition: color var(--t-micro) var(--ease-out); }
.card:hover .card__title { color: var(--ember); }
.card__excerpt {
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3;
  overflow: hidden;
}
.card__more { font-family: var(--font-ui); font-size: var(--fs-label);
  letter-spacing: var(--track-label); text-transform: uppercase; }
.card__more::after { content: ' →'; }
```
The whole card is a single `<a>` (one tab stop, one link — better a11y than a nested "read more" link). Scale 1.03, never more.

### Move 7 — The Card Catalogue (archive)
A chronological, month-grouped index rendered like a library card catalogue: hairline rules, `Jun 3, 2026` in the margin, title as the link. This is the "find it in under 3 clicks" mechanism and it is also the most on-brand element on the site.

```
2026
─────────────
JUN 03   On Allen Ginsberg's Centenary
APR 14   The Menace of Mechanical Creation
FEB 04   An Interview – OffBeat.
```
Desktop: 2 columns (`grid-template-columns: 8rem 1fr`). Mobile: the date sits above the title. Group headers are Inter labels in `--ink-muted` with a full-width hairline beneath.

**Plus two supporting moves:**
- **The Scroll Whisper** — `SCROLL` in Inter label caps at the hero's bottom edge, with a 1px vertical line beneath it that runs a slow 2.4s loop (`transform: translateY(0 → 100%)`).
- **The Reading Progress Hairline** — a 2px `--ember` bar pinned under the header on article pages, `transform: scaleX(var(--progress))`. ~12 lines of JS, and it makes a long essay feel finite.

---

## 7. Content Architecture

### 7.1 Routes

```
/                      Home — manifesto, intro, recent writings, services teaser, newsletter
/library               THE LIBRARY — shelf grid + topic/year filters + card catalogue
/library/[...id]       Article page
/topics/[topic]        Topic archive (6 topics)
/journal               Optional second collection: shorter, more personal notes
/about                 Who Pamela is
/services              Professional services index
/services/[slug]       Individual service or coaching offer
/colophon              About this site and its design (on-brand, and useful)
/newsletter            Newsletter landing + subscribe form
/contact               Contact
/rss.xml               RSS feed of all writings
/404                   Not found
```

The `/services` and `/coaching` split is the "extendable" requirement. Because services are a **content collection, not pages**, adding a new offer is one Markdown file — no component, route, or nav edit required beyond the automatic listing.

### 7.2 Collections

`src/content.config.ts`:

```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const writings = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/writings' }),
  schema: ({ image }) => z.object({
    title: z.string(),
    description: z.string(),                 // 1–2 sentences; used as excerpt AND meta description
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    topic: z.enum(['craft', 'process', 'place', 'people', 'reading', 'notes'])
            .default('notes'),
    tags: z.array(z.string()).default([]),
    cover: image().optional(),               // src/content/writings/...
    coverAlt: z.string().optional(),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
    minutes: z.number().optional(),           // reading time; auto-computed if absent
  }),
});

const services = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/services' }),
  schema: z.object({
    title: z.string(),
    order: z.number().default(99),
    summary: z.string(),
    engagement: z.string().optional(),   // "Two-week intensive" / "Ongoing retainer"
    price: z.string().optional(),
    forWhom: z.array(z.string()).default([]),   // bullet list
    includes: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    eyebrow: z.string().optional(),       // small label above the page title
    showToc: z.boolean().default(false),
  }),
});

export const collections = { writings, services, pages };
```

**Design notes:**
- `[^_]*` lets files starting with `_` be excluded — useful for working drafts.
- `topic` is a closed `z.enum` so a typo fails the build rather than producing a dead filter.
- `draft` is filtered with `import.meta.env.PROD` so drafts are visible in dev but never published.
- `description` doubles as the card excerpt and the `<meta name="description">` — one field, two jobs, guaranteed consistency. First 160 characters are used for OG.

### 7.3 Writing file example

`src/content/writings/2026/the-wrong-way-opens-doors.md`

```markdown
---
title: The Wrong Way Opens Doors
description: Andy Warhol wrote a novel without ever sitting down to write it. He knew it was the wrong way. That was rather the point.
publishDate: 2026-08-19
topic: craft
tags: [warhol, process, discipline]
cover: ./covers/wrong-way.jpg
coverAlt: A tape recorder and a stack of notebooks on a wooden desk
featured: true
---

Body markdown, written as prose. No H1 — the layout supplies the title.
First paragraph gets the drop cap automatically.
```

### 7.4 Topic vocabulary

Six topics, chosen to cover a blogger/ghostwriter's output without becoming a taxonomy nightmare:

| Topic | Covers |
|---|---|
| `craft` | Writing technique, structure, editing, the mechanics |
| `process` | How work actually gets done — drafts, revisions, deadlines |
| `place` | Landscape, home, travel, environment |
| `people` | Portraits, interviews, collaborations |
| `reading` | Books, essays, and what she is reading |
| `notes` | Shorter, personal, in-the-moment |

---

## 8. Component Inventory

```
src/
├── components/
│   ├── BaseHead.astro        <head>, meta, OG, font preloads, theme no-flash script
│   ├── Grain.astro           the fixed noise overlay
│   ├── SiteHeader.astro      wordmark + nav + theme toggle + mobile disclosure
│   ├── SiteFooter.astro      stacked: tagline, nav columns, newsletter link, colophon
│   ├── Manifesto.astro       the hero statement + hearth glow + scroll whisper
│   ├── Button.astro          .btn / .btn--quiet, `href` or `type` prop
│   ├── WritingCard.astro     shelf card (cover, title, meta, excerpt, →)
│   ├── WritingGrid.astro     responsive shelf, `items` + `columns` props
│   ├── Catalogue.astro       month-grouped archive with hairlines
│   ├── TopicFilter.astro     topic + year filter bar (client script)
│   ├── Newsletter.astro      bordered signup panel
│   ├── ServiceCard.astro     service teaser
│   ├── PullQuote.astro       ember-ruled Newsreader italic quote
│   ├── Toc.astro             sticky in-article contents
│   ├── ProgressBar.astro     reading progress hairline
│   ├── ThemeToggle.astro     the lamp switch
│   └── Prose.astro           <article class="prose"> wrapper for MD
├── layouts/
│   ├── BaseLayout.astro      html shell, head, grain, skip-link, frame
│   ├── PageLayout.astro      + site header/footer, page title + hearth
│   └── WritingLayout.astro   + progress bar, drop cap, meta, prev/next, catalogue tail
├── lib/
│   ├── writings.ts           query + sort + group helpers
│   ├── readingTime.ts        word-count → minutes
│   ├── topics.ts             topic → { slug, label, description } map
│   └── site.ts               SITE constant: name, url, email, socials, nav
└── styles/
    ├── tokens.css
    ├── base.css              reset, selection, focus, scrollbar
    ├── prose.css
    └── utilities.css         .shell .stack .rule .label .visually-hidden
```

---

## 9. Motion

| Interaction | Change | Duration / easing |
|---|---|---|
| Link hover | underline colour `.3 → .15` alpha | 150ms `ease-out` |
| Button | fill ember / paper text | 150ms `ease-out` |
| Card hover | cover `scale(1.03)` + saturate | 700ms `ease-soft` |
| Nav link | ember underline wipes in from left (`scaleX` 0→1) | 300ms `ease-out` |
| Scroll reveal | `translateY(14px)` + fade, 60ms stagger | 700ms `ease-out` |
| View transition | crossfade, no slide | 300ms `ease-out` |
| Theme switch | colour transitions on bg/border only | 300ms `ease-out` |

**Rules:**
- Only animate `opacity`, `transform`, `background-color`, `color`, and `border-color`. Never `width`, `height`, `top`, or `left` — they jank.
- Everything above collapses under:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: .01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: .01ms !important;
      scroll-behavior: auto !important;
    }
  }
  ```
- Reveals use one shared `IntersectionObserver` in `BaseLayout` that adds `.is-visible`, with `data-reveal` + `style="--i: n"` for stagger. Written as a plain `<script>` in Astro — not hydrated, no framework.
- `ClientRouter` from `astro:transitions` gives the crossfade for free, but `data-astro-rerun` scripts need care; keep reveal setup in a `astro:page-load` listener so it re-binds after navigation.

---

## 10. Night Reading Mode

Fits the brief better than almost any other feature: a cozy room has a lamp, and a lamp can be dimmed. Default follows `prefers-color-scheme`; user choice persists in `localStorage`.

```css
:root[data-theme='night'] {
  --paper:        #17130F;   /* warm near-black — never #000 */
  --paper-deep:   #201A15;
  --paper-raised: #241E18;
  --frame:        #2E2620;
  --ink:          #EDE4D6;
  --ink-soft:     #BFB3A2;
  --ink-muted:    #8C8175;
  --rule:         #362D25;
  --ember:        #E0813F;   /* lifted for contrast on dark */
  --ember-bright: #EE9A5C;
  --ember-wash:   #2A1D15;
  --hearth:       #4A2E12;
  --pine:         #8FA596;
  --pine-wash:    #1E2620;
}
.grain { opacity: .05; }
```

Preventing flash-of-wrong-theme requires this **inline, in `<head>`, before any stylesheet**:
```html
<script is:inline>
  (() => {
    const t = localStorage.getItem('theme')
      ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day');
    document.documentElement.dataset.theme = t;
  })();
</script>
```

---

## 11. Step-by-Step Build Plan

Nine phases, each independently shippable. Phases 0–2 are the foundation; do not skip ahead.

### Phase 0 — Foundations
**Goal:** tokens, fonts, base styles, and the room frame visible on a blank page.

1. `bun remove astro` boilerplate: delete `src/components/Welcome.astro`, `src/assets/background.svg`, `src/assets/astro.svg`; rewrite `src/pages/index.astro`, `src/layouts/Layout.astro`. Keep `public/favicon.svg` (restyle it in Phase 7).
2. Install fonts + `bunx astro add sitemap`.
3. Create `src/styles/tokens.css`, `base.css`, `utilities.css` exactly as specced in §4–5.
4. Create `BaseLayout.astro`: `<!doctype html>`, inline theme script, font preloads (`fraunces`, `newsreader` only — preload what renders above the fold), `<Grain />`, skip-link, `<slot />`.
5. Wire `tokens.css` + `base.css` into `BaseLayout.astro` and render a placeholder `<h1>` in Fraunces uppercase.

**Done when:** `bun run dev` shows oat paper, a visible 48px warm frame, grain, and a large uppercase Fraunces heading that matches the reference's structural weight but reads warm instead of cold. No layout shift on load.

---

### Phase 1 — Layout Primitives
**Goal:** header, footer, prose system. Site is navigable.

1. `src/lib/site.ts` — `SITE = { name, tagline, url, email, socials[], nav[] }`. One source of truth for name/URL used by head, footer, and RSS.
2. `SiteHeader.astro` — wordmark (Fraunces, sentence case, links `/`) left; nav right in Inter labels; nav link underline is a `scaleX` wipe on hover; current page gets `aria-current="page"` + persistent ember underline. Sticky, with `backdrop-filter: blur(8px)` and a `transparent → var(--paper)` background after 8px scroll. **Mobile:** a `MENU` button toggling a full-screen panel (`z-index: 300`, above the frame) with `aria-expanded` and focus trapping.
3. `SiteFooter.astro` — stacked, per the reference: tagline in Fraunces; two nav columns; then a row of uppercase tracked meta links (COLOPHON, RSS, EMAIL); then `© 2026 Pamela Roy`. Hairline above. Generous top padding.
4. `prose.css` — the full system from §5.3 including drop cap.
5. `PageLayout.astro` — `<SiteHeader />`, `<main id="main">`, page title block (eyebrow label + title + optional description) with a `Hearth` bloom, `<SiteFooter />`.

**Done when:** header and footer are on every page, the mobile menu traps focus and closes on `Escape`, the frame contains all content, and the skip-link is the first focusable element.

---

### Phase 2 — Content Layer
**Goal:** the library is real. No UI yet.

1. Write `src/content.config.ts` per §7.2.
2. Write `src/lib/topics.ts`, `src/lib/readingTime.ts`, `src/lib/writings.ts`:
   ```ts
   // src/lib/writings.ts
   import { getCollection, type CollectionEntry } from 'astro:content';
   export type Writing = CollectionEntry<'writings'>;

   export const published = (e: { data: { draft?: boolean } }) =>
     import.meta.env.PROD ? e.data.draft !== true : true;

   export const byDateDesc = (a: Writing, b: Writing) =>
     b.data.publishDate.valueOf() - a.data.publishDate.valueOf();

   export async function allWritings(): Promise<Writing[]> {
     return (await getCollection('writings', published)).sort(byDateDesc);
   }
   ```
   Plus `groupByMonth(entries)` returning `{ key: 'June 2026', year, items }[]`, and `readingMinutes(body)`.
3. **Seed 8–10 real writings** spanning all six topics and at least three different years (so the catalogue grouping is visibly useful), plus one `draft: true`. Real content, real words — the design cannot be tuned against lorem ipsum.
4. Seed `src/content/services/ghostwriting.md` and `coaching.md`, `src/content/pages/about.md`, `colophon.md`.
5. `bunx astro sync` — must pass with zero schema errors.

**Done when:** `getCollection('writings')` returns typed, schema-valid entries with real dates; a deliberate schema violation fails the build.

---

### Phase 3 — The Home Page
**Goal:** the room, the manifesto, and a reason to keep reading.

1. `Manifesto.astro` — hearth glow, eyebrow label, `<h1>` manifesto (§6 Move 4), one supporting sentence in Newsreader, and the `Scroll` whisper. Optionally a full-bleed cover image behind it, at `opacity: .35` with a `--paper` gradient scrim so type stays at AA contrast.
2. Compose `src/pages/index.astro`:
   - **Hero** — `Manifesto`
   - **Intro** — eyebrow `WHO I AM`, Fraunces section heading, 2 short paragraphs in prose measure
   - **Recent writings** — eyebrow `LATEST`, `WritingGrid` with 3–4 cards
   - **Services teaser** — eyebrow `HOW I CAN HELP`, 2 × `ServiceCard`
   - **Newsletter** — `Newsletter.astro`
3. `WritingCard.astro` + `WritingGrid.astro` per §6 Move 6.
4. `Newsletter.astro` — bordered `--paper-deep` panel: Inter label, Fraunces heading, one sentence, email input + submit, and a small privacy line. Progressive enhancement: the form `action` points at the provider (Buttondown / MailerLite / ConvertKit) so it works with JS disabled; an optional client script upgrades it to in-page validation and a success state.
5. Scroll-reveal script in `BaseLayout` (`IntersectionObserver`, `.is-visible`, stagger via `--i`).

**Done when:** the hero communicates the mood in one glance; the manifesto line breaks exactly as designed at 1440/1024/375; cards are single tab stops; reveals respect reduced-motion; no console errors; Lighthouse ≥ 95 on all four categories with a real image hero.

---

### Phase 4 — The Library
**Goal:** the centrepiece. Any writing findable in under 3 clicks.

1. `src/pages/library/index.astro` — page title `THE LIBRARY`, a one-sentence description, `TopicFilter.astro`, then:
   - **The Shelf** — all writings as `WritingGrid` (2 cols desktop, 1 mobile)
   - **The Card Catalogue** — `Catalogue.astro`, the month-grouped archive, `id="catalogue"`, separated by a short `<hr>`
2. `TopicFilter.astro` — a row of Inter label buttons: `ALL`, then one per topic with counts, plus a `<select>` for year. Each card carries `data-topic` and `data-year`. A ~25-line client script toggles `hidden` and updates the URL via `history.replaceState` so a filtered view is shareable and survives back/forward. The **full unfiltered list stays in the HTML** — the filter is a progressive enhancement, not a requirement.
3. `src/pages/library/[...id].astro` — `getStaticPaths` from the collection; `render()` for `<Content />`; pass the whole entry as a prop.
4. `WritingLayout.astro` — title, meta row (date in `Mon D, YYYY` · reading time · topic), cover image, `<Content />` in a `--measure` column, optional `PullQuote`s, then:
   - **Prev / next** — large Fraunces links with `←` / `→`, which encourages the "read the next one" loop
   - **More like this** — 2–3 cards sharing `topic`
   - **Catalogue tail** — the 5 most recent siblings
5. `src/pages/topics/[topic].astro` — one page per topic: label, description from `topics.ts`, filtered grid, catalogue. Pre-generate all six.
6. `Prose.astro` wrapper, `Toc.astro` for pieces over ~1,500 words (from `render()`'s `headings`).
7. `ProgressBar.astro` — 2px ember bar under the header on articles.

**Done when:** a visitor can find any writing by topic, by year, or by scrolling the catalogue; filters are keyboard-operable and announce their state via `aria-pressed`; article pages have prev/next; reading progress works; the 3-click success criterion from §1 is met on a 12-item library.

---

### Phase 5 — Services & Coaching
**Goal:** the extensibility requirement, proven.

1. `src/pages/services/index.astro` — eyebrow `SERVICES`, page title, a short positioning paragraph, then all non-draft `services` entries in a stacked list. Each: `ServiceCard` with title (Fraunces), summary, `engagement` and `price` as Inter labels, and a `forWhom` bulleted list.
2. `src/pages/services/[slug].astro` — full detail page: `<Content />`, an `includes` checklist, and a `Button.astro` "Let's talk" to `mailto:` with a pre-filled subject.
3. `src/components/ServiceCard.astro` — reused on the home teaser and the services index, with an `items` array prop.
4. Nav entry for Services. `sitemap` picks up the new routes automatically.
5. **Navigation config:** define the main nav in `site.ts` but derive `/services` children from the collection, so adding `coaching.md` creates a live subpage with no code change.

**Done when:** a new `src/content/services/workshops.md` file produces a fully styled, listed, linked page with no component or route edits. That is the extensibility test.

---

### Phase 6 — Supporting Pages
**Goal:** a complete, credible site.

1. `/about` — renders `pages/about.md` through `prose.css`, with a portrait, a short "elsewhere" link row, and a pull quote.
2. `/newsletter` — a proper landing page: what it is, cadence, a sample of past issues as a list, and the signup form. A writer's list is her most valuable asset; give it a real page, not a footer widget.
3. `/contact` — short form (name, email, message) plus direct email and social links. Progressive enhancement, same as the newsletter.
4. `/colophon` — a short, slightly charming page about the site itself: what it's built with, the typefaces, and the extended metaphor. Uses the `pages` collection to prove that pattern.
5. `/journal` — only if second-collection content exists. Same layout as the library with a distinct eyebrow, so the two collections stay distinguishable.
6. `/404.astro` — on-brand: `YOU'VE WALKED PAST THE END OF THIS SHELF`, a `Button` home, and 3 suggestions from the library.
7. `/rss.xml.ts` — build-time endpoint, `@astrojs/rss`, latest 50 writings.

**Done when:** every nav item resolves, no page has a placeholder heading, and the 404 page is something worth screenshotting.

---

### Phase 7 — Polish Pass
**Goal:** the details that separate "good" from "this feels made."

1. **Empty states.** No writings in a topic, no search results — write a real sentence, never "No results found." The tone of voice is the last line of defence.
2. **Focus states.** `outline: 2px solid var(--ember); outline-offset: 3px` on `:focus-visible` everywhere. Never `outline: none` without a replacement.
3. **Selection.** `::selection { background: var(--ember-wash); color: var(--ink); }`.
4. **Long-word safety.** `overflow-wrap: break-word; hyphens: auto;` on display type so a 60px uppercase heading cannot blow out the frame.
5. **Print stylesheet.** Pamela will want to print her own essays. Force light tokens, hide header/footer/frame/progress, show the article URL in a footer, prevent orphan headings.
6. **Favicon.** Replace the Astro favicon: a single ember dot or a small lamp glyph on a `--paper` square, 32px, plus `favicon.svg`.
7. **Motion polish.** Reveal stagger tuned per section; `prefers-reduced-motion` verified with the OS setting on.
8. **Texture on images.** A very subtle `filter: saturate(.92) contrast(1.02)` on cover images unifies photography shot over many years. This single line does more for cohesion than any other.
9. **Microcopy audit.** Read every string on the site against the tone rules in §3.2. Delete every exclamation mark.

**Done when:** keyboard-only navigation covers the whole site; `prefers-reduced-motion` removes all animation; printing an article yields a clean page; images look like one body of work.

---

### Phase 8 — SEO, Feed & Social
**Goal:** shareable and discoverable.

1. Canonical URLs, `robots.txt`, `sitemap` (already added in Phase 0).
2. `BaseHead.astro` — title template `%s · Pamela Roy`, description, `og:` and `twitter:` tags, `og:image` (1200×630, generated per-article from the cover via `Image` + a sharp-free approach, or a static brand image as fallback), `article:published_time`, `article:author`, `twitter:card = summary_large_image`.
3. JSON-LD: `Person` on `/about`; `BlogPosting` on articles (headline, date, author, image, description); `BreadcrumbList` on nested routes.
4. RSS at `/rss.xml` + `<link rel="alternate" type="application/rss+xml">`.
5. Social image: one shared brand card plus a generated per-article card.
6. A `/sitemap-index.xml` sanity check after deploy.

**Done when:** every page has a unique title and description; a link pasted into Slack shows the right card; structured data validates.

---

### Phase 9 — Quality Gate & Launch
**Goal:** ship it.

1. **Performance.** Self-hosted subset fonts (`@fontsource` with `latin` subset), preload display + prose only, `astro:assets` for all images (AVIF/WebP, `width`/`height` always set to prevent CLS), lazy-load below-fold images, no render-blocking JS, no framework runtime. Targets: **LCP < 1.2s, CLS < 0.02, INP < 150ms, total JS < 15 KB gzipped.**
2. **Accessibility audit.** Full keyboard pass; axe DevTools clean; every image has meaningful `alt`; landmarks present; contrast ≥ 4.5:1 body / ≥ 3:1 display in **both** themes; `prefers-reduced-motion` respected.
3. **Cross-browser.** Safari (incl. iOS), Chrome, Firefox, Android. Verify the fixed frame doesn't produce a scrollbar or clipping artefact, and that `backdrop-filter` degrades gracefully.
4. **Responsive sweep.** 360, 390, 768, 1024, 1440, 1920. Check the manifesto at every stop; check the catalogue's two-column collapse; check frame width steps.
5. **Content QA.** Every link resolves. Frontmatter complete. No lorem ipsum. Dates, names, and prices correct. `draft: true` files absent from the production build.
6. **Deploy.** Static output to Cloudflare Pages / Netlify / Vercel. Set `trailingSlash: 'never'`, force HTTPS, and confirm 404 handling.
7. **Post-launch.** Submit to Google Search Console. Add an OG card generator to the build. Set up uptime monitoring.

---

## 12. Author Workflows

These are as important as the design. Pamela must be able to publish without touching code.

### Adding a new writing
1. Create `src/content/writings/2026/my-new-essay.md`.
2. Paste frontmatter from the template (§7.3) and write the body in Markdown. **No `#` heading** — the layout supplies the title.
3. `bun run dev`. The piece appears immediately, in the library grid, its topic page, the catalogue, and RSS. Filters need no updates.
4. If there is no cover yet, it still works — `WritingCard` falls back to a `--paper-deep` placeholder with the topic label. Ship the essay; add art later.
5. `bun run build` before pushing. Schema errors fail loudly.

### Adding a new service or coaching offer
1. Create `src/content/services/my-new-offer.md` with the `services` schema fields (`title`, `order`, `summary`, `engagement`, `price`, `forWhom`, `includes`).
2. It appears automatically on `/services` and the home teaser, and gets its own page at `/services/my-new-offer`. **Zero code changes.**

### Editing About / Colophon / any static page
Edit the Markdown in `src/content/pages/`. Layout and prose styling apply automatically.

### When the collection outgrows Markdown
The collections are loader-based, so swapping `glob` for a Notion/Directus/Sanity/CMS loader is a one-file change in `src/content.config.ts` and nothing else. The site stays static. Worth knowing before committing to Markdown-only forever.

---

## 13. Anti-Goals

Explicit things to **not** do, because each is the default that turns a personal site into a template:

- ❌ Autoplaying hero carousel.
- ❌ Inter/Roboto, or a display face with no warmth. No generic AI-default type.
- ❌ Pure `#000` or pure `#fff` anywhere. Warm the extremes.
- ❌ Drop shadows, glassmorphism, or gradient-filled buttons. Structure comes from hairlines and space.
- ❌ More than two type families. Ever.
- ❌ Uppercase below the page title. Rationed shouting, per §5.2.
- ❌ More than one accent colour per viewport.
- ❌ A cookie banner — no trackers, no cookies, no banner. Choose a privacy-respecting analytics tool or none.
- ❌ A chat widget, a newsletter pop-up, or a modal of any kind. This is a quiet room.
- ❌ A hero image carousel that pushes the manifesto below the fold on mobile.
- ❌ Emojis as icons. Use inline SVG at 1em, `currentColor`.
- ❌ A React/Vue/Svelte island for any of this. It is a static site.
- ❌ Tailwind. The design is typographic and bespoke; a token-based vanilla CSS layer is the right instrument.
- ❌ More than ~15 KB of client JS. Every kilobyte is a tax on the calm.

---

## 14. QA Checklist

**Design fidelity**
- [ ] Frame present at 48/36/20px and contains all content
- [ ] Grain visible on close inspection, invisible at a glance
- [ ] Exactly two uppercase elements per page maximum
- [ ] Ember on ≤ ~5% of any viewport
- [ ] No pure black or pure white in either theme
- [ ] Image `filter` cohesion applied across all covers

**Emotion**
- [ ] First screen reads as *a room*, not *a landing page*
- [ ] No exclamation marks anywhere
- [ ] Section headings are thoughts, not nouns
- [ ] One metaphor, used consistently
- [ ] Empty states are written in voice
- [ ] The 1-second, 5-second, and 3-click tests from §1 pass

**Library**
- [ ] Any writing reachable in ≤ 3 clicks
- [ ] Cards are single tab stops
- [ ] Filters work without JS (unfiltered list present in HTML)
- [ ] Filtered state is URL-shareable and back-button-safe
- [ ] Prev/next on every article
- [ ] RSS contains all published writings, no drafts

**Accessibility**
- [ ] Skip-link is first focusable element
- [ ] Mobile menu traps focus, closes on `Escape`, correct `aria-expanded`
- [ ] Visible `:focus-visible` on every interactive element
- [ ] Contrast ≥ 4.5:1 body in both themes
- [ ] Every image has meaningful `alt`
- [ ] `prefers-reduced-motion` disables all animation
- [ ] Heading levels descend without gaps

**Technical**
- [ ] LCP < 1.2s · CLS < 0.02 · INP < 150ms
- [ ] Client JS < 15 KB gzipped, no framework runtime
- [ ] No console errors on any page
- [ ] Canonical URLs + OG + JSON-LD valid
- [ ] `draft: true` absent from the production build
- [ ] Print stylesheet produces a clean article
- [ ] Frame causes no clipping at any viewport

---

## 15. Decisions & Tradeoffs

| Decision | Alternative | Why this way |
|---|---|---|
| Vanilla CSS + design tokens | Tailwind | The design is typographic and bespoke; tokens express it directly and ship less CSS. Utility classes would obscure the type scale, which is the whole design. |
| No UI framework | React islands for filters/menu | ~15 KB of framework to save ~15 KB of vanilla JS. A reader-focused static site shouldn't ship a runtime. |
| Astro content collections | A headless CMS | Markdown + Git gives version history, offline work, and zero vendor lock-in. The loader API makes a later CMS swap a one-file change. |
| Services as a collection | Hand-built pages | Directly satisfies the "extendable to services/coaching" requirement: a new offer is one file, no code. |
| Warm palette, not the reference's | The reference's blue-black + acid yellow | The reference is dramatic and cold. "Cozy mountain room" needs warmth. Structure is preserved; temperature is changed. |
| Serif prose (Newsreader) | The reference's sans body | Pamela is a *reader*. A library site has one job: make long-form a pleasure. |
| Static hero, not autoplay | The reference's autoplay carousel | Autoplay fights reading, burns CPU, and is an accessibility failure. Warmth comes from stillness here. |
| Night mode | Light only | A lamp is the core metaphor. Being able to dim the room is the most on-brand feature available. |
| Two-column grid | Masonry | Predictable, no layout shift, calm. Masonry implies a scrapbook, not a library. |
| Month-grouped catalogue | Tag-only taxonomy | Dates are the one axis a writer's archive is *always* coherent on. It also gives the fastest possible "find that one piece" path. |

---

## Appendix — Reference Token Provenance

Extracted from `jasonkenny.com` on 2026-09-25 for accuracy; recorded here so the reasoning survives and can be re-checked.

- Display `h1`: `font-family: ambroise-std; font-weight: 900; font-size: 110px; letter-spacing: -3px; line-height: .9em; text-transform: uppercase`
- Section `h2`: `font-family: ambroise-std; font-weight: 700; font-size: 25px; letter-spacing: .05em; text-transform: uppercase`
- Label `h3`: `font-family: din-condensed-web; font-weight: 300; font-size: 14px; letter-spacing: .05em; text-transform: uppercase`
- Frame: `.tweak-site-border-show .Site { border-width: 48px }` → 36px → 20px
- Button: `color: #ffea00; border: 1px solid #ffea00; background-color: transparent` → hover `background-color: #ffea00; color: #201d1d`
- Link hover: `transition: border-color .15s ease-out, color .15s ease-out`, `rgba(0,0,0,.3) → rgba(0,0,0,.15)`
- Easing: `cubic-bezier(0,0,.28,1)`, `cubic-bezier(0,0,0.618)`
- Palette: `#1a1f2d` (ink) · `#0b0d13` (deep) · `#ffea00` (accent) · `#f0523d` (accent 2) · `#ce8464` (clay, 50% alpha) · `#f6f6f6` / `#ebebeb` (surfaces)
- Micro-label: `text-transform: uppercase; letter-spacing: .5px; font-size: 11px; font-weight: 500`
