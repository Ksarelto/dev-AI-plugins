# File Selection — Which Files Need Tests

## Step 1: Collect changed files

```bash
# All tracked changes vs HEAD (staged + unstaged)
git diff --name-only HEAD

# Staged only
git diff --cached --name-only

# Unstaged only
git diff --name-only

# Untracked files (new source files not yet added)
git ls-files --others --exclude-standard

# Everything on the branch vs main (full branch coverage)
git diff --name-only main...HEAD
```

## Step 2: Filter out files that do NOT need tests

Skip these even if they changed:

| Pattern | Reason |
|---------|--------|
| `constants.ts`, `constants.tsx` | Constants-only modules |
| `*.types.ts`, `*.types.tsx`, `types.ts` | Type-only modules |
| `index.ts`, `index.tsx` | Barrel / re-export files |
| `*.test.ts`, `*.test.tsx` | Already test files |
| `*.spec.ts`, `*.spec.tsx` | Already spec files |
| `*.d.ts` | Declaration files |
| `styles.ts` | Class strings only |
| `*.stories.tsx` | Story files |
| `locales/*.json`, `locales/keys.ts` | Copy and key maps |
| `main.tsx` | Entry point; covered by the app smoke test |

Nothing else is skipped. "Too simple to test", "covered by the page test", and "only renders children" are not exemptions — a component with no logic still gets one test asserting what it renders.

## Step 3: For every remaining file

Executable behavior (a component, hook, fetcher, model function, route module, or guard) needs a behavior test. Skip a file that only re-exports or only declares types.

- Component under a `ui/` folder: `{name}.test.tsx` in that folder. Update it if it exists.
- Every other executable file: a `*.test.ts` in the segment `tests/` folder. Features use `models/tests/`; entities and widgets use `model/tests/`. Also `api/tests/`, `hooks/tests/`, `lib/tests/`, `app/router/<group>/tests/`. One `shared/lib/tests/` for all of `shared/lib`. Test helpers for that segment live in the same `tests/` folder.
- Do not create `fetchers.test.ts` next to `api/fetchers.ts`.

## Step 4: Confirm nothing is missing

Before reporting done, list every remaining file from Step 2 next to its test path. Any row without a test is unfinished. In a feature-dev-kit project the `conventions` gate (`check-conventions.mjs`) fails the run with `missing-test` for each one.

## What to test per file type

| File type | Test focus |
|-----------|-----------|
| `{name}.tsx` under `ui/` | Renders, user interactions, loading state, error state |
| `useHook.ts` | Initial state, state updates, side effects |
| `utils.ts` | Input/output transformations, edge cases, null handling |
| `Context/Provider` | Context value exposed, state changes propagate |
