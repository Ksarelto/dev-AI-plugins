# Accessibility baseline for prototype pages

WCAG 2.2 AA, kept mechanical. The prototype is not product code, but the structure it shows —
landmarks, labels, focus, how errors are announced — is what the builders will copy, so it must be
right. gate-proto checks the landmark, the nav label and the focus style; the rest is your
self-check.

## Landmarks and headings

- Exactly one `<main>` per page (gate-proto `no-main`); the content and the state blocks are inside
  it.
- Every `<nav>` has an `aria-label`: `Main navigation` for the sidebar or top nav, `Breadcrumb` for
  the breadcrumb (gate-proto warns `nav-unlabelled`).
- One `<h1>` (the page title); state blocks and cards use `<h2>`/`<h3>` without skipping levels.
- `<html lang="en">` (or the app's language), `<title>` on every page.

## Controls

- Actions are `<button type="button">` (or `type="submit"` in a form); navigation is `<a href>`.
  Never a clickable `<div>` or `<span>`.
- An icon-only or emoji-only button has an `aria-label` that says the action (`Remove coupon`).
- A disabled control uses the `disabled` attribute (or `aria-disabled="true"` on a link) and the UI
  says why next to it when the story states a reason.
- Focus is always visible: the designer's `components.css` defines `:focus-visible`; never remove an
  outline in a page.
- The dev-panel is a `role="toolbar"` with `aria-label="Prototype states"`; do not hide it with
  `aria-hidden` (its buttons are focusable).

## Forms

- Every input, select and textarea has a `<label for>` (or `aria-label` when a visible label is
  truly absent, e.g. a search box with a visible button). A placeholder is never the label.
- Required fields carry `required`; the error text is in a `.form-error` element referenced by
  `aria-describedby`, or the block has `role="alert"`.
- Group related radio buttons and checkboxes in a `<fieldset>` with a `<legend>`.

## Tables and lists

- Data tables are real `<table>` elements with `<th scope="col">` headers and a `<caption>` (it may
  be `sr-only`). Numbers use the `num` class (tabular, right-aligned).
- A list of cards is a `<ul>` / `<li>` when the order or count matters to the reader.

## State regions

- A loading block has `role="status"` and an `aria-label` ("Loading orders").
- An error message has `role="alert"`.
- The toast container is `aria-live="polite"` (in the shell).

## Dialogs

- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at the dialog title's id.
- Focus is trapped while open (`x-trap="true"` from the focus plugin) and returns to the trigger on
  close; `Escape` closes it.

## Colour and contrast

- Never colour alone: a status badge carries its word, an error carries its text and, where the
  story has one, an icon with `aria-hidden="true"` next to the text.
- Only token-based classes; the designer checked the token pairs for AA. Do not put
  `text-muted` text on `muted` backgrounds smaller than `text-sm`.

## Self-check before the exit gate

Open your page's HTML and confirm: one `<main>`, labelled navs, one `<h1>`, a label per field, an
`aria-label` per icon-only button, `role="status"` on loading, `role="alert"` on errors, dialog
attributes complete, status words next to colours.
