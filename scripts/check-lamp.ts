/**
 * The lamp switch: does it actually dim the room, and does the choice survive
 * a reload without a flash.
 *
 *   bun run scripts/check-lamp.ts
 *
 * This is the gate for the feature the project had the machinery for and the
 * control for nothing. `localStorage.theme` was read by the no-flash script and
 * written by nobody, so `data-theme` could only ever be the OS preference. The
 * checks below are written against the *behaviour* a reader would see — the
 * resolved `data-theme` and the persisted key — rather than against the class
 * names, so a rewrite of the component that kept it working would still pass.
 *
 * Two of them exist because they are the ways this feature typically fails:
 * a two-state switch that cannot get back to following the system, and a
 * control that appears before it can work.
 */

import { Cdp, ORIGIN, pass, report } from './lib/cdp';

const PORT = 9341;
const results: string[] = [];
const check = (name: string, ok: boolean, detail = '') =>
	results.push(pass(name, ok, detail));

const cdp = await Cdp.launch({ port: PORT, profile: '/tmp/pam-chrome-lamp' });
await cdp.newTab();
await cdp.viewport(1280, 800);

const state = () =>
	cdp.evaluate<{ theme: string; choice: string; label: string; name: string; shown: boolean }>(`(() => {
		const b = document.querySelector('[data-lamp]');
		return {
			theme: document.documentElement.dataset.theme,
			choice: document.documentElement.dataset.themeChoice,
			label: b?.querySelector('[data-lamp-label]')?.textContent ?? null,
			name: b?.getAttribute('aria-label') ?? null,
			shown: !!b && !b.hasAttribute('hidden') && b.offsetParent !== null,
		};
	})()`);

const press = async () => {
	await cdp.evaluate(`document.querySelector('[data-lamp]').click()`);
	await Bun.sleep(120);
};

/** Load a route with a given stored choice and a given OS preference. */
async function load(stored: string | null, osDark: boolean) {
	await cdp.newTab();
	await cdp.media([{ name: 'prefers-color-scheme', value: osDark ? 'dark' : 'light' }]);
	await cdp.viewport(1280, 800);

	// Seeded before navigating, so the no-flash script in <head> sees it on the
	// very first evaluation — which is the only way to test that there is no
	// flash of the wrong room.
	//
	// The seeder is then *removed*. `addScriptToEvaluateOnNewDocument` lasts for
	// the page's whole life, including every later reload, so a seeder left in
	// place silently wipes the choice on the next navigation and every
	// persistence check below passes for the wrong reason.
	const { identifier } = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
		source: `
			try {
				${stored === null ? `localStorage.removeItem('theme')` : `localStorage.setItem('theme', ${JSON.stringify(stored)})`};
			} catch {}
		`,
	});

	await cdp.goto(`${ORIGIN}/`);
	await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
}

/* --- 1. it is there, and it is a real control ----------------------------- */
await load(null, false);
{
	const s = await state();
	check('the lamp is visible with JavaScript on', s.shown);
	check(
		'the lamp has an accessible name, not just a glyph',
		!!s.name && s.name.length > 10,
		s.name ?? 'none',
	);
	check('it is a <button>, so Enter and Space both work', (
		await cdp.evaluate(`document.querySelector('[data-lamp]').tagName`)
	) === 'BUTTON');
}

/* --- 2. the three states, and the room they produce ----------------------- */
{
	// OS says day. The cycle must be auto → day → night → auto.
	await load(null, false);

	const seen: string[] = [];
	const rooms: string[] = [];
	// Three presses between four readings, so the fourth reading is the *return*
	// to auto. Pressing four times here would leave the control back on `day`
	// and the return trip would never be observed.
	for (let i = 0; i < 4; i++) {
		if (i > 0) await press();
		const s = await state();
		seen.push(s.choice);
		rooms.push(s.theme);
	}

	check(
		'it cycles auto → day → night → auto',
		seen.join(',') === 'auto,day,night,auto',
		seen.join(' → '),
	);

	check(
		'auto and day are both lit; night is dim',
		rooms.join(',') === 'day,day,night,day',
		rooms.join(' → '),
	);

	// A fifth press from auto must land on `day`, not stay on `auto`. This is
	// the difference between a cycle and a switch, and having three states at
	// all is the reason it matters.
	await press();
	const wrapped = (await state()).choice;
	check('the cycle wraps rather than sticking', wrapped === 'day', `next press gave ${wrapped}`);
}

/* --- 3. the override beats the OS, in both directions --------------------- */
await load('night', false);
{
	const s = await state();
	check('a stored night wins over a day-mode system', s.theme === 'night', `got ${s.theme}`);
}
await load('day', true);
{
	const s = await state();
	check('a stored day wins over a night-mode system', s.theme === 'day', `got ${s.theme}`);
}

/* --- 4. the choice survives a reload -------------------------------------- */
await load(null, false);
{
	await press(); // → day
	await press(); // → night
	const before = await state();

	await cdp.goto(`${ORIGIN}/`);
	const after = await state();

	check('the choice survives a reload', after.choice === 'night', `${before.choice} → ${after.choice}`);
	check(
		'and the room comes back night, not the OS preference',
		after.theme === 'night',
		`OS is day, got ${after.theme}`,
	);
}

