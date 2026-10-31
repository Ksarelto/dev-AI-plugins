---
name: be-red-tests
description: Procedure for the factory backend test author — write failing Vitest unit tests for controllers, services, Zod schemas and middleware from acceptance criteria, using in-memory fakes instead of Postgres, add only the stubs they import, and write characterisation tests for change requests. Preloaded by be-test-author; not for direct use.
user-invocable: false
---

# Backend red tests

## What to test, and where

Unit tests live under `tests/unit/<layer>/` and never need Docker:

| Task type | Test through | Fakes |
|---|---|---|
| endpoint | the controller handler with a fake `req`/`res`, or `supertest` on an app built from fakes | in-memory repositories (`tests/helpers/in-memory-repositories.ts`) |
| service | the service factory's public functions | in-memory repositories, fixed clock/ids |
| validation | the Zod schema's `safeParse` with valid and invalid bodies | none |
| error-mapping, auth | the middleware with a fake `next` | none |
| repository | the service tests, through the in-memory fake that mirrors the repository interface — real SQL is covered by `test:integration` (Testcontainers), which task gates do not run | in-memory repositories |

Assert on what a client sees: status code, response body, the problem+json `type` and `status`,
headers the criteria name. Never assert on log lines or internal call order.

## Red phase (`phase red`)

1. One test per planned case in T0, named after the observable outcome, in the red-test files
   listed (always new files).
2. Stubs: a new factory or handler throws `new Error("not implemented")`; a changed signature gets
   the new optional parameter while keeping today's behaviour, so other tests stay green.
3. Run the exit check (`gate red`): type-checks, each new test fails on an assertion or
   "not implemented", the rest of the suite passes.

## After a dispute

T3 tells you the builder disputed a test and the sources are back at your red. Re-read the
criterion, then either fix the test or keep it and give the reason in your summary.

## Characterisation phase (`phase char`)

Pin the current API before a change request touches it: status codes and bodies for the existing
routes and edge cases the delta-spec lists as `unchanged_guarantees`. These tests pass now; write
only the test files listed in T0.

If a criterion has no observable API outcome, return `needs_clarification` with the question.
