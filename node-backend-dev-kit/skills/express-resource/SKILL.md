---
name: express-resource
description: Add a new REST resource or CRUD endpoint to an Express 5 API as a full layered slice — Drizzle table and migration, repository, service, Zod schemas and DTO mappers, controller, router, container wiring, OpenAPI path. Use when creating a new entity, routes or endpoints end to end.
---

# Express resource (full layered slice)

## When to use

- A new entity or a new set of endpoints (`/api/v1/<resource>`), or a new operation on an existing resource that touches more than one layer
- Not for a new service from scratch — that is `scaffold-service`; not for a validation-only or docs-only change — `request-validation`, `openapi-docs`

Hard constraints: `rules/layered-architecture.mdc`, `rules/api-design.mdc`, `rules/validation.mdc`, `rules/error-handling.mdc`, `rules/database.mdc`, `rules/auth-security.mdc`, `rules/testing.mdc`. The complete worked example — a `projects` resource owned by a user, verified against `backend-boilerplate` (typecheck, ESLint, dependency-cruiser, unit and integration tests) — is in [examples.md](examples.md); its tests are in [references/tests.md](references/tests.md).

## Procedure

Build in this order. Each step compiles before the next one starts; `npm run typecheck` after steps 3, 6 and 9.

| # | Step | File | Notes |
|---|------|------|-------|
| 1 | Table | `src/db/schema/<resource>.ts`, export from `schema/index.ts` | uuid id, `withTimezone` timestamps, FK with `onDelete`, unique + keyset index |
| 2 | Migration | `npm run db:generate -- --name <resource>` → `drizzle/NNNN_<resource>.sql` | Read the SQL, then `npm run db:migrate`. Commit `drizzle/meta/*` too |
| 3 | Repository | `src/repositories/<resource>.repository.ts` | `create<Resource>Repository(db)`; every method ends with `executor: DbExecutor = db` |
| 4 | Service | `src/services/<resource>.service.ts` | Domain type + `to<Entity>(row)`, ownership, `AppError` codes, `isUniqueViolation` → 409, transactions |
| 5 | Schemas + DTO | `src/schemas/<entity>.schema.ts` | `.strict()` bodies, `{ … } satisfies ValidationSchemas`, response schema with `.meta({ id })`, `to<Entity>Response()` |
| 6 | Controller | `src/controllers/<resource>.controller.ts` | `validated(res, …)`, `requirePrincipal(res)`, one service call, DTO + status |
| 7 | Router | `src/routes/<resource>.routes.ts` | `authenticate` → `validate()` → (`requireRole`) → handler |
| 8 | Mount | `src/routes/index.ts` | Add the controller type to `ApiRouterDeps` and `router.use('/<resource>', …)` |
| 9 | Wire | `src/container.ts` | Repository → service → controller under `controllers.<resource>` |
| 10 | Docs | `src/openapi/document.ts` | One `registerPath` per route, same Zod schemas, problem responses, `security` |
| 11 | Tests | `tests/unit/services/<resource>.service.test.ts`, `tests/integration/<resource>.test.ts` | In-memory repository for unit; `createTestApp()` + supertest; add the table to `reset()` |

## Decisions

| Question | Answer |
|---|---|
| Who may read a row? | Decide in the service. Not visible → `NotFoundError('<Entity> not found.', '<ENTITY>_NOT_FOUND')`, never 403 for someone else's row |
| Admin-only route? | `requireRole('admin')` in the router; the service still receives the `Principal` |
| Several writes that must succeed together? | Inject `transaction: TransactionRunner`, pass `tx` to every repository call (`drizzle-database` skill) |
| Name or slug must be unique? | Unique index in the table + `isUniqueViolation(error)` → `ConflictError` with a specific code. No read-then-insert check |
| List endpoint? | Keyset: `{ limit, cursor }` query, repository fetches `limit + 1`, service builds `nextCursor` with `encodeCursor` |
| Partial update? | `PATCH` body with every field optional + `.refine(…, { error: 'Provide at least one field.' })` |
| Delete? | `204` with `res.status(204).end()`; a missing or invisible row is 404 |
| Calls another HTTP service? | Inject a `createResilientHttpClient` from the container (`resilience` skill) |

## Naming

`projects` resource → `db/schema/projects.ts` (`projects`, `ProjectRow`, `NewProjectRow`), `projects.repository.ts` (`createProjectsRepository`, `ProjectsRepository`), `projects.service.ts` (`Project`, `toProject`, `createProjectsService`, `ProjectsService`), `project.schema.ts` (`createProjectRequest`, `projectResponseSchema`, `toProjectResponse`), `projects.controller.ts`, `projects.routes.ts` (`createProjectsRouter`).

## Checklist

- [ ] Table exported from `schema/index.ts`; migration generated, read, applied and committed with `drizzle/meta`
- [ ] Repository has queries only, every method takes `executor: DbExecutor = db`, lists fetch `limit + 1`
- [ ] Service imports no Express; returns domain objects, not rows; ownership enforced; unique violation mapped to a coded 409
- [ ] Every route mounts `validate()` with a `satisfies ValidationSchemas` object; bodies are `.strict()`
- [ ] Controller reads only `validated(res, …)` and `requirePrincipal(res)`; no `try/catch`, no `res.status(4xx)`
- [ ] Router mounted in `routes/index.ts`; factories wired in `container.ts` only
- [ ] `POST` → 201 + DTO, `DELETE` → 204, list → `{ items, nextCursor }`
- [ ] Every route has an OpenAPI `registerPath` with success and problem responses
- [ ] Service unit tests (in-memory repository) and integration tests (401, 404 for strangers, 409, 422, happy path); the table is in `reset()`
- [ ] `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:integration` pass
