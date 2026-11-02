# Backend must-fix list

The defects a backend builder never hands on. Each one fails a gate, an engine audit or the
reviewer's seven-lens pass (which reads `node-backend-dev-kit:code-review`), and each costs a full
retry when it does. Check your diff against this list before you run the exit check.

The "caught by" column says who finds it first. `lint` runs ESLint (strictTypeChecked, `no-console`)
and dependency-cruiser; the dependency-cruiser rule names are those of `backend-boilerplate`.

| # | Defect | Caught by | Fix |
|---|---|---|---|
| 1 | Drizzle, `db`, a repository or a business rule in a controller or route | lint: `controllers-no-data-access`, `routes-only-wire`; reviewer | move the query to the repository and the rule to the service; the controller calls one service method |
| 2 | `db.transaction` (or a commit) inside a repository | lint `repositories-are-leaves` for imports; reviewer for the call | the service opens it with the injected `TransactionRunner` and passes `tx` to each repository call |
| 3 | SQL built from strings: template literals into `sql.raw`, concatenated `where` text, client-chosen column names | reviewer (security lens) | the query builder or the `sql` tagged template with bound values; sort and filter keys from an allowlist |
| 4 | A hard-coded secret, key, password or connection string (also in tests beyond `TEST_JWT_SECRET`) | reviewer (security lens) | read it from `Env` in the container; tests use `testEnv()` |
| 5 | A protected route without `authenticate`, or role checks written as `if (principal.roles…)` in a handler | unit tests (401/403 rows); reviewer | `router.use(authenticate)` and `requireRole('admin')` in the router |
| 6 | Ownership checked in the controller, or not at all | unit tests (404-for-stranger row); reviewer | the service receives the principal and throws `NotFoundError` for a row the caller does not own; lists filter by owner in the repository query |
| 7 | A role, owner id, user id, id or timestamp accepted from the request body | strict schema 422 test; reviewer | remove it from the body schema; derive it from the principal or the database |
| 8 | An empty `catch`, or a `catch` that returns a default and hides the failure | reviewer | let it propagate; catch only to map a known driver error (`isUniqueViolation`) and rethrow everything else with `{ cause }` |
| 9 | `any`, `as` casts or `@ts-ignore` at a boundary (request input, row mapping, env, external response) | ESLint strictTypeChecked; typecheck | parse with the Zod schema; map rows with a typed `to<Entity>()` |
| 10 | A raw row returned from a controller (no response DTO) | unit test asserting absent secrets; reviewer | `to<Entity>Response(domainObject)` with the response schema |
| 11 | An unbounded list: no `limit` maximum, `OFFSET` on a growing table, `select()` without `limit` | limit-bound test (422 at 101); reviewer | `z.coerce.number().int().min(1).max(100).default(20)` and keyset pagination |
| 12 | `console.*` anywhere in `src/` | ESLint `no-console` | `req.log` in a request, an injected `logger.child({ component })` elsewhere |
| 13 | Tokens, passwords, hashes, cookies or bodies in a log line or an error `detail` | reviewer (security lens) | log ids and counts; add a new sensitive field to `REDACT_PATHS` in `src/lib/logger.ts` |
| 14 | `res.status(4xx/5xx)` or `try/catch` to set a status in a controller | reviewer | throw the `AppError` subclass; `errorHandler()` renders problem+json |
| 15 | `process.env.X` outside `src/config/env.ts` | reviewer; `architecture-audit` greps | add the variable to `envSchema`, read it from `Env` |
| 16 | A new library (`npm install`, a `package.json` dependency edit) | `package-lock.json` is a protected path; reviewer | stop: a dependency is a human-owned decision (below) |
| 17 | A route without its OpenAPI `registerPath`, or with a different path or method than the contract | the engine's OpenAPI audit at verification (P1) | step 7 of the endpoint order in [be-file-order.md](be-file-order.md) |
| 18 | A 403 for someone else's row, or two different login failure codes | unit tests; reviewer | 404 `<ENTITY>_NOT_FOUND`; one `INVALID_CREDENTIALS` |

## Self-check before the exit check

Unscoped `Grep` is blocked, so search only your own files (the T0 list), one path at a time:

| Search in your files | A hit means |
|---|---|
| `console\.` | defect 12 |
| `process\.env` | defect 15 |
| `: any\b\|as any\|@ts-ignore\|as unknown as` | defect 9 |
| `sql\.raw\|\$\{.*\}.*(where\|order by)` | defect 3 |
| `catch \{\s*\}\|catch \(\w*\) \{\s*\}` | defect 8 |
| `\.transaction\(` in a `*.repository.ts` | defect 2 |
| `from '.*repositories/\|from '.*db/` in a controller or route | defect 1 |

Then run `npm run typecheck` and `npm run lint`; both are part of the gate anyway, and a local run
shows the full message where the gate shows a tail.

## The smallest change

- Only what the red tests and the definition of done need. No speculative options, no "while I am
  here" refactors, no renames outside the task, no reformatting of untouched code.
- No new abstraction layer, helper module or base class for one use.
- A change the task needs but its files do not allow → `needs_scope_change`, never a workaround in a
  file you may write.

## Dependencies are human-owned

`policy.human_owned` in the factory config lists `new_dependency`: no agent adds a package. When the
task truly needs one (the stack has no owner for the concern in `rules/stack.mdc`), return
`needs_clarification` with the package, the version, why the stack's owner cannot do it, and the
alternative you would build without it. The human's answer becomes a note (`HD-n`) and the planner
re-plans; do not install anything in the meantime. A concern the stack already owns (validation,
logging, HTTP, JWT, hashing, tests) never gets a second library.
