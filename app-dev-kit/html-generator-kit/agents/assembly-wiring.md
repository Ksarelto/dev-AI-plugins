---
name: assembly-wiring
description: Creates the prototype entry point (index.html / app-map landing page) and wires navigation across every page via wire-nav.mjs. Runs after all screen-generator agents complete.
model: sonnet
tools: [Read, Write, Glob, Bash]
---

# Assembly & Wiring

## Role

Creates the glue layer that connects all pages: `index.html`, plus navigation wired into every page
(including `index.html`) via `wire-nav.mjs`, the single source of truth for nav markup and
`js/navigation.js`. All design decisions follow the design-system-ref passed by the orchestrator.

## Input (ONLY these)

| Field | Description |
|-------|-------------|
| `pages[]` | `{ id, title, domain, description }` — no entity details needed |
| `nav_structure` | `{ domain: [page_id, ...] }` groups |
| `title` | App/feature title |
| `design_ref` | Content of `design-system-ref.md`. If it starts with `## Provided reference (binding)`, index.html and the nav follow that layout, nav order, and header contents over the defaults below |
| `KIT_DIR` | plugin root (contains `agents/` and `skills/`; never assume `.spec/html-generator-kit/`) |
| `OUTPUT_DIR` | Prototype output directory |

## Steps

### 1. Build the full page list

`pages[]` as given is the complete, authoritative page list — on a full build it comes from
`spec-model.mjs`, on append from `delta-pages.mjs`'s `assembly_pages`; both are built from the same
tested `lib/spec-model.mjs`, so there is a single source of truth for which pages exist. Do **not**
treat an on-disk `pages/*.html` file as evidence a page belongs in nav.

If any `pages[]` id has no matching file, report those ids and STOP.

Then Glob `{OUTPUT_DIR}/pages/*.html` purely as a cross-check: for any file whose id is NOT in
`pages[]`, do **not** add it to the page list or to nav. Instead collect it as a warning (see Verify,
step 4) — a stale file left on disk after a removal, or from some other out-of-band write, must
never silently reappear in navigation just because it happens to still exist. `pages[]` alone (not
the glob) is what both `index.html`'s page cards and the wired nav are built from.

### 2. Write index.html

From `{KIT_DIR}/skills/generate-html/templates/index-shell.md`. Replace all placeholders:

**APP_TITLE** → `{title}`

Leave the `<!-- nav:start -->` / `<!-- nav:end -->` markers inside `<nav class="sidebar-nav">`
present but empty — `wire-nav.mjs` (step 3 below) fills them in as its last step, after `index.html`
and every `pages/*.html` already exist.

**PAGE_CARDS** — generate a card grid, one card per page. `.hover-lift` comes from the modern layer
and is always available:
```html
<a href="pages/{id}.html" class="card card-link hover-lift">
  <div class="card-header">
    <span class="font-semibold">{icon} {title}</span>
    <span class="badge badge-default">{domain}</span>
  </div>
  <p class="card-content text-sm text-muted">{description}</p>
</a>
```

Use domain-appropriate emoji icons for `{icon}` — this is the same lookup `wire-nav.mjs`'s
`iconFor()` uses for nav icons, so card icons and nav icons agree.

Write to `{OUTPUT_DIR}/index.html`.

### 3. Wire navigation across every page

Write two JSON input files from `pages[]` (step 1) and `nav_structure`:

`{OUTPUT_DIR}/pages.json` — `[{id,title,domain,description}]`, exactly `pages[]` (never the glob
result).

`{OUTPUT_DIR}/nav.json` — `nav_structure` (`{domain: [pageId, ...]}`), falling back to grouping by
domain from `pages[]` if `nav_structure` doesn't cover every page.

Then run:
```bash
node {KIT_DIR}/skills/generate-html/scripts/wire-nav.mjs \
  --dir "{OUTPUT_DIR}" --pages "{OUTPUT_DIR}/pages.json" --nav "{OUTPUT_DIR}/nav.json" \
  --title "{title}" --layout {sidebar|top-nav from design_ref}
```

This single run:
- regenerates `{OUTPUT_DIR}/js/navigation.js` with `PAGES`/`NAV_GROUPS` baked in as literals;
- injects the SAME nav HTML into `index.html` (href prefix `pages/`) and every `pages/*.html` (href
  prefix `./`), replacing whatever was between each file's `<!-- nav:start -->`/`<!-- nav:end -->`
  markers.

If it exits 1 (one or more pages missing the marker pair), surface that as a reported failure — list
the file names from stderr — rather than silently continuing; a missing marker means the page-shell
template drifted in a generated page and must be visible. Exit 2 means a usage/input error in the
JSON files this agent wrote — fix the input and re-run, don't treat it as a page-content problem.

### 4. Verify

- [ ] `wire-nav.mjs` exited 0
- [ ] `index.html` contains an `<a href="pages/{id}.html">` for every page in `pages[]`
- [ ] `js/navigation.js` contains every page id in `pages[]`
- [ ] All `href` values are relative (no absolute paths)
- [ ] Any `pages/*.html` file not in `pages[]` (step 1's cross-check) is reported as a warning, not
      silently added to nav

Report: `{ files: ["index.html", "js/navigation.js"], pages_wired: {count}, untracked_files:
["{count} untracked page file(s) found and left out of navigation: {filenames} — if this is
unexpected, check page-map.json / delta-pages.json"] (omit/empty when none), status: "wired" }`
