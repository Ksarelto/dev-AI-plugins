"""Named layout recipes on a shared 12-column grid."""

from __future__ import annotations

import re

from engine import grid as G
from engine.charts import add_chart
from engine.shapes import (
    add_bullet_rows,
    add_disc_label,
    add_oval,
    add_rect,
    add_round_rect,
    add_spark_bars,
    add_text,
    fill_slide,
)
from engine.theme import Theme

RADIUS = 0.10


def _column_body(column) -> list[str]:
    body = column.get("body") or []
    if isinstance(body, str):
        return [body]
    return list(body)


def _paint_title(slide, spec: dict, theme: Theme, *, color=None) -> None:
    left, width = G.span(0, 12)
    add_text(
        slide,
        spec.get("title") or "",
        left,
        G.TITLE_TOP,
        width,
        G.TITLE_H,
        theme=theme,
        size_pt=theme.pt_title,
        color=color or theme.c("text"),
        font=theme.title_font,
        bold=True,
        anchor="middle",
    )


def _numeric(value) -> float | None:
    if value is None:
        return None
    match = re.search(r"[\d.]+", str(value).replace(",", ""))
    if not match:
        return None
    try:
        return float(match.group())
    except ValueError:
        return None


def _card(slide, left, top, width, height, fill, *, theme: Theme, radius=RADIUS):
    return add_round_rect(
        slide, left, top, width, height, fill, radius=radius, shadow=True
    )


def cover(slide, spec: dict, theme: Theme, index: int) -> None:
    fill_slide(slide, theme.c("cover_bg"))
    panel_left, panel_w = G.span(0, 4)
    add_rect(slide, 0, 0, panel_left + panel_w, G.SH, theme.c("accent"))
    add_oval(slide, -0.8, 4.6, 3.6, 3.6, theme.c("cover_bg"))
    add_oval(slide, 1.15, -0.85, 2.2, 2.2, theme.c("cover_bg"))
    text_left, text_w = G.span(5, 7)
    subtitle = spec.get("subtitle") or ""
    chip = subtitle.split(" for ")[0].strip() or "Briefing"
    if len(chip) > 40:
        chip = chip[:38] + "…"
    chip_w = min(3.6, text_w)
    add_round_rect(
        slide, text_left, 1.05, chip_w, 0.38, theme.c("accent"), radius=0.18
    )
    add_text(
        slide,
        chip,
        text_left + 0.16,
        1.05,
        chip_w - 0.32,
        0.38,
        theme=theme,
        size_pt=12,
        color=theme.c("accent_text"),
        font=theme.body_font,
        bold=True,
        anchor="middle",
    )
    add_text(
        slide,
        spec.get("title") or "",
        text_left,
        1.58,
        text_w,
        2.35,
        theme=theme,
        size_pt=theme.pt_cover,
        color=theme.c("cover_text"),
        font=theme.title_font,
        bold=True,
    )
    if subtitle:
        add_text(
            slide,
            subtitle,
            text_left,
            4.10,
            text_w,
            0.7,
            theme=theme,
            size_pt=theme.pt_subtitle,
            color=theme.c("cover_text"),
            font=theme.body_font,
        )
    if spec.get("meta"):
        add_text(
            slide,
            spec["meta"],
            text_left,
            6.35,
            text_w,
            0.4,
            theme=theme,
            size_pt=theme.pt_caption,
            color=theme.c("cover_text"),
            font=theme.body_font,
        )


