/**
 * cover — reading a content image off disk at build time.
 *
 * Only the social-card endpoints need this. Everywhere else an image goes
 * through `astro:assets`, which resolves, resizes and fingerprints it properly
 * and should not be second-guessed. But a card has to be *composited* — sharp
 * has to be handed the bytes — and by that point the image service has handed
 * the file back as metadata, not as a buffer.
 *
 * Which brings the awkward part. `image()` returns the *emitted* asset:
 * `/_astro/__probe.BzAPiBYC.jpg`. That file does not exist yet when the cards
 * are prerendered — Astro optimises images after generating routes — so it
 * cannot be the thing we read. What we want is the source, and the emitted name
 * is the source name with a hash spliced into it:
 *
 *     frontmatter   ./covers/wrong-way.jpg
 *     emitted       /_astro/wrong-way.<hash>.jpg
 *     wanted        src/content/writings/2026/covers/wrong-way.jpg
 *
 * So the hash segment is removed and the remainder is resolved against the
 * entry's own file — which the collection makes trivial, because an essay's id
 * *is* its path (`2026/the-wrong-way-opens-doors`).
 *
 * This is a convention rather than an API, and it is commented as one. It is
 * also the only thing that puts a real cover on a real card, and it is exercised
 * against a real file rather than assumed to work: `check.sh` builds with a
 * cover in place and fails if the card comes out without its plate. If a future
 * Astro changes the emitted naming, that check fails loudly instead of every
 * card quietly losing its picture.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';

/** Where the writings collection lives, relative to the project root. */
const WRITINGS_DIR = 'src/content/writings';

/** The shape of the `image()` value a collection entry carries. */
export interface CoverMeta {
	src: string;
	format: string;
}

/**
 * `__probe.BzAPiBYC.jpg` → `__probe.jpg`.
 *
 * Astro's fingerprint is a hash in the second-to-last position: everything
 * before it is the original stem and everything after it is the original
 * extension. A name with too few segments to have a hash is already a source
 * name and is returned untouched.
 */
function unfingerprint(name: string): string {
	const parts = name.split('.');

	if (parts.length < 3) return name;

	// parts = [stem, hash, ext, ...rest]
	return [parts[0], ...parts.slice(2)].join('.');
}

/**
 * The source file for a cover, or nothing if there is not one to find.
 *
 * Returns a path rather than bytes so the caller can report *which* file was
 * missing. A cover named in frontmatter but absent from disk is a content
 * mistake, and the message is worth writing out in full.
 */
export function coverSource(id: string, cover: CoverMeta | undefined): string | undefined {
	if (!cover?.src) return undefined;

	const name = unfingerprint(cover.src.split('/').pop() ?? '');
	const extension = extname(name) || `.${cover.format}`;
	const file = name.replace(/\.[^.]*$/, extension);

	/*
	 * Both layouts, `covers/` first.
	 *
	 * This function used to build one path — the year directory with no
	 * `covers/` segment — while the comment at the top of this very file worked
	 * its example through `src/content/writings/2026/covers/wrong-way.jpg`. The
	 * code and its own documentation disagreed, and the code was wrong: a cover
	 * added in the documented place resolved to a file that did not exist,
	 * `readCover` caught it, logged a warning nobody reads, and the essay's social
	 * card quietly lost its photograph. No page broke, so nothing failed.
	 *
	 * Found by check-images.ts, which exists because the audit recorded that this
	 * path had never run against a real image. It is the clearest argument in the
	 * project for testing the untestable-looking bits: the fallback is not an
	 * optimisation, it is what makes the documented layout work at all.
	 */
	const base = join(process.cwd(), WRITINGS_DIR, dirname(id));

	for (const candidate of [join(base, 'covers', file), join(base, file)]) {
		if (existsSync(candidate)) return candidate;
	}

	// Neither exists. Return the documented location, so the warning names the
	// path the author was most likely aiming at rather than a second guess.
	return join(base, 'covers', file);
}

/**
 * The bytes of a cover, or nothing. Never throws — see the note at the top of
 * the file, and the `check.sh` gate that keeps this path honest.
 */
export async function readCover(
	id: string,
	cover: CoverMeta | undefined,
): Promise<{ data: Buffer; type: string } | undefined> {
	if (!cover?.src) return undefined;

	const source = coverSource(id, cover)!;

	try {
		return { data: await readFile(source), type: cover.format };
	} catch {
		console.warn(`  og: no cover at ${source} — card for ${id} has no plate`);
		return undefined;
	}
}
