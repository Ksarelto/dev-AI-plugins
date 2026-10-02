# Template: page-shell.md

Standalone HTML page template for `pages/{id}.html`. **CDN-free** — styling comes entirely from
`css/*.css`, and Alpine.js (+ focus plugin) is vendored under `js/vendor/` (see
`templates/runtime/vendor/README.md`), not loaded from a CDN.
Replace all `ALL_CAPS` placeholders. Do not leave placeholders in output. Use ONLY the class
vocabulary from `design-system-ref.md` — no Tailwind utility classes.

> **Layout archetype**: the shell below is the **sidebar** variant. If `design-system-ref.md`'s
> Design direction says **top-nav**, wrap in `<div class="app app-topnav">` and put the brand +
> horizontal nav inside `<header class="topnav">…</header>` instead of `<aside class="sidebar">`
> (see `rules/alpine-interaction-patterns.md`). Shell-less pages (login/landing) may omit both.
>
> **Interaction hooks**: any modal must use `data-modal-open` (trigger) + `data-modal-close`
> (Cancel/overlay); forms must be a real `<form>` with `required` fields and a `type="submit"`
> control (see `rules/interaction-conventions.md`) — this is what the Station 6.5 render check drives.

---

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PAGE_TITLE — APP_TITLE</title>
  <link rel="stylesheet" href="../css/tokens.css">
  <link rel="stylesheet" href="../css/base.css">
  <link rel="stylesheet" href="../css/components.css">
  <script src="../js/store.js" defer></script>
  <script src="../js/app.js" defer></script>
  <script src="../js/data.js" defer></script>
  <script src="../js/navigation.js" defer></script>
  <script src="../js/vendor/alpine-focus.min.js" defer></script>
  <script src="../js/vendor/alpine.min.js" defer></script>
</head>
<body x-data x-cloak>
  <div class="app">

    <!-- ═══════ Sidebar Navigation ═══════ -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <a href="../index.html" class="sidebar-brand link">APP_TITLE</a>
        <span class="badge badge-primary">prototype</span>
      </div>
      <nav class="sidebar-nav" aria-label="Main navigation">
<!-- nav:start -->
<!-- nav:end -->
      </nav>
    </aside>

    <!-- ═══════ Main Content ═══════ -->
    <main class="main" x-data="ENTITY_DATA_CALL" x-init="init()">
      <div class="content">

        <!-- Page header -->
        <div class="page-header">
          <div>
            <nav class="breadcrumb" aria-label="Breadcrumb">
              <a href="../index.html">Home</a>
              <span class="sep">/</span>
              <span>PAGE_TITLE</span>
            </nav>
            <h1 class="page-title">PAGE_TITLE</h1>
          </div>
          <div class="page-actions">
            <!-- PRIMARY_ACTION_BUTTON -->
          </div>
        </div>

        <!-- ── Loading state ── -->
        <div x-show="loading" data-state-root="loading" role="status" aria-label="Loading PAGE_TITLE">
          <div class="skeleton mb-2"></div>
          <div class="skeleton mb-2"></div>
          <div class="skeleton mb-2"></div>
          <div class="skeleton w-75 mb-2"></div>
          <div class="skeleton w-90"></div>
        </div>

        <!-- ── Error state ── -->
        <div x-show="!loading && error" data-state-root="error" class="alert alert-destructive" role="alert">
          <p x-text="error || 'Failed to load ENTITY_PLURAL. Please try again.'"></p>
          <button class="btn-secondary mt-2" @click="reload()">Retry</button>
        </div>

        <!-- ── Empty state ── -->
        <div x-show="!loading && !error && items.length === 0" data-state-root="empty" class="empty-state">
          <div class="empty-state-icon">📭</div>
          <p class="empty-state-title">No ENTITY_PLURAL yet</p>
          <p class="empty-state-desc">EMPTY_STATE_DESCRIPTION</p>
          <button class="btn-primary mt-4">PRIMARY_EMPTY_CTA</button>
        </div>

        <!-- ── Success state ── -->
        <div x-show="!loading && !error && items.length > 0" data-state-root="success">
          <!-- SUCCESS_CONTENT_BLOCK — filled by screen-generator per page type -->
        </div>

      </div>

      <!-- ── Dev Panel (always last inside <main>) ── -->
      <div class="dev-panel" role="toolbar" aria-label="Prototype controls">
        <span class="dev-panel-label">States:</span>
        <button class="btn-ghost btn-sm" @click="loading=true;error=null"
                title="Loading state" aria-label="Preview loading state">⏳</button>
        <button class="btn-ghost btn-sm" @click="items=[];loading=false;error=null"
                title="Empty state" aria-label="Preview empty state">📭</button>
        <button class="btn-ghost btn-sm" @click="error='Failed to load';loading=false"
                title="Error state" aria-label="Preview error state">❌</button>
        <button class="btn-ghost btn-sm" @click="loading=false;error=null;items=[...defaultItems]"
                title="Success state" aria-label="Preview success state">✅</button>
        <button class="btn-ghost btn-sm" @click="ProtoStore.resetAll(); reload()"
                title="Reset data" aria-label="Reset all data">🔄</button>
      </div>

    </main>
  </div>

  <!-- Toast notifications -->
  <div class="toast-container" aria-live="polite">
    <template x-for="n in $store.notification.items" :key="n.id">
      <div class="alert" :class="n.type === 'error' ? 'alert-destructive' : (n.type === 'success' ? 'alert-success' : '')"
           x-text="n.message" role="status"></div>
    </template>
  </div>

