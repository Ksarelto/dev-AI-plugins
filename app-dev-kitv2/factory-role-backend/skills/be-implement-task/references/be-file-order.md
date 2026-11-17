# Backend build order per task type

The order in which a backend builder touches files, for the stack of `node-backend-dev-kit`
(`api/http` → `composition` → `domains`, with `queries` for lists and `infra/db` for tables).
Each step must compile before the next: run `npm run typecheck` after the domain module, after the
controller and at the end. Shapes come from `node-backend-dev-kit:express-resource`. The live tree
is `node-backend-dev-kit` (`skills/scaffold-service/references/tree.md`).

Two rules apply to every row:

- You write only the files in T0 "You may write only". A step whose file is not listed is either
  already done by another task (check it compiles and move on) or missing from the plan: return
  `needs_scope_change` naming the file. The role's file budget (`role.yaml` `budgets.task_limits`) keeps an endpoint task small, so a
  full new resource normally arrives as several tasks (domain, endpoint, openapi).
- The red tests are read-only. Make them pass; do not reshape the code around a different test.

## endpoint

| # | File | What | Stack skill |
|---|---|---|---|
| 1 | `src/api/http/v1/<resource>/dto/` | the route's request object (`{ params?, query?, body? } satisfies ValidationSchemas`), `.strict()` bodies, bounded strings, `limit` for lists | `request-validation` |
| 2 | `src/queries/<screen>.query.ts` | a list: SELECT only, `limit + 1`, keyset cursor. Skip when the read is one entity | `drizzle-database` |
| 3 | `src/domains/<name>/*.service.ts` | the operation: principal in, ownership (`<ENTITY>_NOT_FOUND` for a stranger), `AppError` with the contract's code, `deps.tx.transaction()` when several writes must commit together | `express-resource`, `error-handling` |
| 4 | `src/api/http/v1/<resource>/*.presenter.ts` and `*.controller.ts` | one handler: `validated(res, request)`, `requirePrincipal(res)`, one prebound call, `{ data, meta }` (201, 200, 204 with `.end()`) | `express-resource` |
| 5 | `*.routes.ts`, `src/api/http/router.ts` | `authenticate` → `requireRole(...)` when role-restricted → `validate(request)` → handler | `auth-rbac`, `request-validation` |
| 6 | `src/composition/wiring/` | bind ports. A second domain is an adapter, not an import | `express-resource` |
| 7 | `src/api/http/openapi/document.ts` | one `registry.registerPath` per route: same Zod schemas, `{ data, meta }`, the error envelope, `security` | `openapi-docs` |
| 8 | — | run the red tests, then the exit check | — |

The engine's OpenAPI audit compares step 7 with `api-contract.yaml` at verification: a contract
operation without a `registerPath` (same method, same `/api/v1/...` path with `{id}` placeholders) is
a P1 finding; a documented route under the contract's prefixes that the contract lacks is a P2.

## service

1. Entity, commands, and policy in the domain folder. The policy takes `now` as an argument.
2. Ports (`Clock`, `IdGenerator`, the store, `Transactional`). Wiring supplies `new Date()` and `randomUUID()`.
3. The scenario: guard clauses first, then the rule. Slow work (hashing, HTTP) before `deps.tx.transaction()`.
4. The repository maps `isUniqueViolation` to the domain error and is not exported from `index.ts`.
5. Wiring only if the factory's dependencies changed.

## validation

DTO file only, then the route that mounts it if T0 lists it. Field schemas defined once and
reused; Zod 4 top-level formats (`z.uuid()`, `z.email()`, `z.iso.datetime()`); messages via
`{ error }`. Normalisation that changes meaning (lower-casing) goes to the domain policy, not the schema.

## repository

1. `src/infra/db/schema/<table>.ts` is migration-author's file; if the column you query does not exist,
   stop with `needs_scope_change` (a migration task must come first).
2. The method reads `unitOfWork.current()` and takes no `tx`. Filters from an allowlist. Lists belong in `queries/`.
3. The matching method on the in-memory port (`tests/helpers/in-memory-auth.ts` or the task's fake) when T0 lists it.

## auth

Router guards (`authenticate`, `requireRole`) → controller `requirePrincipal(res)` → scenario ownership
rule → OpenAPI `security` and 401/403/404 error codes. A new role is the `ROLES` tuple in `shared/permissions` plus a pg enum
migration (a migration task) plus guards: `node-backend-dev-kit:auth-rbac`.

## error-mapping

Throw an `AppError` subclass with a specific code and no HTTP status (`node-backend-dev-kit:error-handling`).
Add a class next to the domain that owns the failure. `api/http/error-mapper.ts` is the only place that picks the status.
Document the code on the route's OpenAPI entry.

## resilience

Env variable in `src/config/env.ts` (and `.env.example` if listed) → client in `src/infra/http/`
built on `createResilientHttpClient`, responses parsed with Zod → composition wiring with a health check
and an explicit `critical` flag → the scenario's degraded behaviour. `node-backend-dev-kit:resilience`.

## openapi

`src/api/http/openapi/document.ts` only (plus `tests/unit/openapi/document.test.ts` if it is your red test):
the route's `registerPath`, component ids via `.meta({ id })`, no `extendZodWithOpenApi`.

## config

`envSchema` entry with type, bounds and default → `.env.example` → read from `Env` in composition.
`.env` itself is a protected path; never write it.

## fix and refactor

- `fix`: reproduce with the red test the task names, change the smallest layer that owns the bug,
  keep every other test green.
- `refactor`: behaviour stays identical; move code to the layer that owns it rather than loosening a
  dependency-cruiser rule (`node-backend-dev-kit:architecture-audit`). The characterisation tests of
  the feature must stay green unchanged.

## migration

Not this agent's task type: migration-author builds it (`migration-authoring`).
The schema path is `src/infra/db/schema/`. The migrate entry is `src/infra/db/migrate.ts`.
