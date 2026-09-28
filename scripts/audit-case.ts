/**
 * Two-case audit — how many elements on each page actually shout.
 *
 * §5.2 rations uppercase to exactly two places per page: the hero manifesto and
 * the page title. This asks the rendered pages, and it does so by reading which
 * classes the *stylesheet* uppercases and then checking whether those classes
 * appear in the markup — rather than by counting `class="… uppercase"`, which
 * would only find the ones somebody remembered to label.
 *
 *   bun run scripts/audit-case.ts
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const DIST = 'dist';

async function pages(dir = DIST, out: string[] = []): Promise<string[]> {
	for (const name of await readdir(dir)) {
		const path = join(dir, name);
		if ((await stat(path)).isDirectory()) await pages(path, out);
		else if (name.endsWith('.html')) out.push(path);
	}
	return out;
}

const rows: [string, string[]][] = [];

for (const file of (await pages()).sort()) {
	const html = await readFile(file, 'utf8');

	// Every class the markup uses.
	const used = new Set(
		[...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean),
	);

	// Every rule in the page's inlined stylesheets that uppercases.
	const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
	const shouting = new Set<string>();

	for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		if (!/text-transform:\s*uppercase/.test(rule[2] ?? '')) continue;

		for (const selector of (rule[1] ?? '').split(',')) {
			for (const [, className] of selector.matchAll(/\.([A-Za-z][\w-]*)/g)) {
				if (used.has(className)) shouting.add(className);
			}
		}
	}

	const route =
		relative(DIST, file).replace(/index\.html$/, '').replace(/\.html$/, '') || '/';

	rows.push([route, [...shouting].sort()]);
}

console.log('  route'.padEnd(50) + 'uppercase classes');
for (const [route, classes] of rows) {
	console.log('  ' + route.padEnd(48) + `${classes.length}  ${classes.join(', ')}`);
}

/*
 * The size of each uppercasing rule, on one representative page.
 *
 * This is the question that decides whether §5.2 is being met or broken: a
 * 60px uppercase Fraunces page title is *shouting*, and eleven 11px Inter
 * labels are the small tracked voice §5.1 asks for. They look identical to a
 * class-name count and are opposite things.
 */
const sample = await readFile(join(DIST, 'library/index.html'), 'utf8');
const sampleCss = [...sample.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
	.map((m) => m[1])
	.join('\n');

console.log('\n  what actually shouts, and how loudly (on /library):');
for (const rule of sampleCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
	const body = rule[2] ?? '';
	if (!/text-transform:\s*uppercase/.test(body)) continue;

	const size = /font-size:\s*([^;]+)/.exec(body)?.[1]?.trim() ?? 'inherited';
	const family = (/font-family:\s*([^;]+)/.exec(body)?.[1]?.trim() ?? 'inherited').split(',')[0];
	const selectors = (rule[1] ?? '').trim().replace(/\s+/g, ' ');

	console.log(
		'  ' + selectors.slice(0, 38).padEnd(40) + `${size.padEnd(26)}${family}`,
	);
}
