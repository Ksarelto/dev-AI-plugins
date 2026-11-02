---
name: api-testing
description: Write and fix Vitest tests for a Node backend — service unit tests with in-memory repositories, supertest integration tests against real Postgres from Testcontainers, createTestApp, truncate between tests, auth and RBAC flows, injected time and fetch. Use when you need to add, write or fix unit or integration tests for an endpoint, route, service, middleware or lib function, or when a test run fails.
---

# API testing

## When to use

- Every change to a service, route, middleware or lib function (tests ship in the same change)
- A failing or flaky test, a Testcontainers / Docker problem, a missing test for an error path
- Not for scaffolding the harness from scratch — it ships with `scaffold-service`

Hard constraints: `rules/testing.mdc`. Code: [examples.md](examples.md). Harness (`vitest.config.ts`, global setup, `createTestApp`, `testEnv`, in-memory repositories, Docker runtimes, CI): [references/harness.md](references/harness.md).

## Which test

| Code under test | Project | Tool | Fakes allowed |
|---|---|---|---|
| Service (`create<Name>Service`) | `unit` | call the factory | in-memory repositories, pass-through `TransactionRunner`, injected `now` |
| Lib (`cursor`, `resilience`, `health`, clients) | `unit` | call the function | injected `now`, `fetchImpl`; never real network |
| Middleware (`authenticate`, `errorHandler`, `validate`) | `unit` | a throwaway `express()` app + supertest | none — real middleware, real JWT service |
| Env parsing | `unit` | `parseEnv({...})` | — |
| OpenAPI document | `unit` | `buildOpenApiDocument()` | — |
| Route / full flow | `integration` | `createTestApp()` + supertest | none — real container, real Postgres |

## Procedure — unit (service)

1. File: `tests/unit/services/<resource>.service.test.ts`.
2. In `beforeEach`, build fresh fakes (`createInMemoryRepositories()` or a resource-specific `createInMemory<Resource>Repository()` in `tests/helpers/`) and call the service factory.
3. The fake honours the contract: returns `undefined` for missing rows, rejects duplicates with `Object.assign(new Error('duplicate key'), { code: '23505' })`, fetches `limit + 1` for pages.
4. Assert outcomes and codes: `await expect(p).rejects.toMatchObject({ code: 'EMAIL_TAKEN' })`, `.rejects.toBeInstanceOf(ConflictError)`.
5. Time-dependent rules: inject `now: () => now` and move `now`, never sleep.

## Procedure — integration (route)

1. File: `tests/integration/<resource>.test.ts`.
2. Module scope: `const testApp = createTestApp(); const { app } = testApp;` then `beforeEach(testApp.reset)` and `afterAll(testApp.close)`.
3. Create state through the API (register → token) or `testApp.createAdmin(email, password)` for an admin.
4. Per route, cover: happy path (status + DTO shape), 401 without token, 403 wrong role, 404 for another user's row, 409 for duplicates, 422 with `errors[].path` values, and that secrets are absent.
5. Lists: create more rows than `limit`, follow `nextCursor` to the end, assert no duplicates and `nextCursor: null` on the last page.
6. New table → add it to the `truncate` list in `tests/helpers/test-app.ts`.

## Running

```bash
npm run test:unit            # no Docker
npm run test:integration     # Testcontainers postgres:17-alpine, or TEST_DATABASE_URL
npm run test:coverage        # both, V8 coverage of src/
npx vitest run --project unit tests/unit/services/projects.service.test.ts   # one file
```

If the integration project cannot start a container, check the Docker runtime variables in [references/harness.md](references/harness.md#docker-runtimes-and-ci) before changing any test.

## Checklist

- [ ] Unit tests need no Docker or network; integration tests mock nothing in `src/`
- [ ] Service tests use contract-honouring in-memory repositories, not Drizzle mocks
- [ ] Each integration file resets the database before every test and closes it after all
- [ ] Error paths assert `status` and `body.code`; 422 asserts the failing paths
- [ ] Protected routes have 401, 403 and 404-for-stranger cases
- [ ] DTOs checked for absent secrets (`passwordHash`, token hashes)
- [ ] No sleeps beyond a few ms; time and fetch injected
- [ ] `npm run test:unit` and `npm run test:integration` actually run and pass before reporting done
