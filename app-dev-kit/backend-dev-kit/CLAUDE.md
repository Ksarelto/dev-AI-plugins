# backend-dev-kit rules

## Stack

- **Runtime:** Node.js 22+, TypeScript strict, ESM, `tsx`. Vitest for tests. No Python.
- **HTTP:** Express 5. `createApp()` in `src/http/create-app.ts`; `listen` only in `src/http/server.ts`. Factory-function DI — no NestJS, no IoC container.
- **Not in stack:** FastAPI, Pydantic, SQLAlchemy, Alembic, pytest, Prisma, TypeORM, Fastify, Hono, tsyringe, Awilix.
- **Schemas / env:** Zod. `.strict()` on HTTP inputs. Parse `process.env` only in `src/config/env.ts`.
- **DB:** PostgreSQL, `drizzle-orm`, postgres.js, drizzle-kit. Service owns `db.transaction`; repository never commits.
- **Auth:** `jose` JWT, argon2. Middleware guards — not inline `if` in routers.
- **Logs / traces / jobs / cache / limit:** pino, OpenTelemetry, BullMQ + Redis, official `redis` client, `express-rate-limit`.
- **Tests / lint:** Vitest + supertest(`createApp()`) + Testcontainers Postgres; typescript-eslint + `tsc --noEmit`.

---

## REST API

- Plural kebab-case nouns: `/users`, `/invoice-items`. Nest for ownership: `/users/{id}/orders`. No verbs in URLs.
- Version in the path: `/api/v1/`. Bump major only for breaking changes.
- Methods: GET 200 · POST create 201 · PUT/PATCH 200 · DELETE 204 empty body.
- Error envelope: `{ "error": { "code", "message", "details?": [{ "field", "message" }] } }`. Never stack traces.
- Status: 400 malformed · 401 auth · 403 forbidden · 404 missing · 409 conflict · 422 Zod · 429 + `Retry-After` · 500 generic.
- Pagination: keyset/cursor for large tables; offset for small admin lists. Max `pageSize` 100 server-side.
- `Authorization: Bearer <token>` — not cookies as the default.

---

## Auth

- Verify Bearer tokens in middleware (`requireAuth`), never in the router body.
- Compose `requireRole` / `requirePermission` on top of `requireAuth`. No ad-hoc `if (req.user.role === …)` in handlers.
- Access tokens: ~15 min, `jose` (`HS256`/`RS256`). Refresh tokens: stored server-side, rotated on use.
- Secrets only from `src/config/env.ts`. Hash passwords with `argon2`. Never MD5/SHA-256.
- Never log tokens, password hashes, or `Authorization` headers.

---

## Drizzle

- One postgres.js pool and one `drizzle()` instance in `src/db/client.ts`. No second client.
- Tables live in `src/db/tables/{resource}.ts` and re-exported from `src/db/tables/index.ts`.
- Repository methods take `db: Database | Tx`. They never call `db.transaction`. The **service** owns `db.transaction`.
- Typed query builder only. No string-concatenated SQL.
- Migrations: `drizzle-kit generate` / `migrate`. Commit SQL under `drizzle/`. Never edit an applied production migration.

---

## Express patterns

**Router → Service → Repository** — never skip layers.

- **Router** (`src/http/routers/{resource}.ts`): HTTP only. Validated body/query/params, call service, set status, return JSON.
- **Service** (`src/services/{resource}.ts`): Domain rules, orchestration, `db.transaction`. No HTTP status objects.
- **Repository** (`src/repositories/{resource}.ts`): Drizzle queries on `db | tx`. Never `db.transaction`.

Register routers only in `src/http/compose.ts` under `/api/v1/{resources}`.

---

## Observability

- `/healthz` — process up, no dependency checks. `/readyz` — Postgres/Redis with a short timeout; 503 on failure.
- **pino** for logs. JSON in production. Bind `requestId`. No `console.log`.
- **OpenTelemetry** for traces (HTTP + postgres.js), OTLP export.
- Cache-aside with official `redis` client: TTL on every key, namespaced/versioned keys, DEL on write in the service.
- Rate limit at the gateway when possible. 429 + `Retry-After`. Always limit `POST /api/v1/auth/token`.

---

## TypeScript

- `strict: true`. No `any` at HTTP, DB, or env boundaries. No `as` to silence the checker without a reason.
- ESM: `"type": "module"`. Relative imports use the `.js` specifier.
- Catch specific errors; never empty `catch`. Re-throw with `cause` preserved.
- No `fs.readFileSync` or other blocking I/O on the request path.
- No `console.log` in application code — use the pino logger.

---

## Zod

- Zod is the only schema library. No Pydantic, class-validator, Joi, or Yup.
- **Create / Update / Read are separate.** Never reuse one object for request and response.
- Input schemas use `.strict()` — unknown keys fail.
- HTTP input is parsed in `validate` middleware, not in the service.
- `process.env` is parsed once in `src/config/env.ts`.
