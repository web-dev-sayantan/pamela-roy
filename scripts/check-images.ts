/**
 * Phase 9.1 image-pipeline verification, with throwaway fixtures.
 *
 *   bun run scripts/check-images.ts
 *
 * The project's own audit (§4) recorded the sharpest limitation of everything
 * built so far: "There are zero cover images and no portrait in the
 * collection." That leaves the entire `astro:assets` path unexercised — AVIF and
 * WebP emission, `width`/`height` for CLS, `--filter-cover`, the OG card's cover
 * plate, the /about portrait, and print's cover-hiding.
 *
 * This gate exercises all of it against generated fixtures and then removes
 * them, restoring the tree byte-identically. It is the same method the audit
 * used to prove the WritingGrid empty state: fabricate the state, observe the
 * render, undo.
 *
 * The fixtures are generated rather than checked in on purpose. Committing a
 * placeholder photograph would put fake art on a real site and make the image
 * paths look exercised when they are only exercised by a placeholder.
 *
 * What is asserted, and why each is a real failure mode:
 *
 *   - AVIF and WebP are both emitted  — a single-format pipeline means a reader
 *     on Safari downloads a 900 KB JPEG for a 4:5 card
 *   - width and height are on the <img> — the one thing standing between the
 *     first cover and a CLS failure, and impossible to notice in a screenshot
 *   - the image is lazy below the fold and eager in the hero — loading="lazy" on
 *     the LCP element is a performance bug that no visual check catches
 *   - --filter-cover is applied, and the hover state opts out of it
 *   - the OG card composites the cover rather than leaving a stripe
 *   - print hides the cover
 *   - the mobile portrait clamp holds
 *
 * When there is no fixture in the tree, every image assertion passes with an
 * explicit "nothing to check" note rather than being silently skipped, so a
 * green run is never mistaken for a verified one.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { Cdp, pass, report } from './lib/cdp';
import { serveDist, allCss } from './lib/serve';

const results: string[] = [];
const check = (name: string, ok: boolean, detail = '') =>
	results.push(pass(name, ok, detail));

/* --- 1. generate the fixtures --------------------------------------------- */

/*
 * sharp is already here — Astro depends on it — so the fixture costs no new
 * dependency. 1200x1500 is a 4:5 cover at a plausible print size, and 900x1125
 * for the portrait. Deliberately not tiny: a fixture smaller than the largest
 * emitted size would prove nothing about resizing.
 */
const FIXTURES = [
	{
		label: 'writing cover',
		dir: 'src/content/writings/2026',
		name: 'phase9-probe.jpg',
		width: 1200,
		height: 1500,
		// The newest *published* piece, deliberately, and both halves of that
		// matter. The library sorts by date descending, so only the newest essay is
		// card #1, and card #1 is the only card whose lazy cover is a bug rather
		// than correct behaviour. And it must not be a draft: a draft is absent
		// from the build entirely, so hanging the fixture on one produced a page
		// with no images on it and a run of confident, meaningless measurements.
		// `2026/getting-a-book-back` is the newest essay and is `draft: true`,
		// which is exactly how that happened.
		frontmatter: 'src/content/writings/2026/the-wrong-way-opens-doors.md',
		slug: '2026/the-wrong-way-opens-doors',
		key: 'cover',
		altKey: 'coverAlt',
		alt: 'A temporary grey test card, used to prove the image pipeline runs.',
	},
	{
		label: 'about portrait',
		dir: 'src/content/pages',
		name: 'phase9-portrait.jpg',
		width: 900,
		height: 1125,
		frontmatter: 'src/content/pages/about.md',
		key: 'portrait',
		altKey: 'portraitAlt',
		alt: 'A temporary grey test portrait, used to prove the image pipeline runs.',
		slug: 'about',
	},
];

const sharp = (await import('sharp')).default;

