# Backend red-test matrix

What a red test of the backend role must prove, per task type, and where it must live so the factory's
gates see it. The harness itself (in-memory repositories, `testEnv`, `createTestApp`, supertest usage)
belongs to `node-backend-dev-kit:api-testing`; read that skill for the code shapes. This file decides
the cases.

## Where the test lives

| Fact | Consequence for a red test |
|---|---|
| Task gates run the stack command `test` = `npm run test:unit` (project `unit`, `tests/unit/**/*.test.ts`), scoped with `--changed` | Every red test file sits under `tests/unit/<layer>/`. A file under `tests/integration/` or colocated in `src/` is reported `not-collected` |
| Integration tests (Testcontainers, real Postgres) run only once, in verification (`gate checks`) | Never write a red test that needs Docker. If T0 lists a `tests/integration/…` file as a red test, return `needs_scope_change` |
| `gate red` type-checks the whole project | Stubs and test imports must compile; `import type` for types, `.js` suffix on relative imports |
| Acceptance tests (`*.acceptance.test.*`) are the holdout | You cannot read them; do not try to mirror them |

| Task type | Test file | Drive it through |
|---|---|---|
| `endpoint` | `tests/unit/routes/<resource>.routes.test.ts` | a throwaway `express()` app: `express.json()`, the real router factory, the real controller and service over in-memory repositories, the real `authenticate(jwt)` with `TEST_JWT_SECRET`, `errorHandler()` last; supertest |
| `service` | `tests/unit/services/<resource>.service.test.ts` | the `create<Resource>Service` factory with in-memory repositories and a pass-through `TransactionRunner` |
| `validation`, `config` | `tests/unit/schemas/<entity>.schema.test.ts`, `tests/unit/config/env.test.ts` | `safeParse` / `parseEnv` with valid and invalid input |
| `auth`, `error-mapping`, `resilience` | `tests/unit/middleware/…`, `tests/unit/lib/…` | a throwaway app with the real middleware; injected `now` / `fetchImpl` for resilience |
| `openapi` | `tests/unit/openapi/document.test.ts` | `buildOpenApiDocument()`: the new path, method, component id, `security` |
| `repository` | none of its own at unit level | the in-memory fake mirrors the new method and a service test proves the behaviour; real SQL is proven in verification. A repository task with a red test is normally a planning mistake: ask with `needs_scope_change` |
| `characterisation` | the files T0 lists | the same drivers, against today's code; the tests pass |

## Endpoint matrix

One `it` per row the task's criteria cover. Name each test after the outcome a client sees, and put the
AC ID first so a reviewer can trace it: `it('AC-0004 returns 409 PROJECT_NAME_TAKEN for a duplicate name')`.

