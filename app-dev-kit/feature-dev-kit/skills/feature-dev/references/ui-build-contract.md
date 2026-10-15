# UI Build Contract

Every engineer that writes `src/` (Stations 3–7, `slice-engineer`, Station 11 fixes) follows this
list. The rules themselves live in **frontend-dev-kit** (`rules/*.mdc`, attached by glob) and the
skills named below; this file is the checklist the conventions gate and `code-reviewer` hold you to.

Your station card assigns the layer and slice. This file is everything you need to build inside it —
do not open `fsd-architecture.md`, `fsd-import-boundaries.md`, `development-cycle.md`, or
`pipeline-flow.md`. Those are for the hub, discovery, and host setup.

## Simplicity ladder

Before writing, stop at the first rung that holds:

1. Reuse what is already in the codebase — the Reuse Map, an existing helper, an existing primitive.
2. Prefer a language or platform feature that already does it.
3. Use a dependency that is already installed. A new package is Station 1b, never a silent install.
4. Write the minimum that satisfies the acceptance criteria in front of you.
5. No abstraction with one use. No generic table, form factory, or hook around a single `useState`. Abstract on the third real use.
6. No comments, including no marker comments. A deliberate simplification goes in the handoff `--decisions`, not in the source.

## Inside the slice

Order, features: stub `index.ts` first, then `models/` → `api/` → `hooks/` → `lib/` → `ui/` happy path → `ui/` loading, empty, error, and finalize `index.ts` exports last. Entities use singular `model/` and have no `hooks/` (the query hook lives in `api/`). Widgets are `ui/` plus an optional singular `model/`. Do not typecheck between segments. Typecheck once when the slice is complete, then write the behavior test (§ 5).

A gate and this file disagree → kit bug: escalate citing both, never flip the fix.

Touch only `BOUNDARY`. Do not clean up, reformat, or modernize a file you are only reading. Do not add a prop, variant, or endpoint the spec does not ask for. Write it under `## Decisions & Open Questions` instead.

A hook, export, or type you need from a lower layer is missing → stop. Do not build around it and do not drop the behavior. Mark the row `blocked` and hand off `--outcome "blocked: <name> missing in <layer>/<slice>"` (`handoff-format.md`); the orchestrator sends it to that slice's owner.

The slice typechecks when you finish it. Prefer an additive change. If a public API must change, update every call site in the same change.

## 0. Layer boundaries — what your slice may import

A layer imports only from layers **strictly below** it. Never sideways, never upward.

- `app` → everything · `pages` → widgets, features, entities, shared · `widgets` → features,
  entities, shared · `features` → entities, shared · `entities` → shared · `shared` → nothing above it.
- **Cross-slice imports within one layer are forbidden** — no widget imports another widget, no
  feature another feature. An entity imports another entity only through that entity's `@x`
  file (`@/entities/profile/@x/document`), never through the sibling `index.ts`. Anything wider
  goes down a layer.
- Every other cross-slice import goes through the target slice's `index.ts`
  (`@/entities/profile`, never `@/entities/profile/api/useProfile`).
- Every slice has `index.ts`. Stub it first (empty or minimal) and finalize its exports last.
  Export only names a file **outside** the slice imports. No `export *`. Pages are the exception: `pages/*/index.ts` default-exports the page.
  Query keys live in `shared/api/query-keys/`, not the public API.

Segments inside your slice:

