# backend-boilerplate

A production-shaped starter for **Node.js 22 + Express 5 + TypeScript** APIs, with a layered architecture (Router → Controller → Service → Repository), PostgreSQL via Drizzle, local JWT auth with RBAC, structured logging, RFC 9457 errors, graceful degradation, Docker, and Vitest + Testcontainers.

The `node-backend-dev-kit` plugin in this marketplace describes these conventions as rules and skills. Its `scaffold-service` skill copies this folder to start a new service.

## Quick start

```bash
nvm use                   # Node 22 (see .nvmrc)
cp .env.example .env
npm install
npm run db:up             # Postgres 17 in Docker
npm run db:migrate
npm run db:seed           # optional: admin user from SEED_ADMIN_*
npm run dev               # http://localhost:3000, docs at /api-docs
```

Full stack in containers (Postgres → one-shot migrations → API):

```bash
npm run docker:up         # docker compose --profile app up --build -d
curl localhost:3000/health/ready
npm run docker:down
```

## Scripts

| Script                      | What it does                                                  |
| --------------------------- | ------------------------------------------------------------- |
| `dev`                       | Starts the Postgres container, then the API with `tsx watch`  |
| `build` / `start`           | Compile to `dist/` / run the compiled server                  |
| `typecheck`                 | `tsc --noEmit` (strict)                                       |
| `lint`                      | ESLint (`strictTypeChecked`) + dependency-cruiser layer rules |
| `format` / `format:check`   | Prettier                                                      |
| `test`                      | Unit + integration projects                                   |
| `test:unit`                 | Fast tests, no Docker                                         |
| `test:integration`          | Real Postgres via Testcontainers (or `TEST_DATABASE_URL`)     |
| `test:coverage`             | Both projects with V8 coverage                                |
| `db:generate`               | Generate a SQL migration from `src/db/schema` changes         |
| `db:migrate` / `db:seed`    | Apply migrations / ensure the admin user                      |
| `docker:up` / `docker:down` | Full stack via Compose                                        |

## Structure

```
src/
  index.ts          bootstrap: env → logger → db → container → server → graceful shutdown
  app.ts            createApp(): middleware order, routers, docs, 404, error handler
  server.ts         the only place that listens
  container.ts      composition root (plain factories, no DI library)
  config/env.ts     Zod-validated environment, fail fast
  routes/           path → middleware → controller wiring
  controllers/      HTTP ↔ service mapping
  services/         business rules, transactions, domain errors
  repositories/     Drizzle queries only
  db/               client, schema, migrations runner, seed, transaction runner
  schemas/          Zod request/response schemas + DTO mappers (also feed OpenAPI)
  middleware/       request logger, validate, authenticate, authorize, timeout, rate limit, errors
  lib/              logger, errors, jwt, password, health, resilience, http client, shutdown, cursor
  openapi/          OpenAPI 3.1 document generated from the Zod schemas
drizzle/            committed SQL migrations
tests/unit          services with in-memory repositories, middleware, lib
tests/integration   the real app against real Postgres
```

Layer rules are enforced by `.dependency-cruiser.cjs` (part of `npm run lint`). See [ARCHITECTURE.md](ARCHITECTURE.md).

## API

| Method | Path                                  | Auth             | Notes                                                                         |
| ------ | ------------------------------------- | ---------------- | ----------------------------------------------------------------------------- |
| POST   | `/api/v1/auth/register`               | —                | 201 + user + tokens; 409 `EMAIL_TAKEN`                                        |
| POST   | `/api/v1/auth/login`                  | —                | same error for unknown email and wrong password                               |
| POST   | `/api/v1/auth/refresh`                | —                | rotates the refresh token; reuse → 401 `REFRESH_TOKEN_REUSED`, family revoked |
| POST   | `/api/v1/auth/logout`                 | —                | revokes the session family; idempotent 204                                    |
| GET    | `/api/v1/users/me`                    | bearer           | current user                                                                  |
| GET    | `/api/v1/users?limit=&cursor=`        | bearer + `admin` | keyset pagination                                                             |
| GET    | `/health/live`                        | —                | liveness, no dependency checks                                                |
| GET    | `/health/ready`                       | —                | readiness: `ok` / `degraded` (200) or `down` / `shutting_down` (503)          |
| GET    | `/api-docs`, `/api-docs/openapi.json` | —                | when `API_DOCS_ENABLED=true`                                                  |

