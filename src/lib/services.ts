/**
 * services — the one place the offers are queried.
 *
 * This file is the whole of Phase 5's extensibility claim. Nothing else
 * touches `getCollection('services')`, so adding a Markdown file to
 * src/content/services produces a listed card, a linked page, a nav-free
 * sitemap entry and a working enquiry address, with no component, route or
 * config edited. A page that reached into the collection itself would be one
 * more place to forget, and the guarantee would quietly stop being true.
 *
 * It mirrors lib/writings.ts deliberately: same shape, same reasoning, so
 * there is one idiom for "a list of things" on this site.
 */

import { getCollection, type CollectionEntry } from 'astro:content';
import { published } from './writings';
import { SITE } from './site';

export type Service = CollectionEntry<'services'>;

/**
 * `order` is editorial, so a service file chooses its own place in the list
 * without anyone editing a page. The title breaks ties, which keeps the order
 * total — two offers both left at the default 99 would otherwise come out in
 * whatever order the filesystem happened to hand over.
 */
export const byOrder = (a: Service, b: Service): number =>
	a.data.order - b.data.order || a.data.title.localeCompare(b.data.title);

/** All published services, in the order they are offered. */
export async function allServices(): Promise<Service[]> {
	return (await getCollection('services', published)).sort(byOrder);
}

/** The offers for the home teaser, which has room for a couple and no more. */
export async function featuredServices(limit = 2): Promise<Service[]> {
	return (await allServices()).slice(0, limit);
}

/** `ghostwriting` → `/services/ghostwriting` */
export const serviceHref = (entry: Service): string => `/services/${entry.id}`;

/**
 * The "Let's talk" button's target, with the offer named in the subject.
 *
 * The subject is the part that earns its place: it saves the visitor writing
 * out what they want, and it means the thread is still findable in an inbox
 * months later. A bare `mailto:` is a form of asking the reader to do the
 * filing.
 */
export const enquiryHref = (title: string): string =>
	`mailto:${SITE.email}?subject=${encodeURIComponent(`A question about ${title.toLowerCase()}`)}`;
