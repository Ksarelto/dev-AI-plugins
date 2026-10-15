# Code conventions — review checklist

Distilled from `rules/react.mdc`, `rules/general-coding-principles.mdc`, `rules/component-structure.mdc`, and `rules/shadcn.mdc`. Applies to every changed `.ts` / `.tsx` under `src/`. In a feature-dev-kit project the `conventions` gate (`check-conventions.mjs`) enforces most of these mechanically — a finding here that the gate missed is still a finding.

## Comments

- Any comment in application or test code: `//`, `/* */`, JSDoc, `{/* */}` in JSX, section labels, restated code, `// Arrange/Act/Assert`, TODOs, commented-out code, or a `// path/to/file.ts` label pasted from a skill example. Only tool directives (`/// <reference …>`) are allowed.

## Exports

- A symbol exported from a file but imported by no other file in `src/`. "Tests use it" is not a reason — the test imports the source file directly.
- An `index.ts` re-export that nothing outside that folder imports (a props type, a constant, an internal hook, `export *`).
- A slice's public `index.ts` exposing internal segments (`model/`, `api/`, `hooks/`) that no other slice consumes.

## JSX control flow

- A nested ternary anywhere.
- A ternary inside JSX (children or an attribute). Compute the value before `return`, use an early return, use `&&` with a boolean, or a lookup map.
- `&&` with a non-boolean left side (`{items.length && …}`, `{label && …}` where `label` is a string).

## Handlers

- An arrow or function expression passed to any `on*` prop, even a one-liner (`onClick={() => setOpen(false)}`, `onOpenChange={(next) => { … }}`). Declare `handleX` above the return and pass the reference. Render props (`render`, `children(field)`) are not handlers.

## Closed-set props

- A string literal for `variant`, `size`, `type`, `side`, `align`, `orientation`, or `intent` on a component — use the primitive's constant (`ButtonVariant.Outline`, `ButtonType.Submit`, `InputType.Email`).
- A prop restated at its default (`type={ButtonType.Button}`, `variant={ButtonVariant.Default}`).

## Magic strings and numbers

Scan the changed file again, not only the closed-set props above. An unexplained string or number literal is **Must fix**: a timeout, page size, status string, z-index, or any other value whose meaning is not in its name (`30000`, `'declined'`). A literal that copies a constant already defined in `shared/api`, the slice `config/`, or the component `constants.ts` is **Must fix** even when it appears once. Extract a new value to a named constant in the owning place; import the existing one.

A literal used once in an obvious spot stays: `array.length - 1`, `0`, and `1`. Import paths, translation calls through a keys object (`t(usersKeys.list.title)`), and `as const` constant values are not findings.

## Structure

- A component folder missing `styles.ts` or `tests/{name}.test.tsx`. A test file sitting beside `{name}.tsx` is the wrong place.
- A second authored component in the same `.tsx`, or a nested component that is not under `{component}/ui/{child}/`. The exception is a file that configures an external library's compound parts (a re-homed shadcn/Radix primitive: `Dialog`, `DialogTrigger`, `DialogContent`, …).
- A helper or view mapper dropped next to `{name}.tsx`. It belongs in `{component}/lib/`. DTO mappers belong in the slice `api/`.
- A props `interface` in `types.ts`. It is declared in the component file. `types.ts` holds other types only: component-local non-prop types, or domain types in the slice model folder (`models/types.ts`, `model/types.ts`).
- A new feature entry component that does not render `<ErrorBoundary>`, or a route element not wrapped in `RouteBoundary`.
- A hook called in a feature's entry above its boundary (a throw there escapes the boundary).

## Severity

Missing error boundaries and hooks above a boundary are **Must fix** (a crash takes down the page). Comments, unnecessary exports, JSX ternaries, inline handlers, literal closed-set props, unexplained string or number literals, a literal that copies an existing constant, a second authored component in one file, and a props interface living in `types.ts` are **Must fix** convention breaches in this kit — the user-facing standard is explicit about each. Report every instance with its file and line; do not collapse them into "several places".
