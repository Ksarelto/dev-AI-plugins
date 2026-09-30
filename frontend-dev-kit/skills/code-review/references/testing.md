# Testing — review checklist

Distilled from the `testing` skill and `rules/testing.mdc`. Applies to every executable file in the diff — component, hook, fetcher, model/lib function, store, route module, guard. Exempt: `types.ts`, `constants.ts`, `styles.ts`, `index.ts`, stories, `locales/`, `main.tsx`.

## Coverage

- An executable file in the diff has no test (colocated `{name}.test.tsx` for a component, the segment's `tests/` otherwise). List each one — do not summarize as "some files lack tests".
- A page or widget test standing in for its child components' own tests.
- A test that only asserts "renders" / "is defined", or has no `expect`.
- A critical path (loading, error, empty, main interaction) of the changed code with no covering test.

## Mocking

- A mock of something the test can run: the component's own children (`vi.mock('./child-card')`), `@/shared/ui/*`, `react-hook-form` / a stubbed `useForm`, `zod`, `react-i18next`, `cn`, the component's own `model/` functions or store.
- A query/mutation hook mocked where mocking its fetcher would let the real hook run.
- A whole-module mock that replaces exports the test does not stub — should be an `importOriginal` partial mock.
- A mocked hook/module/context returning fields the code under test never reads.
- `as ReturnType<typeof useX>`, `as unknown as`, or `as any` forcing a mock's type.
- A test-only Provider re-implementing a real provider instead of using `rendererRTL`.

## Mechanics

- `jest` instead of `vi`.
- Raw RTL `render` instead of `render` from `@/shared/lib/rendererRTL`.
- `fireEvent` instead of `userEvent`, or an un-`await`ed `userEvent` call.
- Assertions on translation keys instead of the English copy from `en.json`.
- Comments in the test file (`// Arrange`, section labels).
- `vi.clearAllMocks()` missing from `beforeEach` where mocks are used; mock names without the `mock` prefix; default props redefined per test.
- A test name that isn't `'[action] when [condition]'` or otherwise descriptive.

## Severity

A missing test for an executable file in the diff is **Must fix** — list the file. Over-mocking (children, shared/ui, react-hook-form, own hooks) and cast-forced mocks are **Must fix**: the test passes while the real composition is broken. `jest`, `fireEvent`, and un-awaited interactions are **Must fix**. The rest is **Should fix**.
