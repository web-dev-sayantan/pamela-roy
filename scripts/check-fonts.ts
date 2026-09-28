/**
 * Fonts: the site ships five faces, all latin, and no more.
 *
 *   bun run scripts/check-fonts.ts
 *
 * This gate exists because of a specific regression that is invisible in a
 * screenshot and invisible in `du dist`: a font is only downloaded if a glyph
 * matches its `unicode-range`, so shipping Cyrillic and Vietnamese subsets
 * costs nothing at runtime while sitting in the build as dead weight. Nothing
 * in the build output complains. The only way to notice is to count.
 *
 * The count is the assertion. Five faces: Fraunces roman and italic, Newsreader
 * roman and italic, Inter roman. See src/styles/fonts.css for why they are
 * declared by hand — `@fontsource-variable` has no `latin.css` entry point, so
 * taking one subset means declaring the faces.
 *
 * Runs against `dist/`, because the claim is about what would be deployed and
 * the dev server serves unbundled CSS from source.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const ASSETS = join(DIST, '_astro');

const results: string[] = [];
const check = (name: string, ok: boolean, detail = '') =>
	results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);

/* --- read the build ------------------------------------------------------- */

let cssFiles: string[] = [];
let fontFiles: string[] = [];

try {
	cssFiles = readdirSync(ASSETS).filter((f) => f.endsWith('.css'));
	fontFiles = readdirSync(ASSETS).filter((f) => f.endsWith('.woff2'));
} catch {
	console.error(`  no ${ASSETS} — run the build first`);
	process.exit(1);
}

const css = cssFiles.map((f) => readFileSync(join(ASSETS, f), 'utf8')).join('\n');
const allHtml = readdirSync(DIST, { recursive: true })
	.filter((f) => String(f).endsWith('.html'))
	.map((f) => readFileSync(join(DIST, String(f)), 'utf8'))
	.join('\n');

/* --- 1. exactly five faces ------------------------------------------------ */

const faces = css.match(/@font-face/g)?.length ?? 0;
check(
	'five @font-face blocks, one per family and style',
	faces === 5,
	`${faces} found`,
);

/* --- 2. every shipped font is the latin one ------------------------------- */

const nonLatin = fontFiles.filter((f) => !/-latin-/.test(f));
check(
	'every shipped woff2 is a latin subset',
	nonLatin.length === 0,
	nonLatin.length ? `also shipping: ${nonLatin.join(', ')}` : `${fontFiles.length} files, all latin`,
);

check(
	'no woff2 at all is shipped beyond the five',
	fontFiles.length === 5,
	`${fontFiles.length} files in dist/_astro`,
);

/* --- 3. no dead unicode ranges survived ----------------------------------- */

/*
 * The ranges that must not appear. Each names a subset the site has no content
 * in, and each is a @font-face block that a browser will parse, keep in memory
 * and never use.
 */
const DEAD_SUBSETS = ['cyrillic', 'greek', 'vietnamese'];

// Checked against the ranges actually present rather than against the whole
// stylesheet, because a comment mentioning "greek" would otherwise fail this.
const declaredRanges = [...css.matchAll(/unicode-range:\s*([^;}]+)/g)].map((m) => m[1]);
const deadRanges = declaredRanges.filter((r) =>
	// U+0301 and U+0400-045F are the ranges that distinguish a Cyrillic block;
	// U+0370-03FF Greek; U+0102-0103 Vietnamese.
	/U\+0[34][0-9A-F]{2}|U\+01[0-9A-F]{2}-U\+01[0-9A-F]{2}/i.test(r) &&
	// The latin block legitimately contains U+0131, U+0152-0153 and U+0329, and
	// U+0304/U+0308, so a naive prefix test is wrong. The check is on the
	// distinctive ranges only.
	/U\+0400-045F|U\+0460-052F|U\+0370-03FF|U\+1F00-1FFF|U\+0102-0103/.test(r),
);

check(
	'no cyrillic, greek or vietnamese unicode-range is declared',
	deadRanges.length === 0,
	deadRanges.length ? `${deadRanges.length} dead ranges` : `${declaredRanges.length} range(s), all latin`,
);

