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

1. **Check the shadcn registry first**: browse the shadcn MCP for block-level patterns matching the spec's `## UI Surface` layout (dashboard shells, data table + sidebar, split panels). If a block matches, pull it via MCP and adapt to project conventions before hand-authoring layout.

2. **Scaffold the slice** using `create-slice` for `widgets/<slice>/` with segment `ui/`.

3. **Identify composition inputs**: list every feature and entity public API this widget consumes. Verify each is accessible through its `index.ts`. Do not import from internals.

4. **Build the widget component** at `widgets/<slice>/ui/<SliceName>.tsx`:
   - Import feature components (via `features/*/index.ts`) and entity display components (via `entities/*/index.ts`).
   - Use entity hooks for data — import them via the entity's `index.ts`.
   - Arrange components using Tailwind utility classes per `rules/styling-conventions.mdc`.
   - The widget owns the loading state for its composed subtree: when any hook `isLoading`, render a `Skeleton` from `shared/ui`.
   - The widget owns the error state: when a hook has an error, render an inline error message with a retry action.
   - The widget owns the empty state: when data is defined but empty, render an `EmptyState` component.

5. **Handle local UI state** (not API state) with `useState`: tab selection, sidebar open/close, active accordion. Do not manage API state — that belongs in entity/feature hooks.

6. **Co-locate tests** at `widgets/<slice>/ui/<SliceName>.test.tsx`. Test all four states (loading, empty, error, populated) and any local UI state transitions.

7. **Update `widgets/<slice>/index.ts`** with named exports:
   ```ts
   export { ProfileReconciliationPanel } from './ui/ProfileReconciliationPanel'
   ```

8. **Run `yarn typecheck`**: fix all TypeScript errors.

9. **Update the spec `## Build Plan`**: mark widget tasks as done, list files created.

## Pre-conditions

- All feature and entity slices the widget composes exist with their `index.ts` public APIs.
- `shared/ui` has `Skeleton`, `EmptyState`, and other required primitives.

## Outputs

- `widgets/<slice>/ui/<SliceName>.tsx` — the composed block component.
- `widgets/<slice>/ui/<SliceName>.test.tsx` — co-located tests.
- `widgets/<slice>/index.ts` — public API.

## What this skill does NOT do

- Does not create entity or feature slices.
- Does not contain business logic or form handling — delegates to feature slices.
- Does not wire routing or navigation (use `add-route`/`wire-navigation`).
