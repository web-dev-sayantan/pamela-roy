/**
 * SITE — one source of truth for the site's identity and navigation.
 *
 * The header, footer, head tags, and RSS feed all read from here, so a
 * rename or a new nav entry is a one-line change.
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
	/** The meta and Open Graph description, site-wide. */
	description: string;
	url: string;
	email: string;
	nav: NavItem[];
	/** The footer's three groups, in order. */
	footer: NavItem[][];
	socials: Social[];
	/** The Substack publication the subscribe blocks feed. One list, not two. */
	newsletter: { name: string; blurb: string; publication: string };
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

const EMAIL = 'hello@pamelaroy.com';

export const SITE: Site = {
	name: 'Pamela Roy',
	tagline: 'Marketing and communications in Berlin.',
	description:
		'Pamela Roy — marketing and communications in Berlin. Branding, cultural communications, content marketing. Creating, analysing, and teaching.',
	url: 'https://pamelaroy.com',
	email: EMAIL,
	// Four items, no dropdowns. Subpages are reached from their landing pages
	// and from the footer.
	nav: [
		{ href: '/about', label: 'About' },
		{ href: '/work', label: 'Work' },
		{ href: '/culture', label: 'Culture' },
		{ href: '/contact', label: 'Contact' },
	],
	footer: [
		[
			{ href: '/about', label: 'About' },
			{ href: '/work', label: 'Work' },
			{ href: '/culture', label: 'Culture' },
			{ href: '/contact', label: 'Contact' },
		],
		[
			{ href: '/work/ai-workshops', label: 'AI Workshops' },
			{ href: '/work/essays', label: 'Essays' },
			{ href: '/work/ai-adoption', label: 'AI Adoption' },
			{ href: '/culture/cooking', label: 'Cooking Workshops' },
		],
		[
			{ href: '/rss.xml', label: 'RSS' },
			{ href: `mailto:${EMAIL}`, label: 'Email' },
		],
	],
	socials: [{ label: 'LinkedIn', href: 'https://www.linkedin.com/in/pamela-roy' }],
	newsletter: {
		name: 'Culture & Clarity',
		blurb:
			'An essay every so often, on culture, memories and how people actually behave.',
		publication: 'https://roypamela.substack.com',
	},
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
