# Template: design-system-ref.md

Static body of `{OUTPUT_DIR}/design-system-ref.md`. `scripts/apply-design-brief.mjs` prepends the
`## Provided reference` and `## Design direction` blocks from the brief's slots and replaces
`⟨SIGNATURE_CLASSES⟩` with the classes of the emitted signature blocks only.

```markdown
## CSS load order (page: ../css/… · index.html: css/…)
<link rel="stylesheet" href="../css/tokens.css">
<link rel="stylesheet" href="../css/base.css">
<link rel="stylesheet" href="../css/components.css">

## JS load order (every page) — app/data/navigation BEFORE Alpine core
<script src="../js/app.js" defer></script>
<script src="../js/data.js" defer></script>
<script src="../js/navigation.js" defer></script>
<script src="https://cdn.jsdelivr.net/npm/@alpinejs/focus@3.x.x/dist/cdn.min.js" defer></script>
<script src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js" defer></script>

## Tokens — reference as var(--token), NEVER hsl(var(--token))
--background --foreground --card --card-foreground --popover --overlay
--primary --primary-foreground --primary-hover --accent --accent-foreground
--muted --muted-foreground --secondary --secondary-hover
--success --warning --destructive (+ -foreground, -subtle)
--border --input --ring · --radius(-sm/-lg) · --shadow-sm/-md/-lg · --text-xs…-3xl
--font-sans --font-display · --control-py/px --cell-py/px --card-pad --main-pad-y/x
--dur-fast/-base/-slow --ease-out --ease-spring --lift

## Shell (mandatory structure — matches the layout archetype above)
SIDEBAR:
<div class="app"><aside class="sidebar">…</aside><main class="main"><div class="content">…</div></main></div>
TOP-NAV:
<div class="app app-topnav"><header class="topnav">…</header><main class="main"><div class="content">…</div></main></div>
- Sidebar parts: .sidebar-header .sidebar-brand .sidebar-nav (nav lives in .sidebar or .topnav)
- Header: .page-header .page-title .page-subtitle .page-actions .breadcrumb

## Typography (utility classes)
- Page title: class="page-title" · Section: class="text-xl font-semibold"
- Body: default · Caption/muted: class="text-sm text-muted"

## Component classes
- .card .card-header .card-content .card-footer .card-link .card-grid
- .stat-card .stat-value .stat-label
- .badge .badge-default|-primary|-success|-warning|-destructive
- .btn-primary|-secondary|-ghost|-destructive (+ .btn-sm .btn-icon)
- .table .table-header .table-row .table-cell .table-cell-actions
- .form-field .form-label .form-input .form-textarea .form-error .filter-bar
- .empty-state .empty-state-icon .empty-state-title .empty-state-desc
- .skeleton .alert .alert-destructive .alert-success
- .modal-overlay .modal .modal-title .modal-actions
- .dev-panel .dev-panel-label .toast-container

## Modern layer (always available)
- Sticky header: .page-header-sticky (wrap .page-header so it stays put on long pages)
- Filters: .chip-row > .chip / .chip-active  ← prefer over a row of bare selects
- Numbers: .num (tabular figures) · .delta .delta-up|-down|-flat
- Meters/mini-charts: .meter > .meter-fill · .sparkbars > i (inline style="height:N%")
- Identity/keys: .avatar .avatar-group · .kbd · .divider
- Motion: .hover-lift (cards/stat-cards only) · .reveal .reveal-2 .reveal-3 .reveal-4
  (first screenful only, ≤6 per page). Reduced-motion is handled in CSS — never gate it in markup.

## Signature classes (ONLY these were emitted — no others exist)
⟨SIGNATURE_CLASSES⟩

## Utility layer (safe names — NO Tailwind, no slashes/colons)
.flex .flex-col .flex-1 .items-center .items-start .justify-between .justify-end .flex-wrap .grid .hidden .block
.w-full .w-sm .w-75 .w-90 · .gap-1/-2/-3/-4
.mt-1/-2/-4 .mb-1/-2/-3/-4/-6/-8 .ml-2 .mr-1/-2 .mx-auto
.text-xs/-sm/-lg/-xl/-2xl .font-medium .font-semibold .uppercase .tracking-wide .link
.text-muted .text-primary .text-destructive .text-success .bg-card .border .rounded

## Status → badge class mapping
| Status | Class |
|--------|-------|
| NEW, DEFAULT, DRAFT | badge-default |
| ACTIVE, APPROVED, SUCCESS, COMPLETED | badge-success |
| PENDING, IN_PROGRESS, PROCESSING | badge-warning |
| DECLINED, FAILED, REJECTED, DELETED | badge-destructive |

## Navigation active state
navigation.js adds `nav-item-active` + `aria-current="page"` to the link whose
`data-nav-id` matches the current page. Use:
<a href="./{id}.html" class="nav-item" data-nav-id="{id}">ICON Title</a>
```
