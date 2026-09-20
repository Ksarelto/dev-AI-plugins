# QA Checklist — html-generator-kit

Requirements that `qa-validator` checks and `screen-generator` self-validates against.

---

## Coverage (spec → prototype completeness)

| # | Check | Severity | Who checks |
|---|-------|----------|-----------|
| C1 | Every page ID from `pages[]` has a corresponding `pages/{id}.html` | CRITICAL | qa-validator |
| C2 | `index.html` links to every page ID | CRITICAL | qa-validator |
| C3 | `navigation.js` PAGES_ARRAY contains every page ID | CRITICAL | qa-validator |
| C4 | `css/tokens.css`, `css/base.css`, `css/components.css` all exist | CRITICAL | qa-validator |

---

## Per-Page Structure

| # | Check | Severity | Who checks |
|---|-------|----------|-----------|
| S1 | Loading state: `x-show="loading"` present | CRITICAL | screen-generator + qa-validator |
| S2 | Error state: `x-show` expression matching `error` present | CRITICAL | screen-generator + qa-validator |
| S3 | Empty state: `x-show` expression matching `items.length === 0` present | CRITICAL | screen-generator + qa-validator |
| S4 | Success state: `x-show` expression matching success condition present | CRITICAL | screen-generator |
| S5 | Dev panel: element with `class="dev-panel"` present as last child of `<main>` | CRITICAL | screen-generator + qa-validator |
| S6 | No inline `<style>` blocks in `<body>` | CRITICAL | screen-generator + qa-validator |
| S7 | No inline `<script>` blocks (no `<script>` without `src=` attribute) | CRITICAL | screen-generator + qa-validator |
| S8 | `<!DOCTYPE html>` present | WARNING | screen-generator |
| S9 | `<html lang="en">` present | WARNING | screen-generator |
| S10 | `<title>` tag present | WARNING | qa-validator |
| S11 | `<meta name="viewport"` present | WARNING | qa-validator |

---

## File Separation

| # | Check | Severity | Who checks |
|---|-------|----------|-----------|
| F1 | CSS only in `css/*.css` files — no inline styles | CRITICAL | qa-validator (grep `<style`) |
| F2 | JS only in `js/*.js` files — no inline scripts | CRITICAL | qa-validator (grep `<script` without `src=`) |
| F3 | Page files use relative `../css/` and `../js/` paths | CRITICAL | screen-generator |
| F4 | index.html uses non-prefixed `css/` and `js/` paths | CRITICAL | assembly-wiring |

---

## Accessibility (WCAG 2.2 AA baseline)

| # | Check | Severity | Who checks |
|---|-------|----------|-----------|
| A1 | `<main>` landmark present on every page | CRITICAL | qa-validator |
| A2 | `<nav>` landmark with `aria-label` present on every page | CRITICAL | qa-validator |
| A3 | `aria-label` on every icon-only button (`<button>` with no text content) | CRITICAL | screen-generator |
| A4 | Data tables have `role="grid"` or `role="table"` | WARNING | qa-validator |
| A5 | Table column headers have `scope="col"` | WARNING | screen-generator |
| A6 | Loading state has `role="status"` and `aria-label` | WARNING | screen-generator |
| A7 | Error state has `role="alert"` | WARNING | screen-generator |
| A8 | Modal/dialog has `role="dialog"`, `aria-modal`, `aria-labelledby`, `x-trap`, Escape close | CRITICAL | screen-generator |
| A9 | Active nav link has `aria-current="page"` (set by navigation.js) | WARNING | assembly-wiring |
| A10 | No placeholder text as actual labels (must use `<label>` or `aria-label`) | WARNING | screen-generator |

---

## Alpine Correctness

| # | Check | Severity | Who checks |
|---|-------|----------|-----------|
| AL1 | `x-data` and `x-init="init()"` on `<main>` | CRITICAL | screen-generator |
| AL2 | `x-cloak` on `<body>` | WARNING | screen-generator |
| AL3 | Dev panel buttons target correct Alpine expressions | CRITICAL | screen-generator |
| AL4 | `$store.modal` used for dialogs (not custom implementation) | WARNING | screen-generator |
| AL5 | `filteredItems` used in `x-for` (not `items` directly, unless no filter) | WARNING | screen-generator |

---

## Content Quality

