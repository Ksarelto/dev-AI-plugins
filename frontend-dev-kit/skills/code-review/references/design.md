# Design — SOLID, GRASP, and a readable component

Applies to every changed component under `ui/`. A component that owns more than one responsibility is **Must fix**.

## What the component file holds

Props, the hooks that wire this view, named handlers, and JSX. Everything else moves:

- Predicates, mappers, and formatters → `{component}/utils.ts` (slice-wide helpers → the slice `lib/`). `utils.ts` does not import a fetcher.
- Closed-set values and field codes → `constants.ts`. Class strings stay in `styles.ts`. A map of a closed set stays in that set's file (slice `config/` when the map holds translation keys).
- Slice settings that are not copy → `config/`.
- A second visual region → `ui/{child}/`.

## SOLID

- **Single responsibility.** The component composes. Mapping, availability rules, and field lists are not also in the same function.
- **Open/closed.** A new case is a new function, a fields-array entry, or `field.render` — not another branch inside a stable function.
- **Liskov.** A more specific control honors the props of the one it replaces.
- **Interface segregation.** Props and parameters are the ones this caller uses.
- **Dependency inversion.** A helper takes a fetcher or already-fetched data as an argument. It does not import the fetcher.

## GRASP

- The component is a thin controller.
- The helper that knows the data owns the rule (information expert).
- A pure helper that exists so the component stays readable is a pure fabrication. Put it in `utils.ts`.
- The component does not reach into another slice's internals (low coupling, high cohesion).

## Patterns

Use a named pattern when the component would otherwise grow a second behavior. The feature form's guard, the fields array, and `field.render` are the patterns for a form action (`rhf-form`). Do not add a pattern the screen does not need.
