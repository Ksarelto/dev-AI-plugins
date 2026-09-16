#!/usr/bin/env python3
"""Validate deck.json before render_deck.py. Stdlib only — no jsonschema package."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

LAYOUTS = {
    "cover",
    "toc",
    "section",
    "bullets",
    "two_column",
    "kpi_row",
    "icon_grid",
    "chart",
    "quote",
    "cta",
    "bento",
    "timeline",
}
COLOR_KEYS = (
    "bg",
    "surface",
    "text",
    "muted",
    "accent",
    "accent_text",
    "cover_bg",
    "cover_text",
)
HEX = re.compile(r"^[0-9A-Fa-f]{6}$")
CHART_TYPES = {"column", "bar", "line", "pie", "doughnut"}


def _err(errors, msg):
    errors.append(msg)


def validate_deck(doc: dict) -> list[str]:
    errors: list[str] = []
    if not isinstance(doc, dict):
        return ["deck.json must be an object"]
    theme = doc.get("theme")
    if not isinstance(theme, dict):
        _err(errors, "theme is required")
        return errors
    fonts = theme.get("fonts") or {}
    if not fonts.get("title") or not fonts.get("body"):
        _err(errors, "theme.fonts.title and theme.fonts.body are required")
    colors = theme.get("colors") or {}
    for key in COLOR_KEYS:
        value = colors.get(key)
        if value is None:
            _err(errors, f"theme.colors.{key} is required")
            continue
        if not isinstance(value, str):
            _err(errors, f"theme.colors.{key} must be a string")
            continue
        if value.startswith("#"):
            _err(errors, f"theme.colors.{key} must not include '#'")
        elif len(value) == 8:
            _err(errors, f"theme.colors.{key} must not bake alpha into hex")
        elif not HEX.fullmatch(value):
            _err(errors, f"theme.colors.{key}={value!r} is not 6-digit hex")
    slides = doc.get("slides")
    if not isinstance(slides, list) or not slides:
        _err(errors, "slides must be a non-empty array")
        return errors
    for i, slide in enumerate(slides, 1):
        if not isinstance(slide, dict):
            _err(errors, f"slide {i} must be an object")
            continue
        layout = slide.get("layout")
        if layout not in LAYOUTS:
            _err(errors, f"slide {i}: unknown layout {layout!r}")
            continue
        if layout != "quote" and not (slide.get("title") or "").strip():
            _err(errors, f"slide {i} ({layout}): title is required")
        if layout == "two_column" and len(slide.get("columns") or []) != 2:
            _err(errors, f"slide {i}: two_column needs exactly 2 columns")
        if layout == "kpi_row":
            n = len(slide.get("kpis") or [])
            if n < 3 or n > 4:
                _err(errors, f"slide {i}: kpi_row needs 3 or 4 kpis, got {n}")
        if layout == "icon_grid":
            n = len(slide.get("items") or [])
            if n not in (4, 6):
                _err(errors, f"slide {i}: icon_grid needs 4 or 6 items, got {n}")
        if layout == "bento":
            n = len(slide.get("kpis") or [])
            if n < 3:
                _err(errors, f"slide {i}: bento needs at least 3 kpis (hero + 2), got {n}")
        if layout == "timeline":
            n = len(slide.get("items") or [])
            if n < 3 or n > 5:
                _err(errors, f"slide {i}: timeline needs 3–5 items, got {n}")
        if layout == "chart":
            chart = slide.get("chart") or {}
            if chart.get("type") not in CHART_TYPES:
                _err(errors, f"slide {i}: chart.type must be one of {sorted(CHART_TYPES)}")
            if not chart.get("categories") or not chart.get("series"):
                _err(errors, f"slide {i}: chart needs categories and series")
            elif chart.get("type") in {"pie", "doughnut"} and len(chart.get("series") or []) != 1:
                _err(errors, f"slide {i}: pie/doughnut needs exactly one series")
            if not (chart.get("alt") or "").strip():
                _err(errors, f"slide {i}: chart.alt (takeaway) is required")
        if layout == "quote" and not ((slide.get("quote") or {}).get("text")):
            _err(errors, f"slide {i}: quote.text is required")
        if layout == "cover" and not (slide.get("title") or "").strip():
            _err(errors, f"slide {i}: cover title is required")
    if slides[0].get("layout") != "cover":
        _err(errors, "slide 1 must use layout cover")
    if slides[-1].get("layout") != "cta":
        _err(errors, "last slide must use layout cta")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate pptx-dev-kit deck.json")
    parser.add_argument("path", help="Path to deck.json")
    args = parser.parse_args()
    path = Path(args.path)
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        print(f"ERROR: file not found: {path}", file=sys.stderr)
        return 2
    except json.JSONDecodeError as exc:
        print(f"ERROR: invalid JSON: {exc}", file=sys.stderr)
        return 1
    errors = validate_deck(doc)
    if errors:
        for e in errors:
            print(f"ERROR: {e}")
        return 1
    print(f"OK: {path} ({len(doc['slides'])} slides)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
