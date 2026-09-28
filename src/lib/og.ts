/**
 * og — the social cards, drawn as SVG and rasterised at build time.
 *
 * A link pasted into Slack is a card, and the card is the only part of this
 * site most people will ever see. It has to look like the site: warm paper, a
 * serif headline, an ember dot, a hairline, and one line of small tracked type
 * underneath. Not a logo, not a screenshot, not a stock photograph of a desk.
 *
 * Why SVG and not a template image: there is no image editor in the build, and
 * the only thing that can turn vector type into a raster is a rasteriser. Astro
 * already depends on sharp for its own image service, so this adds no
 * dependency — it asks for the one that is already installed. The card is drawn
 * as text, wrapped here, and converted with a single sharp call per card.
 *
 * The consequence is that the two families Fraunces and Inter cannot be used:
 * they ship as woff2, and the SVG rasteriser reads system fonts. So the card is
 * set in Georgia and Helvetica, which is the honest trade — a card that renders
 * identically on every machine is worth more than a card that renders in
 * Fraunces on a designer's laptop and in Times on a build server. The
 * proportions, the ink, the paper and the ember are the site's own.
 */

/* The day tokens, as literal values. A stylesheet cannot be read from a build
   script, and a card that drifted from the palette would be the most visible
   drift on the site. */
export const PAPER = '#f2ede4';
export const INK = '#221e1a';
export const INK_MUTED = '#6a6055';
export const RULE = '#ded4c3';
export const EMBER = '#a04720';

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

/** The margin. Wide, because a card is viewed small and a crowded one is illegible. */
const PAD = 88;

/** The cover plate, when a piece has a cover. A jacket, not a backdrop. */
const PLATE_W = 380;
const PLATE_H = 475;

/**
 * Where the plate goes, in one object.
 *
 * This is the geometry of the card, so it lives with the card — and it is
 * exported because the *photograph* has to be composited onto the finished PNG
 * at exactly the rectangle the SVG reserved. Those are two different programs
 * writing the same number, and the first version of this file had them disagree
 * by 208px: the SVG left a hole at one place and the cover landed in another,
 * which looked like a card with a stray beige stripe down it.
 *
 * One box, read by both. If the margin or the plate size changes, it changes
 * here and both follow.
 */
export const PLATE = {
	x: CARD_WIDTH - PAD - PLATE_W,
	y: Math.round((CARD_HEIGHT - PLATE_H) / 2),
	width: PLATE_W,
	height: PLATE_H,
};

/** The gap between the text column and the plate. */
const PLATE_GAP = 56;

/**
 * Advance widths as fractions of the em, for a transitional serif at these
 * sizes. Not a font engine — librsvg has none, so the wrap has to be computed
 * before the SVG is written. These are Georgia's real proportions rounded to
 * two places, and `verifyCards()` renders every title through the actual
 * rasteriser, which is what proves the estimate is good enough. Anything that
 * overflows shrinks a size step rather than being clipped.
 */
const WIDTHS: Record<string, number> = {
	' ': 0.25,
	i: 0.28, l: 0.29, j: 0.28, t: 0.33, f: 0.32, r: 0.35, I: 0.33,
	'.': 0.26, ',': 0.26, ':': 0.28, ';': 0.28, "'": 0.2, '’': 0.22,
	'm': 0.86, w: 0.72, M: 0.89, W: 0.9, '@': 0.98, '&': 0.75,
	'—': 1.0, '–': 0.5, '-': 0.33,
};
const NARROW = new Set([...'iljtfIrI.,:;\'’!|()[]{}-']);
const WIDE = new Set([...'mwMW@&']);
const CAPS = new Set([...'ABCDEFGHJKLNOPQRSTUVXYZ']);

/** One string's width in px at a given font size. */
export function measure(text: string, size: number): number {
	let em = 0;

	for (const char of text) {
		if (WIDTHS[char] !== undefined) em += WIDTHS[char];
		else if (NARROW.has(char)) em += 0.3;
		else if (WIDE.has(char)) em += 0.8;
		else if (CAPS.has(char)) em += 0.68;
		else if (char >= '0' && char <= '9') em += 0.5;
		else em += 0.5;
	}

	return em * size;
}

