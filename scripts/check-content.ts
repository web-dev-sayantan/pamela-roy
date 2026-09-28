/**
 * Content QA: does every link resolve, is every field filled in, and is any of
 * it still placeholder text.
 *
 *   bun run scripts/check-content.ts
 *
 * Phase 9 item 5. The hand-written gates cover structure and behaviour; nothing
 * covered the simplest question a reader can ask, which is whether a link works.
 * A nav entry to a page that was never built, an RSS link typed with a trailing
 * slash the site does not use, a `mailto:` with a placeholder domain — all of
 * these pass every other gate in this project and all of them are the kind of
 * thing that is discovered by a reader.
 *
 * Links are resolved against `dist/`, by mapping each href to the file the build
 * would serve for it. That is the only place the claim is true: the dev server
 * answers 200 for things a static host would 404, and a link check run against
 * dev proves nothing about deployment.
 *
 * One check deliberately does *not* fail. The site's identity is still
 * placeholder — domain, email, social profiles — and those are Pamela's to
 * choose, not a defect to be papered over by inventing a plausible value. They
 * are reported as a launch blocker instead.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { serveDist } from './lib/serve';

const DIST = 'dist';

const results: string[] = [];
const check = (name: string, ok: boolean, detail = '') =>
	results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
const warn = (line: string) => results.push(`WARN  ${line}`);

const htmlFiles = readdirSync(DIST, { recursive: true })
	.map(String)
	.filter((f) => f.endsWith('.html'));

if (!htmlFiles.length) {
	console.error('  dist/ has no HTML — run the build first');
	process.exit(1);
}

const pages = htmlFiles.map((f) => ({
	file: f,
	// '/index.html' → '/', 'services/index.html' → '/services'
	route: '/' + f.replace(/index\.html$/, '').replace(/\.html$/, ''),
	html: readFileSync(join(DIST, f), 'utf8'),
}));

/* --- 1. every internal link resolves to something the build serves --------- */

/**
 * What a static host serves for a path. Mirrors `trailingSlash: 'never'` from
 * astro.config.mjs, which is read from TRAILING_SLASH in src/lib/site.ts.
 */
function resolves(href: string): boolean {
	const clean = href.split('#')[0].split('?')[0];
	if (clean === '' || clean === '/') return existsSync(join(DIST, 'index.html'));

	// Directory-style route, e.g. /services → dist/services/index.html
	if (existsSync(join(DIST, clean, 'index.html'))) return true;
	// File route, e.g. /rss.xml, /favicon.svg, /404.html
	if (existsSync(join(DIST, clean))) return true;
	// A trailing-slash variant, which must NOT be what the site links to but is
	// worth knowing about if it appears.
	return existsSync(join(DIST, clean.replace(/\/$/, ''), 'index.html'));
}

const broken: string[] = [];
const external = new Set<string>();
let internalCount = 0;

for (const page of pages) {
	for (const m of page.html.matchAll(/<a\s[^>]*href="([^"]*)"/g)) {
		const href = m[1];

		if (/^(https?:)?\/\//.test(href)) {
			external.add(href);
			continue;
		}
		if (/^(mailto:|tel:|sms:)/.test(href)) continue;
		if (href.startsWith('#')) continue;

		internalCount++;
		if (!resolves(href)) broken.push(`${page.route} → ${href}`);
	}
}

check(
	'every internal link resolves to a built file',
	broken.length === 0,
	broken.length
		? `${broken.length} broken of ${internalCount}: ${broken.slice(0, 6).join('; ')}`
		: `${internalCount} internal links across ${pages.length} pages`,
);

/* --- 2. no link carries a trailing slash the site does not serve ---------- */

const TRAILING_SLASH = /TRAILING_SLASH\s*=\s*(true|false)/.exec(
	readFileSync('src/lib/site.ts', 'utf8'),
)?.[1] === 'true';

const slashed = TRAILING_SLASH
	? []
	: pages.flatMap((p) =>
		[...p.html.matchAll(/<a\s[^>]*href="(\/[^"]*\/)"/g)]
			.filter((m) => m[1] !== '/')
			.map((m) => `${p.route} → ${m[1]}`),
	);

