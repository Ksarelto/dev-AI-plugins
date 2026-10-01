# Artifact Structure — html-generator-kit

Output directory layout, file ownership, naming, and lifecycle.

---

## Output Directory

```
.spec/prototype/{TIMECODE}_{SLUG}/
├── index.html              # Landing page / app map
├── pages/                  # One standalone HTML file per screen
│   ├── {screen-id}.html    # e.g. profiles-list.html, profile-detail.html
│   └── ...
├── css/
│   ├── tokens.css          # shadcn OKLCH custom properties + motion tokens (no Tailwind runtime)
│   ├── base.css            # Reset, typography, [x-cloak]
│   └── components.css      # Shared pattern classes + the modern signature layer
├── js/
│   ├── app.js              # Alpine.init + global stores (notification, modal, theme)
│   ├── store.js            # Shared ProtoStore + entityList/entityDetail/entityForm factories
│   ├── data.js             # Alpine.data blocks — entity mock data pools (seed-only; no business logic)
│   ├── navigation.js       # Active-page detection, breadcrumbs
│   └── vendor/             # Vendored Alpine.js + focus plugin (pinned version, no CDN)
│       ├── alpine.min.js
│       └── alpine-focus.min.js
├── spec-model.json         # Deterministic SPEC_FILE → model parse (Station 0, full build only)
├── design-inputs.json      # Provided theme/brand/layout sources (Step 2.6; binding: true|false)
├── design-request.md       # Inline design instructions from the invocation (only when given)
├── design-request/         # Exported design reference (e.g. a Figma export) — only when a URL source needed exporting
├── design-values.json      # Concrete design decisions (palette/fonts/density/motion/signature) feeding build-design-system.mjs
├── design-brief.md         # Binding reference (if any) + chosen direction: palette, type, signature, motion
├── ux-directives.md        # Per-page-type UX rules (read by screen-generator)
├── design-system-ref.md    # Compact token + component/class reference (read by screen-generator)
├── component-manifest.md   # Alpine data API + dev-panel spec (read by screen-generator)
├── revisions/              # Append-only per-page edit log — {page.id}.md, one per edited page
│   └── {page.id}.md
├── delta-pages.json        # Append mode only: new/changed screens + removed[] (screens dropped from spec)
├── page-map.json           # spec screen id → HTML page id (Station 8; feature-dev import)
├── _qa/                    # report.json from the deterministic QA gate (Station 6, qa-static.mjs)
│   └── report.json
├── _verify/                # report.json + screenshots from the render check (Station 6.5)
│   ├── report.json
│   └── screenshots/
├── kit-result.json         # Copy of the cross-kit result envelope (see below) — convenience only
└── README.md               # Serve instructions + page index
```

The canonical cross-kit result envelope, `html-kit-result.json`, is written by the `generate-html`
skill to `{dirname(SPEC_FILE)}/` — **outside** this directory, next to `spec.md`. `kit-result.json`
above is only a copy written into `OUTPUT_DIR` for convenience; downstream kits read the one next to
the spec. See `pipeline-flow.md` and the skill's Step 1/Step 5 for both paths.

---

## Naming Conventions

| Artefact | Convention | Example |
|---------|------------|---------|
| Output directory | `YYYYMMDD-HHmmss_{slug}` | `20260710-143022_scheduled-orders` |
| Page files | `{domain}-{view}.html` in kebab-case | `profiles-list.html`, `profile-detail.html` |
| CSS files | fixed names | `tokens.css`, `base.css`, `components.css` |
| JS files | fixed names | `app.js`, `store.js`, `data.js`, `navigation.js`, `vendor/alpine.min.js`, `vendor/alpine-focus.min.js` |
| Page ID | matches filename without `.html` | `profiles-list` → `pages/profiles-list.html` |
| `page-map.json` | `{ "<spec-screen-id>": "<page-id>" }` | `"SCR-001": "sign-in"` |
| `revisions/{page.id}.md` | matches the page id, not the spec id | `revisions/profiles-list.md` |

Page IDs must be:
- kebab-case only
- Globally unique within the prototype
- Used consistently: filename, `data-nav-id`, navigation.js PAGES_ARRAY, index.html `href`
- **Never** the opaque spec id (`scr-001`). Keep `spec_id` on the page object and in `page-map.json`.

---

## File Ownership

