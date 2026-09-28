#!/usr/bin/env python3
"""
Looks at the built social cards and says whether they are actually usable.

The text wrap in src/lib/og.ts is a width *estimate* — there is no font engine
at build time, so the line breaks are computed from a table of Georgia's
proportions. An estimate that is slightly wrong produces a headline that either
overflows the card or has been ellipsised when it did not need to be, and
neither is visible in a build log. So this measures the rasterised pixels
instead, which is the only way to know:

  - the card is exactly 1200x630, because that is what a crawler lays out;
  - nothing is ink within EDGE of any side, which is what a clipped or
    overflowing headline looks like;
  - there is ink in the band where the headline belongs, so a card cannot pass
    by rendering nothing at all;
  - enough distinct colours are present that type actually drew, rather than the
    file being a flat rectangle of paper.

Everything here goes through PIL's own C loops — getbbox on a thresholded image,
getcolors on the palette. A per-pixel Python loop over twelve 1200x630 cards is
ninety million iterations, and a gate that takes a minute is a gate people stop
running.

  python3 scripts/check-cards.py
"""

import pathlib
import sys

from PIL import Image, ImageChops

ROOT = pathlib.Path(__file__).resolve().parent.parent
OG = ROOT / "dist" / "og"

WIDTH, HEIGHT = 1200, 630

# The paper. Anything further from it than TOLERANCE counts as ink.
PAPER = (0xF2, 0xED, 0xE4)
TOLERANCE = 24

EDGE = 40  # the clear band at the edge of the card
HEADLINE_TOP, HEADLINE_BOTTOM = 140, 470
HEADLINE = (0, HEADLINE_TOP, WIDTH, HEADLINE_BOTTOM)  # where the headline lives

results = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append(f"{'PASS' if ok else 'FAIL'}  {name}{f'  — {detail}' if detail else ''}")


def ink_mask(image: Image.Image) -> Image.Image:
    """1 where the card is not paper, 0 where it is.

    The comparison is done in L, after a per-channel difference against the
    paper, so "different" means different in every channel rather than in one.
    """
    difference = ImageChops.difference(image, Image.new("RGB", image.size, PAPER))
    return difference.convert("L").point(lambda v: 255 if v > TOLERANCE else 0, mode="1")


cards = sorted(OG.rglob("*.png"))

if not cards:
    check("there are cards to check", False, f"no PNGs in {OG.relative_to(ROOT)}")
    print("\n".join(results))
    sys.exit(1)

check("there are cards to check", True, f"{len(cards)} in {OG.relative_to(ROOT)}")

for path in cards:
    name = str(path.relative_to(OG).with_suffix(""))
    image = Image.open(path).convert("RGB")

    check(f"{name} is {WIDTH}x{HEIGHT}", image.size == (WIDTH, HEIGHT), f"{image.size[0]}x{image.size[1]}")

    mask = ink_mask(image)
    box = mask.getbbox()

    if box is None:
        check(f"{name} drew type, not a flat fill", False, "the card is blank")
        check(f"{name} keeps a clear margin", False, "nothing to measure")
        check(f"{name} sets its headline", False, "no ink at all")
        continue

    # The four edge strips. Any ink in one of them is a headline running off the
    # card or a margin that has collapsed.
    strips = {
        "left": (0, 0, EDGE, HEIGHT),
        "right": (WIDTH - EDGE, 0, WIDTH, HEIGHT),
        "top": (0, 0, WIDTH, EDGE),
        "bottom": (0, HEIGHT - EDGE, WIDTH, HEIGHT),
    }
    dirty = [where for where, box in strips.items() if mask.crop(box).getbbox()]

    check(f"{name} keeps a clear margin", not dirty,
          f"ink in the {', '.join(dirty)} edge" if dirty else f"ink at {box}")

    # No detail on success: the only thing worth saying about this one is what
    # went wrong, and printing "nothing between the wordmark and the rule" beside
    # a PASS teaches the reader to skip the line.
    check(f"{name} sets its headline", mask.crop(HEADLINE).getbbox() is not None)

    # Antialiased type produces hundreds of blended pixels; a card whose
    # rasteriser silently failed produces one or two flat colours. Twenty is
    # comfortably above "something drew" and far below what type does.
    colours = len(image.getcolors(maxcolors=1 << 16) or [])
    check(f"{name} drew type, not a flat fill", colours > 20, f"{colours} colours")

print("\n".join(results))
failed = [r for r in results if r.startswith("FAIL")]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
