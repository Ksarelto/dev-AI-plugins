# Interaction Conventions — html-generator-kit

`verify-prototype.mjs` exercises real interactions (navigation, modals, forms) using **smart generic
heuristics** — it has no per-screen manifest, so it discovers what to test from the DOM. That only
works if every screen emits the same small set of hooks. `screen-generator` MUST follow these
conventions so the functionality check can find and drive each interaction.

If a page has no modal or no form, that's fine — the verifier only tests what it finds. But when a
page *does* have one, it must use these hooks or the flow silently goes untested (or fails).

---

## Navigation (every page)

- Nav links use `class="nav-item"`, `data-nav-id="{page.id}"`, and a **relative** href:
  `href="./{id}.html"` inside `pages/`, `href="pages/{id}.html"` from `index.html`.
- Every href that ends in `.html` must resolve to a real file. The verifier crawls all
  `a[href$=".html"]`, confirms each target exists, and loads it to confirm the `.app` shell renders.
- Broken/missing nav target → **critical**.

## Modals

Emit all three hooks so the open→close flow is testable:

| Role | Hook | Example |
|------|------|---------|
| Trigger | `data-modal-open` + `@click="$store.modal.open('{id}')"` | `<button data-modal-open @click="$store.modal.open('confirm-delete-'+item.id)">Delete</button>` |
| Dialog | `.modal` + `role="dialog"` inside an `x-if`/`x-show` bound to `$store.modal.isOpen('{id}')` | see below |
| Close | `data-modal-close` on the Cancel button AND `@click.self` on the overlay + `@keydown.escape` | `<button data-modal-close @click="$store.modal.close()">Cancel</button>` |

```html
<template x-if="$store.modal.isOpen('confirm-delete-' + item.id)">
  <div class="modal-overlay" data-modal-close @click.self="$store.modal.close()">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="del-title"
         x-trap="true" @keydown.escape="$store.modal.close()">
      <h2 id="del-title" class="modal-title">Delete this item?</h2>
      <div class="modal-actions">
        <button class="btn-secondary" data-modal-close @click="$store.modal.close()">Cancel</button>
        <button class="btn-destructive"
                @click="remove(item.id); $store.notification.success('Deleted'); $store.modal.close()">Delete</button>
      </div>
    </div>
  </div>
</template>
```

Verifier flow: click the first `[data-modal-open]` → assert a visible `.modal[role="dialog"]` →
click `[data-modal-close]` (or press Escape) → assert the dialog is gone. Fail = **critical**.

## Forms (create/detail/settings pages)

Use a real `<form>` so validation is testable with native + visual signals:

```html
<form class="w-full" @submit.prevent="submit($el)" novalidate>
  <div class="form-field">
    <label class="form-label" for="name">Name</label>
    <input id="name" class="form-input" x-model="draft.name" required
           aria-describedby="name-err">
    <p class="form-error" id="name-err" x-show="errors.name" x-text="errors.name"></p>
  </div>
  <!-- more fields; mark every mandatory input `required` -->
  <div class="page-actions mt-4">
    <button type="submit" class="btn-primary">Save</button>
    <button type="button" class="btn-secondary" @click="reset()">Cancel</button>
  </div>
</form>
```

Conventions:
- Every mandatory input/select/textarea carries the native `required` attribute.
- The submit control is `type="submit"` inside the `<form>`.
- `submit($el)` validation, provided by the entity data block (see component-manifest):
  - if the form is invalid (`$el.checkValidity() === false` or custom `errors`), add class
    `was-validated` to the form and populate `errors` so `.form-error` elements show — **do not**
    proceed or show a success toast;
  - if valid, show `$store.notification.success(...)` (and/or `.alert-success`), then `reset()`.

Verifier flow (only on pages that contain a `<form>` with a `required` field):
1. Click submit with required fields empty → expect a visible `.form-error`, OR a `:invalid`
   required field, OR `form.was-validated`. If none of these → validation is missing → **critical**.
2. Fill every `required` field with a plausible value and submit → expect no visible `.form-error`
   and a success signal (toast/`.alert-success`) — missing success is a **warning**, not critical.

## Dev panel (already standard)

The dev-panel state buttons carry `aria-label="Preview {loading|empty|error|success} state"`. The
verifier cycles all four and confirms each state's root element becomes visible.

## Why data hooks (not just Alpine expressions)

Alpine `@click`/`x-show` attributes are hard to target reliably from a CSS selector (the `@` and
`$store...` make brittle selectors). The `data-modal-open` / `data-modal-close` attributes and the
native `<form>`+`required` give the verifier stable, framework-agnostic anchors — so the same
generic checks work on every prototype without a per-screen manifest.
