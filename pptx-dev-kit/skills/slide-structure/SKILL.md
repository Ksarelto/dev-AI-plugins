---
name: slide-structure
description: Turn a topic/brief and a design schema into a full slide-by-slide outline — narrative arc, catalog layout per slide, and an assertion-style working title. Use when asked to outline, storyboard, or plan the structure of a presentation before full slide content is written.
---

# SKILL: slide-structure

## When to use

After a design schema exists, before per-slide copy. Decides *what goes where*, not the final words.

## Inputs

- `BRIEF`, `AUDIENCE`, `PURPOSE`, `SLIDE_COUNT_TARGET`
- `design-schema.md` — mood line + the catalog names. Not the full palette.

## Instructions

### 1. Narrative arc

| Purpose | Arc |
|---|---|
| Pitch / investor | Hook → Problem → Solution → Evidence → Ask |
| Report / update | Context → Findings → Implications → Recommendation |
| Training / how-to | Objective → Concept → Example → Practice → Summary |
| Keynote | Hook → Tension → Reframe → Proof → Call-to-action |

Open on a hook. Close on a CTA. Never end mid-argument.

### 2. Slide count

Honor `SLIDE_COUNT_TARGET`. Default 10–15 for a full deck; a "short update" may be 5–8. Insert a
`section` slide every 3–5 content slides when the deck is **> 12**. Skip `toc` on decks shorter
than 8 slides unless the user asked for an agenda.

### 3. Assign layouts

Every row uses **one** catalog name:

`cover` | `toc` | `section` | `bullets` | `two_column` | `kpi_row` | `bento` | `timeline` | `icon_grid` | `chart` | `quote` | `cta`

| If the slide is… | Prefer |
|---|---|
| Opening | `cover` (slide 1 only) |
| Agenda | `toc` |
| One headline number plus two supports | `bento` |
| Three or four equal stats | `kpi_row` |
| A journey / sequence / process | `timeline` |
| Capabilities / principles | `icon_grid` (4 or 6 items) |
| Compare / before-after | `two_column` |
| One chart plus the so-what | `chart` |
| Pull-quote | `quote` |
| One idea with a short list | `bullets` |
| Narrative break | `section` |
| The ask | `cta` (last slide only) |

Do **not** map onto Office layout names (Title Slide, Title and Content). Those are not catalog
names and the renderer will reject them.

Working titles are **assertions** ("Activation rose after the inbox launch"), not labels
("Activation"). Mark `[NEEDS DATA]` when a number is required and missing — never invent it.

### 4. Validate the outline

- Slide 1 is `cover`. Last slide is `cta`. Exactly one of each.
- One core idea per row. Split if the brief holds two.
- Adjacent **content** slides (not cover/toc/section/cta) do not share a layout unless they are a
  chart comparison pair.
- Count within ±20% of a numeric target, or inside a range.

## Output

`{OUTPUT_DIR}/slide-outline.md` as the table in
[`templates/slide-outline.md`](templates/slide-outline.md), plus a one-line arc note.

## Checklist

- [ ] Arc stated; every row tagged with a stage
- [ ] Catalog layout names only
- [ ] Assertion titles
- [ ] Cover first, CTA last
- [ ] `[NEEDS DATA]` where facts are missing
