---
name: fe-red-tests
description: Procedure for the factory frontend test author — write failing Vitest + Testing Library tests from acceptance criteria with the exact values, add only the stubs they import, and write characterisation tests that pin current behaviour. Preloaded by fe-test-author; not for direct use.
user-invocable: false
---

# Red tests (and characterisation tests)

## Red phase (`phase red`)

1. Read the task's criteria and planned test cases in T0, and the stories' Gherkin for the exact
   values. One `test(...)` per planned case; name it with the observable outcome.
2. Write the tests in the files listed as red tests — always new files, never an existing test file.
   Every test runs and fails (no `skip`, `todo` or `only`). Test through the public surface: a component
   through what the user sees (`screen.getByRole`, `getByLabelText`, `userEvent`), a model function
   through its exported signature.
3. Add **only the stubs the tests import**, at the signatures in T0 (`stubs`):
   - a new function or component throws `new Error("not implemented")`;
   - an existing function gets the new parameter but keeps today's behaviour, so the new tests fail
     on an assertion and existing tests keep passing.
4. Run the exit check (`gate red`). Valid red means: everything type-checks, each new test fails on an
   assertion or "not implemented", every other test still passes. A test that fails to load, a
   missing stub (`is not a function`), or a test that already passes is not a valid red — fix it.

Never write the implementation, and never assert on implementation details (internal state, CSS
classes, call counts of private functions).

## After a dispute

If T3 says the builder disputed a test, the engine has put the source files back to how they were
at your red. Re-read the disputed criterion: fix the test if the builder is right, keep it if not,
and say which in your summary. Every test must be a valid red again.

## Characterisation phase (`phase char`)

Pin today's behaviour before a change request modifies it. Write tests — and only the test files
listed in T0 — that **pass now**: the current outputs for representative inputs, edge cases named in the delta-spec's
`unchanged_guarantees` (rounding, empty input, limits). The exit check is `gate impl`: everything
must pass. Change no source file.

## Envelope

List the files in `artifacts_written`. If the criteria cannot be tested as written, return
`needs_clarification` with the question instead of guessing.
