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

3. **Create each required segment** with its real first file, per the higher-level skill. No placeholder files, no empty `export {}` modules.

4. **Enforce downward-only imports** — by where you import from, not by writing it down (no header comments in segment files):
   - Entity slice: may import from `shared/*`
   - Feature slice: may import from `entities/*/index.ts`, `shared/*`
   - Widget/Page slice: may import from `features/*/index.ts`, `entities/*/index.ts`, `shared/*`

5. **Write `index.ts` last**, once the segments exist. It re-exports only the symbols a file outside the slice imports today — usually the one entry component (a feature's error-boundary-wrapped entry, a widget, a page) and, for an entity, its public hooks/types. No `export *`, no "may be useful later" exports, nothing only a test uses.

6. **Run FSD boundary lint** after creating the slice: `yarn lint:fsd`. Fix any violations before returning.

7. **Every executable file in the slice has a test** in the same change (`rules/testing.mdc`). The `conventions` gate fails on `missing-test`, `comment`, and `unused-export`.

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
