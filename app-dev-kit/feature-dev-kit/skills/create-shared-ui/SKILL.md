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

Adaptation is **frontend-dev-kit:shadcn-usage**. File layout is **frontend-dev-kit:react-component**. Do not strip Radix behavior (`frontend-dev-kit:accessibility`).

## Steps

1. **Check if it already exists**: search `shared/ui/<name>/`. If it exists, extend it. Do not create a second copy. There is no `shared/ui/index.ts` mega-barrel — consumers import `@/shared/ui/<name>`.

2. **Browse the shadcn registry**: use the shadcn MCP to search for the component. Use the registry component when it covers the need. Record the decision.

3. **Path A — Registry match**: run the shadcn MCP add command (equivalent to `npx shadcn add <component>`). This places the component files in the project's shadcn output directory.

4. **Adapt the registry component into the base folder**:
   - Move the file(s) to `shared/ui/<name>/` (`button/button.tsx`). Delete the leftover flat file under the CLI output path so `@/components/ui/*` is not a second copy.
   - Named export: `export const Button = ...`. Put prop types in `types.ts`.
   - Move every Tailwind string into `styles.ts`, including `animate-*`, `fade-*`, `zoom-*`, `slide-*`, and `data-[state=*]` classes. Do not delete them.
   - Confirm global CSS loads the animation stylesheet the installed shadcn version expects (`package.json`, `components.json`, global CSS). If that package is missing, record it for Station 1b. Do not add a second animation library from memory.
   - Replace hardcoded hex or non-token colors with semantic tokens (`bg-background`, `text-foreground`).
   - Use `cn()` where className is conditional. Keep CVA variants the registry already defined.

5. **Path B — No registry match**: hand-author via `shadcn-usage` and `tailwind-styles` only after the search returns no fit. Log in `## Tech Investigation`: `"<ComponentName> hand-authored: no registry match because <reason>"`.

6. **Create the component file structure**:
   ```
   shared/ui/<name>/
     <name>.tsx
     types.ts
     styles.ts
     <name>.test.tsx
     <name>.stories.tsx
     index.ts
   ```
   `{name}` is kebab-case (`button/button.tsx`). Named export stays PascalCase. `index.ts` exports the component and its props type only.

7. **Verify accessibility**: do not remove Radix props. Load `frontend-dev-kit:accessibility`.

8. **Run `yarn typecheck`**: fix all TypeScript errors.

9. **Update the spec `## Reuse Map`**: document the new shared component under "shadcn primitives" with import `@/shared/ui/<name>`.

## Pre-conditions

- The spec's `## UI Surface` identifies which shared UI components are needed.
- `shared/lib/cn.ts` exists with the `cn()` merge helper.

## Outputs

- `shared/ui/<name>/<name>.tsx` — named PascalCase export, kebab-case file. Radix structure and animation classes kept.
- `shared/ui/<name>/types.ts` — props type for the base.
- `shared/ui/<name>/styles.ts` — Tailwind, including open/close animation classes.
- `shared/ui/<name>/<name>.test.tsx` — colocated behavior test.
- `shared/ui/<name>/<name>.stories.tsx` — story for this primitive alone.
- `shared/ui/<name>/index.ts` — exports the component and its props type. No `shared/ui/index.ts` barrel.

## What this skill does NOT do

- Does not add business-domain logic to shared components — they must remain generic.
- Does not install packages (packages require human approval at station 1b).
- Does not create entity or feature slices.
