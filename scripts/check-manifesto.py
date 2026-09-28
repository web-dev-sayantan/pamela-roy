"""
Check the hero manifesto against the room frame at every viewport.

The manifesto's three line breaks are hand-authored above 900px, so the real
risk is that the longest line outgrows its container and either pushes through
the frame or wraps somewhere unintended. Below 900px the breaks are released
and the sentence is balanced as a paragraph, so the risk there is different: it
is whether the hero still fits the fold.

Rather than estimate Fraunces' average uppercase width, measure it. Instance
the variable font at the exact variation settings the CSS asks for, then work
from real advance widths.

  python3 scripts/check-manifesto.py
"""

import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

FONT_DIR = "node_modules/@fontsource-variable/fraunces/files"

# Must match Manifesto.astro.
OPSZ = 144
WGHT = 500
TRACKING = -0.03  # --track-display

FILES = {
    "roman": f"{FONT_DIR}/fraunces-latin-standard-normal.woff2",
    "italic": f"{FONT_DIR}/fraunces-latin-standard-italic.woff2",
}

# The authored composition. Roman lines are uppercased by CSS; the italic line
# is not.
LINES = [
    ("A quiet room full of", "roman", True),
    ("half-finished thoughts", "italic", False),
    ("and the long way home.", "roman", True),
]

# --- desktop: fixed breaks, must fit -----------------------------------------
DESKTOP_MIN_PX, DESKTOP_MAX_PX = 2.75 * 16, 6 * 16
DESKTOP_VW = 6.5
HERO_MAX_WIDTH = 92 * 16
SIDE_PADDING = 1.5 * 16                      # --sp-4, in px via rem
FRAME_STEPS = [(640, 20), (1024, 36), (10**9, 48)]


# --- mobile: released breaks -------------------------------------------------
MOBILE_MIN_PX, MOBILE_MAX_PX = 2.5 * 16, 4.5 * 16
MOBILE_VW = 8.5
MOBILE_MEASURE = 28 * 16                     # .manifesto max-width
NOTE_MAX_CH = 34                              # .hero__note
HERO_SVH = 0.70                              # min-height on a phone
LH_DISPLAY = 0.92
GAP = 2 * 16                                  # --sp-5


_cache = {}


def advances(chars, style):
    """Per-character advance widths in em units, for the given file."""
    if style not in _cache:
        font = TTFont(FILES[style])
        instancer.instantiateVariableFont(
            font, {"opsz": OPSZ, "wght": WGHT}, inplace=True
        )
        upem = font["head"].unitsPerEm
        # Read the raw metrics table: hmtx[g] raises for glyphs that carry no
        # explicit entry, which a space often does.
        metrics = font["hmtx"].metrics
        _cache[style] = (font.getBestCmap(), {g: m[0] / upem for g, m in metrics.items()})
    cmap, table = _cache[style]
    widths = {}
    for ch in set(chars):
        glyph = cmap.get(ord(ch))
        # A character with no glyph measures zero, which is the right answer
        # for the width check: it cannot make the line overflow.
        widths[ch] = table.get(glyph, 0.0) if glyph else 0.0
    return widths


def text_width(text, style, size_px, uppercase=False):
    """Rendered width in px, including CSS letter-spacing after every glyph."""
    if uppercase:
        text = text.upper()
    em = advances(text, style)
    return sum(em[ch] for ch in text) * size_px + TRACKING * size_px * len(text)


def font_size(vw, lo, hi, factor):
    return max(lo, min(hi, vw * factor / 100))


def frame_width(vw):
    for limit, px in FRAME_STEPS:
        if vw <= limit:
            return px
    return 48


def content_width(vw, max_width, padding):
    return min(vw, max_width) - 2 * (frame_width(vw) + padding)


def check_desktop():
    viewports = [901, 1024, 1152, 1280, 1366, 1440, 1600, 1728, 1920, 2560]
    print("DESKTOP — authored breaks, longest line must fit its column")
    print(f"{'vw':>5} {'frame':>6} {'column':>8} {'size':>7} {'longest':>9} {'fill':>6}  status")
    print("-" * 72)

    failures = 0
    for vw in viewports:
        size = font_size(vw, DESKTOP_MIN_PX, DESKTOP_MAX_PX, DESKTOP_VW)
        column = content_width(vw, HERO_MAX_WIDTH, SIDE_PADDING)
        longest = max(
            text_width(t, s, size, up) for t, s, up in LINES
        )
        ok = longest <= column
        failures += not ok
        print(
            f"{vw:>5} {frame_width(vw):>5}px {column:>7.0f}px {size:>6.1f}px "
            f"{longest:>8.0f}px {longest / column:>5.0%}  "
            f"{'OK' if ok else 'OVERFLOW'}"
        )

    print("-" * 72)
    return failures


def wrap(text, style, size, column, uppercase):
    """Greedy line breaking, as a browser would do it."""
    lines, current = [], ""
    for word in text.split():
        trial = f"{current} {word}".strip()
        if current and text_width(trial, style, size, uppercase) > column:
            lines.append(current)
            current = word
        else:
            current = trial
    if current:
        lines.append(current)
    return lines


def check_mobile():
    """
    Below 900px each of the three authored lines wraps internally rather than
    merging, so the test is not "does it fit" but "is the statement itself above
    the fold". The supporting note is allowed below it — capping the hero at
    70svh is what buys the reader the whole statement on arrival.
    """
    devices = [
        (320, 568), (360, 640), (375, 667), (390, 844), (414, 896),
        (480, 800), (600, 900), (768, 1024),
    ]
    print()
    print("MOBILE — three independent blocks; label + manifesto clears 70svh")
    print(f"{'vw':>5} {'h':>5} {'size':>7} {'measure':>8} {'lines':>6} "
          f"{'above fold':>11} {'70svh':>7}  status")
    print("-" * 68)

    failures = 0
    for vw, vh in devices:
        size = font_size(vw, MOBILE_MIN_PX, MOBILE_MAX_PX, MOBILE_VW)
        column = content_width(vw, HERO_MAX_WIDTH, SIDE_PADDING)
        measure = min(column, MOBILE_MEASURE)

        # Each authored line is a block that wraps internally and never mixes
        # with its neighbours.
        lines = sum(len(wrap(text, style, size, measure, up)) for text, style, up in LINES)

        label = 11 * 1.5                       # --fs-label, --lh-ui
        above = label + GAP + lines * size * LH_DISPLAY
        budget = vh * HERO_SVH

        ok = above <= budget
        failures += not ok
        print(
            f"{vw:>5} {vh:>5} {size:>6.1f}px {measure:>7.0f}px {lines:>6} "
            f"{above:>10.0f}px {budget:>6.0f}px  {'OK' if ok else 'BELOW FOLD'}"
        )

    print("-" * 68)
    return failures


def main():
    failures = check_desktop() + check_mobile()
    print()
    if failures:
        print(f"FAIL: {failures} viewport(s) out of bounds")
        return 1
    print("PASS: the hero holds at every viewport")
    return 0


if __name__ == "__main__":
    sys.exit(main())
