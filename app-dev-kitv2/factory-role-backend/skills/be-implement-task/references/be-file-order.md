# Backend build order per task type

The order in which a backend builder touches files, for the layered stack of `node-backend-dev-kit`
(routes → controllers → services → repositories → db, wired in `src/container.ts`). Each step must
compile before the next: run `npm run typecheck` after the repository, after the controller and at
the end. The naming and code shapes are those of `node-backend-dev-kit:express-resource` and its
golden `examples.md`; this file only fixes the sequence and the factory-specific stops.

Two rules apply to every row:

- You write only the files in T0 "You may write only". A step whose file is not listed is either
  already done by another task (check it compiles and move on) or missing from the plan: return
  `needs_scope_change` naming the file. The role's file budget (`role.yaml` `budgets.task_limits`) keeps an endpoint task small, so a
  full new resource normally arrives as several tasks (repository, service, endpoint, openapi).
- The red tests are read-only. Make them pass; do not reshape the code around a different test.

## endpoint

| # | File | What | Stack skill |
|---|---|---|---|
| 1 | `src/schemas/<entity>.schema.ts` | the route's request object (`{ params?, query?, body? } satisfies ValidationSchemas`), `.strict()` bodies, bounded strings, `limit: z.coerce.number().int().min(1).max(100).default(20)` for lists; the response schema with `.meta({ id })` and `to<Entity>Response()` | `request-validation` |
| 2 | `src/repositories/<resource>.repository.ts` | the query method, `executor: DbExecutor = db` last, `limit + 1` for pages, `.returning()` on writes | `drizzle-database` |
| 3 | `src/services/<resource>.service.ts` | the operation: principal in, ownership check (`NotFoundError` for a stranger), `AppError` with the contract's code, `isUniqueViolation` → `ConflictError`, `transaction(async (tx) => …)` for several writes, row → domain object | `express-resource`, `error-handling` |
| 4 | `src/controllers/<resource>.controller.ts` | one handler: `validated(res, request)`, `requirePrincipal(res)`, one service call, DTO + status (201, 200, 204 with `.end()`) | `express-resource` |
| 5 | `src/routes/<resource>.routes.ts` | `authenticate` → `requireRole(...)` when role-restricted → `validate(request)` → handler | `auth-rbac`, `request-validation` |
| 6 | `src/routes/index.ts`, `src/container.ts` | a new router: mount it in `createApiRouter` (and `ApiRouterDeps`); a new controller/service/repository: create it in the container only | `express-resource` |
| 7 | `src/openapi/document.ts` | one `registry.registerPath` per route: same Zod schemas, success response, every problem status, `security` for protected routes | `openapi-docs` |
| 8 | — | run the red tests, then the exit check | — |

The engine's OpenAPI audit compares step 7 with `api-contract.yaml` at verification: a contract
operation without a `registerPath` (same method, same `/api/v1/...` path with `{id}` placeholders) is
a P1 finding; a documented route under the contract's prefixes that the contract lacks is a P2.

## service

1. Domain type and `to<Entity>(row)` mapper in the service file (rows never leave it).
2. Dependencies as a deps interface (`{ <resource>: <Resource>Repository; transaction: TransactionRunner; now?: () => Date }`).
3. The method: guard clauses for not-found and ownership first, then the rule, then the writes inside
   one transaction passing `tx` to every repository call; slow work (hashing, HTTP) before it opens.
4. Map driver errors at the end (`isUniqueViolation` → `ConflictError`), rethrow the rest.
5. Container wiring only if the factory's dependencies changed.

## validation

Schema file only, then the route that mounts it if T0 lists it. Field schemas defined once and
reused; Zod 4 top-level formats (`z.uuid()`, `z.email()`, `z.iso.datetime()`); messages via
`{ error }`. Normalisation that changes meaning (lower-casing) goes to the service, not the schema.

## repository

1. `src/db/schema/<table>.ts` is migration-author's file; if the column you query does not exist,
   stop with `needs_scope_change` (a migration task must come first).
2. The method with `executor: DbExecutor = db`; filters from an allowlist; keyset pagination
   (`orderBy(desc(createdAt), desc(id))`, `limit + 1`); conditional writes return `boolean`.
3. The matching method in the in-memory fake (`tests/helpers/in-memory-repositories.ts`) when T0 lists
   it, honouring `undefined` for a missing row and `{ code: '23505' }` for a duplicate.

## auth

Router guards (`authenticate`, `requireRole`) → controller `requirePrincipal(res)` → service ownership
rule → OpenAPI `security` and 401/403/404 problems. A new role is the `ROLES` tuple plus a pg enum
migration (a migration task) plus guards: `node-backend-dev-kit:auth-rbac`.

## error-mapping

Pick the existing `AppError` subclass (`node-backend-dev-kit:error-handling`); add a class to
`src/lib/errors.ts` only for a status none has. Throw it from the service with a specific
`UPPER_SNAKE_CASE` code, then document the status on the route's OpenAPI entry.

## resilience

Env variable in `src/config/env.ts` (and `.env.example` if listed) → client in `src/lib/<name>-client.ts`
built on `createResilientHttpClient`, responses parsed with Zod → container wiring with a health check
and an explicit `critical` flag → the service's degraded behaviour. `node-backend-dev-kit:resilience`.

## openapi

`src/openapi/document.ts` only (plus `tests/unit/openapi/document.test.ts` if it is your red test):
the route's `registerPath`, component ids via `.meta({ id })`, no `extendZodWithOpenApi`.

## config

`envSchema` entry with type, bounds and default → `.env.example` → read from `Env` in the container.
`.env` itself is a protected path; never write it.

## fix and refactor

- `fix`: reproduce with the red test the task names, change the smallest layer that owns the bug,
  keep every other test green.
- `refactor`: behaviour stays identical; move code to the layer that owns it rather than loosening a
  dependency-cruiser rule (`node-backend-dev-kit:architecture-audit`). The characterisation tests of
  the feature must stay green unchanged.

## migration

Not this agent's task type: migration-author builds it (`migration-authoring`).
