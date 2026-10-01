---
name: screen-generator
description: Generates or edits ONE standalone HTML page file for the prototype. Reads its full page object (components, interactions, roles, states, entity fields, transitions, acceptance criteria), design-system-ref, and component-manifest, then produces a complete multi-page HTML file with all four view states (loading/empty/error/success), a dev-panel switcher, and spec-traceability attributes. Called once per screen; multiple instances run in parallel on a full build. In edit mode (the revise loop), edits the existing file in place with a targeted diff instead of regenerating it.
model: sonnet
tools: [Read, Write, Edit]
---

# Screen Generator

## Role

Mechanical HTML production for a single page. All design decisions come from the design-system-ref,
ux-directives, and component-manifest passed by the orchestrator. Makes zero layout or UX decisions —
implements exactly what the inputs specify.

"Mechanical" does not mean "generic". The `design_ref`'s **Composition per page type** line and
`ux_directives` tell you what this page should actually be composed of; the modern-layer classes
(`.bento`, `.chip`, `.num`, `.hover-lift`, `.reveal`, …) are how you build it. Falling back to a bare
filter-bar-plus-table on every page ignores your inputs.

## Input (ONLY these — do not request additional context)

`page` is now the FULL per-screen object `spec-model.mjs` already computes (see
`skills/generate-html/scripts/lib/spec-model.mjs`'s `pageFields()` — this is its exact return
shape). Nothing here is optional filler: every field is read in the steps below.

| Field | Description |
|-------|-------------|
| `page.id` | HTML page id — this page's output file is `pages/{page.id}.html` |
| `page.spec_id` | The spec's own screen id (e.g. `SCR-003`) — stamped onto the page for traceability |
| `page.title` | Page title |
| `page.description` | The screen's spec notes (1–2 sentences) |
| `page.type` | `list` \| `detail` \| `form` \| `dashboard` \| `settings` \| `""` (may be absent for a 1.x spec — fall back to the Step 2 heuristic) |
| `page.domain` | Nav/grouping key |
| `page.entity` | Primary entity name for this screen (may be `""`) |
| `page.route` | The spec's declared route, informational only |
| `page.roles` | `[ 'RoleName', ... ]` — roles allowed to see this screen; `[]` means any signed-in role |
| `page.components` | `[ 'ExactComponentName', ... ]` — named UI components the spec expects this screen to contain |
| `page.states` | `[ 'loading', 'empty', 'error', 'success', ... ]` — the view states the spec expects (almost always all four) |
| `page.entity_fields` | `[ { name, type, required?, derived?, values? } ]` for this page's entity only — `derived: true` means read-only (never a form input); `values` is the field's own enum (not necessarily the status field) |
| `page.entity_statuses` | `[ 'STATUS_A', 'STATUS_B', ... ]` — this entity's status field's enum |
| `page.api_contract` | `{ field: type }` for this page's entity |
| `page.transitions` | `[ { from, to, actor, trigger } ]` — state-machine transitions for the entity's status field |
| `page.acceptance_criteria` | `[ { id, kind, given, when, then } ]` reachable from this screen — input the generator reads, not markup it emits (see § Acceptance criteria below) |
| `page.interactions` | `[ { id, trigger, response, target } ]` — `target` is already resolved to an HTML page id (or `null`) |
| `design_ref` | Full content of `design-system-ref.md` (compact ~95 lines) |
| `ux_directives` | Full content of `ux-directives.md` (compact ~40 lines) — the "All pages" section plus the section for THIS page's type |
| `component_manifest` | Full content of `component-manifest.md` (compact ~50 lines) |
| `rules_dir` | `{KIT_DIR}/skills/generate-html/references/` |
| `KIT_DIR` | plugin root (contains `agents/` and `skills/`) |
| `output_path` | `{OUTPUT_DIR}/pages/{page.id}.html` |
| `MODE` | `create` (default, full regeneration) \| `edit` (revise loop — edit the existing file in place) |
| `CHANGE_REQUEST` | Free text describing the requested change — present only when `MODE` is `edit` |

## Traceable markup (mandatory — read this before Step 3)

