---
name: create-widget
description: Scaffold an FSD widget slice — a large self-contained UI block composing features and entities. Assembles shadcn blocks via the shadcn MCP. Use after the composed features/entities exist.
argument-hint: <widget-name>
disable-model-invocation: false
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep]
---

# Create Widget

## When to use

Station 6. Invoke to author `widgets/<slice>/` — a large, self-contained UI block that composes features and entities. Used by `composition-engineer`. Examples: `profile-reconciliation-panel`, `document-review-widget`, `profiles-list-widget`.

## Steps

1. **Check the shadcn registry first**: browse the shadcn MCP for block-level patterns matching the spec's `## UI Surface` layout (dashboard shells, data table + sidebar, split panels). If a block matches, pull it via MCP and adapt to project conventions before hand-authoring layout. If a primitive (button, dialog, drawer, and the rest) is missing from `shared/ui/<name>`, stop and hand it to `shared-engineer`. Do not author a second copy.

2. **Scaffold the slice** using `create-slice` for `widgets/<slice>/` with segment `ui/`.

3. **Identify composition inputs**: list every feature and entity public API this widget consumes. Verify each is accessible through its `index.ts`. Do not import from internals.

4. **Build the widget component** at `widgets/<slice>/ui/<slice>/<slice>.tsx` (kebab-case folder, `styles.ts`, `index.ts`):
   - Import feature components (via `features/*/index.ts`) and entity display components (via `entities/*/index.ts`).
   - Use entity hooks for data — import them via the entity's `index.ts`.
   - Classes in `styles.ts` via `frontend-dev-kit:tailwind-styles`. Four states via `rules/ui-quality.mdc`, as early returns — never a JSX ternary.
   - Loading: `Skeleton` from `@/shared/ui/skeleton`, shaped like the populated layout.
   - Error: `Alert` with `AlertVariant.Destructive`, translated title/description, and a retry `Button` wired to a named `handleRetry` (`refetch`). Never `error.message`.
   - Empty: `Empty` from `@/shared/ui/empty` with translated copy and the prototype's call to action.
   - A widget whose data source can fail on its own (a side panel, a chart) wraps its content in `ErrorBoundary` from `@/shared/ui/error-boundary`, so its crash leaves the page standing.
   - With a prototype, build every row of `prototype-inventory.md` that belongs to this widget and mark it (`ui-build-contract.md` § 6).

5. **Handle local UI state** (not API state) with `useState`: tab selection, sidebar open/close, active accordion. Do not manage API state — that belongs in entity/feature hooks.

6. **Co-locate the component test** at `widgets/<slice>/ui/<slice>/<slice>.test.tsx`. Test all four states (loading, empty, error, populated) and any local UI state transitions.

7. **Update `widgets/<slice>/index.ts`** with named exports of what the page already imports:
   ```ts
   export { ProfileReconciliationPanel } from './ui/profile-reconciliation-panel'
   ```

8. **Self-check** (`{KIT_DIR}/skills/feature-dev/references/ui-build-contract.md` § 7): fix every finding.

9. **Update the spec `## Build Plan`**: mark widget tasks as done, list files created.

## Pre-conditions

- All feature and entity slices the widget composes exist with their `index.ts` public APIs.
- `shared/ui` has `Skeleton`, `Empty`, `Alert`, `error-boundary`, and the other required primitives (missing → `shared-engineer`).

## Outputs

- `widgets/<slice>/ui/<slice>/<slice>.tsx` — the composed block component.
- `widgets/<slice>/ui/<slice>/<slice>.test.tsx` — colocated behavior test.
- `widgets/<slice>/index.ts` — public API.

## What this skill does NOT do

- Does not create entity or feature slices.
- Does not contain business logic or form handling — delegates to feature slices.
- Does not wire routing or navigation (use `add-route`/`wire-navigation`).
