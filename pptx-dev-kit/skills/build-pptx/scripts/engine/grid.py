"""12-column content grid. Every layout must place cards via span() so left/right edges share one rail."""

from __future__ import annotations

# PowerPoint widescreen EMUs — 13.333... × 7.5 in. Do not mix with 10 × 5.625.
EMU_PER_INCH = 914400
SW = 12192000 / EMU_PER_INCH
SH = 6858000 / EMU_PER_INCH

MARGIN = 0.50
GUTTER = 0.22
PAD = 0.26
COLS = 12

TITLE_TOP = 0.38
TITLE_H = 0.78
BODY_TOP = TITLE_TOP + TITLE_H + 0.16  # 1.32
FOOTER_H = 0.32
FOOTER_TOP = SH - MARGIN - FOOTER_H  # 6.68
BODY_BOTTOM = FOOTER_TOP - 0.14
BODY_H = BODY_BOTTOM - BODY_TOP

BADGE_SIZE = 0.32

CONTENT_LEFT = MARGIN
CONTENT_RIGHT = SW - MARGIN
CONTENT_W = CONTENT_RIGHT - CONTENT_LEFT

# Large rounded-rects whose left is farther than this from a column start fail the rail check.
ALIGN_TOL_IN = 0.02


def snap(inches: float) -> float:
    """Round to a whole EMU so adjacent spans share an edge (no 1-EMU drift)."""
    return round(float(inches) * EMU_PER_INCH) / EMU_PER_INCH


def emu_length(inches: float) -> int:
    return int(round(float(inches) * EMU_PER_INCH))


def _col_unit() -> float:
    return (CONTENT_W - GUTTER * (COLS - 1)) / COLS


def x(col: int) -> float:
    """Left edge of column `col` (0–11)."""
    if col < 0 or col >= COLS:
        raise ValueError(f"column {col} out of range")
    return snap(CONTENT_LEFT + col * (_col_unit() + GUTTER))


def span(col: int, n: int) -> tuple[float, float]:
    """(left, width) covering `n` columns starting at `col`."""
    if n < 1 or col + n > COLS:
        raise ValueError(f"span({col}, {n}) exceeds 12-column grid")
    left = x(col)
    width = snap(n * _col_unit() + (n - 1) * GUTTER)
    return left, width


def column_lefts() -> list[float]:
    return [x(i) for i in range(COLS)]


def split_rows(count: int, *, top: float = BODY_TOP, height: float = BODY_H, gap: float = GUTTER):
    """Yield (top, height) for `count` equal rows in the body band."""
    if count < 1:
        raise ValueError("count must be ≥ 1")
    h = (height - gap * (count - 1)) / count
    for i in range(count):
        yield snap(top + i * (h + gap)), snap(h)


def split_cols(count: int, *, col: int = 0, n: int = 12, gap: float = GUTTER):
    """Yield (left, width) splitting a span into `count` tiles.

    When `n` is divisible by `count` and `gap` is the grid gutter, tiles land on
    column starts (2→6+6, 3→4+4+4, 4→3+3+3+3) so a 3-card TOC lines up with a
    chart's 8+4 split on the same rails.
    """
    if count < 1:
        raise ValueError("count must be ≥ 1")
    if n % count == 0 and abs(gap - GUTTER) < 1e-9:
        span_n = n // count
        for i in range(count):
            yield span(col + i * span_n, span_n)
        return
    left, width = span(col, n)
    tile = (width - gap * (count - 1)) / count
    for i in range(count):
        yield snap(left + i * (tile + gap)), snap(tile)
