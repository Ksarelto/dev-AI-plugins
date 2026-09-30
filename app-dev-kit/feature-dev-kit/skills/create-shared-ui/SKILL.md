---
name: create-shared-ui
description: Add a UI-kit item to shared/ui by pulling it from the shadcn registry via the shadcn MCP and re-homing it verbatim — same style, Radix parts, data-slot, and registry open/close animation (tw-animate-css), plus closed-set constants (ButtonVariant) and index.ts. Hand-write only when the registry has no fit. Use when a feature needs a new shared primitive.
argument-hint: <component-name>
disable-model-invocation: false
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep]
---

# Create Shared UI

## When to use

Station 3. Invoke when a feature build needs a new `shared/ui` primitive. Used by `shared-engineer`. Do not invoke if the component already exists in `shared/ui` — check first.

Adaptation is **frontend-dev-kit:shadcn-usage**. File layout is **frontend-dev-kit:react-component**. Do not strip Radix behavior (`frontend-dev-kit:accessibility`).

## Steps

1. **Check if it already exists**: search `shared/ui/<name>/`. If it exists, extend it. Do not create a second copy. There is no `shared/ui/index.ts` mega-barrel — consumers import `@/shared/ui/<name>`.

2. **Browse the shadcn registry**: use the shadcn MCP to search for the component. Use the registry component when it covers the need. Record the decision.

3. **Path A — Registry match**: run the shadcn MCP add command (`get_add_command_for_items`, equivalent to `npx shadcn@latest add <component>`) against the project's `components.json` style. This places the component files in the project's shadcn output directory. Keep that CLI output open — it is the diff baseline for step 4.

4. **Re-home, do not rewrite** (`frontend-dev-kit:shadcn-usage` § Adding a base, `rules/shadcn.mdc`):
   - Move the file(s) to `shared/ui/<name>/` (`button/button.tsx`). Delete the leftover flat file under the CLI output path so `@/components/ui/*` is not a second copy.
   - Keep every exported part, prop, `data-slot` attribute, and the Radix import exactly as generated.
   - Move every class string into `styles.ts` verbatim and in the same order, the `cva()` table unchanged — including `animate-in`/`animate-out`, `fade-*`, `zoom-*`, `slide-in-from-*`, `duration-*`, and every `data-[state=*]:` class. Diff the moved strings against the CLI output; a missing or reordered class is a bug.
   - Allowed edits only: deleting the registry's comments, kebab-case file names, props types to `types.ts`, closed-set constants in `constants.ts` (`ButtonVariant`, `ButtonSize`, `ButtonType`, …) derived from the `cva` table, user-facing literals (`sr-only` "Close") to `t(commonKeys…)`, and `Button`'s default `type`. Do not "improve" colors, spacing, radius, or motion.
   - Confirm global CSS imports the animation stylesheet the CLI configured (`@import "tw-animate-css"` on Tailwind v4) exactly once. If that package is missing, record it for Station 1b. No custom `@keyframes`, no `--animate-*`, no second animation library.
   - Read the registry demo (`get_item_examples_from_registries`, e.g. `dialog-demo`) and note its part order in the handoff so composers follow it.

5. **Path B — No registry match**: hand-author via `shadcn-usage` and `tailwind-styles` only after the search returns no fit. Log in `## Tech Investigation`: `"<ComponentName> hand-authored: no registry match because <reason>"`.

6. **Create the component file structure**:
   ```
   shared/ui/<name>/
     <name>.tsx
     types.ts
     styles.ts
     constants.ts        (when the base has a closed-set prop)
     <name>.test.tsx
     <name>.stories.tsx
     index.ts
   ```
   `{name}` is kebab-case (`button/button.tsx`). Named export stays PascalCase. `index.ts` exports the parts and constants consumers import — not the props type unless a consumer imports it.

7. **Verify accessibility**: do not remove Radix props. Load `frontend-dev-kit:accessibility`.

8. **Run `yarn typecheck`**: fix all TypeScript errors.

9. **Update the spec `## Reuse Map`**: document the new shared component under "shadcn primitives" with import `@/shared/ui/<name>`.

## Pre-conditions

- The spec's `## UI Surface` identifies which shared UI components are needed.
- `shared/lib/cn.ts` exists with the `cn()` merge helper.

## Outputs

- `shared/ui/<name>/<name>.tsx` — named PascalCase export, kebab-case file. Radix structure, parts, and `data-slot` exactly as the CLI generated them.
- `shared/ui/<name>/types.ts` — props type for the base.
- `shared/ui/<name>/styles.ts` — the registry's class strings verbatim, including open/close animation classes.
- `shared/ui/<name>/constants.ts` — closed-set prop constants derived from the `cva` table.
- `shared/ui/<name>/<name>.test.tsx` — colocated behavior test.
- `shared/ui/<name>/<name>.stories.tsx` — story for this primitive alone.
- `shared/ui/<name>/index.ts` — exports the parts and constants consumers import. No `shared/ui/index.ts` barrel.

## What this skill does NOT do

- Does not add business-domain logic to shared components — they must remain generic.
- Does not install packages (packages require human approval at station 1b).
- Does not create entity or feature slices.
