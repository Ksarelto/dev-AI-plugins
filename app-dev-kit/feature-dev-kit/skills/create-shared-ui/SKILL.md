---
name: create-shared-ui
description: Add a UI-kit item to shared/ui by pulling it from the shadcn registry via the shadcn MCP, then adapting it to our conventions (colocation, named export, index.ts, tokens). Hand-write only when the registry has no fit. Use when a feature needs a new shared primitive.
argument-hint: <component-name>
disable-model-invocation: false
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep]
---

# Create Shared UI

## When to use

Station 3. Invoke when a feature build needs a new `shared/ui` primitive. Used by `shared-engineer`. Do not invoke if the component already exists in `shared/ui` — check first.

## Steps

1. **Check if it already exists**: search `shared/ui/index.ts` and the directory for the component name. If it exists, verify it covers the needed variant — extend it rather than creating a duplicate.

2. **Browse the shadcn registry**: use the shadcn MCP to search for the component. Evaluate the registry result — does the primitive cover the need? Is it close enough to adapt? Record the decision.

3. **Path A — Registry match**: run the shadcn MCP add command (equivalent to `npx shadcn add <component>`). This places the component files in the project's shadcn component directory.

4. **Adapt the registry component**:
   - Move the file(s) to `shared/ui/<component-name>/`.
   - Rename any default exports to named exports: `export const Button = ...` not `export default Button`.
   - Replace any hardcoded hex colors or Tailwind non-token values with semantic token classes (`bg-background`, `text-foreground`, etc.).
   - Add `cn()` usage wherever className is constructed conditionally.
   - Add CVA variants if the component has multiple visual states.

5. **Path B — No registry match**: hand-author the component following `rules/shadcn-ui-conventions.mdc` and `rules/styling-conventions.mdc`. Use CVA + cn() from the start. Log in the spec's `## Tech Investigation`: `"<ComponentName> hand-authored: no registry match because <reason>"`.

6. **Create the component file structure**:
   ```
   shared/ui/<component-name>/
     <ComponentName>.tsx      # named export
     <ComponentName>.test.tsx # co-located tests
     index.ts                 # re-export
   ```

7. **Verify accessibility**: the Radix/shadcn base provides ARIA, keyboard, and focus management. Do not remove or override Radix props. Check the accessibility checklist from `rules/accessibility.mdc`.

8. **Export from `shared/ui/index.ts`**:
   ```ts
   export { Button, type ButtonProps } from './button/Button'
   ```

9. **Run `yarn typecheck`**: fix all TypeScript errors.

10. **Update the spec `## Reuse Map`**: document the new shared component entry under "shadcn primitives".

## Pre-conditions

- The spec's `## UI Surface` identifies which shared UI components are needed.
- `shared/lib/cn.ts` exists with the `cn()` merge helper.

## Outputs

- `shared/ui/<component-name>/<ComponentName>.tsx` — the named-export component.
- `shared/ui/<component-name>/<ComponentName>.test.tsx` — co-located tests.
- `shared/ui/<component-name>/index.ts` — segment-level re-export.
- `shared/ui/index.ts` updated with the new named export.

## What this skill does NOT do

- Does not add business-domain logic to shared components — they must remain generic.
- Does not install packages (packages require human approval at station 1b).
- Does not create entity or feature slices.
