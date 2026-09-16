---
name: slide-content
description: Write the final content for one slide — assertion title, layout-specific fields (bullets, KPIs, columns, chart, quote), speaker notes, and alt text — from that slide's outline row and the deck design schema. Use when asked to write, draft, or fill in the copy or talking points for a specific presentation slide.
---

# SKILL: slide-content

## When to use

Once a slide-outline row exists. One slide at a time (in a full deck, one parallel worker per
slide).

## Inputs

- One outline row: stage, **catalog layout**, working title, content brief, data flag
- Compact schema: mood, type-scale floors, motif
- `AUDIENCE`, `TONE`
- User facts for this slide only (verbatim — never invented)

## Instructions

### 1. Title

Sharpen the working title into an assertion the supplied facts support.

### 2. Fill the fields this layout actually renders

The renderer ignores extra keys and **will not invent** a chart from a bullet list. Populate the
block that matches `layout`:

| Layout | Required fields besides Title / Notes |
|---|---|
| `cover` | Subtitle? Meta? |
| `toc` | Items: 3–6 `{title, body?}` |
| `section` | Index? Subtitle? |
| `bullets` | Body: ≤6 bullets, ≤6 words each. Optional one KPI `{value, label}` |
| `two_column` | Exactly two columns `{title, body[]}` |
| `kpi_row` | 3 or 4 `{value, label, delta?, spark?[]}` — no paragraph |
| `icon_grid` | 4 or 6 `{title, body, icon?}` |
| `bento` | 3+ KPIs (first is the hero) and a short `insight` proof line |
| `timeline` | 3–5 `{title, body}` items |
| `chart` | chart spec **and** a short `insight` takeaway |
| `quote` | `{text, attribution}` |
| `cta` | 2–4 next-step bullets, optional meta |

6×6 still applies to `bullets` and column bodies. Overflow goes to speaker notes. Two ideas →
strongest on-slide + `[CONSIDER SPLIT]`.

Never fabricate numbers. Never imply copyrighted photography.

### 3. Speaker notes

≥ 2 talking points on every slide including cover and cta.

### 4. Alt text

Required for `chart` (the takeaway, not "a column chart"). Other layouts: `Alt text: none`.

## Output

Return **exactly** this block (the orchestrator parses it into `deck.json`):

```
### Slide {N} — {layout}
Title: {assertion}
Subtitle: {or none}
Meta: {or none}
Body:
- {bullet or none}
Items:
- {title} — {body}
Columns:
- {heading}: {line; line}
KPIs:
- {value} | {label} | {delta or none}
Quote: {text} — {attribution or none}
Insight: {so-what sentence or none}
Chart: {type}; categories={a,b}; series={Name:[1,2]}; format={0}; alt={takeaway}
Speaker notes:
- {point}
- {point}
Alt text: {takeaway or none}
Flags: {[NEEDS DATA] | [CONSIDER SPLIT] | none}
```

Omit sections that the layout does not use, but never omit Title, Speaker notes, Flags, or the
layout name on the heading.

## Checklist

- [ ] Heading layout name is a catalog name
- [ ] Title is an assertion
- [ ] Layout-required fields are filled
- [ ] No fabricated data
- [ ] ≥ 2 speaker notes
- [ ] Chart alt text is a takeaway
