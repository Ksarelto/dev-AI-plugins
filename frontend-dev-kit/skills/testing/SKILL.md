---
name: testing
description: Write or fix tests for specified files, or for recently changed files if none are specified
argument-hint: [file-path]
allowed-tools: [Read, Glob, Grep, Edit, Write, Bash]
---

# Testing

Write or fix tests for the files specified (or for recently changed files if none are specified).

## Tech Stack

The test stack and its versions are in the `stack` rule (Vitest — not Jest; `vi`, never `jest`).
This skill assumes it rather than repeating it.

## Test location conventions

| Segment | Test location |
|---------|--------------|
| `features/{f}/api/` | `features/{f}/api/tests/` |
| `features/{f}/models/` | `features/{f}/models/tests/` |
| `features/{f}/hooks/` | `features/{f}/hooks/tests/` |
| `features/{f}/ui/{Component}/` | colocated `{Component}.test.tsx` (the only exception to `tests/`) |
| `shared/lib/` | `shared/lib/{module}/tests/` |

Rules:
- No `__fixtures__/` directories — mock objects are declared inline in the test file.
- No cross-slice tests — a test in `features/orders/` must never import from `features/documents/`.
- No MSW in unit or RTL tests — mock the module boundary with `vi.mock('@/shared/api/base')` or `vi.mock('../api/fetchers')`. MSW is for e2e only.

## Steps

1. **Determine which files need tests** — see [File Selection](references/file-selection.md)
2. **Check for existing test files** alongside each source file (`.test.tsx` / `.test.ts`)
3. **Create or update tests** following the references below
4. **Run and fix** until tests pass and coverage thresholds hold

## Test Execution Commands

```bash
yarn test:manual -u custom-button.test.tsx   # single file, watch mode
yarn test:auto                               # all tests + coverage
yarn test:coverage                           # coverage report only
yarn test:ui                                 # vitest UI
yarn test:ci                                 # CI mode
```

## Coverage Thresholds

| Metric     | Minimum |
|------------|---------|
| Branches   | 73%     |
| Functions  | 78%     |
| Lines      | 87%     |
| Statements | 86%     |

---

## References

| Topic | File |
|-------|------|
| Which files need tests, git-based scoping | [file-selection.md](references/file-selection.md) |
| Import order inside test files | [import-order.md](references/import-order.md) |
| All mocking patterns | [mock-patterns.md](references/mock-patterns.md) |
| Component, hook, utility templates | [test-templates.md](references/test-templates.md) |
| Test naming, organization, props, describe | [test-structure.md](references/test-structure.md) |
| DOM, mock function, async assertions | [assertions.md](references/assertions.md) |
| Common mistakes and anti-patterns | [common-mistakes.md](references/common-mistakes.md) |

---

## Pre-Submission Checklist

- [ ] Tests placed in `tests/` inside the source segment (colocated for components)
- [ ] No `__fixtures__/` directories — mocks declared inline in test files
- [ ] No cross-slice imports in tests
- [ ] No MSW — module boundary mocked with `vi.mock`
- [ ] File list scoped from staged/changed/branch files; constants, types, and index barrels excluded
- [ ] Every remaining touched source file has new or updated tests
- [ ] Using `vi` for mocks (NOT `jest`)
- [ ] `render` from `@/utils/rendererRTL`
- [ ] `userEvent` for interactions (NOT `fireEvent`)
- [ ] All user interactions are `await`ed
- [ ] Query results stored in constants before `expect`
- [ ] `vi.clearAllMocks()` in `beforeEach`
- [ ] Mock function names have `mock` prefix
- [ ] Default props defined outside test cases
- [ ] No empty tests
- [ ] Test names are descriptive — `'[action] when [condition]'`
- [ ] Critical paths covered (render, interaction, loading, error)