def toc(slide, spec: dict, theme: Theme, index: int) -> None:
    fill_slide(slide, theme.c("bg"))
    _paint_title(slide, spec, theme)
    items = spec.get("items") or []
    n = max(len(items), 1)
    if n == 4:
        cols = 2
    elif n >= 3:
        cols = 3
    else:
        cols = n
    rows = (n + cols - 1) // cols
    row_iter = list(G.split_rows(rows))
    for i, item in enumerate(items):
        r, c = divmod(i, cols)
        top, height = row_iter[r]
        tiles = list(G.split_cols(cols))
        left, width = tiles[c]
        _card(slide, left, top, width, height, theme.c("surface"), theme=theme)
        add_rect(slide, left, top, 0.12, height, theme.c("accent"))
        add_text(
            slide,
            f"{i + 1:02d}",
            left + G.PAD,
            top + G.PAD,
            width - 2 * G.PAD,
            0.55,
            theme=theme,
            size_pt=28,
            color=theme.c("accent"),
            font=theme.title_font,
            bold=True,
        )
        add_text(
            slide,
            item.get("title") or "",
            left + G.PAD,
            top + G.PAD + 0.62,
            width - 2 * G.PAD,
            0.7,
            theme=theme,
            size_pt=18,
            color=theme.c("text"),
            font=theme.title_font,
            bold=True,
        )
        if item.get("body"):
            add_text(
                slide,
                item["body"],
                left + G.PAD,
                top + G.PAD + 1.32,
                width - 2 * G.PAD,
                height - G.PAD - 1.42,
                theme=theme,
                size_pt=theme.pt_caption,
                color=theme.c("muted"),
            )


def section(slide, spec: dict, theme: Theme, index: int) -> None:
    fill_slide(slide, theme.c("cover_bg"))
    panel_left, panel_w = G.span(0, 4)
    add_rect(slide, 0, 0, panel_left + panel_w, G.SH, theme.c("accent"))
    text_left, text_w = G.span(5, 7)
    label = str(spec.get("index") or index).zfill(2)
    add_text(
        slide,
        label,
        text_left,
        1.7,
        text_w,
        1.2,
        theme=theme,
        size_pt=72,
        color=theme.c("accent"),
        font=theme.title_font,
        bold=True,
    )
    add_text(
        slide,
        spec.get("title") or "",
        text_left,
        3.1,
        text_w,
        1.4,
        theme=theme,
        size_pt=40,
        color=theme.c("cover_text"),
        font=theme.title_font,
        bold=True,
    )
    if spec.get("subtitle"):
        add_text(
            slide,
            spec["subtitle"],
            text_left,
            4.6,
            text_w,
            0.7,
            theme=theme,
            size_pt=theme.pt_subtitle,
            color=theme.c("cover_text"),
        )


def bullets(slide, spec: dict, theme: Theme, index: int) -> None:
    fill_slide(slide, theme.c("bg"))
    _paint_title(slide, spec, theme)
    items = spec.get("bullets") or []
    kpis = spec.get("kpis") or []
    list_cols = 8 if kpis else 12
    n = max(len(items), 1)
    for i, (top, height) in enumerate(G.split_rows(n)):
        if i >= len(items):
            break
        left, width = G.span(0, list_cols)
        _card(slide, left, top, width, height, theme.c("surface"), theme=theme)
        add_disc_label(
            slide,
            left + G.PAD,
            top + (height - 0.40) / 2,
            0.40,
            f"{i + 1:02d}",
            theme=theme,
        )
        add_text(
            slide,
            items[i],
            left + G.PAD + 0.52,
            top,
            width - G.PAD * 2 - 0.52,
            height,
            theme=theme,
            size_pt=theme.pt_body,
            color=theme.c("text"),
            font=theme.body_font,
            bold=True,
            anchor="middle",
        )
    if kpis:
        kpi = kpis[0]
        left, width = G.span(8, 4)
        top, height = next(G.split_rows(1))
        _card(slide, left, top, width, height, theme.c("accent"), theme=theme)
        add_text(
            slide,
            kpi.get("value") or "",
            left + G.PAD,
            top + height * 0.28,
            width - 2 * G.PAD,
            1.2,
            theme=theme,
            size_pt=min(theme.pt_kpi, 48),
            color=theme.c("accent_text"),
            font=theme.title_font,
            bold=True,
            align="center",
        )
        add_text(
            slide,
            kpi.get("label") or "",
            left + G.PAD,
            top + height * 0.55,
            width - 2 * G.PAD,
            0.8,
            theme=theme,
            size_pt=16,
            color=theme.c("accent_text"),
            font=theme.body_font,
            align="center",
        )


