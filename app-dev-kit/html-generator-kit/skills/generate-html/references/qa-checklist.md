# QA Checklist — html-generator-kit

Requirements that `qa-static.mjs` checks and `screen-generator` self-validates against.

---

## Coverage (spec → prototype completeness)

| # | Check | Severity | Who checks |
|---|-------|----------|-----------|
| C1 | Every page ID from `pages[]` has a corresponding `pages/{id}.html` | CRITICAL | qa-static.mjs |
| C2 | `index.html` links to every page ID | CRITICAL | qa-static.mjs |
| C3 | `navigation.js` PAGES_ARRAY contains every page ID | CRITICAL | qa-static.mjs |
| C4 | `css/tokens.css`, `css/base.css`, `css/components.css` all exist | CRITICAL | qa-static.mjs |

---

## Per-Page Structure

| # | Check | Severity | Who checks |
|---|-------|----------|-----------|
| S1 | Loading state: `x-show="loading"` present | CRITICAL | screen-generator + qa-static.mjs |
| S2 | Error state: `x-show` expression matching `error` present | CRITICAL | screen-generator + qa-static.mjs |
| S3 | Empty state: `x-show` expression matching `items.length === 0` present | CRITICAL | screen-generator + qa-static.mjs |
| S4 | Success state: `x-show` expression matching success condition present | CRITICAL | screen-generator |
| S5 | Dev panel: element with `class="dev-panel"` present as last child of `<main>` | CRITICAL | screen-generator + qa-static.mjs |
| S6 | No inline `<style>` blocks in `<body>` | CRITICAL | screen-generator + qa-static.mjs |
| S7 | No inline `<script>` blocks (no `<script>` without `src=` attribute) | CRITICAL | screen-generator + qa-static.mjs |
| S8 | `<!DOCTYPE html>` present | WARNING | screen-generator |
| S9 | `<html lang="en">` present | WARNING | screen-generator |
| S10 | `<title>` tag present | WARNING | qa-static.mjs |
| S11 | `<meta name="viewport"` present | WARNING | qa-static.mjs |

---

## File Separation

| # | Check | Severity | Who checks |
|---|-------|----------|-----------|
| F1 | CSS only in `css/*.css` files — no inline styles | CRITICAL | qa-static.mjs (grep `<style`) |
| F2 | JS only in `js/*.js` files — no inline scripts | CRITICAL | qa-static.mjs (grep `<script` without `src=`) |
| F3 | Page files use relative `../css/` and `../js/` paths | CRITICAL | screen-generator |
| F4 | index.html uses non-prefixed `css/` and `js/` paths | CRITICAL | assembly-wiring |

---

## Accessibility (WCAG 2.2 AA baseline)

