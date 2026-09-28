/**
 * writings — the one place the library is queried.
 *
 * Components and pages take entries and render them; they never reach into
 * `getCollection` themselves. That keeps sorting, draft filtering and reading
 * time consistent, so a piece cannot appear in the grid in a different order
 * than it does in the catalogue.
 */

import { getCollection, type CollectionEntry } from 'astro:content';
import { readingMinutes } from './readingTime';
import type { Topic } from './topics';

export type Writing = CollectionEntry<'writings'>;

/**
 * Drafts are visible while writing and gone from a production build. One
 * predicate, used everywhere, so no listing can accidentally publish one.
 */
export const published = (entry: { data: { draft?: boolean } }): boolean =>
	import.meta.env.PROD ? entry.data.draft !== true : true;

export const byDateDesc = (a: Writing, b: Writing): number =>
	b.data.publishDate.valueOf() - a.data.publishDate.valueOf();

/** All published writings, newest first. */
export async function allWritings(): Promise<Writing[]> {
	return (await getCollection('writings', published)).sort(byDateDesc);
}

/** The `featured` pieces, newest first, for the home hero. */
export async function featuredWritings(limit = 1): Promise<Writing[]> {
	const all = await allWritings();
	return all.filter((entry) => entry.data.featured).slice(0, limit);
}

export async function writingsByTopic(topic: Topic): Promise<Writing[]> {
	return (await allWritings()).filter((entry) => entry.data.topic === topic);
}

/** How many writings sit in each topic, for the filter's counts. */
export async function topicCounts(): Promise<Record<string, number>> {
	const all = await allWritings();
	const counts: Record<string, number> = {};

	for (const entry of all) {
		counts[entry.data.topic] = (counts[entry.data.topic] ?? 0) + 1;
	}

	return counts;
}

/** The distinct years present, newest first — the year filter's options. */
export async function writingYears(): Promise<number[]> {
	const all = await allWritings();
	return [...new Set(all.map((entry) => entry.data.publishDate.getUTCFullYear()))].sort(
		(a, b) => b - a,
	);
}

/** `2026-08-19` → `/library/2026/the-wrong-way-opens-doors` */
export const writingHref = (entry: Writing): string => `/library/${entry.id}`;

/** A writing's reading time, honouring an explicit frontmatter value. */
export const minutesFor = (entry: Writing): number =>
	entry.data.minutes ?? readingMinutes(entry.body ?? '');

/* ------------------------------------------------------------------ dates ---
   A publishDate in frontmatter is a calendar date with no time and no zone,
   but `z.coerce.date()` hands back an instant at UTC midnight. Reading it back
   with the local getters therefore shows the previous day to every reader west
   of Greenwich — "Aug 19" would print as "Aug 18". So every accessor here goes
   through the UTC getters, which is what makes the printed date match the file.
   --------------------------------------------------------------------------- */

const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
];

/** `Aug 19, 2026` — the meta row, and the catalogue's margin. */
export function shortDate(date: Date): string {
	return `${MONTHS[date.getUTCMonth()].slice(0, 3)} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

/** `19 August 2026` — for the machine-readable datetime attribute. */
export function longDate(date: Date): string {
	return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/**
 * `August 2026` — no day, because a letter has no day.
 *
 * Lives beside the other two so there is one month table and one explanation
 * of the UTC rule rather than a third copy of both. A newsletter issue imports
 * it from here, which reads oddly, and is still the lesser evil.
 */
export function monthYear(date: Date): string {
	return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/* -------------------------------------------------------------- catalogue --- */

export interface MonthGroup {
	/** `2026-08` — stable, sortable, and the CSS hook for grouping. */
	key: string;
	/** `August 2026` */
	label: string;
	year: number;
	items: Writing[];
}

/**
 * The Card Catalogue: writings grouped by month, newest first.
 *
 * Dates are the one axis a writer's archive is always coherent on, which is
 * why the catalogue exists at all — it is the fastest route from "I know
 * roughly when I read that" to the piece itself.
 *
 * Months are the inner grouping, not a set of headings. In a card catalogue
 * the month is printed once in the date margin and the pieces that follow sit
 * under it, which is why the month label is a job for the component rather
 * than something every item repeats.
 */
export function groupByMonth(entries: Writing[]): MonthGroup[] {
	const groups = new Map<string, MonthGroup>();

	for (const entry of entries) {
		const date = entry.data.publishDate;
		const year = date.getUTCFullYear();
		const month = date.getUTCMonth();
		const key = `${year}-${String(month + 1).padStart(2, '0')}`;

		const existing = groups.get(key);
		if (existing) {
			existing.items.push(entry);
		} else {
			groups.set(key, {
				key,
				label: `${MONTHS[month]} ${year}`,
				year,
				items: [entry],
			});
		}
	}

	return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key));
}

export interface YearGroup {
	year: number;
	/** Month groups belonging to this year, newest month first. */
	months: MonthGroup[];
}

/**
 * The month groups folded under year headers, so the catalogue can show a
 * single `2026` rule and let the dates in the margin do the rest. Derived
 * from `groupByMonth` rather than re-derived from the entries, so the two
 * can never disagree about what a month contains.
 */
export function groupByYear(entries: Writing[]): YearGroup[] {
	const years = new Map<number, MonthGroup[]>();

	for (const month of groupByMonth(entries)) {
		const existing = years.get(month.year);
		if (existing) {
			existing.push(month);
		} else {
			years.set(month.year, [month]);
		}
	}

	return [...years.entries()]
		.map(([year, months]) => ({ year, months }))
		.sort((a, b) => b.year - a.year);
}

/* ------------------------------------------------------------- navigation --- */

/** The piece either side of this one, for the prev/next pair. */
export function neighbours(
	entry: Writing,
	all: Writing[],
): { previous?: Writing; next?: Writing } {
	const index = all.findIndex((candidate) => candidate.id === entry.id);
	if (index === -1) return {};

	// `all` is newest-first, so the newer piece is the one before it.
	return { previous: all[index - 1], next: all[index + 1] };
}

/** Siblings sharing a topic, excluding the piece itself, capped. */
export async function moreLikeThis(entry: Writing, limit = 3): Promise<Writing[]> {
	const all = await allWritings();
	return all
		.filter(
			(candidate) => candidate.data.topic === entry.data.topic && candidate.id !== entry.id,
		)
		.slice(0, limit);
}
