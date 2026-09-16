"""Footer text + page badge on the same 12-column rail as the body."""

from __future__ import annotations

from . import grid as G
from .shapes import add_oval, add_text
from .theme import Theme

DARK_LAYOUTS = {"cover", "section", "cta"}


def add_chrome(slide, theme: Theme, index: int, layout: str) -> None:
    if layout == "cover" and not theme.show_on_cover:
        return
    on_dark = layout in DARK_LAYOUTS
    caption = theme.c("cover_text") if on_dark else theme.c("muted")
    footer_left, footer_w = G.span(0, 10)
    if theme.footer_text:
        add_text(
            slide,
            theme.footer_text,
            footer_left,
            G.FOOTER_TOP,
            footer_w,
            G.FOOTER_H,
            theme=theme,
            size_pt=theme.pt_caption,
            color=caption,
            font=theme.body_font,
            anchor="middle",
        )
    badge_left, badge_col_w = G.span(11, 1)
    bx = badge_left + (badge_col_w - G.BADGE_SIZE) / 2
    by = G.FOOTER_TOP + (G.FOOTER_H - G.BADGE_SIZE) / 2
    add_oval(slide, bx, by, G.BADGE_SIZE, G.BADGE_SIZE, theme.c("accent"))
    add_text(
        slide,
        str(index),
        bx,
        by,
        G.BADGE_SIZE,
        G.BADGE_SIZE,
        theme=theme,
        size_pt=11,
        color=theme.c("accent_text"),
        font=theme.body_font,
        bold=True,
        align="center",
        anchor="middle",
    )
