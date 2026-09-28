/**
 * check-seo — what a crawler will actually see.
 *
 * Every other gate here asks whether a page renders. This one asks whether the
 * page *describes* itself correctly, which is a different set of claims and the
 * only ones a link pasted into Slack or a search result will ever exercise.
 *
 * It runs against `dist/`, not the dev server, for the same reason the draft
 * check does: dev is not what ships, and a guarantee that only holds in dev is
 * not a guarantee.
 *
 *   bun run scripts/check-seo.ts
 *
 * The failures worth catching, in rough order of how quietly they happen:
 *
 *  - two pages sharing a title or a description, which is invisible in a
 *    screenshot and looks like a bug to a search engine;
 *  - a canonical or an og:url pointing somewhere the site is not served from,
 *    after a domain change;
 *  - an og:image naming a card that was never generated, so the link shows a
 *    blank rectangle;
 *  - a JSON-LD block that is not valid JSON, from an unescaped `</script>` in an
 *    essay about markup;
 *  - a robots.txt advertising a sitemap at the wrong origin.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { SITE } from '../src/lib/site.ts';

const DIST = 'dist';

const results: string[] = [];
const check = (name: string, pass: boolean, detail = '') =>
	results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);

/*
 * Every page in the build, as a route *and* the file it came from. Both are
 * needed: the route is what a canonical is checked against, and the file is
 * what has to be read. Deriving one from the other is where this goes wrong —
 * `/about` is `about/index.html`, and `404.html` is not `404/index.html`.
 */
interface Page {
	route: string;
	file: string;
}

async function pages(dir = DIST, out: Page[] = []): Promise<Page[]> {
	for (const name of await readdir(dir)) {
		const path = join(dir, name);
		const info = await stat(path);

		if (info.isDirectory()) {
			await pages(path, out);
		} else if (name.endsWith('.html')) {
			const rel = relative(DIST, path).replace(/\\/g, '/');
			/*
			 * `index.html` is its directory, `404.html` is a file, and neither
			 * is a trailing-slash URL — the site is served `trailingSlash:
			 * 'never'`, so the route a canonical is compared against has to be
			 * `/about` and not `/about/`. Getting this wrong is quiet: the
			 * comparison still runs, it just compares against an address the
			 * site never answers to.
			 */
			const route =
				'/' +
				rel
					.replace(/index\.html$/, '')
					.replace(/\.html$/, '')
					.replace(/^\/+|\/+$/g, '');

			out.push({ route: route === '/' ? '/' : route, file: path });
		}
	}

	return out.sort((a, b) => a.route.localeCompare(b.route));
}

/* `content="..."` out of one tag. `[^>]*` rather than `\S*` because a
   description can contain a space, and because a value may legitimately be
   followed by other attributes. */
const attr = (html: string, tag: string, name: string): string | null => {
	const match = html.match(new RegExp(`<${tag}\\b[^>]*\\b${name}=["']([^"']*)["']`, 'i'));
	return match ? match[1] : null;
};

const meta = (html: string, key: string): string | null =>
	html.match(
		new RegExp(
			`<meta\\b[^>]*\\b(?:property|name)=["']${key}["'][^>]*\\bcontent=["']([^"']*)["']`,
			'i',
		),
	)?.[1] ??
	html.match(
		new RegExp(
			`<meta\\b[^>]*\\bcontent=["']([^"']*)["'][^>]*\\b(?:property|name)=["']${key}["']`,
			'i',
		),
	)?.[1] ??
	null;

/**
 * Every JSON-LD block on a page, parsed.
 *
 * Parsed rather than pattern-matched because the point of structured data is
 * that it is data: `/"@type":"BlogPosting"/.test(html)` passes for a posting
 * with no headline, no date and no author, which is precisely the shape a
 * careless refactor leaves behind.
 */
const jsonLd = (html: string): Record<string, unknown>[] =>
	[...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
		.map((match) => {
			try {
				return JSON.parse(match[1]);
			} catch {
				return null;
			}
		})
		.filter((block): block is Record<string, unknown> => !!block && typeof block === 'object');

/**
 * The page's `h1`, for comparing a posting's headline against what a reader sees.
 *
 * Not `<title>`: BaseHead suffixes the document title with the site name, so
 * "X · Pamela Roy" is the right thing for a search result and the wrong thing to
 * call an article's headline.
 */
const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	hellip: '…',
	mdash: '—',
	ndash: '–',
	lsquo: '‘',
	rsquo: '’',
	ldquo: '“',
	rdquo: '”',
};

