# Shared assets of the living prototype

The prototype-designer owns every shared file; the prototypers own one page each. Shared files are
written so that **adding a screen never changes another page**: navigation is rendered by
`navigation.js`, the dev-panel by `app.js`, data comes from `data.js`. A page edited without need
shows up as `changed` against the snapshot and fails gate-proto's `status-untrue`.

```
.factory/prototype/
  design-brief.md   screens.yaml   index.html
  css/tokens.css  css/base.css  css/components.css
  js/app.js  js/data.js  js/navigation.js
  pages/<screen-id>.html
```

Dependencies: Alpine.js and its focus plugin from jsDelivr at a pinned version
(`alpinejs@3.14.9`, `@alpinejs/focus@3.14.9`; keep whatever version existing pages already pin), and
Google Fonts only when a provided font needs it. Nothing else: no Tailwind, no chart library, no
icon font, no build step. Plain CSS, plain JS.

## css/base.css

Reset and typography. The root font size stays at the browser default (16px).

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--font-sans), system-ui, sans-serif; font-size: var(--text-sm); line-height: 1.55;
  color: var(--foreground); background: var(--background); min-height: 100vh; }
h1, h2, h3 { font-family: var(--font-display), system-ui, sans-serif; line-height: 1.25; font-weight: 600; }
h1 { font-size: var(--text-2xl); } h2 { font-size: var(--text-xl); } h3 { font-size: var(--text-lg); }
a { color: var(--primary); }
button, input, select, textarea { font: inherit; color: inherit; }
img, svg { display: block; max-width: 100%; }
[hidden] { display: none !important; }
[x-cloak] { display: none !important; }
```

A provided font adds one line at the top: `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');`

## css/components.css — the class vocabulary

Pages use only these classes (plus what the designer adds for a feature and records in the brief).
Every value is a `var(--token)`; no raw colour.

| Group | Classes |
|---|---|
| Shell | `app` (sidebar layout) · `app app-topnav` · `sidebar` · `sidebar-header` · `sidebar-brand` · `sidebar-nav` · `topnav` · `main` · `content` |
| Navigation | `nav-group` · `nav-group-label` · `nav-item` · `nav-item-active` · `nav-item-placeholder` · `breadcrumb` |
| Page header | `page-header` · `page-title` · `page-subtitle` · `page-actions` |
| Cards | `card` · `card-header` · `card-body` · `card-footer` · `card-link` · `card-placeholder` · `card-grid` · `stat` · `stat-value` · `stat-label` |
| Buttons | `btn` + `btn-primary` · `btn-secondary` · `btn-ghost` · `btn-destructive` · size `btn-sm` |
| Badges | `badge` + `badge-neutral` · `badge-primary` · `badge-success` · `badge-warning` · `badge-destructive` |
| Tables | `table` (on a real `<table>`) · `num` (tabular figures, right-aligned) · `table-actions` |
| Forms | `form-field` · `form-label` · `form-input` · `form-select` · `form-textarea` · `form-hint` · `form-error` · `form-actions` · `was-validated` (on the form) |
| Filters | `filter-bar` · `chip` · `chip-active` |
| Feedback | `alert` + `alert-info` · `alert-success` · `alert-warning` · `alert-destructive` · `empty-state` · `empty-state-title` · `empty-state-text` · `skeleton` · `toast-container` · `toast` |
| Dialogs | `modal-overlay` · `modal` · `modal-title` · `modal-body` · `modal-actions` |
| Prototype | `dev-panel` · `dev-panel-label` · `proto-badge` |
| Layout helpers | `stack` (vertical gap) · `row` (horizontal, wraps) · `grid-2` · `grid-3` · `gap-sm` · `gap-lg` · `mt-md` · `mb-md` · `w-full` · `text-muted` · `text-sm` · `sr-only` |

Required rules (gate-proto and the accessibility baseline depend on them):