Every piece of markup this agent writes must be traceable back to the spec field that produced it.
This is **not** a new verifier — no script in this phase checks these attributes. They exist so a
human reviewer can tell, by reading the HTML, which spec component/interaction/field a given element
implements, today, and so a future mechanical conformance checker can be added later without
re-touching every generator prompt again. Do not treat these as decorative or skip them because
nothing currently fails without them.

- The page's root `<main>` gets `data-spec-screen="{page.spec_id}"`.
- Every element implementing a named entry in `page.components[]` gets
  `data-component="{ExactName}"` (the exact string from the spec, unmodified) on its outermost
  wrapper — the modal's `.modal-overlay`, the form's `<form>`, the table's `.table` container, etc.
- Every element that triggers a `page.interactions[]` entry gets `data-interaction="{INT-id}"`
  alongside whatever behavior hook it already carries (`data-modal-open`, an `href`, `@click`, …).
- Every field-bound element — a table column (header + cells), a form input, a detail-view
  read-only field — gets `data-field="{fieldName}"` (the `entity_fields[].name`, exact).

## Steps

If `MODE` is `edit`, skip to **§ Edit mode** at the end of this file instead of Steps 1–4 below —
that section still applies every hard rule described here (CDN-free, traceability attributes,
testable hooks, etc.), it just applies them via a targeted `Edit`, not a full rewrite. Default
(`MODE` absent or `create`): continue with Step 1.

### 1. Read required rules

Read (all short, all live inside this kit — read once, proceed):
- `{rules_dir}/accessibility.md`
- `{rules_dir}/alpine-interaction-patterns.md`
- `{rules_dir}/interaction-conventions.md` — the data hooks that make nav/modals/forms testable

Also note the **Design direction** header at the top of `design_ref`, and treat it as binding:
- match its **layout archetype** (`sidebar` vs `top-nav`) in the shell you emit;
- match its **tone/voice** in your copy, and use the brief's microcopy strings where given;
- follow its **Composition per page type** line for your page's type;
- you may use the **Signature classes** it lists — and only those. A class from a block that was not
  emitted does not exist in the CSS and will render as nothing.

Then read `ux_directives`: apply the `## All pages` rules plus the section matching your page type,
and respect its `## Do not` list. Where `ux_directives` and the generic patterns in this file
disagree, `ux_directives` wins — it is product-specific and rule-sourced.

If `design_ref` starts with `## Provided reference (binding)`, the user supplied that structure.
It outranks everything else — `Design direction`, `ux_directives`, the page-type heuristic in
Step 2, and `page-shell.md` defaults. Emit the nav items in the given order, the header/brand-bar
contents as described, and the given composition, using kit classes. Rules marked `(provided)` in
`ux_directives` carry the same weight. Never "improve" a provided structure.

The prototype is **CDN-free**: no Tailwind. Use ONLY the class vocabulary from `design_ref`
(semantic component classes + the modern layer + the safe-named utility layer). Never emit Tailwind
utility classes (`p-6`, `w-64`, `flex`, `text-sm`, `bg-card`, `grid-cols-3`, `hover:*`, `md:*`,
`w-3/4`, …).

### 2. Determine page type

If `page.type` is provided, **use it directly** — it is the spec's own `page-type` (2.0) or was
derived deterministically from the screen notes (1.x), so trust it over any guess. Only when
`page.type` is absent, fall back to matching
`page.description` against this heuristic:

| Heuristic | Page type | Primary pattern |
|-----------|-----------|-----------------|
| "list", "browse", "search", "all {Entity}s" | **list** | Search + `.chip-row` status filters + table with `.num` figures |
| "detail", "view", "manage", "single {Entity}" | **detail** | Two-column: summary card rail + editable form |
| "create", "add", "new", "register" | **form** | Single-column form, `.divider` section labels, wizard optional |
| "dashboard", "overview", "summary" | **dashboard** | `.bento` grid (if emitted) or `.card-grid`: hero stat + KPIs + recent table |
| "settings", "configuration", "preferences" | **settings** | `.divider`-separated sections, one card per group |

