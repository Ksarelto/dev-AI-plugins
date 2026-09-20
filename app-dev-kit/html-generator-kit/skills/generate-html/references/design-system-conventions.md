# Design System Conventions — html-generator-kit

The visual contract. `design-system-author` owns the CSS files; every other agent consumes the
compact `design-system-ref.md` and uses ONLY the class vocabulary below. **CDN-free** — there is no
Tailwind runtime, so Tailwind utility classes (`p-6`, `w-64`, `flex`, `text-sm`, `bg-card`, …) must
NOT appear in output. Use the classes defined in `css/components.css`.

---

## File load order (every page, in `<head>`)

```html
<link rel="stylesheet" href="../css/tokens.css">
<link rel="stylesheet" href="../css/base.css">
<link rel="stylesheet" href="../css/components.css">
```
(index.html uses non-prefixed `css/…`.)

## Tokens (reference as `var(--token)`, never `hsl(var(--token))`)

Surface: `--background --foreground --card --card-foreground --popover`
Brand: `--primary --primary-foreground --primary-hover --accent --accent-foreground`
Subtle: `--muted --muted-foreground --secondary --secondary-hover`
Feedback: `--success --warning --destructive` (+ `-foreground`, `-subtle` variants)
Lines: `--border --input --ring`
Shape: `--radius --radius-sm --radius-lg` · Elevation: `--shadow-sm --shadow-md --shadow-lg`
Type: `--text-xs … --text-3xl` · Layout: `--sidebar-width --content-max`
Motion: `--dur-fast --dur-base --dur-slow --ease-out --ease-spring --lift`

## Structural classes

- Shell: `.app > .sidebar + .main > .content`
- Sidebar: `.sidebar-header .sidebar-brand .sidebar-nav`
- Nav: `.nav-group .nav-group-label .nav-item .nav-item-active`
- Header: `.page-header .page-title .page-subtitle .page-actions .breadcrumb`

## Component classes

- `.card .card-header .card-content .card-footer .card-link .card-grid`
- `.stat-card .stat-value .stat-label`
- `.badge` + `.badge-default|-primary|-success|-warning|-destructive`
- `.btn-primary|-secondary|-ghost|-destructive` (+ `.btn-sm .btn-icon`)
- `.table .table-header .table-row .table-cell .table-cell-actions`
- `.form-field .form-label .form-input .form-textarea .form-error .form-hint .filter-bar`
- `.empty-state .empty-state-icon .empty-state-title .empty-state-desc`
- `.skeleton .alert .alert-destructive .alert-success`
- `.modal-overlay .modal .modal-title .modal-actions`
- `.dev-panel .dev-panel-label .toast-container`

## Modern layer (always emitted — see `templates/modern-signature-css.md`)

- Chrome: `.page-header-sticky`
- Filters: `.chip-row .chip .chip-active`
- Numbers: `.num` · `.delta .delta-up .delta-down .delta-flat`
- Proportions: `.meter .meter-fill` · `.sparkbars` (+ `> i` with an inline `height:N%`)
- Identity/keys: `.avatar .avatar-group .kbd .divider`
- Motion: `.hover-lift` (cards only) · `.reveal .reveal-2 .reveal-3 .reveal-4`

## Signature layer (0–3 blocks, only what `design-brief.md` selected)

`bento` → `.bento .bento-wide .bento-full .bento-tall` · `glass` → `.surface-glass` ·
`gradient` → `.text-gradient .surface-mesh` · `edge-accent` → `.card-accent` ·
`soft-depth` → (restyles `.card/.modal/.stat-card`) · `editorial` → `.lede` ·
`underline-nav` → `.tab-row .tab .tab-active`

A block that was not emitted defines no CSS — using its classes renders as nothing. The authoritative
list of what exists for a given prototype is the "Signature classes" section of its
`design-system-ref.md`, not this file.

## Utility layer (safe names only)

Layout: `.flex .flex-col .flex-1 .items-center .items-start .justify-between .justify-end .flex-wrap .grid .hidden .block`
Size: `.w-full .w-sm .w-75 .w-90` · Gap: `.gap-1 .gap-2 .gap-3 .gap-4`
Space: `.mt-1 .mt-2 .mt-4 .mb-1 .mb-2 .mb-3 .mb-4 .mb-6 .mb-8 .ml-2 .mr-1 .mr-2 .mx-auto`
Text: `.text-xs .text-sm .text-lg .text-xl .text-2xl .font-medium .font-semibold .uppercase .tracking-wide .link`
Colour: `.text-muted(.text-muted-foreground) .text-primary .text-destructive .text-success .bg-card .border .rounded`

## Status → badge mapping

| Status keywords | Badge |
|-----------------|-------|
| NEW, DEFAULT, DRAFT | `badge-default` |
| ACTIVE, APPROVED, SUCCESS, COMPLETED | `badge-success` |
| PENDING, IN_PROGRESS, PROCESSING | `badge-warning` |
| DECLINED, FAILED, REJECTED, DELETED | `badge-destructive` |

## Hard rules

- No inline `<style>` or `<script>` (only `src=` scripts). No Tailwind classes. No hard-coded hex —
  use tokens. Dark mode via `.dark` on `<html>` (theme store handles it).
- Motion is CSS-only: transitions, keyframes, and the `prefers-reduced-motion` guard. No JS animation
  library, no GSAP, no chart library — proportions use `.meter` / `.sparkbars`.
- `!important` appears only inside the reduced-motion guard.
