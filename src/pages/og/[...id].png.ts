/**
 * /og/[...id].png — one social card per piece of writing.
 *
 * A build-time endpoint rather than a static file, because the card carries the
 * title, the topic and the date, and those change every time an essay is edited
 * or republished. A committed PNG would be a lie within a month.
 *
 * The drawing and the text wrap live in lib/og.ts. This file's whole job is to
 * get the right data into them and to turn the resulting SVG into a PNG with
 * the one rasteriser Astro already ships.
 *
 * Two things about the shape of this file, both of which are the shape of every
 * Astro endpoint rather than preferences:
 *
 * - There are no `---` fences. A plain `.ts` endpoint in `src/pages/` is not a
 *   page, so nothing strips frontmatter; the dashes survive into the module and
 *   the parser dies on the first import. `rss.xml.ts` has no fences either, and
 *   that is why it has always built.
 * - Everything happens inside `GET`. `Astro.props` does not exist at module
 *   scope in an endpoint, and reaching for it there fails at prerender time
 *   rather than at build time, which is a slower way to learn the same thing.
 */
import type { APIRoute } from 'astro';

import type { Writing } from '../../lib/writings';
import { allWritings, shortDate } from '../../lib/writings';
import { topicLabel } from '../../lib/topics';
import { CARD_HEIGHT, PLATE, cardSvg } from '../../lib/og';
import { readCover } from '../../lib/cover';
import { sharp } from '../../lib/raster';

export async function getStaticPaths() {
	const entries = await allWritings();

	return entries.map((entry) => ({
		// No `.png` here: the route file is already `[...id].png.ts`, so Astro
		// appends the extension itself. Adding it as well produced
		// `/og/2026/the-title.png.png` — a URL that resolves, which is the
		// worst kind of wrong.
		params: { id: entry.id },
		props: { entry },
	}));
}

export const GET: APIRoute = async ({ props }) => {
	const { entry } = props as { entry: Writing };

	/* The meta line, in the small tracked voice the site uses for dates
	   everywhere else. The topic and the date are the two facts that tell one
	   essay card from another at the size a reader sees it. */
	const meta = `${topicLabel(entry.data.topic)} · ${shortDate(entry.data.publishDate)}`;

	/* Read once. `plate` tells the SVG to reserve the room; the bytes are
	   composited on afterwards. */
	const cover = await readCover(entry.id, entry.data.cover);

	const svg = cardSvg({
		title: entry.data.title,
		meta: meta.toUpperCase(),
		plate: Boolean(cover),
	});

	/*
	 * Rasterise the card on its own, then set the cover on it as a plate.
	 * Compositing in two steps rather than embedding the photograph in the SVG
	 * keeps the SVG a pure vector: librsvg would otherwise have to decode and
	 * resample the JPEG itself, and a plate is a rectangle with known bounds.
	 *
	 * `palette: true` quantises to a small indexed PNG. The card is five flat
	 * colours, so this roughly halves the bytes a crawler downloads, and an
	 * indexed PNG is lossless — which is why it is safe here and would not be
	 * on a photograph.
	 */
	const base = await sharp(Buffer.from(svg))
		.png({ compressionLevel: 9, palette: true })
		.toBuffer();

	const png = cover
		? await sharp(base)
				.composite([
					{
						input: await sharp(cover.data)
							.resize(PLATE.width, PLATE.height, { fit: 'cover' })
							.png()
							.toBuffer(),
						left: PLATE.x,
						top: PLATE.y,
					},
				])
				.png({ compressionLevel: 9 })
				.toBuffer()
		: base;

	/*
	 * Immutable, because the filename changes when the content does: the id is
	 * the essay's file path, so a new essay is a new URL and a re-published one
	 * is a new build at the same URL. Readers are meant to hold on to these.
	 */
	return new Response(png, {
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': 'public, max-age=31536000, immutable',
		},
	});
};
