/**
 * The three specific things §11 P9.4 asks to be checked at every stop.
 *
 *   bun run scripts/check-responsive.ts
 *
 *   360, 390, 768, 1024, 1440, 1920 — check the manifesto at every stop; check
 *   the catalogue's two-column collapse; check frame width steps
 *
 * `shoot.ts` already walks all six widths across eleven routes in both themes
 * looking for overflow, and `check-manifesto.py` already measures the hero's fit
 * with a real font engine. So this does not repeat either. What is missing is
 * that both of those answer "is anything broken" and neither answers the three
 * questions the phase actually names, which are all about *specific values*:
 *
 *   - the frame is 48 / 36 / 20px and steps at the widths it claims to
 *   - the catalogue is two columns, and collapses to one at the right stop
 *   - the hero's type does not overflow its own box
 *
 * A sweep that reports "no overflow" is silent when the frame steps at the wrong
 * breakpoint, because a 48px frame at 700px wide is not broken, it is wrong.
 */

import { Cdp, pass, report } from './lib/cdp';
import { serveDist } from './lib/serve';

/* The widths §11 P9.4 names, plus the two that sit either side of the 640px
   frame step, because a step is only pinned down by its neighbours. */
const WIDTHS = [360, 390, 640, 641, 768, 1024, 1025, 1440, 1920];

const server = serveDist('dist', 0);
const results: string[] = [];
const check = (name: string, ok: boolean, detail = '') =>
	results.push(pass(name, ok, detail));

const cdp = await Cdp.launch({ port: 9349, profile: '/tmp/pam-chrome-responsive' });
await cdp.newTab();

/* --- 1. the room frame steps at the widths it claims to ------------------- */

/*
 * Read off `body::after`, which is a pseudo-element and so has no box of its own
 * to measure. Its border width is the frame, and the computed value is the
 * number that has to change.
 */
const frameAt = async (width: number) => {
	await cdp.viewport(width, 900);
	await cdp.goto(`${server.url}/`, 500);
	return cdp.evaluate<number>(`(() => {
		const s = getComputedStyle(document.body, '::after');
		return parseFloat(s.borderTopWidth) || 0;
	})()`);
};

for (const [width, expected] of [
	[360, 12],
	[390, 12],
	[640, 12],
	[641, 28],
	[768, 28],
	[1024, 28],
	[1025, 48],
	[1440, 48],
	[1920, 48],
] as const) {
	const actual = await frameAt(width);
	check(
		`the frame is ${expected}px at ${width}px wide`,
		actual === expected,
		`measured ${actual}px`,
	);
}

/* --- 1b. the gutter is a separate, larger value --------------------------- */

/*
 * The frame and the gutter used to be one token, which meant content was padded
 * by exactly the casing's own thickness and its left edge landed on the casing's
 * inner edge. The frame reading correctly at every width is therefore not
 * sufficient: this asserts the gutter is a real inset of its own, and that the
 * air between the frame and the text is positive rather than zero.
 */
for (const [width, expectedGutter, expectedFrame] of [
	[360, 32, 12],
	[390, 32, 12],
	[640, 32, 12],
	[641, 48, 28],
	[768, 48, 28],
	[1024, 48, 28],
	[1025, 80, 48],
	[1440, 80, 48],
	[1920, 80, 48],
] as const) {
	await cdp.viewport(width, 900);
	await cdp.goto(`${server.url}/`, 500);

	const m = await cdp.evaluate<{ gutter: number; frame: number; air: number }>(`(() => {
		const root = getComputedStyle(document.documentElement);
		const frame = parseFloat(getComputedStyle(document.body, '::after').borderTopWidth) || 0;
		// Read the gutter off .shell's own padding rather than the token, so this
		// measures what content actually gets inset by.
		const shell = document.querySelector('main .section');
		const pad = parseFloat(getComputedStyle(shell).paddingLeft) || 0;
		const text = document.querySelector('main .section h2');
		return {
			gutter: pad,
			frame,
			// Where the first heading actually starts, measured from the frame's edge.
			air: text ? Math.round(text.getBoundingClientRect().left - frame) : null,
		};
	})()`);

	check(
		`the gutter is ${expectedGutter}px at ${width}px wide`,
		m.gutter === expectedGutter,
		`measured ${m.gutter}px`,
	);

	check(
		`content clears the frame by at least 8px at ${width}px wide`,
		m.air !== null && m.air >= 8,
		`${m.air}px of air inside a ${m.frame}px frame (gutter ${m.gutter}px, expected ${expectedFrame}px frame)`,
	);
}