Errors are `application/problem+json`: `{ type, title, status, detail, code, instance, errors? }`.

## Auth model

- Access token: HS256 JWT (`jose`), 15 min by default, claims `sub`, `email`, `roles`, `iss`, `aud`, `jti`.
- Refresh token: 256-bit opaque value, stored as SHA-256, rotated on every use. Tokens from one login share a family; presenting a rotated token revokes the family.
- Passwords: argon2id (`@node-rs/argon2`), 12–128 characters. Login runs a dummy verify for unknown emails, so response time does not reveal which emails exist.
- Guards: `authenticate(jwt)` then `requireRole('admin')`. Read the caller in a controller with `requirePrincipal(res)`.

For an external identity provider (Keycloak, Entra ID, Auth0), replace `lib/jwt.ts` verification with `createRemoteJWKSet` and drop the auth routes. The guards stay the same.

## Graceful degradation and shutdown

- **Health:** `/health/ready` runs every check with a timeout. A critical check down (Postgres) → 503; a non-critical one down (`UPSTREAM_HEALTH_URL`) → 200 `degraded`.
- **Outbound calls:** `lib/http-client.ts` = per-attempt timeout + retry with jitter (5xx / 429 / network) + circuit breaker. An open breaker raises a 503 with `Retry-After`.
- **Request timeout:** handlers slower than `REQUEST_TIMEOUT_MS` get a 503 `REQUEST_TIMEOUT`; `res.locals.signal` aborts downstream work.
- **Startup:** the server starts even if Postgres is still booting; readiness stays 503 until it answers.
- **Shutdown** (SIGTERM / SIGINT / fatal error): readiness flips to 503 → optional drain delay → stop accepting, finish in-flight requests → close the pool → exit. `SHUTDOWN_TIMEOUT_MS` forces exit if something hangs.

## Testing

- Unit tests use in-memory repositories (`tests/helpers/in-memory-repositories.ts`) and never need Docker.
- Integration tests start `postgres:17-alpine` with Testcontainers once per run, apply the real migrations, and truncate tables between tests. Set `TEST_DATABASE_URL` to use an existing database instead (CI service container).

### Docker runtimes other than Docker Desktop

Testcontainers finds Docker Desktop automatically. With Rancher Desktop or Colima, point it at the socket:

```bash
export DOCKER_HOST=unix://$HOME/.rd/docker.sock            # Colima: unix://$HOME/.colima/default/docker.sock
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock
```

If something already listens on 5432 or 3000 (a local Postgres, another app), set `DB_PORT` / `API_PORT` for Compose and update `DATABASE_URL` to match.

## Adding a resource

1. Table in `src/db/schema/<resource>.ts`, export it from `schema/index.ts`, run `npm run db:generate`.
2. Repository `src/repositories/<resource>.repository.ts`: Drizzle queries only, accepts `db | tx`.
3. Service `src/services/<resource>.service.ts`: rules, transactions, `AppError` subclasses.
4. Zod request schemas + DTO mappers in `src/schemas/<resource>.schema.ts`.
5. Controller → router → mount in `src/routes/index.ts`; wire factories in `src/container.ts`.
6. Register paths in `src/openapi/document.ts`.
7. Unit tests for the service, integration tests for the routes.

## Production notes

- Set a strong `JWT_SECRET` (≥ 32 chars) from a secret manager; never use the compose default.
- Run migrations as a separate step (the compose `migrate` service shows the pattern).
- Behind a proxy, set `TRUST_PROXY` so rate limiting and logs see client IPs.
- For more than one replica, give `express-rate-limit` a shared store (Redis).
