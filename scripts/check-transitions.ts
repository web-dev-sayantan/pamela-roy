/**
 * The crossfade gate.
 *
 *   bun run scripts/check-transitions.ts
 *
 * §9 of the design spec asks for a crossfade between pages, "no slide, 300ms
 * ease-out", and this is what it costs. A view transition is not an animation
 * added to a site — it is a site whose documents are assembled at runtime, so
 * every handler bound on the first page is bound to markup that the next
 * navigation throws away, and every piece of state the browser keeps on <html>
 * is thrown away with it.
 *
 * Both halves of that have already broken something here, silently, and both
 * are invisible to a screenshot: a night reader was handed the day room halfway
 * down a link, and the lamp was made invisible by the loss of the `js` class.
 * So the checks are written against the two questions a reader would actually
 * ask — *did the page move, and is the page still working?* — rather than
 * against the class names that make either true.
 */
import { Cdp, ORIGIN, pass, report } from './lib/cdp';

const PORT = 9342;
const results: string[] = [];
const check = (name: string, ok: boolean, detail = '') => results.push(pass(name, ok, detail));

/** An article with a contents list and a reading bar, so both can be tested. */
const ARTICLE = '/library/2026/the-middle-of-the-book';

const cdp = await Cdp.launch({ port: PORT, profile: '/tmp/pam-chrome-transitions' });
await cdp.newTab();
await cdp.viewport(1280, 800);

/**
 * Click a real link and wait for the swap to finish.
 *
 * A link the page actually renders, not a synthesised one: the router listens
 * for clicks on anchors and hands them to the transition, so clicking anything
 * else would test the fallback instead of the feature.
 */
async function follow(href: string) {
	await cdp.evaluate(`(() => {
		const link = document.querySelector('a[href="${href}"]')
			?? Object.assign(document.body.appendChild(document.createElement('a')), { href: ${JSON.stringify(href)} });
		link.click();
		return true;
	})()`);
	await Bun.sleep(700);
}

/** The state a reader could see: where they are, and what the room looks like. */
const room = () =>
	cdp.evaluate<{ path: string; js: boolean; theme?: string; choice?: string }>(`(() => {
		const lamp = document.querySelector('[data-lamp]');
		return {
			path: location.pathname + location.search,
			js: document.documentElement.classList.contains('js'),
			theme: document.documentElement.dataset.theme,
			choice: document.documentElement.dataset.themeChoice,
			// A control that is present but invisible is not a control.
			lampUsable: !!lamp && !lamp.hasAttribute('hidden') && lamp.offsetParent !== null,
		};
	})()`);

/* --- 1. the router is actually on, and this browser can do the animation ---- */
await cdp.goto(`${ORIGIN}/`);
{
	const enabled = await cdp.evaluate<boolean>(
		`!!document.querySelector('[name="astro-view-transitions-enabled"]')`,
	);
	check('the router is enabled on every page', enabled);

	// Stated rather than assumed. Without it the animation checks below would
	// pass on a browser that never animated anything.
	const supported = await cdp.evaluate<boolean>(`!!document.startViewTransition`);
	check('this browser can run a view transition', supported, supported ? '' : 'the rest of this gate is meaningless');
}

/* --- 2. a link swaps the document instead of reloading it ------------------ */
{
	await cdp.evaluate(`window.__notAReload = true; true`);
	await follow('/about');

	const after = await cdp.evaluate<{ path: string; same: boolean }>(`(() => ({
		path: location.pathname,
		same: window.__notAReload === true,
	}))()`);

	check('following a link changes the page', after.path === '/about', after.path);
	// The marker is the assertion: it can only survive if the JavaScript
	// context did, which is the whole difference between a swap and a load.
	check('and it did it without loading a new document', after.same);
}

/* --- 3. the crossfade is the site's own: 300ms, opacity, no slide ----------- */
{
	// Read the running animations at the moment the transition is ready, which
	// is the only moment the pseudo-elements exist.
	await cdp.evaluate(`(() => {
		window.__transition = null;
		const start = document.startViewTransition.bind(document);
		document.startViewTransition = (cb) => {
			const vt = start(cb);
			vt.ready.then(() => {
				window.__transition = document.getAnimations()
					.filter((a) => (a.effect?.pseudoElement ?? '').includes('view-transition'))
					.map((a) => ({
						pseudo: a.effect.pseudoElement,
						name: a.animationName,
						duration: a.effect.getTiming().duration,
						keyframes: a.effect.getKeyframes(),
					}));
			});
			return vt;
		};
		return true;
	})()`);

	await follow('/services');

	const anims = await cdp.evaluate<any[]>(`window.__transition`);
	const oldFade = anims.find((a) => a.pseudo === '::view-transition-old(root)');
	const newFade = anims.find((a) => a.pseudo === '::view-transition-new(root)');
	const group = anims.find((a) => a.pseudo === '::view-transition-group(root)');

	check('the old page fades out', !!oldFade, oldFade ? oldFade.name : 'no animation on ::view-transition-old(root)');
	check('the new page fades in', !!newFade, newFade ? newFade.name : 'no animation on ::view-transition-new(root)');

	// §9: 300ms. The tokens are the site's own, so this is measuring the spec
	// rather than restating it.
	check(
		'over 300ms, the duration the motion table asks for',
		oldFade?.duration === 300 && newFade?.duration === 300,
		`${oldFade?.duration}/${newFade?.duration}`,
	);

	// Opacity and nothing else. A keyframe carrying a transform, a width or a
	// height is a slide or a zoom wearing a fade's clothes, and it is the one
	// thing §9 rules out by name.
	const moved = [oldFade, newFade].flatMap((a) =>
		(a?.keyframes ?? []).filter((k) => 'transform' in k || 'width' in k || 'height' in k || 'left' in k || 'translate' in k),
	);
	check('nothing but opacity moves, so there is no slide', moved.length === 0, JSON.stringify(moved));

	// The root group is animated by the UA even when nothing is named. Both
	// ends have to be the same box or the page grows or shrinks under the fade.
	const box = (group?.keyframes ?? []).map((k) => `${k.width}x${k.height} ${k.transform ?? ''}`);
	check(
		'the page itself does not resize or travel during the fade',
		box.length > 0 && box.every((b) => b === box[0]),
		box.join(' → ') || 'no root group animation to read',
	);
}