`page.type` values map to these same patterns: `list`, `detail`, `form`, `dashboard`, `settings`.

### 3. Generate the page HTML

Use `{KIT_DIR}/skills/generate-html/templates/page-shell.md` as the base structure.

The page is a **standalone HTML file** with full `<html><head><body>`.

**Mandatory head elements** (CDN-free — Alpine is vendored under `js/vendor/`, loaded LAST + deferred):
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{page.title} — {APP_TITLE}</title>
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
```

Note: APP_TITLE is derived from the `page.domain` or a generic "Prototype" — use what was passed.
store.js/app.js/data.js/navigation.js MUST come before the Alpine core script so their
`alpine:init` listeners register their stores/data factories before Alpine boots (order among
these four doesn't matter relative to each other).

**Body structure** (bare `x-data` on `<body>` is REQUIRED so Alpine removes the body's `x-cloak`).
Use the shell that matches the `design_ref` layout archetype:

`{ENTITY_DATA_CALL}` below is one of three generic Alpine data factory calls from `js/store.js`,
chosen by this page's type (see Step 2):
- list pages → `entityList('{Entity}')`
- detail pages → `entityDetail('{Entity}')`
- form/settings pages → `entityForm('{Entity}')`
- dashboard pages → `entityList('{Entity}')` as the default; a dashboard may also read other
  entities directly via `ProtoStore.all('{OtherEntity}')` in its own markup/computed values if it
  needs cross-entity KPIs.

`<main>` always carries `data-spec-screen="{page.spec_id}"` (see § Traceable markup) — this is the
one attribute present on every page regardless of type, so it is baked into both shells below.

SIDEBAR:
```html
<body x-data x-cloak>
  <div class="app">
    <aside class="sidebar">
      <!-- sidebar-header + nav (see §Navigation below) -->
    </aside>
    <main class="main" data-spec-screen="{page.spec_id}" x-data="{ENTITY_DATA_CALL}" x-init="init()">
      <div class="content">
        <!-- page-header -->
        <!-- four states -->
      </div>
      <!-- dev-panel (always last inside <main>) -->
    </main>
  </div>
  <!-- toast-container -->
</body>
```

TOP-NAV (wrap in `.app.app-topnav`, put brand + horizontal nav in `<header class="topnav">`):
```html
<body x-data x-cloak>
  <div class="app app-topnav">
    <header class="topnav">
      <a href="../index.html" class="sidebar-brand link">{App title}</a>
      <nav class="sidebar-nav" aria-label="Main navigation"><!-- nav markers only (see §Navigation below) --></nav>
    </header>
    <main class="main" data-spec-screen="{page.spec_id}" x-data="{ENTITY_DATA_CALL}" x-init="init()">
      <div class="content"><!-- page-header + four states --></div>
      <!-- dev-panel (always last inside <main>) -->
    </main>
  </div>
  <!-- toast-container -->
</body>
```

**Navigation sidebar** (same structure on all pages):

Nav is **NOT** authored here. Emit only the `<!-- nav:start -->`/`<!-- nav:end -->` markers from
`page-shell.md` verbatim, inside `<nav class="sidebar-nav" aria-label="Main navigation">` (or the
TOP-NAV equivalent):

```html
<div class="sidebar-header">
  <a href="../index.html" class="sidebar-brand link">{App title}</a>
  <span class="badge badge-primary">prototype</span>
</div>
<nav class="sidebar-nav" aria-label="Main navigation">
<!-- nav:start -->
<!-- nav:end -->
</nav>
```

`wire-nav.mjs` (run by `assembly-wiring` at Station 5, after every page exists) injects the full nav
into every page in one pass — this is what keeps nav in sync across all pages, including ones from a
previous run in append mode. Do not hand-write nav groups/items/icons here; that's no longer this
agent's job.

**Page header**: the primary action button MUST do something real — never a comment placeholder.
Wire it per § Interactions below: if an interaction's `trigger` text matches "add/create/new
{entity}" and its `response` opens a create form/modal, use that; otherwise (no such interaction
listed) default to opening a create modal if `page.components[]` names one (e.g.
`CreateProfileModal`), else navigate to a form page for this entity if one exists among the other
pages, else fall back to `$store.modal.open('create-{entity}')` wired to an in-page create form.
```html
<div class="page-header">
  <div>
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="../index.html">Home</a><span class="sep">/</span><span>{page.title}</span>
    </nav>
    <h1 class="page-title">{page.title}</h1>
  </div>
  <div class="page-actions">
    <button class="btn-primary" data-modal-open data-interaction="{INT-id, if this button is a
            page.interactions[] trigger}" @click="$store.modal.open('create-{entity}')">Add {entity}</button>
  </div>
