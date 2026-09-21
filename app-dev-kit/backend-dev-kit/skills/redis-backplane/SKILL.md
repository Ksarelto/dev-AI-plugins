---
name: redis-backplane
description: Wire Redis for cache-aside, BullMQ background jobs, and express-rate-limit store — official redis client, PING on /readyz, serializable job IDs. Use when adding caching, durable queues, or clustered rate limits, not for Drizzle queries.
---

# Redis backplane

## When to use

Cache-aside on a read, a job that must retry or survive restart, or an in-app rate limiter that works across instances. Postgres queries are `database-patterns`. JWT login is `auth-jwt` (this skill only rate-limits `/auth/token`).

Defer libraries to `rules/stack.mdc`. Cache client is official `redis`, not `ioredis`.

## Procedure

1. One client in `src/db/redis.ts` from `env.REDIS_URL`. Compose service name `redis` (`redis:7-alpine`).
2. `/readyz` — `select 1` on Postgres **and** `PING` Redis (short timeout) → 503 on failure.
3. Cache-aside in the **service**: `GET` key; miss → repo → `SET` with TTL; writes `DEL` the key. Namespaced keys (`book:v1:{id}`).
4. BullMQ `Queue` in `src/queues/{name}.ts` + `Worker` in `src/workers/{name}.ts` (second process). Payload = `{ id }` only; re-fetch inside the worker; idempotent; explicit attempts/backoff.
5. `express-rate-limit` + `rate-limit-redis` on `POST /api/v1/auth/token` (and register). 429 + `Retry-After`. No in-memory `Map`.
6. Tests: Testcontainers Redis (`@testcontainers/redis`) when cache/jobs/limiter are under test; otherwise inject a fake redis in unit tests.

## Checklist

- [ ] Invalidation next to the write in the service, not the router
- [ ] Job args are serializable IDs
- [ ] Shutdown closes redis + queue in `server.ts`
- [ ] `ioredis` is not imported for cache

## References

- [examples.md](./examples.md) — client, cache, queue, limiter, worker
