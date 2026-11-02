# Page shell (`pages/<screen-id>.html`)

Every page is a standalone HTML file with the same shell; only `<title>`, `data-screen`, the page
header and the `data-state` blocks differ. Styles come from `../css/*.css`, behaviour from
`../js/*.js`. The designer's `js/app.js` builds the dev-panel and switches states; `js/navigation.js`
renders the nav. You write neither — and nothing else outside your page and your note.

## Template (sidebar layout)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Checkout — Shop prototype</title>
  <link rel="stylesheet" href="../css/tokens.css">
  <link rel="stylesheet" href="../css/base.css">
  <link rel="stylesheet" href="../css/components.css">
  <script src="../js/app.js" defer></script>
  <script src="../js/data.js" defer></script>
  <script src="../js/navigation.js" defer></script>
  <script src="https://cdn.jsdelivr.net/npm/@alpinejs/focus@3.14.9/dist/cdn.min.js" defer></script>
  <script src="https://cdn.jsdelivr.net/npm/alpinejs@3.14.9/dist/cdn.min.js" defer></script>
</head>
<body x-data data-screen="checkout-summary">
  <div class="app">
    <aside class="sidebar">
      <div class="sidebar-header">
        <a href="../index.html" class="sidebar-brand">Shop</a> <span class="proto-badge">prototype</span>
      </div>
      <nav class="sidebar-nav" aria-label="Main navigation" data-nav="page"></nav>
    </aside>

    <main class="main" x-data="CouponData" data-initial-state="applied">
      <div class="content">
        <div class="page-header">
          <div>
            <nav class="breadcrumb" aria-label="Breadcrumb"><a href="../index.html">Home</a> / <span>Checkout</span></nav>
            <h1 class="page-title">Checkout</h1>
          </div>
          <div class="page-actions"><button type="button" class="btn btn-primary">Place order</button></div>
        </div>

        <section data-state="empty" aria-label="No coupon entered">
          …the view in this state…
        </section>
        <section data-state="applied" aria-label="Coupon applied">
          …
        </section>
        <section data-state="invalid" aria-label="Coupon rejected">
          …
        </section>
        <section data-state="loading" aria-label="Applying coupon" role="status">
          <div class="skeleton"></div><div class="skeleton mt-md"></div>
        </section>
      </div>

      <div class="dev-panel" role="toolbar" aria-label="Prototype states"></div>
    </main>
  </div>

  <div class="toast-container" aria-live="polite">
    <template x-for="n in $store.notify.items" :key="n.id">
      <div class="toast" role="status" x-text="n.message"></div>
    </template>
  </div>
</body>
</html>
```

For the **top-nav** layout (`layout: top-nav` in `screens.yaml`): `<div class="app app-topnav">` and
`<header class="topnav"><a href="../index.html" class="sidebar-brand">Shop</a><nav class="sidebar-nav" aria-label="Main navigation" data-nav="page"></nav></header>`
instead of the `aside`. Copy the shell (scripts, layout, brand) from an existing page of the
prototype when there is one, so every page matches.

## Rules the gate checks on your page

- `<title>` present (warning otherwise); `<main>` present (`no-main`).
- One `data-state="<name>"` element per entry of the screen's `states` in `screens.yaml`, spelled
  exactly (`state-missing`). States are sibling blocks inside `<main>`, never nested, each a full
  view of the content area for that state. Put shared parts (page header) outside them.
- An element with `class="dev-panel"` (`no-dev-panel`); leave it empty — `app.js` fills it from the
  `data-state` blocks. It sits last inside `<main>`.
- No `<style>` element in the body (`inline-style`) and no inline `<script>` with more than 20
  characters (`inline-script`). Alpine attributes (`x-data`, `@click`, `x-show`) are fine; anything
  longer than a short expression is a method in `data.js` — ask for it in `needs_classes`/`notes`.
- Every `<nav>` has `aria-label` (warning). No Lorem ipsum, `TODO` or `PLACEHOLDER` text (warning).
- Links: every `href` to an `.html` file must exist (`dead-link`, checked on the whole prototype).
  Use `../index.html` for home, `./<id>.html` for a live screen; never link a placeholder.

## Conventions (not gated, still required)

- `data-screen` on `<body>` equals the screen id (navigation.js marks the active item with it).
- `data-initial-state` on `<main>` names the state shown first — normally the success/populated
  view; a reviewer deep-links any state with `?state=<name>`.
- `x-data="<Entity>Data"` on `<main>` when the page uses the designer's data block; the screen's
  `entity` in `screens.yaml` names it. A page with no data needs no `x-data` on `<main>`.
- No `style="…"` attributes and no raw colours: only classes from the brief's vocabulary.
- Body has no `x-cloak`: states must render even when the Alpine CDN is unreachable.
