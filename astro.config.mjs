// @ts-check
import { defineConfig } from 'astro/config';

import sitemap from '@astrojs/sitemap';

import { SITE, TRAILING_SLASH } from './src/lib/site.ts';

// https://astro.build/config
export default defineConfig({
	// Canonical origin, from the one place the site's identity is written down.
	// The sitemap integration needs it to emit absolute URLs.
	site: SITE.url,
	// Every route is authored without a trailing slash, so the site is served
	// the same way. Set once, here, rather than rewriting URLs at deploy time —
	// and shared with the RSS endpoint, which would otherwise default to adding
	// one and fill the feed with links that 404.
	trailingSlash: TRAILING_SLASH ? 'always' : 'never',
	integrations: [sitemap()],
});
