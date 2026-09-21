---
name: http-testing
description: Write Vitest HTTP integration tests for an Express router or service using supertest against createApp(), Testcontainers PostgreSQL, and Drizzle test factories.
---

# HTTP testing

## When to use

Writing or fixing tests for Express routes, services, or repositories. If the app factory does not exist, load `scaffold-service` first.

Defer libraries to `rules/stack.mdc`. Do not add Jest, pytest, or httpx.

## Procedure

1. `vitest.config.ts` — `globals` optional; `globalSetup` starts Testcontainers Postgres, sets `DATABASE_URL`, runs drizzle-kit migrate.
2. Tests import `createApp()` and `request(app)` from supertest. Never import `server.ts`, never `listen`.
3. Integration files: `tests/integration/{resource}/{resource}.router.test.ts`. Include glob `tests/**/*.test.ts` in `vitest.config.ts` (do not rely on Vite skipping gitignored trees).
4. Unit files: `tests/unit/{resource}/{resource}.service.test.ts` with a fake repository object.
5. Factories: plain async inserts in `tests/factories/` — not a Python factory-boy port. Import from `../../src/...` relative to `tests/factories/` (two levels up to `src`).
6. Auth: sign a JWT with test `JWT_SECRET` via `authHeader(user)`. Do not disable `requireAuth` on the test app.
7. When cache/jobs/rate-limit are on, start `@testcontainers/redis` next to Postgres (see `redis-backplane`) and `await redisReady` in a `setupFiles` entry.
8. Run `vitest run {file}` before declaring done.

## Coverage matrix (each router)

create 201 · create 422 (missing / unknown field) · create 409 conflict · get 200 · get 404 · list pagination · patch 200 · delete 204 · protected 401 · wrong role 403.

## Checklist

- [ ] Same `createApp()` as production (minus `listen`)
- [ ] Real Postgres via Testcontainers in CI
- [ ] Soft assertions on body shape, not only status
- [ ] Service unit tests throw the domain `AppError` subclass

## References

- [examples.md](./examples.md) — setup, factory, router test, service test