| # | Check | Severity | Who checks |
|---|-------|----------|-----------|
| A1 | `<main>` landmark present on every page | CRITICAL | qa-static.mjs |
| A2 | `<nav>` landmark with `aria-label` present on every page | CRITICAL | qa-static.mjs |
| A3 | `aria-label` on every icon-only button (`<button>` with no text content) | CRITICAL | screen-generator |
| A4 | Data tables have `role="grid"` or `role="table"` | WARNING | qa-static.mjs |
| A5 | Table column headers have `role="columnheader"` (never `scope="col"` — this kit's table is a div-based grid, and `scope` is valid only on a real `<th>`) | WARNING | screen-generator |
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
| Q1 | No "Lorem ipsum" placeholder text | WARNING | qa-static.mjs |
| Q2 | No "TODO" / "PLACEHOLDER" text | WARNING | qa-static.mjs |
| Q3 | Mock data has 6–8 records per entity | WARNING | component-library-author |
| Q4 | Mock data includes all status variants | WARNING | component-library-author |
| Q5 | Empty state has a primary CTA button | WARNING | screen-generator |
| Q6 | Error state has a Retry action | WARNING | screen-generator |

---

## Interaction Hooks (make functionality testable — see interaction-conventions.md)

| # | Check | Severity | Who checks |
|---|-------|----------|-----------|
| I1 | Modal trigger carries `data-modal-open` | WARNING (static) / CRITICAL (Station 6.5) | screen-generator + qa-static.mjs |
| I2 | Modal close control carries `data-modal-close` (+ overlay `@click.self`, Escape) | WARNING / CRITICAL | screen-generator + qa-static.mjs |
| I3 | Forms use real `<form>`, mandatory fields `required`, a `type="submit"` control | WARNING / CRITICAL | screen-generator + qa-static.mjs |
| I4 | Nav links resolve to existing files (no dead links) | CRITICAL | verify-prototype.mjs |

Nav *consistency* across pages (same groups/order/links on every page, including `index.html`) is
enforced by `wire-nav.mjs`'s exit code at Station 5, not by qa-static.mjs — see `agents/assembly-wiring.md`.

---

## Render, Functionality & Design — Phase 6 additions (Station 6.5, browser-verified)

| # | Check | Severity | Who checks |
|---|-------|----------|-----------|
| R7 | No horizontal overflow at the 390px mobile viewport (`documentElement.scrollWidth > clientWidth`) | CRITICAL | verify-prototype.mjs |
| R7a | No clipped `overflow: hidden` content at 390px (capped at 3 reported/page) | WARNING | verify-prototype.mjs |
| R8 | A `## Binding reference` locked token's ACTUAL computed `getComputedStyle(:root)` value matches the design brief (only with `--brief`) | CRITICAL | verify-prototype.mjs |
| R9 | `<main data-spec-screen>`, every `page.components[]` has a `data-component`, every `page.interactions[]` has a `data-interaction` whose target (if any) lands on the right page (only with `--model`) | CRITICAL | verify-prototype.mjs |
| R10 | Every non-derived `entity_fields[].name` has a `data-field` somewhere on the page (only with `--model`) | WARNING | verify-prototype.mjs |
| R11 | `entity_statuses[]` enum values appear somewhere in rendered text/classes (only with `--model`) | WARNING | verify-prototype.mjs |
| R12 | A role-restricted screen (`page.roles[]` non-empty) references `$store.session.role` somewhere in its source (only with `--model`) | WARNING | verify-prototype.mjs |
| R13 | A visible `<button>` that is not a modal trigger, a form submit, or inside `.dev-panel` has an observable effect when clicked (URL/toast-state/body-length change) | WARNING (heuristic) | verify-prototype.mjs |
| R14 | A `console.warn` matching `/alpine/i` (an Alpine expression error) | CRITICAL | verify-prototype.mjs |
| R15 | A same-origin (local) asset request 404s/fails | CRITICAL | verify-prototype.mjs |
| R16 | A cross-origin request (e.g. a Google Fonts `@import`) 404s/fails | WARNING | verify-prototype.mjs |

Form/modal checks (I1–I3 above) now loop over EVERY form/modal on a page, not just the first, and
the "empty submit blocked" check requires `.form-error` visible or `form.was-validated` — bare
`:invalid` no longer satisfies it, and a blocked-but-still-saved submit (success signal present
despite being blocked) is also critical. A valid submit missing a success signal is now CRITICAL
(was a warning before Phase 6). See `verification-protocol.md` for the full station-order and
clean-state-before-mutation rationale.

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
| D1 | Design brief exists; CSS has no leftover `⟨SLOT⟩` markers (design actually applied) | CRITICAL | design-system-author + qa-static.mjs |

---

## Design Currency (the modern signature layer — see modern-signature-css.md)

| # | Check | Severity | Who checks |
|---|-------|----------|-----------|
| M1 | `ux-directives.md` exists and is non-empty | CRITICAL | orchestrator (Station 1.5 gate) |
| M2 | Motion tokens `--dur-fast/-base/-slow`, `--lift`, `--ease-out` present in `tokens.css` | CRITICAL | design-system-author + qa-static.mjs |
| M3 | `prefers-reduced-motion` guard present in `components.css` | CRITICAL | design-system-author + qa-static.mjs |
| M4 | One `:focus-visible` ring rule present in `components.css` | CRITICAL | design-system-author + qa-static.mjs |
| M5 | Brief names 1–3 signature blocks; `components.css` contains exactly those | WARNING | design-system-author + qa-static.mjs |
| M6 | No `!important` outside the reduced-motion guard | WARNING | qa-static.mjs |
| M7 | Pages use at least one modern-layer class (`.num`, `.chip`, `.hover-lift`, `.reveal`, `.bento`) | WARNING | qa-static.mjs |
| M8 | Numeric table cells / stat values carry `.num` (tabular figures) | WARNING | screen-generator + qa-static.mjs |
| M9 | No signature class used in a page whose block was not emitted | WARNING | qa-static.mjs |
| M10 | `.reveal` not used inside an `x-for` template | WARNING | screen-generator + qa-static.mjs |
| M11 | No chart library referenced (`chart.js`, `d3`, `apexcharts`, `echarts`) | WARNING | qa-static.mjs |
| M12 | `pro-rules:` misses from `{UIUX_DIR}/references/pro-rules.md` | WARNING (skipped when unavailable) | qa-static.mjs |

---

## Severity Definitions

| Severity | Blocks publish? | Action on failure |
|----------|----------------|-------------------|
| CRITICAL | YES | Must fix before human review |
| WARNING | NO | Included in review packet; non-blocking |
