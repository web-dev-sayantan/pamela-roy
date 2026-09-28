/**
 * A small headless-Chrome harness for checking the design.
 *
 * Chrome's --screenshot flag cannot scroll, cannot report console errors, and
 * cannot tell you which element is too wide. This drives the DevTools protocol
 * directly instead, so a layout question ("what is overflowing at 375px?") gets
 * a real answer rather than a guess.
 *
 *   bun run scripts/shoot.ts                      # all viewports, day + night
 *   bun run scripts/shoot.ts --w 375 --h 812      # one viewport
 *   bun run scripts/shoot.ts --url /library       # another route
 *   bun run scripts/shoot.ts --full               # full-page capture
 */

import { spawn, type Subprocess } from 'bun';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.ORIGIN ?? 'http://localhost:4321';
const OUT = process.env.SHOT_DIR ?? '/tmp/pamshots';
const PORT = 9333;

/* ------------------------------------------------------------------ args --- */

const argv = Bun.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string, fallback: string) => {
	const i = argv.indexOf(`--${name}`);
	return i === -1 ? fallback : argv[i + 1];
};

const ROUTE = opt('url', '/');
const FULL = flag('full');

/** For /404: tolerate the browser logging the 404 status it asked for. */
const EXPECT_404 = flag('expect-404');

const VIEWPORTS = opt('w', '')
	? [{ name: 'custom', w: +opt('w', '375'), h: +opt('h', '812') }]
	: [
			{ name: 'm360', w: 360, h: 640 },
			{ name: 'm375', w: 375, h: 812 },
			{ name: 'm390', w: 390, h: 844 },
			{ name: 'm768', w: 768, h: 1024 },
			{ name: 'd1024', w: 1024, h: 768 },
			{ name: 'd1440', w: 1440, h: 900 },
			{ name: 'd1920', w: 1920, h: 1080 },
		];

const THEMES = flag('night') ? ['night'] : flag('day') ? ['day'] : ['day', 'night'];

/* ----------------------------------------------------------------- chrome --- */

mkdirSync(OUT, { recursive: true });

const chrome: Subprocess = spawn(
	[
		CHROME,
		'--headless=new',
		'--disable-gpu',
		'--hide-scrollbars',
		'--mute-audio',
		'--no-first-run',
		'--disable-extensions',
		`--remote-debugging-port=${PORT}`,
		'--user-data-dir=/tmp/pam-chrome-profile',
		'about:blank',
	],
	{ stdout: 'ignore', stderr: 'ignore' },
);

const cleanup = () => {
	try {
		chrome.kill();
	} catch {}
};
process.on('exit', cleanup);

/** Poll until the debugging endpoint answers. */
async function waitForChrome() {
	for (let i = 0; i < 60; i++) {
		try {
			const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
			if (res.ok) return;
		} catch {}
		await Bun.sleep(100);
	}
	throw new Error('Chrome did not expose a debugging port');
}

/* -------------------------------------------------------------------- cdp --- */

type Session = { send: (method: string, params?: object) => Promise<any> };

async function connect(
	wsUrl: string,
): Promise<{ session: Session; events: Array<{ method: string; params: any }>; close: () => void }> {
	const ws = new WebSocket(wsUrl);
	await new Promise<void>((ok, fail) => {
		ws.onopen = () => ok();
		ws.onerror = () => fail(new Error('websocket failed'));
	});

	let id = 0;
	const pending = new Map<number, (value: any) => void>();
	const events: Array<{ method: string; params: any }> = [];

	ws.onmessage = (event) => {
		const msg = JSON.parse(String(event.data));
		if (msg.id !== undefined) pending.get(msg.id)?.(msg);
		else events.push(msg);
	};

	return {
		session: {
			// Resolves with the CDP `result` object, so callers get
			// `{ data }` from captureScreenshot rather than the raw envelope.
			send: (method, params = {}) =>
				new Promise((ok) => {
					const messageId = ++id;
					pending.set(messageId, (msg) => ok(msg?.result ?? {}));
					ws.send(JSON.stringify({ id: messageId, method, params }));
				}),
		},
		close: () => ws.close(),
		events,
	};
}

/**
 * Runs in the page. Two things a screenshot shows but does not explain:
 *
 *  - **overflow**: anything wider than the viewport, which scrolls sideways;
 *  - **bleed**: text sitting under the room frame, which does not scroll at
 *    all — the frame is a fixed overlay, so content underneath it is simply
 *    gone. This is the quieter and more likely failure, because nothing about
 *    the page reports it.
 */