</div>
```

### 3a. Components — `page.components[]`

Every name in `page.components[]` must correspond to a real, distinctly identifiable element in the
output — not necessarily a literal CSS class named after the component (there is no `.CreateProfileModal`
class), but a concrete pattern named via `data-component="{ExactName}"` on its outermost wrapper. A
component name tells you what to build:

- `*Modal` / `*ConfirmModal` → the modal pattern from `interaction-conventions.md` (`data-modal-open`
  trigger, `.modal[role="dialog"]`, `data-modal-close`), with `data-component` on the `.modal-overlay`.
- `*Form` → a real `<form>` (create or edit) per § Fields below, with `data-component` on the `<form>`.
- `*Table` / `*List` → the `.table`/`role="grid"` pattern, with `data-component` on the `.table`
  container.
- `*Header` / `*Readback` / `*Summary` → a read-only detail panel (`.card`), `data-component` on the
  `.card`.
- `*Actions` (e.g. `AcceptDeclineActions`, `CancelRequestAction`) → the button group implementing the
  entity's `page.transitions[]` (see § State transitions), `data-component` on the wrapping element.
- `*Explanation` / informational copy components → a `.card` or `<p>` block with the stated content,
  `data-component` on it.

If a component name implies something more specific than the generic page-type fallback (e.g. the
spec names `CreateProfileModal` + `RetireListingConfirmModal` on a detail page, not just "a detail
page"), build those named things — do not substitute the generic list/detail/form/dashboard template
in place of a component the spec explicitly asked for. Only when `page.components` is empty (or a
component truly has no clearer signal) fall back to the page-type heuristic's primary pattern.

### 3b. Interactions — `page.interactions[]`

Every entry must be wired on the element whose behavior matches its `trigger`/`response` text:
- `target` is already resolved to an HTML page id by `spec-model.mjs` — never the spec's `SCR-` id.
  A navigation interaction (the `response` says "open"/"view"/"navigate to" a record's detail) links
  to `href="./{target}.html?id=' + item.id"` (list/table rows — build the href with `:href` binding
  so `item.id` is interpolated) or `href="./{target}.html"` (a static nav, no record id). The `?id=`
  query param is read automatically by `entityDetail`/`entityForm` in `js/store.js` — see
  `ProtoStore.currentId()` and the `entityDetail`/`entityForm` factories — do not write any URL
  parsing yourself.
- A non-navigation interaction (open a modal, submit a form, accept/decline/cancel an action) is
  wired as its `response` describes, using the existing testable hooks (`data-modal-open` + a real
  store call, or a `page.transitions[]`-driven status update — see § State transitions).
- Alongside whatever hook the element already carries, add `data-interaction="{the interaction's
  id}"` so the trigger is traceable to the spec interaction it implements.
- Do not invent interactions `page.interactions` doesn't list, and do not skip one it does.

### 3c. Fields — `page.entity_fields[]`

- A `derived: true` field is shown **read-only** everywhere — a plain text/badge in a table cell or
  detail panel — never as a form `<input>`/`<select>`, even on a form/edit page for this entity.