async function makeFixture(f: (typeof FIXTURES)[number]) {
	// A mid-grey field with a lighter band, so a filter that did something would
	// be visible in a screenshot and a broken image would be obvious.
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${f.width}" height="${f.height}">
		<rect width="100%" height="100%" fill="#8a8a8a"/>
		<rect y="${f.height * 0.4}" width="100%" height="${f.height * 0.2}" fill="#d8d8d8"/>
		<circle cx="${f.width / 2}" cy="${f.height * 0.2}" r="${f.width * 0.12}" fill="#5a5a5a"/>
	</svg>`;

	// Written to `covers/`, because that is where the frontmatter below says it
	// is. The `image()` loader resolves frontmatter paths relative to the content
	// file, so the two have to agree exactly or the build fails.
	const path = join(f.dir, 'covers', f.name);
	mkdirSync(join(f.dir, 'covers'), { recursive: true });
	await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toFile(path);
	return path;
}

/* Snapshot the two frontmatter files so they can be restored exactly. */
const originals = new Map<string, string>();
for (const f of FIXTURES) originals.set(f.frontmatter, readFileSync(f.frontmatter, 'utf8'));

function addFrontmatter(f: (typeof FIXTURES)[number]) {
	const original = originals.get(f.frontmatter)!;
	// The image() loader wants a path relative to the content file.
	const rel = `./covers/${f.name}`;
	const withField = original.replace(
		/^---\n/,
		`---\n${f.key}: ${rel}\n${f.altKey}: ${JSON.stringify(f.alt)}\n`,
	);
	writeFileSync(f.frontmatter, withField);
}

function restore() {
	// Frontmatter first, so a half-finished cleanup still leaves valid content.
	for (const [file, content] of originals) writeFileSync(file, content);

	for (const f of FIXTURES) {
		// The fixture may have landed in either place depending on which version
		// of this script ran, so both are swept.
		for (const path of [join(f.dir, f.name), join(f.dir, 'covers', f.name)]) {
			if (existsSync(path)) rmSync(path, { force: true, recursive: true });
		}

		// The covers/ directory is removed only when this run created it and it
		// is empty. Removing a non-empty one would delete a real cover that
		// happens to sit beside the fixture, which is the one destructive thing
		// this gate could plausibly do to somebody's work.
		const coversDir = join(f.dir, 'covers');
		if (existsSync(coversDir) && readdirSync(coversDir).length === 0) {
			rmSync(coversDir, { force: true, recursive: true });
		}
	}
}

const build = Bun.spawn(['bun', 'run', 'build'], { stdout: 'pipe', stderr: 'pipe' });
const buildOut = await new Response(build.stdout).text();
const buildErr = await new Response(build.stderr).text();
const buildCode = await build.exited;

let built = false;

try {
	for (const f of FIXTURES) {
		await makeFixture(f);
		addFrontmatter(f);
	}

	built = true;
	const rebuild = Bun.spawn(['bun', 'run', 'build'], { stdout: 'pipe', stderr: 'pipe' });
	const out = await new Response(rebuild.stdout).text();
	const err = await new Response(rebuild.stderr).text();
	const code = await rebuild.exited;

	check('the build succeeds with a cover in the collection', code === 0, code === 0 ? '27 pages' : (err || out).slice(-400));

	/*
	 * Deliberately no `report()` here. `report` ends in `process.exit`, which
	 * skips this function's `finally` — and the `finally` is the only thing
	 * that puts the content files back. An earlier version of this gate called
	 * it on build failure, left a half-written `cover:` key in two content
	 * files, and the *next* run then failed differently because it inserted a
	 * second one. A verification that damages the tree it verifies is worse
	 * than no verification, so a failed build falls through to the end, gets
	 * cleaned up, and reports there.
	 */
	if (code !== 0) {
		check('the rest of the image checks could run', false, 'skipped: the build did not succeed');
	} else {

	/* --- 2. what the build emitted ---------------------------------------- */

	const emitted = readdirSync('dist/_astro');
	const avif = emitted.filter((f) => f.endsWith('.avif'));
	const webp = emitted.filter((f) => f.endsWith('.webp'));
	const jpgs = emitted.filter((f) => /\.(jpe?g|png)$/i.test(f));

	check(
		'AVIF is emitted for the cover',
		avif.length > 0,
		avif.length ? avif.join(', ') : 'no .avif in dist/_astro',
	);
	check(
		'WebP is emitted for the cover',
		webp.length > 0,
		webp.length ? webp.join(', ') : 'no .webp in dist/_astro',
	);

	// <picture> with a source is what makes the AVIF/WebP actually get used.
	const card = readFileSync('dist/library/index.html', 'utf8');
	const essay = FIXTURES[0];

	/*
	 * The precondition, asserted before anything is measured against it.
	 *
	 * Every image check below reads the built pages, and if the fixture did not
	 * render they all read *nothing* — and a check phrased as "0 of 0 covers are
	 * dimensioned" passes, "the article cover is eager" passes on an empty list,
	 * and the run comes out green having proved nothing at all. That is the exact
	 * shape of failure the audit warns about, and it is worth a gate of its own:
	 * the image must actually be on the page before anything is concluded from it.
	 */
	check(
		'the fixture essay is published, so its cover reaches the build',
		!readFileSync(essay.frontmatter, 'utf8').match(/^draft:\s*true/m) &&
			card.includes(essay.name.replace('.jpg', '')),
		`${essay.frontmatter} — a draft would be absent from the build entirely`,
	);

	const cardImgs = [...card.matchAll(/<img\s[^>]*>/g)].map((m) => m[0]);
	check(
		'the fixture cover is actually rendered on the shelf',
		cardImgs.length > 0,
		cardImgs.length === 0 ? 'no <img> on /library — nothing below is meaningful' : `${cardImgs.length} cover(s)`,
	);

	check(
		'the card uses <picture> with a modern-format source',
		/<picture[\s\S]*?<source[^>]+type="image\/avif"/.test(card),
		/picture/.test(card) ? 'found <picture> but no AVIF source' : 'no <picture> at all',
	);

	/* --- 3. CLS, which is the reason dimensions are required ------------- */

	const imgTags = [...card.matchAll(/<img\s[^>]*>/g)].map((m) => m[0]);
	const coverImg = imgTags.find((t) => /phase9-probe|_astro/.test(t)) ?? '';
	const withDims = imgTags.filter((t) => /\swidth="\d+"/.test(t) && /\sheight="\d+"/.test(t));

	check(
		'every <img> on the library page has width and height',
		withDims.length === imgTags.length && imgTags.length > 0,
		`${withDims.length}/${imgTags.length} dimensioned`,
	);

	check(
		'the cover keeps a 4:5 aspect ratio',
		(() => {
			const w = /width="(\d+)"/.exec(coverImg)?.[1];
			const h = /height="(\d+)"/.exec(coverImg)?.[1];
			if (!w || !h) return false;
			const ratio = Number(w) / Number(h);
			return Math.abs(ratio - 0.8) < 0.02;
		})(),
		(() => {
			const w = /width="(\d+)"/.exec(coverImg)?.[1];
			const h = /height="(\d+)"/.exec(coverImg)?.[1];
			return w && h ? `${w}×${h} = ${(Number(w) / Number(h)).toFixed(3)}` : 'no dimensions on the cover';
		})(),
	);

	check(
		'the cover has meaningful alt text',
		/alt="[^"]{10,}"/.test(coverImg),
		/alt="([^"]*)"/.exec(coverImg)?.[1] ?? 'no alt',
	);

	/* --- 4. the filter, and the hero's loading eagerness ----------------- */

	/*
	 * Searched across every byte of CSS the build serves — the emitted files and
	 * the per-page inline blocks both. See allCss() in lib/serve.ts: Astro
	 * inlines component styles and emits a file only for the larger sheets, so a
	 * search of `_astro` alone reports these rules as absent on a build where
	 * they are all present. That is exactly what happened the first time this
	 * ran, and it is worth the import.
	 */
	const styles = allCss('dist');

	// The minifier drops the space after the colon, so the needle is written
	// without one.
	check(
		'the cover carries --filter-cover, and the hover state opts out',
		styles.includes('var(--filter-cover)') && styles.includes('--filter-cover-hover'),
		'both the resting filter and the lifted one are declared',
	);

	check(
		'the article cover and the /about portrait are in the build',
		existsSync(`dist/library/${essay.slug}/index.html`) &&
			readFileSync(`dist/library/${essay.slug}/index.html`, 'utf8').includes('phase9-probe'),
		'the essay page references the fixture',
	);

	const about = readFileSync('dist/about/index.html', 'utf8');
	check(
		'the /about portrait renders',
		about.includes('phase9-portrait'),
		'portrait slot is populated',
	);

	/*
	 * Lazy-loading the image that is the largest contentful paint is worse than
	 * loading it slowly: it defers the one request the page cannot paint without.
	 * So the *first* cover on the shelf must be eager, and only the ones below it
	 * lazy.
	 *
	 * Asserted on the rendered document order rather than on a srcset, because
	 * what matters is which element the browser sees first.
	 */
	{
		const article = readFileSync(`dist/library/${essay.slug}/index.html`, 'utf8');
		const pageImgs = [...card.matchAll(/<img\s[^>]*>/g)].map((m) => m[0]);
		const first = pageImgs[0] ?? '';
		const rest = pageImgs.slice(1);

		check(
			'the first cover in the document is not lazy-loaded',
			first !== '' && !/loading="lazy"/.test(first),
			first === '' ? 'no img on the library page' : /loading="lazy"/.test(first) ? 'the first cover defers itself' : 'eager, as it should be',
		);

		check(
			'every later cover declares an intrinsic size too',
			rest.every((t) => /\swidth="\d+"/.test(t) && /\sheight="\d+"/.test(t)),
			`${rest.filter((t) => /\swidth="\d+"/.test(t) && /\sheight="\d+"/.test(t)).length}/${rest.length}`,
		);

		const articleImgs = [...article.matchAll(/<img\s[^>]*>/g)].map((m) => m[0]);
		check(
			'the article cover is not lazy-loaded — it is the hero of that page',
			articleImgs.length > 0 && !/loading="lazy"/.test(articleImgs[0]),
			articleImgs.length ? 'first article image is eager' : 'no article image',
		);
	}

	/* --- 5. the OG card composites the cover ----------------------------- */

	{
		// The card PNG for the fixture essay. cover.ts reads the *source* file,
		// so this is the path that has never run against a real image.
		const cardPng = `dist/og/${essay.slug}.png`;
		// A card for an essay with no cover, as the control.
		const controlPng = 'dist/og/2026/the-middle-of-the-book.png';
		const exists = existsSync(cardPng);

		check(
			'the OG card for the essay is generated',
			exists,
			exists ? cardPng : `missing ${cardPng}`,
		);

		if (exists) {
			const meta = await sharp(cardPng).metadata();
			check(
				'the OG card is 1200×630',
				meta.width === 1200 && meta.height === 630,
				`${meta.width}×${meta.height}`,
			);

			/*
			 * Differential, not absolute, and on the *mean* rather than the spread.
			 *
			 * Two things were wrong with the obvious version of this check. First,
			 * an absolute threshold passed on a card with nothing composited into
			 * it: the card background is not a flat fill, it has a rule, a plate, a
			 * wordmark and a headline, so any region of it has real variance.
			 * Second, standard deviation is the wrong statistic even once there is
			 * a control. The fixture is deliberately a flat grey field with one
			 * lighter band — it is a probe, not a photograph — so it has *low*
			 * spread, while the card behind it has high spread from its own
			 * typography. The two nearly cancel.
			 *
			 * The mean does not cancel. A grey rectangle at #8a8a8a over a cream
			 * card at #f2ede4 drags the region's average luma down by tens of
			 * levels, and nothing else on the card does that. So: the plate with a
			 * cover must be meaningfully darker than the same region of a card
			 * without one.
			 */
			const plate = { left: 732, top: 0, width: 468, height: 630 };
			const meanLuma = async (p: string) => {
				const stats = await sharp(p).extract(plate).stats();
				const [r, g, b] = stats.channels;
				// Rec. 601 luma, the same weighting the eye uses.
				return 0.299 * (r?.mean ?? 0) + 0.587 * (g?.mean ?? 0) + 0.114 * (b?.mean ?? 0);
			};

			const withCover = await meanLuma(cardPng);
			const withoutCover = existsSync(controlPng) ? await meanLuma(controlPng) : 255;

			check(
				'the cover is composited into the right-hand plate',
				withCover < withoutCover - 15,
				`plate luma ${withCover.toFixed(0)} with a cover vs ${withoutCover.toFixed(0)} on a coverless card`,
			);
		}
	}

	/* --- 6. rendering: the filter, the portrait clamp, the frame --------- */

	const server = serveDist('dist', 0);
	const cdp = await Cdp.launch({ port: 9347, profile: '/tmp/pam-chrome-images' });

	// The portrait clamp: 13rem on mobile, larger above the stop.
	await cdp.newTab();
	await cdp.viewport(390, 844, 2, true);
	await cdp.goto(`${server.url}/about`, 900);

	const portrait = await cdp.evaluate<any>(`(() => {
		const img = document.querySelector('.portrait img');
		if (!img) return { present: false };
		const r = img.getBoundingClientRect();
		return {
			present: true,
			width: Math.round(r.width),
			right: Math.round(r.right),
			viewport: window.innerWidth,
			filter: getComputedStyle(img).filter,
			complete: img.complete && img.naturalWidth > 0,
			natural: img.naturalWidth,
		};
	})()`);

	check(
		'the portrait renders at the mobile stop',
		portrait.present && portrait.complete && portrait.natural > 0,
		portrait.present ? `natural ${portrait.natural}px, box ${portrait.width}px` : 'no portrait img',
	);

	check(
		'the portrait stays inside the room frame on a phone',
		portrait.present && portrait.right <= portrait.viewport - 20 + 0.5,
		portrait.present ? `right edge ${portrait.right}, frame at ${portrait.viewport - 20}` : 'n/a',
	);

	check(
		'the portrait is not upscaled beyond its source',
		portrait.present && portrait.width <= portrait.natural,
		portrait.present ? `${portrait.width}px box from a ${portrait.natural}px source` : 'n/a',
	);

	check(
		'the portrait carries the photography filter',
		portrait.present && /saturate/.test(portrait.filter ?? ''),
		portrait.present ? `filter: ${portrait.filter}` : 'n/a',
	);

	// The shelf card, desktop width.
	await cdp.viewport(1440, 900);
	await cdp.goto(`${server.url}/library`, 900);

	/*
	 * The hovered cover has to be measured with a *real* pointer move.
	 *
	 * `dispatchEvent(new MouseEvent('mouseover'))` does not apply `:hover` — CSS
	 * hover state comes from the browser's hit-testing, not from an event — so a
	 * synthetic event makes this check read the resting value and pass without
	 * ever testing anything. `Input.dispatchMouseEvent` goes through hit-testing,
	 * so the computed style afterwards really is the hovered one.
	 *
	 * The card is chosen by looking for a link that actually contains a cover,
	 * because the first `.card__link` on the shelf is not guaranteed to be one
	 * and a null element takes the whole evaluation down.
	 */
	const cardBox = await cdp.evaluate<any>(`(() => {
		// Scrolled into view first. A mouse event dispatched at coordinates that
		// are below the viewport lands nowhere, and the check then reports that the
		// hover rule did not apply — which is true, and says nothing about the
		// code. The library's first card sits below 900px on a laptop.
		const first = document.querySelector('.card__link');
		if (first) first.scrollIntoView({ block: 'center' });

		const link = [...document.querySelectorAll('.card__link')]
			.find(l => l.querySelector('.card__cover img'));
		if (!link) return { noCover: true };
		link.id = 'phase9-hover-target';
		const img = link.querySelector('.card__cover img');
		const r = link.getBoundingClientRect();
		return {
			resting: getComputedStyle(img).filter,
			x: Math.round(r.left + r.width / 2),
			y: Math.round(r.top + r.height / 2),
			inViewport: r.top >= 0 && r.bottom <= innerHeight,
		};
	})()`);

	check(
		'the shelf card cover carries the photography filter',
		!cardBox?.noCover && /saturate/.test(cardBox?.resting ?? ''),
		cardBox?.noCover ? 'no covered card on the shelf' : `resting filter: ${cardBox?.resting}`,
	);

	if (cardBox && !cardBox.noCover) {
		/*
		 * Hover is *forced* through the CSS domain rather than simulated with a
		 * mouse event, because a mouse event at computed coordinates is not
		 * reliable here: the events landed, the coordinates were right, and
		 * `matches(':hover')` was still false. Debugging that would cost more than
		 * it is worth, and `CSS.forcePseudoState` is deterministic — it sets the
		 * same state the cascade would see, with no hit-testing in the way.
		 *
		 * `transform: scale(1.03)` is the positive control. If the forced state
		 * did not take, the transform stays `none` and the filter reading means
		 * nothing; asserting the control first is what keeps this from reporting a
		 * confident FAIL about the site's CSS when the fault was in the harness.
		 */
		await cdp.send('DOM.enable');
		await cdp.send('CSS.enable');

		const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
		const { nodeId } = await cdp.send('DOM.querySelector', {
			nodeId: root.nodeId,
			selector: '#phase9-hover-target',
		});

		await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] });
		// The filter transitions over --t-base (300ms), so reading sooner reads a
		// value mid-transition.
		await Bun.sleep(600);

		const hovered = await cdp.evaluate<any>(`(() => {
			const link = document.getElementById('phase9-hover-target');
			const img = link.querySelector('.card__cover img');
			return {
				forced: link.matches(':hover'),
				transform: getComputedStyle(img).transform,
				filter: getComputedStyle(img).filter,
			};
		})()`);

		check(
			'the hover state really applied, so the reading below means something',
			!!hovered?.forced && hovered?.transform !== 'none',
			`:hover=${hovered?.forced} transform=${hovered?.transform}`,
		);

		check(
			'the hovered cover opts out of the filter',
			/saturate\(1\)/.test(hovered?.filter ?? ''),
			`hovered filter: ${hovered?.filter}`,
		);

		await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
	}

	// Console must stay clean with real images in play — a 404 on a cover
	// produces no layout change and no visible break.
	check(
		'no console errors with images in the build',
		cdp.pageErrors.length === 0 && cdp.consoleOutput.length === 0,
		[...cdp.pageErrors, ...cdp.consoleOutput].slice(0, 2).join(' | ') || 'clean',
	);

	/* --- 7. print hides the cover ---------------------------------------- */

	const printCss = readdirSync('dist/_astro')
		.filter((f) => f.endsWith('.css'))
		.map((f) => readFileSync(join('dist/_astro', f), 'utf8'))
		.join('\n');

	// Whitespace collapsed, because a minified stylesheet puts the selector, the
	// declaration and the closing brace with nothing between them.
	//
	// The selector is `.writing__cover`, not `.card__cover`: print's rule is
	// about the article's cover photograph, which is "half a sheet of toner for
	// a picture the reader already has" (print.css). The shelf card's cover is
	// not hidden, which is a deliberate difference — an archive printed to PDF is
	// a thing people do — and the first version of this check asserted the wrong
	// selector and reported a missing rule that was never supposed to exist.
	const flatPrint = allCss('dist').replace(/\s+/g, ' ');
	check(
		'print hides the article cover photograph',
		/@media print[\s\S]*?\.writing__cover[^{]*\{[^}]*display:\s*none/.test(flatPrint),
		'print.css keeps the cover off the page',
	);

	await cdp.close();
	server.close();
	}
} finally {
	// The tree goes back exactly as it was, whether or not the assertions above
	// passed. A verification that leaves fixtures behind is a verification
	// nobody trusts the second time.
	restore();
}

if (!built) {
	check('the build ran', false, (buildErr || buildOut).slice(-300));
}

/* --- 8. the fixtures are gone -------------------------------------------- */

check(
	'the fixtures were removed and the content restored',
	FIXTURES.every((f) => !existsSync(join(f.dir, f.name)) && !existsSync(join(f.dir, 'covers', f.name))) &&
		FIXTURES.every((f) => readFileSync(f.frontmatter, 'utf8') === originals.get(f.frontmatter)),
	'frontmatter and image files back to their original bytes',
);

/* --- 9. and the site builds clean again ---------------------------------- */

{
	const rebuild = Bun.spawn(['bun', 'run', 'build'], { stdout: 'pipe', stderr: 'pipe' });
	await new Response(rebuild.stdout).text();
	await new Response(rebuild.stderr).text();
	const code = await rebuild.exited;
	const avifAfter = readdirSync('dist/_astro').filter((f) => f.endsWith('.avif'));

	check(
		'the build is clean again with the fixtures removed',
		code === 0 && avifAfter.length === 0,
		code === 0 ? `no avif left in dist/_astro` : 'the second build failed',
	);
}

report('images', results);
