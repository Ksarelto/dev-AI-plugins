# Node Backend Dev Kit

Stack knowledge for **Node.js 22 + Express 5 + TypeScript** APIs (domains, queries, HTTP): rules
(constraints) and skills (procedures) for Zod 4 validation, PostgreSQL through Drizzle ORM, JWT + RBAC, a JSON error envelope, pino
logging, graceful degradation, OpenAPI, Docker, and Vitest + Testcontainers. Rules, skills and MCP only —
no agents, commands or hooks.

The file tree is [skills/scaffold-service/references/tree.md](skills/scaffold-service/references/tree.md).
`scaffold-service` creates a new service from it. `node-agent-dev-kit` builds on this kit for agent services.

## Install

### Claude Code

```text
/plugin install node-backend-dev-kit@dev-AI-plugins
```

Local development from this marketplace repo:

```bash
claude --plugin-dir ./node-backend-dev-kit
```

### Cursor

From this marketplace repo:

```bash
npm run install:cursor-local
```

Then **Developer: Reload Window** and enable the kit under **Customize → Plugins**.

## Components

### Rules

All rules are `alwaysApply: false` and attach in Cursor only when a matching backend file is in context.
Globs name backend layer folders and files, so frontend edits in the same repo do not pull them in.
Claude Code does not load `.mdc` files: [CLAUDE.md](CLAUDE.md) is a condensed digest of all eleven, and
the `code-review` skill reads the matching rule files itself.

| Rule | Globs | Topic |
|------|-------|-------|
| `stack` | `**/src/app.ts`, `**/src/server.ts`, `**/src/main.ts`, `**/src/composition/**/*.ts`, `**/src/config/env.ts` | Which library owns which concern; config only via `config/env.ts`; `composition/` is the only composition root |
| `layered-architecture` | `**/src/api/**/*.ts`, `**/src/domains/**/*.ts`, `**/src/queries/**/*.ts`, `**/src/composition/**/*.ts`, `**/.dependency-cruiser.cjs` | `api/http` → `composition` → `domains`; lists in `queries`; tables in `infra/db`; dependency-cruiser |
| `typescript-node` | `**/src/**/*.ts` | NodeNext ESM with `.js` specifiers, `import type`, strict flags, no `any`, explicit return types, no floating promises |
| `validation` | `**/src/api/http/**/dto/**/*.ts`, `**/src/api/http/middlewares/validate.ts`, `**/src/api/http/**/*.routes.ts`, `**/src/api/http/**/*.controller.ts`, `**/src/config/env.ts` | `validate()` + `validated(res, …)` on every input; Express 5 read-only `req.query`; `.strict()`, bounded strings, coerced queries, Zod 4 formats; 422 `error.details`; env fail-fast |
| `error-handling` | `**/src/core/errors/**/*.ts`, `**/src/api/http/error-mapper.ts`, `**/src/domains/**/*.ts`, `**/src/api/http/**/*.controller.ts` | `AppError` with a stable code and no HTTP status; one error mapper writes `{ error }`; no status mapping in controllers; Express 5 async errors; opaque 500; unique violation → domain error; 404 over 403 |
| `database` | `**/src/infra/db/**/*.ts`, `**/src/domains/**/*.repository.ts`, `**/src/queries/**/*.ts`, `**/drizzle.config.ts`, `**/drizzle/**/*.sql` | One pool; schema conventions; drizzle-kit migrations committed, never `push`; repository reads the unit of work; the scenario opens the transaction; race-safe writes; keyset pagination |
| `auth-security` | `**/src/api/http/middlewares/**/*.ts`, `**/src/infra/security/**/*.ts`, `**/src/domains/sessions/**/*.ts`, `**/src/domains/users/**/*.ts`, `**/src/api/http/v1/**/*.routes.ts`, `**/src/app.ts` | `authenticate` → `requireRole` → `requirePrincipal`; ownership in the domain; jose HS256 with pinned options; hashed rotating refresh tokens; argon2id; helmet, CORS allowlist, body limit, rate limits |
| `api-design` | `**/src/api/http/**/*.ts` | `/api/v1/<plural>`; status per method; DTOs not rows; `{ data, meta }`; `{ error }` JSON; an OpenAPI entry per route |
| `observability` | `**/src/core/logger.ts`, `**/src/api/http/middlewares/request-logger.ts`, `**/src/api/http/error-mapper.ts`, `**/src/core/shutdown.ts`, `**/src/infra/db/migrate.ts`, `**/src/infra/db/seed.ts` | One pino root logger; `req.log`; object-first logs with `err`; levels by outcome; redaction; safe `X-Request-Id`; no `console` |
| `resilience` | `**/src/core/resilience.ts`, `**/src/infra/http/client.ts`, `**/src/core/health.ts`, `**/src/core/shutdown.ts`, `**/src/core/lifecycle.ts`, `**/src/api/http/middlewares/timeout.ts`, `**/src/api/http/v1/health/**/*.ts`, `**/Dockerfile`, `**/docker-compose.yml` | Timeouts on every outbound call; retries only for idempotent work; circuit breaker; liveness vs readiness, critical vs optional; request deadline; graceful shutdown; tini + probes in containers |
| `testing` | `**/tests/unit/**/*.ts`, `**/tests/integration/**/*.ts`, `**/tests/helpers/**/*.ts`, `**/tests/setup/**/*.ts` | Unit (in-memory repositories, no Docker) vs integration (`createTestApp` + supertest + Testcontainers); reset per test; assert status, `code`, absent secrets; inject time and fetch |

