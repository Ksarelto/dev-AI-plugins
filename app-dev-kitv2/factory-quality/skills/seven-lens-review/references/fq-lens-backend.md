# Lens group: backend (node-backend-dev-kit, Express 5 layered API)

Applies to change-set files under the backend role's path. T1 names the stack knowledge to load
(`node-backend-dev-kit:code-review`) and lists the stack's rules. The stack skill's
[checklist](../../../../../node-backend-dev-kit/skills/code-review/references/checklist.md) is
organised by area and points each item at its rule; its
[severity table](../../../../../node-backend-dev-kit/skills/code-review/references/severity.md) uses
blocker/major/minor/nit, which [fq-severity.md](fq-severity.md) maps to P0–P3. Cite the rule file
(`rules/<name>.mdc`) in `evidence` when a finding rests on it. Use the stack skill as knowledge
only: its procedure runs git, typecheck and tests, which the engine already did before you.

## Already covered — do not file again

| Covered by | What it catches |
|---|---|
| gate-checks (before you) | typecheck, ESLint (strict type-checked) and the dependency-cruiser layer rules that `lint` runs, build, unit tests, integration tests (Testcontainers) unless `quality.integration_tests: skip` |
| task gates (gate-impl) | `depcruise` architecture check; `check-migrations.mjs` on every backend task |
| audit `openapi` | contract operations missing from `src/openapi/document.ts` (P1), documented paths not in the contract (P2) |
| audit `migrations` | every changed `drizzle/*.sql`: journal entry, paired rollback, destructive statements approved by an `HD-n` note |

If integration tests were skipped (`integration-not-run` in the gate log, or the config says skip),
say so in the summary: SQL behaviour is then unverified, and SQL findings matter more.

## Must fix — P0 or P1

Adapted from the v1 backend reviewer's must-fix list to this stack's vocabulary.

`security` (P0)
- A protected route without `authenticate`, an admin route without `requireRole`, or a role check
  hand-written in a controller; a role, owner or permission read from the request body.
- A resource read, changed or deleted without an ownership check in the service (IDOR); a list not
  filtered by the principal in the query.
- SQL from strings or `sql.raw` with user input; interpolated values in `sql` fragments.
- A secret, token, password or password hash in code, fixtures, logs or a response; JWT verification
  without pinned algorithms.
- A 5xx body that exposes a stack trace, SQL or an internal message.

`spec-adr-drift` (P1)
- Layering broken in a way lint cannot see: business rules or Drizzle calls in a route or
  controller; a service importing Express; a repository holding business rules.
- Transactions: `db.transaction` opened or committed inside a repository; a multi-write without a
  transaction; a call inside the transaction that does not pass `tx`. The service owns the
  transaction; repository methods accept an executor (`DbExecutor`, defaulting to `db`).
- Errors: an expected failure not raised as an `AppError` subclass with its own new code; a reused
  or renamed code; status codes mapped in a controller (`res.status(4xx)`, `try/catch`) instead of
  the error middleware turning `AppError` into problem+json; an empty `catch` or a swallowed error.
- Validation: a route with input but no `validate()` at the edge; a controller reading `req.body`,
  `req.query` or `req.params` directly; a body that is not strict or a string without a bound; ID,
  owner, role or timestamps accepted from the body.
- Status and shape differ from the contract: 201/204/404/409/422 as the contract says; lists return
  `{ items, nextCursor }`; DTOs mapped, never raw rows, hashes or internal flags.
- Schema change without a generated migration and its `drizzle/meta` in the same change; an edit
  to a migration that was already applied.
- `any` at an HTTP, database or env boundary; `process.env` read outside `config/env.ts`.

## Should fix — P2 (P1 when an AC depends on it)

- Unbounded list: no `limit` cap, `OFFSET` paging, or a keyset query without `limit + 1`; a missing
  index for a new foreign key or list order.
- N+1 queries in a list path.
- Uniqueness checked by read-then-write instead of a constraint and `isUniqueViolation`.
- An outbound call without a timeout (`withTimeout` or the resilient HTTP client); a retry on a
  non-idempotent call.
- `console.*` anywhere; log calls with interpolated data instead of an object plus a static message;
  errors not under `err`; a new sensitive field not added to the logger's redaction paths.
- A new dependency, pool, consumer or interval without a health check or a shutdown registration.
- Missing tests for the error paths the ACs name (401, 403, 404, 409, 422) — judge the tests that
  exist; a missing operation in OpenAPI is the audit's.
- A new env variable not in the env schema and `.env.example`.

## Consider — P3

- Extra OpenAPI examples, clearer `detail` messages, an index suggestion with evidence of the query,
  naming drift from the stack's file and factory naming.

## Lens hints for backend code

| Lens | Backend questions |
|---|---|
| `behaviour` | A change request keeps every existing route's status, body shape and error code (characterisation tests exist for them) |
| `assumptions` | Rows assumed present (no 404 path), a clock assumed (inject `now`), an outbound service assumed up (no degradation path) |
| `edge-cases` | Last page, `limit` at its maximum, concurrent create of the same unique value, a transaction failing after the first write |
| `over-engineering` | A generic repository base, a DI container, an options object no AC needs, a library duplicating one the stack ships |
