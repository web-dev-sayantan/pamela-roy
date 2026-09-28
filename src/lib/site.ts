/**
 * SITE — one source of truth for the site's identity and navigation.
 *
 * The header, footer, head tags, and RSS feed all read from here, so a
 * rename or a new nav entry is a one-line change. Routes that do not exist
 * yet (library, about, …) arrive in later phases; the links are already
 * correct and will simply resolve once those phases land.
 */

export interface NavItem {
	/** Route path, written without a trailing slash. */
	href: string;
	/** Sentence case — components uppercase it where the design calls for it. */
	label: string;
}

export interface Social {
	label: string;
	href: string;
}

export interface Site {
	name: string;
	tagline: string;
	url: string;
	email: string;
	nav: NavItem[];
	socials: Social[];
}

/**
 * Whether the site is served with a trailing slash on directory URLs.
 *
 * This is a fact about the deployment, and two unrelated parts of the build
 * need it: Astro's own `trailingSlash`, and `@astrojs/rss`, which defaults to
 * adding one. Left to their own defaults they disagree, and the result is a
 * feed full of URLs that 404 on a `trailingSlash: 'never'` host — which is
 * exactly the sort of thing nobody notices until a reader clicks one.
 *
 * Declared once, read by both.
 */
export const TRAILING_SLASH = false;

export const SITE: Site = {
	name: 'Pamela Roy',
	tagline: 'A quiet room, and a shelf that keeps filling.',
	// Placeholder until the real domain is confirmed.
	url: 'https://pamelaroy.com',
	// Placeholder — update to Pamela's real address.
	email: 'hello@pamelaroy.com',
	nav: [
		{ href: '/library', label: 'Library' },
		{ href: '/about', label: 'About' },
		{ href: '/services', label: 'Services' },
		{ href: '/newsletter', label: 'Newsletter' },
		{ href: '/contact', label: 'Contact' },
	],
	// Rendered on /about and /contact by the Elsewhere component. Empty until
	// real profiles are known; the address is always shown regardless, so the
	// row is never empty and nothing has to be invented.
	socials: [],
};

/**
 * Whether a link points at the page currently being viewed.
 *
 * It lives here rather than in the header because two components need it: the
 * header nav, and the footer's own row — which is where `/colophon` and the
 * feed live. With a copy in each, the page you are on stops being marked the
 * moment one of them is forgotten, which is exactly what happened when the
 * colophon shipped and only the header knew how to answer this.
 *
 * Trailing-slash agnostic, so `/about` and `/about/` both count, and prefix
 * aware, so `/library` is current while reading something inside it.
 */
export function isCurrentPath(pathname: string, href: string): boolean {
	const path = pathname.replace(/\/$/, '') || '/';

	return href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
}