| File | Created by | Modified by | Never modified by |
|------|------------|------------|------------------|
| `spec-model.json` | `scripts/spec-model.mjs` (Station 0, full build) | never (one-shot parse; append mode writes `delta-pages.json` instead via `scripts/delta-pages.mjs`, sharing the same `lib/spec-model.mjs`) | all agents (read-only) |
| `design-inputs.json`, `design-request.md`, `design-request/` | `generate-html` skill (Step 2.6) | `generate-html` skill | all agents (read-only) |
| `design-values.json` | `design-strategist` | `design-strategist` (only on a look-and-feel change request) | all other agents |
| `design-brief.md` | `design-strategist` | `design-strategist` (only on a look-and-feel change request) | all other agents |
| `ux-directives.md` | `design-strategist` | `design-strategist` | all other agents |
| `css/tokens.css` | `design-system-author` via `scripts/build-design-system.mjs` | `design-system-author` (only on full redesign) | all other agents |
| `css/base.css` | `design-system-author` via `scripts/build-design-system.mjs` | `design-system-author` | all other agents |
| `css/components.css` | `design-system-author` via `scripts/build-design-system.mjs` | `design-system-author` | all other agents |
| `design-system-ref.md` | `design-system-author` via `scripts/build-design-system.mjs` | `design-system-author` | all other agents |
| `js/app.js`, `js/store.js`, `js/vendor/*` | `component-library-author` via `scripts/copy-runtime-assets.mjs` | `component-library-author` | all other agents |
| `js/data.js` | `component-library-author` | `component-library-author` | all other agents |
| `component-manifest.md` | `component-library-author` | `component-library-author` | all other agents |
| `pages/{id}.html` | `screen-generator` (`MODE: create`) | `screen-generator` (full rewrite in `MODE: create`; targeted in-place diff in `MODE: edit`) | all other agents |
| `revisions/{page.id}.md` | `screen-generator` (`MODE: edit`, first edit) | `screen-generator` (`MODE: edit`, append-only) | `screen-generator` in `MODE: create` (never rewritten/deleted — only folded forward), all other agents |
| `index.html` | `assembly-wiring` | `assembly-wiring` | all other agents |
| `js/navigation.js` | `assembly-wiring` | `assembly-wiring` | all other agents |
| `_qa/report.json` | `scripts/qa-static.mjs` (Station 6, Bash, no model call) | `scripts/qa-static.mjs` (overwritten each run) | all agents (read-only) |
| `_verify/report.json`, `_verify/screenshots/` | `scripts/verify-prototype.mjs` (Station 6.5, Bash) | `scripts/verify-prototype.mjs` (overwritten each run) | all agents (read-only) |
| `delta-pages.json` | `scripts/delta-pages.mjs` (append mode, Step 2 of the skill) | not modified after creation (one per run) | all agents (read-only) |
| `README.md` | `generate-html` skill (Station 8) | `generate-html` skill | all agents |
| `page-map.json` | `generate-html` skill (Station 8) | `generate-html` skill | all agents |
| `kit-result.json` | `generate-html` skill (Station 8, via `scripts/write-kit-result.mjs --also`) | `generate-html` skill | all agents |

**Cross-agent file modification is forbidden.** `screen-generator` never touches CSS or JS files.
`assembly-wiring` never touches page files. `design-system-author` never touches pages or scripts.

---

## File Requirements

### Every page file (`pages/*.html`) must:

- Be a **complete standalone HTML document** (`<!DOCTYPE html>` through `</html>`)
- Load CSS via relative `../css/` paths
- Load JS via relative `../js/` paths (all scripts `defer`): `../js/store.js`, `../js/app.js`,
  `../js/data.js`, `../js/navigation.js`
- Contain Alpine `x-data="{entity}Data()"` on `<main>`
- Contain all four states: loading, error, empty, success (each with correct `x-show` and a
  `data-state-root`)
- Contain a `.dev-panel` as the last element inside `<main>`
- Contain `<nav>` sidebar with `data-nav-id` attributes for active detection
- Contain `<!-- nav:start -->`/`<!-- nav:end -->` markers inside the nav (no hand-authored nav items)
- Contain traceability attributes: `data-spec-screen` on `<main>`, `data-component` on every
  `page.components[]` element, `data-interaction` on every `page.interactions[]` trigger, `data-field`
  on every rendered `entity_fields[]` element (see `agents/screen-generator.md` § Traceable markup)
- Contain NO inline `<style>` blocks
- Contain NO inline `<script>` blocks (only `src=` script tags allowed)

### index.html must:

- Link to every page in `pages/` via `href="pages/{id}.html"`
- Display a card grid of all pages
- Include the same sidebar nav structure as all pages
- NOT use `x-data` — it is a static landing page

### navigation.js must:

- Contain a `PAGES` array with all page `{ id, title, domain }` entries
- Contain a `NAV_GROUPS` object
- Run active-state detection on `DOMContentLoaded`
- Export `getPageTitle(id)` function

---

## Asset Path Rules

| Context | CSS/JS prefix | Example |
|---------|--------------|---------|
| Inside `pages/` | `../css/`, `../js/` | `<link href="../css/tokens.css">` |
| Inside `index.html` (root) | `css/`, `js/` | `<link href="css/tokens.css">` |
| Internal page links from `pages/` | `./{id}.html` | `<a href="./profile-detail.html">` |
| Links from `index.html` to pages | `pages/{id}.html` | `<a href="pages/profiles-list.html">` |

Never use absolute paths or `file://` references. Alpine and its focus plugin load from
`js/vendor/` — never from a CDN.

---

## Timecode Format

```
YYYYMMDD-HHmmss   (UTC, no timezone suffix)
```

Generated by: `date -u +%Y%m%d-%H%M%S`

Example: `20260710-143022_scheduled-orders`

The timecode serves as a sortable unique identifier. Multiple prototypes from the same spec are
distinguished by timecode. The most recent (lexicographically highest) is the current version.

---

## Lifecycle

```
generate-html invoked
  → output dir created (.spec/prototype/{TIMECODE}_{SLUG}/)
  → pipeline runs: spec-model.json → css/ → js/ → pages/ → index.html
  → skill writes README.md, page-map.json, and the result envelope on approval (Station 8)
  → directory is immutable after approval

If changes requested:
  → affected files overwritten in-place (same output dir, same timecode)
  → a single-page edit (MODE: edit) appends to revisions/{page.id}.md rather than
    overwriting the page from scratch — see agents/screen-generator.md § Edit mode
  → skill updates README.md with change notes on the next approval

If append mode (a prototype_ref already exists):
  → clone-prototype.mjs copies the previous output dir under a new timecode
  → delta-pages.mjs computes new/changed screens + removed[] into delta-pages.json
  → only delta screens (and removed ones, if the user chose Delete) are touched;
    everything else carries over untouched, including revisions/ and _qa/_verify reports
    from screens that weren't regenerated

If user wants a clean re-run:
  → run /generate-html again → new timecode → new output dir
```

Previous prototype directories are never deleted by the kit — manual cleanup only.