const DIAGNOSTICS = `(() => {
  const vw = document.documentElement.clientWidth;
  const frame =
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--frame-w')) || 0;

  const label = (el) =>
    el.tagName.toLowerCase() +
    (el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.')
      : '');

  const offenders = [];
  const bleed = [];

  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;

    if (r.right > vw + 1 || r.left < -1) {
      offenders.push({
        tag: label(el),
        left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width),
      });
    }

    // Only real text counts, and never from a subtree the design has already
    // marked decorative.
    const hasText = [...el.childNodes].some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 0,
    );
    if (!hasText) continue;
    if (el.closest('[aria-hidden="true"], .visually-hidden, .grain, .hearth, .progress')) continue;

    if (r.left < frame - 1 || r.right > vw - frame + 1) {
      bleed.push({
        tag: label(el),
        text: (el.textContent || '').trim().slice(0, 40),
        left: Math.round(r.left), right: Math.round(r.right),
      });
    }
  }

  return JSON.stringify({
    vw,
    frame,
    scrollWidth: document.documentElement.scrollWidth,
    overflowing: document.documentElement.scrollWidth > vw,
    bleeding: bleed.length > 0,
    offenders: offenders.slice(0, 8),
    bleed: bleed.slice(0, 6),
  });
})()`;

async function main() {
	await waitForChrome();

	const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, {
		method: 'PUT',
	})).json();

	const { session, events, close } = await connect(target.webSocketDebuggerUrl);
	await session.send('Page.enable');
	await session.send('Runtime.enable');
	await session.send('Log.enable');
	await session.send('Emulation.setEmulatedMedia', { features: [] });

	const problems: string[] = [];

	for (const theme of THEMES) {
		for (const vp of VIEWPORTS) {
			await session.send('Emulation.setDeviceMetricsOverride', {
				width: vp.w,
				height: vp.h,
				deviceScaleFactor: 1,
				mobile: vp.w < 768,
			});
			// Force the theme through the same channel localStorage uses, so
			// both the day and the night room are captured on demand.
			await session.send('Emulation.setScriptExecutionDisabled', { value: false });
			await session.send('Page.navigate', { url: ORIGIN + ROUTE });
			await Bun.sleep(900);
			await session.send('Runtime.evaluate', {
				expression: `localStorage.setItem('theme','${theme}')`,
			});
			await session.send('Page.reload', {});
			await Bun.sleep(1600);

			const diag = await session.send('Runtime.evaluate', {
				expression: DIAGNOSTICS,
				returnByValue: true,
			});
			const info = JSON.parse(diag.result.value);

			// Anything the page logged or threw since the last navigation. An
			// empty console is part of the definition of done on this site.
			//
			// The one exception is the 404 page. Asking a browser for a URL that
			// does not exist makes Chrome log the status itself, whatever the
			// server then serves — so there the message is the correct answer to
			// a correct request, not a fault. Gated on an explicit flag rather
			// than suppressed by text, which would also hide real errors.
			const isExpected404 = (text: string) =>
				EXPECT_404 && /status of 404|Failed to load resource/i.test(text);

			const noise = events
				.filter(
					(e) =>
						e.method === 'Runtime.exceptionThrown' ||
						(e.method === 'Runtime.consoleAPICalled' &&
							['error', 'warning', 'assert'].includes(e.params?.type)) ||
						(e.method === 'Log.entryAdded' &&
							['error', 'warning'].includes(e.params?.entry?.level)),
				)
				.map((e) => {
					if (e.method === 'Log.entryAdded') return e.params.entry.text;
					if (e.method === 'Runtime.exceptionThrown')
						return e.params?.exceptionDetails?.text ?? 'exception';
					return (e.params?.args ?? [])
						.map((a: any) => a.value ?? a.description ?? '')
						.join(' ');
				})
				.filter((text) => !isExpected404(text));
			events.length = 0;
			if (noise.length) problems.push(`${vp.name} (${theme}) console:\n    ${noise.join('\n    ')}`);

			const name = `${theme === 'night' ? 'n' : 'd'}-${vp.name}${ROUTE.replace(/\//g, '_')}`;
			if (FULL) {
				const { data } = await session.send('Page.captureScreenshot', {
					format: 'png',
					captureBeyondViewport: true,
				});
				writeFileSync(join(OUT, `${name}-full.png`), Buffer.from(data, 'base64'));
			}
			const shot = await session.send('Page.captureScreenshot', { format: 'png' });
			writeFileSync(join(OUT, `${name}.png`), Buffer.from(shot.data, 'base64'));

			const tag = info.overflowing ? 'OVERFLOW' : info.bleeding ? 'UNDER FRAME' : 'ok';
			console.log(
				`${tag.padEnd(11)} ${theme.padEnd(6)} ${String(vp.w).padStart(4)}px  ` +
					`client=${info.vw} scroll=${info.scrollWidth} frame=${info.frame}  ${name}.png`,
			);
			if (info.overflowing) {
				problems.push(
					`${name}: scrollWidth ${info.scrollWidth} > ${info.vw}\n` +
						info.offenders
							.map((o: any) => `    ${o.tag}  left=${o.left} right=${o.right} w=${o.width}`)
							.join('\n'),
				);
			}
			if (info.bleeding) {
				problems.push(
					`${name}: text inside the ${info.frame}px frame\n` +
						info.bleed
							.map((b: any) => `    ${b.tag}  left=${b.left} right=${b.right}  "${b.text}"`)
							.join('\n'),
				);
			}
		}
	}

	close();
	if (problems.length) {
		console.log('\nProblems:\n' + problems.join('\n'));
		process.exitCode = 1;
	} else {
		console.log('\nNo overflow, nothing under the frame, no console output.');
	}
}

await main();
cleanup();
process.exit(0);
