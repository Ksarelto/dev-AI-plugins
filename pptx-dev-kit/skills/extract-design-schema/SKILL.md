---
name: extract-design-schema
description: Analyze an existing .pptx and extract its design system — theme palette with contrast ratios, typography, canvas and grid, layout inventory — into this kit's design-schema.md format, so a new deck can be built in an existing brand's look. Use when the user supplies a reference deck, template, or brand deck to match the style of.
---

## When to use

The user supplied a `.pptx` to **match the look of**, not to edit. This replaces Station 1
(`design-schema`) in Create mode. Style values feed `deck.json`; `render_deck.py` paints new
slides. The reference is never written.

To change the file itself, use `edit-presentation`.

## Inputs

- `REFERENCE_PPTX` — path to the user's file
- `OUTPUT_DIR`
- `BRIEF`, `AUDIENCE`, `PURPOSE`, `TONE` — still needed; the reference supplies *style*, not content
- `BRAND` — if the user *also* states brand values explicitly, those win over the extracted ones
  (they know their current brand; the deck may be out of date)

## Instructions

### 1. Extract — don't eyeball it

```bash
python3 {KIT_DIR}/skills/extract-design-schema/scripts/extract_reference.py \
  "{REFERENCE_PPTX}" -o "{OUTPUT_DIR}/reference-extract.json"
```

Never infer a palette by reading slide text or guessing from a description of the deck. The theme
part holds the real values; the script resolves system colors, computes every contrast ratio, and
reports what it could not find. Read the JSON it writes.

If the script exits non-zero, relay its message — a legacy `.ppt` and an encrypted file both need
the user to re-save as `.pptx`, and nothing downstream can proceed without the extract.

### 2. Read the `signals` array first

`signals` is the script's list of things you must **not** silently inherit. Each one needs an
explicit decision recorded in the schema's notes:

| Signal | What to do |
|---|---|
| A contrast pair fails AA | **Do not copy it.** Keep the hue, darken/lighten the foreground until it passes, and note the substitution. The reference deck's accessibility bug is not a brand requirement. |
| Body/title below this kit's minimums | Keep the reference's *typeface* if it is Office-safe, raise the *size* to 18pt body / 36pt title. Note it. |
| Asymmetric margins | The reference's layouts were built for another canvas. Derive a symmetric grid from the smaller margin; don't copy placeholder boxes. |
| No theme / no fonts found | Pick Office-safe Calibri and mark Chosen — the orchestrator cannot ask the user. |

A reference deck is evidence of a brand, not an authority on quality. Inherit its identity (hue,
typeface, canvas, density); never inherit a defect.

### 3. Map the extract onto the schema's six sections

| Schema section | Source in the extract |
|---|---|
| Mood & Trend Direction | Your read of the evidence — dark vs light `dk1`/`lt1` usage, accent saturation, whitespace implied by margins, imagery counts in `usage`. State it as an inference, with what it's based on. |
| Color Palette | `theme.colors` → give each a role (background, body text, accent, secondary). Use `contrast_pairs` ratios verbatim — they are computed, not estimated. Substitute any failing pair per §2 and mark the row "adjusted from reference". |
| Typography | `theme.fonts.heading` / `.body`; sizes from `usage.title_sizes_pt` / `body_sizes_pt`, floored at the kit's 36/24pt minimums. If the reference's fonts are not system-safe, name a fallback stack. |
| Layout catalog | Map reference layouts onto this kit's **catalog** (`cover`, `toc`, `section`, `bullets`, `two_column`, `kpi_row`, `bento`, `timeline`, `icon_grid`, `chart`, `quote`, `cta`). Record which reference layout index inspired each. The new deck is still painted by `render_deck.py`, not cloned from those layouts. |
| Imagery & Iconography | Infer from `usage.pictures` / `charts` — a reference with no pictures implies a shape-and-type-driven deck. Never copy images out of the reference file. |
| Master Conventions | `geometry.slide_width_in`/`height_in` and `aspect_ratio` verbatim — **matching the reference's canvas is the single most visible way the new deck reads as "same family"**. Margins per §2. |

### 4. Note provenance

Every value in the schema is now one of three things, and the schema must say which:

- **Extracted** — read from the reference (cite it: "accent1 from reference theme")
- **Adjusted** — extracted, then changed to meet a kit minimum or WCAG AA (say what and why)
- **Chosen** — not present in the reference, decided by you (mood, archetype mapping, icon style)

Without this, nobody can tell which parts of the deck are the user's brand and which are your
invention — and the user cannot correct you.

## Output

Write `{OUTPUT_DIR}/design-schema.md` in **exactly the format `design-schema/SKILL.md` specifies** —
same six sections, same order, same table columns — plus a short **Provenance** note per §4. The
build stage cannot tell whether a schema was invented or extracted, and must not have to.

Keep `{OUTPUT_DIR}/reference-extract.json` alongside it as the audit trail.

## Checklist before returning

- [ ] Extract script ran successfully; its JSON is saved in `OUTPUT_DIR`
- [ ] Every `signals` entry has an explicit, recorded decision
- [ ] No contrast pair below AA was copied into the schema
- [ ] Canvas size and aspect ratio match the reference
- [ ] Catalog layouts listed (not the old seven Office archetypes)
- [ ] Title ≥36pt, body ≥18pt even if the reference used less
- [ ] Every value marked Extracted / Adjusted / Chosen
- [ ] The reference file itself was never modified
