"""Theme view over deck.json's theme object."""

from __future__ import annotations

from . import constants as C
from .colors import contrast_ratio, normalize_hex

_REQUIRED_COLORS = (
    "bg",
    "surface",
    "text",
    "muted",
    "accent",
    "accent_text",
    "cover_bg",
    "cover_text",
)

_SAFE_FONTS = {
    "Calibri",
    "Arial",
    "Cambria",
    "Times New Roman",
    "Courier New",
    "Georgia",
    "Trebuchet MS",
    "Verdana",
    "Tahoma",
}


class Theme:
    def __init__(self, data: dict):
        if not isinstance(data, dict):
            raise ValueError("theme must be an object")
        colors = data.get("colors") or {}
        missing = [k for k in _REQUIRED_COLORS if k not in colors]
        if missing:
            raise ValueError(f"theme.colors missing keys: {', '.join(missing)}")
        self.colors = {k: normalize_hex(colors[k], field=f"colors.{k}") for k in _REQUIRED_COLORS}
        for extra, value in colors.items():
            if extra not in self.colors:
                self.colors[extra] = normalize_hex(value, field=f"colors.{extra}")

        fonts = data.get("fonts") or {}
        self.title_font = fonts.get("title") or "Calibri"
        self.body_font = fonts.get("body") or "Calibri"

        canvas = data.get("canvas") or {}
        self.sw = float(canvas.get("width_in") or C.SW)
        self.sh = float(canvas.get("height_in") or C.SH)

        scale = data.get("type_scale_pt") or {}
        self.pt_cover = int(scale.get("cover") or 52)
        self.pt_title = int(scale.get("title") or 36)
        self.pt_subtitle = int(scale.get("subtitle") or 20)
        self.pt_body = int(scale.get("body") or 18)
        self.pt_caption = int(scale.get("caption") or 12)
        self.pt_kpi = int(scale.get("kpi") or 44)

        footer = data.get("footer") or {}
        self.footer_text = footer.get("text") or ""
        self.show_on_cover = bool(footer.get("show_on_cover", False))

        self._assert_contrast()

    def _assert_contrast(self) -> None:
        pairs = [
            ("text", "bg", 4.5),
            ("text", "surface", 4.5),
            ("accent_text", "accent", 3.0),
            ("cover_text", "cover_bg", 4.5),
            ("muted", "bg", 3.0),
        ]
        failures = []
        for fg_key, bg_key, floor in pairs:
            ratio = contrast_ratio(self.colors[fg_key], self.colors[bg_key])
            if ratio < floor:
                failures.append(
                    f"{fg_key} on {bg_key} = {ratio}:1 (need {floor}:1)"
                )
        if failures:
            raise ValueError("theme fails WCAG AA: " + "; ".join(failures))

    def c(self, key: str) -> str:
        if key not in self.colors:
            raise KeyError(f"unknown theme color {key!r}")
        return self.colors[key]
