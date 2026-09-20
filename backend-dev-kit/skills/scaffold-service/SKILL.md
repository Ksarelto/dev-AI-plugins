---
name: scaffold-service
description: Scaffold a Node.js TypeScript Express service — package.json, createApp factory, compose.ts, Drizzle client, Zod env, middleware, drizzle-kit, and .env.example. Use when creating the initial directory structure for a new backend API, not when adding a resource to an existing tree.
argument-hint: "[service-name]"
disable-model-invocation: true
---

# Scaffold backend service

## When to use

- Starting a new Express + TypeScript API from scratch
- The stack is this kit’s default and the folder tree does not exist

Use `express-feature` after the tree exists to add a resource (router, service, repository). Do not use this skill to implement CRUD for a named domain.

Defer libraries to `rules/stack.mdc`. Read it before writing files.

## Procedure

1. Confirm Node 22+, ESM (`"type": "module"`), TypeScript `strict`.
2. Write the tree in [references/tree.md](references/tree.md). Always include `config/env.ts`, `db/client.ts`, `db/redis.ts`, `db/tables/index.ts`, `http/create-app.ts`, `http/server.ts`, `http/compose.ts`, `http/openapi.ts`, middleware (`request-id`, `validate`, `auth`, `rate-limit`, `error-handler`), `errors/app-error.ts`, `observability/logger.ts`, `observability/tracing.ts`, `drizzle.config.ts`, `docker-compose.yml`, `.env.example`.
3. Leave `src/http/routers/`, `src/services/`, `src/repositories/`, `src/schemas/` empty unless the user named a first resource — then load `express-feature` after this scaffold. Auth is `auth-jwt`; `/docs` is `openapi-docs`; Redis/jobs/limiter is `redis-backplane`.
4. Install deps from the stack table. Do not add Python, FastAPI, Prisma, NestJS, or a second HTTP framework.

## Scripts

`dev` → `tsx watch src/index.ts` · `start` → `tsx src/index.ts` · `test` → `vitest run` · `lint` · `typecheck` · `db:generate` · `db:migrate` · `worker` → `tsx src/workers/<name>.ts`.

## Checklist

- [ ] `DATABASE_URL` and `JWT_SECRET` required in `env.ts`; no raw `process.env` at call sites
- [ ] `createApp()` does not `listen`; `server.ts` is the only listener
- [ ] Error middleware registered last; `/healthz` and `/readyz` unversioned; `/docs` mounted before the error handler
- [ ] `docker-compose.yml` defines `postgres` (16-alpine) and `redis` (7-alpine)
- [ ] `.env.example` lists `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `APP_PORT`, `APP_ENV`
- [ ] No `src/modules/`; no barrel files except `db/tables/index.ts`

## References

- [examples.md](./examples.md) — copy-paste `package.json`, `env.ts`, `create-app.ts`, `client.ts`
- [references/tree.md](./references/tree.md) — file ownership and what not to put where
