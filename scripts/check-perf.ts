/**
 * Performance: the four numbers §11 P9.1 sets, measured against the build.
 *
 *   bun run scripts/check-perf.ts
 *
 *   LCP < 1.2s · CLS < 0.02 · INP < 150ms · total JS < 15 KB gzipped
 *
 * Measured over a static server on `dist/`, not the dev server. This is the
 * whole reason the gate exists: dev is unminified, unbundled and instrumented,
 * so a perf number taken there describes nothing that would be deployed.
 *
 * **Read the LCP and INP figures with the caveat they deserve.** These are lab
 * numbers from a local loopback connection on a development machine, with no
 * network latency, no CPU throttling and no cache. A real reader on a phone on
 * 4G will not see these. They are useful as a *regression* tripwire — a font
 * preloading twice, a script growing by 4 KB, an image losing its dimensions —
 * and not as a claim about field performance. The baseline file records what
 * this machine measured so the comparison is at least apples to apples.
 *
 * CLS and the JS budget are the two that transfer: one is a property of the
 * markup, the other of the build.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { Cdp, pass, report } from './lib/cdp';
import { serveDist } from './lib/serve';

/* --- the budget, from §11 P9.1 -------------------------------------------- */

const BUDGET = {
	lcp: 1200,
	cls: 0.02,
	inp: 150,
	js: 15 * 1024,
};

/**
 * A recorded baseline, so a slow drift is caught rather than a large jump.
 * Regenerate deliberately with `PERF=baseline bun run scripts/check-perf.ts`
 * after a change that is expected to be an improvement — a gate that re-baselines
 * itself on regression is not a gate.
 */
const BASELINE_PATH = 'scripts/perf-baseline.json';

/*
 * A regression check needs a tolerance that is wider than the measurement's own
 * noise, or it reports noise as regression.
 *
 * These pages render in tens of milliseconds over loopback, and at that scale the
 * number is dominated by things that are not the site: timer granularity,
 * scheduler jitter, whether the font file happened to be in the page cache. The
 * first recorded baseline of 48ms was followed within the same session by 64ms
 * for the same page with no code change — a 33% swing in the measurement itself.
 * A 15% tolerance on a 48ms figure is therefore a gate that fires at random,
 * and a gate that fires at random gets switched off.
 *
 * So the tolerance is scaled to the magnitude:
 *
 *   - at or above NOISE_FLOOR, 15% is a real signal and a real budget
 *   - below it, the measurement cannot resolve a 15% regression, so it is held
 *     to 2x and the output says so
 *
 * The floor is where a genuine regression would already have been caught by the
 * absolute budget above: anything past 1.2s fails outright, long before the
 * baseline is consulted.
 */
const NOISE_FLOOR = 300;
const TOLERANCE_ABOVE_FLOOR = 1.15;
const TOLERANCE_BELOW_FLOOR = 2;

/** The tolerance that applies to a given baseline value. */
const toleranceFor = (baseline: number) =>
	baseline >= NOISE_FLOOR ? TOLERANCE_ABOVE_FLOOR : TOLERANCE_BELOW_FLOOR;

if (!existsSync('dist')) {
	console.error('  no dist/ — run the build first');
	process.exit(1);
}

const server = serveDist('dist', 0);
const results: string[] = [];
const check = (name: string, ok: boolean, detail = '') =>
	results.push(pass(name, ok, detail));

/* --- 1. the JS budget, measured on the build ------------------------------ */

/*
 * Total client JS per page = every external script plus every inline script,
 * gzipped. The site ships no framework, and no external script either beyond
 * the router — so in practice this is the router plus a handful of inline
 * bytes. The number is measured rather than assumed, because "no framework
 * runtime" is a claim that a bundler could undo with one dependency.
 *
 * That external-script claim has a consequence worth writing down, because it
 * is easy to undo by accident: a component script that *imports* a shared
 * module cannot be inlined into the HTML, so one shared helper would put
 * every component's JavaScript into a file of its own. It is why `perPage` is
 * written out in each component rather than imported.
 */
const externalScripts = readdirSync('dist/_astro').filter((f) => f.endsWith('.js'));

function pageJsBytes(html: string): { gzipped: number; external: number; inline: number } {
	const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);

	let external = 0;
	for (const src of srcs) {
		const file = src.replace(/^\//, '').replace(/^_astro\//, '_astro/');
		const path = join('dist', file);
		if (existsSync(path)) external += gzipSync(readFileSync(path)).length;
	}

	// Inline scripts, concatenated and gzipped together, because that is how
	// they are delivered.
	const inlineSrc = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
		.map((m) => m[1])
		.join('\n');

	return {
		gzipped: external + gzipSync(Buffer.from(inlineSrc)).length,
		external,
		inline: gzipSync(Buffer.from(inlineSrc)).length,
	};
}

