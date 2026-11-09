---
name: be-red-tests
description: Procedure for the factory backend test author — write failing Vitest unit tests for controllers, services, Zod schemas and middleware from acceptance criteria, using in-memory fakes instead of Postgres, add only the stubs they import, and write characterisation tests for change requests. Preloaded by be-test-author, and by be-builder for the red half of its one-dispatch build; not for direct use.
user-invocable: false
---

# Backend red tests

Runs on: be-test-author (characterisation, separate mode and its disputes; in the default one-dispatch mode a dispute goes back to the builder) and be-builder (the RED half of phase `build`, before it implements) — one backend task's red or characterisation phase: the unit-test files plus the stubs they import, no database. In `build` run `gate red --task <id>` yourself when the tests are written and do not implement until it passes.

The criteria are the specification; the code under test does not exist yet. The case catalogue, the
file locations the gates accept and the stub rules are in [be-test-matrix.md](references/be-test-matrix.md).

## 1. Read the pack

| Pack part | Take from it |
|---|---|
| T0 mission | the phase (`red` or `char`), `red_tests` (the only test files you write), `stubs` (the signatures to add), "Satisfies" (AC IDs with their text), "Planned test cases" (TEST IDs with level and title), "Files" |
| T0 "You may write only" | the write allowlist; in `char` it holds test files only |
| T1 | the stack skills — `node-backend-dev-kit:api-testing` plus the task type's skill — and every `Rule: … [READ]` line; load and read them before writing |
| T2 | the PRD or delta-spec, `stories.yaml`, `03-architecture/api-contract.yaml` (the operation, its responses and error codes), `test-plan.yaml`, golden files |
| T3 | on a retry: the gate's failures; after a dispute: the builder's reason |

## 2. Turn criteria into cases

1. List the planned cases for this task (T0 "Planned test cases"). Each becomes exactly one `it`.
2. For each AC in "Satisfies" pick the rows of the matrix its `kind` implies:

   | AC kind | Rows (see the matrix) |
   |---|---|
   | `happy` | the 2xx row of the operation, with the full DTO assertion |
   | `error` | 404, 409, 422 rows the AC or the contract's responses name |
   | `edge` | limit bound, empty list, last page, bad cursor, boundary values |
   | `permission` | 401, 403 wrong role, 404 for another user's row |
   | `nfr` | only what a unit test can observe (no secret in the DTO, a capped field length); timing NFRs are not unit tests — say so in the summary |

3. A planned case missing from the criteria's reach, or a criterion with no observable API outcome →
   `needs_clarification` with the exact question. A planned case at level `integration` cannot run in a
   task gate: write it at unit level through the throwaway app and record that under `deviations`.
4. The status codes and `code` values come from the contract, then from the stack rules
   (`rules/api-design.mdc`, `rules/error-handling.mdc`). Never invent a code the contract lacks; ask.

Worked mini-example — AC-0004 "A second project with the same name is rejected" (kind `error`),
contract `409 PROJECT_NAME_TAKEN`:

```ts
it('AC-0004 returns 409 PROJECT_NAME_TAKEN for a duplicate name', async () => {
  await api.post('/api/v1/projects').set(auth(owner)).send({ name: 'Atlas' }).expect(201);
  const res = await api.post('/api/v1/projects').set(auth(owner)).send({ name: 'Atlas' });
  expect(res.status).toBe(409);
  expect(res.body).toMatchObject({ code: 'PROJECT_NAME_TAKEN', status: 409 });
});
```

## 3. Pick the level and write

| Task type | Level |
|---|---|
| `endpoint` | route test on a throwaway Express app built from the real router, controller, service and middleware over in-memory repositories |
| `service` | service factory with in-memory repositories (never mocked Drizzle) |
| `validation`, `config` | schema `safeParse`, `parseEnv` |
| `auth`, `error-mapping`, `resilience` | middleware or lib on a throwaway app; injected `now`, `fetchImpl` |
| `openapi` | `buildOpenApiDocument()` assertions |
| `repository` | normally none (proved through the service test and verification's integration run) |

- Build fresh fakes in `beforeEach`; no state shared between tests, no order dependence.
- Tokens: sign with the stack's JWT service and `TEST_JWT_SECRET` from `tests/helpers/env.ts`; never
  disable `authenticate` in the app under test.
- Assert what a client sees: status, `body.code`, the problem `content-type`, the DTO fields, absent
  secrets, `errors[].path`. Never assert on log lines, call order or private helpers.
- A new resource needs an in-memory fake that implements the repository type. It goes in
  `tests/helpers/` only when T0 lists that file; otherwise `needs_scope_change` naming it.

## 4. Stubs (phase `red`)

Add the T0 `stubs` and nothing else: each new function, method, handler or router factory exists with
its final signature and throws `new Error('not implemented')`. A changed signature gets an optional
parameter that keeps today's behaviour. No logic in a stub, not even the happy path.

## 5. Check the failure reason, then the exit check

1. Run each file alone: `npx vitest run --project unit <file>`. Every test must fail, and the first
   line of each failure must be an assertion (`expected 500 to be 201`, `AssertionError`) or
   `not implemented`.
2. Fix wrong failures before the gate does: `is not a function` (a stub method is missing),
   `Cannot find module` (path or `.js` suffix), `Invalid environment` (use `testEnv()`), a timeout
   (an awaited fake never resolves).
3. Run the exit check from T0 (`gate red`). It fails on: a type error in tests or stubs; a red file
   not collected or not loading; a test that passes, is skipped or `todo`; a wrong failure reason;
   any other test of the change that now fails.

## Characterisation (phase `char`)

Pin today's API before the change: every guarantee the delta-spec lists in `unchanged_guarantees`,
plus status, `code` and DTO shape of each route the change touches. Use the same drivers. The tests
pass now; you write only the test files in T0. The exit check is `gate impl`: they must run, none
skipped, and the whole touched suite must stay green.

## After a dispute

T3 carries the builder's reason and the sources are back at your red. Re-read the criterion and the
contract. If the builder is right, fix the test (once); if not, keep it and give the reason in your
summary — the engine asks a human on a second dispute.

## Checklist

- [ ] One `it` per planned case, AC ID first in its name; no extra speculative cases
- [ ] Files under `tests/unit/`; only the files and stubs in T0 written
- [ ] In-memory fakes honour the repository type; no Drizzle or module mocks
- [ ] Each failure is an assertion or `not implemented`, checked per file before the gate
- [ ] Permission rows: 401, 403 wrong role, 404 for a stranger's row
- [ ] Every other test still passes; `gate red` (or `gate impl` for `char`) run and its result in the envelope
- [ ] Stack skills loaded with the Skill tool before writing, and named in the envelope's `skills_loaded`