def two_column(slide, spec: dict, theme: Theme, index: int) -> None:
    fill_slide(slide, theme.c("bg"))
    _paint_title(slide, spec, theme)
    columns = spec.get("columns") or []
    labels = ("01", "02")
    top, height = next(G.split_rows(1))
    for i, (left, width) in enumerate(G.split_cols(2)):
        if i >= len(columns):
            break
        column = columns[i]
        _card(slide, left, top, width, height, theme.c("surface"), theme=theme)
        add_disc_label(slide, left + G.PAD, top + G.PAD, 0.40, labels[i], theme=theme)
        add_text(
            slide,
            column.get("title") or "",
            left + G.PAD + 0.52,
            top + G.PAD,
            width - 2 * G.PAD - 0.52,
            0.40,
            theme=theme,
            size_pt=18,
            color=theme.c("text"),
            font=theme.title_font,
            bold=True,
            anchor="middle",
        )
        add_bullet_rows(
            slide,
            _column_body(column),
            left + G.PAD,
            top + G.PAD + 0.62,
            width - 2 * G.PAD,
            theme=theme,
            row_h=0.48,
        )


def _kpi_card(slide, kpi, left, top, width, height, *, theme: Theme, hero=False):
    _card(slide, left, top, width, height, theme.c("surface"), theme=theme)
    if hero:
        add_rect(slide, left, top, 0.14, height, theme.c("accent"))
    inset = G.PAD + (0.10 if hero else 0)
    value_pt = 56 if hero else min(theme.pt_kpi, 40)
    add_text(
        slide,
        kpi.get("value") or "",
        left + inset,
        top + G.PAD,
        width - inset - G.PAD,
        1.15 if hero else 0.85,
        theme=theme,
        size_pt=value_pt,
        color=theme.c("text"),
        font=theme.title_font,
        bold=True,
    )
    add_text(
        slide,
        kpi.get("label") or "",
        left + inset,
        top + (1.40 if hero else 1.05),
        width - inset - G.PAD,
        0.55,
        theme=theme,
        size_pt=16 if hero else 14,
        color=theme.c("muted"),
        font=theme.body_font,
    )
    if kpi.get("delta"):
        add_text(
            slide,
            kpi["delta"],
            left + inset,
            top + (1.95 if hero else 1.55),
            width - inset - G.PAD,
            0.35,
            theme=theme,
            size_pt=theme.pt_caption,
            color=theme.c("accent"),
            font=theme.body_font,
            bold=True,
        )
    spark_h = 0.70 if hero else 0.42
    min_above = 2.10 if hero else 1.35
    bars_top = top + height - G.PAD - spark_h
    if bars_top >= top + min_above:
        series = kpi.get("spark") or []
        if not series:
            n = _numeric(kpi.get("value"))
            series = [n * 0.55, n * 0.7, n * 0.85, n] if n else [1, 1.2, 1.5, 2]
        add_spark_bars(
            slide,
            series,
            left + inset,
            bars_top,
            width - inset - G.PAD,
            spark_h,
            theme=theme,
        )


def kpi_row(slide, spec: dict, theme: Theme, index: int) -> None:
    fill_slide(slide, theme.c("bg"))
    _paint_title(slide, spec, theme)
    kpis = spec.get("kpis") or []
    n = max(len(kpis), 1)
    top, height = next(G.split_rows(1))
    for i, (left, width) in enumerate(G.split_cols(n)):
        _kpi_card(slide, kpis[i], left, top, width, height, theme=theme, hero=False)