{
	const pages = readdirSync('dist', { recursive: true })
		.map(String)
		.filter((f) => f.endsWith('.html'));

	const measured = pages.map((f) => ({
		page: f,
		...pageJsBytes(readFileSync(join('dist', f), 'utf8')),
	}));

	const worst = measured.sort((a, b) => b.gzipped - a.gzipped)[0];
	const percent = ((worst.gzipped / BUDGET.js) * 100).toFixed(1);

	check(
		'total client JS under 15 KB gzipped, worst page',
		worst.gzipped < BUDGET.js,
		`${(worst.gzipped / 1024).toFixed(2)} KB on ${worst.page} (${percent}% of budget)`,
	);

	// The one external script the site is allowed to have is the router: the
	// crossfade cannot happen without it, and it is the only dependency-shaped
	// thing here. Everything else is inlined, and a second one fails this line.
	check(
		'no external script but the router — still no framework runtime',
		externalScripts.every((f) => f.startsWith('ClientRouter')),
		externalScripts.length ? `${externalScripts.length}: ${externalScripts.join(', ')}` : 'all JS is inline',
	);
}

/* --- 2. the pages, in a real browser -------------------------------------- */

const cdp = await Cdp.launch({ port: 9345, profile: '/tmp/pam-chrome-perf' });

/**
 * Install the observers before anything loads.
 *
 * This ordering is the whole game. `largest-contentful-paint` and
 * `layout-shift` only report entries that occur *after* an observer exists, so
 * a script injected after `load` sees an empty buffer and the gate reports a
 * perfect score for a page that shifted badly. Injected on new document, it
 * sees everything.
 */
const PROBE = `
window.__perf = { lcp: 0, cls: 0, inp: 0, shifts: 0, longTasks: 0 };

new PerformanceObserver((list) => {
  for (const e of list.getEntries()) window.__perf.lcp = e.startTime;
}).observe({ type: 'largest-contentful-paint', buffered: true });

new PerformanceObserver((list) => {
  for (const e of list.getEntries()) {
    // Shifts within 500ms of a real interaction are the reader's own doing and
    // are excluded from CLS by the spec. Same rule here as in the browser.
    if (!e.hadRecentInput) { window.__perf.cls += e.value; window.__perf.shifts++; }
  }
}).observe({ type: 'layout-shift', buffered: true });

new PerformanceObserver((list) => {
  for (const e of list.getEntries()) {
    // 'event' entries only cover interactions, which is what INP measures, so
    // this is INP for a page that received one rather than first-input timing.
    window.__perf.inp = Math.max(window.__perf.inp, e.duration || 0);
  }
}).observe({ type: 'event', buffered: true, durationThreshold: 0 });

new PerformanceObserver((list) => {
  window.__perf.longTasks += list.getEntries().length;
}).observe({ type: 'longtask', buffered: true });
`;

const ROUTES = ['/', '/library', '/library/2026/the-middle-of-the-book', '/services/ghostwriting', '/contact'];

interface Measurement {
	route: string;
	lcp: number;
	cls: number;
	inp: number;
	shifts: number;
	longTasks: number;
}

const measurements: Measurement[] = [];

for (const route of ROUTES) {
	await cdp.newTab();
	await cdp.viewport(1280, 900);
	await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE });

	// The performance navigation timing, so a cold cache is a cold cache on
	// every route and not only on whichever one ran first.
	await cdp.send('Network.enable');
	await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

	await cdp.goto(`${server.url}${route}`, 1400);

	/*
	 * INP needs an interaction. There is no framework and almost no script, so
	 * the realistic interaction is a click on the first focusable element — here
	 * the skip link, which every page has. If a page produced a long task during
	 * page load it is reported separately rather than being folded into INP.
	 */
	await cdp.send('Input.dispatchKeyEvent', {
		type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9,
	});
	await cdp.send('Input.dispatchKeyEvent', {
		type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9,
	});
	await Bun.sleep(400);

	const perf = await cdp.evaluate<any>('window.__perf');
	const timing = await cdp.evaluate<any>(`(() => {
		const nav = performance.getEntriesByType('navigation')[0] || {};
		const paints = performance.getEntriesByType('paint');
		return {
			fcp: paints.find(p => p.name === 'first-contentful-paint')?.startTime ?? null,
			domContentLoaded: nav.domContentLoadedEventEnd ?? null,
			load: nav.loadEventEnd ?? null,
			transferSize: nav.transferSize ?? null,
		};
	})()`);

	measurements.push({
		route,
		lcp: perf.lcp,
		cls: Number(perf.cls.toFixed(4)),
		inp: perf.inp,
		shifts: perf.shifts,
		longTasks: perf.longTasks,
	});

	await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });

	if (process.env.TRACE) console.error('   ', route, JSON.stringify({ ...perf, ...timing }));
}

