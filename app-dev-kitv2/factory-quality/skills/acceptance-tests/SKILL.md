---
name: acceptance-tests
description: Procedure for the factory acceptance-test author — write one or more acceptance tests per acceptance criterion from the spec alone, named with the AC ID, driving the feature through its public surface, failing before implementation. Preloaded by the acceptance-test author; not for direct use.
user-invocable: false
---

# Acceptance tests (written before implementation)

## Where and how

- One file per story: `<surface>.acceptance.test.ts(x)` next to the page or slice the component map
  names (for example `src/pages/checkout/checkout.acceptance.test.tsx`), inside a folder the role's
  test command runs (a backend or agent role: under its `tests/` project). The `.acceptance.test.`
  part matters: task gates leave these files alone until verification, builders cannot read them,
  and they are locked once the acceptance gate passes.
- **Name every test with its AC ID first**: `test("AC-0001 a valid coupon shows the discount line", …)`.
  The acceptance gate checks that every AC of the spec is named by at least one test.
- Drive the highest public surface that exists for the story: the page or route a user reaches, or
  the API operation from the contract. Import only public entry points (`index.ts` of a slice, the
  page component); never deep-import internals.
- Use the exact values from the AC text and the Gherkin steps. Fake only what lies outside the
  feature (network via the contract's responses, time), never the behaviour under test: if the AC
  is about the error a coupon service returns, the test sets up the service's response, not the
  message the page shows.
- Where the AC states a rule (a calculation, a limit, a format), add one more example with other
  values that follow the same rule — an implementation that hard-codes the AC's numbers then fails.

## Before implementation

The tests must **not pass** yet — the feature does not exist. A test that already passes cannot
prove anything; rewrite it. A test may fail because an imported module does not exist yet; that is
expected now and must be fine at verification.

Run the exit check from T0 (`gate acceptance`) before you return.