/**
 * The handful of HTML entities a title can contain.
 *
 * Needed because the comparison is between an `h1` in the built HTML — where
 * `Ginsberg's` is written `Ginsberg&#39;s` — and a JSON string, where it is not.
 * Only the entities a title plausibly uses are listed; this is not a parser.
 */
const decodeEntities = (value: string): string =>
	value
		.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
		.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
		.replace(/&([a-z]+);/gi, (whole, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? whole);

const headingOf = (html: string): string =>
	decodeEntities(
		html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '',
	);

const all = await pages();

/* ---------------------------------------------------------------- per page --- */

const titles = new Map<string, string>();
const descriptions = new Map<string, string>();
const canonicals = new Map<string, string>();
const clashes: string[] = [];
let missingImage = 0;
let badJsonLd = 0;
let missingRss = 0;
let missingCard = 0;

for (const { route, file } of all) {
	const html = await readFile(file, 'utf8');

	const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '';
	const description = meta(html, 'description') ?? '';
	const canonical = attr(html, 'link', 'href');
	const ogImage = meta(html, 'og:image');
	const ogUrl = meta(html, 'og:url');

	// 1. A title, and it is this page's.
	if (!title) check(`${route} has a title`, false, 'empty <title>');
	// 2. A description, and it is this page's.
	if (!description) check(`${route} has a description`, false, 'no meta description');

	// 3. Unique across the site. Recorded rather than reported per page, so the
	//    summary below can say how many collided rather than how many pages
	//    happened to collide with the one before them.
	for (const [map, value, label] of [
		[titles, title, 'title'],
		[descriptions, description, 'description'],
	] as const) {
		if (!value) continue;
		const clash = map.get(value);
		if (clash) clashes.push(`duplicate ${label}: ${clash} and ${route}`);
		else map.set(value, route);
	}

	// 4. The canonical is the page's own address at the site's origin.
	const expected = new URL(route, SITE.url).href;
	if (canonical !== expected) {
		check(`${route} canonical is right`, false, `${canonical ?? 'none'} ≠ ${expected}`);
	}
	// 5. og:url agrees with the canonical, or a crawler gets two answers.
	if (ogUrl !== canonical) {
		check(`${route} og:url is the canonical address`, false, `${ogUrl} ≠ ${canonical}`);
	}

	// 6. The card it points at was actually generated.
	if (!ogImage) {
		missingImage++;
	} else {
		const path = new URL(ogImage).pathname;
		const exists = await stat(join(DIST, path)).then(
			() => true,
			() => false,
		);
		if (!exists) {
			missingCard++;
			check(`${route} og:image exists`, false, `${path} is not in the build`);
		}
	}

	// 7. The feed is advertised, so a reader's reader can find it.
	if (!/<link[^>]*rel=["']alternate["'][^>]*application\/rss\+xml/i.test(html)) missingRss++;

	// 8. Structured data is valid JSON. An essay containing `</script>` would
	//    otherwise truncate the block silently. `jsonLd` drops anything that does
	//    not parse, so the count of dropped blocks is the count of failures.
	const rawBlocks = [...html.matchAll(
		/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
	)];
	const parsedBlocks = jsonLd(html);
	if (parsedBlocks.length < rawBlocks.length) {
		badJsonLd += rawBlocks.length - parsedBlocks.length;
		check(`${route} JSON-LD parses`, false, `${rawBlocks.length - parsedBlocks.length} of ${rawBlocks.length} malformed`);
	}

	canonicals.set(route, canonical ?? '');
}

/*
 * Note on trailing slashes: there is deliberately no separate check for them.
 * Step 4 already compares each canonical against `new URL(route, SITE.url)`,
 * and the route is derived from the built file path, so a canonical that gained
 * or lost a trailing slash fails there. A second, weaker assertion about the
 * same fact would only be able to agree or to be switched off.
 */
check('every page has a title', titles.size === all.length, `${titles.size}/${all.length}`);
check('every page has a description', descriptions.size === all.length, `${descriptions.size}/${all.length}`);
check('every title is unique', !clashes.some((c) => c.includes('title')), clashes.filter((c) => c.includes('title')).slice(0, 3).join('; '));
check('every description is unique', !clashes.some((c) => c.startsWith('duplicate description')), clashes.filter((c) => c.startsWith('duplicate description')).slice(0, 3).join('; '));
check('every page has a canonical', [...canonicals.values()].every(Boolean), `${canonicals.size}/${all.length}`);
check('every page has an og:image', missingImage === 0, `${missingImage} without one`);
check('every og:image was generated', missingCard === 0, `${missingCard} dangling`);
check('every JSON-LD block parses', badJsonLd === 0, `${badJsonLd} malformed`);
check('every page advertises the feed', missingRss === 0, `${missingRss} without it`);

/* --------------------------------------------------------- the article card --- */

/**
 * Every writing file, by id, and whether it is a draft.
 *
 * Read off the content tree rather than through `lib/writings.ts`, because that
 * module imports `astro:content` and only resolves inside an Astro build — and
 * a gate that cannot run outside one is a gate that only runs when something
 * else has already succeeded. It is a dozen lines to read `draft:` and to use
 * the file's own path as its id, which is the convention the routes already
 * rely on.
 */
const WRITINGS = 'src/content/writings';

async function writingFiles(
	dir = WRITINGS,
	out: { id: string; draft: boolean }[] = [],
): Promise<{ id: string; draft: boolean }[]> {
	for (const name of await readdir(dir)) {
		const path = join(dir, name);

		if ((await stat(path)).isDirectory()) {
			await writingFiles(path, out);
			continue;
		}

		if (!name.endsWith('.md')) continue;

		const id = relative(WRITINGS, path).replace(/\\/g, '/').replace(/\.md$/, '');
		const head = (await readFile(path, 'utf8')).match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';

		out.push({ id, draft: /^draft:\s*true\s*$/m.test(head) });
	}

	return out;
}

const exists = (path: string) =>
	stat(path).then(
		() => true,
		() => false,
	);

for (const { id, draft } of await writingFiles()) {
	/* Looked up by route rather than assembled as a path. The build writes
	   `library/<id>/index.html` even with `trailingSlash: 'never'` — that is
	   how a static host answers an extensionless URL — so "the page for this
	   id" and "this file name" are not the same question. */
	const built = all.find((p) => p.route === `/library/${id}`);
	const card = join(DIST, 'og', `${id}.png`);

	if (draft) {
		// The strongest form of the draft guarantee, stated where it is true:
		// no page, no card, and therefore nothing anywhere pointing at either.
		check(`${id} (draft) has no page`, !built);
		check(`${id} (draft) has no card`, !(await exists(card)));
		continue;
	}

	if (!built) {
		check(`${id} has a page`, false, 'missing from the build');
		continue;
	}

	const html = await readFile(built.file, 'utf8');
	const ogImage = meta(html, 'og:image') ?? '';

	check(`${id} points at its own card`, ogImage.endsWith(`/og/${id}.png`), ogImage || 'none');
	check(`${id} is an og:article`, meta(html, 'og:type') === 'article', meta(html, 'og:type') ?? 'none');
	check(`${id} carries a published time`, !!meta(html, 'article:published_time'));
	// The author is a URL, so the crawler can tie the piece to the Person on
	// /about rather than matching a string by hand.
	check(
		`${id} carries an author URL`,
		meta(html, 'article:author') === `${SITE.url}/about`,
		meta(html, 'article:author') ?? 'none',
	);
	// A card that exists but is a few hundred bytes is a card that failed.
	const cardOk = await stat(card).then(
		(info) => info.size > 2000,
		() => false,
	);
	check(`${id} has a real card`, cardOk);

	/*
	 * The BlogPosting's own fields, read out of the parsed JSON-LD rather than
	 * out of the HTML around it.
	 *
	 * Asserting that the string `"@type":"BlogPosting"` appears somewhere in
	 * the page only proves the block was emitted at all — it would pass just as
	 * happily for a posting with no headline, no date and no author, which is
	 * the shape a refactor leaves behind. These are the fields §8.3 names, so
	 * they are the fields checked.
	 */
	const posting = jsonLd(html).find((block) => block['@type'] === 'BlogPosting');

	if (!posting) {
		check(`${id} declares a BlogPosting`, false, 'no JSON-LD block of that type');
		continue;
	}

	// `image` is an array, not a string: schema.org allows either, and an array
	// is what lets a piece carry both the card and the cover. So it is checked
	// for being non-empty rather than for being a string.
	for (const field of ['headline', 'description', 'datePublished', 'url']) {
		check(
			`${id} BlogPosting has a ${field}`,
			typeof posting[field] === 'string' && (posting[field] as string).length > 0,
			typeof posting[field] === 'undefined' ? 'missing' : String(posting[field]).slice(0, 40),
		);
	}

	const images = Array.isArray(posting.image) ? posting.image : [posting.image];
	check(
		`${id} BlogPosting has an image`,
		images.length > 0 && images.every((value) => typeof value === 'string' && value.length > 0),
		`${images.length} image(s)`,
	);

	// The author and the breadcrumb are references, not strings: they are what
	// let a crawler resolve this piece to the Person and to the shelves above it.
	check(
		`${id} BlogPosting references an author`,
		typeof (posting.author as Record<string, unknown>)?.['@id'] === 'string',
	);
	check(
		`${id} BlogPosting references its site`,
		typeof (posting.isPartOf as Record<string, unknown>)?.['@id'] === 'string',
	);

	/*
	 * `headline` is the article's own title, so it is compared against the `h1`
	 * a reader sees — not against `<title>`, which BaseHead deliberately
	 * suffixes with the site name for search results. Checking the h1 is the
	 * stricter of the two anyway: it is the visible one, and a headline that
	 * disagrees with it is wrong in a way a search engine will not fix.
	 */
	check(
		`${id} headline matches the heading on the page`,
		posting.headline === headingOf(html),
		`${String(posting.headline).slice(0, 40)} vs ${headingOf(html).slice(0, 40)}`,
	);
}

/* ----------------------------------------------------------- robots & feed --- */

const robots = await readFile(join(DIST, 'robots.txt'), 'utf8');
const advertised = robots.match(/^Sitemap:\s*(\S+)$/m)?.[1];

check('robots.txt advertises a sitemap', !!advertised, advertised ?? 'no Sitemap line');
// The detail is what was found, not a comparison — a `≠` printed beside a
// passing check reads as a failure and trains the reader to ignore the line.
check(
	'robots.txt points at sitemap-index.xml on the site origin',
	advertised === `${SITE.url}/sitemap-index.xml`,
	advertised ?? 'no Sitemap line',
);
check('robots.txt does not block the site', /^User-agent: \*\s*\nAllow: \/\s*$/m.test(robots));

const index = await readFile(join(DIST, 'sitemap-index.xml'), 'utf8');
check('sitemap-index.xml names sitemap-0.xml', index.includes('sitemap-0.xml'));

const sitemap = await readFile(join(DIST, 'sitemap-0.xml'), 'utf8');
for (const route of ['/about', '/colophon', '/contact', '/newsletter', '/services']) {
	check(`sitemap lists ${route}`, sitemap.includes(`${route}</loc>`));
}
// The 404 answers 404; it should not be advertised as a page to index.
check('sitemap does not list the 404', !sitemap.includes('/404</loc>'));
// Images are not pages.
check('sitemap does not list the cards', !sitemap.includes('/og/'));

/* ------------------------------------------------------------- structured --- */

const fileFor = async (route: string) => {
	const found = all.find((p) => p.route === route);
	if (!found) throw new Error(`no built page at ${route}`);
	return readFile(found.file, 'utf8');
};

check('about describes a Person', /"@type":"Person"/.test((await fileFor('/about')).replace(/\s/g, '')));
check(
	'the home page names the site as a WebSite',
	/"@type":"WebSite"/.test((await fileFor('/')).replace(/\s/g, '')),
);

const breadcrumbPages = all
	.map((p) => p.route)
	.filter((route) => /\/library\/|\/services\/[^/]+$|\/topics\/[^/]+$/.test(route));
let nestedWithTrail = 0;
let flatWithTrail = 0;

for (const { route, file } of all) {
	const html = await readFile(file, 'utf8');
	const has = /"@type":"BreadcrumbList"/.test(html.replace(/\s/g, ''));
	const nested = breadcrumbPages.includes(route);

	if (nested && has) nestedWithTrail++;
	if (!nested && has) flatWithTrail++;
}

check(
	'every nested route has a breadcrumb',
	nestedWithTrail === breadcrumbPages.length,
	`${nestedWithTrail}/${breadcrumbPages.length}`,
);
/*
 * A flat page with a one-crumb trail is claiming a hierarchy it does not have.
 * A breadcrumb of "Home" on the home page is the clearest example, and it is
 * the sort of thing that gets added by a well-meaning integration.
 */
check('no flat page claims a breadcrumb', flatWithTrail === 0, `${flatWithTrail} do`);

/* ------------------------------------------------------------------ report --- */

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