await cdp.close();
server.close();

/* --- 3. the verdict ------------------------------------------------------- */

const worstLcp = measurements.reduce((a, b) => (a.lcp > b.lcp ? a : b));
const worstCls = measurements.reduce((a, b) => (a.cls > b.cls ? a : b));
const worstInp = measurements.reduce((a, b) => (a.inp > b.inp ? a : b));

check(
	'LCP under 1.2s, worst page',
	worstLcp.lcp < BUDGET.lcp,
	`${worstLcp.lcp.toFixed(0)}ms on ${worstLcp.route}`,
);

check(
	'CLS under 0.02, worst page',
	worstCls.cls < BUDGET.cls,
	`${worstCls.cls} on ${worstCls.route} (${worstCls.shifts} shift(s))`,
);

check(
	'INP under 150ms, worst page',
	worstInp.inp < BUDGET.inp,
	`${worstInp.inp.toFixed(0)}ms on ${worstInp.route}`,
);

const longTasks = measurements.reduce((n, m) => n + m.longTasks, 0);
check(
	'no long task over 50ms during load',
	longTasks === 0,
	longTasks === 0 ? 'none' : `${longTasks} across ${measurements.length} routes`,
);

/* --- 4. the images, which is where CLS would come from ------------------- */

{
	/*
	 * CLS is only unmeasurable-and-therefore-safe while there are no images. The
	 * spec requires width/height on every one, and the moment a cover is added
	 * this is the assertion that catches a missing one. So it is written now,
	 * against zero images, and it fails if it is ever given an image without
	 * dimensions — which is the point of writing it while it is trivially true.
	 */
	const imgs = readdirSync('dist', { recursive: true })
		.map(String)
		.filter((f) => f.endsWith('.html'))
		.flatMap((f) => [...readFileSync(join('dist', f), 'utf8').matchAll(/<img\s[^>]*>/g)].map((m) => ({ page: f, tag: m[0] })));

	const missingDims = imgs.filter((i) => !/\swidth=/.test(i.tag) || !/\sheight=/.test(i.tag));

	check(
		'every image declares width and height',
		missingDims.length === 0,
		missingDims.length
			? `${missingDims.length} without dimensions: ${missingDims[0].page}`
			: imgs.length === 0
				? 'no images in the build yet — assertion is in place for the first cover'
				: `${imgs.length} images, all dimensioned`,
	);
}

/* --- 5. the baseline ------------------------------------------------------ */

{
	if (process.env.PERF === 'baseline') {
		writeFileSync(
			BASELINE_PATH,
			JSON.stringify(
				Object.fromEntries(measurements.map((m) => [m.route, { lcp: Math.round(m.lcp), cls: m.cls }])),
				null,
				'\t',
			) + '\n',
		);
		console.log(`  baseline written to ${BASELINE_PATH}`);
	} else if (existsSync(BASELINE_PATH)) {
		const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Record<string, { lcp: number; cls: number }>;
		const regressions = measurements.filter((m) => {
			const b = baseline[m.route];
			if (!b) return false;
			return m.lcp > b.lcp * toleranceFor(b.lcp) || m.cls > b.cls * 1.15 + 0.005;
		});

		// Whether any page was in the noisy regime, reported rather than left
		// implicit — a reader deciding whether to trust this gate needs to know
		// which of its two tolerances applied.
		const noisy = measurements.filter((m) => baseline[m.route] && baseline[m.route].lcp < NOISE_FLOOR);

		check(
			'no page has regressed against the recorded baseline',
			regressions.length === 0,
			regressions.length
				? regressions
						.map((r) => `${r.route} lcp ${Math.round(r.lcp)}ms vs ${baseline[r.route].lcp}ms`)
						.join('; ')
				: noisy.length === measurements.length
					? `all ${measurements.length} pages below the ${NOISE_FLOOR}ms noise floor, held to ${TOLERANCE_BELOW_FLOOR}x`
					: `${measurements.length} pages within tolerance (${noisy.length} below the noise floor, at ${TOLERANCE_BELOW_FLOOR}x)`,
		);
	} else {
		results.push(pass('no baseline recorded yet', true, `run PERF=baseline to create ${BASELINE_PATH}`));
	}
}

report('perf', results);
