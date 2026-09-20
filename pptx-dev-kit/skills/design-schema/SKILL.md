---
name: design-schema
description: Produce a cohesive, modern presentation design schema — WCAG AA palette, Office-safe typography, and the pptx-dev-kit layout catalog — tailored to a topic, audience, and tone. Use when asked to design the visual direction, mood board, theme, or brand system for a slide deck before any slide content is written.
---

# SKILL: design-schema

Distilled from `docs/pptx/layouts.md`. Full reasoning lives there.

## When to use

Before any slide content exists, when the visual direction has to be **invented**. If the user
supplied a reference `.pptx` to match, use `extract-design-schema` instead.

This file is the visual source of truth for `deck.json` theme keys. Downstream stages do not invent
colors or fonts once it exists.

## Inputs

- `BRIEF` / topic, `AUDIENCE`, `PURPOSE`, `TONE`
- `BRAND` — hex / font names / logo. These **override** every default.

## Instructions

### 1. Mood

Pick one: Bold minimalism | Dark-mode / moody | Bright / joyful | Corporate-safe. State why from
PURPOSE + AUDIENCE + TONE. Pick **one** motif (rounded cards, icon discs, or a left color panel).
Do **not** use a thin accent underline under titles.

### 2. Color palette

Fill every `deck.json` theme key: `bg`, `surface`, `text`, `muted`, `accent`, `accent_text`,
`cover_bg`, `cover_text`. Hex is **6 digits, no `#`**.

If `BRAND` is given, derive the rest from it; otherwise pick for the topic (do not default to
generic blue). Compute WCAG AA for every pairing that will appear (body 4.5:1, large 3:1) with:

```python
def ratio(h1, h2):
    def lum(h):
        c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
        c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    a, b = sorted((lum(h1), lum(h2)), reverse=True)
    return round((a + 0.05) / (b + 0.05), 2)
```

Reject failing pairs. Default sandwich: dark `cover_bg` + `cta`, light content `bg`.

### 3. Typography

Office-safe defaults: **Calibri** title and body (Cambria title if the mood wants a serif). Do not
default to Inter, Söhne, or Aptos. User brand fonts are allowed with extra box slack.

Scale: cover 48–56 / title 36–40 / subtitle 18–22 / body 18–24 (24 preferred live, 18 floor) /
caption 12 / kpi 40–48.

### 4. Layout catalog

The renderer implements **exactly** these names. Do not invent another:

`cover`, `toc`, `section`, `bullets`, `two_column`, `kpi_row`, `bento`, `timeline`, `icon_grid`, `chart`, `quote`, `cta`

State the locked canvas **13.333 × 7.5 in**, margin 0.50 in, gutter 0.22 in, and that every content slide uses a
surface card or equivalent visual (title + naked bullets is not finished).

### 5. Imagery

Disc-and-label icons, 2-D charts, no fabricated photos. User-supplied images only if they exist on
disk.

### 6. Master conventions

Footer text, page badge (skip on cover), sandwich or all-dark. Footer/badge are drawn by the
renderer, not by PowerPoint placeholders.

## Output

Write `{OUTPUT_DIR}/design-schema.md` using
[`templates/design-schema.md`](templates/design-schema.md). Same six sections, computed contrast
table, hex without `#`.

## Checklist

- [ ] Every listed pair has a **computed** AA-passing ratio
- [ ] Theme keys for `deck.json` are all present
- [ ] Fonts are Office-safe or user-supplied
- [ ] Catalog named, canvas 13.333 × 7.5 in
- [ ] Motif stated; no title underlines
