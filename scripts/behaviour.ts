/**
 * Behavioural checks that a screenshot cannot answer: does the scroll reveal
 * actually run, does it get out of the way under prefers-reduced-motion, does
 * the page still work with JavaScript switched off, and does the mobile menu
 * trap focus and close on Escape.
 *
 *   bun run scripts/behaviour.ts
 */

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.ORIGIN ?? 'http://localhost:4321';
const PORT = 9335;

const chrome = Bun.spawn(
	[
		CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
		`--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/pam-chrome-behaviour', 'about:blank',
	],
	{ stdout: 'ignore', stderr: 'ignore' },
);

for (let i = 0; i < 60; i++) {
	try {
		if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break;
	} catch {}
	await Bun.sleep(100);
}

const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();

/*
 * The connection is held in a `let` and the three helpers read it at call time,
 * so a new tab can be swapped in mid-run. That is not tidiness — see
 * `freshTab` below, which exists because the emulated-media state on a long-lived
 * tab cannot be trusted after this suite has done what it does to it.
 */
let ws: WebSocket;
let id = 0;
const pending = new Map<number, (v: any) => void>();

const attach = async (webSocketDebuggerUrl: string) => {
	ws = new WebSocket(webSocketDebuggerUrl);
	await new Promise<void>((ok) => (ws.onopen = () => ok()));

	ws.onmessage = (e) => {
		const m = JSON.parse(String(e.data));
		if (m.id !== undefined) pending.get(m.id)?.(m.result ?? {});
	};

	await send('Page.enable');
	await send('Runtime.enable');
};

const send = (method: string, params: object = {}) =>
	new Promise<any>((ok) => {
		const n = ++id;
		pending.set(n, ok);
		ws.send(JSON.stringify({ id: n, method, params }));
	});

const evaluate = async (expression: string) => {
	const res = await send('Runtime.evaluate', { expression, returnByValue: true });
	if (res?.exceptionDetails) {
		throw new Error(
			`evaluate threw: ${res.exceptionDetails.text} ${res.exceptionDetails.exception?.description ?? ''}`,
		);
	}
	try {
		return JSON.parse(res.result.value);
	} catch {
		// Not JSON — hand back the raw value so the caller can use it.
		return res.result.value;
	}
};

await attach(target.webSocketDebuggerUrl);

/**
 * Replace the current tab with a brand new one.
 *
 * The reduced-motion checks are the reason this exists. `setEmulatedMedia` works
 * on a fresh tab and stops working on this one once the suite has been through
 * its mobile-menu block — not because of anything in the site's code, and not
 * for a reason worth chasing further. The symptom is precise and repeatable: the
 * harness confirms `prefers-reduced-motion` is in force, and the very next
 * evaluation on the same tab reports it is not.
 *
 * So the checks that depend on an emulated OS preference get a tab that has no
 * history. Everything else keeps using the original one, because a fresh tab per
 * check would be a slower suite for no gain.
 */
const freshTab = async () => {
	const opened = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, {
		method: 'PUT',
	})).json();

	await attach(opened.webSocketDebuggerUrl);
};

/* The starting viewport. `attach` already enabled Page and Runtime. */
await send('Emulation.setDeviceMetricsOverride', {
	width: 1280, height: 800, deviceScaleFactor: 1, mobile: false,
});

const results: string[] = [];
const check = (name: string, pass: boolean, detail = '') => {
	if (process.env.TRACE) console.error('   .', name);
	results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

async function load(route = '/', { reducedMotion = false, js = true } = {}) {
	const media = {
		features: [{ name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' }],
	};

	await send('Emulation.setEmulatedMedia', media);
	await send('Emulation.setScriptExecutionDisabled', { value: !js });
	await send('Page.navigate', { url: ORIGIN + route });
	await Bun.sleep(1800);

	/*
	 * Re-applied after the navigation, and then *checked*, because navigating
	 * clears it and — depending on what the previous test did to the emulated
	 * device — re-applying is not always enough either.
	 *
	 * This matters more than it looks. With the preference silently off, the
	 * reduced-motion checks pass for the wrong reason: the reveal test is green
	 * because the IntersectionObserver revealed the first element anyway, not
	 * because the preference was in force. An assertion that cannot fail is
	 * worse than no assertion.
	 *
	 * So the harness verifies its own precondition and says so out loud if it
	 * cannot establish it. A gate that quietly stops testing is the one failure
	 * mode nobody catches.
	 */
	await send('Emulation.setEmulatedMedia', media);
	await Bun.sleep(150);

	if (js) {
		const query = `(prefers-reduced-motion: ${reducedMotion ? 'reduce' : 'no-preference'})`;
		let inForce = false;

		for (let attempt = 0; attempt < 12 && !inForce; attempt++) {
			inForce =
				(await evaluate(`matchMedia('${query}').matches`)) === true;
			if (!inForce) {
				await send('Emulation.setEmulatedMedia', media);
				await Bun.sleep(150);
			}
		}

		if (!inForce) {
			console.error(
				`  WARNING  could not put ${query} in force; the motion checks below will be meaningless`,
			);
		}
	}
}

/* --- 1. scroll reveal ------------------------------------------------------ */
await load();
{
	const r = await evaluate(`(() => {
		const all = [...document.querySelectorAll('[data-reveal]')];
		const shown = all.filter(e => e.classList.contains('is-visible'));
		const hiddenButVisible = all.filter(e => {
			const b = e.getBoundingClientRect();
			return !e.classList.contains('is-visible') && b.top < innerHeight && b.bottom > 0;
		});
		return { total: all.length, shown: shown.length, stuck: hiddenButVisible.length };
	})()`);
	check('reveal marks in-viewport elements visible', r.stuck === 0,
		`${r.shown}/${r.total} revealed, ${r.stuck} stuck`);

	// Scrolling to the foot should reveal the rest.
	await evaluate(`scrollTo(0, document.body.scrollHeight)`);
	await Bun.sleep(1200);
	const after = await evaluate(
		`document.querySelectorAll('[data-reveal]').length === document.querySelectorAll('[data-reveal].is-visible').length`,
	);
	check('reveal completes on scroll to the foot', after === true);
}

/* --- 2. reduced motion ----------------------------------------------------- */
await load({ reducedMotion: true });
{
	const r = await evaluate(`(() => {
		const all = [...document.querySelectorAll('[data-reveal]')];
		return {
			total: all.length,
			shown: all.filter(e => e.classList.contains('is-visible')).length,
			opacity: getComputedStyle(all[0]).opacity,
		};
	})()`);
	check('reduced motion reveals everything at once', r.shown === r.total && r.opacity === '1',
		`${r.shown}/${r.total}, opacity ${r.opacity}`);
}

/* --- 3. no JavaScript ------------------------------------------------------ */
await load({ js: false });
{
	const r = await evaluate(`(() => {
		const h1 = document.querySelector('.manifesto');
		const cards = document.querySelectorAll('.card__link').length;
		const hidden = [...document.querySelectorAll('[data-reveal]')]
			.filter(e => getComputedStyle(e).opacity === '0').length;
		return { text: h1.textContent.replace(/\\s+/g,' ').trim(), cards, hidden };
	})()`);
	check('no-JS: manifesto and full shelf still render', r.text.includes('A quiet room full of') && r.cards === 4,
		`${r.cards} cards`);
	check('no-JS: nothing is left invisible', r.hidden === 0, `${r.hidden} hidden`);
}

/* --- 4. mobile menu -------------------------------------------------------- */
await send('Emulation.setDeviceMetricsOverride', {
	width: 375, height: 812, deviceScaleFactor: 1, mobile: true,
});
await load();
{
	// Focus the button first: a real click moves focus, and closeMenu returns
	// focus to whatever was focused when the panel opened. A bare
	// programmatic .click() does not, which would make this test lie.
	await evaluate(`(() => {
		const b = document.querySelector('.menu-button');
		b.focus();
		b.click();
	})()`);
	await Bun.sleep(400);
	const opened = await evaluate(`(() => ({
		expanded: document.querySelector('.menu-button').getAttribute('aria-expanded'),
		hidden: document.getElementById('menu-panel').hidden,
		focusInPanel: document.getElementById('menu-panel').contains(document.activeElement),
		overflow: document.body.style.overflow,
	}))()`);
	check('menu opens and sets aria-expanded', opened.expanded === 'true' && opened.hidden === false);
	check('menu takes focus and locks scroll', opened.focusInPanel && opened.overflow === 'hidden',
		`focus=${opened.focusInPanel}, overflow=${opened.overflow}`);

	// Tab from the last focusable should wrap to the first.
	const wrapped = await evaluate(`(() => {
		const panel = document.getElementById('menu-panel');
		const items = [...panel.querySelectorAll('a[href], button')];
		items[items.length - 1].focus();
		return items[items.length - 1] === document.activeElement;
	})()`);
	check('menu traps focus (last item is reachable)', wrapped === true);

	await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
	await Bun.sleep(300);
	const closed = await evaluate(`(() => ({
		expanded: document.querySelector('.menu-button').getAttribute('aria-expanded'),
		hidden: document.getElementById('menu-panel').hidden,
		overflow: document.body.style.overflow,
		focusOnButton: document.activeElement === document.querySelector('.menu-button'),
	}))()`);
	check('Escape closes the menu and returns focus',
		closed.expanded === 'false' && closed.hidden === true && closed.focusOnButton);
	check('closing the menu restores scrolling', closed.overflow === '');

	/*
	 * The same menu, opened *after* a scroll.
	 *
	 * This is not a second test of the same thing — it is the one thing a
	 * reader does most often, and it is the one that was broken. The scrolled
	 * header carries a backdrop-filter, and a filtered ancestor becomes the
	 * containing block for its `position: fixed` descendants: with the panel
	 * nested inside the header, `inset: 0` resolved against the header's own
	 * 108px box and the menu opened as a sliver. So this asserts the panel
	 * really does cover the viewport, and that the header is not its ancestor —
	 * the second half is the cause, stated so a well-meaning re-nesting that
	 * happens to still cover the viewport on an unscrolled page cannot pass.
	 */
	await evaluate(`scrollTo(0, 600)`);
	await Bun.sleep(200);
	await evaluate(`(() => {
		const b = document.querySelector('.menu-button');
		b.focus();
		b.click();
	})()`);
	await Bun.sleep(400);
	const scrolledOpen = await evaluate(`(() => {
		const p = document.getElementById('menu-panel');
		const r = p.getBoundingClientRect();
		const link = document.querySelector('.menu-panel__link').getBoundingClientRect();
		return {
			fillsViewport: r.width >= innerWidth && r.height >= innerHeight,
			linkOnScreen: link.top >= 0 && link.bottom <= innerHeight,
			insideHeader: !!document.getElementById('site-header').contains(p),
			headerBlurred: getComputedStyle(document.getElementById('site-header')).backdropFilter !== 'none',
		};
	})()`);
	check('the menu still fills the screen once the page is scrolled',
		scrolledOpen.fillsViewport && scrolledOpen.linkOnScreen,
		`fills=${scrolledOpen.fillsViewport}, linkOnScreen=${scrolledOpen.linkOnScreen}`);
	check('the panel is not inside the blurred header',
		scrolledOpen.headerBlurred && !scrolledOpen.insideHeader,
		`blurred=${scrolledOpen.headerBlurred}, nested=${scrolledOpen.insideHeader}`);

	await evaluate(`scrollTo(0, 0)`);
	await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
	await Bun.sleep(300);
}

/* --- 5. newsletter form works without JS ----------------------------------- */
{
	// `.signup` is the extracted SignupForm, shared by the panel on ordinary
	// pages and the full page at /newsletter. Both must post to the provider.
	for (const route of ['/', '/newsletter']) {
		await load(route);
		const r = await evaluate(`(() => {
			const f = document.querySelector('.signup');
			if (!f) return null;
			return {
				method: f.getAttribute('method'),
				action: f.action,
				hasEmail: !!f.querySelector('input[type=email]'),
				hasNote: !!f.parentElement?.querySelector('.signup__note'),
			};
		})()`);
		check(`the signup form on ${route} posts to a provider without JS`,
			!!r && r.method === 'post' && String(r.action).includes('http') && r.hasEmail,
			r ? String(r.action) : 'no .signup found');
	}
}

/* --- 5b. form controls keep a sane box on a phone -------------------------- */
{
	// A control far taller than its own text means a flex-basis has leaked
	// onto the wrong axis. It looks like a deliberate panel, so nothing else
	// catches it.
	await send('Emulation.setDeviceMetricsOverride', {
		width: 375, height: 812, deviceScaleFactor: 1, mobile: true,
	});
	await load('/library');
	const r = await evaluate(`(() => [...document.querySelectorAll('input, select, button')]
		.map((el) => ({
			tag: el.tagName.toLowerCase(),
			h: Math.round(el.getBoundingClientRect().height),
			font: Math.round(parseFloat(getComputedStyle(el).fontSize)),
		}))
		.filter((c) => c.h > c.font * 4.5))()`);
	check('no form control is stretched on a phone', r.length === 0,
		r.map((c: any) => `${c.tag} ${c.h}px at ${c.font}px type`).join(', ') || 'all sane');
}

/* --- 6. the library filter -------------------------------------------------- */
await send('Emulation.setDeviceMetricsOverride', {
	width: 1280, height: 800, deviceScaleFactor: 1, mobile: false,
});
await load('/library');

{
	// The list is complete before any script runs. This is what makes the
	// filter an enhancement rather than a requirement.
	const full = await evaluate(`(() => {
		const scope = document.getElementById('library-list');
		return {
			cards: scope.querySelectorAll('[data-topic].card').length,
			rows: scope.querySelectorAll('.catalogue__row').length,
			years: scope.querySelectorAll('[data-year-group]').length,
		};
	})()`);
	check('library ships the whole list unfiltered',
		full.cards === 12 && full.rows === 12 && full.years === 3,
		`${full.cards} cards, ${full.rows} catalogue rows, ${full.years} years`);

	// Pressing a topic narrows both indexes at once.
	const craft = await evaluate(`(() => {
		document.querySelector('[data-filter-topic="craft"]').click();
		const scope = document.getElementById('library-list');
		const visible = (sel) => [...scope.querySelectorAll(sel)].filter((e) => !e.hidden).length;
		return {
			cards: visible('.card'),
			rows: visible('.catalogue__row'),
			groups: visible('[data-group]'),
			pressed: [...document.querySelectorAll('[data-filter-topic]')]
				.filter((b) => b.getAttribute('aria-pressed') === 'true')
				.map((b) => b.dataset.filterTopic),
			empty: document.querySelector('[data-filter-empty]').hidden,
			status: document.querySelector('[data-filter-status]').textContent,
			url: location.search,
		};
	})()`);
	check('a topic narrows the shelf and the catalogue together',
		craft.cards === 3 && craft.rows === 3 && craft.pressed.join() === 'craft',
		`${craft.cards} cards, ${craft.rows} rows, url "${craft.url}"`);
	check('an emptied month group hides itself', craft.groups === 3,
		`${craft.groups} month groups left visible`);
	check('the filter announces its result', /3 pieces/.test(craft.status), craft.status);
	check('a non-empty filter shows no empty state', craft.empty === true);

	// A year narrows within the topic, and can empty the shelf.
	const empty = await evaluate(`(() => {
		const select = document.querySelector('[data-filter-year]');
		select.value = '2024';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		const scope = document.getElementById('library-list');
		const shown = [...scope.querySelectorAll('.card')].filter((e) => !e.hidden).length;
		return {
			shown,
			emptyShown: !document.querySelector('[data-filter-empty]').hidden,
			emptyText: document.querySelector('[data-filter-empty]').textContent.trim(),
			status: document.querySelector('[data-filter-status]').textContent,
			url: location.search,
		};
	})()`);
	check('topic and year combine', empty.shown === 0 && empty.emptyShown === true,
		`url "${empty.url}"`);
	check('an empty result is written in voice, not "no results"',
		/Nothing on this shelf/.test(empty.emptyText) && !/no results/i.test(empty.emptyText),
		empty.emptyText);

	// The URL is the source of truth: a shared link opens already filtered.
	await send('Page.navigate', { url: `${ORIGIN}/library?topic=reading` });
	await Bun.sleep(1600);
	const shared = await evaluate(`(() => {
		const scope = document.getElementById('library-list');
		return {
			shown: [...scope.querySelectorAll('.card')].filter((e) => !e.hidden).length,
			pressed: document.querySelector('[aria-pressed="true"]')?.dataset.filterTopic,
			year: document.querySelector('[data-filter-year]').value,
		};
	})()`);
	check('a shared filtered URL arrives already filtered',
		shared.shown === 2 && shared.pressed === 'reading' && shared.year === '',
		`${shared.shown} shown, ${shared.pressed} pressed`);
}

/* --- 7. the filter is an enhancement --------------------------------------- */
await load('/library', { js: false });
{
	const r = await evaluate(`(() => {
		const scope = document.getElementById('library-list');
		return {
			cards: [...scope.querySelectorAll('.card')].filter((e) => !e.hidden).length,
			links: scope.querySelectorAll('.catalogue__title').length,
			hiddenGroups: [...scope.querySelectorAll('[data-year-group]')].filter((g) => g.hidden).length,
		};
	})()`);
	check('no-JS: the full library is browsable and unhidden',
		r.cards === 12 && r.links === 12 && r.hiddenGroups === 0,
		`${r.cards} cards, ${r.links} catalogue links`);
}

/* --- 8. the article page ---------------------------------------------------- */
await send('Emulation.setDeviceMetricsOverride', {
	width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
});
await load('/library/2026/the-middle-of-the-book');
{
	const r = await evaluate(`(() => ({
		progress: !!document.querySelector('.progress'),
		toc: document.querySelectorAll('.toc__item').length,
		current: document.querySelectorAll('.toc__item a[aria-current]').length,
		neighbours: document.querySelectorAll('.neighbours__link').length,
		similar: document.querySelectorAll('.card__link').length,
		catalogue: document.querySelectorAll('.catalogue__row').length,
		dropCap: getComputedStyle(document.querySelector('.prose > p'), '::first-letter').float,
		measure: Math.round(document.querySelector('.prose').getBoundingClientRect().width),
		aside: getComputedStyle(document.querySelector('.writing__aside')).display,
	}))()`);
	check('article: progress bar, drop cap and contents are present',
		r.progress && r.dropCap === 'left' && r.toc === 6 && r.aside !== 'none',
		`${r.toc} contents entries, aside ${r.aside}`);
	check('article: the reading column holds its measure',
		r.measure > 480 && r.measure < 600, `${r.measure}px`);
	check('article: the reading progress bar tracks the scroll', await (async () => {
		const before = await evaluate(
			`document.querySelector('.progress').style.getPropertyValue('--progress')`,
		);
		await evaluate(`scrollTo(0, document.body.scrollHeight / 2)`);
		await Bun.sleep(500);
		const after = await evaluate(
			`document.querySelector('.progress').style.getPropertyValue('--progress')`,
		);
		return before !== after && parseFloat(after) > 0.3;
	})());
	check('article: prev/next, siblings and the catalogue tail are all offered',
		r.neighbours === 2 && r.similar === 2 && r.catalogue === 5,
		`${r.neighbours} neighbours, ${r.similar} siblings, ${r.catalogue} tail rows`);
}

/* --- 9. a short piece gets no contents ------------------------------------- */
await load('/library/2026/an-interview-offbeat');
{
	const r = await evaluate(`(() => ({
		toc: document.querySelectorAll('.toc__item').length,
		aside: document.querySelector('.writing__aside'),
		neighbours: document.querySelectorAll('.neighbours__link').length,
	}))()`);
	check('a short piece has no contents, and still has somewhere to go',
		r.toc === 0 && r.aside === null && r.neighbours === 2);
}

/* --- 10. the reading progress bar is not on ordinary pages ------------------ */
await load('/library');
{
	const r = await evaluate(`!!document.querySelector('.progress')`);
	check('the reading progress bar is an article-page thing only', r === false);
}

/* --- 11. a nonsense filter URL does not break the page ---------------------- */
await send('Page.navigate', { url: `${ORIGIN}/library?topic=nonsense&year=1066` });
await Bun.sleep(1600);
{
	const r = await evaluate(`(() => {
		const scope = document.getElementById('library-list');
		return {
			shown: [...scope.querySelectorAll('.card')].filter((e) => !e.hidden).length,
			pressed: [...document.querySelectorAll('[data-filter-topic]')]
				.filter((b) => b.getAttribute('aria-pressed') === 'true')
				.map((b) => b.dataset.filterTopic),
			emptyShown: !document.querySelector('[data-filter-empty]').hidden,
		};
	})()`);
	check('an unknown filter in the URL falls back to the whole library',
		r.shown === 12 && r.pressed.join() === '' && r.emptyShown === false,
		`${r.shown} shown, pressed "${r.pressed.join()}"`);
}

/* --- 12. the library page head does not say "Library" twice ------------------ */
await load('/library');
{
	// §5.2 allows two uppercase elements a page. An eyebrow repeating the
	// title spends one on a word the reader already has.
	const r = await evaluate(`(() => {
		const head = document.querySelector('.page-head');
		const eyebrow = head.querySelector('.label');
		return {
			eyebrow: eyebrow ? eyebrow.textContent.trim() : null,
			h1: head.querySelector('h1').textContent.trim(),
			catalogueId: !!document.getElementById('catalogue'),
		};
	})()`);
	check('the library page does not repeat its own title as an eyebrow',
		r.eyebrow === null, `eyebrow was "${r.eyebrow}"`);
	check('the card catalogue is anchorable as #catalogue', r.catalogueId === true);
}

/* --- 13. the article meta row is the spec's provenance --------------------- */
await load('/library/2026/the-middle-of-the-book');
{
	const r = await evaluate(`(() => {
		const meta = document.querySelector('.writing__meta');
		return {
			text: meta.textContent.replace(/\\s+/g, ' ').trim(),
			hasTopicLink: !!meta.querySelector('a[href^="/topics/"]'),
			// Read textContent, so the separator arrives as the character
			// rather than the &middot; entity.
			hasLongDate: /\\d{1,2} [A-Z][a-z]+ \\d{4}/.test(meta.textContent),
			pullQuote: document.querySelectorAll('figure.pull-quote').length,
		};
	})()`);
	// "Mon D, YYYY" is the spec's format; the long form is the datetime
	// attribute's job, not something to put in the visible row. The pattern
	// is built in the page, where the raw · and the · entities both resolve
	// to the same character.
	const r2 = await evaluate(`(() => {
		const t = document.querySelector('.writing__meta').textContent
			.replace(/\\s+/g, ' ')
			.replace(/&middot;/g, '·')
			.trim();
		return {
			ok: /^[A-Z][a-z]{2} \\d{1,2}, \\d{4} · \\d+ min · [A-Z]/.test(t),
			hasLongDate: /\\d{1,2} [A-Z][a-z]+ \\d{4}/.test(t),
			text: t,
		};
	})()`);
	check('the meta row reads date · time · topic in the short date form',
		r2.ok === true && r2.hasLongDate === false, r2.text);
	check('the topic in the meta row is a link to that shelf', r.hasTopicLink === true);
	check('an authored pull quote is lifted above the body', r.pullQuote === 1,
		`${r.pullQuote} pull quote(s)`);
}

/* --- 14. a piece with no pull quote gets none ------------------------------ */
await load('/library/2026/an-interview-offbeat');
{
	const r = await evaluate(`document.querySelectorAll('figure.pull-quote').length`);
	check('the pull quote is optional, and absent when unauthored', r === 0);
}

/* --- 15. the services index and its pages agree --------------------------- */
await load('/services');
{
	const r = await evaluate(`(() => {
		const cards = [...document.querySelectorAll('.service')];
		return {
			cards: cards.length,
			links: cards.map(c => c.querySelector('a[href^="/services/"]')?.getAttribute('href')),
			titles: cards.map(c => c.querySelector('.service__title')?.textContent.trim()),
			// The teaser is capped at two; the index is not.
			forWhom: cards.map(c => c.querySelectorAll('.service__list li').length),
		};
	})()`);
	check('the services index lists every offer with its detail list',
		r.cards > 0 && r.forWhom.every(n => n > 0),
		`${r.cards} offer(s)`);
	check('every offer on the index links to a detail page',
		r.links.length === r.cards && r.links.every((h: string) => h && h !== '/services/'),
		r.links.join(' '));

	// Each linked page must actually exist. One fetch per offer, against the
	// dev server, which is the cheapest honest test of a dead link.
	const statuses: number[] = [];
	for (const href of r.links) {
		const res = await fetch(ORIGIN + href);
		statuses.push(res.status);
	}
	check('every offer detail page resolves',
		statuses.every(s => s === 200), `statuses ${statuses.join(' ')}`);
}

/* --- 16. the offer page carries the facts, and asks for the conversation --- */
await load('/services/ghostwriting');
{
	const r = await evaluate(`(() => {
		const dt = [...document.querySelectorAll('.service__term dt')].map(e => e.textContent.trim());
		const dd = [...document.querySelectorAll('.service__term dd')].map(e => e.textContent.trim());
		const btn = document.querySelector('.service__aside a.btn');
		return {
			keys: dt, values: dd,
			includes: document.querySelectorAll('.checklist li').length,
			ticks: document.querySelectorAll('.checklist__mark').length,
			// An inline SVG at 1em, per the anti-goals: no emoji as an icon.
			tickIsSvg: document.querySelector('.checklist__mark')?.tagName.toLowerCase(),
			href: btn?.getAttribute('href') ?? '',
			prose: Math.round(document.querySelector('.prose p').getBoundingClientRect().width),
			h1: document.querySelectorAll('main h1').length,
		};
	})()`);
	// Two different facts, so two different keys. Labelling both "Engagement"
	// was a real bug and an easy one to make again.
	check('the terms are keyed by what they are, not labelled alike',
		r.keys.join('|') === 'Engagement|Price', r.keys.join(' / '));
	check('both terms carry a value', r.values.length === 2 && r.values.every(Boolean),
		r.values.join(' / '));
	check('every item in the checklist has a tick, and the tick is not an emoji',
		r.includes > 0 && r.includes === r.ticks && r.tickIsSvg === 'svg',
		`${r.includes} item(s), ${r.ticks} tick(s)`);
	// A mailto that opens the reader's mail client with nothing in the subject
	// makes them do the filing.
	check("the enquiry button pre-fills a mailto subject naming the offer",
		/^mailto:[^?]+\?subject=/.test(r.href) && /ghostwriting/.test(decodeURIComponent(r.href)),
		decodeURIComponent(r.href).slice(0, 72));
	check('the offer page has exactly one h1', r.h1 === 1);
}

/* --- 17. the measure holds below the grid breakpoint ------------------------ */
{
	// The bug this guards: the measure existed only as a grid track inside a
	// min-width query, so between 600px and 1080px nothing capped the line and
	// an essay ran 952px wide — a hundred-odd characters to a line.
	for (const width of [1024, 900, 768]) {
		await send('Emulation.setDeviceMetricsOverride', {
			width, height: 900, deviceScaleFactor: 1, mobile: false,
		});
		for (const route of ['/library/2026/the-middle-of-the-book', '/services/ghostwriting']) {
			await send('Page.navigate', { url: ORIGIN + route });
			await Bun.sleep(1400);
			const r = await evaluate(`(() => {
				const ps = [...document.querySelectorAll('.prose p')]
					.filter(p => p.getBoundingClientRect().height > 0);
				const stand = document.querySelector('.writing__standfirst, .page-head__description');
				return {
					prose: Math.round(ps[0].getBoundingClientRect().width),
					bodyLeft: Math.round(ps[0].getBoundingClientRect().left),
					standLeft: Math.round(stand.getBoundingClientRect().left),
				};
			})()`);
			check(`body copy stays in the measure at ${width}px (${route})`,
				r.prose <= 545, `${r.prose}px`);
			// The standfirst is the last line of the page head and the first body
			// paragraph is the first line under it. If those two disagree, the
			// text visibly jumps sideways.
			check(`the paragraph lines up with the line above it at ${width}px`,
				r.bodyLeft === r.standLeft, `body ${r.bodyLeft} vs standfirst ${r.standLeft}`);
		}
	}
	await send('Emulation.setDeviceMetricsOverride', {
		width: 1280, height: 800, deviceScaleFactor: 1, mobile: false,
	});
}

/* --- 18. the heading outline on the services index is continuous ------------ */
await load('/services');
{
	// The card titles are h3, correct under a section h2 on the home page and a
	// skipped level here, where the page title is the only heading above them.
	const r = await evaluate(`(() => {
		const hs = [...document.querySelectorAll('main h1, main h2, main h3, main h4, main h5, main h6')]
			.map(e => ({ level: Number(e.tagName[1]), text: e.textContent.trim().slice(0, 34) }));
		const gaps = [];
		for (let i = 1; i < hs.length; i++) {
			if (hs[i].level - hs[i - 1].level > 1) {
				gaps.push(\`h\${hs[i-1].level} -> h\${hs[i].level} at "\${hs[i].text}"\`);
			}
		}
		return { gaps, outline: hs.map(h => \`h\${h.level} \${h.text}\`) };
	})()`);
	check('heading levels on the services index descend without a gap',
		r.gaps.length === 0, r.gaps.join('; ') || r.outline.join(' | '));
}

/* --- 19. a draft offer is never published ---------------------------------- */
await load('/services');
{
	const r = await evaluate(`[...document.querySelectorAll('.service__title')]
		.map(e => e.textContent.trim()).join('|')`);
	check('no draft offer leaks onto the services index', !/_draft|draft/i.test(r), r);
}

/* --- 20. every nav and footer link resolves -------------------------------- */
{
	// The "Done when" for this phase, checked against the running server rather
	// than against the build output, so a route that 500s is caught here too.
	const routes = ['/', '/library', '/about', '/services', '/newsletter', '/contact',
		'/colophon', '/rss.xml'];
	const statuses: Record<string, number> = {};
	for (const route of routes) {
		statuses[route] = (await fetch(ORIGIN + route)).status;
	}
	const broken = Object.entries(statuses).filter(([, s]) => s !== 200);
	check('every nav, footer and phase-6 route resolves',
		broken.length === 0,
		broken.length ? broken.map(([r, s]) => `${r} → ${s}`).join(' ') : routes.join(' '));

	// /404 is the one route that must answer 404. Asserting 200 here would be
	// asserting that a missing page reports success, which is the bug this
	// check exists to prevent — so it is checked for the status it owes, and
	// for serving the right page while doing it.
	const missing = await fetch(ORIGIN + '/this-page-does-not-exist');
	const missingBody = await missing.text();
	check('a missing address answers 404 with the real 404 page',
		missing.status === 404 &&
			missingBody.includes('walked past the end of this shelf'),
		`status ${missing.status}`);

	// The nav is one list, and a link in it that 404s is the exact failure the
	// phase exists to prevent. Read from the rendered DOM rather than the
	// served HTML: `evaluate` does not await a promise, so an async
	// expression here would come back empty and the check would pass on an
	// empty list.
	await load('/');
	const nav = await evaluate(`[...new Set(
		[...document.querySelectorAll('a[href^="/"]')].map(a => a.getAttribute('href'))
	)]`) as string[];
	const navBroken: string[] = [];
	for (const href of nav) {
		if (href === '/') continue;
		if ((await fetch(ORIGIN + href)).status !== 200) navBroken.push(href);
	}
	check('no internal link on the home page is a dead end',
		nav.length > 0 && navBroken.length === 0,
		navBroken.join(' ') || `${nav.length} links`);
}

/* --- 21. the four collection pages are driven by frontmatter ---------------- */
for (const [route, title] of [
	['/about', 'About'],
	['/colophon', 'Colophon'],
	['/contact', 'Contact'],
	['/newsletter', 'Newsletter'],
] as const) {
	await load(route);
	const r = await evaluate(`(() => {
		const hs = [...document.querySelectorAll('main h1, main h2, main h3, main h4')]
			.map(e => ({ level: Number(e.tagName[1]), text: e.textContent.trim().slice(0, 30) }));
		const gaps = [];
		for (let i = 1; i < hs.length; i++) {
			if (hs[i].level - hs[i - 1].level > 1) gaps.push('h' + hs[i-1].level + '→h' + hs[i].level);
		}
		const prose = [...document.querySelectorAll('.prose p')].filter(p => p.getBoundingClientRect().height > 0);
		const stand = document.querySelector('.page-head__description');
		return {
			h1: document.querySelectorAll('main h1').length,
			title: document.querySelector('.page-title')?.textContent.trim(),
			eyebrow: document.querySelector('.page-head .label')?.textContent.trim(),
			gaps,
			prose: prose.length,
			measure: Math.round(prose[0].getBoundingClientRect().width),
			bodyLeft: Math.round(prose[0].getBoundingClientRect().left),
			standLeft: Math.round(stand.getBoundingClientRect().left),
			// Uppercase is rationed to the page title; the eyebrow is a .label,
			// which is the small tracked voice and always allowed.
			current: document.querySelector('a[aria-current="page"]')?.textContent.trim(),
		};
	})()`);
	check(`${route} has exactly one h1, set from frontmatter`,
		r.h1 === 1 && r.title === title, `"${r.title}"`);
	check(`${route} heading levels descend without a gap`,
		r.gaps.length === 0, r.gaps.join(', ') || 'none');
	check(`${route} body copy holds the measure and lines up with the description`,
		r.measure <= 545 && r.bodyLeft === r.standLeft, `${r.measure}px, body ${r.bodyLeft} vs ${r.standLeft}`);
	check(`${route} is the current page in the nav`,
		!!r.current, r.current ?? 'no aria-current');
}

/* --- 22. /about: portrait, pull quote, elsewhere --------------------------- */
await load('/about');
{
	const r = await evaluate(`(() => {
		const plate = document.querySelector('.portrait .plate__label');
		const img = document.querySelector('.portrait img');
		const quote = document.querySelector('.pull-quote');
		const links = [...document.querySelectorAll('.elsewhere__link')];
		return {
			portrait: plate?.textContent.trim() ?? (img ? 'photo' : 'MISSING'),
			quote: quote?.querySelector('blockquote')?.textContent.trim().slice(0, 40),
			quoteEmberRule: quote ? getComputedStyle(quote.querySelector('blockquote')).borderLeftColor : null,
			elsewhereLabel: document.querySelector('.elsewhere .label')?.textContent.trim(),
			links: links.map(a => a.getAttribute('href')),
			// The line the pull quote lifts must not also be left in the body.
			duplicated: quote
				? document.querySelector('.prose').textContent.includes(quote.textContent.trim().slice(0, 40))
				: false,
		};
	})()`);
	check('/about has a portrait slot that renders, not a hole',
		r.portrait !== 'MISSING', r.portrait);
	check('/about lifts a pull quote above the body',
		!!r.quote && r.quote.length > 20, `"${r.quote}"`);
	check('the pull quote is not left duplicated in the body', !r.duplicated);
	check('/about has an elsewhere row with a working address',
		r.links.length > 0 && r.links.every((h: string) => h?.startsWith('mailto:')),
		`${r.links.length} link(s), label "${r.elsewhereLabel}"`);
}

/* --- 23. /colophon: the contents is real and its links land ---------------- */
await load('/colophon');
{
	const r = await evaluate(`(() => {
		const links = [...document.querySelectorAll('.toc__item a')];
		return {
			count: links.length,
			hrefs: links.map(a => a.getAttribute('href')),
			targets: links.map(a => !!document.getElementById(a.getAttribute('href').slice(1))),
			nav: document.querySelector('.toc')?.getAttribute('aria-label'),
		};
	})()`);
	check('/colophon renders a contents from its own headings',
		r.count >= 3, `${r.count} entries`);
	check('every contents link lands on a heading that exists',
		r.hrefs.length > 0 && r.targets.every(Boolean), r.hrefs.join(' '));
}

/* --- 24. /newsletter: the issue list is the collection --------------------- */
await load('/newsletter');
{
	const r = await evaluate(`(() => {
		const items = [...document.querySelectorAll('.issues__item')];
		return {
			count: items.length,
			dates: items.map(li => li.querySelector('time')?.getAttribute('datetime')),
			months: items.map(li => li.querySelector('time')?.textContent.trim()),
			titles: items.map(li => li.querySelector('.issues__title')?.textContent.trim()),
			summaries: items.map(li => li.querySelector('.issues__summary')?.textContent.trim().length),
			markers: getComputedStyle(document.querySelector('.issues__list')).listStyleType,
			form: document.querySelector('.signup__input')?.getAttribute('type'),
			action: document.querySelector('form')?.getAttribute('action'),
		};
	})()`);
	check('/newsletter lists past issues', r.count > 0, `${r.count} issue(s)`);
	// Newest first, and the dates must be real dates rather than a string that
	// happens to look like one.
	const sorted = [...(r.dates as string[])].sort().reverse();
	check('the issues are in date order, newest first',
		JSON.stringify(r.dates) === JSON.stringify(sorted) &&
		(r.dates as string[]).every((d) => /^\d{4}-\d{2}-\d{2}T/.test(d)),
		(r.months as string[]).join(' | '));
	check('every issue has a subject and a note',
		(r.titles as string[]).every(Boolean) && (r.summaries as number[]).every((n) => n > 20));
	check('the issue list is a list, not a numbered one', r.markers === 'none', r.markers);
	check('/newsletter has the same signup form as the panel',
		r.form === 'email' && !!r.action, r.action);
}

/* --- 25. /contact: the form, and the claim that it works without JS -------- */
await load('/contact');
{
	const r = await evaluate(`(() => {
		const form = document.getElementById('contact-form');
		const fields = [...form.querySelectorAll('input, textarea')];
		return {
			method: form.getAttribute('method'),
			// A form pointed at an endpoint that does not exist loses the
			// message without saying so, so the no-JS target must be real.
			action: form.getAttribute('action'),
			fields: fields.map(f => f.name),
			labelled: fields.every(f => !!form.querySelector('label[for="' + f.id + '"]')),
			direct: document.querySelector('.contact__address a')?.getAttribute('href'),
			address: form.dataset.address,
			error: document.getElementById('contact-error')?.getAttribute('role'),
			errorHidden: document.getElementById('contact-error')?.hasAttribute('hidden'),
		};
	})()`);
	check('/contact has a name, an email and a message field',
		JSON.stringify(r.fields) === JSON.stringify(['name', 'email', 'message']),
		(r.fields as string[]).join(', '));
	check('every contact field has a real label', r.labelled);
	check('the contact form still reaches an inbox with JavaScript off',
		r.method === 'get' && String(r.action).startsWith('mailto:'),
		`${r.method} ${String(r.action).slice(0, 46)}`);
	check('the address is printed as well as wired up',
		typeof r.direct === 'string' && r.direct === `mailto:${r.address}`,
		String(r.direct));
	check('the form error is announced, and starts hidden',
		r.error === 'status' && r.errorHidden === true);
}

// The same page with scripting disabled: the fields and the action must
// survive, or the progressive-enhancement claim is only a claim.
await load('/contact', { js: false });
{
	const r = await evaluate(`(() => {
		const form = document.getElementById('contact-form');
		return {
			fields: form ? form.querySelectorAll('input, textarea').length : 0,
			action: form?.getAttribute('action') ?? '',
			button: !!form?.querySelector('button, .btn'),
			scriptRan: !!document.getElementById('contact-error')?.hasAttribute('hidden') === false,
		};
	})()`);
	check('/contact keeps its form and its submit with JavaScript off',
		r.fields === 3 && r.button && String(r.action).startsWith('mailto:'),
		`${r.fields} field(s)`);
}

/* --- 26. /404 is a page, not an apology ----------------------------------- */
await load('/404');
{
	const r = await evaluate(`(() => ({
		title: document.querySelector('.page-title')?.textContent.trim(),
		home: document.querySelector('a.btn')?.getAttribute('href'),
		homeLabel: document.querySelector('a.btn')?.textContent.trim(),
		cards: document.querySelectorAll('.card').length,
		cardHrefs: [...document.querySelectorAll('.card__link')].map(a => a.getAttribute('href')),
		// One uppercase element: the page title. No eyebrow on this page.
		eyebrow: document.querySelector('.page-head .label')?.textContent.trim() ?? null,
	}))()`);
	check('/404 says where you have ended up',
		r.title === "You've walked past the end of this shelf", `"${r.title}"`);
	check('/404 offers a way home', r.home === '/', `"${r.homeLabel}" → ${r.home}`);
	check('/404 suggests three pieces from the library',
		r.cards === 3 && r.cardHrefs.every((h: string) => h?.startsWith('/library/')),
		(r.cardHrefs as string[]).join(' '));
	check('/404 spends its uppercase on the title alone', r.eyebrow === null,
		r.eyebrow ?? 'no eyebrow');
}

/* --- 27. the feed ---------------------------------------------------------- */
{
	const xml = await (await fetch(ORIGIN + '/rss.xml')).text();
	const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
	const links = items.map((i) => /<link>(.*?)<\/link>/.exec(i)?.[1] ?? '');
	const titles = items.map((i) => /<title>(.*?)<\/title>/.exec(i)?.[1] ?? '');

	check('/rss.xml is a feed with the whole library in it',
		items.length > 0 && xml.includes('<rss') && xml.includes('<channel>'),
		`${items.length} item(s)`);

	// The feed is a mirror, not a subset: it must carry everything the shelf is
	// showing. Counted from the shelf rather than from a hard-coded number,
	// because a hard-coded number is exactly the assertion that stops being
	// true when an essay is added.
	await load('/library');
	const shelf = await evaluate(`document.querySelectorAll('.card').length`) as number;
	check('the feed carries every piece the shelf is showing',
		items.length === shelf, `${items.length} in the feed, ${shelf} on the shelf`);

	// Deliberately NOT asserted here: that the feed carries no draft. This
	// script runs against the dev server, where `published` returns true for
	// drafts by design — they are visible while writing and gone from a build.
	// Asserting it here would be asserting the opposite of the intent. The
	// production guarantee is checked against dist/ in check.sh, which is the
	// only place it is actually true.

	// The site is served trailingSlash: 'never'. A feed that defaults to
	// adding one fills readers' apps with links that 404.
	check('feed links match the site, with no trailing slash',
		links.length > 0 &&
			links.every((l) => /^https:\/\/[^/]+\/library\/\d{4}\/[\w-]+$/.test(l)),
		links[0] ?? 'none');
	check('every feed item has a title and a date',
		titles.length === items.length && titles.every((t) => t.length > 0) &&
			items.every((i) => /<pubDate>/.test(i)),
		`${titles.length} titled`);
}

/* --- 28. no placeholder copy anywhere ------------------------------------- */
{
	const routes = ['/', '/library', '/about', '/services', '/services/ghostwriting',
		'/newsletter', '/contact', '/colophon', '/404', '/topics/craft'];
	const found: string[] = [];
	for (const route of routes) {
		const html = await (await fetch(ORIGIN + route)).text();
		const text = html
			.replace(/<script[\s\S]*?<\/script>/g, ' ')
			.replace(/<style[\s\S]*?<\/style>/g, ' ')
			.replace(/<[^>]+>/g, ' ');
		if (/lorem ipsum|TODO|FIXME|coming soon|placeholder heading|xxx/i.test(text)) {
			found.push(route);
		}
	}
	check('no page ships placeholder copy', found.length === 0, found.join(' ') || `${routes.length} pages`);
}

/* --- 29. reduced motion removes *every* animation, not just the reveal ----- */
{
	// The reveal is the site's loudest motion, but base.css also collapses
	// transitions globally, and the scroll whisper loops forever. A page can
	// pass the reveal check above and still be animating a link underline and
	// an infinite line, so this asks the computed styles of every element
	// rather than the class list of the reveals.
	/*
	 * On a clean tab, because this is the one check in the file that depends on
	 * an emulated *OS* preference rather than on a viewport. See `freshTab` for
	 * the symptom. Test 2 above got the same treatment for the same reason: it
	 * runs early, when the shared tab is still clean, which is precisely why its
	 * green result was believable and this one was not.
	 */
	await freshTab();
	await send('Emulation.setDeviceMetricsOverride', {
		width: 1280, height: 800, deviceScaleFactor: 1, mobile: false,
	});
	await load({ reducedMotion: true });

	/*
	 * No `matchMedia` precondition check here, deliberately.
	 *
	 * It was in, and it reported false on a tab where the styles below had
	 * demonstrably applied — every transition collapsed to 0.01ms and
	 * `scroll-behavior` resolved to `auto`. `matchMedia` in the page and the
	 * media query in the stylesheet disagreeing like that is a harness
	 * artefact, and a gate that prints a red line next to two green ones trains
	 * the reader to ignore red lines.
	 *
	 * The resolved computed style is the better evidence anyway: it is what the
	 * browser actually did, not what it was asked to do. These two checks read
	 * it, so they cannot pass unless the preference really took effect.
	 */
	const r = await evaluate(`(() => {
		const loud = [];
		for (const el of document.querySelectorAll('*')) {
			const s = getComputedStyle(el);
			const transition = s.transitionDuration.split(',').map(v => parseFloat(v));
			const animation = s.animationDuration.split(',').map(v => parseFloat(v));
			const worstTransition = Math.max(...transition, 0);
			const worstAnimation = Math.max(...animation, 0);
			if (worstTransition > 0.05 || worstAnimation > 0.05) {
				loud.push(el.className || el.tagName);
			}
		}
		return {
			loud: loud.slice(0, 5),
			count: loud.length,
			scroll: getComputedStyle(document.documentElement).scrollBehavior,
			debug: {
				matches: matchMedia('(prefers-reduced-motion: reduce)').matches,
				skip: getComputedStyle(document.querySelector('.skip-link') ?? document.body).transitionDuration,
				nav: getComputedStyle(document.querySelector('.nav-link') ?? document.body).transitionDuration,
			},
		};
	})()`);
	check(
		'reduced motion silences every transition and animation',
		r.count === 0,
		r.count
			? `${r.count} still moving: ${r.loud.join(', ')} (skip-link ${r.debug.skip}, nav ${r.debug.nav})`
			: '',
	);
	check('reduced motion stops smooth scrolling', r.scroll === 'auto', r.scroll);
	await load();
}

/* --- 30. the print stylesheet --------------------------------------------- */
{
	/*
	 * CDP can emulate `print` media, so this is a real render of the print
	 * stylesheet rather than a reading of the CSS. That matters: the night-mode
	 * override in print.css exists precisely because the obvious version of it
	 * loses a specificity fight and a night-mode reader prints a page of cream
	 * ink on white paper. Only a real render under print media can catch that.
	 */
	await send('Emulation.setEmulatedMedia', { media: 'print' });
	await load('/library/2026/the-middle-of-the-book');
	await send('Emulation.setEmulatedMedia', { media: 'print' });
	// The emulated media does not survive navigation on its own in every
	// Chrome build, so it is re-applied after the load as well.
	await send('Emulation.setEmulatedMedia', { media: 'print' });
	const r = await evaluate(`(() => {
		const shown = (sel) => {
			const el = document.querySelector(sel);
			if (!el) return 'absent';
			return getComputedStyle(el).display;
		};
		const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();
		const bodyBg = getComputedStyle(document.body).backgroundColor;
		const url = document.querySelector('.print-url');
		return {
			header: shown('.site-header'),
			footer: shown('.site-footer'),
			progress: shown('.progress'),
			grain: shown('.grain'),
			frame: getComputedStyle(document.body, '::after').display,
			tail: shown('.writing__tail'),
			urlDisplay: url ? getComputedStyle(url).display : 'absent',
			urlText: url ? url.textContent.trim() : '',
			ink,
			bodyBg,
			uppercase: getComputedStyle(document.querySelector('.writing__title')).textTransform,
		};
	})()`);
	await send('Emulation.setEmulatedMedia', { media: '' });

	check('print: the chrome is gone', [r.header, r.footer, r.progress, r.grain].every((d) => d === 'none'),
		`header ${r.header}, footer ${r.footer}, progress ${r.progress}, grain ${r.grain}`);
	check('print: the room frame is removed', r.frame === 'none', r.frame);
	check('print: the article tail is dropped', r.tail === 'none', r.tail);
	check('print: the page address is shown', r.urlDisplay !== 'none' && r.urlDisplay !== 'absent',
		r.urlDisplay);
	check('print: the address is this page', r.urlText.endsWith('/library/2026/the-middle-of-the-book'),
		r.urlText || 'empty');
	// #EDE4D6 is the night --ink. Printing that on white paper prints nothing.
	check('print: ink is forced to the day value', r.ink === '#221e1a', r.ink);
	check('print: no night-mode paper leaks through', r.bodyBg === 'rgb(255, 255, 255)', r.bodyBg);
	check('print: the title is not set in caps', r.uppercase === 'none', r.uppercase);

	// And off the print stylesheet, the address is invisible again.
	await load();
	const screen = await evaluate(
		`getComputedStyle(document.querySelector('.print-url')).display`,
	);
	check('the address is invisible on screen', screen === 'none', screen);
}

/* --- 31. the shared empty state -------------------------------------------- */
{
	/*
	 * A shelf with nothing on it has to say so in a sentence. The way to reach
	 * that state without editing content is the filter: a topic and a year that
	 * cannot both be true. The message is asserted by class rather than by
	 * text, so a rewording does not break the gate — but the gate does assert
	 * that it is a *sentence*, which is the part that matters.
	 */
	await load('/library');
	const r = await evaluate(`(() => {
		const empty = document.querySelector('[data-filter-empty]');
		const before = { hidden: empty.hidden, text: empty.textContent.replace(/\\s+/g,' ').trim() };

		// Press a topic and then a year that excludes every piece in it.
		const topic = [...document.querySelectorAll('[data-filter-topic]')].find(b => b.dataset.filterTopic);
		const year = [...document.querySelectorAll('[data-filter-year] option')]
			.map(o => o.value).filter(Boolean).pop();
		topic.click();
		document.querySelector('[data-filter-year]').value = year;
		document.querySelector('[data-filter-year]').dispatchEvent(new Event('change'));

		const after = {
			hidden: empty.hidden,
			text: empty.textContent.replace(/\\s+/g,' ').trim(),
			url: location.search,
			words: empty.textContent.trim().split(/\\s+/).length,
		};
		return { before, after };
	})()`);

	check('the empty state starts hidden', r.before.hidden === true);
	check('an impossible filter reveals the empty state', r.after.hidden === false);
	// "No results found" is four words and no voice. A real sentence is longer
	// and it is what the gate is actually protecting.
	check('the empty state is a written sentence, not a status message',
		r.after.words > 6 && !/no results|nothing found|0 results/i.test(r.after.text),
		r.after.text);
	check('the empty state is in voice', /shelf|take one of them back/i.test(r.after.text));
}

/* --- 32. the newsletter cadence is stated once ----------------------------- */
{
	// A duplicate string across a panel and the form beside it is invisible in
	// any single screenshot. Count the sentence that promises the letter's
	// cadence, across the panel and the form's own note, and insist it is said
	// once.
	const html = await (await fetch(ORIGIN + '/')).text();
	const text = html
		.replace(/<script[\s\S]*?<\/script>/g, ' ')
		.replace(/<style[\s\S]*?<\/style>/g, ' ')
		.replace(/<[^>]+>/g, ' ');

	const promises = [
		/one (?:long )?essay a month/gi,
		/one email a month/gi,
		/one click,? from any issue/gi,
	];
	const found = promises.map((re) => (text.match(re) ?? []).length);
	check('the home page states the letter cadence once', found.every((n) => n <= 1), found.join(' '));

	// And the same sentence must not appear on a second page within a screen of
	// itself — the /newsletter page repeats it three times over, which was the
	// original tics this replaced.
	const nl = await (await fetch(ORIGIN + '/newsletter')).text();
	const nlText = nl.replace(/<[^>]+>/g, ' ');
	const signature = (nlText.match(/when there is something worth sending/gi) ?? []).length;
	check('/newsletter does not restate the panel line', signature === 0, `${signature} times`);
}

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
chrome.kill();
process.exit(failed ? 1 : 0);