def icon_grid(slide, spec: dict, theme: Theme, index: int) -> None:
    fill_slide(slide, theme.c("bg"))
    _paint_title(slide, spec, theme)
    items = spec.get("items") or []
    count = len(items)
    cols = 3 if count > 4 else 2
    rows = 2
    row_iter = list(G.split_rows(rows))
    col_iter = list(G.split_cols(cols))
    disc = 0.42
    for i, item in enumerate(items[: cols * rows]):
        r, c = divmod(i, cols)
        top, height = row_iter[r]
        left, width = col_iter[c]
        _card(slide, left, top, width, height, theme.c("surface"), theme=theme)
        add_disc_label(
            slide,
            left + G.PAD,
            top + G.PAD,
            disc,
            (item.get("icon") or str(i + 1))[:2],
            theme=theme,
        )
        add_text(
            slide,
            item.get("title") or "",
            left + G.PAD + disc + 0.14,
            top + G.PAD,
            width - 2 * G.PAD - disc - 0.14,
            disc,
            theme=theme,
            size_pt=16,
            color=theme.c("text"),
            font=theme.title_font,
            bold=True,
            anchor="middle",
        )
        add_text(
            slide,
            item.get("body") or "",
            left + G.PAD,
            top + G.PAD + disc + 0.12,
            width - 2 * G.PAD,
            height - 2 * G.PAD - disc - 0.12,
            theme=theme,
            size_pt=theme.pt_body,
            color=theme.c("muted"),
        )


def chart(slide, spec: dict, theme: Theme, index: int) -> None:
    fill_slide(slide, theme.c("bg"))
    _paint_title(slide, spec, theme)
    chart_spec = spec.get("chart") or {}
    insight = spec.get("insight") or chart_spec.get("alt") or ""
    body_top, body_h = next(G.split_rows(1))
    chart_left, chart_w = G.span(0, 8)
    _card(slide, chart_left, body_top, chart_w, body_h, theme.c("surface"), theme=theme)
    add_chart(
        slide,
        chart_spec,
        chart_left + G.PAD,
        body_top + G.PAD,
        chart_w - 2 * G.PAD,
        body_h - 2 * G.PAD,
        theme=theme,
    )
    side_left, side_w = G.span(8, 4)
    _card(slide, side_left, body_top, side_w, body_h, theme.c("accent"), theme=theme)
    add_text(
        slide,
        "Takeaway",
        side_left + G.PAD,
        body_top + G.PAD,
        side_w - 2 * G.PAD,
        0.32,
        theme=theme,
        size_pt=12,
        color=theme.c("accent_text"),
        font=theme.body_font,
        bold=True,
    )
    series = (chart_spec.get("series") or [{}])[0]
    values = series.get("values") or []
    cats = chart_spec.get("categories") or []
    headline = ""
    if values:
        last = values[-1]
        headline = f"{last:g}" if isinstance(last, (int, float)) else str(last)
        if cats:
            headline = f"{headline}"
    y = body_top + G.PAD + 0.38
    if headline:
        add_text(
            slide,
            headline,
            side_left + G.PAD,
            y,
            side_w - 2 * G.PAD,
            0.85,
            theme=theme,
            size_pt=40,
            color=theme.c("accent_text"),
            font=theme.title_font,
            bold=True,
        )
        y += 0.90
        if cats:
            add_text(
                slide,
                str(cats[-1]),
                side_left + G.PAD,
                y,
                side_w - 2 * G.PAD,
                0.28,
                theme=theme,
                size_pt=12,
                color=theme.c("accent_text"),
                font=theme.body_font,
            )
            y += 0.32
    add_text(
        slide,
        insight,
        side_left + G.PAD,
        y,
        side_w - 2 * G.PAD,
        body_top + body_h - y - G.PAD - 0.85,
        theme=theme,
        size_pt=16,
        color=theme.c("accent_text"),
        font=theme.title_font,
        bold=True,
    )
    if len(values) >= 2:
        add_spark_bars(
            slide,
            values,
            side_left + G.PAD,
            body_top + body_h - G.PAD - 0.70,
            side_w - 2 * G.PAD,
            0.70,
            theme=theme,
            color=theme.c("accent_text"),
            rest_color=theme.c("cover_bg"),
        )


