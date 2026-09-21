# Node Backend Dev Kit

Plugin for building **TypeScript / Node.js** REST APIs. The HTTP layer is **Express 5**, schemas are **Zod**, persistence is **Drizzle ORM** + postgres.js against PostgreSQL, tests are **Vitest + supertest + Testcontainers**.

Upstream docs: [docs/backend/](../../docs/backend/README.md).

**Factory entry**: `/backend-dev` — one resource increment from an approved spec-dev-kit spec
(and optional html-generator-kit prototype). Hub-and-spoke, blackboard `.spec/backend/<slug>.md`,
path-only `kit-result.json`. Never opens a PR.

## Install

```bash
# Full marketplace
ln -s /path/to/dev-cusor-plugins ~/.cursor/plugins/local/dev-cursor-plugins

# This plugin only
ln -s /path/to/dev-cusor-plugins/app-dev-kit/backend-dev-kit ~/.cursor/plugins/local/backend-dev-kit
```

Reload Cursor (Command Palette → "Developer: Reload Window").

From this repo: `npm run install:cursor-local` after the kit is listed in the marketplace manifests.

## Components

### Rules

Auto-apply when editing matching files. Constraints only — procedures live in skills.

| Rule | Globs | Topic |
|------|-------|-------|
| `stack` | `**/*.{ts,mts,mdc,md,json}` (always) | **Canonical** stack — Express 5, Drizzle, Zod, Vitest |
| `express-patterns` | `**/*.{ts,mts}` | Router → Service → Repository, `createApp` vs `listen` |
| `typescript` | `**/*.{ts,mts}` | Strict types, ESM, no empty catch, no sync I/O on requests |
| `zod` | `**/*.{ts,mts}` | Create/Update/Read split, `.strict()`, env parsing |
| `drizzle` | `**/*.{ts,mts}` | One pool, service-owned transactions, drizzle-kit |
| `api-design` | `**/*.{ts,mts}` | REST URLs, status codes, pagination, OpenAPI |
| `auth` | `**/*.{ts,mts}` | `jose` JWT, middleware guards |
| `observability` | `**/*.{ts,mts}` | Health, pino, OTel, BullMQ, cache, rate limit |

[`rules/stack.mdc`](rules/stack.mdc) is canonical. In Cursor it auto-attaches (`alwaysApply: true`). Claude Code does not load `.mdc` rules; agents read `stack.mdc` as step 0.

### Skills

| Skill | Use when |
|-------|----------|
| `backend-dev` | One spec-scoped resource increment (import, gates, human review, `kit-result.json`) |
| `scaffold-service` | Creating the Node/TS folder tree, `createApp` factory, Drizzle client, `package.json` |
| `express-feature` | Adding a resource (table, Zod, repo, service, router, tests) without a spec |
| `database-patterns` | Keyset pagination, upsert, soft delete, optimistic lock |
| `error-handling` | `AppError`, Zod 422, RFC 7807-shaped JSON, request-id |
| `http-testing` | Vitest + supertest(`createApp()`) + Testcontainers Postgres |
| `auth-jwt` | Register, login, refresh rotation, `requireAuth` / `requireRole` (`jose` + argon2) |
| `openapi-docs` | OpenAPI from Zod, `/openapi.json`, Swagger UI `/docs` |
| `redis-backplane` | Cache-aside, BullMQ workers, rate-limit Redis store, Compose Redis |

### Agents

| Agent | Model | Use when |
|-------|-------|----------|
| `backend-orchestrator` | opus | Hub for `/backend-dev` — blackboard only, returns packets |
| `backend-interpreter` | haiku | Scoped YAML → blackboard |
| `backend-analyst` | sonnet | AC / contract quality at Station 0 |
| `quality-gate-runner` | haiku | Mechanical typecheck / lint / vitest |
| `api-implementer` | sonnet | Writing a feature slice against the three-layer architecture |
| `code-reviewer` | sonnet | Reviewing a PR/diff for layer and security violations |
| `test-writer` | sonnet | Writing Vitest/supertest coverage for routers and services |

### MCP servers

| Server | Purpose |
|--------|---------|
| `context7` | Current docs for Express, Drizzle, Zod |
| `gitlab` | Issue descriptions, MR diffs, pipelines |
| `atlassian` | Jira / Confluence requirements |

Set `CONTEXT7_API_KEY`. GitLab: `GITLAB_PERSONAL_ACCESS_TOKEN`, `GITLAB_API_URL`. Atlassian: `JIRA_*` and `CONFLUENCE_*` as in `.mcp.json`.

## Env (generated projects)

```
APP_ENV=dev
APP_PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/app
REDIS_URL=redis://localhost:6379
JWT_SECRET=
```

Never read `process.env` at call sites — parse once in `src/config/env.ts`.

## Stack assumptions

**[`rules/stack.mdc`](rules/stack.mdc) is canonical.**

Summary: Node 22+ · TypeScript strict ESM · Express 5 · Zod · Drizzle + postgres.js · drizzle-kit · `jose` + argon2 · pino + OpenTelemetry · BullMQ · Vitest + supertest + Testcontainers.

Reference app: [`examples/library-api`](../../examples/library-api) (campus library — auth, books, loans, cache, BullMQ, OpenAPI).

## Few-shot examples

- Skills → `skills/{skill-name}/examples.md`
- References → `skills/{skill-name}/references/`
