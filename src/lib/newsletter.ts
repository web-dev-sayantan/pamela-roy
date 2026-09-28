/**
 * newsletter — the one place the letter's back issues are queried.
 *
 * Same shape and same reasoning as the other two content libs, for the same
 * reason: the list on /newsletter is the collection, so sending a letter is a
 * text file and the page never learns a new issue exists.
 */

import { getCollection, type CollectionEntry } from 'astro:content';
import { published } from './writings';

export type Issue = CollectionEntry<'newsletter'>;

/** Newest issue first, which is the order a reader arriving wants them in. */
export const bySendDateDesc = (a: Issue, b: Issue): number =>
	b.data.sendDate.valueOf() - a.data.sendDate.valueOf();

/** Every published issue, most recent first. */
export async function allIssues(): Promise<Issue[]> {
	return (await getCollection('newsletter', published)).sort(bySendDateDesc);
}
