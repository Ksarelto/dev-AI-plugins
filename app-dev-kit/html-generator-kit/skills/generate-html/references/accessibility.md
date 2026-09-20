# Accessibility Rules — html-generator-kit

WCAG 2.2 AA baseline every generated page must meet. Read by `screen-generator` and enforced by
`qa-validator`. Keep it mechanical — these are pass/fail rules, not guidance.

---

## Landmarks & structure

- Exactly one `<main>` landmark per page; primary page content lives inside it.
- Sidebar navigation wrapped in `<nav aria-label="Main navigation">`.
- Breadcrumb wrapped in `<nav aria-label="Breadcrumb">`.
- One `<h1>` per page (the page title). Do not skip heading levels.

## Interactive elements

- Every icon-only button has an `aria-label` describing its action (e.g. `aria-label="Delete note"`).
- Buttons that only contain an emoji count as icon-only — they REQUIRE `aria-label`.
- Links that navigate use `<a href>`; actions that mutate state use `<button>`. Never a bare
  `<div @click>` for a primary action.
- All actions must be reachable and operable by keyboard alone (native `<button>`/`<a>`/`<input>`
  give this for free — do not suppress it).

## Forms

- Every input has a programmatic label: a `<label>` (preferred) or an `aria-label`.
- Placeholder text is NOT a label — it may accompany a label but never replace it.
- Error messages use `role="alert"` or are referenced via `aria-describedby`.

## Data tables (div-grid pattern)

- Table container: `role="grid"` (or `role="table"`) + `aria-label`.
- Header row: `role="row"`; header cells `role="columnheader"` + `scope="col"`.
- Body rows: `role="row"`; cells `role="gridcell"`.

## State regions

- Loading region: `role="status"` + `aria-label="Loading …"`.
- Error region: `role="alert"`.
- Toast container: `aria-live="polite"`.

## Modals / dialogs

- `role="dialog"` + `aria-modal="true"` + `aria-labelledby` pointing at the title id.
- Focus trapped while open (`x-trap` from `@alpinejs/focus`).
- `Escape` closes the dialog (`@keydown.escape`).
- Rendered inside an overlay that is only present while open (`x-show`).

## Colour & contrast

- Never rely on colour alone to convey status — pair a badge colour with its text label.
- Use the semantic tokens (`--foreground` on `--background`, `--muted-foreground` for captions).
  These defaults meet AA contrast; do not hard-code low-contrast greys.

## Motion

- Decorative animation only (skeleton shimmer). No essential information conveyed by motion.