def quote(slide, spec: dict, theme: Theme, index: int) -> None:
    fill_slide(slide, theme.c("bg"))
    if spec.get("title"):
        _paint_title(slide, spec, theme)
    left, width = G.span(0, 12)
    top, height = next(G.split_rows(1))
    _card(slide, left, top, width, height, theme.c("surface"), theme=theme)
    add_rect(slide, left, top, 0.16, height, theme.c("accent"))
    q = spec.get("quote") or {}
    add_text(
        slide,
        q.get("text") or "",
        left + G.PAD + 0.2,
        top + G.PAD,
        width - 2 * G.PAD - 0.2,
        height - 2 * G.PAD - 0.55,
        theme=theme,
        size_pt=26,
        color=theme.c("text"),
        font=theme.title_font,
        italic=True,
        anchor="middle",
    )
    if q.get("attribution"):
        add_text(
            slide,
            q["attribution"],
            left + G.PAD + 0.2,
            top + height - G.PAD - 0.45,
            width - 2 * G.PAD - 0.2,
            0.40,
            theme=theme,
            size_pt=14,
            color=theme.c("accent"),
            font=theme.body_font,
        )


def cta(slide, spec: dict, theme: Theme, index: int) -> None:
    fill_slide(slide, theme.c("cover_bg"))
    left, width = G.span(0, 12)
    add_text(
        slide,
        spec.get("title") or "",
        left,
        G.TITLE_TOP,
        width,
        1.15,
        theme=theme,
        size_pt=36,
        color=theme.c("cover_text"),
        font=theme.title_font,
        bold=True,
    )
    steps = spec.get("bullets") or []
    n = max(len(steps), 1)
    tiles = list(G.split_cols(n))
    card_top = 2.20
    meta_h = 0.36 if spec.get("meta") else 0
    card_h = G.BODY_BOTTOM - card_top - (meta_h + 0.10 if meta_h else 0)
    if n >= 2:
        first_cx = tiles[0][0] + tiles[0][1] / 2
        last_cx = tiles[-1][0] + tiles[-1][1] / 2
        add_rect(
            slide,
            first_cx,
            card_top + 0.48,
            last_cx - first_cx,
            0.05,
            theme.c("accent"),
        )
    for i, step in enumerate(steps):
        t_left, t_w = tiles[i]
        _card(slide, t_left, card_top, t_w, card_h, theme.c("accent"), theme=theme)
        add_text(
            slide,
            f"{i + 1:02d}",
            t_left + G.PAD,
            card_top + G.PAD,
            t_w - 2 * G.PAD,
            0.7,
            theme=theme,
            size_pt=28,
            color=theme.c("accent_text"),
            font=theme.title_font,
            bold=True,
        )
        add_text(
            slide,
            step,
            t_left + G.PAD,
            card_top + G.PAD + 0.85,
            t_w - 2 * G.PAD,
            card_h - 2 * G.PAD - 0.85,
            theme=theme,
            size_pt=16,
            color=theme.c("accent_text"),
            font=theme.body_font,
            bold=True,
        )
    if spec.get("meta"):
        add_text(
            slide,
            spec["meta"],
            left,
            G.BODY_BOTTOM - meta_h,
            width,
            meta_h,
            theme=theme,
            size_pt=theme.pt_caption,
            color=theme.c("cover_text"),
        )


def _insight_card(slide, text, left, top, width, height, *, theme: Theme) -> None:
    _card(slide, left, top, width, height, theme.c("accent"), theme=theme)
    add_text(
        slide,
        "Insight",
        left + G.PAD,
        top + G.PAD,
        width - 2 * G.PAD,
        0.28,
        theme=theme,
        size_pt=12,
        color=theme.c("accent_text"),
        font=theme.body_font,
        bold=True,
    )
    add_text(
        slide,
        text,
        left + G.PAD,
        top + G.PAD + 0.34,
        width - 2 * G.PAD,
        height - 2 * G.PAD - 0.34,
        theme=theme,
        size_pt=16,
        color=theme.c("accent_text"),
        font=theme.title_font,
        bold=True,
    )