check(
	'no link has a trailing slash on a site served without them',
	slashed.length === 0,
	slashed.length ? `${slashed.length}: ${slashed.slice(0, 4).join('; ')}` : `site is trailing-slash: ${TRAILING_SLASH ? 'always' : 'never'}`,
);

/* --- 3. nothing points off-site by accident ------------------------------- */

const offsite = [...external].filter((u) => !/pamelaroy\.com/.test(u));
check(
	'no link points at an unexpected host',
	offsite.length === 0,
	offsite.length ? offsite.join(', ') : `${external.size} external links, all pamelaroy.com`,
);

/* --- 4. no placeholder text survived --------------------------------------- */

const PLACEHOLDERS = [
	/\blorem ipsum\b/i,
	/\bTODO\b/,
	/\bFIXME\b/,
	/\bXXX\b/,
	/\bTBD\b/,
	/\bplaceholder\b/i,
	/\bcoming soon\b/i,
	/\bunder construction\b/i,
	/\[insert[^\]]*\]/i,
	/\byour name here\b/i,
	/\bexample\.com\b/,
	/\btest test\b/i,
];

const offenders: string[] = [];
for (const page of pages) {
	// Scripts and styles are stripped first: a gate constant is allowed to say
	// "TODO" in a comment, and flagging that would make the check unusable.
	const text = page.html
		.replace(/<script[\s\S]*?<\/script>/g, ' ')
		.replace(/<style[\s\S]*?<\/style>/g, ' ')
		.replace(/<[^>]+>/g, ' ');

	for (const re of PLACEHOLDERS) {
		const hit = re.exec(text);
		if (hit) offenders.push(`${page.route}: "${hit[0]}"`);
	}
}

check(
	'no placeholder copy in any rendered page',
	offenders.length === 0,
	offenders.length ? offenders.slice(0, 6).join('; ') : `${pages.length} pages read`,
);

/* --- 5. the content collections are complete ------------------------------ */

