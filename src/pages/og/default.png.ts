/**
 * /og/default.png — the shared brand card.
 *
 * Every page that is not a piece of writing points at this one: the library,
 * the about page, an offer, the 404. One card for the whole site means a link
 * to /services and a link to /about look like the same publication in a feed,
 * which is what they are, and it means there is a single thing to get right.
 *
 * The essay cards carry the title, the topic and the date. This one carries the
 * tagline and the address, which is the same arrangement with the site's own
 * name in the title's place.
 *
 * No `---` fences, and everything inside GET — see the note at the top of
 * `[...id].png.ts`, which is the same story told at more length.
 */
import type { APIRoute } from 'astro';

import { SITE } from '../../lib/site';
import { cardSvg } from '../../lib/og';
import { sharp } from '../../lib/raster';

export const GET: APIRoute = async () => {
	const svg = cardSvg({
		title: SITE.tagline,
		// The bare host, not the scheme: a card is read at a glance and https://
		// is four characters of nothing.
		meta: SITE.url.replace(/^https?:\/\//, '').toUpperCase(),
	});

	const png = await sharp(Buffer.from(svg))
		.png({ compressionLevel: 9, palette: true })
		.toBuffer();

	return new Response(png, {
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': 'public, max-age=31536000, immutable',
		},
	});
};