</body>
</html>
```

---

## Placeholder reference

| Placeholder | Replace with | Example |
|-------------|-------------|---------|
| `APP_TITLE` | Feature/app title | `Scheduled Orders` |
| `PAGE_TITLE` | This page's title | `Profiles List` |
| `ENTITY_DATA_CALL` | Alpine data factory call, by page type | `entityList('Profile')` |
| `ENTITY_PLURAL` | Entity plural name (lowercase) | `profiles` |
| `EMPTY_STATE_DESCRIPTION` | Specific empty-state copy | `Add a profile to get started.` |
| `PRIMARY_EMPTY_CTA` | Primary CTA button text | `Add Profile` |
| `PRIMARY_ACTION_BUTTON` | Main action button (or empty) | `<button class="btn-primary">Add Profile</button>` |
| `SUCCESS_CONTENT_BLOCK` | Page-type content | List table, detail form, etc. |

`ENTITY_DATA_CALL` is one of three generic factory calls from `js/store.js` (`store-js.md`),
depending on the page's type — never a per-entity `{Entity}Data()` function:

- List pages: `entityList('{Entity}')`
- Detail pages: `entityDetail('{Entity}')`
- Form / settings pages: `entityForm('{Entity}')`

The `<!-- nav:start -->` / `<!-- nav:end -->` markers inside `<nav class="sidebar-nav">` are left
empty here. `screen-generator` emits the marker pair verbatim and writes nothing between them;
`wire-nav.mjs` (run by `assembly-wiring` at Station 5, after every page exists) injects the actual
nav into every page — and `index.html` — in one pass, which is what keeps nav in sync across pages.

Notes:
- `<body x-data x-cloak>` — the bare `x-data` makes `<body>` an Alpine root so Alpine removes its
  `x-cloak` on init (paired with `[x-cloak]{display:none}` in base.css). WITHOUT `x-data` the body's
  `x-cloak` is never removed and the whole page stays hidden. The nested `x-data="ENTITY_DATA_CALL"`
  on `<main>` is a child scope and works normally.
- `js/store.js` loads before `app.js`/`data.js`/`navigation.js` (order among these four doesn't
  matter relative to each other, only that all four load before the Alpine core scripts). Alpine +
  focus plugin load LAST and deferred so these register their blocks on `alpine:init` before Alpine
  boots.