/* --- 4. every preload resolves to a file that exists ---------------------- */

const preloads = [...allHtml.matchAll(/<link[^>]+rel="preload"[^>]+href="([^"]+\.woff2)"/g)].map(
	(m) => m[1],
);
const preloadNames = [...new Set(preloads.map((href) => href.split('/').pop()!))];
const missing = preloadNames.filter((n) => !fontFiles.includes(n));

check(
	'every preloaded font exists in the build',
	missing.length === 0,
	missing.length ? `preloading ${missing.join(', ')} which is not there` : `${preloadNames.length} preloaded`,
);

/*
 * A preload that 404s is worse than no preload: it spends a request, delays
 * first paint, and logs an error. So this also asserts the reverse direction —
 * that the two display faces the spec asks to preload are actually preloaded.
 */
check(
	'the two faces that render above the fold are preloaded',
	['fraunces-latin-standard-normal', 'newsreader-latin-standard-normal'].every((n) =>
		preloadNames.some((p) => p.startsWith(n)),
	),
	preloadNames.map((p) => p.split('.')[0]).join(', '),
);

/* --- 5. the byte budget --------------------------------------------------- */

const fontBytes = fontFiles.reduce((sum, f) => sum + statSync(join(ASSETS, f)).size, 0);
const kb = fontBytes / 1024;

/*
 * The budget is set at 600 KB, which is the *latin-only* figure plus headroom
 * for a future fourth family — not a round number chosen to be passable. The
 * full-subset build measured 1031.5 KB, so this gate fails loudly if somebody
 * reverts the import in BaseLayout.astro, which is the regression it exists to
 * catch.
 */
check('font payload under 600 KB', kb < 600, `${kb.toFixed(1)} KB of woff2`);

/* --- 6. self-hosted, and nothing preconnects to a font CDN --------------- */

check(
	'no font is loaded from a third party',
	!/fonts\.(googleapis|gstatic)\.com|use\.typekit|fontawesome/i.test(allHtml + css),
	'self-hosted from node_modules via Vite',
);

/* --- 7. the variable axes the design relies on are present ---------------- */

/*
 * The quotes are optional because Vite's minifier drops them: the build emits
 * `font-family:Fraunces Variable`, not `font-family:'Fraunces Variable'`. Both
 * forms are legal CSS, and a gate written against the source rather than the
 * artefact fails on a build that is perfectly correct.
 */
const declaresVariable = (family: string, range: string) =>
	new RegExp(
		`@font-face\\{[^}]*font-family: ?['"]?${family}['"]?[^}]*font-weight: ?${range}`,
	).test(css);

check(
	'Fraunces and Newsreader are variable (a weight range, not two files)',
	declaresVariable('Fraunces Variable', '100 900') &&
		declaresVariable('Newsreader Variable', '200 800'),
	'display and prose both need opsz for font-optical-sizing: auto',
);

/* --- 8. every family the tokens name is actually declared ---------------- */

const tokens = readFileSync('src/styles/tokens.css', 'utf8');
const wanted = [...tokens.matchAll(/--font-(?:display|prose|ui):\s*'([^']+)'/g)].map((m) => m[1]);
const declared = new Set(
	[...css.matchAll(/font-family: ?['"]?([A-Za-z][A-Za-z0-9 ]*?)['"]?[;}]/g)].map((m) => m[1].trim()),
);
const undeclared = wanted.filter((family) => !declared.has(family));

check(
	'every family named in --font-* is declared',
	undeclared.length === 0,
	undeclared.length ? `missing: ${undeclared.join(', ')}` : `${wanted.length} families, all declared`,
);

/* --- report --------------------------------------------------------------- */

for (const line of results) console.log(`  ${line}`);
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`fonts: ${results.length - failed}/${results.length}`);

if (failed) {
	console.log(`  (the full-subset build measured 1031.5 KB — if this gate fails, check the imports in BaseLayout.astro)`);
}

process.exit(failed ? 1 : 0);
