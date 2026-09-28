/**
 * seo — the site's structured data, as three factories.
 *
 * A page that wants to be understood by something other than a browser needs
 * to say three things: who the author is, what an individual piece is, and
 * where on the site it sits. Those are `Person`, `BlogPosting` and
 * `BreadcrumbList`, and they are built here rather than inline at the call
 * sites for the same reason `writings.ts` owns the collection query: the
 * fields come off the same entries the page renders, so a date, a headline or
 * a URL cannot be right on the page and wrong in the machine-readable copy.
 *
 * Every absolute URL is built from `site`, which comes from astro.config and
 * therefore from SITE.url — the same origin the sitemap and the feed use.
 */

import { SITE } from './site';
import { topicLabel } from './topics';
import type { Writing } from './writings';

const absolute = (path: string, site: URL | undefined): string =>
	new URL(path, site ?? SITE.url).href;

/**
 * `Person` — who writes here. Attached to /about, and referenced by every
 * `BlogPosting` as its author, so the two are guaranteed to be the same person
 * with the same identifier.
 */
export function personLd(site?: URL) {
	return {
		'@type': 'Person',
		'@id': `${absolute('/about', site)}#person`,
		name: SITE.name,
		url: absolute('/about', site),
		email: `mailto:${SITE.email}`,
		jobTitle: 'Writer and ghostwriter',
		knowsAbout: ['Writing', 'Editing', 'Interviewing', 'Books'],
		// The person and the site are separate entities on purpose. Pamela is
		// not the same thing as the library, and a search result that says so is
		// more useful than one that conflates them.
		worksFor: { '@id': `${absolute('/', site)}#website` },
	};
}

/**
 * `WebSite` — the publication itself, with its name and its feed. Carried on
 * every page as the thing the Person works for, and the thing a `BlogPosting`
 * is `isPartOf`.
 */
export function websiteLd(site?: URL) {
	return {
		'@type': 'WebSite',
		'@id': `${absolute('/', site)}#website`,
		name: SITE.name,
		url: absolute('/', site),
		description: SITE.tagline,
		inLanguage: 'en-GB',
		publisher: { '@id': `${absolute('/about', site)}#person` },
	};
}

/**
 * `BlogPosting` — one piece.
 *
 * The headline is the title, the date is the same Date object the meta row
 * formats, and the image is the generated card rather than the cover image: a
 * cover is often absent, is usually 4:5, and is the wrong shape for anything
 * that renders a card. The card exists for every piece, so the field is never
 * empty.
 */
export function articleLd(entry: Writing, site?: URL) {
	const href = absolute(`/library/${entry.id}`, site);

	return {
		'@type': 'BlogPosting',
		'@id': `${href}#article`,
		headline: entry.data.title,
		description: entry.data.description,
		datePublished: entry.data.publishDate.toISOString(),
		dateModified: (entry.data.updatedDate ?? entry.data.publishDate).toISOString(),
		// The one Date the whole site is careful about — see the note on the
		// UTC getters in lib/writings. toISOString is UTC, so the two cannot
		// disagree about which day a piece is from.
		inLanguage: 'en-GB',
		wordCount: entry.body?.split(/\s+/).filter(Boolean).length ?? 0,
		articleSection: topicLabel(entry.data.topic),
		keywords: entry.data.tags.join(', ') || undefined,
		url: href,
		mainEntityOfPage: { '@id': href },
		image: [absolute(`/og/${entry.id}.png`, site)],
		author: { '@id': `${absolute('/about', site)}#person` },
		isPartOf: { '@id': `${absolute('/', site)}#website` },
	};
}

/**
 * `BreadcrumbList` — where on the site this is.
 *
 * Only for genuinely nested routes. A breadcrumb trail of "Home" on the home
 * page is noise, and on a flat page like /library it says nothing, so the
 * factory takes the trail and the caller decides whether there is one. The
 * positions are 1-based, as the spec requires, and they are contiguous — a gap
 * is a validation error rather than a rounding artefact.
 */
export function breadcrumbLd(trail: { name: string; path: string }[], site?: URL) {
	return {
		'@type': 'BreadcrumbList',
		itemListElement: trail.map((crumb, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			name: crumb.name,
			item: absolute(crumb.path, site),
		})),
	};
}

/** The site's own "you are here" trail, which every breadcrumb starts with. */
export const homeCrumb = { name: 'Home', path: '/' };
