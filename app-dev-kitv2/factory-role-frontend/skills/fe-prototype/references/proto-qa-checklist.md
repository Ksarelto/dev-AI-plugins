# gate-proto checklist

Exactly what `gate proto` checks (`factory/scripts/gates/proto.mjs` and the static QA in
`factory/scripts/lib/prototype.mjs`), in the order it runs. **Scope** says whether a check runs in
the full gate (the designer's exit check and the engine's stage gate) or also in
`gate proto --screen <id>` (a prototyper's exit check, limited to that screen). Warnings (`warn`)
are reported and never block.

## 1. Files and schemas (a failure here stops the gate)

| check / rule | Scope | Fails when | Owner |
|---|---|---|---|
| `prototype/no-screens` | both | `.factory/prototype/screens.yaml` is missing | designer |
| `schema/prototype-screens` | both | `screens.yaml` breaks its schema (id kebab-case, status enum, story ids `STORY-nnnn`, states kebab-case) | designer |
| `prototype/no-report` | full | `02b-prototype/prototype-report.yaml` is missing | designer |
| `schema/prototype-report` | full | the report breaks its schema (`feature`, `design_authority`, `screens` ≥ 1, `spec_delta`; binding tokens `--name`) | designer |
| `prototype/no-screen-note` | both | an `added`/`changed` screen has no `02b-prototype/screens/<id>.yaml` whose `screen` equals its id | prototyper |
| `schema/prototype-screen-note` | both | the note breaks its schema (`screen`, `stories`, `states` required; `spec_delta` items need `change` ≥ 5 chars and `breaking`; no other keys) | prototyper |

## 2. Truth and traceability (full gate only)

| check / rule | Fails when |
|---|---|
| `prototype/status-untrue` | a page is new but not `added`, differs from the snapshot but is not `changed`, or was deleted but its screen is not `removed` |
| `prototype/unchanged-marked-changed` (warn) | a screen is `changed` but its page is identical to the snapshot |
| `trace/screen-without-story` | an `added`/`changed` screen lists none of this feature's story ids |
| `trace/story-without-screen` | a story with `ux.surfaces` is on no `added`/`changed` screen's `stories` |
| `trace/surface-without-screen` | a story surface has no screen with id = its kebab-case, or `surface:` equal to it |
| `trace/state-not-on-screen` | a story `ux.states` value, kebab-cased, is not in its screen's `states` |
| `prototype/report-unknown-screen` | a report `screens[].file` is not a screen id in `screens.yaml` |
| `prototype/missing-page` (report) | a report screen's file does not exist and the screen is not `removed` |

## 3. Static QA of the prototype folder

| rule | Scope | Fails when |
|---|---|---|
| `missing-shared` | full | one of `index.html`, `js/navigation.js`, `js/app.js`, `js/data.js`, `css/tokens.css`, `css/base.css`, `css/components.css` is missing |
| `missing-page` | both | a screen that is not `removed`/`placeholder` has no `pages/<id>.html` |
| `removed-page-left` | both | a `removed` screen's page still exists |
| `not-linked` | full | `index.html` does not contain `pages/<id>.html` for a live screen |
| `not-in-nav` | full | `navigation.js` does not contain `'<id>'` or `"<id>"` for a live screen |
| `dead-link` | full | `index.html` or any page has `href="…<name>.html"` (other than `index`) with no such page |
| `leftover-slot` | full | `tokens.css`, `base.css` or `components.css` contains `⟨` |
| `no-focus-style` (warn) | full | `components.css` has no `:focus-visible` |
| `binding-not-applied` | full | a report `binding` row (token not in `deviations`) is not in `tokens.css` as `token: value;` (case-insensitive) |

Per page, for each live screen (only the given screen with `--screen`):

| rule | Fails when |
|---|---|
| `state-missing` | a state in the screen's `states` has no `data-state="<state>"` |
| `no-dev-panel` | no element with `class="… dev-panel …"` (double-quoted `class`) |
| `no-main` | no `<main` |
| `inline-style` | a `<style` element after `<body` |
| `inline-script` | a `<script>` without `src=` whose content is longer than 20 characters |
| `nav-unlabelled` (warn) | a `<nav` without `aria-label=` |
| `modal-no-close` (warn) | a `class` containing the word `modal` (also `modal-overlay`, `modal-title`) but no `data-modal-close` |
| `form-unchecked` (warn) | a `<form` while the page has no `required` or no `type="submit"` |
| `chart-library` (warn) | the page mentions `chart.js`, `d3.js`, `d3.min.js`, `apexcharts` or `echarts` |
| `no-title` (warn) | no `<title>` |
| `placeholder-text` (warn) | the body contains `Lorem ipsum`, `TODO` or `PLACEHOLDER` (uppercase) |

## Reading your exit check

- **Designer**, full gate, before the prototypers ran: `missing-page`, `no-screen-note`,
  `dead-link` and the report's `missing-page` for this feature's `added`/`changed` screens are
  expected. Everything else is yours to fix.
- **Prototyper**, `--screen <id>`: only your screen's note, page and page rules run, plus the schema
  and `removed-page-left` checks. A failure about a shared file or `screens.yaml` is the designer's:
  do not work around it — report it in the summary (and `needs_classes` for missing CSS).
- On a stage retry the engine re-dispatches only the screens whose page or note failed; a failure
  anywhere else re-runs the designer first.
- `needs-classes` (the full gate, on your note): the designer adds the classes you listed, then your
  screen is rebuilt — write the new note without `needs_classes` once the classes exist.
