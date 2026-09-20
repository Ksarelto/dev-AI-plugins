---
name: create-presentation
description: Build a complete, polished .pptx presentation from a topic or brief — design schema, slide outline, per-slide content, deck.json, and the pptx-dev-kit layout renderer. Use when asked to create a new presentation, pitch deck, or slides on a topic, including matching the style of a reference .pptx. Do not use when the user wants to edit or update an existing .pptx file in place.
---

# SKILL: create-presentation

**Invoked as**: `/pptx-dev-kit:create-presentation`
**Pipeline driver**: `pptx-orchestrator` (`MODE: Create`)
**Edit an existing file**: `/pptx-dev-kit:edit-presentation` instead

## Purpose

Turns a topic, brief, or outline into a finished `.pptx` by driving design schema → outline →
content + `deck.json` → `render_deck.py` → validate. This skill owns intake; the orchestrator
never asks the user anything.

If the user wants to **change a file they already have**, stop and use `edit-presentation`. Do not
strip that file and rebuild it.

## Prerequisites

A **topic or brief**. If the request is empty, ask:

```
I need a bit more to work with — what's the presentation about, who's the audience, and roughly
how many slides? (Defaults: professional audience, 6–12 slides, clean modern style, if you'd
rather I just pick.)
```

## Steps

### 1. Intake

Extract `BRIEF`, `AUDIENCE` (default professional), `PURPOSE`, `TONE` (default clean, modern,
confident), `SLIDE_COUNT_TARGET` (default `10–15`, or `5–8` if they said “short”), `BRAND`,
`REFERENCE_PPTX` (style only). State defaults in one line.

### 2. Output dir + python-pptx

```bash
OUTPUT_DIR="presentations/{slug}-$(date -u +%Y%m%d-%H%M%S)" && mkdir -p "$OUTPUT_DIR" && echo "$OUTPUT_DIR"
python3 -c "import pptx; print(pptx.__version__)" || python3 -m pip install python-pptx
```

Use the printed path as `OUTPUT_DIR`.

### 3. Spawn orchestrator

```
MODE: Create
BRIEF: {verbatim}
AUDIENCE: {AUDIENCE}
PURPOSE: {PURPOSE}
TONE: {TONE}
SLIDE_COUNT_TARGET: {SLIDE_COUNT_TARGET}
BRAND: {BRAND or "none"}
REFERENCE_PPTX: {absolute path or none}
OUTPUT_DIR: {printed path}
KIT_DIR: {this kit's root}
```

### 4. Report

Plan summary, outline, `{OUTPUT_DIR}/deck.pptx`, validation, 15-point checklist. Relay
`[NEEDS DATA]` prominently. On `File: NOT PRODUCED`, lead with the error.

## Re-running

Point at an existing `OUTPUT_DIR` and name the lowest station to redo (copy → content + `deck.json`
+ render; visual direction → schema through render). Foreign-file edits remain `edit-presentation`.

## Failure handling

| Scenario | Response |
|---|---|
| No topic | Ask the clarifying question. |
| User wants an existing deck edited | Hand off to `edit-presentation`. |
| Build failure | Relay stderr; offer a narrower deck. |
| Legacy `.ppt` reference | Re-save as `.pptx`, or proceed without a reference. |
