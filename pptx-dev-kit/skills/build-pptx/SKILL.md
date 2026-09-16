---
name: build-pptx
description: Render a finished deck.json into a .pptx with the pptx-dev-kit layout engine — never write a new python-pptx script. Use when asked to generate, export, render, or produce the PowerPoint file from planned slide content and a design schema.
---

# SKILL: build-pptx

**Invoked as**: `/pptx-dev-kit:build-pptx`
**Reads**: [`references/python-pptx-recipes.md`](references/python-pptx-recipes.md) for traps only
**Runs**: `{KIT_DIR}/skills/build-pptx/scripts/render_deck.py`

## When to use

Last create-mode stage — after `design-schema.md`, `slide-outline.md`, `slide-content.md`, and
**`deck.json`** exist. This skill is mechanical: it does not choose colors, layouts, or wording.

Do **not** use this skill to edit an existing deck. That is `edit-presentation`.

## Inputs

- `{OUTPUT_DIR}/deck.json` — load-bearing. Must pass `validate_deck_json.py`.
- `OUTPUT_DIR`
- `KIT_DIR`

A reference `.pptx` is **not** an input here. Style-matched create already baked extracted colors
and fonts into `deck.json`. Do not open the reference, strip its slides, or paint onto its master.

## Standards (non-negotiable)

- **Run the checked-in renderer.** Do not author `{OUTPUT_DIR}/_build/build_deck.py`. Do not map
  slides onto Title and Content / Two Content / Title Only. Those layouts are 4:3 leftovers.
- Canvas is **13.333 × 7.5 in**. Hex colors are **6 digits, no `#`**.
- Layout names are the catalog in `docs/pptx/layouts.md`: `cover`, `toc`, `section`, `bullets`,
  `two_column`, `kpi_row`, `bento`, `timeline`, `icon_grid`, `chart`, `quote`, `cta`.
- Alt text for charts is `chart.alt` in JSON (written as `descr` by the renderer). Never
  `pic.alt_text = …`.
- Unsupported: embedded video, morph, VBA, custom masters. State the gap; do not fake it.

## Instructions

### 0. Dependency

```bash
python3 -c "import pptx; print(pptx.__version__)" || python3 -m pip install python-pptx
```

### 1. Validate JSON

```bash
python3 {KIT_DIR}/skills/build-pptx/scripts/validate_deck_json.py {OUTPUT_DIR}/deck.json
```

On failure, fix `deck.json` (hex, layout names, required fields). Do not patch the renderer.

### 2. Render

```bash
python3 {KIT_DIR}/skills/build-pptx/scripts/render_deck.py \
    {OUTPUT_DIR}/deck.json \
    -o {OUTPUT_DIR}/deck.pptx
```

If the renderer raises a theme contrast error, adjust the failing pair in `deck.json` and retry
once.

### 3. Confirm

The script re-opens the file and prints `OK: … (N slides)`. Then run `validate-pptx`.

## Checklist before returning

- [ ] `validate_deck_json.py` exited 0
- [ ] `render_deck.py` exited 0 and `deck.pptx` exists
- [ ] No new build script was written
- [ ] Reference file (if any) was not opened for writing
