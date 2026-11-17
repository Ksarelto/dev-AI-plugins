---
name: error-handling
description: Throw and map errors in an Express 5 API — AppError subclasses with stable codes and no HTTP status, the error mapper, a JSON error envelope, 404/409/422/500 mapping, unique violations to a domain error, Retry-After on 503. Use when adding a domain error, changing error responses or fixing how failures reach the client.
---

# Error handling

## When to use

- A service needs a new expected failure (not found, conflict, forbidden, unavailable)
- An endpoint returns the wrong status, leaks internals, or a client cannot tell failures apart
- A driver or upstream error must become a specific API error
- Not for request schema failures — `validate()` already produces the 422 (`request-validation` skill)

Hard constraints: `rules/error-handling.mdc`, `rules/api-design.mdc`. Code: [examples.md](examples.md).

## How an error travels

1. A scenario (or middleware) throws an `AppError` subclass with a code and no HTTP status: `throw new AccountNotFoundError()`.
2. Express 5 forwards the thrown error or rejected promise from the handler — no `try/catch`, no `asyncHandler`.
3. `api/http/error-mapper.ts` (registered last) maps the code to a status:

| Thrown | Response |
|---|---|
| `AppError` subclass | status from the code table, body `{ error: { code, message, details, requestId } }` |
| `ZodError` (a `.parse()` outside `validate()`) | 422 `VALIDATION_FAILED` with `details` |
| body-parser error (4xx `status` + `type`) | 400 `MALFORMED_JSON`, 413 `PAYLOAD_TOO_LARGE`, … |
| anything else | 500 `INTERNAL_ERROR`, `An unexpected error occurred.` |

4. 5xx is logged with `req.log.error({ err })`; 4xx with `req.log.warn`. `UnavailableError.retryAfterSeconds` becomes `Retry-After`.
5. The body is `application/json`. Clients branch on `error.code`. `error.requestId` matches `X-Request-Id`.

## Choosing the error

| Situation | Throw |
|---|---|
| Malformed but schema-valid input (bad cursor) | `InvalidCursorError` (`INVALID_CURSOR` → 400) |
| No/invalid credentials or token | `MissingTokenError`, `InvalidAccessTokenError`, or the domain's credential error |
| Authenticated but lacks a role | `ForbiddenError` (via `requireRole`) |
| Row missing **or** not visible to the caller | a domain not-found error (`<ENTITY>_NOT_FOUND` → 404) |
| Unique constraint, state conflict | a domain error (`EMAIL_TAKEN` → 409), thrown in the repository |
| Business rule on otherwise valid input | `ValidationError` with `details` (422) |
| Dependency down, breaker open, deadline hit | `UnavailableError(code, message, retryAfterSeconds)` |
| Bug / impossible state | plain `Error` — becomes an opaque 500 and is logged |

## Procedure

1. Pick the class from the table. A domain-specific failure lives in that domain's `*.errors.ts`. Shared transport failures live in `src/core/errors/app-error.ts`.
2. Name the code `UPPER_SNAKE_CASE`, specific to the cause (`EMAIL_TAKEN`, not `CONFLICT`). Never reuse or rename a published code. Add the code to the mapper's status table.
3. Throw it from the scenario. Keep `{ cause }` when wrapping a lower-level error.
4. Map driver errors in the repository: `isUniqueViolation(error)` → the domain error, rethrow anything else.
5. Document the error body on the route's OpenAPI `responses` (`openapi-docs` skill).
6. Test it: a scenario unit test `rejects.toMatchObject({ code })` and an integration test asserting `status`, `content-type` `application/json` and `body.error.code`.

## Checklist

- [ ] Every expected failure is an `AppError` subclass with a specific code
- [ ] No `res.status(4xx|5xx)` and no `try/catch` that sets a status in controllers
- [ ] No `next(err)` / `asyncHandler` boilerplate in async handlers (Express 5)
- [ ] Unique violations mapped with `isUniqueViolation`; other errors rethrown, not swallowed
- [ ] Invisible rows are 404, not 403; login failures share one code
- [ ] 5xx bodies contain no message, stack or SQL from the original error
- [ ] New statuses documented in OpenAPI and covered by a test asserting `code`