/* --- 4. reduced motion gets no crossfade at all ---------------------------- */
{
	await cdp.newTab();
	await cdp.media([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
	await cdp.viewport(1280, 800);
	await cdp.goto(`${ORIGIN}/`);

	const inForce = await cdp.evaluate<boolean>(`matchMedia('(prefers-reduced-motion: reduce)').matches`);
	check('reduced motion is in force for this tab', inForce);

	await cdp.evaluate(`(() => {
		window.__transition = null;
		const start = document.startViewTransition.bind(document);
		document.startViewTransition = (cb) => {
			const vt = start(cb);
			vt.ready.then(() => {
				window.__transition = document.getAnimations()
					.filter((a) => (a.effect?.pseudoElement ?? '').includes('view-transition'))
					.map((a) => a.animationName);
			});
			return vt;
		};
		return true;
	})()`);

	await follow('/about');

	// Not "a shorter fade": a reader who asked for stillness should get a page
	// that changes, not a page that animates.
	check(
		'no crossfade is animated under reduced motion',
		(await cdp.evaluate<any[]>(`window.__transition`)).length === 0,
		(await cdp.evaluate<any[]>(`window.__transition`)).join(', '),
	);

	const arrived = await cdp.evaluate<{ path: string }>(`({ path: location.pathname })`);
	check('and the navigation still happens', arrived.path === '/about', arrived.path);
}

/* --- 5. the room survives the navigation ------------------------------------ */
{
	await cdp.newTab();
	await cdp.media([
		{ name: 'prefers-color-scheme', value: 'light' },
		{ name: 'prefers-reduced-motion', value: 'no-preference' },
	]);
	await cdp.viewport(1280, 800);

	// Seeded before the document exists, so the very first paint is night — the
	// state a reader who chose it is in. `localStorage` is unreachable on
	// about:blank, hence the seeder rather than an evaluate on the empty tab,
	// and it is removed again so it cannot quietly reseed a later navigation.
	const { identifier } = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
		source: `try { localStorage.setItem('theme', 'night') } catch {}`,
	});
	await cdp.goto(`${ORIGIN}/`);
	await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });

	const before = await room();
	await follow('/about');
	const after = await room();

	check('a night reader is still in the night room after a crossfade', after.theme === 'night', `${before.theme} → ${after.theme}`);
	// The `js` class is what hides the reveals and shows the lamp, and it lives
	// on an element whose attributes the router replaces wholesale.
	check('and the page still knows JavaScript is running', after.js && before.js);
	check('the lamp is still a usable control', after.lampUsable);
}

/* --- 6. the controls still work on a page that was swapped in -------------- */
{
	// The lamp, on a page that arrived by transition rather than by load.
	await cdp.evaluate(`document.querySelector('[data-lamp]').click()`);
	await Bun.sleep(120);
	check(
		'the lamp still dims the room on a crossfaded page',
		(await room()).theme === 'day',
		(await room()).theme ?? 'unset',
	);

	// The menu, on a narrow viewport where it is the only navigation.
	await cdp.viewport(480, 800);
	await follow('/contact');
	const menu = await cdp.evaluate<{ opened: boolean; locked: string; closed: boolean }>(`(() => {
		document.querySelector('.menu-button').click();
		const panel = document.getElementById('menu-panel');
		const opened = !panel.hidden && document.querySelector('.menu-button').getAttribute('aria-expanded') === 'true';
		const locked = document.body.style.overflow;
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		return { opened, locked, closed: panel.hidden && document.body.style.overflow === '' };
	})()`);
	check('the mobile menu still opens on a crossfaded page', menu.opened && menu.locked === 'hidden');
	check('and still closes on Escape', menu.closed);

	// The reading bar and the contents list, on an article.
	await cdp.viewport(1280, 800);
	await follow(ARTICLE);
	const article = await cdp.evaluate<{ progress: boolean; toc: boolean; bar: string; current: string | null }>(`(() => {
		scrollTo(0, (document.body.scrollHeight - innerHeight) / 2);
		return new Promise((ok) => setTimeout(() => ok({
			progress: !!document.querySelector('.progress'),
			toc: !!document.querySelector('.toc'),
			bar: document.querySelector('.progress')?.style.getPropertyValue('--progress') ?? '',
			current: document.querySelector('.toc a[aria-current]')?.textContent?.trim() ?? null,
		}), 400));
	})()`);
	check('the reading bar still fills on a crossfaded article', article.progress && Number(article.bar) > 0, `--progress: ${article.bar || 'unset'}`);
	check('the contents list still marks where you are', article.toc && !!article.current, article.current ?? 'nothing marked');
}

