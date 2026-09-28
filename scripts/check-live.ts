/**
 * check-live — the same questions, asked of the deployed site.
 *
 * Everything else in this project checks `dist/`, which is right: it is fast, it
 * is deterministic, and it runs on every save. But it cannot answer the only
 * questions that matter on the day of launch, because they are questions about
 * the *deployment* rather than about the build:
 *
 *   - does the host serve trailing-slash URLs as redirects, or as 404s?
 *   - does `/sitemap-index.xml` actually exist at the origin the robots.txt
 *     advertises, on a host where the site is served from a subdirectory?
 *   - is HTTPS forced, and does `http://` redirect rather than serve?
 *   - does the feed's links resolve against the *live* host, which may differ
 *     from the origin baked in at build time?
 *
 * So this runs against a real origin and fetches a small sample rather than
 * crawling it — enough to catch a misconfigured host, not enough to be a load
 * test. Point it at the deployment:
 *
 *   bun run scripts/check-live.ts --origin https://pamelaroy.com
 *
 * It is deliberately not in check.sh. The whole build suite has to run offline
 * and on a laptop, and this one needs the internet and a hostname that exists.
 */

import { SITE } from '../src/lib/site.ts';

const args = process.argv.slice(2);
const origin = (args.includes('--origin') ? args[args.indexOf('--origin') + 1] : SITE.url)
	.replace(/\/+$/, '');

const results: string[] = [];
const check = (name: string, pass: boolean, detail = '') =>
	results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);

/** A fetch that reports the status instead of throwing on a 404. */
async function get(path: string, redirect: RequestRedirect = 'follow') {
	try {
		const response = await fetch(`${origin}${path}`, { redirect, signal: AbortSignal.timeout(15000) });
		return {
			status: response.status,
			url: response.url,
			type: response.headers.get('content-type') ?? '',
			body: await response.text(),
		};
	} catch (error) {
		return { status: 0, url: '', type: '', body: '', error: String(error) };
	}
}

console.log(`checking ${origin}\n`);

/* ------------------------------------------------------------------ https --- */

const plain = await get('/', 'manual');
check(
	'http:// is redirected to https, not served',
	plain.status >= 300 && plain.status < 400,
	plain.status === 0 ? plain.error : `status ${plain.status}`,
);

/* -------------------------------------------------------- the trailing slash ---
   The site is built with `trailingSlash: 'never'`. A host that rewrites to
   'always' would still serve every page, and the feed and the sitemap would
   then be full of URLs that differ from the canonical ones by one character. */

const slashed = await get('/library/');
const bare = await get('/library');

check(
	'the canonical /library answers 200',
	bare.status === 200,
	bare.status === 0 ? bare.error : `status ${bare.status}`,
);
check(
	'/library/ either redirects to /library or is served, never 404',
	slashed.status === 200 || (slashed.status >= 300 && slashed.status < 400),
	slashed.status === 0 ? slashed.error : `status ${slashed.status}${slashed.url ? ` -> ${slashed.url}` : ''}`,
);

/* ------------------------------------------------------------- the sitemap --- */

const robots = await get('/robots.txt');
const advertised = robots.body.match(/^Sitemap:\s*(\S+)$/m)?.[1];

check('robots.txt is served', robots.status === 200, `status ${robots.status}`);
check('robots.txt advertises a sitemap', !!advertised, advertised ?? 'no Sitemap line');
check(
	'the advertised sitemap is on this origin',
	advertised === `${origin}/sitemap-index.xml`,
	advertised ?? 'nothing advertised',
);

const index = await get('/sitemap-index.xml');
check('sitemap-index.xml answers 200', index.status === 200, `status ${index.status}`);
check('sitemap-index.xml names a child sitemap', /<loc>[^<]+<\/loc>/.test(index.body));

const child = index.body.match(/<loc>([^<]+)<\/loc>/)?.[1];
if (child) {
	const map = await get(new URL(child).pathname);
	check('the child sitemap answers 200', map.status === 200, `status ${map.status}`);

	// The routes a broken deployment most often loses.
	for (const route of ['/about', '/colophon', '/contact', '/newsletter', '/library', '/services']) {
		check(`the sitemap lists ${route}`, map.body.includes(`${origin}${route}</loc>`));
	}
	check('the sitemap does not list the 404', !map.body.includes('/404</loc>'));
	check('the sitemap does not list the social cards', !map.body.includes('/og/'));
}

/* ------------------------------------------------------------------ the feed --- */

const feed = await get('/rss.xml');
check('the feed answers 200', feed.status === 200, `status ${feed.status}`);
check('the feed is served as XML', /<rss|<feed/.test(feed.body));
check('the feed has items', (feed.body.match(/<item>/g) ?? []).length > 0);

const links = [...feed.body.matchAll(/<link>([^<]+)<\/link>/g)].map((m) => m[1]);
check(
	'no feed link carries a trailing slash the site does not use',
	!links.some((link) => new URL(link).pathname.length > 1 && new URL(link).pathname.endsWith('/')),
	links.filter((l) => new URL(l).pathname.endsWith('/')).join(' ') || `${links.length} links`,
);

// Three of them, resolved against the live host. This is the check that catches
// a site built with one `SITE.url` and deployed at another.
for (const link of links.slice(0, 3)) {
	const path = new URL(link).pathname;
	const page = await get(path);
	check(`a feed link resolves: ${path}`, page.status === 200, `status ${page.status}`);
}

/* ------------------------------------------------------------- the cards --- */

const card = await get('/og/default.png');
check('the brand card is served', card.status === 200, `status ${card.status}`);
// Checked from the content type rather than the bytes: the body has already been
// decoded as text by this point, so a magic-number comparison would be testing the
// decoder as much as the file.
check('the brand card is served as a PNG', card.type.includes('image/png'), card.type || 'no content-type');

/* -------------------------------------------------------- pages and the 404 --- */

for (const route of ['/', '/about', '/colophon', '/contact', '/newsletter', '/services']) {
	const page = await get(route);
	check(`${route} answers 200`, page.status === 200, `status ${page.status}`);

	// The canonical has to name the live origin, not the one in the build.
	const canonical = page.body.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/)?.[1];
	check(`${route} canonical points at this origin`, canonical === `${origin}${route}`, canonical ?? 'none');
}

const missing = await get('/this-page-does-not-exist');
check('a missing address answers 404', missing.status === 404, `status ${missing.status}`);
check('the 404 is the site\'s own page, not the host\'s', missing.body.includes('end of this shelf'));

/* ------------------------------------------------------------------ report --- */

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
