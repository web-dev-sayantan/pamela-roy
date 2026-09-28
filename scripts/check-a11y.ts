/**
 * Accessibility audit: axe, over every route, in both themes.
 *
 *   bun run scripts/check-a11y.ts
 *
 * Phase 9 item 2. The behaviour suite already checks the things a rule engine
 * cannot know — that the skip link is the *first* focusable element, that the
 * mobile menu traps focus and closes on Escape, that `prefers-reduced-motion`
 * actually reaches the cascade. axe covers the inverse: the mechanical rules,
 * across 27 pages, in both rooms, which nobody reads 54 times by hand.
 *
 * It fails on serious and critical violations only. Moderate and minor findings
 * are listed but do not fail the gate, because a gate that fails on a
 * low-confidence heuristic gets switched off, and a switched-off gate is worse
 * than the finding it was reporting.
 *
 * Runs against the dev server, not `dist/`. That is a deliberate exception to
 * this project's usual rule, and worth stating: the claims being made are
 * about the rendered DOM as a reader receives it, and the dev server serves the
 * same components. What dev cannot prove — that the *build* contains these
 * pages — is already asserted by check-content.ts and check-seo.ts.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { Cdp, ORIGIN, pass, report } from './lib/cdp';

const PORT = 9343;

/* The routes, read from the build so a new page is audited the day it is
   added rather than the day somebody remembers to add it here. */
const routes = readdirSync('dist', { recursive: true })
	.map(String)
	.filter((f) => f.endsWith('index.html'))
	.map((f) => '/' + f.replace(/index\.html$/, '').replace(/^\//, ''))
	.concat(['/404'])
	.filter((r) => r !== '/404/index.html')
	.sort();

/* axe is injected as source rather than loaded from a <script src>, because the
   site ships zero external JS and this must not become the place that changes. */
const AXE = readFileSync(join('node_modules/axe-core/axe.min.js'), 'utf8');

const THEMES = [
	{ name: 'day', scheme: 'light' as const },
	{ name: 'night', scheme: 'dark' as const },
];

const results: string[] = [];
const findings: { route: string; theme: string; impact: string; id: string; help: string; nodes: number; sample: string }[] = [];

const cdp = await Cdp.launch({ port: PORT, profile: '/tmp/pam-chrome-a11y' });

for (const theme of THEMES) {
	await cdp.newTab();
	await cdp.viewport(1280, 900);
	await cdp.media([{ name: 'prefers-color-scheme', value: theme.scheme }]);

	for (const route of routes) {
		await cdp.goto(`${ORIGIN}${route}`, 700);

		// The stored theme is removed so the page follows the emulated OS
		// preference, which is what makes "both themes" mean the day and night
		// token sets rather than the same page twice.
		await cdp.evaluate(`(() => {
			try { localStorage.removeItem('theme') } catch {}
			document.documentElement.dataset.theme = '${theme.name}';
			document.documentElement.dataset.themeChoice = 'auto';
			return true;
		})()`);

		await cdp.evaluate<string>(`(() => {
			const s = document.createElement('script');
			s.textContent = ${JSON.stringify(AXE)};
			document.head.appendChild(s);
			return typeof axe;
		})()`);

		const ready = await cdp.evaluate<boolean>(`typeof axe !== 'undefined' && !!axe.run`);
		if (!ready) {
			results.push(pass(`${route} (${theme.name})`, false, 'axe failed to load'));
			continue;
		}

		/*
		 * The result is parked on `window` and read back, rather than returned
		 * through the CDP promise. `Runtime.evaluate` with `awaitPromise` hands
		 * back something that is not reliably the resolved value here, and
		 * parsing it failed with a JSON error that pointed at this file rather
		 * than at the cause. Parking it also gives axe somewhere to report a
		 * rejection, so a rule configuration error surfaces as a message instead
		 * of as an unparseable value.
		 */
		await cdp.evaluate(`(() => {
			window.__axe = null;
			axe.run(document, {
				resultTypes: ['violations'],
				// The room frame and the grain overlay are decorative by design and
				// carry no text, so the rules that would flag them are off.
				// Everything else is left on: an exclusion is a decision, and this
				// is it.
				runOnly: {
					type: 'tag',
					values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
				},
			}).then(
				r => {
					window.__axe = JSON.stringify({
						violations: r.violations.map(v => ({
							id: v.id,
							impact: v.impact,
							help: v.help,
							nodes: v.nodes.length,
							sample: v.nodes.slice(0, 2).map(n => (n.target || []).join(' ')).join(' | '),
						})),
						passes: r.passes.length,
						incomplete: r.incomplete.length,
					});
				},
				e => { window.__axe = JSON.stringify({ fatal: String(e && e.message || e) }); },
			);
			return true;
		})()`);

		// axe walks the whole DOM including its own injected styles; a slow page
		// is normal, so this polls rather than assuming a fixed cost.
		let parsed: { violations?: any[]; fatal?: string; passes?: number } | null = null;
		for (let i = 0; i < 40 && parsed === null; i++) {
			await Bun.sleep(150);
			// Cdp.evaluate parses a JSON string into a value, so the string parked
			// in the page arrives here already as an object. A second JSON.parse
			// on it would coerce it to "[object Object]" and throw.
			parsed = (await cdp.evaluate<any>('window.__axe')) ?? null;
		}

		if (parsed === null) {
			results.push(pass(`${route} (${theme.name})`, false, 'axe never returned'));
			continue;
		}

		if (parsed.fatal) {
			results.push(pass(`${route} (${theme.name})`, false, `axe error: ${parsed.fatal}`));
			continue;
		}

		const violations = parsed.violations ?? [];
		const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
		const minor = violations.filter((v) => v.impact !== 'serious' && v.impact !== 'critical');

		for (const v of violations) {
			findings.push({ route, theme: theme.name, ...v });
		}

		results.push(
			pass(
				`${route} (${theme.name})`,
				serious.length === 0,
				serious.length
					? serious.map((v) => `${v.id} ×${v.nodes}`).join(', ')
					: minor.length
						? `clean; ${minor.length} minor: ${minor.map((v) => v.id).join(', ')}`
						: 'no violations',
			),
		);
	}
}

await cdp.close();

/* --- report --------------------------------------------------------------- */

report('axe', results);

/*
 * Findings are printed after the summary rather than swallowed by it, so a
 * green run with known minor findings still tells the reader what they are.
 */
if (findings.length) {
	console.log('');
	for (const f of findings) {
		console.log(
			`  ${(f.impact ?? '?').toUpperCase().padEnd(8)} ${f.id.padEnd(22)} ${f.route} (${f.theme}) — ${f.nodes} node(s)`,
		);
		console.log(`           ${f.help}`);
		if (f.sample) console.log(`           at ${f.sample}`);
	}
}

/*
 * Contrast is the one class of violation the hand-written gates cover and axe
 * is weakest on, because it samples computed colours and cannot see text over a
 * photograph or a gradient. The hearth bloom is exactly that case, so the count
 * is reported rather than trusted either way.
 */
const contrast = findings.filter((f) => f.id.includes('color-contrast'));
if (contrast.length) {
	console.log('');
	console.log(`  note: ${contrast.length} contrast finding(s). These overlap the token audit;`);
	console.log(`        check each by eye before treating one as real.`);
}
