#!/usr/bin/env bash
# Every gate the project has, in the order that fails fastest.
#
# The three browser gates need the dev server up: `astro dev --background`.
set -euo pipefail

# Run a gate once, show its summary, and only mine the full output for detail
# if it failed.
#
# Two things this exists to prevent. Running a gate twice — once piped to `tail`
# for the summary and once for the diagnosis — doubles the cost of the slow ones
# for no benefit. And `gate | tail -2` cannot fail the script at all, because
# the exit status of a pipeline is that of its *last* command: a behaviour suite
# that reported 117/119 would have let this file exit 0 and print a green run.
run_gate() {
  local out; out=$(mktemp)
  if "$@" >"$out" 2>&1; then
    tail -1 "$out" | sed 's/^/  /'
    rm -f "$out"
  else
    echo "  FAILED"
    grep -E '^FAIL|FAIL |Error|error' "$out" | head -12 | sed 's/^/  /'
    rm -f "$out"
    return 1
  fi
}

echo "── types ──────────────────────────────────────────────"
bun run check:types 2>&1 | tail -4

echo; echo "── build ─────────────────────────────────────────────"
bun run build 2>&1 | grep -E "page\(s\) built|warn|error" || true

# Checked here, against the build, because this is the only place the claim is
# true: the dev server deliberately shows drafts so they can be written, so a
# dev-time assertion would be asserting the opposite of the intent.
echo; echo "── drafts stay out of production ────────────────────"
drafts=$(grep -rl 'draft: true' src/content/writings src/content/services 2>/dev/null | xargs -n1 basename 2>/dev/null | sed 's/\.md$//' || true)
leaked=0
for slug in $drafts; do
  if grep -rq "$slug" dist/ 2>/dev/null; then
    printf '  LEAKED  %s is in dist/\n' "$slug"
    leaked=1
  fi
done
if [ "$leaked" -eq 0 ]; then
  printf '  %-42s %s\n' "no draft in the build" "${drafts:-none to check}"
else
  exit 1
fi

# The feed's URLs and the sitemap's have to be the site's URLs, and the site is
# served without trailing slashes. @astrojs/rss defaults to adding one.
echo; echo "── feed and sitemap agree with the site ────────────"
if grep -qE '<link>https://[^<]+/library/[0-9]{4}/[^<]+/</link>' dist/rss.xml; then
  echo "  FAILED   the feed has trailing-slash links; the site does not"
  exit 1
fi
printf '  %-42s ok\n' "no trailing-slash links in the feed"
if ! grep -q '/colophon' dist/sitemap-0.xml || ! grep -q '/contact' dist/sitemap-0.xml; then
  echo "  FAILED   the sitemap is missing a supporting page"
  exit 1
fi
printf '  %-42s ok\n' "supporting pages in the sitemap"

# The favicon is generated from a palette in make-favicon.py, so it can go stale
# when a token changes without anyone re-running it. Cheap to check, and a stale
# favicon is the sort of thing that survives for years.
echo; echo "── the favicon is not stale ─────────────────────────"
if [ "${SKIP_FAVICON:-0}" != "1" ] && command -v python3 >/dev/null; then
  before=$(cksum public/favicon.svg public/favicon.ico | cksum)
  python3 scripts/make-favicon.py >/dev/null
  after=$(cksum public/favicon.svg public/favicon.ico | cksum)
  if [ "$before" != "$after" ]; then
    echo "  UPDATED  the favicon was out of date and has been regenerated"
  else
    printf '  %-42s %s\n' "favicon matches its source" "ok"
  fi
else
  printf '  %-42s %s\n' "skipped" "SKIP_FAVICON=1 or no python3"
fi

# Everything a crawler reads: titles, descriptions, canonicals, the social card
# each page points at, the feed link, and the structured data. All against the
# build, because that is the only place the claims are true.
#
# Each gate runs once into a file; run_gate is defined at the top.
echo; echo "── what a crawler will see ─────────────────────────"
run_gate bun run scripts/check-seo.ts || exit 1

# The cards are drawn from a width estimate rather than a font engine, so this
# measures the pixels. Catches a headline that overflowed or got ellipsised.
echo; echo "── the social cards are readable ───────────────────"
if command -v python3 >/dev/null; then
  run_gate python3 scripts/check-cards.py || exit 1
else
  printf '  %-42s %s\n' "skipped" "no python3"
fi

echo; echo "── hero fits at every viewport ───────────────────────"
bun run check:hero | tail -1

# --- Phase 9 gates, all against the build -----------------------------------
#
# These read `dist/` rather than the dev server, because the claims they make
# are about what would be deployed. The dev server deliberately shows drafts, is
# unminified, and answers 200 for paths a static host would 404.

echo; echo "── every link resolves, no placeholder copy ───────────"
run_gate bun run check:content || exit 1

echo; echo "── fonts: five faces, latin only ──────────────────────"
run_gate bun run check:fonts || exit 1

echo; echo "── behaviour, no-JS, and a11y ────────────────────────"
# Through run_gate, so a failing suite actually fails the run — see the note
# on the function definition for why piping it to `tail` would not.
run_gate bun run scripts/behaviour.ts || exit 1

echo; echo "── frame steps, catalogue collapse, hero fit ───────────"
run_gate bun run scripts/check-responsive.ts || exit 1

echo; echo "── the lamp switch ────────────────────────────────────"
run_gate bun run check:lamp || exit 1

# The crossfade, and the cost of it: with the router on, every page is
# assembled at runtime, so this checks that a crossfaded page still arrives and
# still works — the room, the lamp, the menu, the filter, the back button.
echo; echo "── the crossfade between pages ───────────────────────"
run_gate bun run check:transitions || exit 1

echo; echo "── axe, every route, both themes ─────────────────────"
# The slowest gate in the suite by a wide margin — 54 page loads plus a DOM walk
# each — so SKIP_AXE=1 is honoured for the inner loop. It is on by default,
# because a gate that is off by default is a gate that is off.
if [ "${SKIP_AXE:-0}" = "1" ]; then
  printf '  %-42s %s\n' "skipped" "SKIP_AXE=1"
else
  run_gate bun run check:a11y || exit 1
fi

echo; echo "── the image pipeline, with fixtures ──────────────────"
# Builds three times and fabricates two images, so it is opt-out rather than
# opt-in: CHECK:IMAGES=1 skips it when the inner loop needs to be quick.
if [ "${SKIP_IMAGES:-0}" = "1" ]; then
  printf '  %-42s %s\n' "skipped" "SKIP_IMAGES=1"
else
  run_gate bun run check:images || exit 1
fi

echo; echo "── performance budget ─────────────────────────────────"
# Measured over a static server on dist/. The LCP and INP figures are lab
# numbers on loopback and are useful as a regression tripwire, not as a claim
# about field performance — see the note at the top of check-perf.ts.
if [ "${SKIP_PERF:-0}" = "1" ]; then
  printf '  %-42s %s\n' "skipped" "SKIP_PERF=1"
else
  run_gate bun run check:perf || exit 1
fi

echo; echo "── visual: overflow, the frame, console ───────────────"
for route in / /library /library/2026/the-middle-of-the-book /topics/place \
            /services /services/ghostwriting \
            /about /colophon /contact /newsletter; do
	printf '  %-42s ' "$route"
	bun run check:visual --url "$route" | tail -1
done

# The 404 page gets the same sweep. It answers 404, and Chrome logs the status
# it asked for, so the harness is told to expect that one line.
printf '  %-42s ' "/404"
bun run check:visual --url /404 --expect-404 | tail -1