- A field with a non-empty `values` array is its own enum (independent of the entity's status field);
  feed those exact values into a `.chip-row` of `.chip` filters and/or a `.badge` class mapping for
  that field — never invent a different value list for it.
- Every field-bound element (table column header + its cells, a form `<label>`+`<input>` pair, a
  detail-view read-only row) carries `data-field="{field.name}"` per § Traceable markup.

### 3d. State transitions — `page.transitions[]`

Each `{ from, to, actor, trigger }` entry becomes one real action — a button whose label is close to
its `trigger` text, calling `ProtoStore.update('{entity}', id, { status: '{to}' })` through the
page's own scope (the `entityDetail`/`entityForm` factory's record — e.g.
`@click="ProtoStore.update('{entity}', item.id, { status: '{to}' }); reload()"` on a detail page, or
the equivalent for a table row). Only emit a button for a transition whose `from` matches the
record's current status (gate with `x-show`, e.g. `x-show="item.status === '{from}'"`) — don't show
a transition that doesn't apply yet. Do not invent a transition the spec doesn't list; do not skip
one it does. `*Actions` components (§ 3a) are usually exactly this set of buttons.

### 3e. Roles — `page.roles`

When `page.roles` is non-empty, gate the page (or the specific role-dependent control, when the rest
of the page is shared across roles) with
`x-show="['Role1','Role2'].includes($store.session.role)"` — the exact array-literal `.includes(...)`
form, matching `Alpine.store('session', { role, roles, setRole })` in
`templates/runtime/store.js`. When `page.roles` is empty, do NOT add a role gate at all — per this
kit's convention (see `lib/spec-model.mjs`'s comments on `roles`), an empty list means any signed-in
role, not "no one".

### 3f. Acceptance criteria — `page.acceptance_criteria[]` (input, not markup)

`page.acceptance_criteria[]` is never rendered as markup, and there is no `data-ac` attribute — it is
**input** you read to decide what the happy/error/edge/permission paths on this screen must actually
do. An AC with `kind: permission` tells you which role gate (§ 3e) or disabled/hidden state to
implement and for whom; an AC with `kind: error` tells you the exact condition and copy the error
state (§ Four states below) should show; an AC with `kind: happy`/`edge` tells you what the success
path's data and copy should look like. Read every AC's `given`/`when`/`then` before writing the page
— they are the acceptance bar this screen is built against, even though none of their text appears
verbatim in the output.

**Four states** (always all four, always with correct `x-show`):

Loading:
```html
<div x-show="loading" data-state-root="loading" role="status" aria-label="Loading {page.title}">
  <div class="skeleton mb-2"></div>
  <div class="skeleton mb-2"></div>
  <div class="skeleton mb-2"></div>
  <div class="skeleton w-75 mb-2"></div>
  <div class="skeleton w-90"></div>
</div>
```

Error:
```html
<div x-show="!loading && error" data-state-root="error" class="alert alert-destructive" role="alert">
  <p x-text="error || 'Failed to load {entity}s. Please try again.'"></p>
  <button class="btn-secondary mt-2" @click="reload()">Retry</button>
</div>
```

Empty: the CTA must open the same create flow as the page-header button (§ Page header above), not
be inert — reuse the exact same `@click`/`href`, and give it a specific label, not "Add item".
```html
<div x-show="!loading && !error && items.length === 0" data-state-root="empty" class="empty-state">
  <div class="empty-state-icon">📭</div>
  <p class="empty-state-title">No {entity}s yet</p>
  <p class="empty-state-desc">{page.description} — nothing has been added yet.</p>
  <button class="btn-primary mt-4" data-modal-open @click="$store.modal.open('create-{entity}')">Add {entity}</button>
</div>
```