```css
:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
.form-input, .form-select, .form-textarea { border: 1px solid var(--input); border-radius: var(--radius-sm);
  padding: var(--control-py) var(--control-px); background: var(--card); width: 100%; }
.was-validated :invalid { border-color: var(--destructive); }
.form-error { color: var(--destructive); font-size: var(--text-xs); }
.skeleton { background: var(--muted); border-radius: var(--radius-sm); height: 1rem; }
.modal-overlay { position: fixed; inset: 0; background: var(--overlay); display: grid; place-items: center; }
.modal { background: var(--card); border-radius: var(--radius-lg); padding: var(--card-pad); max-width: 32rem; width: 100%; }
.nav-item-placeholder { color: var(--muted-foreground); cursor: not-allowed; }
.dev-panel { position: fixed; right: 1rem; bottom: 1rem; display: flex; gap: 0.25rem; align-items: center;
  padding: 0.5rem; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-md); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 768px) { .app { flex-direction: column; } .sidebar { width: 100%; } .grid-2, .grid-3 { grid-template-columns: 1fr; } }
```

No transitions, no keyframes, no shimmer, no gradients, no `.dark`. The skeleton is a static grey bar.

## js/app.js — states and stores

Copy as written; it is generic. It builds the dev-panel from the page's `data-state` blocks (so a
prototyper never writes switcher code), honours `?state=<name>` in the URL for deep links, and
registers the Alpine stores.

```js
(function () {
  function initStates() {
    const main = document.querySelector('main');
    const blocks = main ? [...main.querySelectorAll('[data-state]')] : [];
    if (!blocks.length) return;
    const names = [...new Set(blocks.map((b) => b.dataset.state))];
    const asked = new URLSearchParams(location.search).get('state');
    const first = names.includes(asked) ? asked : main.dataset.initialState || names[0];
    const panel = document.querySelector('.dev-panel');
    const show = (name) => {
      blocks.forEach((b) => { b.hidden = b.dataset.state !== name; });
      panel?.querySelectorAll('[data-show-state]').forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.showState === name)));
    };
    if (panel) {
      const label = document.createElement('span');
      label.className = 'dev-panel-label';
      label.textContent = 'State:';
      panel.append(label);
      for (const name of names) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-ghost btn-sm';
        btn.dataset.showState = name;
        btn.textContent = name;
        btn.addEventListener('click', () => show(name));
        panel.append(btn);
      }
    }
    show(first);
  }
  document.addEventListener('DOMContentLoaded', initStates);
  document.addEventListener('alpine:init', () => {
    Alpine.store('notify', {
      items: [],
      show(message, type = 'success') {
        const id = Date.now() + Math.random();
        this.items.push({ id, message, type });
        setTimeout(() => { this.items = this.items.filter((n) => n.id !== id); }, 3000);
      },
    });
    Alpine.store('modal', {
      current: null,
      open(id) { this.current = id; },
      close() { this.current = null; },
      isOpen(id) { return this.current === id; },
    });
  });
})();
```

`data-state` blocks are siblings inside `<main>`, never nested. The states work without Alpine
(plain JS), so a reviewer offline still sees every state.

## js/data.js — one `Alpine.data` block per entity

```js
document.addEventListener('alpine:init', () => {
  Alpine.data('CouponData', () => ({
    items: [
      { id: 'c-01', code: 'SPRING10', discount: '10.00 EUR', status: 'active', expires: '2026-12-31' },
      { id: 'c-02', code: 'WELCOME5', discount: '5.00 EUR', status: 'active', expires: '2027-03-01' },
      { id: 'c-03', code: 'WINTER24', discount: '15.00 EUR', status: 'expired', expires: '2025-02-28' },
    ],
    filter: { search: '', status: '' },
    draft: {},
    errors: {},
    get filtered() {
      const q = this.filter.search.trim().toLowerCase();
      return this.items.filter((it) => (!q || Object.values(it).some((v) => String(v).toLowerCase().includes(q)))
        && (!this.filter.status || it.status === this.filter.status));
    },
    submit(form) {
      this.errors = {};
      if (!form.checkValidity()) {
        form.classList.add('was-validated');
        form.querySelectorAll('[required]').forEach((el) => { if (!el.value) this.errors[el.name] = el.dataset.required || 'Required'; });
        return;
      }
      this.$store.notify.show(form.dataset.success || 'Saved');
      this.reset(form);
    },
    reset(form) { this.draft = {}; this.errors = {}; form?.classList.remove('was-validated'); },
    remove(id) { this.items = this.items.filter((it) => it.id !== id); },
  }));
});
```

