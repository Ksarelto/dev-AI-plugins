# python-pptx traps (renderer internals)

The kit **does not** ask you to write a build script. `scripts/render_deck.py` already uses the
snippets below. Read this when changing the renderer, or when an error names one of these APIs.

Verified against python-pptx 1.0.x.

## Traps

| What looks right | What actually happens | Use instead |
|---|---|---|
| `pic.alt_text = "…"` | Silent no-op; XML `descr` stays empty | `shape._element._nvXxPr.cNvPr.set("descr", text)` |
| `prs.slide_layouts.add_layout(...)` | No such API | Paint on the Blank layout |
| Map archetypes to Title and Content (idx 1) | Placeholders stay 4:3-sized on a 16:9 canvas | Absolute shapes in `layouts.py` |
| `text_frame.text = "…"` on an existing styled slide | Flattens every run in the paragraph | Edit mode: `run.text` / `replace_runs.py` |
| Layout FOOTER / SLIDE_NUMBER placeholders | Not cloned onto new slides | `engine/chrome.py` draws a badge per slide |
| Leaving unused placeholders | "Click to add text" ghosts | `drop_empty_placeholders` after painting |
| Hex with `#` or 8 digits | Corrupt or rejected | 6-digit hex in `deck.json` |
| Grepping the `.pptx` bytes | It is a zip | `zipfile.ZipFile(...).read("ppt/slides/slide1.xml")` |

## Canvas

Always 13.333 × 7.5 in, set **before** any slide is added. Snap to whole EMUs (`engine.grid.emu_length`)
so 13.333 does not truncate below 12,192,000 EMU.

Do not mix with PptxGenJS `LAYOUT_16x9` (10 × 5.625).

## Blank layout

```python
def blank_layout(prs):
    for layout in prs.slide_layouts:
        if (layout.name or "").strip().lower() == "blank":
            return layout
    return prs.slide_layouts[6]
```

## Alt text

```python
def set_alt_text(shape, text):
    shape._element._nvXxPr.cNvPr.set("descr", text)
```

## Empty placeholders

```python
def drop_empty_placeholders(slide):
    for ph in list(slide.placeholders):
        if ph.has_text_frame and not ph.text_frame.text.strip():
            ph._element.getparent().remove(ph._element)
```

## Charts

2-D only (`COLUMN_CLUSTERED`, `BAR_CLUSTERED`, `LINE`, `PIE`, `DOUGHNUT`). Set series fills from
the theme palette. `legend.include_in_layout = False`. Alt text on the graphic frame.

## What python-pptx will not do

- Create a master or a custom slide layout
- Duplicate, delete, or reorder slides (Edit mode uses OOXML helpers)
- Preserve run formatting through `text_frame.text =`
- Read many SVG/EMF images (`add_picture` raises `UnidentifiedImageError`)
