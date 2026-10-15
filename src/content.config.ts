import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * The content layer: the About page's Markdown, and the essays portfolio.
 * Nothing else in the codebase is allowed to know how content is stored.
 */

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
			/** The document title, when `title` is a headline rather than a page name. */
			docTitle: z.string().optional(),
			/** Set `title` as a sentence-case headline instead of the uppercase display title. */
			headline: z.boolean().default(false),
			/** Keep `description` for search and sharing but do not print it under the title. */
			quiet: z.boolean().default(false),
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
			/** Place and date for the photograph, e.g. "Vienna, Mar 2024". Required with `portrait`. */
			photoCaption: z.string().optional(),
		}),
});

/**
 * Essays — the portfolio on /culture/essays. A portfolio, not a blog: there is deliberately no date
 * field, because the same four essays with timestamps read as neglected.
 *
 * `href` is optional. An essay published on this site rather than in the
 * newsletter has no outside address, and one whose address is not yet known is
 * listed unlinked rather than pointing nowhere.
 */
const essays = defineCollection({
	loader: glob({ pattern: '**/[^_]*.md', base: './src/content/essays' }),
	schema: z.object({
		title: z.string(),
		/** One line on what it argues. */
		line: z.string().optional(),
		href: z.string().optional(),
		/** `essay` is the portfolio on /culture/essays; `newsletter` is a piece referenced elsewhere. */
		section: z.enum(['essay', 'newsletter']),
		order: z.number().default(99),
		draft: z.boolean().default(false),
	}),
});

export const collections = { pages, essays };