- `models/` (features only) — types, state, selectors, pure invariants. No React, no network, no side effects, no locale keys. A form's Zod schema lives in that form's `ui/` folder (`schema.ts`) with translation-key messages. Entities use singular `model/` for the same job. Widgets may have a singular `model/` for local UI state only. No `features/*/model/`, no `entities/*/models/`, no widget `models/` or `api/`.
- `api/` — `schema.ts` (one zod schema per server entity), fetchers (`parseEntity`, then a rename mapper), `endpoints.ts`, and entity query hooks (`useProfile.ts`). An invalid body notifies and returns `null`. Feature query/mutation hooks do not live here. No components, no UI state, no query-key factories. Do not pass `timeout`, `retry`, `prefixUrl`, or `Authorization` on the request.
- `hooks/` (features only) — TanStack Query hooks. The only segment whose `ui/` may call them. `ui/` never imports `api/`.
- `lib/` — slice-wide pure helpers. No React, no network. DTO mappers stay in `api/`. A helper used by one component stays in that component's `lib/`.
- `ui/` — components; imports `shared/ui`, own `models/` (or entity `model/`) for pure functions, and own `hooks/`. No direct fetch calls.
- `config/` — non-text constants and enum → locale-key maps. No English copy.
- `locales/` — `en.json` + `keys.ts` for every string this slice renders.

A missing `index.ts`, an upward import, or a deep internal import is a hard gate failure, not a
review judgment. If your slice needs something from a sibling slice, escalate — do not duplicate it.

## 1. shadcn fidelity — one look, one motion

- Button, Skeleton, Table, and any other control the shadcn registry provides are the `@/shared/ui` primitive (Radix underneath). Do not reimplement them with raw elements. Another library or a custom control only when the user explicitly requested that.
- Registry first. `search_items_in_registries` → `view_items_in_registries` → the primitive lands in
  `shared/ui/<name>/` verbatim: parts, props, `data-slot`, Radix imports, and class strings moved
  into `styles.ts` in the same order (every `data-[state=*]` / `data-[side=*]` animation class
  kept). Only the allowed edits in `rules/shadcn.mdc`.
- Compose from the registry demo: `get_item_examples_from_registries` (`dialog-demo`,
  `alert-dialog-demo`, `select-demo`, `dropdown-menu-demo`, …). Keep its part order and nesting.
- Motion comes only from the primitive and `tw-animate-css` (imported once in the global CSS). No
  `animate-*`, `transition*`, `duration-*`, `ease-*`, `fade-*`, `slide-*`, `zoom-*` in any
  `styles.ts` outside `shared/ui`, no custom `@keyframes`, no Motion wrapper around a primitive that
  already animates.
- A look the primitive lacks — including a gradient, shadow, or motion the bound prototype uses — is a new `cva` variant in `shared/ui/<name>`, not a call-site override. Call-site `className` is layout only (grid, gap, width).
- Prototype effects are recreated only as a `shared/ui` variant or `tw-animate`. Not in a feature, widget, or page `styles.ts`.
- Closed-set props use the primitive's constants — `variant={ButtonVariant.Outline}`,
  `size={ButtonSize.Small}`, `type={ButtonType.Submit}`, `AlertVariant.Destructive`. Omit a prop set
  to its default.

## 2. Copy — every user-visible string is translated

- `t(key)` for text, `aria-label`, `alt`, `title`, `placeholder`, toast text, zod messages (the
  message is the key), empty/error copy. Only server data renders untranslated.
- Slice copy: `<slice>/locales/en.json` + `keys.ts`. App-wide copy (Save, Cancel, Retry, generic
  errors): `shared/lib/i18n/locales/common`. Reuse a common key before adding one. `add-text-content`.
- No string maps (`{ FREE: 'In cupboard' }`) — an enum → key map (`LISTING_STATUS_KEY`) and `t()`.
- With a prototype, the prototype text is the English value, verbatim.
- A spec notice written as an instruction ("Show a plain failure. Keep the previous list…") is behavior, not copy. Never render it. The sentence comes from `## Clarifications`, the prototype, or a `common` key (generic error); none fits → a `common` key plus a line in `## Decisions & Open Questions`.

## 3. Components

- No comments of any kind. A name that needs a comment is the wrong name.
- No inline classes: every class list lives in the component's `styles.ts`.
- No ternary in JSX; nested ternaries are forbidden everywhere. Early-return the loading / error /
  empty states; compute a branch into a named `const` above `return`.
- No inline handlers: `const handleOpenChange = (nextOpen: boolean): void => { … }` above `return`,
  then `onOpenChange={handleOpenChange}`.