def bento(slide, spec: dict, theme: Theme, index: int) -> None:
    """Asymmetric dashboard: hero KPI + insight proof + supporting metric tiles."""
    fill_slide(slide, theme.c("bg"))
    _paint_title(slide, spec, theme)
    kpis = spec.get("kpis") or []
    hero = kpis[0] if kpis else {"value": "—", "label": ""}
    rest = kpis[1:3]
    insight = (spec.get("insight") or "").strip()
    hero_left, hero_w = G.span(0, 6)
    top, height = next(G.split_rows(1))
    _kpi_card(slide, hero, hero_left, top, hero_w, height, theme=theme, hero=True)
    side_left, side_w = G.span(6, 6)
    if insight and rest:
        rows = list(G.split_rows(2))
        _insight_card(
            slide, insight, side_left, rows[0][0], side_w, rows[0][1], theme=theme
        )
        btop, bh = rows[1]
        tiles = list(G.split_cols(len(rest), col=6, n=6))
        for i, kpi in enumerate(rest):
            t_left, t_w = tiles[i]
            _kpi_card(slide, kpi, t_left, btop, t_w, bh, theme=theme, hero=False)
    elif rest:
        side_rows = list(G.split_rows(len(rest)))
        for i, kpi in enumerate(rest):
            rtop, rh = side_rows[i]
            _kpi_card(slide, kpi, side_left, rtop, side_w, rh, theme=theme, hero=False)
    elif insight:
        _insight_card(slide, insight, side_left, top, side_w, height, theme=theme)


def timeline(slide, spec: dict, theme: Theme, index: int) -> None:
    """Horizontal process: connector rail, numbered discs, hanging cards per step."""
    fill_slide(slide, theme.c("bg"))
    _paint_title(slide, spec, theme)
    items = spec.get("items") or []
    n = max(len(items), 1)
    tiles = list(G.split_cols(n))
    top, height = next(G.split_rows(1))
    disc = 0.46
    rail_y = top + 0.28
    first_cx = tiles[0][0] + tiles[0][1] / 2
    last_cx = tiles[-1][0] + tiles[-1][1] / 2
    add_rect(slide, first_cx, rail_y - 0.03, last_cx - first_cx, 0.06, theme.c("muted"))
    card_top = rail_y + disc * 0.42
    card_h = top + height - card_top
    for i, item in enumerate(items):
        left, width = tiles[i]
        accented = i == n - 1
        fill = theme.c("accent") if accented else theme.c("surface")
        _card(slide, left, card_top, width, card_h, fill, theme=theme)
        title_c = theme.c("accent_text") if accented else theme.c("text")
        body_c = theme.c("accent_text") if accented else theme.c("muted")
        add_text(
            slide,
            item.get("title") or "",
            left + G.PAD,
            card_top + G.PAD + 0.18,
            width - 2 * G.PAD,
            0.42,
            theme=theme,
            size_pt=16,
            color=title_c,
            font=theme.title_font,
            bold=True,
            align="center",
        )
        add_text(
            slide,
            item.get("body") or "",
            left + G.PAD,
            card_top + G.PAD + 0.64,
            width - 2 * G.PAD,
            card_h - 2 * G.PAD - 0.64,
            theme=theme,
            size_pt=theme.pt_caption,
            color=body_c,
            align="center",
        )
    for i, _item in enumerate(items):
        left, width = tiles[i]
        cx = left + width / 2
        add_disc_label(
            slide,
            cx - disc / 2,
            rail_y - disc / 2,
            disc,
            f"{i + 1:02d}",
            theme=theme,
        )


LAYOUTS = {
    "cover": cover,
    "toc": toc,
    "section": section,
    "bullets": bullets,
    "two_column": two_column,
    "kpi_row": kpi_row,
    "icon_grid": icon_grid,
    "chart": chart,
    "quote": quote,
    "cta": cta,
    "bento": bento,
    "timeline": timeline,
}
