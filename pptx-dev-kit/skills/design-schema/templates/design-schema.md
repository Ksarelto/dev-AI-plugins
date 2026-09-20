# Template: design-schema.md

Written to `{OUTPUT_DIR}/design-schema.md`. Keep under ~150 lines. Hex is 6 digits, no `#`.

```markdown
# Design schema — {deck title}

## Mood & Trend Direction
- Mood: {Bold minimalism | Dark-mode / moody | Bright / joyful | Corporate-safe}
- Why: {one sentence from PURPOSE + AUDIENCE + TONE}
- Motif: {rounded cards | icon discs | left color panel} — not an accent underline under titles

## Color Palette

| Name | Hex | Role | Paired with | Contrast |
|------|-----|------|-------------|----------|
| Cover | {cover_bg} | cover_bg | cover_text | {computed}:1 |
| Cover text | {cover_text} | cover_text | cover_bg | {computed}:1 |
| Background | {bg} | bg | text | {computed}:1 |
| Surface | {surface} | surface | text | {computed}:1 |
| Text | {text} | text | bg, surface | {computed}:1 |
| Muted | {muted} | muted | bg | {computed}:1 |
| Accent | {accent} | accent | accent_text | {computed}:1 |
| Accent text | {accent_text} | accent_text | accent | {computed}:1 |

All ratios computed with the WCAG snippet, not estimated. Brand hex overrides defaults.

## Typography
- Title font: {Calibri | Cambria | user brand} — never Inter/Söhne/Aptos unless the user named it
- Body font: {Calibri | Arial | user brand}
- Scale (pt): cover {48–56} / title {36–40} / subtitle {18–22} / body {18–24} / caption {12} / kpi {40–48}

## Layout catalog
Use only: cover, toc, section, bullets, two_column, kpi_row, bento, timeline, icon_grid, chart, quote, cta.
Grid: 12 columns on 13.333 × 7.5 in; margin 0.50; gutter 0.22; pad 0.26.

## Imagery & Iconography
- Icons: disc + 1–2 character label (no clip art, no fabricated photos)
- Charts: 2-D, palette series colors, alt text is the takeaway

## Master Conventions
- Canvas: 13.333 × 7.5 in (16:9)
- Footer: "{short title}"
- Page badge: accent disc, skip on cover
- Sandwich: dark cover + cta; light content slides (or dark throughout)
```
