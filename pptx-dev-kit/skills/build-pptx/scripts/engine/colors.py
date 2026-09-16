"""Hex colors for python-pptx. 6 digits, no hash — a leading # is rejected, not stripped silently."""

from __future__ import annotations

import re

from pptx.dml.color import RGBColor

_HEX = re.compile(r"^[0-9A-Fa-f]{6}$")


def normalize_hex(value: str, *, field: str = "color") -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a 6-digit hex string, got {type(value).__name__}")
    raw = value.strip()
    if raw.startswith("#"):
        raise ValueError(
            f"{field}={value!r} includes '#'; deck.json hex must be 6 digits with no hash"
        )
    if len(raw) == 8:
        raise ValueError(
            f"{field}={value!r} is 8 digits; do not bake alpha into hex"
        )
    if not _HEX.fullmatch(raw):
        raise ValueError(f"{field}={value!r} is not a 6-digit hex color")
    return raw.upper()


def rgb(value: str, *, field: str = "color") -> RGBColor:
    h = normalize_hex(value, field=field)
    return RGBColor(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def relative_luminance(hex_color: str) -> float:
    h = normalize_hex(hex_color)
    channels = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    linearized = [
        c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in channels
    ]
    return 0.2126 * linearized[0] + 0.7152 * linearized[1] + 0.0722 * linearized[2]


def contrast_ratio(fg: str, bg: str) -> float:
    a, b = sorted((relative_luminance(fg), relative_luminance(bg)), reverse=True)
    return round((a + 0.05) / (b + 0.05), 2)
