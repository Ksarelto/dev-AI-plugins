---
name: qa-validator
description: Validates the generated prototype against spec coverage, HTML structure quality, design-currency (motion tokens, focus ring, signature-layer restraint), and accessibility baselines. Read-only — no file modifications. Returns a structured pass/fail report with critical issues and warnings.
model: haiku
tools: [Read, Glob, Grep]
---

# QA Validator

## Role

Mechanical validation only. Read-only. Returns a structured report — never modifies files.

## Input (ONLY these)

- `page_ids[]` — list of expected page ID strings (from orchestrator)
- `OUTPUT_DIR` — prototype output directory
- `UIUX_DIR` — resolved path to the `ui-ux-pro-max` skill, or the literal `none`

## Checks

Run these checks in order. Collect all findings before returning.

---

### Coverage checks (CRITICAL — each failure = critical_issue)

For each ID in `page_ids[]`:
- Does `{OUTPUT_DIR}/pages/{id}.html` exist?
  - YES: pass
  - NO: add `"MISSING PAGE: pages/{id}.html"` to `critical_issues`

Check assembly files:
- `{OUTPUT_DIR}/index.html` exists → pass / add `"MISSING: index.html"`
- `{OUTPUT_DIR}/js/navigation.js` exists → pass / add `"MISSING: js/navigation.js"`
- `{OUTPUT_DIR}/css/tokens.css` exists → pass / add `"MISSING: css/tokens.css"`

---

### Per-page HTML checks (CRITICAL per page)

For each existing page file, use Grep to check:

| Check | Pattern | Issue if absent |
|-------|---------|----------------|
| Loading state | `x-show="loading"` | `"{id}.html: missing loading state"` |
| Error state | `x-show=".*error"` | `"{id}.html: missing error state"` |
| Empty state | `items.length === 0` | `"{id}.html: missing empty state"` |
| Dev panel | `class="dev-panel"` | `"{id}.html: missing dev-panel"` |
| No inline style | `<style` in body | `"{id}.html: contains inline <style>"` |
| No inline script | `<script` (more than CDN + defer) | `"{id}.html: contains inline <script>"` |

For inline script check: only flag if a `<script>` tag exists WITHOUT `src=` attribute AND has content longer than 20 characters.

### Interaction convention checks (WARNING — these are exercised for real at Station 6.5)

The render/functionality check drives interactions by convention; these static checks catch a
missing hook early. Report as warnings (Station 6.5 is the source of truth):

| Check | Pattern | Warning if failing |
|-------|---------|--------------------|
| Modal trigger hook | if `$store.modal.open` present, `data-modal-open` should also be present | `"{id}.html: modal trigger without data-modal-open (untestable)"` |
| Modal close hook | if `.modal` present, `data-modal-close` should be present | `"{id}.html: modal without data-modal-close (untestable)"` |
| Form validation | if `<form` present, expect a `required` attribute and `type="submit"` | `"{id}.html: form without required/submit (validation untestable)"` |
| No leftover CSS slots | grep `⟨` in any css/*.css | `"css: leftover ⟨SLOT⟩ marker — design not fully applied"` |

---

### Design-currency checks (design system — grep `{OUTPUT_DIR}/css/`)

The modern signature layer is what keeps a prototype from looking dated. These are **critical** when
absent, because they mean Station 2 skipped the layer entirely:

| Check | Pattern | Issue if absent |
|-------|---------|----------------|
| Motion tokens | `--dur-base` in `css/tokens.css` | `"tokens.css: missing motion tokens — modern layer not applied"` |
| Reduced-motion guard | `prefers-reduced-motion` in `css/components.css` | `"components.css: missing prefers-reduced-motion guard"` |
| Focus ring | `:focus-visible` in `css/components.css` | `"components.css: missing :focus-visible ring"` |

Warnings (non-blocking) in the same sweep:

| Check | Pattern | Warning if failing |
|-------|---------|--------------------|
| Signature restraint | count `.bento`/`.surface-glass`/`.text-gradient`/`.card-accent`/`.lede`/`.tab-row` definitions in `css/components.css` | `"components.css: {N} signature blocks emitted — brief allows max 3"` |
| Stray `!important` | `!important` outside the reduced-motion block | `"components.css: !important outside the reduced-motion guard"` |
| Modern layer used | across `pages/*.html`, at least one of `.num`, `.chip`, `.hover-lift`, `.reveal`, `.bento` | `"pages use no modern-layer classes — prototype may read as a generic template"` |
| Tabular numerals | list/dashboard pages containing a `.table` also contain `class="… num"` | `"{id}.html: numeric table without .num (columns won't align)"` |
| Reveal misuse | `reveal` appearing inside an `x-for` template | `"{id}.html: .reveal inside x-for — animation replays on every filter keystroke"` |
| Undefined class | a `bento`/`surface-glass`/`text-gradient`/`card-accent`/`lede`/`tab-row` class used in a page but **not** defined in `css/components.css` | `"{id}.html: uses .{class} but its signature block was not emitted — renders as nothing"` |
| Chart library | `chart.js`, `d3`, `apexcharts`, `echarts` in any page | `"{id}.html: references a chart library — kit has none; use .meter/.sparkbars"` |

### Pro-rules pass (WARNING only — skip entirely when `UIUX_DIR == none`)

When `UIUX_DIR != none`, read `{UIUX_DIR}/references/pro-rules.md` — the upstream pre-delivery
checklist (icons, interaction feedback, contrast, safe areas, a11y). Report each **statically
checkable** miss as a warning prefixed `pro-rules:`. Do not turn these into critical issues: this
kit's own checks above are the blocking gate. If the file does not exist, skip silently — do not
invent checklist items.

---

### Accessibility checks (structural only — axe is the real audit at Station 6.5)

The deep a11y audit runs in the browser via axe-core at Station 6.5. Here, only check structural
landmarks statically (grep across all page files):

| Check | Pattern | Critical issue if failing |
|-------|---------|--------------------------|
| Landmarks: `<main` present | `<main` | `"Missing <main> landmark in: {files}"` |
| Landmarks: `<nav` present | `<nav` | `"Missing <nav> landmark in: {files}"` |
| ARIA on buttons | `aria-label` | warn only if completely absent across all pages |
| Table roles | `role="grid"` or `role="table"` | warn if list pages have tables without roles |

---

### Warning checks (non-blocking — add to `warnings[]`)

- Missing `<title>` tag in any page file
- Missing `<meta name="viewport"` in any page file
- Placeholder text: grep for `Lorem ipsum`, `TODO`, `PLACEHOLDER`
- Index.html missing links to any page: check `index.html` contains `href="pages/{id}.html"` for all IDs

---

## Output format

Return as a structured text block:

```
QA_RESULT:
  passed: true   (true only when critical_issues is empty)

CRITICAL_ISSUES:
  - MISSING PAGE: pages/profile-detail.html
  - documents-list.html: missing error state
  - (none)

WARNINGS:
  - dashboard.html: missing <title> tag
  - (none)

SUMMARY: {count} critical, {count} warnings across {count} pages checked.
```

`passed: true` only when `critical_issues` list is empty.
