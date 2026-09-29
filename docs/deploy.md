# Deploy

Output is static (`dist/`, ~27 files). Any static host works; the repo is
currently wired for **Cloudflare Workers static assets** via `wrangler.jsonc`.
Full per-host notes live in `DEPLOY.md` — this is the summary.

## What `wrangler.jsonc` does

- Serves `./dist` as static assets, **no Worker script** (`main` intentionally
  unset — no SSR, no invocation, no billable request).
- `not_found_handling: "404-page"` → serves `dist/404.html` with a real 404
  status (not a soft 200).
- `html_handling: "drop-trailing-slash"` → serves `/about` extensionless.
  Default `auto-trailing-slash` would 308 `/about` → `/about/` and break every
  canonical/sitemap/RSS URL. Do not change without changing `TRAILING_SLASH`.

The comments in `wrangler.jsonc` explain the failure mode it prevents
(wrangler auto-adding `@astrojs/cloudflare` and failing in miniflare
prerender). If a stale `wrangler.toml` appears, delete it. Never set a Pages
"deploy command" to `npx wrangler deploy` — leave it empty (see `DEPLOY.md`).

## Other hosts (`DEPLOY.md`)

- **Pages:** build `bun run build`, output `dist`, HTTPS + 404 automatic.
- **Netlify:** needs a `/library/* → /library/:splat 200` rewrite or every
  article 404s (extensionless URLs, no such directories on disk).
- **Vercel:** `cleanUrls` (default on) handles extensionless serving.

## Launch blockers — do not deploy with these

`src/lib/site.ts` still holds **placeholders**: `url`, `email`, empty
`socials`. They're baked into canonicals, feed links, sitemap, cards, JSON-LD.
`bun run check:content` reports them as a blocker on every run. Real domain +
address + profiles must land first, then verify with `check:live` against the
real origin (local `serve:dist` proves nothing about host 404/redirect
behaviour):

```sh
bun run build && bun run serve:dist &
curl -sI http://127.0.0.1:4322/nope  | head -1   # want HTTP/1.1 404
curl -sI http://127.0.0.1:4322/about | head -1   # want HTTP/1.1 200
```

Also outstanding per `specs/phase-9.md`: device testing (Firefox, iOS
Safari, Android Chrome) and post-launch items needing Pamela's accounts
(newsletter provider, analytics, domain/DNS).
