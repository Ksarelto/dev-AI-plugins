---
name: create-react-component
description: Scaffold a React component in the correct FSD layer — presentational (entities/ui, shared/ui) or smart container (features/ui, widgets/ui) — with matching styles, tests, and index export. Uses real app patterns.
argument-hint: <ComponentName> [presentational|container|hook]
disable-model-invocation: false
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep]
---

# Create React Component

FSD placement only. Procedures live in **frontend-dev-kit**. Load them; do not restate them.

| Need | Skill |
|------|--------|
| Folder, files, export | `frontend-dev-kit:react-component` |
| Classes | `frontend-dev-kit:tailwind-styles` |
| Labels, focus, live regions | `frontend-dev-kit:accessibility` |
| Colocated test | `frontend-dev-kit:testing` |

## Where it goes

| Type | Path |
|------|------|
| Presentational | `entities/<domain>/ui/`, `shared/ui/`, `features/<slice>/ui/` |
| Container | `features/<slice>/ui/`, `widgets/<name>/ui/` |
| Hook reused by two components | `features/<slice>/model/` or `widgets/<name>/model/` |

Export through the slice `index.ts` only what a file outside the folder already imports. Four states: `rules/ui-quality.mdc` (attached by glob).

One kebab-case folder per component (`profile-card/profile-card.tsx`, `styles.ts`, `types.ts` when there are props, `index.ts`, `profile-card.test.tsx`). Never a flat `ProfileCard.tsx`.

If the piece is a shadcn/Radix primitive (button, dialog, drawer, and the rest) and `shared/ui/<name>` is missing, stop and hand it to `shared-engineer`. Do not author a second copy. Compose `@/shared/ui/<name>` in the part order of its registry demo.

Every component follows `{KIT_DIR}/skills/feature-dev/references/ui-build-contract.md` §§ 1–3: `t()` for every visible string, classes in `styles.ts`, named handlers, no JSX ternaries, closed-set constants, no comments, a colocated test.

## What this skill does NOT do

- Does not define TypeScript, Tailwind, a11y, or test recipes.
- Does not create the slice (`create-slice`) or the route (`add-route`).