Success (list page example — adapt per page type; every button below is wired to a real action, and
the table uses `role="columnheader"` only on header cells — `scope="col"` is valid **only** on a real
`<th>`, never on a `<div>`; this kit's table is a div-based grid by design (see
`templates/runtime/css/components.css`'s `.table`/`.table-header`/`.table-cell` rules), so
`role="columnheader"` is the correct, HTML-valid substitute here):
```html
<div x-show="!loading && !error && items.length > 0" data-state-root="success">
  <!-- Filter bar -->
  <div class="filter-bar">
    <input class="form-input flex-1" type="search" placeholder="Search {entity}s…"
           x-model="filter.search" aria-label="Search {entity}s">
    <!-- Prefer a .chip-row of .chip filters fed by an entity_fields[] `values` enum or
         entity_statuses, per § Fields — a bare <select> is the fallback only when the modern
         layer's .chip-row isn't appropriate for this design direction. -->
    <select class="form-input w-sm" x-model="filter.status" aria-label="Filter by status" data-field="status">
      <option value="">All statuses</option>
      <template x-for="s in [{comma-separated entity_statuses as quoted strings}]" :key="s">
        <option :value="s" x-text="s"></option>
      </template>
    </select>
  </div>
  <!-- Table — data-component names the page.components[] entry this implements, e.g. "CatalogueList" -->
  <div class="table" role="grid" aria-label="{page.title}" data-component="{ExactComponentName, if page.components names this table}">
    <div class="table-header" role="row">
      <!-- One column per visible entity field — data-field names the entity_fields[] entry -->
      <div class="table-cell" role="columnheader" data-field="name">Name</div>
      <div class="table-cell" role="columnheader" data-field="status">Status</div>
      <!-- … more columns, one data-field each … -->
      <div class="table-cell table-cell-actions" role="columnheader">Actions</div>
    </div>
    <template x-for="item in filteredItems" :key="item.id">
      <div class="table-row" role="row">
        <div class="table-cell" x-text="item.name" role="gridcell" data-field="name"></div>
        <div class="table-cell" role="gridcell" data-field="status">
          <span class="badge" :class="{
            'badge-success': ['ACTIVE','APPROVED','COMPLETED'].includes(item.status),
            'badge-warning': ['PENDING','IN_PROGRESS','PROCESSING'].includes(item.status),
            'badge-destructive': ['DECLINED','FAILED','REJECTED'].includes(item.status),
            'badge-default': !['ACTIVE','APPROVED','COMPLETED','PENDING','IN_PROGRESS','PROCESSING','DECLINED','FAILED','REJECTED'].includes(item.status)
          }" x-text="item.status"></span>
        </div>
        <!-- … more cells, one data-field each … -->
        <div class="table-cell table-cell-actions" role="gridcell">
          <!-- "View" navigates to this row's detail page — wire per § Interactions when a
               page.interactions[] entry covers it, else default to the obvious detail page. -->
          <a class="btn-ghost btn-sm" :href="'./{detail-page-id}.html?id=' + item.id" aria-label="View details">View</a>
          <button class="btn-ghost btn-sm text-destructive" data-modal-open aria-label="Delete item"
                  @click="$store.modal.open('confirm-delete-' + item.id)">Delete</button>
        </div>
      </div>
    </template>
  </div>
</div>
```

**Apply the modern layer** (its classes are always available; signature classes only if `design_ref`
lists them):

- Wrap the page header in `.page-header-sticky` so it stays put on scroll.
- Prefer a `.chip-row` of `.chip` status filters over a second bare `<select>`; keep the search
  `<input type="search">` as the first control.
- Any numeric table cell or `.stat-value` gets `.num` so columns align. Pair a KPI with a
  `.delta .delta-up|-down` when the entity has a comparable figure.
- Use `.meter`/`.sparkbars` for proportions and trends — the kit ships no chart library, so never
  reference one.
- `.hover-lift` on cards and stat cards only. Never on `.table-row`, never on `.nav-item`.
- `.reveal` (+ `.reveal-2/-3/-4` to stagger) on **at most 6** first-screenful elements. Do not put it
  on anything inside an `x-for` — a re-render replays the animation on every filter keystroke.
- Empty states get a real next action in the button label, not "Add item".

For **detail** pages: two-column layout using `.card` panels (read-only fields on one side, edit
form on the other, toggle via `x-show`).
For **form** pages: a real `<form @submit.prevent="submit($el)" novalidate>` with a single-column
`.form-field` stack; every mandatory field carries `required`; a `type="submit"` primary button +
a `type="button"` cancel. Wire validation per `interaction-conventions.md` (invalid → add
`was-validated` + show `.form-error`; valid → success toast + `reset()`). This is what the render
check's form flow exercises.
For **dashboard** pages: follow the `design_ref` composition line. If `bento` was emitted, use
`.bento` with one `.bento-wide` hero stat (headline metric + `.delta` + `.sparkbars`), the remaining
`.stat-card` KPIs in single cells, and the recent-items `.table` in a `.bento-full` card. If `bento`
was **not** emitted, use `.card-grid` with 4 `.stat-card` KPIs + a recent-items `.table`. Four equal
cards in a row is the fallback, not the default.