| # | Check | Severity | Who checks |
|---|-------|----------|-----------|
| Q1 | No "Lorem ipsum" placeholder text | WARNING | qa-validator |
| Q2 | No "TODO" / "PLACEHOLDER" text | WARNING | qa-validator |
| Q3 | Mock data has ≥ 4 records per entity | WARNING | component-library-author |
| Q4 | Mock data includes all status variants | WARNING | component-library-author |
| Q5 | Empty state has a primary CTA button | WARNING | screen-generator |
| Q6 | Error state has a Retry action | WARNING | screen-generator |

---

## Interaction Hooks (make functionality testable — see interaction-conventions.md)

| # | Check | Severity | Who checks |
|---|-------|----------|-----------|
| I1 | Modal trigger carries `data-modal-open` | WARNING (static) / CRITICAL (Station 6.5) | screen-generator + qa-validator |
| I2 | Modal close control carries `data-modal-close` (+ overlay `@click.self`, Escape) | WARNING / CRITICAL | screen-generator + qa-validator |
| I3 | Forms use real `<form>`, mandatory fields `required`, a `type="submit"` control | WARNING / CRITICAL | screen-generator + qa-validator |
| I4 | Nav links resolve to existing files (no dead links) | CRITICAL | verify-prototype.mjs |

---

## Render, Functionality & Design (Station 6.5 — browser-verified)

| # | Check | Severity | Who checks |
|---|-------|----------|-----------|
| R1 | Page renders: root font ≥ 14px, `.btn-primary` has background, and any present `.sidebar` ≥200px / `.topnav` ≥40px (shell-less auth pages exempt) | CRITICAL | verify-prototype.mjs |
| R2 | Navigation flow: every `a[href$=".html"]` target exists | CRITICAL | verify-prototype.mjs |
| R3 | Modal flow: `[data-modal-open]` opens `.modal[role=dialog]`; `[data-modal-close]`/Escape closes it | CRITICAL | verify-prototype.mjs |
| R4 | Form flow: empty required submit blocked; filled submit succeeds | CRITICAL / WARNING | verify-prototype.mjs |
| R5 | Dev-panel cycles loading/empty/error/success | WARNING | verify-prototype.mjs |
| R6 | Accessibility (axe): critical-impact = critical, serious = warning | CRITICAL / WARNING | verify-prototype.mjs |
| D1 | Design brief exists; CSS has no leftover `⟨SLOT⟩` markers (design actually applied) | CRITICAL | design-system-author + qa-validator |

---

## Design Currency (the modern signature layer — see modern-signature-css.md)

| # | Check | Severity | Who checks |
|---|-------|----------|-----------|
| M1 | `ux-directives.md` exists and is non-empty | CRITICAL | orchestrator (Station 1.5 gate) |
| M2 | Motion tokens `--dur-fast/-base/-slow`, `--lift`, `--ease-out` present in `tokens.css` | CRITICAL | design-system-author + qa-validator |
| M3 | `prefers-reduced-motion` guard present in `components.css` | CRITICAL | design-system-author + qa-validator |
| M4 | One `:focus-visible` ring rule present in `components.css` | CRITICAL | design-system-author + qa-validator |
| M5 | Brief names 1–3 signature blocks; `components.css` contains exactly those | WARNING | design-system-author + qa-validator |
| M6 | No `!important` outside the reduced-motion guard | WARNING | qa-validator |
| M7 | Pages use at least one modern-layer class (`.num`, `.chip`, `.hover-lift`, `.reveal`, `.bento`) | WARNING | qa-validator |
| M8 | Numeric table cells / stat values carry `.num` (tabular figures) | WARNING | screen-generator + qa-validator |
| M9 | No signature class used in a page whose block was not emitted | WARNING | qa-validator |
| M10 | `.reveal` not used inside an `x-for` template | WARNING | screen-generator + qa-validator |
| M11 | No chart library referenced (`chart.js`, `d3`, `apexcharts`, `echarts`) | WARNING | qa-validator |
| M12 | `pro-rules:` misses from `{UIUX_DIR}/references/pro-rules.md` | WARNING (skipped when unavailable) | qa-validator |

---

## Severity Definitions

| Severity | Blocks publish? | Action on failure |
|----------|----------------|-------------------|
| CRITICAL | YES | Must fix before human review |
| WARNING | NO | Included in review packet; non-blocking |
