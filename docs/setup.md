# Setup & Workflow

## Prerequisites

- **Bun 1.2.15 exactly** (`packageManager` in `package.json`). The deploy image
  runs 1.2.15 and installs with `--frozen-lockfile`. A newer local Bun writes
  `lockfileVersion: 2`, which 1.2.15 can't parse → hard build failure.
  If you must change it, `bun upgrade --to <v>` + reinstall in one commit.
- **Node ≥ 22.12** (engines field).
- **Python 3** for two gates (`check-manifesto.py`, `check-cards.py`,
  `make-favicon.py`). `fonttools` + `brotli` needed for the manifesto check:
  `python3 -m pip install fonttools brotli`.

## Install & run

```sh
bun install
astro dev --background   # per AGENTS.md — background mode, not bun dev
astro dev status         # check it
astro dev logs           # tail it
astro dev stop           # stop it
```

Dev server: `http://localhost:4321`. Drafts are **visible in dev, excluded
from production builds** (single `published()` predicate in
`src/lib/writings.ts` — don't reimplement it).

## Everyday commands

| Command | What |
|---|---|
| `bun run build` | Production build → `dist/` (~27 static files) |
| `bun run preview` / `bun run serve:dist` | Preview/serve the built output |
| `bun run check:types` | `astro check` (strict TS) |
| `bun run check:content` | Placeholder/link/content QA — run before any deploy |
| `./scripts/check.sh` | **Full gate**: types → build → drafts → feed/sitemap → favicon → all `check:*` |
| `bun run check:<name>` | Individual gates (see [Quality gates](quality.md)) |
| `bun run favicon` | Regenerate favicons from the token palette after token changes |

VS Code: Astro extension recommended (`.vscode/`), launch config runs the
dev server. That's the only editor setup.