- Feature and entity UI: four data states from shared primitives: `Skeleton`/`Spinner`, `Alert`, `Empty`, success. A widget does not add its own error or retry UI.
- `index.ts` exports only what another file imports. No `export *`. Types and constants stay
  internal unless a consumer imports them.

## 4. Error boundaries — one crash never takes down the app

- Every route element: `withRouteBoundary(<Page />)` (`app/router/route-boundary`) — `app-engineer`
  via `add-route`.
- Every feature: the component `features/<f>/index.ts` exports wraps its content in
  `<ErrorBoundary resetKeys={[…]}>` from `@/shared/ui/error-boundary`. Hooks live in the content
  component, below the boundary.
- A widget uses Suspense only. It does not add its own `ErrorBoundary`, error `Alert`, or retry.
  The composed feature owns those states.
- Fallbacks use the shared `ErrorFallback` (Alert + Button, translated). Never render `error.message`.

## 5. Tests

The engineer that creates an executable file writes its behavior test in the same change. There is no test station after the build.

- Components: `{component}/tests/<name>.test.tsx`. A test beside `<name>.tsx` does not count. Hooks, api, `models/` or `model/`, lib, route modules, and guards: the segment's `tests/`. A helper in a component's `lib/` is tested from that component's `tests/`.
- Assert behavior (what renders, what was called, loading, empty, error), not that the module exists. Assert translated text through the locale value, not the key.
- Mock only the boundaries: inside the slice that owns the fetcher, its `api/fetchers` (`importOriginal` + override one export); in any other slice, `httpClient` in `@/shared/api/base`. Never mock another slice's `api/` path or its `index.ts`. Also the router and browser APIs. Keep entity hooks, the query client, i18n, and child components real.
- A fix for a UI-review finding includes a regression test that fails on the reported behavior when that behavior is testable (a response longer than the page size, a control the page cannot reach).
- `test-engineer` runs only when Station 9 reports `missing-test` or coverage below the thresholds in `quality-gates.md`, and only for that layer group.

## 6. Prototype parity

When `.spec/features/<slug>.context/prototype-inventory.md` exists, it is the structure contract (copy, controls, fields, states) — not the look. For
every row you render, set **React target** to the file and **Status** to `done`. `n/a: <reason>`
only for sample server data, an emoji replaced by a lucide icon, or prototype-only chrome. Every
prototype state (loading / empty / error / success / dialogs) must render. Parity does not require the prototype's `reveal`, `hover-lift`, shimmer `@keyframes`, or `!important` reduced-motion block. Loading uses `@/shared/ui/skeleton`. Motion only ever becomes a `shared/ui` variant. The look is the theme port at Station 3. A color, font, radius, or shadow diff is a `shared/ui` token or `cva` variant. Spacing and size are `styles.ts` layout. Layout the tokens cannot express is the human UI review, not a script. Verify:

```bash
node {KIT_DIR}/skills/feature-dev/scripts/extract-prototype-inventory.mjs --check .spec/features/<slug>.context/prototype-inventory.md
node {KIT_DIR}/skills/feature-dev/scripts/port-prototype-theme.mjs --check --prototype <prototype-ref> --globals src/shared/ui/theme/globals.css
```

## 7. Self-check before the handoff

```bash
yarn typecheck
yarn lint
node {KIT_DIR}/skills/feature-dev/scripts/check-conventions.mjs --files <touched files, comma-separated> [--ignore unused-export]
```

Stations 3–6 pass `--ignore unused-export`: the layer above, or the Station 7 wiring, imports those
exports later. From Station 7 on, drop it. Do not ignore `missing-test` — the test is part of this
change. The Station 9 gate always runs every rule.

Record the self-check in your handoff as one line (`self-check: typecheck pass, lint pass,
conventions pass`). Do not copy gate output anywhere, and never onto the blackboard. A `fail` there
is refused unless the row is `blocked` (`handoff-format.md`).

`check-conventions.mjs --rules` lists every rule and its fix; `board.mjs --help` lists the board
commands. Do not read the kit's script sources.