Records: 3–8 per entity, shaped like the API contract (or the PRD's entity fields), with the
**exact values from the ACs** (codes, amounts, messages, limits) plus a few realistic neighbours; at
least one record per status the stories mention. Never "Item 1" or Lorem ipsum. A field's
required-message lives on the input (`data-required="Enter a coupon code"`) so the copy comes from
the AC, not from `data.js`. Add a block when a feature introduces an entity; edit a block only for the
entities this feature changes.

## js/navigation.js — the nav for every page

`SCREENS` mirrors `screens.yaml` in nav order: every screen except `removed`, with its status.
gate-proto checks that each live screen id appears quoted here.

```js
const SCREENS = [
  { id: 'dashboard', title: 'Dashboard', group: 'Overview', status: 'live' },
  { id: 'checkout-summary', title: 'Checkout', group: 'Shop', status: 'live' },
  { id: 'order-detail', title: 'Order', group: 'Shop', status: 'live', hidden: true },
  { id: 'orders', title: 'Orders', group: 'Shop', status: 'placeholder' },
];
(function () {
  function render() {
    const here = document.body.dataset.screen;
    document.querySelectorAll('nav[data-nav]').forEach((nav) => {
      const base = nav.dataset.nav === 'index' ? 'pages/' : './';
      for (const group of [...new Set(SCREENS.map((s) => s.group))]) {
        const wrap = document.createElement('div');
        wrap.className = 'nav-group';
        const label = document.createElement('p');
        label.className = 'nav-group-label';
        label.textContent = group;
        wrap.append(label);
        for (const s of SCREENS.filter((x) => x.group === group && !x.hidden)) {
          const el = document.createElement(s.status === 'placeholder' ? 'span' : 'a');
          el.className = s.status === 'placeholder' ? 'nav-item nav-item-placeholder' : 'nav-item';
          el.textContent = s.status === 'placeholder' ? `${s.title} (not prototyped yet)` : s.title;
          if (s.status === 'placeholder') el.setAttribute('aria-disabled', 'true');
          else el.href = `${base}${s.id}.html`;
          if (s.id === here) { el.classList.add('nav-item-active'); el.setAttribute('aria-current', 'page'); }
          wrap.append(el);
        }
        nav.append(wrap);
      }
    });
  }
  document.addEventListener('DOMContentLoaded', render);
})();
```

`hidden: true` keeps a screen reachable only from another page (a detail page) while still listed.
A placeholder has no `href` — gate-proto's dead-link check would fail a link to a missing page.

## index.html — the app map

Static, at the prototype root (paths without `../`). It links **every live screen** with a literal
`href="pages/<id>.html"` (gate-proto `not-linked`) and shows placeholders as cards without a link.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Shop — prototype</title>
  <link rel="stylesheet" href="css/tokens.css">
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/components.css">
  <script src="js/app.js" defer></script>
  <script src="js/navigation.js" defer></script>
  <script src="https://cdn.jsdelivr.net/npm/alpinejs@3.14.9/dist/cdn.min.js" defer></script>
</head>
<body x-data data-screen="index">
  <div class="app">
    <aside class="sidebar">
      <div class="sidebar-header"><span class="sidebar-brand">Shop</span> <span class="proto-badge">prototype</span></div>
      <nav class="sidebar-nav" aria-label="Main navigation" data-nav="index"></nav>
    </aside>
    <main class="main">
      <div class="content">
        <div class="page-header"><div><h1 class="page-title">Shop</h1>
          <p class="page-subtitle">Every screen of the app. Grey cards are not prototyped yet.</p></div></div>
        <div class="card-grid">
          <a href="pages/checkout-summary.html" class="card card-link"><div class="card-body">
            <h2 class="text-lg">Checkout</h2><p class="text-muted">Order summary with coupon (FEAT-001)</p></div></a>
          <div class="card card-placeholder"><div class="card-body">
            <h2 class="text-lg">Orders</h2><p class="text-muted">Not prototyped yet</p></div></div>
        </div>
      </div>
    </main>
  </div>
</body>
</html>
```

For the top-nav archetype, replace the `aside` with
`<header class="topnav"><span class="sidebar-brand">Shop</span><nav class="sidebar-nav" aria-label="Main navigation" data-nav="index"></nav></header>`
inside `<div class="app app-topnav">`. Pages use the same shell (see the prototyper's page shell).
