/**
 * A minimal Chrome DevTools Protocol client, shared by the browser gates.
 *
 * `behaviour.ts` grew its own copy of this inline and still does; the gates
 * added in Phase 9 need the same four things — launch, attach, navigate,
 * evaluate — and three copies of a WebSocket multiplexer is three places for a
 * navigation race to hide. The shape is deliberately the same as the inline one
 * so the two can be compared when one of them misbehaves.
 *
 * No Playwright, no Puppeteer: the project ships zero external JS, and a gate
 * that needed a 40 MB browser download to check contrast ratios would be a gate
 * nobody runs. This drives the Chrome that is already on the machine.
 */

export const CHROME =
	process.env.CHROME_PATH ??
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export interface CdpOptions {
	/** Fixed port so two suites cannot collide on one profile. */
	port?: number;
	/** A separate user-data-dir, so a suite can start from a clean cache and a
	 *  clean localStorage without touching anybody's real Chrome profile. */
	profile: string;
}

export class Cdp {
	#proc: ReturnType<typeof Bun.spawn> | undefined;
	#ws: WebSocket | undefined;
	#id = 0;
	#pending = new Map<number, (value: any) => void>();

	/** Read by the console-message check, which wants the raw text. */
	consoleOutput: string[] = [];
	pageErrors: string[] = [];

	static async launch({ port, profile }: CdpOptions) {
		const cdp = new Cdp();
		await cdp.#start(port, profile);
		return cdp;
	}

	async #start(port: number, profile: string) {
		this.#port = port;
		this.#proc = Bun.spawn(
			[
				CHROME, '--headless=new', '--disable-gpu', '--no-first-run',
				'--no-default-browser-check', '--disable-extensions',
				`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
				'about:blank',
			],
			{ stdout: 'ignore', stderr: 'ignore' },
		);

		// Chrome prints a DevTools-on-stderr banner that is not an error, so
		// readiness is the debugging endpoint answering, not the absence of
		// output. A fixed number of attempts rather than a timer, because on a
		// loaded machine the port can be late and `sleep` alone would flake.
		for (let i = 0; i < 80; i++) {
			try {
				if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) return;
			} catch {}
			await Bun.sleep(100);
		}

		throw new Error(
			`Chrome did not expose a debugging port on ${port}. Is it installed at ${CHROME}?`,
		);
	}

	/**
	 * Open a tab and attach to it.
	 *
	 * `PUT /json/new` rather than the target list: a new tab gives a clean
	 * emulation state, which matters because `Emulation.setEmulatedMedia` and
	 * `setDeviceMetricsOverride` are cleared by navigation and are not always
	 * re-appliable on a tab that has been through a suite's worth of changes.
	 */
	async newTab() {
		const opened = await (
			await fetch(`http://127.0.0.1:${this.#port}/json/new?about:blank`, { method: 'PUT' })
		).json();

		this.#ws = new WebSocket(opened.webSocketDebuggerUrl);
		await new Promise<void>((ok, fail) => {
			this.#ws!.onopen = () => ok();
			this.#ws!.onerror = () => fail(new Error('CDP socket failed to open'));
		});

		this.#ws.onmessage = (e) => {
			const m = JSON.parse(String(e.data));

			if (m.id !== undefined) {
				this.#pending.get(m.id)?.(m.result ?? {});
				this.#pending.delete(m.id);
				return;
			}

			// Collected rather than printed: the point is to assert that these
			// are *empty*, and a gate that dumps a console log nobody reads is a
			// gate that gets ignored when it does dump one.
			if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
				this.consoleOutput.push(
					`${m.params.type}: ${m.params.args.map((a: any) => a.value ?? a.description).join(' ')}`,
				);
			}
			if (m.method === 'Runtime.exceptionThrown') {
				this.pageErrors.push(
					m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text,
				);
			}
		};

		await this.send('Page.enable');
		await this.send('Runtime.enable');
		await this.send('Log.enable');

		return opened.id as string;
	}

	#port = 0;

	send(method: string, params: object = {}) {
		// A gate that forgets to call newTab() gets a bare WebSocket TypeError
		// pointing into this file, which says nothing about the caller's mistake.
		if (!this.#ws) {
			throw new Error('Cdp.send before newTab() — open a tab before driving the browser');
		}

		return new Promise<any>((ok) => {
			const n = ++this.#id;
			this.#pending.set(n, ok);
			this.#ws!.send(JSON.stringify({ id: n, method, params }));
		});
	}

	/**
	 * Evaluate in the page and bring the value back as JSON.
	 *
	 * A thrown expression is an error here, not a `null` result. A gate that
	 * silently reports `false` for an expression that blew up is the failure
	 * mode this project has already been bitten by once — see behaviour.ts on
	 * `prefers-reduced-motion` — so it is worth the few lines to be loud.
	 */
	async evaluate<T = any>(expression: string): Promise<T> {
		const res = await this.send('Runtime.evaluate', {
			expression,
			returnByValue: true,
			awaitPromise: true,
		});

		if (res?.exceptionDetails) {
			throw new Error(
				`evaluate threw: ${res.exceptionDetails.exception?.description ?? res.exceptionDetails.text}`,
			);
		}

		const value = res?.result?.value;
		if (typeof value !== 'string') return value as T;
		try {
			return JSON.parse(value) as T;
		} catch {
			return value as unknown as T;
		}
	}

	/**
	 * Navigate and wait for the page to settle.
	 *
	 * The wait is for `load` plus a beat rather than for network idle: these
	 * pages have no long-polling, and `load` plus a fixed margin proved steadier
	 * than a load-state race in the earlier suite.
	 */
	async goto(url: string, settle = 900) {
		await this.send('Page.navigate', { url });
		await Bun.sleep(settle);
	}

	async viewport(width: number, height: number, scale = 1, mobile = false) {
		await this.send('Emulation.setDeviceMetricsOverride', {
			width, height, deviceScaleFactor: scale, mobile,
		});
	}

	/** Emulate an OS-level media preference, e.g. `prefers-color-scheme: dark`. */
	async media(features: { name: string; value: string }[]) {
		await this.send('Emulation.setEmulatedMedia', { features });
	}

	async close() {
		try {
			this.#ws?.close();
		} catch {}
		this.#proc?.kill();
	}
}

/* ------------------------------------------------------------------ reporting */

/**
 * The one result reporter every gate uses.
 *
 * A gate that prints a summary but cannot fail is worse than no gate, so this
 * throws a non-zero exit rather than returning a count. `check.sh` pipes gates
 * through `run_gate`, which reads the exit status — and a `| tail -2` pipeline
 * would report `tail`'s status, so the failure has to be the script's own.
 */
export function report(title: string, results: string[]) {
	const failed = results.filter((r) => r.startsWith('FAIL'));

	for (const line of results) {
		if (process.env.QUIET && !line.startsWith('FAIL')) continue;
		console.log(`  ${line}`);
	}

	console.log(`${title}: ${results.length - failed.length}/${results.length}`);

	// Exit explicitly either way. Chrome is a child process that outlives the
	// event loop, so returning from the last check leaves the gate hanging
	// rather than exiting — which reads as a gate that timed out, not one that
	// passed.
	process.exit(failed.length ? 1 : 0);
}

export const pass = (name: string, ok: boolean, detail = '') =>
	`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`;

/** The origin a gate should test. Defaults to the dev server; the perf and
 *  content gates point it at a static server over `dist/` instead. */
export const ORIGIN = process.env.ORIGIN ?? 'http://localhost:4321';