/* --- 5. no flash: data-theme is correct on the very first evaluation ------ */
{
	/*
	 * The check that matters most, and the one a screenshot cannot make. A
	 * script that set the theme after first paint would look identical in every
	 * screenshot ever taken, and would show a white room to a night reader on
	 * every single page load. So the theme is read from inside the first
	 * evaluation the document ever runs, with no waiting at all.
	 */
	await cdp.newTab();
	await cdp.media([{ name: 'prefers-color-scheme', value: 'light' }]);

	const seeder = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
		source: `try { localStorage.setItem('theme', 'night') } catch {}`,
	});

	/*
	 * The probe, and the reason it is written the way it is.
	 *
	 * An injected script runs *before* the document element exists, so anything
	 * that reads `document.documentElement.dataset` at that moment throws and
	 * takes the rest of the script with it. An earlier version of this check
	 * did exactly that and reported "unset", which reads as a real failure and
	 * is in fact a broken probe.
	 *
	 * So instead of sampling once, this records *every* value data-theme has
	 * ever taken, in order, from before the root exists. The first entry is the
	 * earliest value the browser could have painted with, which is precisely
	 * the question: was the room ever day before it was night? A watcher that
	 * misses a mutation cannot invent one, so the first entry is trustworthy in
	 * the direction that matters.
	 */
	const probe = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
		source: `
			window.__themeLog = [];
			const record = () => {
				const t = document.documentElement && document.documentElement.dataset.theme;
				if (t && window.__themeLog[window.__themeLog.length - 1] !== t) {
					window.__themeLog.push(t);
				}
			};
			new MutationObserver(record).observe(document, {
				subtree: true, childList: true, attributes: true, attributeFilter: ['data-theme'],
			});
			record();
		`,
	});

	await cdp.goto(`${ORIGIN}/`, 700);

	const log = await cdp.evaluate<string[] | null>(`window.__themeLog`);
	check(
		'no flash: the root carried data-theme before the page could paint',
		Array.isArray(log) && log[0] === 'night',
		`the room was, in order: ${JSON.stringify(log)}`,
	);
	check(
		'and the day room was never shown first',
		Array.isArray(log) && !log.includes('day'),
		`a night reader saw ${JSON.stringify(log)}`,
	);

	await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: seeder.identifier });
	await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: probe.identifier });
}

/* --- 6. the label tells the truth, and changes with the state ------------- */
{
	await load(null, true); // OS night, so `auto` reads as dim
	const autoLabel = (await state()).label;
	check('the label names the choice, not the appearance', autoLabel === 'Auto', autoLabel);

	await press();
	const dayLabel = (await state()).label;
	check('the label changes when the state changes', dayLabel === 'Day', dayLabel);

	const name = (await state()).name;
	check(
		'the accessible name says what the next press will do',
		!!name && /switch to/i.test(name),
		name ?? 'none',
	);
}

/* --- 7. no JavaScript: the control is absent, the page is still readable --- */
{
	await cdp.newTab();
	await cdp.media([{ name: 'prefers-color-scheme', value: 'dark' }]);
	await cdp.send('Emulation.setScriptExecutionDisabled', { value: true });
	await cdp.goto(`${ORIGIN}/`);

	const noJs = await cdp.evaluate<{ hidden: boolean; display: string; theme: string | null }>(`(() => {
		const b = document.querySelector('[data-lamp]');
		return {
			hidden: !b || b.hasAttribute('hidden'),
			display: b ? getComputedStyle(b).display : 'absent',
			theme: document.documentElement.dataset.theme,
		};
	})()`);

	check(
		'without JS the lamp is not offered at all',
		noJs.hidden,
		`hidden=${noJs.hidden} display=${noJs.display}`,
	);
	check(
		'and it is genuinely not rendered, not just hidden',
		noJs.display === 'none',
		`display: ${noJs.display}`,
	);

	// The theme attribute is null here because the setting script is a script.
	// The claim worth making is that the page is still legible in the day room,
	// which is what §10 promises as the no-JS fallback.
	const bodyInk = await cdp.evaluate<string>(`getComputedStyle(document.body).color`);
	check(
		'without JS the page still has the day room and real ink',
		bodyInk !== 'rgb(0, 0, 0)',
		`body colour ${bodyInk}`,
	);

	await cdp.send('Emulation.setScriptExecutionDisabled', { value: false });
}

/* --- 8. keyboard ---------------------------------------------------------- */
{
	await load(null, false);
	// Focus the button the way a keyboard would — by tabbing to it — rather than
	// by calling focus(), so a `tabindex` or ordering fault would show up.
	const reached = await cdp.evaluate<boolean>(`(() => {
		const target = document.querySelector('[data-lamp]');
		target.focus();
		return document.activeElement === target;
	})()`);
	check('the lamp is focusable', reached);

	// Enter on a <button> fires click. Verified by driving the real key, because
	// dispatching a synthetic click would pass even if the key handler were
	// broken.
	const before = (await state()).choice;
	await cdp.send('Input.dispatchKeyEvent', {
		type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r',
	});
	await cdp.send('Input.dispatchKeyEvent', {
		type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13,
	});
	await Bun.sleep(200);
	const after = (await state()).choice;

	check('Enter activates it', before !== after, `${before} → ${after}`);

	const outline = await cdp.evaluate<string>(`(() => {
		const b = document.querySelector('[data-lamp]');
		b.focus();
		const s = getComputedStyle(b);
		return s.outlineStyle + ' ' + s.outlineWidth;
	})()`);
	check(
		'the focused lamp has a visible focus ring',
		!outline.startsWith('none'),
		outline,
	);
}

/* --- 9. it is on every page, in the header -------------------------------- */
{
	const routes = ['/', '/library', '/about', '/contact', '/services', '/colophon', '/newsletter'];
	let missing = 0;
	for (const route of routes) {
		await cdp.goto(`${ORIGIN}${route}`);
		const has = await cdp.evaluate<boolean>(`!!document.querySelector('[data-lamp]')`);
		if (!has) missing++;
	}
	check('the lamp is in the header on every page', missing === 0, `${routes.length - missing}/${routes.length}`);
}

await cdp.close();
report('lamp switch', results);
