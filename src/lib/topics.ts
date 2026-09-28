import type { CollectionEntry } from 'astro:content';

/** Mirrors the `topic` enum in content.config.ts. */
export type Topic = CollectionEntry<'writings'>['data']['topic'];

export interface TopicMeta {
	slug: Topic;
	label: string;
	/** One sentence, written in Pamela's voice — it stands alone under the label. */
	description: string;
}

/**
 * The six topics, in the order they are offered in the library filter.
 * Order is editorial, not alphabetical: the craft and the process first,
 * because that is the work she is hired for.
 */
export const TOPICS: TopicMeta[] = [
	{
		slug: 'craft',
		label: 'Craft',
		description: 'The mechanics. Structure, editing, and the sentences that survive both.',
	},
	{
		slug: 'process',
		label: 'Process',
		description: 'How work actually gets done, which is rarely how anyone describes it.',
	},
	{
		slug: 'place',
		label: 'Place',
		description: 'Landscape, weather, and the particular room a thing was written in.',
	},
	{
		slug: 'people',
		label: 'People',
		description: 'Portraits, interviews, and the long conversations behind them.',
	},
	{
		slug: 'reading',
		label: 'Reading',
		description: 'Books, essays, and what is currently on the desk.',
	},
	{
		slug: 'notes',
		label: 'Notes',
		description: 'Shorter pieces, written in the moment and mostly left alone.',
	},
];

/** `craft` → `Craft`, for reading the enum at a glance. */
export const topicLabel = (slug: Topic): string =>
	TOPICS.find((topic) => topic.slug === slug)?.label ?? slug;
