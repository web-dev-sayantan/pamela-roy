import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * The content layer.
 *
 * Three collections, and nothing else in the codebase is allowed to know how
 * content is stored. Every loader here is `glob`, which is a one-file change
 * away from a CMS loader later on — the pages, components and routes stay put.
 */

/** The six topics a blogger-and-ghostwriter's output actually falls into. */
const topic = z.enum(['craft', 'process', 'place', 'people', 'reading', 'notes']);

const writings = defineCollection({
	loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/writings' }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			/**
			 * One field, two jobs: the card excerpt and the meta description.
			 * That is the whole reason they cannot drift apart.
			 */
			description: z.string(),
			publishDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			topic: topic.default('notes'),
			tags: z.array(z.string()).default([]),
			/**
			 * One line lifted out of the essay and set as a pull quote above
			 * the body. Optional, because a piece only earns one if it has a
			 * line worth stopping on — and the body can carry its own
			 * blockquotes without it.
			 */
			pullQuote: z.string().optional(),
			/** Who said it, when it is someone else's line. */
			pullQuoteCite: z.string().optional(),
			/** Omitted pieces fall back to a typographic cover in WritingCard. */
			cover: image().optional(),
			coverAlt: z.string().optional(),
			featured: z.boolean().default(false),
			/** Never published in a production build; visible while drafting. */
			draft: z.boolean().default(false),
			/** Auto-computed from the body when absent. */
			minutes: z.number().optional(),
		}),
});

/**
 * Services are content, not pages. Adding an offer is one Markdown file and
 * nothing else — no component, no route, no nav edit.
 */
const services = defineCollection({
	loader: glob({ pattern: '**/[^_]*.md', base: './src/content/services' }),
	schema: z.object({
		title: z.string(),
		order: z.number().default(99),
		summary: z.string(),
		/** "Two-week intensive" / "Ongoing retainer" */
		engagement: z.string().optional(),
		price: z.string().optional(),
		/** Who it is for — a short bulleted list. */
		forWhom: z.array(z.string()).default([]),
		includes: z.array(z.string()).default([]),
		draft: z.boolean().default(false),
	}),
});

/**
 * Past issues of the letter.
 *
 * The homepage and footer carry a small signup panel; /newsletter carries a
 * list of what has actually gone out. That list is content, and putting it in
 * the page's frontmatter as a bespoke array would make this the one kind of
 * thing on the site that is not a file in a collection — so it is a collection,
 * and publishing an issue is the same one-file act as publishing an essay.
 *
 * The body is intentionally unused: a past issue is listed, not archived, and
 * nothing on the site links to a full issue yet. An issue that earns its own
 * page gets a route at that point rather than a speculative one now.
 */
const newsletter = defineCollection({
	loader: glob({ pattern: '**/[^_]*.md', base: './src/content/newsletter' }),
	schema: z.object({
		title: z.string(),
		/** One line on what the issue was about — the list's only excerpt. */
		summary: z.string(),
		/** A month is the resolution a letter actually has: the first is sent
		    whenever it is ready. Coerced to the 1st, so the day never implies
		    a precision that does not exist. */
		sendDate: z.coerce.date(),
		draft: z.boolean().default(false),
	}),
});

/**
 * Long-form static pages: About, Colophon, and the two that carry copy around
 * a form — Contact and Newsletter. Every one of them renders through
 * StaticPage.astro, which is what keeps the collection honest: a page that
 * cannot be expressed as an eyebrow, a title, a description and some prose
 * does not belong in here.
 */
const pages = defineCollection({
	loader: glob({ pattern: '**/[^_]*.md', base: './src/content/pages' }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			eyebrow: z.string().optional(),
			/** A contents in the margin, for a page long enough to want one. */
			showToc: z.boolean().default(false),
			/**
			 * One line worth stopping on, set above the body. Optional for the
			 * same reason a writing's is: a page earns one only if it has a
			 * line that carries the argument better than the prose around it.
			 */
			pullQuote: z.string().optional(),
			pullQuoteCite: z.string().optional(),
			/**
			 * A portrait, for the one page that has a person in it. Optional
			 * for the same reason a writing's cover is: the page is complete
			 * without it, and the portrait slot falls back to a typographic
			 * plate rather than a hole. Add the file, the page picks it up.
			 */
			portrait: image().optional(),
			portraitAlt: z.string().optional(),
		}),
});

export const collections = { writings, services, pages, newsletter };
