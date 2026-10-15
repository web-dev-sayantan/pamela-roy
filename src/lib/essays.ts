/**
 * essays — the one place the essays collection is queried.
 *
 * Same idiom as `pages.ts`: routes ask for a section and get it back in
 * editorial order, drafts excluded in a production build.
 */

import { getCollection, type CollectionEntry } from 'astro:content';

export type Essay = CollectionEntry<'essays'>;

/**
 * Where an essay lives: its own address when it was published elsewhere (the
 * newsletter), otherwise a page on this site when it has a body.
 */
export function essayHref(essay: Essay): string | undefined {
	if (essay.data.href) return essay.data.href;
	return essay.body?.trim() ? `/work/essays/${essay.id}` : undefined;
}

export async function essaysIn(section: 'essay' | 'newsletter'): Promise<Essay[]> {
	const all = await getCollection(
		'essays',
		(e) => e.data.section === section && (import.meta.env.DEV || !e.data.draft),
	);

	return all.sort((a, b) => a.data.order - b.data.order);
}