A controller edit attaches `layered-architecture`, `typescript-node`, `validation`, `error-handling` and
`api-design`; a repository edit attaches `layered-architecture`, `typescript-node` and `database`; a test
edit attaches only `testing`.

### Skills

Each skill is a `SKILL.md` routing page; full code lives in its `examples.md` and `references/`.

| Skill | Use when |
|-------|----------|
| `scaffold-service` | Starting a new service from `skills/scaffold-service/references/tree.md`: rename, `.env`, install, migrate, verify |
| `express-resource` | Adding a resource end to end: schema → domain → validation → controller → route → composition → OpenAPI → tests |
| `request-validation` | Validating params, query and body with Zod 4 via `validate()` / `validated()`; env variables |
| `error-handling` | Adding domain errors, mapping driver errors, writing the `{ error }` envelope |
| `drizzle-database` | Tables, indexes, migrations, repositories with `DbExecutor`, transactions, keyset pagination |
| `auth-rbac` | Protecting routes, roles, ownership, token and password handling, external IdP via JWKS |
| `security-middleware` | Middleware order, helmet, CORS, body limits, rate limiting, trust proxy, server timeouts |
| `resilience` | Outbound clients with timeout/retry/breaker, health checks, degraded mode, graceful shutdown |
| `logging-observability` | pino / pino-http logging, request ids, levels, redaction |
| `api-testing` | Unit tests with in-memory repositories, supertest integration tests on Testcontainers Postgres |
| `openapi-docs` | Documenting routes with `@asteasolutions/zod-to-openapi` and `.meta({ id })`, Swagger UI |
| `docker-deploy` | Dockerfile, compose with a one-shot migrate service, CI workflow, production settings |
| `architecture-audit` | Auditing a service against the layer model with dependency-cruiser and greps; fixing after confirmation |
| `code-review` | Reviewing a diff against the rules with severity-tagged findings |

### MCP Servers

| Server | Purpose |
|--------|---------|
| `context7` | Current docs for Express, Zod, Drizzle, pino, jose, Vitest, Testcontainers |
| `gitlab` | Read issue descriptions, MR diffs, and pipeline status |
| `atlassian` | Read Jira tickets and Confluence pages for requirements |

**Context7 setup:** set `CONTEXT7_API_KEY` in your environment.

**GitLab setup:** set `GITLAB_PERSONAL_ACCESS_TOKEN` and `GITLAB_API_URL` in your environment.

**Atlassian setup:** set `JIRA_URL`, `JIRA_USERNAME`, `JIRA_API_TOKEN`, `CONFLUENCE_URL`, `CONFLUENCE_USERNAME`, and `CONFLUENCE_API_TOKEN` in your environment. Requires `uvx`.

## Stack assumptions

Node 22 · TypeScript 5.9 strict ESM (NodeNext, `.js` specifiers) · Express 5 · Zod 4 · Drizzle ORM 0.45 +
postgres.js 3 + drizzle-kit · PostgreSQL 17 · pino 10 + pino-http 11 · jose 6 (HS256) · `@node-rs/argon2` ·
helmet · cors · express-rate-limit 8 · `@asteasolutions/zod-to-openapi` + swagger-ui-express · Vitest 5 +
supertest + `@testcontainers/postgresql` · ESLint 9 + typescript-eslint · Prettier · dependency-cruiser.
The canonical list is `rules/stack.mdc`.
