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
		jobTitle: 'Marketing and communications',
		knowsAbout: [
			'Branding',
			'Cultural communications',
			'Content marketing',
			'Generative AI education',
		],
		address: { '@type': 'PostalAddress', addressLocality: 'Berlin', addressCountry: 'DE' },
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
		description: SITE.description,
		inLanguage: 'en-GB',
		publisher: { '@id': `${absolute('/about', site)}#person` },
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