/* --- 7. a crossfaded page arrives whole ------------------------------------- */
{
	/*
	 * Read at `astro:page-load`, not after a pause.
	 *
	 * That event is the last moment before the browser photographs the new page
	 * — the photograph is what the reader watches fade in, and it captures
	 * whatever the DOM says at that instant. Anything still waiting on a reveal
	 * is photographed *invisible*, so the page lands as a header and a title
	 * with its own content trickling in a beat later. A check that waited for
	 * the page to settle would watch the reveal finish and call that fine: the
	 * defect is entirely in the half-second before it does.
	 */
	await cdp.evaluate(`(() => {
		window.__arrival = null;
		document.addEventListener('astro:page-load', () => {
			window.__arrival = {
				total: document.querySelectorAll('[data-reveal]').length,
				waiting: document.querySelectorAll('[data-reveal]:not(.is-visible)').length,
			};
		}, { once: true });
		return true;
	})()`);

	await follow('/');

	const arrival = await cdp.evaluate<{ total: number; waiting: number } | null>(`window.__arrival`);
	check(
		'a page that arrives by crossfade is already showing its content',
		!!arrival && arrival.total > 0 && arrival.waiting === 0,
		arrival ? `${arrival.total - arrival.waiting}/${arrival.total} shown when it arrived` : 'the page never loaded',
	);
}

/* --- 8. the back button, and the state that lives in the URL ---------------- */
{
	await follow('/library');

	// The filter writes its state into the address, and the router keeps its own
	// history state in the same place. A filter that nulled the state would
	// leave the back button unable to do its job.
	await cdp.evaluate(`(() => {
		document.querySelector('[data-filter-topic="craft"]').click();
		return true;
	})()`);
	await Bun.sleep(200);

	const filtered = await cdp.evaluate<{ search: string; narrowed: boolean; state: unknown }>(`(() => ({
		search: location.search,
		narrowed: document.querySelectorAll('[data-topic][hidden]').length > 0,
		state: history.state,
	}))()`);
	check('the filter still narrows the shelf after a crossfade', filtered.search.includes('topic=craft') && filtered.narrowed, filtered.search);
	check('and leaves the router its history state', !!filtered.state && typeof filtered.state === 'object', JSON.stringify(filtered.state));

	await follow(ARTICLE);
	await cdp.evaluate(`history.back()`);
	await Bun.sleep(900);

	const back = await cdp.evaluate<{ path: string; pressed: string | null }>(`(() => ({
		path: location.pathname + location.search,
		pressed: document.querySelector('[data-filter-topic="craft"]')?.getAttribute('aria-pressed') ?? null,
	}))()`);
	check(
		'the back button returns to the filtered page, still filtered',
		back.path === '/library?topic=craft' && back.pressed === 'true',
		`${back.path}, craft pressed: ${back.pressed}`,
	);
}

/* --- 9. the back button returns to the *place*, not just the page ----------- */
{
	// A page read to the foot, left, and returned to. What the router restores
	// is the reader's place on it, and the site's own `scroll-behavior: smooth`
	// turns that restore into an animation: the page crossfades in at the top
	// and then glides down to where they were, a second move finishing after the
	// transition that was supposed to have replaced it. Nothing looks broken;
	// it just feels like the site is still loading.
	await cdp.goto(`${ORIGIN}/library`);
	await cdp.evaluate(`scrollTo(0, 1200)`);
	await Bun.sleep(300);

	const left = await cdp.evaluate<number>(`Math.round(scrollY)`);
	await follow(ARTICLE);

	await cdp.evaluate(`history.back()`);
	// Read early on purpose: a glide is invisible at 900ms and obvious at 60ms.
	await Bun.sleep(60);
	const early = await cdp.evaluate<number>(`Math.round(scrollY)`);
	await Bun.sleep(840);
	const settled = await cdp.evaluate<number>(`Math.round(scrollY)`);

	check(
		'the back button restores the reading position at once, not after a glide',
		Math.abs(early - left) < 40,
		`left at ${left}px, 60ms after Back: ${early}px, settled: ${settled}px`,
	);
}

console.log('console warnings or errors:', cdp.consoleOutput.length, cdp.pageErrors.length);
check('nothing logged an error along the way', cdp.pageErrors.length === 0, cdp.pageErrors.join(' | '));

await cdp.close();
report('view transitions', results);