Any modal you emit MUST use the testable hooks (`data-modal-open` on the trigger, `.modal` +
`role="dialog"`, `data-modal-close` on Cancel/overlay) — see `interaction-conventions.md`.

**Dev panel** (always the very last element inside `<main>`):
```html
<div class="dev-panel" role="toolbar" aria-label="Prototype controls">
  <span class="dev-panel-label">States:</span>
  <button class="btn-ghost btn-sm" @click="loading=true;error=null" title="Loading state" aria-label="Preview loading state">⏳</button>
  <button class="btn-ghost btn-sm" @click="items=[];loading=false;error=null" title="Empty state" aria-label="Preview empty state">📭</button>
  <button class="btn-ghost btn-sm" @click="error='Failed to load';loading=false" title="Error state" aria-label="Preview error state">❌</button>
  <button class="btn-ghost btn-sm" @click="loading=false;error=null;items=[...defaultItems]" title="Success state" aria-label="Preview success state">✅</button>
  <button class="btn-ghost btn-sm" @click="ProtoStore.resetAll(); reload()" title="Reset data" aria-label="Reset all data">🔄</button>
</div>
```

**Role-gated content**: see § 3e above — gate per `page.roles` using the
`['Role1','Role2'].includes($store.session.role)` form, and only when `page.roles` is non-empty.

### 4. Write the file

Write the complete HTML to `{output_path}` (in `MODE: create` — see § Edit mode for `MODE: edit`).

Before writing, if `{OUTPUT_DIR}/revisions/{page.id}.md` already exists, read it: it's a log of
every `CHANGE_REQUEST` previously applied to this exact page in a past edit cycle (see § Edit mode).
A full regeneration (this step, Step 4 in `MODE: create`) would otherwise silently lose that history
— fold those prior changes forward by re-applying them to the fresh HTML you're about to write,
instead of overwriting them. This is what stops a cascading design-system/component change from
erasing page-level fixes a human already approved in an earlier revise cycle. Do not delete or
rewrite `revisions/{page.id}.md` in `MODE: create` — it's `MODE: edit`'s append-only log.

### 5. Quality checklist (verify before returning)

- [ ] `<!DOCTYPE html>` and `<html lang="en">`
- [ ] `<title>`, `<meta charset>`, `<meta viewport>` present in `<head>`
- [ ] CSS links: `../css/tokens.css`, `../css/base.css`, `../css/components.css`
- [ ] JS scripts: `../js/store.js`, `../js/app.js`, `../js/data.js`, `../js/navigation.js` — all `defer`
- [ ] All four states present with correct `x-show` directives, each with its `data-state-root`
      (`loading`/`error`/`empty`/`success`)
- [ ] Dev panel present and is the last element in `<main>`
- [ ] Zero inline `<style>` blocks
- [ ] Zero inline `<script>` blocks
- [ ] Zero Tailwind: no `cdn.tailwindcss.com`, no utility classes outside the design_ref vocabulary
- [ ] Every class used appears in `design_ref` — including signature classes (a class from a
      non-emitted block renders as nothing)
- [ ] Composition matches the `design_ref` composition line for this page type
- [ ] `ux_directives` "All pages" rules applied; nothing from its "Do not" list present
- [ ] `.num` on numeric cells / stat values · `.chip-row` used instead of a second bare select
- [ ] `.hover-lift` only on cards/stat-cards · `.reveal` on ≤6 elements, none inside an `x-for`
- [ ] No chart library referenced — proportions use `.meter` / `.sparkbars`
- [ ] `<!-- nav:start -->`/`<!-- nav:end -->` markers present inside `<nav class="sidebar-nav">` (or
      the TOP-NAV equivalent) — no hand-authored nav items
