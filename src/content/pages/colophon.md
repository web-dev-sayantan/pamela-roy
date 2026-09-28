---
title: Colophon
description: What this site is built with, which typefaces it uses, and why it is shaped the way it is.
eyebrow: About this place
# Long enough, and sectional enough, to want a way back. The contents is
# rendered from the headings in the body below, so a new `##` appears in it
# with no edit here.
showToc: true
---

This page is here because a library should say how it is made, and because it is a pleasant excuse to be slightly self-indulgent about the design.

## The room

The whole site is an attempt to make a screen feel like a corner of a room at the end of the day. Lamp on, chair pulled in, somebody thinking out loud. Three things do the work, and they are applied in this order.

**The wall** is a warm oat paper, `#F2EDE4`, textured with a very fine grain — an inline SVG noise filter, not an image, so it costs nothing. It is not white and it is not grey. Paper is never white on a screen.

**The light** is one warm ember, used about five times in any viewport: a button, an active link, a hover, a bloom behind a heading, a rule beside a quotation. If you can see a lot of orange at once, something has gone wrong.

**The furniture** is hairlines and white space. There are no cards, no shadows, no gradients used as decoration, and no boxes. A thick warm border frames the whole viewport — 48 pixels, stepping down to 36 and then 20 on smaller screens — which is the one idea borrowed wholesale from the site that inspired this one.

## The type

Three families, self-hosted, and no more:

- **Fraunces** for anything structural — the hero statement, page titles, section headings, card titles. Its optical size axis means the big manifesto and a card title are the same typeface correctly set rather than one scaled up.
- **Newsreader** for anything you actually read. A warm serif with a tall x-height, which is the point of it; long-form in a neutral sans is tiring and I would rather the essays did not tire anyone.
- **Inter** for the small uppercase labels, the navigation, and the buttons. It is the only place on the site where letters are shouted, and it is rationed deliberately.

Uppercase appears twice per page: the hero statement and the page title. Everything below the fold is sentence case. That single rule does more for the calm than anything else on the list.

## The build

Astro, outputting static HTML. No framework of any kind ships to the browser, no hydration, and no client-side UI runtime. The total JavaScript is a small scroll-reveal observer, a menu with a focus trap, and a reading-progress bar — a few kilobytes, hand-written, because a reader-focused site should not make you download an application to read an essay.

Content is Markdown in a handful of content collections. Adding an essay is a text file. Adding a service is a text file, and it appears on the site with no code change at all.

Images are the one thing I have left open. Every piece here can go out with a typographic cover and no picture whatsoever, and the site is designed so that this looks deliberate rather than broken. Photography will arrive when there is some worth having.

## The lamp

There is a night mode, because a room at the end of the day has a lamp and a lamp can be dimmed. It follows your system preference by default and remembers what you choose. It never flashes on load, and it costs nothing.

If your system is set to reduce motion, everything stops moving here, including the reveals. That is checked, not hoped for.

## Privacy

No trackers, no cookies, no banner, no fonts from anyone else's server, no third-party anything. If there is analytics on this site one day it will be one that does not set a cookie, and it may be no analytics at all.
