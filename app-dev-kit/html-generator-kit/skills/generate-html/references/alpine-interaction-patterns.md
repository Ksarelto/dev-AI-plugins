# Alpine Interaction Patterns — html-generator-kit

Canonical Alpine.js v3 patterns for generated pages. Read by `screen-generator`.
Alpine + `@alpinejs/focus` are loaded per page (deferred). No build step.

---

## Page skeleton (match the design-brief's layout archetype — see design-system-ref)

SIDEBAR archetype:
```html
<body x-data x-cloak>
  <div class="app">
    <aside class="sidebar"> … nav … </aside>
    <main class="main" x-data="{Entity}Data()" x-init="init()">
      <div class="content"> … </div>
    </main>
  </div>
</body>
```

TOP-NAV archetype:
```html
<body x-data x-cloak>
  <div class="app app-topnav">
    <header class="topnav"> … brand + horizontal nav … </header>
    <main class="main" x-data="{Entity}Data()" x-init="init()">
      <div class="content"> … </div>
    </main>
  </div>
</body>
```

- `<body x-data x-cloak>`: the bare `x-data` makes `<body>` an Alpine root so Alpine strips its
  `x-cloak` on init (paired with `[x-cloak]{display:none}` in base.css). WITHOUT `x-data`, the
  body's `x-cloak` is never removed and the whole page stays `display:none`. The `x-data` on
  `<main>` is a nested child scope and works normally.
- Entity state is scoped to `<main>` via `x-data="{Entity}Data()"`; `x-init="init()"` seeds
  `defaultItems`.
- The `.sidebar` (≥200px wide) is the render check's "layout is styled" signal. For the TOP-NAV
  archetype the check accepts a rendered `.topnav` instead — either satisfies the layout gate.

## Four-state rendering (mandatory on every data screen)

```html
<div x-show="loading" role="status" aria-label="Loading …"> …skeletons… </div>
<div x-show="!loading && error" class="alert alert-destructive" role="alert">
  <p x-text="error"></p>
  <button class="btn-secondary mt-2" @click="reload()">Retry</button>
</div>
<div x-show="!loading && !error && items.length === 0" class="empty-state"> …CTA… </div>
<div x-show="!loading && !error && items.length > 0"> …content… </div>
```

Use `filteredItems` (not `items`) inside `x-for` when a filter bar is present.

## Lists

```html
<template x-for="item in filteredItems" :key="item.id">
  <div class="table-row" role="row">
    <div class="table-cell" role="gridcell" x-text="item.name"></div>
  </div>
</template>
```

Always key `x-for` by a stable unique field (`item.id`) — never the loop index.

## Status → badge binding

```html
<span class="badge" :class="{
  'badge-success': ['ACTIVE','APPROVED','COMPLETED'].includes(item.status),
  'badge-warning': ['PENDING','IN_PROGRESS','PROCESSING'].includes(item.status),
  'badge-destructive': ['DECLINED','FAILED','REJECTED'].includes(item.status),
  'badge-default': !['ACTIVE','APPROVED','COMPLETED','PENDING','IN_PROGRESS','PROCESSING','DECLINED','FAILED','REJECTED'].includes(item.status)
}" x-text="item.status"></span>
```

## Global stores (from js/app.js)

- Toast: `@click="$store.notification.success('Saved')"` (`.error` / `.warning` too).
- Modal: open with `$store.modal.open('confirm-delete-' + item.id)`; check with
  `$store.modal.isOpen(id)`; close with `$store.modal.close()`.
- Theme: `$store.theme.toggle()`; read `$store.theme.isDark`.

## Confirm-delete modal (uses the testable data hooks — see interaction-conventions.md)

Trigger carries `data-modal-open`; overlay + Cancel carry `data-modal-close`:

```html
<button class="btn-ghost btn-sm text-destructive" data-modal-open aria-label="Delete item"
        @click="$store.modal.open('confirm-delete-' + item.id)">Delete</button>

<template x-if="$store.modal.isOpen('confirm-delete-' + item.id)">
  <div class="modal-overlay" data-modal-close @click.self="$store.modal.close()">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="del-title"
         x-trap="true" @keydown.escape="$store.modal.close()">
      <h2 id="del-title" class="modal-title">Delete this item?</h2>
      <p class="text-muted mt-2">This action cannot be undone.</p>
      <div class="modal-actions">
        <button class="btn-secondary" data-modal-close @click="$store.modal.close()">Cancel</button>
        <button class="btn-destructive"
                @click="remove(item.id); $store.notification.success('Deleted'); $store.modal.close()">
          Delete
        </button>
      </div>
    </div>
  </div>
</template>
```

## Forms with validation (create/detail/settings)

```html
<form @submit.prevent="submit($el)" novalidate>
  <div class="form-field">
    <label class="form-label" for="name">Name</label>
    <input id="name" class="form-input" x-model="draft.name" required aria-describedby="name-err">
    <p class="form-error" id="name-err" x-show="errors.name" x-text="errors.name"></p>
  </div>
  <div class="page-actions mt-4">
    <button type="submit" class="btn-primary">Save</button>
    <button type="button" class="btn-secondary" @click="reset()">Cancel</button>
  </div>
</form>
```

`submit($el)` (in the entity data block): if `!$el.checkValidity()`, add `was-validated` to the form
and set `errors`; else show `$store.notification.success(...)` and `reset()`. Mark every mandatory
field `required`. This is what the verifier's form flow drives — see `rules/interaction-conventions.md`.

## Dev panel (always last inside `<main>`)

State-switcher buttons mutate the entity block directly:
`loading`, `items=[]`, `error='…'`, and reset via `items=[...defaultItems]`.

## Rules of thumb

- No inline `<script>` blocks — all JS lives in `js/*.js`. Alpine expressions in attributes are fine.
- Keep expressions short; put anything non-trivial in a method on the data block.
- Prefer `x-show` for state toggles that flip often; `x-if` for mount/unmount (modals).
