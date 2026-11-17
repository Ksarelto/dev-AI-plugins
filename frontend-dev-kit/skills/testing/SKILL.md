---
name: testing
description: Write or fix tests for specified files, or for recently changed files if none are specified
argument-hint: [file-path]
allowed-tools: [Read, Glob, Grep, Edit, Write, Bash]
---

# Testing

Write or fix tests for the files specified (or for recently changed files if none are specified).

## Tech Stack

Vitest, not Jest: `vi`, never `jest`.

## Test location conventions

| Segment | Test location |
|---------|--------------|
| `features/{f}/api/`, `models/`, `hooks/`, `lib/` | `…/tests/` next to that segment |
| `entities/{e}/api/`, `model/` | `…/tests/` |
| `widgets/{w}/hooks/`, `model/` | `…/tests/` |
| `app/router/{auth,error,root,guards}/` executable modules | `…/tests/` |
| Component folders under `ui/` | `{name}/tests/` — the component test and every `lib/` helper test |
| `shared/lib/*` | one `shared/lib/tests/` for every unit |
| `shared/api/` | `shared/api/tests/` |

Rules (constraints: `rules/testing.mdc`):
- Every executable file in the change gets a test — see [File Selection](references/file-selection.md) for the only exemptions.
- Mock only the boundary: the slice's own `api/fetchers` inside that slice, `httpClient` in `@/shared/api/base` everywhere else, `useNavigate`, missing browser APIs, time, env flags. Partial mocks use `importOriginal`. Never mock children, `@/shared/ui/*`, `react-hook-form`, `zod`, i18n, or the component's own hooks/models/store — see [Mock Patterns](references/mock-patterns.md).
- Assert the English copy from `en.json`, never a translation key.
- No comments in test files (no `// Arrange`, no section labels).
- No `__fixtures__/` directories — mock objects are declared inline in the test file.
- No cross-slice tests — a test in `features/orders/` must never import from `features/documents/`.
- No MSW in unit or RTL tests — mock the module boundary with `vi.mock('../api/fetchers')` inside the owning slice or `vi.mock('@/shared/api/base')` anywhere else. MSW is for e2e only.

## Steps

1. **Determine which files need tests** — see [File Selection](references/file-selection.md)
2. **Check for an existing test** in the location from the table above — component tests sit in `{component}/tests/`; everything else sits in that segment's `tests/`
3. **Create or update tests** that assert behavior. A test that only imports the module and expects it to be defined does not count
4. **Run**
   - **Factory red phase** (`fe-red-tests`, before `gate red`): each new test runs and fails on an assertion, a Testing Library lookup, or `"not implemented"`. Stop there. The coverage floors below are not the exit.
   - **Factory green phase**: run that task's tests with the project's runner until they pass. The exit check is `gate impl` (those tests and the architecture check). Lint, typecheck, and a coverage run belong to the later style pass.
   - **Outside a factory task**: run the test script named in this repo's `package.json` until the tests pass. Apply the coverage floors when that script enforces them.

## Test execution

Inside a factory task, use the project's runner and the factory gate. Read `package.json` for the package manager. Do not assume `yarn test:manual`, `yarn test:auto`, or any other fixed script name.

```bash
gate red --task <id>                         # red phase: passes when the new tests fail for the right reason
<package-manager> exec vitest run <file>     # green phase: the task's test files only
gate impl --task <id>                        # exit check
```

A full-suite coverage run belongs to the project's CI script, outside a factory task.

## Coverage Thresholds

These floors apply when the project's own coverage script enforces them. A factory task does not chase them.

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

- [ ] Tests placed in `{component}/tests/` for a component, or `tests/` inside the source segment otherwise
- [ ] No `__fixtures__/` directories — mocks declared inline in test files
- [ ] No cross-slice imports in tests
- [ ] No MSW — module boundary mocked with `vi.mock`
- [ ] File list scoped from staged/changed/branch files; only the exemptions in file-selection.md excluded
- [ ] Every remaining touched source file has new or updated tests — listed file → test path
- [ ] Only the boundary is mocked; no child, shared/ui, react-hook-form, zod, i18n, or own-hook mocks
- [ ] Partial mocks use `importOriginal`; no `as ReturnType<…>` / `as unknown as` on mocks
- [ ] Assertions use the English copy; no comments in test files
- [ ] Using `vi` for mocks (NOT `jest`)
- [ ] `render` from `@/shared/lib/rendererRTL`
- [ ] `userEvent` for interactions (NOT `fireEvent`)
- [ ] All user interactions are `await`ed
- [ ] Query results stored in constants before `expect`
- [ ] `vi.clearAllMocks()` in `beforeEach`
- [ ] Mock function names have `mock` prefix
- [ ] Default props defined outside test cases
- [ ] No empty tests
- [ ] Test names are descriptive — `'[action] when [condition]'`
- [ ] Critical paths covered (render, interaction, loading, error)