/* --- 2. the frame contains everything ------------------------------------ */

for (const width of [360, 768, 1440]) {
	await cdp.viewport(width, 900);
	await cdp.goto(`${server.url}/library/2026/the-middle-of-the-book`, 600);

	const inside = await cdp.evaluate<{ worst: number; frame: number; count: number }>(`(() => {
		const frame = parseFloat(getComputedStyle(document.body, '::after').borderLeftWidth);
		// Only elements that are actually painted in the reading column matter; a
		// full-bleed hero is *meant* to run under the frame.
		const targets = [...document.querySelectorAll('main p, main h1, main h2, main li, header a, footer a')]
			.map(el => el.getBoundingClientRect())
			.filter(r => r.width > 0 && r.height > 0);
		let worst = Infinity;
		for (const r of targets) {
			worst = Math.min(worst, r.left - frame, window.innerWidth - frame - r.right);
		}
		return { worst: worst === Infinity ? null : Math.round(worst), frame, count: targets.length };
	})()`);

	check(
		`nothing sits under the frame at ${width}px`,
		inside.worst !== null && inside.worst >= 0,
		`${inside.count} elements, tightest margin ${inside.worst}px inside a ${inside.frame}px frame`,
	);
}

/* --- 3. the catalogue is two columns, and collapses at the right stop ---- */

/*
 * The two-column collapse is a *row* grid, not a shelf: each catalogue row is
 * `7rem 1fr`, a date margin beside the title, and it becomes a single column at
 * 480px so the date sits above the title instead of in a margin there is no room
 * for. 480 and 481 are both measured, because a breakpoint is only pinned down
 * by its two sides.
 */
for (const [width, expected] of [
	[360, 1],
	[390, 1],
	[480, 1],
	[481, 2],
	[768, 2],
	[1024, 2],
	[1440, 2],
	[1920, 2],
] as const) {
	await cdp.viewport(width, 900);
	await cdp.goto(`${server.url}/library`, 700);

	const cols = await cdp.evaluate<number | null>(`(() => {
		// The grid is on the row. #catalogue is the <section> wrapping the year
		// groups and has no grid of its own, so an earlier version of this check
		// asked it for gridTemplateColumns, got "none", and reported one column at
		// every width — including the ones where the catalogue is plainly two
		// columns. A gate pointed at the wrong element is worse than no gate,
		// because it looks like a measurement.
		const row = document.querySelector('.catalogue__row');
		if (!row) return null;
		return getComputedStyle(row).gridTemplateColumns.split(' ').filter(Boolean).length;
	})()`);

	check(
		`the catalogue row is ${expected} column${expected === 1 ? '' : 's'} wide at ${width}px`,
		cols === expected,
		cols === null ? 'no .catalogue__row on the page' : `measured ${cols}`,
	);
}

/* --- 4. the manifesto holds its box -------------------------------------- */

for (const width of [360, 390, 768, 1024, 1440, 1920]) {
	await cdp.viewport(width, width < 500 ? 640 : 900);
	await cdp.goto(`${server.url}/`, 600);

	const hero = await cdp.evaluate<{ overflow: number; lines: number }>(`(() => {
		const m = document.querySelector('.manifesto');
		if (!m) return { overflow: null, lines: 0 };
		return {
			overflow: Math.round(m.scrollWidth - m.clientWidth),
			lines: m.getClientRects().length,
		};
	})()`);

	check(
		`the manifesto does not overflow its box at ${width}px`,
		hero.overflow !== null && hero.overflow <= 0,
		hero.overflow === null ? 'no .manifesto' : `${hero.overflow}px of horizontal overflow`,
	);
}

await cdp.close();
server.close();

report('responsive', results);
