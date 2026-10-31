# Review checklist by area

Each item points at the rule that owns it. Read the rule when an item fails, and quote its bullet in the finding.

## Layering — `rules/layered-architecture.mdc`
- Routes only wire; controllers call one service method; services free of Express; repositories free of business rules and transactions
- New factories wired only in `container.ts`; new routers mounted only in `routes/index.ts`
- Services return domain objects, not rows

## Validation — `rules/validation.mdc`
- Every route with input mounts `validate(<request>)`; the request object uses `satisfies ValidationSchemas`
- Controllers read `validated(res, …)` only; no `req.body/query/params`
- `.strict()` bodies and queries; bounded strings; coerced and bounded query numbers; Zod 4 formats
- PATCH requires at least one field; no id/owner/role/timestamps accepted from the body
- New env vars in `envSchema` and `.env.example`

## Errors — `rules/error-handling.mdc`
- Expected failures are `AppError` subclasses with new, specific codes; no renamed codes
- No status mapping in controllers; no `asyncHandler`/`next(err)` boilerplate
- Unique violations mapped with `isUniqueViolation`; other errors rethrown; causes kept
- Invisible rows → 404; no internals in 5xx

## Auth and security — `rules/auth-security.mdc`
- Protected routers mount `authenticate`; admin routes `requireRole`; controllers use `requirePrincipal(res)`
- Ownership checked in the service; owner from the principal; lists filtered in the query
- Token/password code uses `jose` with pinned algorithms, argon2id, hashed refresh tokens
- CORS allowlist, helmet, body limit, rate limits untouched or tightened; no secrets in code or fixtures

## Database — `rules/database.mdc`
- Schema change + generated migration + `drizzle/meta` in the same diff; no edits to applied migrations
- uuid PKs, `withTimezone` timestamps, FKs with `onDelete`, indexes for FKs and list order
- Repository methods take `executor: DbExecutor = db`; multi-writes in `transaction`, every call passes `tx`
- No raw string SQL; keyset pagination with `limit + 1`; bounded limits
- Integration `reset()` truncates the new table

## API design — `rules/api-design.mdc`
- `/api/v1/<plural-kebab>`; correct status per method; `{ items, nextCursor }` lists
- DTO mapper used; no rows, hashes or internal flags returned; ISO dates
- `registerPath` for every new or changed route, with problem responses and `security`

## Resilience — `rules/resilience.mdc`
- Outbound calls through `createResilientHttpClient` or `withTimeout`; retries only when idempotent
- New dependency has a health check with a deliberate `critical` flag; liveness untouched
- New pools/consumers/intervals registered in shutdown `resources`; timers `.unref()`

## Observability — `rules/observability.mdc`
- `req.log` in requests, injected child loggers elsewhere; no `console`
- Object first, static message; errors under `err`
- No bodies, tokens, passwords or headers logged; new sensitive keys added to `REDACT_PATHS`

## TypeScript — `rules/typescript-node.mdc`
- `.js` relative specifiers, `import type`, `node:` built-ins
- No `any`, unjustified `as`, `!`, `@ts-ignore`; explicit return types on exported functions
- No floating promises

## Tests — `rules/testing.mdc`
- Every new or changed service/route/middleware/lib function has tests in this diff
- Unit tests use in-memory repositories, not Drizzle mocks; integration tests mock nothing in `src/`
- Error paths assert `status` and `code`; protected routes cover 401/403/404
- Tests were actually run (step 1 output), not assumed
