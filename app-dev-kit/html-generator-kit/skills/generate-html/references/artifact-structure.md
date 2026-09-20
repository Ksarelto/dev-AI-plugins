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
│   ├── data.js             # Alpine.data blocks — entity mock data pools
│   └── navigation.js       # Active-page detection, breadcrumbs
├── design-brief.md         # Chosen visual direction: palette, type, signature layer, motion
├── ux-directives.md        # Per-page-type UX rules (read by screen-generator)
├── design-system-ref.md    # Compact token + component/class reference (read by screen-generator)
├── component-manifest.md   # Alpine data API + dev-panel spec (read by screen-generator)
├── page-map.json           # spec screen id → HTML page id (Station 8; feature-dev import)
├── _verify/                # report.json + screenshots from the render check
└── README.md               # Serve instructions + page index
```

---

## Naming Conventions

| Artefact | Convention | Example |
|---------|------------|---------|
| Output directory | `YYYYMMDD-HHmmss_{slug}` | `20260710-143022_scheduled-orders` |
| Page files | `{domain}-{view}.html` in kebab-case | `profiles-list.html`, `profile-detail.html` |
| CSS files | fixed names | `tokens.css`, `base.css`, `components.css` |
| JS files | fixed names | `app.js`, `data.js`, `navigation.js` |
| Page ID | matches filename without `.html` | `profiles-list` → `pages/profiles-list.html` |
| `page-map.json` | `{ "<spec-screen-id>": "<page-id>" }` | `"SCR-001": "sign-in"` |

Page IDs must be:
- kebab-case only
- Globally unique within the prototype
- Used consistently: filename, `data-nav-id`, navigation.js PAGES_ARRAY, index.html `href`
- **Never** the opaque spec id (`scr-001`). Keep `spec_id` on the page object and in `page-map.json`.

---

## File Ownership

| File | Created by | Modified by | Never modified by |
|------|------------|------------|------------------|
| `design-brief.md` | `design-strategist` | `design-strategist` (only on a look-and-feel change request) | all other agents |
| `ux-directives.md` | `design-strategist` | `design-strategist` | all other agents |
| `css/tokens.css` | `design-system-author` | `design-system-author` (only on full redesign) | all other agents |
| `css/base.css` | `design-system-author` | `design-system-author` | all other agents |
| `css/components.css` | `design-system-author` | `design-system-author` | all other agents |
| `design-system-ref.md` | `design-system-author` | `design-system-author` | all other agents |
| `js/app.js` | `component-library-author` | `component-library-author` | all other agents |
| `js/data.js` | `component-library-author` | `component-library-author` | all other agents |
| `component-manifest.md` | `component-library-author` | `component-library-author` | all other agents |
| `pages/{id}.html` | `screen-generator` | `screen-generator` (full rewrite on change) | all other agents |
| `index.html` | `assembly-wiring` | `assembly-wiring` | all other agents |
| `js/navigation.js` | `assembly-wiring` | `assembly-wiring` | all other agents |
| `README.md` | `generate-html` skill (Station 8) | `generate-html` skill | all agents |
| `page-map.json` | `generate-html` skill (Station 8) | `generate-html` skill | all agents |

**Cross-agent file modification is forbidden.** `screen-generator` never touches CSS or JS files.
`assembly-wiring` never touches page files. `design-system-author` never touches pages or scripts.

---

## File Requirements

### Every page file (`pages/*.html`) must:

- Be a **complete standalone HTML document** (`<!DOCTYPE html>` through `</html>`)
- Load CSS via relative `../css/` paths
- Load JS via relative `../js/` paths (all scripts `defer`)
- Contain Alpine `x-data="{entity}Data()"` on `<main>`
- Contain all four states: loading, error, empty, success (each with correct `x-show`)
- Contain a `.dev-panel` as the last element inside `<main>`
- Contain `<nav>` sidebar with `data-nav-id` attributes for active detection
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

Never use absolute paths or `file://` references.

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
  → pipeline runs: css/ → js/ → pages/ → index.html
  → skill writes README.md and page-map.json on approval (Station 8)
  → directory is immutable after approval

If changes requested:
  → affected files overwritten in-place (same output dir, same timecode)
  → skill updates README.md with change notes on the next approval

If user wants a clean re-run:
  → run /generate-html again → new timecode → new output dir
```

Previous prototype directories are never deleted by the kit — manual cleanup only.
