/**
 * pages — the one place the static-page collection is queried.
 *
 * /about, /colophon, /contact and /newsletter are all thin routes over a file
 * in src/content/pages. The alternative — a route per page, each re-stating the
 * layout, the title block and the prose wrapper — is four copies of the same
 * ten lines, and it is what makes a content collection quietly turn back into
 * hand-built pages.
 *
 * The ids are the filenames, so `about.md` is `/about`. This is the same
 * arrangement the library uses, where an essay's URL is its file's path.
 */

import { getEntry, type CollectionEntry } from 'astro:content';

export type StaticPage = CollectionEntry<'pages'>;

/**
 * One page by its file id, e.g. `about`.
 *
 * A mistyped id throws rather than returning nothing. An empty static page is
 * the worst possible failure for this site: it builds, it deploys, it looks
 * deliberate, and it is a hole.
 *
 * There is deliberately no "all pages" query. A collection-driven route asks
 * for the one page it is rendering, and a helper that handed back all of them
 * would only invite a page whose job is to list pages.
 */
export async function pageById(id: string): Promise<StaticPage> {
	const entry = await getEntry('pages', id);

	if (!entry) {
		throw new Error(
			`No page at src/content/pages/${id}.md — the route asked for a page that does not exist.`,
		);
	}

	return entry;
}