| Case | Request | Assert |
|---|---|---|
| create — 201 | `POST` a valid body with an owner's token | status 201; `body` has every DTO field (`toMatchObject`), `id` is a UUID, timestamps are ISO strings; no `passwordHash`, token hash or internal flag (`not.toHaveProperty`) |
| create — 422 missing field | `POST` without one required field | 422, `body.code === 'VALIDATION_FAILED'`, an `errors[]` entry with `path: 'body.<field>'` |
| create — 422 unknown field | `POST` with an extra key, preferably a server-owned one (`ownerId`, `role`, `id`) | 422, an `errors[]` entry with `path: 'body'` and `code: 'unrecognized_keys'` (strict body) |
| create — 409 conflict | create twice with the same unique value | 409 and the specific code from the contract (`<WHAT>_TAKEN`); the in-memory fake rejects with `{ code: '23505' }` |
| get — 200 | `GET /:id` of an own row | 200 and the DTO |
| get — 404 | `GET /:id` with an unknown UUID | 404, `<ENTITY>_NOT_FOUND`, `content-type` matches `application/problem+json` |
| get — 422 bad id | `GET /not-a-uuid` | 422 with `path: 'params.id'` |
| list — paginated | create `limit + 1` own rows, `GET ?limit=<n>` | `items.length === n`, `nextCursor` is a string; following it returns the rest, no duplicates, and `nextCursor: null` on the last page |
| list — limit bound | `GET ?limit=101` (above the stack's maximum of 100), and `?limit=0` | 422 with `path: 'query.limit'`; a missing `limit` uses the default (20) |
| list — bad cursor | `GET ?cursor=garbage` | 400 `INVALID_CURSOR` |
| list — only own rows | rows of two users, list as one | only the caller's rows |
| update — 200 | `PATCH /:id` with one field | 200 and the updated DTO; untouched fields unchanged |
| update — 422 empty | `PATCH /:id` with `{}` | 422 (at least one field required) |
| delete — 204 | `DELETE /:id` of an own row | 204, empty body; a following `GET` is 404 |
| 401 unauthenticated | any protected route without `authorization` | 401 `MISSING_TOKEN`; a malformed or foreign-secret token gives 401 `INVALID_TOKEN` |
| 403 wrong role | an admin-only route with a `user` token | 403 `FORBIDDEN` |
| not owner | `GET`/`PATCH`/`DELETE` another user's row | 404 `<ENTITY>_NOT_FOUND` — the stack hides existence (`rules/auth-security.mdc`). If the criterion says 403 for a stranger, the AC and the stack disagree: return `needs_clarification`, do not pick one |
| 401 before 422 | protected route, no token, invalid body | 401 (guards run before `validate`) |

Rows that the criteria do not cover are not written: no speculative tests. Rows they do cover are
never merged into one `it`.

## Service matrix

| Case | Assert |
|---|---|
| happy path | the returned domain object (not a row): fields, normalisation (lower-cased email), no secret field |
| not found | `await expect(p).rejects.toMatchObject({ code: '<ENTITY>_NOT_FOUND' })` and `.rejects.toBeInstanceOf(NotFoundError)` |
| not owner | a row created by user A, called with principal B → the same `NotFoundError`; an admin principal passes when the criterion says so |
| conflict | the fake's unique violation becomes `ConflictError` with the contract's code; any other fake error is rethrown unchanged |
| business rule | `ValidationError` with the `errors[].path` the criterion names, or the specific `AppError` |
| owner from the principal | create with principal A stores `ownerId === A.userId`; nothing in the input can set it |
| pagination | the fake returns `limit + 1` rows → `nextCursor` set; `limit` rows → `nextCursor: null` |
| time | inject `now: () => fixed` and move it; never `setTimeout` |

Never mock Drizzle, `postgres`, the query builder, `vi.mock('../../src/db/…')` or a repository module.
The in-memory fake implements the repository's exported type, so a drifting signature is a type error.

## Typed stubs

A red test must load and fail on an assertion. The gate rejects a load error (`Cannot find module`,
`is not a function`, `is not exported`), an environment error (`ECONNREFUSED`, `Invalid environment`)
and a timeout as the wrong failure.

| You test | Stub (only in files T0 lists) |
|---|---|
| a new service method | the method exists on the factory's returned object with its final signature and body `throw new Error('not implemented')` |
| a new route | the router factory and controller handler exist; the handler throws `not implemented`, so the app answers 500 and the status assertion fails (`expected 500 to be 201`) |
| a new schema | the exported request object exists with permissive placeholder schemas only when the test checks behaviour beyond parsing; otherwise the schema test itself is the red |
| a new repository method used by the fake | the method on the repository type, so the fake and the service compile |
| a changed signature | the new optional parameter, today's behaviour kept, so every other test stays green |

## Characterisation (phase `char`)

Pin what clients rely on before a change request touches it: for each route or function the
delta-spec lists under `unchanged_guarantees` (and each one the change touches), the status, the
`code` of each problem response, the DTO shape and the pagination behaviour. Run the file: every test
passes now. A characterisation test that fails today is not a characterisation — read the code again
and pin what it really does, then report the surprise in `follow_up_suggested`.
