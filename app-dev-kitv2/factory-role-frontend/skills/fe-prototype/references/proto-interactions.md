# Interaction conventions

A reviewer at GATE-P clicks through the prototype to understand what will be built. Every page uses
the same small set of hooks, so the flows behave the same everywhere and a later browser check can
find them without a per-page script. A page that has no modal or form simply has none of its hooks.

## Navigation

- The main nav is rendered by `js/navigation.js` into `<nav … data-nav="page">`; you never write nav
  items. The current screen is highlighted from `<body data-screen="<id>">`.
- In-page links use relative paths: `../index.html` for home, `./<id>.html` for another live
  screen. Every `href` to an `.html` file must resolve (gate-proto `dead-link`).
- A screen that is a `placeholder` in `screens.yaml` has no page: never link it. Show the control as
  a button that announces it instead —
  `<button type="button" class="btn btn-ghost" @click="$store.notify.show('Order history is not prototyped yet', 'info')">Order history</button>` —
  and mention it in your note's `notes`.
- A link to a screen another prototyper is building in this run is fine when that screen is `added`
  or `changed` in `screens.yaml`: its page will exist when the gate runs.

## Actions and feedback

| Action in the story | Prototype behaviour |
|---|---|
| Save / submit / apply | `<form>` with `submit($el)`: invalid → `.form-error` messages; valid → toast with the AC's success text |
| Delete / remove / cancel something | `data-modal-open` button → confirm modal → `$store.notify.show(...)` |
| Navigate to a detail | `<a href="./<detail-id>.html">` from the row or card |
| Filter / search | `x-model` on `filter.search` / `filter.status`, list over `filtered` |
| An outcome the server decides (accepted, rejected, limit reached) | its own `data-state` block; no fake logic |
| A permission difference | a `data-state` per role view (`as-viewer`, `as-admin`) when the story has one |

Toasts come from `$store.notify.show(message, type)` with `type` `success`, `info`, `warning` or
`error`; the container with `aria-live="polite"` is in the page shell.

## Modal hooks

| Role | Hook |
|---|---|
| Trigger | `data-modal-open` + `@click="$store.modal.open('<id>')"` |
| Dialog | `.modal` with `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, inside `x-if="$store.modal.isOpen('<id>')"` |
| Close | `data-modal-close` on Cancel and on the overlay (`@click.self`), plus `@keydown.escape` on the dialog |

Modal ids are kebab-case and unique within the page (`remove-coupon`, `confirm-delete-<row id>`).

## Form hooks

- A real `<form @submit.prevent="submit($el)" novalidate>`; mandatory fields carry `required`;
  one `type="submit"` button inside the form; a `type="button"` cancel.
- Each field: a `<label for>`, an `id`, a `name` (the `errors` key), a `data-required` message, and a
  `.form-error` element tied with `aria-describedby`.
- `data-success` on the form holds the success toast text.

## Which ACs a person can try

While you build, note each AC id the page lets a person see or do: the outcome is visible in a state
block, a toast, a modal or the list. These go into the note's `acs_shown`. An AC that only a backend
can prove (a rate limit, an audit log) is not "shown" — leave it out rather than faking it.
