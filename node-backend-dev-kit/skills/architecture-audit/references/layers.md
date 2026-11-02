# Layers — what to check

## Layer table

| Layer | Owns | Must not | Hard if broken |
|---|---|---|---|
| `routes/` | `Router()`, path → `authenticate`/`requireRole` → `validate()` → controller method; `createXRouter(controller, deps)` | call services, repositories, `db`; contain handler bodies | yes |
| `controllers/` | `validated(res, …)`, `requirePrincipal(res)`, **one** service call, `to<Entity>Response()`, status | import repositories, `db`, routes; `try/catch` to set statuses; `res.status(4xx/5xx)`; read `req.body/query/params` | yes |
| `services/` | business rules, ownership, transactions via `TransactionRunner`, `AppError` subclasses, row → domain mapping | import `express`, routes, controllers, middleware; touch `req`/`res`; build SQL | yes |
| `repositories/` | Drizzle queries for one aggregate, `executor: DbExecutor = db` | `db.transaction`, `AppError`, business rules, call services | yes |
| `db/` | `createDatabase`, schema, migrations runner, seed, `TransactionRunner`, `isUniqueViolation` | import routes, controllers, services, repositories, middleware, schemas | yes |
| `schemas/` | Zod request/response schemas, `satisfies ValidationSchemas` request objects, DTO mappers | logic beyond mapping; import repositories or `db` | judgment (logic) / yes (imports) |
| `middleware/` | validate, authenticate, authorize, timeout, rate limit, request logger, error handler | business rules; import services, repositories, `db` | yes |
| `lib/`, `config/` | framework-free building blocks, `Env` | import any layer | yes |
| `openapi/` | `buildOpenApiDocument()` from `schemas/` | import services, repositories, `db` | yes |
| `container.ts` | the only place that calls `create*` with concrete dependencies | business logic | yes (factories called elsewhere) |
| `app.ts` / `server.ts` / `index.ts` | middleware order / listening / bootstrap and shutdown | route handlers, queries | yes |

## Allowed imports

| From ↓ / To → | routes | controllers | services | repositories | db | schemas | middleware | lib, config |
|---|---|---|---|---|---|---|---|---|
| routes | ✓ | types | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ |
| controllers | ✗ | ✓ | types | ✗ | ✗ | ✓ | ✓ (`validated`, `requirePrincipal`) | ✓ |
| services | ✗ | ✗ | ✓ | types | types, `errors`, `transaction` | ✗ | ✗ | ✓ |
| repositories | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ | ✓ |
| db | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ |
| schemas | ✗ | ✗ | types | ✗ | ✗ | ✓ | type `ValidationSchemas` | ✓ |
| middleware | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |

## Semantic checks

Mechanical rules catch imports; these greps catch the rest. Every hit is a candidate — read the file before
reporting it. On the unmodified boilerplate the only hits are `health.controller.ts` (readiness answers
503 by design) and the two mounts in `routes/index.ts` (compare them with the `*.routes.ts` files).

```bash
grep -rn "from 'express'" src/services src/repositories src/db src/lib            # HTTP in a lower layer
grep -rnE "req\.(body|query|params)" src/controllers src/services                  # unvalidated input
grep -rnE "res\.status\((4|5)[0-9]{2}\)" src/controllers                            # status mapping in a controller
grep -rn "catch" src/controllers                                                    # try/catch in a controller
grep -rn "process\.env" src --include=*.ts | grep -v "src/config/" | grep -v "src/db/seed.ts"   # config outside env.ts
grep -rn "console\." src                                                            # console logging
grep -rn "\.transaction(" src | grep -v "src/db/transaction.ts"                     # transactions outside the runner
grep -rnE "from 'postgres'|drizzle\(" src | grep -v "src/db/client.ts"             # extra pools
grep -rnE "AppError|NotFoundError|ConflictError" src/repositories                   # HTTP-ish errors in repositories
grep -rnE "create[A-Z][A-Za-z]+(Repository|Service|Controller)\(" src | grep -v "src/container.ts" | grep -v "export function"   # wiring outside the root
grep -rn "router.use('/" src/routes/index.ts                                        # compare with routes/*.routes.ts files
grep -rnE "passwordHash|tokenHash" src/schemas src/controllers                      # secrets near the wire
```

Also read, not grep:

- Controllers calling more than one service method, or containing `if` on business state → move to the service.
- Services returning `<Entity>Row` instead of a domain type → secrets can leak.
- Repository methods without the `executor: DbExecutor = db` parameter → cannot join a transaction.
- Multi-write service methods without `transaction(...)`, or calls inside it that do not pass `tx`.
- `schemas/` functions other than `to<Entity>Response` mappers.
- A `*.routes.ts` not mounted in `routes/index.ts`, or mounted from `app.ts` directly.
- A `create*` factory called in a module body (singleton) instead of `container.ts`.

## Enforcement findings

- No `.dependency-cruiser.cjs`, or `lint` does not run it → hard ("layers unenforced").
- Config present but missing the rules in [dependency-cruiser.md](dependency-cruiser.md#what-the-shipped-config-does-not-enforce) → judgment.
- ESLint without `strictTypeChecked`, `no-console`, `consistent-type-imports` → judgment.
