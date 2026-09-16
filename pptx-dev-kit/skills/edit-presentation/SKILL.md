---
name: edit-presentation
description: Edit or update an existing PowerPoint .pptx in place — change slide copy, add or delete or reorder slides, fill a template — via OOXML unpack/clone/replace/pack without flattening formatting. Use when the user already has a .pptx and wants it modified, not when they want a new deck generated from a brief.
---

# SKILL: edit-presentation

**Invoked as**: `/pptx-dev-kit:edit-presentation`
**Pipeline driver**: `pptx-orchestrator` with `MODE: Edit`
**Upstream**: `docs/pptx/editing.md`

## When to use

The user has a `.pptx` and wants it **changed**: rewrite a title, swap numbers, add a slide,
drop a slide, reorder, fill placeholder copy in a template. The original file is copied, never
overwritten.

A new deck from a topic, even “in the style of this file,” is `create-presentation` — not this
skill.

## Inputs (from the user)

- `SOURCE_PPTX` — path to the existing file (required)
- `EDIT_INSTRUCTIONS` — what to change
- Optional: which slide numbers, replacement text, whether to add/delete/reorder

If the path is missing, ask for it. Do not invent a new deck instead.

## Steps

### 1. Scaffold

```bash
OUTPUT_DIR="presentations/{slug}-$(date -u +%Y%m%d-%H%M%S)" && mkdir -p "$OUTPUT_DIR" && echo "$OUTPUT_DIR"
cp "{SOURCE_PPTX}" "$OUTPUT_DIR/source.pptx"
```

Never write `SOURCE_PPTX`. Confirm python-pptx:

```bash
python3 -c "import pptx; print(pptx.__version__)" || python3 -m pip install python-pptx
```

### 2. Spawn the orchestrator

```
MODE: Edit
SOURCE_PPTX: {absolute path to OUTPUT_DIR/source.pptx}
EDIT_INSTRUCTIONS: {verbatim}
OUTPUT_DIR: {printed path}
KIT_DIR: {kit root}
```

Wait for the REVIEW_PACKET.

### 3. Report

Relay Mode: Edit, what changed, `{OUTPUT_DIR}/deck.pptx`, and validation. If the file could not
be packed, report the verbatim error and list artifacts that did complete.

## Failure handling

| Scenario | Response |
|---|---|
| No source file | Ask for the `.pptx` path. |
| Legacy `.ppt` | Must be re-saved as `.pptx` first. |
| User also wants a new visual system | That is Create (style-matched), not Edit. Say so. |
| Chart on a cloned slide | Clones share chart parts — do not edit chart XML on the clone if the source must keep original data. |
