# =============================================================================
# Deploy preparation.
#
# The three hosts in §11 P9.6, and the two settings that are easy to forget
# because the build already does them.
#
# Nothing here deploys anything, and nothing here needs a credential. It is the
# configuration that makes `bun run build` output servable correctly, so the
# first deploy is a question of pointing a host at `dist/` rather than a round
# of debugging redirects.
#
# BEFORE ANY OF THIS IS USED: `src/lib/site.ts` still holds placeholder values
# for the domain, the email address and the social profiles. Those placeholders
# are baked into every canonical URL, every feed link, every sitemap entry and
# every social card in the build. Deploying with them in place publishes wrong
# absolute URLs across the whole site, and the result looks like a working site
# to a crawler and a broken one to a reader who clicks a link in a card.
# `bun run check:content` reports them as a launch blocker on every run.
# =============================================================================

# Cloudflare Pages
#
# Build command and output directory are set in the Cloudflare dashboard, not
# here — this file only carries what the dashboard has no field for. The
# framework preset detects Astro and sets the build command itself.
#
# Two things to set in the dashboard:
#   Build command           bun run build
#   Build output directory  dist
#
# Cloudflare Pages serves 404.html for an unmatched path automatically and
# forces HTTPS on its own edge, so neither of §9.6's requirements needs saying
# here. The 404 *status* is correct as long as the file is named 404.html, which
# scripts/check-live.ts verifies against a live origin.

# Netlify
#
# Netlify also picks up 404.html by convention and redirects it to /404 with a
# real 404 status. It rewrites every asset URL to include a content hash, which
# Astro has already done — harmless, not a conflict.
#
# [build]
#   command = "bun run build"
#   publish = "dist"
#
# [[redirects]]
#   from = "/library/*"
#   to = "/library/:splat"
#   status = 200
#
# The redirect above is the one that matters. Netlify's default is to serve
# /library/2026/the-middle-of-the-book as a 404 because there is no directory
# of that name — only a file called 2026/the-middle-of-the-book.html inside
# dist/library. Astro's `trailingSlash: 'never'` means the site links to the
# extensionless form, so the host has to be told to resolve it. Drop this block
# in and /library works; leave it out and every article 404s in production while
# working perfectly in dev.

# Vercel
#
# `cleanUrls` is the setting that matters, and it is on by default. It makes
# Vercel serve dist/about/index.html at /about, which is what trailingSlash
# 'never' expects. A `vercel.json` is only needed to pin the output directory,
# and only if the project is not detected as Astro:
#
# { "cleanUrls": true, "outputDirectory": "dist" }

# ---------------------------------------------------------------- the 404 page
#
# §9.6 asks for 404 handling to be confirmed. It is: dist/404.html is a real
# page, it is noindex, and the static server in scripts/lib/serve.ts serves it
# with a 404 status rather than a soft 200 — which is the single most common
# static-host mistake, and the one that makes every broken link look healthy to
# a crawler. scripts/check-live.ts asserts the status against a live origin,
# because a local file server proving it says nothing about the real host.
#
# Verified by: bun run scripts/lib/serve.ts, then
#   curl -sI http://127.0.0.1:4322/nope | head -1   # HTTP/1.1 404
#   curl -sI http://127.0.0.1:4322/about | head -1  # HTTP/1.1 200
