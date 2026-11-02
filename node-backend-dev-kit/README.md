# Node Backend Dev Kit

Stack knowledge for layered **Node.js 22 + Express 5 + TypeScript** APIs: rules (constraints) and skills
(procedures) for Zod 4 validation, PostgreSQL through Drizzle ORM, JWT + RBAC, RFC 9457 errors, pino
logging, graceful degradation, OpenAPI, Docker, and Vitest + Testcontainers. Rules, skills and MCP only —
no agents, commands or hooks.

The reference implementation is [`backend-boilerplate/`](../backend-boilerplate/) in this marketplace repo:
a runnable starter (typecheck, ESLint strictTypeChecked, dependency-cruiser layer rules, unit +
integration tests, Docker smoke test). Every code example in this kit matches its APIs, names and paths,
and `scaffold-service` copies it to start a new service. `node-agent-dev-kit` builds on this kit for
agent services.

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
| `stack` | `**/src/app.ts`, `**/src/server.ts`, `**/src/container.ts`, `**/src/config/env.ts` | Which library owns which concern (Node 22, TS 5.9 ESM, Express 5, Zod 4, Drizzle 0.45 + postgres.js, jose, argon2, pino, zod-to-openapi, Vitest + Testcontainers); config only via `config/env.ts`; one composition root |
| `layered-architecture` | `**/src/routes/**/*.ts`, `**/src/controllers/**/*.ts`, `**/src/services/**/*.ts`, `**/src/repositories/**/*.ts`, `**/src/container.ts`, `**/.dependency-cruiser.cjs` | routes → controllers → services → repositories → db; what each layer owns and must not; `create*` factories; wiring only in `container.ts`; dependency-cruiser |
| `typescript-node` | `**/src/routes/**/*.ts`, `**/src/controllers/**/*.ts`, `**/src/services/**/*.ts`, `**/src/repositories/**/*.ts`, `**/src/middleware/**/*.ts`, `**/src/db/**/*.ts`, `**/src/schemas/**/*.ts`, `**/src/app.ts`, `**/src/server.ts`, `**/src/container.ts` | NodeNext ESM with `.js` specifiers, `import type`, strict flags, no `any`/casts/`!`, explicit return types, no floating promises, `as const` tuples over enums |
| `validation` | `**/src/schemas/**/*.ts`, `**/src/middleware/validate.ts`, `**/src/routes/**/*.ts`, `**/src/controllers/**/*.ts`, `**/src/config/env.ts` | `validate()` + `validated(res, …)` on every input; Express 5 read-only `req.query`; `.strict()`, bounded strings, coerced queries, Zod 4 formats; 422 problem details; env fail-fast |
| `error-handling` | `**/src/lib/errors.ts`, `**/src/middleware/error-handler.ts`, `**/src/services/**/*.ts`, `**/src/controllers/**/*.ts`, `**/src/db/errors.ts` | `AppError` subclasses with stable codes; one `errorHandler`; no status mapping in controllers; Express 5 async errors; opaque 500; unique violation → 409; 404 over 403 |
| `database` | `**/src/db/**/*.ts`, `**/src/repositories/**/*.ts`, `**/drizzle.config.ts`, `**/drizzle/**/*.sql` | One pool; schema conventions; drizzle-kit migrations committed, never `push`; repositories take `DbExecutor`; services own transactions; race-safe writes; keyset pagination |
| `auth-security` | `**/src/middleware/**/*.ts`, `**/src/lib/jwt.ts`, `**/src/lib/password.ts`, `**/src/lib/tokens.ts`, `**/src/services/auth*.ts`, `**/src/routes/**/*.ts`, `**/src/app.ts` | `authenticate` → `requireRole` → `requirePrincipal`; ownership in services; jose HS256 with pinned options; hashed rotating refresh tokens; argon2id; helmet, CORS allowlist, body limit, rate limits |
| `api-design` | `**/src/routes/**/*.ts`, `**/src/controllers/**/*.ts`, `**/src/schemas/**/*.ts`, `**/src/openapi/**/*.ts` | `/api/v1/<plural>`; status per method; DTOs not rows; `{ items, nextCursor }`; PATCH semantics; problem+json; an OpenAPI entry per route |
| `observability` | `**/src/lib/logger.ts`, `**/src/middleware/request-logger.ts`, `**/src/middleware/error-handler.ts`, `**/src/lib/shutdown.ts`, `**/src/db/migrate.ts`, `**/src/db/seed.ts` | One pino root logger; `req.log`; object-first logs with `err`; levels by outcome; redaction; safe `X-Request-Id`; no `console` |
| `resilience` | `**/src/lib/resilience.ts`, `**/src/lib/http-client.ts`, `**/src/lib/health.ts`, `**/src/lib/shutdown.ts`, `**/src/lib/lifecycle.ts`, `**/src/middleware/timeout.ts`, `**/src/controllers/health.controller.ts`, `**/Dockerfile`, `**/docker-compose.yml` | Timeouts on every outbound call; retries only for idempotent work; circuit breaker; liveness vs readiness, critical vs optional; request deadline; graceful shutdown; tini + probes in containers |
| `testing` | `**/tests/unit/**/*.ts`, `**/tests/integration/**/*.ts`, `**/tests/helpers/**/*.ts`, `**/tests/setup/**/*.ts` | Unit (in-memory repositories, no Docker) vs integration (`createTestApp` + supertest + Testcontainers); reset per test; assert status, `code`, absent secrets; inject time and fetch |

A controller edit attaches `layered-architecture`, `typescript-node`, `validation`, `error-handling` and
`api-design`; a repository edit attaches `layered-architecture`, `typescript-node` and `database`; a test
edit attaches only `testing`.

### Skills

Each skill is a `SKILL.md` routing page; full code lives in its `examples.md` and `references/`.

| Skill | Use when |
|-------|----------|
| `scaffold-service` | Starting a new service: copy `backend-boilerplate/`, rename, `.env`, install, migrate, verify |
| `express-resource` | Adding a resource end to end: table → migration → repository → service → schemas → controller → router → mount → container → OpenAPI → tests (worked `projects` example) |
| `request-validation` | Validating params, query and body with Zod 4 via `validate()` / `validated()`; env variables |
| `error-handling` | Adding domain errors, mapping driver errors, fixing problem+json responses |
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
