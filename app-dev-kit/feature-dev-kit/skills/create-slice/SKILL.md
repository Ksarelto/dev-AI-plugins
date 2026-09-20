---
name: create-slice
description: Core FSD scaffold. Create a <layer>/<slice>/{ui,model,api,lib,config,index.ts} structure with a correct public API. Foundation for create-entity/feature/widget/page. Use when placing new code into an FSD slice.
argument-hint: <layer> <slice-name>
disable-model-invocation: false
allowed-tools: [Read, Write, Bash, Glob, Grep]
---

# Create Slice

## When to use

Any station that introduces a new FSD slice. This is the base scaffold that the higher-level `create-entity`, `create-feature`, `create-widget`, and `create-page` skills build on. Use directly only when no higher-level skill applies.

## Steps

1. **Determine required segments**: based on what the slice needs, select only the segments that have content. Do not create empty directories. Common combinations:
   - Entity: `model/`, `api/`, `ui/`, `index.ts`
   - Feature: `model/`, `api/` (if mutations needed), `ui/`, `lib/` (if validators), `index.ts`
   - Widget/Page: `ui/`, `index.ts`

2. **Create the slice directory**: `src/<layer>/<slice>/`. Do not create the directory without at least one file in it.

3. **Create `index.ts` first** (before any segment files):
   ```ts
   // src/<layer>/<slice>/index.ts
   // Public API — export only what external code needs
   // Add exports here as segments are built
   export {}
   ```
   The `export {}` placeholder prevents TypeScript errors until real exports are added.

4. **Create each required segment directory** with a placeholder file to track intent, then fill them per the higher-level skill instructions.

5. **Enforce downward-only imports**: add a comment at the top of each segment file listing what it may import from:
   - Entity slice: may import from `shared/*`
   - Feature slice: may import from `entities/*/index.ts`, `shared/*`
   - Widget/Page slice: may import from `features/*/index.ts`, `entities/*/index.ts`, `shared/*`

6. **Run FSD boundary lint** after creating the slice: `yarn lint:fsd`. Fix any violations before returning.

7. **Update `index.ts`** to export only the public symbols needed by external code. Remove the `export {}` placeholder when real exports exist.

## Pre-conditions

- Parent directory (`src/<layer>/`) exists.
- The spec's `## FSD Impact` section identifies this slice as needing creation.

## Outputs

- `src/<layer>/<slice>/` directory with the required segment directories.
- `src/<layer>/<slice>/index.ts` with named re-exports of the public surface.
- FSD boundary lint passes.

## What this skill does NOT do

- Does not write business logic — only directory and file structure.
- Does not modify existing slices in other layers.
- Does not export internal segments — only the public surface through `index.ts`.