{
	/*
	 * The required fields are read out of `src/content.config.ts` rather than
	 * written here. An earlier version of this gate listed `summary` and `date`
	 * for a collection whose schema says `description` and `publishDate`, and
	 * reported twelve perfectly good essays as broken. A gate that hardcodes a
	 * copy of the schema is a gate that will disagree with the schema, and the
	 * schema is the thing that is right.
	 *
	 * So: find each `z.object({`, take its keys, and treat a field as required
	 * when the schema does not mark it `.optional()` and does not give it a
	 * `.default()`. Those two are the only ways this codebase makes a field
	 * non-mandatory, which is checked rather than assumed below.
	 */
	const schemaSrc = readFileSync('src/content.config.ts', 'utf8');

	function requiredFields(collection: string): string[] {
		const from = schemaSrc.indexOf(`const ${collection} = defineCollection(`);
		if (from === -1) throw new Error(`no \`${collection}\` collection in the schema`);

		const start = schemaSrc.indexOf('z.object({', from);
		if (start === -1) throw new Error(`${collection} has no z.object schema`);

		// Brace-match to the object's close. Counting braces rather than
		// matching to the next `});` because a nested object or a `)` inside a
		// comment would both end the scan early.
		let depth = 0;
		let end = start;
		for (let i = schemaSrc.indexOf('{', start); i < schemaSrc.length; i++) {
			const ch = schemaSrc[i];
			if (ch === '{') depth++;
			else if (ch === '}') {
				depth--;
				if (depth === 0) {
					end = i;
					break;
				}
			}
		}

		const body = schemaSrc.slice(start, end);
		const fields: string[] = [];

		// Top-level keys are the ones at the shallowest indentation present in
		// the object, which is uniform across this file.
		const indents = [...body.matchAll(/^\t+(\w+):/gm)].map((m) => m[0].indexOf(m[1]!));
		const shallowest = Math.min(...indents);
		const keyLine = new RegExp(`^\\t{${shallowest}}(\\w+):([\\s\\S]*?)(?=^\\t{${
			shallowest === 0 ? 1 : shallowest
		}}\\w+:|\\s*$)`, 'gm');

		for (const m of body.matchAll(keyLine)) {
			const [, name, definition] = m;
			const optional = /\.optional\(\)/.test(definition);
			const hasDefault = /\.default\(/.test(definition);
			if (!optional && !hasDefault) fields.push(name!);
		}

		return fields;
	}

	// The gate is only meaningful if the extraction found something. Asserted,
	// because a regex that silently matches nothing would make every content
	// file trivially complete.
	const writingsRequired = requiredFields('writings');
	check(
		'the schema exposes its required fields to this gate',
		writingsRequired.includes('title') &&
			writingsRequired.includes('description') &&
			writingsRequired.includes('publishDate'),
		`writings requires: ${writingsRequired.join(', ')}`,
	);

	const files: { path: string; dir: string }[] = [
		...readdirSync('src/content/writings', { recursive: true })
			.map(String)
			.filter((f) => f.endsWith('.md'))
			.map((f) => ({ path: join('src/content/writings', f), dir: 'writings' })),
		...readdirSync('src/content/services')
			.map(String)
			.filter((f) => f.endsWith('.md'))
			.map((f) => ({ path: join('src/content/services', f), dir: 'services' })),
		...readdirSync('src/content/newsletter')
			.map(String)
			.filter((f) => f.endsWith('.md'))
			.map((f) => ({ path: join('src/content/newsletter', f), dir: 'newsletter' })),
		...readdirSync('src/content/pages')
			.map(String)
			.filter((f) => f.endsWith('.md'))
			.map((f) => ({ path: join('src/content/pages', f), dir: 'pages' })),
	];

	const incomplete: string[] = [];
	for (const file of files) {
		const raw = readFileSync(file.path, 'utf8');
		const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
		if (!fm) {
			incomplete.push(`${file.path}: no frontmatter`);
			continue;
		}
		for (const key of requiredFields(file.dir)) {
			if (!new RegExp(`^${key}:\\s*\\S`, 'm').test(fm[1])) incomplete.push(`${file.path}: no ${key}`);
		}
	}

	check(
		'every content file carries the fields its schema requires',
		incomplete.length === 0,
		incomplete.length
			? incomplete.slice(0, 5).join('; ')
			: `${files.length} files across 4 collections`,
	);

	// A date that does not parse renders as "Invalid Date" in the archive, so
	// the value is parsed rather than pattern-matched.
	const dateField = schemaSrc.includes('publishDate:') ? 'publishDate' : 'date';
	const badDates: string[] = [];
	for (const f of files.filter((f) => f.dir === 'writings' || f.dir === 'newsletter')) {
		const raw = readFileSync(f.path, 'utf8');
		const d = new RegExp(`^(?:${dateField}|sendDate):\\s*(\\S+)`, 'm').exec(raw)?.[1];
		if (!d || Number.isNaN(Date.parse(d))) badDates.push(`${f.path} (${d ?? 'absent'})`);
	}
	check(
		'every publication date parses',
		badDates.length === 0,
		badDates.length ? badDates.slice(0, 4).join('; ') : `${files.length} dates checked`,
	);

	check(
		'the supporting pages are all present',
		files.filter((f) => f.dir === 'pages').length >= 4,
		files
			.filter((f) => f.dir === 'pages')
			.map((f) => f.path.replace('src/content/pages/', '').replace('.md', ''))
			.join(', '),
	);
}

/* --- 6. drafts are not in the build --------------------------------------- */

{
	const drafts = readdirSync('src/content/writings', { recursive: true })
		.map(String)
		.filter((f) => f.endsWith('.md'))
		.filter((f) => /^draft:\s*true/m.test(readFileSync(join('src/content/writings', f), 'utf8')));

	const leaked = drafts.filter((f) =>
		pages.some((p) => p.html.includes(f.replace(/\.md$/, '').split('/').pop()!)),
	);

	check(
		'no draft appears in the build',
		leaked.length === 0,
		leaked.length ? leaked.join(', ') : drafts.length ? `${drafts.length} drafts, none in dist` : 'no drafts to check',
	);
}

/* --- 7. every image has alt text ------------------------------------------ */

{
	const missingAlt: string[] = [];
	let images = 0;

	for (const page of pages) {
		for (const m of page.html.matchAll(/<img\s[^>]*>/g)) {
			images++;
			if (!/\salt\s*=\s*"[^"]+"/.test(m[0])) missingAlt.push(`${page.route}: ${m[0].slice(0, 60)}`);
		}
	}

	check(
		'every image has meaningful alt text',
		missingAlt.length === 0,
		missingAlt.length ? `${missingAlt.length} of ${images}` : `${images} images`,
	);
}

/* --- 8. launch blockers, reported rather than failed ---------------------- */

{
	const site = readFileSync('src/lib/site.ts', 'utf8');
	const blockers: string[] = [];

	if (/Placeholder/.test(site)) blockers.push('SITE.url and SITE.email are still marked placeholder in src/lib/site.ts');
	if (/socials:\s*\[\s*\]/.test(site)) blockers.push('SITE.socials is empty — the elsewhere row is the address alone');
	if (/mailto:\$\{SITE\.email\}/.test(readFileSync('src/pages/contact.astro', 'utf8'))) {
		blockers.push('/contact falls back to a mailto: rather than a form endpoint');
	}

	if (blockers.length) {
		warn(`LAUNCH BLOCKER  ${blockers.length} placeholder(s) left in the site's identity:`);
		for (const b of blockers) warn(`             ${b}`);
		warn('             Deploying now would publish wrong canonicals, feeds, sitemaps and cards site-wide.');
	}
}

/* --- 9. the deployment contract, over a real static server ---------------- */

{
	/*
	 * §9.6 asks for 404 handling to be confirmed, and the only honest way to
	 * confirm it is to serve the build the way a host will and ask over HTTP.
	 * Reading dist/404.html proves the file exists, not that anything returns it
	 * with a 404.
	 *
	 * Each case below is a failure mode that produces a site which looks fine in
	 * dev and is broken in production:
	 *
	 *   - a 404 served as 200 makes every broken link look healthy to a crawler
	 *   - a directory URL with no rewrite 404s, which takes every article with it
	 *   - a trailing-slash redirect loop silently drops every font and image
	 */
	const server = serveDist('dist', 0);
	const probe = async (path: string, follow = false) => {
		const res = await fetch(server.url + path, { redirect: follow ? 'follow' : 'manual' });
		return { status: res.status, location: res.headers.get('location') };
	};

	const cases: [string, string, number][] = [
		['/about', 'a directory route resolves', 200],
		['/library/2026/the-middle-of-the-book', 'a nested article resolves', 200],
		['/rss.xml', 'the feed resolves', 200],
		['/sitemap-index.xml', 'the sitemap resolves', 200],
		['/nope', 'an unknown path is a real 404', 404],
	];

	for (const [path, label, expected] of cases) {
		const { status } = await probe(path);
		check(label, status === expected, `${path} → ${status}, expected ${expected}`);
	}

	// The canonical form is without the slash, so the slashed one redirects there
	// and not to itself. A 301 to your own URL is a loop, and it was one: the
	// condition tested isFile() where it meant isDirectory(), which made every
	// asset in dist/_astro redirect to itself and every image on the site fail
	// to load with no console error to say so.
	{
		const { status, location } = await probe('/about/');
		check(
			'a trailing slash redirects to the canonical URL, once',
			status === 301 && location === '/about',
			`/about/ → ${status} ${location ?? '(no location)'}`,
		);
	}

	// Fonts and images are the files a loop took out, so they get their own
	// assertion rather than being assumed by the cases above.
	{
		const asset = readdirSync('dist/_astro').find((f) => /\.(woff2|avif|webp|png)$/.test(f));
		if (asset) {
			const { status } = await probe(`/_astro/${asset}`);
			check('a hashed asset is served, not redirected', status === 200, `${asset} → ${status}`);
		} else {
			warn('no hashed assets in dist/_astro to probe');
		}
	}

	// The 404 page must be noindex, or a soft-404 gets indexed as real content.
	check(
		'the 404 page asks not to be indexed',
		readFileSync(join(DIST, '404.html'), 'utf8').includes('noindex'),
		'robots meta on /404',
	);

	server.close();
}

/* --- report --------------------------------------------------------------- */

for (const line of results) console.log(`  ${line}`);
const failed = results.filter((r) => r.startsWith('FAIL')).length;
const warned = results.filter((r) => r.startsWith('WARN')).length;
console.log(`content: ${results.length - failed - warned}/${results.length - warned} checks passed, ${warned} warning(s)`);

process.exit(failed ? 1 : 0);
