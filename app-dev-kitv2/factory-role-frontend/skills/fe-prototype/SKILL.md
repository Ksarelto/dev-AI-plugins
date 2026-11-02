---
name: fe-prototype
description: Procedure for the factory prototyper — build one screen page of the living app prototype in static HTML with a data-state block per story state, using only the designer's shared CSS and JS, then write the screen note with the ACs shown and the spec deltas for GATE-P. Preloaded by the prototyper; not for direct use.
user-invocable: false
---

# Prototype one screen (S2.5, fan-out)

Runs on: prototyper (sonnet) — one dispatch per screen the prototype-designer marked added or changed; several run in parallel, each writing one page and one note.

The page makes the spec understandable: a person clicks through it at GATE-P and sees what will be
built. Clear, not polished. You write exactly two files —
`.factory/prototype/pages/<id>.html` and `<feature>/02b-prototype/screens/<id>.yaml` — and nothing
else; other screens are built at the same time by other dispatches.

| Topic | Reference |
|---|---|
| The page template and the per-page gate rules | [proto-page-shell.md](references/proto-page-shell.md) |
| States, lists and filters, modals, forms with Alpine | [proto-alpine-patterns.md](references/proto-alpine-patterns.md) |
| Links, placeholders, actions, which ACs are "shown" | [proto-interactions.md](references/proto-interactions.md) |
| Landmarks, labels, focus, dialogs, contrast | [proto-accessibility.md](references/proto-accessibility.md) |
| Everything gate-proto checks, and who owns it | [proto-qa-checklist.md](references/proto-qa-checklist.md) |
| Classifying spec deltas and `breaking` | [proto-spec-delta.md](references/proto-spec-delta.md) |

## 1. Orient

1. **T0.** The mission names your screen id, the two files you write, and the exit check
   `gate proto … --screen <id>`. T3 on a retry lists your page's or note's failures: fix only those.
2. **Your contract — `screens.yaml`.** Read your screen's entry: `title`, `surface`, `page_type`,
   `entity`, `stories`, `states`, `status`, `nav`. Note which other screens are live (you may link
   them) and which are placeholders (never link them).
3. **The designer's shared files.** `design-brief.md` (layout, composition line for your page type,
   copy tone), `css/components.css` (the class vocabulary you may use), `js/data.js` (your entity's
   data block and its field names). Skim; do not edit.
4. **The spec (T2).** Your stories with their Gherkin, the UX notes section for your surface, the
   ACs' exact text (amounts, messages, limits). The designer's report for spec deltas already
   recorded.
5. **A `changed` screen.** Read the existing `pages/<id>.html` first and change only what this
   feature's stories need; keep its other states, copy and structure.

## 2. Build the page

1. Start from the shell in [proto-page-shell.md](references/proto-page-shell.md), or copy the shell
   of an existing page so every page matches: same head, scripts, layout, brand.
2. Set `<title>`, `<body data-screen="<id>">`, the page header (breadcrumb, `<h1>`, primary action),
   `x-data="<Entity>Data"` on `<main>` when it uses data, `data-initial-state` (the success view).
3. One `<section data-state="<name>">` per entry of your screen's `states`, spelled exactly, as
   siblings inside `<main>`. Each is the whole content area in that state, with the exact values from
   the ACs. Composition follows the brief's line for your `page_type`
   (list: filter bar + table; detail: summary + form; form: one column).
4. Interactions where the stories have them: forms with `required` + submit, confirm modals with
   `data-modal-open` / `data-modal-close`, lists over `filtered`, toasts for success
   ([proto-alpine-patterns.md](references/proto-alpine-patterns.md),
   [proto-interactions.md](references/proto-interactions.md)).
5. The empty `<div class="dev-panel" role="toolbar" aria-label="Prototype states"></div>` last
   inside `<main>`; `app.js` fills it.
6. Accessibility per [proto-accessibility.md](references/proto-accessibility.md).

Hard limits: no `<style>`, no inline `<script>` over 20 characters, no `style=` attributes, no raw
colours, no class outside the vocabulary, no chart library, no new dependency, no Lorem/TODO text,
no link to a placeholder or a missing page.

When the CSS lacks something the screen needs (a two-column summary, a stepper), use the closest
existing class and list the missing class with what it should do in the note's `needs_classes`
(`"summary-grid: two columns, summary left at 20rem"`). The designer adds it on a revision; you never
write CSS.

## 3. Write the note (`02b-prototype/screens/<id>.yaml`)

```yaml
screen: checkout-summary
stories: [STORY-0001, STORY-0002]
states: [empty, applied, invalid, loading]
acs_shown: [AC-0001, AC-0002, AC-0003]
spec_delta:
  - { change: "No AC says whether the coupon field stays visible after a coupon is applied; the page hides it", kind: discovered, breaking: false, affects: [STORY-0001] }
needs_classes: []
notes: "Reorder links to order-history, which is a placeholder: shown as a button with a 'not prototyped yet' toast."
```

- `screen` equals your id (gate-proto finds the note by it); `stories` and `states` as built.
- `acs_shown`: the AC ids a person can see or try on the page ([proto-interactions.md](references/proto-interactions.md)).
- `spec_delta`: what building the page taught you, classified per
  [proto-spec-delta.md](references/proto-spec-delta.md); `[]` when nothing. A state you had to add
  beyond `states` is a `discovered` delta.
- Only these keys: the note's schema rejects any other (it is validated when you write it).

## 4. Exit check

Run `gate proto … --screen <id>` from T0. It checks your note (present, schema-valid), your page
(exists, every state block, dev-panel, `<main>`, no inline style or script; warnings for nav labels,
modal close hooks, form checks, chart libraries, `<title>`, placeholder text) and that no removed
page is left. Fix every blocking line on your two files. A failure in a shared file or
`screens.yaml` is the designer's: report it in the summary and in `needs_classes` / `notes`; do not
work around it. Links to other screens being built now resolve once their prototypers finish; the
full gate checks dead links after the fan-out.

## 5. Envelope

`artifacts_written`: your page and your note. `summary`: the states built, the ACs shown, the deltas
(and which are breaking), any `needs_classes`, any problem in shared files. `status`: `done`;
`needs_clarification` only when the stories contradict each other so the page cannot show either
(record the delta as well); `needs_scope_change` if the work needs a file other than your two.