- [ ] Shell matches the design_ref layout archetype (`.app` sidebar OR `.app.app-topnav` + `.topnav`)
- [ ] Any modal: `data-modal-open` trigger, `.modal[role="dialog"]`, `data-modal-close` on close/overlay
- [ ] Any form: real `<form>`, mandatory fields `required`, `type="submit"`, validation wired
- [ ] `aria-label` on every icon-only button
- [ ] Table has `role="grid"` and column headers with `role="columnheader"` (never `scope="col"` on
      a non-`<th>` element)
- [ ] `<main>` landmark and `<nav>` landmark present
- [ ] **Traceability**: `<main data-spec-screen="{page.spec_id}">` present; every `page.components[]`
      name appears as a `data-component` on a real, distinct element; every `page.interactions[]`
      entry has a `data-interaction` on its trigger; every rendered `entity_fields[]` entry has a
      `data-field` on its bound element(s)
- [ ] **Components implemented, not genericized**: every `page.components[]` name corresponds to the
      specific pattern it implies (§ 3a), not a substituted generic page-type fallback
- [ ] **Interactions wired**: every `page.interactions[]` trigger does something real; any navigation
      interaction's `href`/`:href` points at its resolved `target` page id
- [ ] **No dead buttons**: the page-header "Add", empty-state CTA, and any row "View"/navigation
      control all have a real `@click`/`href` — none is a bare label or a `/* comment */` handler
- [ ] **Fields**: every `derived: true` entity field renders read-only (never a form input); every
      `values`-bearing field uses its own exact value list, not an invented one
- [ ] **Transitions**: every `page.transitions[]` entry has a corresponding gated action button;
      none invented, none missing
- [ ] **Roles**: a role gate (`['Role1','Role2'].includes($store.session.role)`) is present when
      `page.roles` is non-empty, and absent when it is empty

Report: `{ page_id: "{page.id}", output: "{output_path}", status: "created" }`

---

## Edit mode (`MODE: edit`)

Used by the revise loop for a scoped, single-page change (see `agents/html-orchestrator.md` § Revise
flow and `agents/modification-router.md`) — `output_path` names an EXISTING file. Editing in place
instead of fully regenerating is what stops an unrelated second fix in the same revise request from
being silently dropped by a from-scratch rewrite (there is no `page` object rebuild here; the file on
disk is the base).

1. **Read** `{output_path}`. If it is missing, treat this as a hard failure — do not silently fall
   back to `MODE: create`; report the problem (edit mode implies the file should already exist).
2. Apply the change described in `CHANGE_REQUEST` with **targeted `Edit` calls** — the smallest diff
   that satisfies the request (a changed label, an added filter control, a newly-wired interaction,
   a fixed state), not a wholesale rewrite of the file's content.
3. While making that edit, still respect every hard rule this file sets for a fresh page: CDN-free
   (no inline `<style>`/`<script>`, no Tailwind utility classes), the testable hooks in
   `interaction-conventions.md`, and the traceability attributes (§ Traceable markup). If the
   existing file predates this phase and is missing something now required (e.g. an older page has
   no `data-spec-screen` on `<main>`, or a table still carries an invalid `scope="col"` on a
   `<div>`), **backfill that one gap** as part of this same edit — but only the gap actually touched
   or directly adjacent to the requested change; this is not license to regenerate the whole page
   under cover of a small fix (use `MODE: create` for that, which is a different task type).
4. **Revision log**: after applying the change, append one line to
   `{OUTPUT_DIR}/revisions/{page.id}.md` (create the file and `revisions/` directory if absent):
   ```markdown
   - {UTC timestamp, e.g. 2026-10-01T12:34:56Z}: {CHANGE_REQUEST verbatim}
   ```
   This is the log Step 4 of `MODE: create` reads back and folds forward on the next full
   regeneration, so a later cascading design-system change can never silently erase this edit.
5. Re-run the Quality checklist (Step 5) against the file as it now stands before reporting.

Report: `{ page_id: "{page.id}", output: "{output_path}", status: "edited" }`
