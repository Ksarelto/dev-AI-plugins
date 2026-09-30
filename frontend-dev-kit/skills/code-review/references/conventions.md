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

## Structure

- A component folder missing `styles.ts` or its test.
- A new feature entry component that does not render `<ErrorBoundary>`, or a route element not wrapped in `RouteBoundary`.
- A hook called in a feature's entry above its boundary (a throw there escapes the boundary).

## Severity

Missing error boundaries and hooks above a boundary are **Must fix** (a crash takes down the page). Comments, unnecessary exports, JSX ternaries, inline handlers, and literal closed-set props are **Must fix** convention breaches in this kit — the user-facing standard is explicit about each. Report every instance with its file and line; do not collapse them into "several places".
