# Layers — what to check

Canonical table: `rules/layered-architecture.mdc`. The import matrix is `.dependency-cruiser.cjs` in the service (the boilerplate's file is the reference).

## Layer table

| Layer | Owns | Must not | Hard if broken |
|---|---|---|---|
| `api/http` | DTO → command, one prebound call, presenter, status mapping | import a domain file other than through `composition`, import `infra` or Drizzle, `try/catch` that sets a status | yes |
| `composition` | adapters (translation) and wiring (prebound scenarios) | business rules, Express | yes |
| `domains/<name>` | `(cmd, deps)`, policy, entity, private repository | other domains, `api`, Express, `new Date()`, `randomUUID()` | yes |
| `queries` | SELECT for one screen | `insert`/`update`/`delete`, domain imports | yes |
| `infra` | pool, schema, unit of work, jwt, passwords, outbound HTTP | domains, `api`, composition | yes |
| `core`, `shared`, `config` | primitives, business values, env | domains, `api`; `process.env` outside `config/` (seed excepted) | yes |
| `main.ts` | open the pool, start, shutdown | route handlers | yes |
| `app.ts` | middleware order | import a domain, `infra`, or a query | yes |

A `*.repository.ts` and its `*.module.ts` may import `infra/db`. The repository is not exported from the domain `index.ts`.

## Semantic checks

```bash
grep -rn "from 'express'" src/domains src/queries src/infra src/core src/shared
grep -rnE "req\.(body|query|params)" src/api/http --include='*.controller.ts'
grep -rnE "res\.status\((4|5)[0-9]{2}\)" src/api/http --include='*.controller.ts'
grep -rn "process\.env" src --include=*.ts | grep -v "src/config/" | grep -v "src/infra/db/seed.ts"
grep -rn "randomUUID\|Date\.now" src/domains
grep -rnE "\.(insert|update|delete)\(" src/queries
grep -rn "console\." src
```

`new Date()` with no arguments is banned under `domains/` by ESLint. `new Date(timestamp)` is allowed.

Also read, not grep:

- A controller that calls more than one scenario, or branches on business state.
- A domain file other than the repository and module that imports `infra`.
- A repository method that takes a `tx` argument.
- A scenario that calls `new Date()` or opens a pool.
- A list loaded as domain entities instead of a query.
- Two domains importing each other instead of meeting in an adapter.

## Enforcement findings

- No `.dependency-cruiser.cjs`, or `lint` does not run it → hard.
- ESLint without `strictTypeChecked`, `func-style`, `no-console`, `consistent-type-imports` → judgment.
