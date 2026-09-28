/**
 * /rss.xml — the whole library, in a feed.
 *
 * A reader who wants the writing in their own reader should not have to visit
 * the site to get it, which is the only reason this endpoint is worth having.
 *
 * `allWritings()` already applies the same `published` predicate every other
 * listing uses, so a draft cannot reach the feed in a production build without
 * also appearing on the site. Fifty items is the cap, which is roughly two
 * years of a monthly letter plus the archive; a feed nobody prunes is a feed
 * nobody reads.
 */
import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';

import { allWritings, writingHref } from '../lib/writings';
import { SITE, TRAILING_SLASH } from '../lib/site';

const MAX_ITEMS = 50;

export const GET: APIRoute = async (context) => {
	const writings = await allWritings();

	return rss({
		title: SITE.name,
		description: SITE.tagline,
		// `context.site` comes from astro.config, which reads SITE.url, so the
		// feed's absolute URLs and the sitemap's cannot disagree.
		site: context.site ?? SITE.url,
		// The feed defaults to adding a trailing slash to every link. This site
		// is served without one, so an unshared default would put 404s in
		// readers' podcast apps.
		trailingSlash: TRAILING_SLASH,
		items: writings.slice(0, MAX_ITEMS).map((entry) => ({
			title: entry.data.title,
			// The same field the card excerpt and the meta description use, so
			// the feed cannot say something different from the page.
			description: entry.data.description,
			pubDate: entry.data.publishDate,
			link: writingHref(entry),
			categories: [entry.data.topic, ...entry.data.tags],
		})),
		customData: '<language>en-gb</language>',
	});
};
