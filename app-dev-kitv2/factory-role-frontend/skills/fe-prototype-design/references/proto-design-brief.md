# Design brief (`.factory/prototype/design-brief.md`)

One brief for the whole app, kept by the prototype-designer and updated in place by every feature
that touches the UI. It records the design decisions the CSS carries out and where each came from.
It is for people (the human at GATE-P, later builders reading the prototype) — the gate reads the
report's `binding` list and `tokens.css`, not this file. Keep it short: decisions, not essays.

Purpose reminder: the prototype exists to make the spec understandable. One clear, neutral light
look, no signature effects, no motion polish, no dark mode.

## Template

````markdown
# Design brief — <App name>

## Provenance
- Design authority: provided | derived | neutral
- Sources: <every file read for design values, with origin — images included; "none">
- ui-ux-pro-max: <"not found" | "used: <the exact queries>" | "found, not used: <why>">
- Last updated by: <FEAT-nnn> (<date>)

## Binding reference
<Only when design authority is provided. One row per concrete value the sources state.>

| Attribute | Provided | Source | Applied as |
|---|---|---|---|
| Primary colour | `#0A3D62` | `.factory/design/brand.md:4` | `--primary: #0A3D62;` |
| Body font | Inter | `.factory/inbox/style-guide.md:12` | `--font-sans: 'Inter';` + Google Fonts import |
| Layout | left sidebar | `.factory/inbox/mock-home.png` | layout `sidebar` |
| Nav order | Dashboard, Orders, Settings | `.factory/inbox/mock-home.png` | navigation.js order |

- Open slots (not stated, neutral defaults used): <list of token groups>
- Deviations: <"none", or one line per provided value not applied exactly:
  attribute · provided · what was done · reason>

## Product read
- Domain and audience: <one line each, from the PRD>
- What the screens must make obvious: <e.g. "the total and every line that changes it">

## Look
- Theme: light only. Palette: <neutral defaults | provided primary + neutral rest>
- Typography: <families, and the Google Fonts import only if a provided font needs it>
- Shape and density: radius <value>, density <comfortable | compact> (<why: data-dense or not>)

## Layout
- Archetype: sidebar | top-nav — <why: many areas or deep nav → sidebar; few top-level areas → top-nav>
- Navigation groups and order: <group: screen ids>

## Contrast self-check (WCAG 2.2 AA)
| Pair | Ratio | Result |
|---|---|---|
| --primary-foreground on --primary | 5.17 | pass |

## Composition per page type
<Only the page types the app has. One line each, naming classes from components.css.>
- list: `filter-bar` (search first, then status `chip`s) above a `table`; row action opens a `modal`
- detail: two `card`s — summary left, editable `form` right
- form: single column, `form-field` stack, `form-actions` with submit and cancel

## Copy tone
- Voice: <e.g. short and plain>; status words always as text, never colour alone

## Increment log
| Feature | What changed in the shared design |
|---|---|
| FEAT-001 | first prototype: shell, tokens from brand.md, components for list and form |
````

## Filling it

- **Design authority.** `provided` when at least one binding value was applied; `derived` when no
  value was provided but the spec or inbox states structure (layout, nav order, density) or
  ui-ux-pro-max supplied a choice; `neutral` when everything is the neutral default. The report's
  `design_authority` says the same.
- **Binding reference.** One row per concrete statement found by
  [proto-binding-inputs.md](proto-binding-inputs.md). Token rows use the exact `--token: value;`
  form that `tokens.css` holds; structure rows use plain words. The report's `binding` list carries
  the token rows only (`attribute`, `value`, `source` as `file:line`, `token`).
- **Deviations.** A provided value that is not applied exactly is never dropped silently. Allowed
  reasons: not valid CSS for the token, font not on Google Fonts (system stack used), conflicts
  with a higher-priority source (name it), or `a11y-risk` (kept, with the ratio). Each one is also a
  `deviations` entry in the report.
- **Increment log.** One row per feature that changed the shared design; a feature that only adds
  pages with the existing look writes "no shared change".
- **On update.** Edit the sections the feature affects; keep earlier rows, binding values and the
  log. A new binding value from a later feature replaces the old one only when its source has a
  higher priority or is newer from the same origin — say so in Deviations.
- **No leftovers.** No `⟨…⟩` markers anywhere in the prototype (gate-proto fails `leftover-slot` in
  the CSS files), no "TBD".
