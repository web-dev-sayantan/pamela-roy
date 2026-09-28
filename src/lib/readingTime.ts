/**
 * readingTime — a word count, and nothing more.
 *
 * Deliberately not clever. It strips the things that would otherwise inflate
 * the count (code fences, link URLs, heading markers) and divides. A reader
 * can disagree with the number; that is fine, the number is a rough signpost
 * in the meta row, not a promise.
 */

const WORDS_PER_MINUTE = 220;

/** English prose runs about this many words a minute when read for pleasure. */
export function readingMinutes(body: string): number {
	const words = countWords(body);
	// Round up, and never report zero — "a minute" reads better than "0 min".
	return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

export function countWords(body: string): number {
	const text = body
		// Fenced code is not prose.
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/~~~[\s\S]*?~~~/g, ' ')
		// Keep the label, drop the URL: [offbeat](https://…) is one word.
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		// Markdown punctuation is not a word.
		.replace(/[#>*_`~|-]/g, ' ')
		.trim();

	return text.length === 0 ? 0 : text.split(/\s+/).length;
}
