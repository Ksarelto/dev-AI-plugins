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

## Step 3: For every remaining file

- If a `.test.ts` / `.test.tsx` exists next to it → **update** that file
- If no test file exists → **create** one alongside the source file

## What to test per file type

| File type | Test focus |
|-----------|-----------|
| `Component.tsx` | Renders, user interactions, loading state, error state |
| `useHook.ts` | Initial state, state updates, side effects |
| `utils.ts` | Input/output transformations, edge cases, null handling |
| `Context/Provider` | Context value exposed, state changes propagate |
