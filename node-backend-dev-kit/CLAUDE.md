# node-backend-dev-kit rules

Condensed digest of `rules/*.mdc` for Claude Code, which does not load `.mdc` files. The rule files are
canonical; the skills named in each section hold the procedures and code. Reference implementation:
`backend-boilerplate/` in the dev-AI-plugins marketplace repo.

## Stack

- Node 22, TypeScript 5.9 strict ESM, Express 5, Zod 4, Drizzle ORM 0.45 + postgres.js 3 + drizzle-kit, PostgreSQL 17, jose 6 (HS256), `@node-rs/argon2`, pino 10 + pino-http 11, helmet, cors, express-rate-limit 8, `@asteasolutions/zod-to-openapi` + swagger-ui-express, Vitest 5 + supertest + `@testcontainers/postgresql`, ESLint 9 + typescript-eslint, Prettier, dependency-cruiser.
- No second library for an owned concern (no joi/yup, dotenv, winston/morgan, jsonwebtoken/bcrypt, Prisma/TypeORM/Knex, Jest, axios, DI containers).
- Config is read once in `config/env.ts` (`loadEnv()` → `Env`); no `process.env` elsewhere in `src/` (seed excepted).
- `container.ts` is the only composition root; `server.ts` the only listener; `createApp(env, logger, container)` builds without listening.
- Unsure of an API → fetch current docs through the `context7` MCP server. Skill: `scaffold-service`.

## Layers

- `routes → controllers → services → repositories → db`; `schemas/`, `middleware/`, `lib/`, `config/` at the side. No cycles; `npm run lint` runs dependency-cruiser.
- Routes only wire (`authenticate` → `requireRole` → `validate()` → handler). Controllers: `validated(res, …)`, `requirePrincipal(res)`, one service call, DTO + status. Services: business rules, transactions, `AppError`s, no Express. Repositories: Drizzle queries only, `executor: DbExecutor = db`. `lib/` and `config/` import no layer.
- Routers, controllers, services and repositories export `create<Name>(deps)` + `export type <Name> = ReturnType<…>`. Only `container.ts` calls them with concrete deps; only `routes/index.ts` mounts versioned routers.
- Services return domain objects, never rows with secrets. Skills: `express-resource`, `architecture-audit`.

## TypeScript

- NodeNext: relative imports end in `.js`; `import type` for types; `node:` prefix for built-ins.
- No `any`, no silencing `as`, no `!` on `rows[0]`, no `@ts-ignore`; explicit return types on exported functions.
- Every promise awaited, returned or `void`-ed; top-level `await` only in entry scripts; `as const` tuples instead of enums; no `console`.

## Validation

- Every route with input mounts `validate(<request>)` (`{ params?, query?, body? } satisfies ValidationSchemas`); controllers read only `validated(res, <request>)`. Express 5 `req.query` is read-only.
- `.strict()` bodies and queries, `.max()` on every string, `z.coerce.number()` with bounds and defaults for query numbers, Zod 4 formats (`z.uuid()`, `z.email()`, `z.url()`, `z.iso.datetime()`), messages via `{ error }`.
- Failures are 422 `VALIDATION_FAILED` with `errors[].path` like `body.email`. Response DTOs are Zod schemas with `to<Entity>Response()` mappers. Env parsed once, fail fast. Skill: `request-validation`.

## Errors

- Expected failures are `AppError` subclasses (400/401/403/404/409/422/429/503) with a specific, stable `UPPER_SNAKE_CASE` code; clients branch on `code`.
- `errorHandler()` (last) is the only error → response mapping: RFC 9457 problem+json. No `try/catch` or `res.status(4xx/5xx)` in controllers; Express 5 forwards async rejections — no `asyncHandler`.
- 5xx bodies are opaque (`INTERNAL_ERROR`); the error is logged with `req.log.error({ err })`. `isUniqueViolation` → `ConflictError`; keep `{ cause }`; invisible rows are 404. Skill: `error-handling`.

## Database

- One pool from `createDatabase()`; tables in `src/db/schema/` (uuid PK, `withTimezone` timestamps, FKs with `onDelete`, indexes for FKs and list order).
- `npm run db:generate -- --name <change>` → read → commit SQL + `drizzle/meta`. Never `drizzle-kit push` on shared databases, never edit an applied migration, never migrate on API boot.
- Services own transactions via `TransactionRunner` and pass `tx` to every repository call; repositories never open them.
- No string-built SQL; race safety via constraints and conditional `update … returning`; keyset pagination (`limit + 1`, opaque cursor), bounded limits. Skill: `drizzle-database`.

## Auth and security

- Protected routers mount `authenticate`; role routes add `requireRole('admin')`; controllers use `requirePrincipal(res)` only.
- Ownership is checked in the service from the principal; strangers get 404; owner ids never come from the body.
- jose `jwtVerify` with pinned `algorithms`, `issuer`, `audience`; claims re-parsed with Zod. Refresh tokens opaque, stored as SHA-256, rotated, family-revoked on reuse. Passwords argon2id, 12–128 chars, dummy verify for unknown emails.
- `x-powered-by` off, `trust proxy` from env, `helmet()`, CORS allowlist (no `*` with credentials), `express.json({ limit: '100kb' })`, global `/api` and stricter `/auth` rate limits via `next(new TooManyRequestsError())`. Secrets only from `Env`. Skills: `auth-rbac`, `security-middleware`.

## API design

- `/api/v1/<plural-kebab>`; health at `/health/live` and `/health/ready` outside `/api`.
- GET 200, POST 201 + DTO, PATCH 200 + DTO, DELETE 204. camelCase JSON, ISO timestamps, UUID ids; never rows, hashes or internal flags.
- Lists: `{ items, nextCursor }`, `limit` default 20 max 100. PATCH: all optional, at least one required, no server-owned fields.
- Every route has an OpenAPI `registerPath` built from the same Zod schemas. Skills: `express-resource`, `openapi-docs`.

## Observability

- One root logger (`createLogger`); `req.log` inside requests, injected `logger.child({ component })` elsewhere.
- `log.info({ id }, 'static message')`; errors as `{ err: error }`; error for 5xx, warn for 4xx/degraded, info for lifecycle.
- Never log bodies, tokens, passwords, hashes, cookies or headers; new sensitive keys go into `REDACT_PATHS` (`*.x` matches one level only). Safe `X-Request-Id` only. Skill: `logging-observability`.

## Resilience

- Every outbound call has a timeout: `createResilientHttpClient` (timeout + jittered retry + circuit breaker) or `withTimeout`. Retry only idempotent work and retryable failures.
- `/health/live` checks nothing; `/health/ready` uses `createHealthRegistry` — critical down → 503, optional down → 200 `degraded`.
- `requestTimeout` → 503 `REQUEST_TIMEOUT` and `res.locals.signal`. `registerGracefulShutdown` closes the server, then `resources` (pools last), forced exit after `SHUTDOWN_TIMEOUT_MS`.
- Containers: `tini`, `HEALTHCHECK` on `/health/live`, grace period > drain delay + shutdown timeout. Skills: `resilience`, `docker-deploy`.

## Tests

- Every changed service, route, middleware or lib function ships tests in the same change.
- Unit (`tests/unit`, no Docker): services with contract-honouring in-memory repositories, no Drizzle mocks. Integration (`tests/integration`): `createTestApp()` + supertest on Testcontainers Postgres, `beforeEach(testApp.reset)`, `afterAll(testApp.close)`, nothing in `src/` mocked.
- Assert status, `code`, DTO shape and absent secrets; inject time and `fetchImpl`; never report a test as passing without running it. Skill: `api-testing`.
