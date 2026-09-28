/**
 * A static file server for `dist/`, behaving the way the real host will.
 *
 * The performance and live gates both need one, and the behaviour is the point:
 * `astro dev` is unminified, injects a dev toolbar, serves unbundled CSS from
 * source and answers 200 for paths a static host would 404. Measuring against
 * it produces numbers that are wrong in a way that looks like success.
 *
 * So this reproduces the deployment contract:
 *
 *   - `trailingSlash: 'never'`, so /about serves dist/about/index.html and
 *     /about/ is a redirect rather than a second URL for one page
 *   - a real 404 from dist/404.html with a 404 status, not a soft 200
 *   - correct content types, because a stylesheet served as text/plain is
 *     ignored by the browser and the measurement is then of an unstyled page
 *
 * Written against Bun.serve so the gate needs nothing installed.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const TYPES: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.xml': 'application/xml; charset=utf-8',
	'.txt': 'text/plain; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.avif': 'image/avif',
	'.ico': 'image/x-icon',
	'.woff2': 'font/woff2',
	'.woff': 'font/woff',
};

/**
 * Every byte of CSS the build will actually serve, as one string.
 *
 * Not just `dist/_astro/*.css`. Astro's `build.inlineStylesheets` defaults to
 * `'auto'`, which inlines any stylesheet under 4 KB into each page as a
 * `<style>` block and emits a file only for the ones that are bigger. In this
 * project that split cuts straight through the middle of the design: the
 * component styles are inlined and the font faces are a file.
 *
 * So a gate that greps `_astro` for a class name or a custom property finds
 * nothing and concludes the thing is missing. That is not a hypothetical — it
 * is how `check-images.ts` first reported that no card styles existed in the
 * build, on a build where every one of them was present.
 */
export function allCss(dist = 'dist'): string {
	const emitted = existsSync(join(dist, '_astro'))
		? readdirSync(join(dist, '_astro'))
				.filter((f) => f.endsWith('.css'))
				.map((f) => readFileSync(join(dist, '_astro', f), 'utf8'))
		: [];

	const inlined = readdirSync(dist, { recursive: true })
		.map(String)
		.filter((f) => f.endsWith('.html'))
		.flatMap((f) => [...readFileSync(join(dist, f), 'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]));

	return [...emitted, ...inlined].join('\n');
}

export interface StaticServer {
	url: string;
	close: () => void;
	requests: string[];
}

/**
 * @param root  the directory to serve, normally `dist`
 * @param port  0 picks a free port, which is what the gates use so two runs
 *              never collide
 */
export function serveDist(root = 'dist', port = 0): StaticServer {
	const requests: string[] = [];

	const server = Bun.serve({
		port,
		hostname: '127.0.0.1',
		async fetch(req) {
			const url = new URL(req.url);
			requests.push(url.pathname);

			const send = (file: string, status = 200) =>
				new Response(readFileSync(join(root, file)), {
					status,
					headers: { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' },
				});

			// `normalize` plus the prefix check below is what stops `..` from
			// escaping the served directory. A gate that can read /etc is a gate
			// nobody runs on a laptop.
			const raw = decodeURIComponent(url.pathname);
			const clean = normalize(raw).replace(/^(\.\.[/\\])+/, '');
			const rel = clean.replace(/^\//, '');

			// A directory URL *with* a trailing slash is the non-canonical form on
			// a trailing-slash-free host, so it redirects to the canonical one.
			//
			// The redirect is only for URLs that name a directory, and the
			// condition is `isDirectory()` — an earlier version tested `isFile()`,
			// which made `/_astro/cover.webp` redirect to itself. The browser
			// followed it until it gave up, every image silently failed to load,
			// and the image gate reported `naturalWidth: 0` with no console error
			// to explain it. A 301 to your own URL is the single most confusing
			// failure this file can produce, so it is worth the comment.
			if (raw !== '/' && raw.endsWith('/') && existsSync(join(root, rel)) && statSync(join(root, rel)).isDirectory()) {
				const canonical = raw.replace(/\/+$/, '');
				return new Response(null, { status: 301, headers: { location: canonical || '/' } });
			}

			const candidates = [
				join(rel, 'index.html'),
				rel,
				`${rel}.html`,
			];

			for (const candidate of candidates) {
				// Still inside root?
				if (candidate.startsWith('..')) continue;
				if (existsSync(join(root, candidate)) && statSync(join(root, candidate)).isFile()) {
					return send(candidate);
				}
			}

			// The 404 page, with a 404. Serving it as 200 is the single most
			// common static-host mistake and it makes a broken link look healthy
			// to every crawler.
			if (existsSync(join(root, '404.html'))) return send('404.html', 404);

			return new Response('Not found', { status: 404 });
		},
	});

	return {
		url: `http://127.0.0.1:${server.port}`,
		close: () => server.stop(true),
		requests,
	};
}

// Standalone, for `check:live --local` and for poking at the build by hand.
if (import.meta.main) {
	const port = Number(process.env.PORT ?? 4322);
	const s = serveDist('dist', port);
	console.log(`serving dist/ at ${s.url}`);
}
