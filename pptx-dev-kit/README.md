# PPTX Presentation Dev Kit

**Create**: `/pptx-dev-kit:create-presentation` → `skills/create-presentation/SKILL.md`  
**Edit**: `/pptx-dev-kit:edit-presentation` → `skills/edit-presentation/SKILL.md`

**Requires**: `python3` with `python-pptx` (installed on demand; brings Pillow and lxml).

Create paints a 16:9 deck with a **checked-in layout engine** (`render_deck.py`) from `deck.json`.
Edit unpacks an existing `.pptx`, mutates OOXML, and packs it back. Neither path invents a
python-pptx script at run time.

Upstream docs: [docs/pptx/](../docs/pptx/README.md).

---

## How to use

**New deck**

1. `/pptx-dev-kit:create-presentation` with a topic (audience, purpose, slide count, brand — defaults stated).
2. Get a Plan Summary, outline, `{OUTPUT_DIR}/deck.pptx`, and a quality checklist.

**Existing file**

1. `/pptx-dev-kit:edit-presentation` with the `.pptx` path and what to change.
2. The original is copied; `{OUTPUT_DIR}/deck.pptx` is the edited result.

---

## Directory layout

```
pptx-dev-kit/
  README.md
  agents/
    pptx-orchestrator.md             ← opus | Create or Edit; never asks the user
    slide-content-writer.md          ← sonnet | one instance per slide (Create Station 3)
  skills/
    create-presentation/             ← Create entry
    edit-presentation/               ← Edit entry + OOXML scripts
    design-schema/
    extract-design-schema/           ← style-matched Create only
    slide-structure/
    slide-content/
    build-pptx/
      scripts/render_deck.py         ← the renderer — do not replace with a generated script
      scripts/layouts.py             ← 12-column recipes (cover, bento, timeline, chart+takeaway, …)
      fixtures/sample-deck.json
    validate-pptx/
      scripts/validate_deck.py
```

---

## Pipeline overview

```
Create:  brief [+ optional reference for style]
           → design-schema.md → slide-outline.md → slide-content.md + deck.json
           → render_deck.py → deck.pptx → validate_deck.py → REVIEW_PACKET

Edit:    source.pptx + instructions
           → copy → inspect → unpack → clone/delete/reorder → replace_runs
           → pack → deck.pptx → validate_deck.py → REVIEW_PACKET
```

A reference `.pptx` in Create supplies **colors and fonts** for `deck.json`. Slides are still
painted by the layout engine. Filling or rewriting the file itself is Edit.

---

## Scope

- Canvas locked to **13.333 × 7.5 in**. Office-safe fonts (Calibri / Arial / Cambria) unless brand
  names a typeface.
- No custom PowerPoint masters (python-pptx cannot create them).
- No animations, morph, embedded video, or VBA.
- Never write the user's original file.
