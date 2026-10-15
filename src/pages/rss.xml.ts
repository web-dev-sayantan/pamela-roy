/**
 * /rss.xml — the portfolio essays, in a feed.
 *
 * The portfolio has no dates by design, so items carry none; readers that need
 * one fall back to first-seen. Only essays with an address are listed — an item
 * with no link is not a feed item. No feed is advertised from /work/writing.
 */
import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';

import { essayHref, essaysIn } from '../lib/essays';
import { SITE, TRAILING_SLASH } from '../lib/site';

export const GET: APIRoute = async (context) => {
	const essays = (await essaysIn('essay')).filter((e) => essayHref(e));

	return rss({
		title: `${SITE.name} — Writing`,
		description: SITE.description,
		site: context.site ?? SITE.url,
		// This site is served without a trailing slash; see TRAILING_SLASH.
		trailingSlash: TRAILING_SLASH,
		items: essays.map((e) => ({
			title: e.data.title,
			description: e.data.line,
			link: essayHref(e)!,
		})),
		customData: '<language>en-gb</language>',
	});
};
