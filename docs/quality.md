# Quality Gates

`./scripts/check.sh` runs everything, fastest-failing first; it needs the dev
server up (`astro dev --background`). Individual gates via `bun run check:*`.

## Gate inventory (`package.json` scripts → `scripts/`)

| Command | Script | What it asserts |
|---|---|---|
| `check:types` | `astro check` | Strict TS |
| (+ build) | `astro build` | 13+ routes build; `check.sh` also greps `dist/` for leaked `draft: true` slugs and trailing-slash feed links |
| `check:hero` | `check-manifesto.py` | Hero copy fits the frame at every viewport (real font engine; needs `fonttools`) |
| `check:visual` | `shoot.ts` | Screenshots 11 routes × 14 viewports × 2 themes |
| `check:behaviour` | `behaviour.ts` | 119 checks: skip link first, menu focus trap/Escape, reduced-motion, no-JS |
| `check:seo` | `check-seo.ts` | Meta/canonical/OG, heading order, landmarks |
| `check:cards` | `check-cards.py` | Social cards resolve per piece (caught a wrong cover path + missing AVIF) |
| `check:live` | `check-live.ts` | Against a live origin: 404 status (not soft-200), extensionless URLs |
| `check:print` | `shoot-print.ts` | Print stylesheet + footer URL |
| `check:fonts` | `check-fonts.ts` | Exactly 5 latin `@font-face`, no dead subsets |
| `check:lamp` | `check-lamp.ts` | ThemeToggle 3-state, persistence, no-flash (22 checks) |
| `check:transitions` | `check-transitions.ts` | Crossfade, no slide; scripts survive swaps |
| `check:a11y` | `check-a11y.ts` | axe 4.13, 27 routes × 2 themes, zero violations + hand suite |
| `check:content` | `check-content.ts` | 665 links resolve; **flags `SITE` placeholders as launch blockers** |
| `check:perf` | `check-perf.ts` | LCP < 1.2s, CLS < 0.02, INP < 150ms, client JS < 15KB gz, no long tasks, no framework runtime. Baseline in `perf-baseline.json` (15% tolerance above 300ms floor, 2× below). `check:images:baseline` to re-record |
| `check:images` | `check-images.ts` | Cover paths, AVIF output (temp fixtures, removed after run) |
| `check:responsive` | `check-responsive.ts` | Breakpoint claims incl. 48/36/20px frame, no horizontal scroll |

`scripts/lib/` holds shared harnesses (`cdp.ts`, `serve.ts`).
`scripts/audit-case.ts` is a one-off audit helper, not a gate.

## Conventions the gates protect

- **Contrast:** body text ≥ 4.5:1 in both themes (`--ink-muted`/`--ember`
  were nudged in OKLCH for this — see `tokens.css` comment).
- **Reduced motion** must reach the cascade; reveal script shows everything at
  once. No-JS must leave content visible (hidden state scoped to `.js`).
- **View transitions:** write every script against `astro:page-load` /
  `astro:before-swap`; incoming documents arrive pre-revealed so the snapshot
  isn't empty.
- **UTC dates** everywhere user-facing (`shortDate`/`monthYear`); `toISOString`
  for machines.

## Specs (`specs/`) — read before building

- `vision.md` — what the site is (cozy mountain-room library; jasonkenny.com
  as vibe reference).
- `base-design.md` — **the design authority** (§§2, 4–11, 13–14 + phases).
- `verification-and-plan.md` — audit of phases 0–8 against the spec.
- `phase-9.md` — launch gate results: perf/a11y/responsive/content done,
  cross-browser partly (WebKit engine only — Firefox/mobile Safari unverified),
  deploy prepared but blocked, post-launch not started.

Open deviations live in `verification-and-plan.md` §§3.2/3.3/3.5 + `phase-9.md`
§6 (two factual corrections, three design calls that are Pamela's). Don't
"fix" spec deviations unilaterally — surface them.
