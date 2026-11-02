# Alpine patterns for prototype pages

Alpine.js v3 (pinned CDN, loaded last and deferred) gives the page its interactions. The designer's
`js/app.js` registers two stores — `$store.notify` (`show(message, type)`) and `$store.modal`
(`open(id)`, `close()`, `isOpen(id)`) — and `js/data.js` one data block per entity (`items`,
`filtered`, `filter`, `draft`, `errors`, `submit(form)`, `reset(form)`, `remove(id)`). Use those;
do not invent a second mechanism. Keep expressions in attributes short — anything longer belongs in a
data-block method, which the designer adds (ask in your note).

## States

States are not Alpine: `app.js` shows one `data-state` block at a time and builds the dev-panel
buttons from them. Each block is the whole content area as it looks in that state, written as
static markup with the values from the ACs.

```html
<section data-state="loading" role="status" aria-label="Loading orders">
  <div class="skeleton"></div><div class="skeleton mt-md"></div><div class="skeleton mt-md"></div>
</section>

<section data-state="error" aria-label="Orders failed to load">
  <div class="alert alert-destructive" role="alert">
    <p>We could not load your orders.</p>
    <button type="button" class="btn btn-secondary btn-sm mt-md">Try again</button>
  </div>
</section>

<section data-state="empty" aria-label="No orders">
  <div class="empty-state">
    <p class="empty-state-title">No orders yet</p>
    <p class="empty-state-text">Orders you place appear here.</p>
    <a href="./checkout-summary.html" class="btn btn-primary mt-md">Go to checkout</a>
  </div>
</section>
```

A state named after an outcome (`applied`, `invalid-coupon`, `limit-reached`) shows that outcome:
the discount line with its exact amount, the inline error with the exact AC message, the disabled
control at the limit. Copy text from the AC, Gherkin or UX notes, verbatim.

## Lists with a filter

```html
<section data-state="populated" aria-label="Orders">
  <div class="filter-bar">
    <label class="sr-only" for="order-search">Search orders</label>
    <input id="order-search" class="form-input" type="search" placeholder="Search orders" x-model="filter.search">
    <button type="button" class="chip" :class="filter.status === '' && 'chip-active'" @click="filter.status = ''">All</button>
    <button type="button" class="chip" :class="filter.status === 'open' && 'chip-active'" @click="filter.status = 'open'">Open</button>
  </div>
  <table class="table">
    <caption class="sr-only">Orders</caption>
    <thead><tr><th scope="col">Order</th><th scope="col">Status</th><th scope="col" class="num">Total</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
    <tbody>
      <template x-for="o in filtered" :key="o.id">
        <tr>
          <td x-text="o.number"></td>
          <td><span class="badge" :class="o.status === 'open' ? 'badge-warning' : 'badge-success'" x-text="o.statusLabel"></span></td>
          <td class="num" x-text="o.total"></td>
          <td class="table-actions"><a href="./order-detail.html" class="btn btn-ghost btn-sm">View</a></td>
        </tr>
      </template>
    </tbody>
  </table>
  <p class="text-muted" x-show="filtered.length === 0">No orders match your search.</p>
</section>
```

Key `x-for` by a stable id, never the index. Status shows its word, not only a badge colour.

## Modals

Trigger, dialog and close hooks (gate-proto warns `modal-no-close` when a `modal` has no
`data-modal-close`):

```html
<button type="button" class="btn btn-ghost btn-sm" data-modal-open @click="$store.modal.open('remove-coupon')">Remove</button>

<template x-if="$store.modal.isOpen('remove-coupon')">
  <div class="modal-overlay" data-modal-close @click.self="$store.modal.close()">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="remove-coupon-title"
         x-trap="true" @keydown.escape="$store.modal.close()">
      <h2 id="remove-coupon-title" class="modal-title">Remove coupon SPRING10?</h2>
      <p class="modal-body">The total goes back to 100.00 EUR.</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" data-modal-close @click="$store.modal.close()">Cancel</button>
        <button type="button" class="btn btn-destructive" @click="$store.modal.close(); $store.notify.show('Coupon removed')">Remove</button>
      </div>
    </div>
  </div>
</template>
```

When a story has the open dialog as a state (`confirm-remove`), also give it a `data-state` block in
which the dialog markup is shown statically (no `x-if`), so the dev-panel can show it.

## Forms

A real `<form>` with `required` fields and a submit button (gate-proto warns `form-unchecked`
otherwise). Validation runs through the data block's `submit($el)`:

```html
<form @submit.prevent="submit($el)" novalidate data-success="Coupon applied">
  <div class="form-field">
    <label class="form-label" for="coupon-code">Coupon code</label>
    <input id="coupon-code" name="code" class="form-input" x-model="draft.code" required
           data-required="Enter a coupon code" aria-describedby="coupon-code-error">
    <p id="coupon-code-error" class="form-error" x-show="errors.code" x-text="errors.code"></p>
  </div>
  <div class="form-actions">
    <button type="submit" class="btn btn-primary">Apply</button>
    <button type="button" class="btn btn-secondary" @click="reset($el.form)">Cancel</button>
  </div>
</form>
```

- Every mandatory field carries `required` and a `data-required` message from the AC.
- The `name` attribute is the key `submit()` writes into `errors`.
- The success message is `data-success` on the form, from the AC (`"Coupon applied"`).
- A server-side rejection (expired coupon) is a **state**, not form logic: show it in its own
  `data-state` block with the exact message.

## What not to build

No fetch calls, timers that fake latency, routing logic, local storage, charts, animation or
drag-and-drop libraries. The prototype shows the states; it does not simulate a backend.