/** Greedy wrap. Words longer than the column are broken, so nothing overflows. */
export function wrap(text: string, maxWidth: number, size: number, maxLines = 3): string[] {
	const words = text.split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let line = '';

	for (const word of words) {
		const candidate = line ? `${line} ${word}` : word;

		if (measure(candidate, size) <= maxWidth) {
			line = candidate;
			continue;
		}

		if (line) lines.push(line);

		if (measure(word, size) <= maxWidth) {
			line = word;
			continue;
		}

		// A single word wider than the column — a long German compound, a URL.
		// Break it rather than let it run off the card.
		let chunk = '';
		for (const char of word) {
			if (measure(chunk + char, size) > maxWidth && chunk) {
				lines.push(chunk);
				chunk = char;
			} else {
				chunk += char;
			}
		}
		line = chunk;
	}

	if (line) lines.push(line);

	if (lines.length <= maxLines) return lines;

	/* More lines than fit. Say so with an ellipsis rather than drawing the
	   overflow — an essay title clipped mid-word on a shared card is worse than
	   one that admits it is shortened. The frontmatter `description` carries the
	   full thought, and the card carries enough to identify the piece. */
	const kept = lines.slice(0, maxLines);
	kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[\s,.;:—-]+$/, '')}…`;
	return kept;
}

const escapeXml = (value: string): string =>
	value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

/** The sizes tried, largest first. */
const STEPS = [68, 62, 56, 50, 44];

export interface CardOptions {
	/** The headline. An essay title, or the tagline on the brand card. */
	title: string;
	/** The small tracked line under the hairline: a topic and a date. */
	meta: string;
	/**
	 * Whether a cover plate is reserved on the right. A boolean, not the image
	 * itself: the caller has to read the bytes anyway to composite them, and
	 * reading them twice to find out whether they exist is the kind of small
	 * waste that becomes a large one.
	 */
	plate?: boolean;
}

/**
 * The card, as SVG.
 *
 * Laid out from the bottom up: the meta line and the hairline above it are
 * pinned, and the headline is centred in whatever space is left between them
 * and the wordmark. Fixing the bottom and centring the top is what stops a
 * one-line title and a three-line title from producing two visibly different
 * cards.
 */
export function cardSvg({ title, meta, plate = false }: CardOptions): string {
	/* The text column. With a plate it stops short of one; without, it runs to
	   the right margin. The rule and the meta line are held to the same edge as
	   the headline, so the card has one left edge and one right edge whatever is
	   on it. */
	const textRight = plate ? PLATE.x - PLATE_GAP : CARD_WIDTH - PAD;
	const maxWidth = textRight - PAD;

	// Fit the headline: the largest size whose wrap is three lines or fewer.
	let size = STEPS[STEPS.length - 1];
	let lines: string[] = [];
	for (const step of STEPS) {
		const candidate = wrap(title, maxWidth, step, 3);
		if (candidate.length <= 3) {
			size = step;
			lines = candidate;
			break;
		}
	}
	if (lines.length === 0) lines = wrap(title, maxWidth, size, 3);

	// Pinned from the bottom.
	const META_BASELINE = 556;
	const RULE_Y = 500;
	const HEADLINE_TOP = 150;
	const HEADLINE_BOTTOM = RULE_Y - 48;

	const lineHeight = size * 1.16;
	const blockHeight = (lines.length - 1) * lineHeight;
	const firstBaseline =
		HEADLINE_TOP + (HEADLINE_BOTTOM - HEADLINE_TOP - blockHeight) / 2 + size * 0.74;

	const headline = lines
		.map(
			(line, i) =>
				`<text x="${PAD}" y="${(firstBaseline + i * lineHeight).toFixed(1)}" ` +
				`font-family="Georgia, 'Times New Roman', serif" font-size="${size}" ` +
				`fill="${INK}">${escapeXml(line)}</text>`,
		)
		.join('\n    ');

	const plateSvg = plate
		? `
    <!-- The cover as a jacket on the right: the same 4:5 proportion a shelf
         card uses, so the card and the library agree. A full-bleed photograph
         behind the headline would need a scrim heavy enough to bury it, and
         would put a second colour on a card whose whole job is to be
         recognisable in a list. The rectangle is a placeholder under the real
         photograph, which is composited on afterwards at exactly this box. -->
    <rect x="${PLATE.x}" y="${PLATE.y}" width="${PLATE.width}" height="${PLATE.height}" fill="${RULE}" />`
		: '';

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${PAPER}" />
  <circle cx="${PAD + 13}" cy="${96}" r="13" fill="${EMBER}" />
  <text x="${PAD + 44}" y="104" font-family="Helvetica, Arial, sans-serif" font-size="24" letter-spacing="4.5" fill="${INK_MUTED}">${escapeXml(
		'PAMELA ROY',
	)}</text>
${plateSvg}
  <line x1="${PAD}" y1="${RULE_Y}" x2="${textRight}" y2="${RULE_Y}" stroke="${RULE}" stroke-width="2" />
  <text x="${PAD}" y="${META_BASELINE}" font-family="Helvetica, Arial, sans-serif" font-size="24" letter-spacing="4.5" fill="${INK_MUTED}">${escapeXml(
		meta,
	)}</text>
  ${headline}
</svg>
`;
}
