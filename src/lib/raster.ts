/**
 * raster — the one place sharp is loaded, and the reason it is loaded oddly.
 *
 * sharp is a native module: a prebuilt binary plus a JavaScript wrapper with a
 * conditional `exports` map. Bun runs and imports it perfectly well on its own
 * — but Astro 7's bundler, when it is bun doing the bundling, chokes on that
 * exports map and fails the whole build with a parse error pointing at the
 * import statement rather than at anything to do with sharp's API.
 *
 * `createRequire` loads it at runtime instead, so the bundler never has to look
 * at it. That is the standard escape hatch for a native dependency, and it costs
 * one line of indirection in exchange for a build that works.
 *
 * sharp is not a new dependency. Astro already depends on it for its own image
 * service, and the social cards are the second thing in the project to use the
 * copy that is already installed.
 *
 * Two things are normalised here so the endpoints do not have to think about
 * them: sharp ships as CommonJS with a default export hung off it, and which of
 * the two you get depends on how it was loaded; and it hands back a Node Buffer
 * where a `Response` body wants a plain `Uint8Array` over a non-shared
 * `ArrayBuffer`. Asking for the function, and for a buffer typed the way the
 * Response constructor wants it, is cheaper than casting at four call sites.
 */

/** `Uint8Array<ArrayBuffer>` rather than `Buffer`: what a Response body needs. */
export type Bytes = Uint8Array<ArrayBuffer>;

import { createRequire } from 'node:module';

interface SharpPipeline {
	png: (options?: Record<string, unknown>) => { toBuffer: () => Promise<Bytes> };
	composite: (layers: unknown[]) => SharpPipeline;
	resize: (width: number, height: number, options?: Record<string, unknown>) => SharpPipeline;
}

type Sharp = (input?: unknown) => SharpPipeline;

const require = createRequire(import.meta.url);
const loaded: unknown = require('sharp');

/** sharp itself, as the callable it is. */
export const sharp = (
	typeof loaded === 'function' ? loaded : (loaded as { default: unknown }).default
) as Sharp;
