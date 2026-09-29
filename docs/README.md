# Developer Onboarding

Personal site + library for writer Pamela Roy. Static Astro site, no backend,
no framework runtime, no CMS — content is Markdown in the repo.

| Doc | What |
|---|---|
| [Setup & workflow](setup.md) | Toolchain, dev server, commands |
| [Architecture](architecture.md) | Routing, layouts, components, styles, libs |
| [Content guide](content.md) | Adding writings, services, issues, pages |
| [Quality gates](quality.md) | Checks, scripts, specs |
| [Deploy](deploy.md) | Build, hosting, launch blockers |

## The 60-second version

- **Stack:** Astro 7 (static), TypeScript strict, Bun 1.2.15, Node ≥ 22.12.
- **Content:** 4 Astro content collections (`writings`, `services`, `newsletter`, `pages`) under `src/content/`. One Markdown file = one page/issue/offer.
- **Single sources of truth:** `src/lib/site.ts` (identity, nav), `src/lib/*.ts` (all collection queries), `src/styles/tokens.css` (design tokens).
- **Rules that matter:** never query `getCollection` from a page/component (use `src/lib/`); never hardcode a URL the sitemap/RSS/canonical also emits (read `SITE`/helpers); output is fully static — no SSR, no API routes (RSS + OG images are prerendered endpoints).
- **URLs have no trailing slash** (`TRAILING_SLASH = false` in `src/lib/site.ts`, mirrored in `astro.config.mjs`). Don't introduce trailing-slash links.
- **Dates use UTC getters** (`src/lib/writings.ts`) — `z.coerce.date()` is UTC midnight; local getters shift the day west of Greenwich.
- **Design authority is `specs/`**, not the code. `base-design.md` is the spec; `verification-and-plan.md` and `phase-9.md` record what was built and what's still open.
