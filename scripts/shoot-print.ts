/**
 * shoot-print — renders a page under print media and saves a PDF.
 *
 * The print stylesheet is the one part of the site that no screenshot gate can
 * see: `shoot.ts` captures screen media, and a print capture is a different
 * media type with a different layout entirely. It is also the part most likely
 * to be quietly wrong, because a print stylesheet that does nothing still
 * produces a plausible-looking page.
 *
 * So this exists to be *looked at*. It drives the same CDP harness the other
 * gates use, switches the page to print media, and prints to PDF — the same
 * thing a reader gets from the browser's own print dialog, so what comes out is
 * what they would see.
 *
 *   bun run scripts/shoot-print.ts --url /library/2026/the-middle-of-the-book
 */

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.ORIGIN ?? 'http://localhost:4321';
const PORT = 9347;

const args = process.argv.slice(2);
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : '/';
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : '/tmp/pam-print.pdf';

const chrome = Bun.spawn(
	[
		CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
		`--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/pam-chrome-print', 'about:blank',
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
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise<void>((ok) => (ws.onopen = () => ok()));

let id = 0;
const pending = new Map<number, (v: any) => void>();
ws.onmessage = (e) => {
	const m = JSON.parse(String(e.data));
	if (m.id !== undefined) pending.get(m.id)?.(m.result ?? {});
};
const send = (method: string, params: object = {}) =>
	new Promise<any>((ok) => {
		const n = ++id;
		pending.set(n, ok);
		ws.send(JSON.stringify({ id: n, method, params }));
	});

await send('Page.enable');
await send('Runtime.enable');

const evaluate = async (expression: string) => {
	const res = await send('Runtime.evaluate', { expression, returnByValue: true });
	return res?.result?.value;
};

/* A4 at 96dpi, with the same 18mm margin the stylesheet asks for. */
await send('Emulation.setDeviceMetricsOverride', {
	width: 794, height: 1123, deviceScaleFactor: 1, mobile: false,
});

/*
 * Load once under screen media so the page's scripts and fonts are warm, then
 * switch to print. Loading *under* print media is a truer test of a print-only
 * stylesheet, but the reveal script and the font loading both behave differently
 * there, and this file is about the paper, not about the script.
 */
await send('Page.navigate', { url: ORIGIN + url });
await Bun.sleep(2500);
await send('Emulation.setEmulatedMedia', { media: 'print' });
await Bun.sleep(800);

const { data } = await send('Page.printToPDF', {
	landscape: false,
	printBackground: true,
	preferCSSPageSize: true,
});

await Bun.write(out, Buffer.from(data, 'base64'));

const pages = (Buffer.from(data, 'base64').toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
console.log(`  ${url}  ->  ${out}  (${pages} page${pages === 1 ? '' : 's'}, ${Math.round(data.length / 1024)}kB)`);

/*
 * A shot of the foot of the document, for the one thing a PDF cannot be asked
 * about here: the print stylesheet hides everything, so the risk is not that too
 * much survives but that the *address* — the one element that only exists for
 * paper — never appears at all. Reading it back out of the PDF does not work
 * either, because the embedded subset font encodes text as glyph indices.
 */
if (args.includes('--foot')) {
	const shot = args[args.indexOf('--foot') + 1] ?? '/tmp/pam-print-foot.png';

	await evaluate(`scrollTo(0, document.body.scrollHeight)`);
	await Bun.sleep(400);

	const { data: png } = await send('Page.captureScreenshot', { format: 'png' });
	await Bun.write(shot, Buffer.from(png, 'base64'));
	console.log(`  foot  ->  ${shot}`);
}

ws.close();
chrome.kill();
