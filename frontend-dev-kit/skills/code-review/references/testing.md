# Testing — review checklist

Distilled from the `testing` skill. Applies whenever the diff adds or changes a non-trivial
component, hook, or utility (constants, types, and index barrels are exempt).

- A touched source file has no new or updated test covering the change.
- A test still uses `jest` (mocks, globals) instead of `vi` (Vitest is the stack).
- A component test renders with raw RTL `render` instead of the project's `render` from `@/utils/rendererRTL`.
- An interaction uses `fireEvent` instead of `userEvent`, or a `userEvent` call isn't `await`ed.
- A query result is used directly in an assertion instead of stored in a constant first.
- `vi.clearAllMocks()` missing from `beforeEach` where mocks are used.
- A mock function isn't prefixed `mock` (breaks Vitest hoisting expectations elsewhere in the suite).
- Default props defined inline per test case instead of once outside the test cases.
- A test name doesn't read as `'[action] when [condition]'`, or is otherwise not descriptive of the behavior under test.
- A critical path (render, interaction, loading, error) for the changed code has no covering test at all.

## Severity

Missing coverage for a changed non-trivial file, or a critical path (loading/error) with zero
test, is **Should fix** and should be called out explicitly rather than silently skipped. `jest`
usage, `fireEvent` instead of `userEvent`, and un-awaited interactions are **Must fix** — they
produce flaky or silently-wrong tests, not just style drift.
