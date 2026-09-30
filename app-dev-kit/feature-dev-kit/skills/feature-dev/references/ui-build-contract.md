# UI Build Contract

Every engineer that writes `src/` (Stations 3–7, `slice-engineer`, Station 11 fixes) follows this
list. The rules themselves live in **frontend-dev-kit** (`rules/*.mdc`, attached by glob) and the
skills named below; this file is the checklist the conventions gate and `code-reviewer` hold you to.

## 1. shadcn fidelity — one look, one motion

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
- A look the primitive lacks is a new `cva` variant in `shared/ui/<name>`, not a call-site override.
  Call-site `className` is layout only (grid, gap, width).
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

## 3. Components

- No comments of any kind. A name that needs a comment is the wrong name.
- No inline classes: every class list lives in the component's `styles.ts`.
- No ternary in JSX; nested ternaries are forbidden everywhere. Early-return the loading / error /
  empty states; compute a branch into a named `const` above `return`.
- No inline handlers: `const handleOpenChange = (nextOpen: boolean): void => { … }` above `return`,
  then `onOpenChange={handleOpenChange}`.
- Four data states from shared primitives: `Skeleton`/`Spinner`, `Alert`, `Empty`, success.
- `index.ts` exports only what another file imports. No `export *`. Types and constants stay
  internal unless a consumer imports them.

## 4. Error boundaries — one crash never takes down the app

- Every route element: `withRouteBoundary(<Page />)` (`app/router/route-boundary`) — `app-engineer`
  via `add-route`.
- Every feature: the component `features/<f>/index.ts` exports wraps its content in
  `<ErrorBoundary resetKeys={[…]}>` from `@/shared/ui/error-boundary`. Hooks live in the content
  component, below the boundary.
- A widget with an independent data source that may fail on its own also gets a boundary.
- Fallbacks use the shared `ErrorFallback` (Alert + Button, translated). Never render `error.message`.

## 5. Tests

- Every executable file (a function, a class, or a top-level call) has a behavior test: components
  colocated `<name>.test.tsx`, hooks / api / model / lib in the segment's `tests/`.
- Mock only the boundaries: the fetcher module (`importOriginal` + override one export), router,
  browser APIs. Keep entity hooks, query client, i18n, and child components real.
- `test-engineer` owns Station 8. `slice-engineer` writes the test in the same change.

## 6. Prototype parity

When `.spec/features/<slug>.context/prototype-inventory.md` exists, it is the parity contract. For
every row you render, set **React target** to the file and **Status** to `done`. `n/a: <reason>`
only for sample server data, an emoji replaced by a lucide icon, or prototype-only chrome. Every
prototype state (loading / empty / error / success / dialogs) must render. Verify:

```bash
node {KIT_DIR}/skills/feature-dev/scripts/extract-prototype-inventory.mjs --check .spec/features/<slug>.context/prototype-inventory.md
```

## 7. Self-check before the handoff

```bash
yarn typecheck
yarn lint
node {KIT_DIR}/skills/feature-dev/scripts/check-conventions.mjs --files <touched files, comma-separated> --ignore missing-test
```

Drop `--ignore missing-test` when you wrote the tests in this change (`slice-engineer`,
`test-engineer`, Station 11). The Station 9 gate always runs every rule.
