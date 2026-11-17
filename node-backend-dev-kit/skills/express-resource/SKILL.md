---
name: express-resource
description: Add a new REST resource or CRUD endpoint to an Express 5 API as a full slice — Drizzle table and migration, domain scenario, Zod DTO, presenter, controller, router, composition wiring, OpenAPI path. Use when creating a new entity, routes or endpoints end to end.
---

# Express resource (full layered slice)

## When to use

- A new entity or a new set of endpoints (`/api/v1/<resource>`), or a new operation on an existing resource that touches more than one layer
- Not for a new service from scratch — that is `scaffold-service`; not for a validation-only or docs-only change — `request-validation`, `openapi-docs`

Hard constraints: `rules/layered-architecture.mdc`, `rules/api-design.mdc`, `rules/validation.mdc`, `rules/error-handling.mdc`, `rules/database.mdc`, `rules/auth-security.mdc`, `rules/testing.mdc`. The complete worked example — a `projects` resource owned by a user, the worked example in this file (typecheck, ESLint, dependency-cruiser, unit and integration tests) — is in [examples.md](examples.md); its tests are in [references/tests.md](references/tests.md).

## Procedure

Build in this order. Each step compiles before the next one starts; `npm run typecheck` after steps 3, 6 and 9.

| # | Step | File | Notes |
|---|------|------|-------|
| 1 | Table | `src/infra/db/schema/<resource>.ts`, export from `schema/index.ts` | uuid id, `withTimezone` timestamps, FK with `onDelete`, unique + keyset index |
| 2 | Migration | `npm run db:generate -- --name <resource>` → `drizzle/NNNN_<resource>.sql` | Read the SQL, then `npm run db:migrate`. Commit `drizzle/meta/*` too |
| 3 | Domain | `src/domains/<name>/` | entity, commands, policy, `(cmd, deps)` scenario, private repository using the unit of work, `index.ts` |
| 4 | Wiring | `src/composition/wiring/<name>.wiring.ts` | Prebind ports. Another domain is reached only through `composition/adapters` |
| 5 | DTO | `src/api/http/v1/<resource>/dto/` | `.strict()` bodies, `{ … } satisfies ValidationSchemas`, response schema with `.meta({ id })` |
| 6 | Presenter + controller | `*.presenter.ts`, `*.controller.ts` | `validated(res, …)`, one prebound call, allow-list presenter, `{ data, meta }` |
| 7 | Router | `*.routes.ts`, mount in `src/api/http/router.ts` | `authenticate` → `validate()` → (`requireRole`) → handler |
| 8 | Docs | `src/api/http/openapi/document.ts` | One `registerPath` per route, same Zod schemas, error envelope, `security` |
| 9 | Tests | `tests/unit/domains/<name>.test.ts`, `tests/integration/<resource>.test.ts` | In-memory ports for unit; `createTestApp()` + supertest; add the table to `reset()` |

## Decisions

| Question | Answer |
|---|---|
| Who may read a row? | Decide in the scenario. Not visible → a not-found `AppError` with `<ENTITY>_NOT_FOUND`, never 403 for someone else's row |
| Admin-only route? | `requireRole('admin')` in the router. A list is a query, not a domain load |
| Several writes that must succeed together? | The owning scenario calls `deps.tx.transaction()`. Repositories take no `tx` (`drizzle-database` skill) |
| Name or slug must be unique? | Unique index + the repository maps `isUniqueViolation` to a domain error. No read-then-insert check |
| List endpoint? | `queries/<screen>.query.ts`: keyset, `limit + 1`, `encodeCursor`. Response `{ data, meta: { nextCursor, limit } }` |
| Partial update? | `PATCH` body with every field optional + `.refine(…, { error: 'Provide at least one field.' })` |
| Delete? | `204` with `res.status(204).end()`; a missing or invisible row is 404 |
| Calls another HTTP service? | Inject a `createResilientHttpClient` from the container (`resilience` skill) |

## Naming

`projects` resource → `infra/db/schema/projects.ts`, `domains/projects/` (`projects.entity.ts`, `projects.service.ts`, `projects.repository.ts`, `projects.module.ts`, `index.ts`), `api/http/v1/projects/` (`dto/`, `projects.presenter.ts`, `projects.controller.ts`, `projects.routes.ts`), wired from `composition/wiring/projects.wiring.ts`.

## Checklist

- [ ] Table exported from `schema/index.ts`; migration generated, read, applied and committed with `drizzle/meta`
- [ ] Repository queries only its table, takes no `tx`, and is not exported from `index.ts`
- [ ] Scenario imports no Express; returns domain objects, not rows; ownership enforced; unique violation mapped in the repository
- [ ] Every route mounts `validate()` with a `satisfies ValidationSchemas` object; bodies are `.strict()`
- [ ] Controller reads only `validated(res, …)` and `requirePrincipal(res)`; no `try/catch`, no `res.status(4xx)`
- [ ] Router mounted in `api/http/router.ts`; deps bound in `composition/wiring` only
- [ ] `POST` → 201 + `{ data, meta }`, `DELETE` → 204, list → `{ data, meta: { nextCursor, limit } }`
- [ ] Every route has an OpenAPI `registerPath` with success and error-envelope responses
- [ ] Scenario unit tests (in-memory ports) and integration tests (401, 404 for strangers, 409, 422, happy path); the table is in `reset()`
- [ ] `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:integration` pass
