---
name: validate-pptx
description: Programmatically validate a .pptx file after generate or edit — zip integrity, 16:9 canvas, slide count, ghost placeholders, leftover lorem copy, font floors, picture and chart alt text, on-canvas shapes, speaker notes, unique slide-number GUIDs, well-formed XML. Use after build-pptx or edit-presentation before handing the file over.
---

# SKILL: validate-pptx

## When to use

Immediately after `render_deck.py` or `pack_pptx.py` writes `deck.pptx`. Do not skip.

## Inputs

- `{OUTPUT_DIR}/deck.pptx`
- `expected_slide_count` when known
- `--allow-ratio` in Edit mode if the source canvas is not 16:9 on purpose

## Instructions

```bash
python3 {KIT_DIR}/skills/validate-pptx/scripts/validate_deck.py \
    {OUTPUT_DIR}/deck.pptx \
    --expected-slides {expected_slide_count}
```

| Exit | Action |
|------|--------|
| 0 | Proceed to the quality checklist |
| 1 | Fix named ERRORs (re-render or re-pack), one retry |
| 2 | Build-failure packet |

Create-mode 4:3 canvas is an **ERROR** (the old default-template leak). Edit mode that keeps a
foreign canvas may pass `--allow-ratio`.

Shapes past the canvas by more than 1 in are ERRORS, not warnings. Charts need `descr` alt text,
not only pictures. Leftover `Click to add`, `lorem`/`ipsum`, or `PLACEHOLDER` (except
`[PLACEHOLDER — replace with actual data]`) is an ERROR.

## Output

Put the validator stdout in the REVIEW_PACKET `Validation:` line.
