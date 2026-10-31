---
name: error-handling
description: Throw and map errors in an Express 5 API — AppError subclasses with stable codes, the central errorHandler, RFC 9457 problem+json responses, 404/409/422/500 mapping, unique violations to ConflictError, Retry-After on 503. Use when adding a domain error, changing error responses or fixing how failures reach the client.
---

# Error handling

## When to use

- A service needs a new expected failure (not found, conflict, forbidden, unavailable)
- An endpoint returns the wrong status, leaks internals, or a client cannot tell failures apart
- A driver or upstream error must become a specific API error
- Not for request schema failures — `validate()` already produces the 422 (`request-validation` skill)

Hard constraints: `rules/error-handling.mdc`, `rules/api-design.mdc`. Code: [examples.md](examples.md).

## How an error travels

1. A service (or middleware) throws an `AppError` subclass with a code: `throw new NotFoundError('Project not found.', 'PROJECT_NOT_FOUND')`.
2. Express 5 forwards the thrown error or rejected promise from the handler — no `try/catch`, no `asyncHandler`.
3. `errorHandler()` (registered last) calls `toProblem()`:

| Thrown | Response |
|---|---|
| `AppError` subclass | its `status`, `code`, `detail` = message (`ValidationError` adds `errors[]`) |
| `ZodError` (a `.parse()` outside `validate()`) | 422 `VALIDATION_FAILED` with `errors[]` |
| body-parser error (4xx `status` + `type`) | 400 `MALFORMED_JSON`, 413 `PAYLOAD_TOO_LARGE`, … |
| anything else | 500 `INTERNAL_ERROR`, `An unexpected error occurred.` |

4. 5xx is logged with `req.log.error({ err })`; 4xx with `req.log.warn({ code, status })`. `ServiceUnavailableError.retryAfterSeconds` becomes `Retry-After`.
5. The body is `application/problem+json`: `{ type, title, status, detail, code, instance, errors? }`.

## Choosing the error

| Situation | Throw |
|---|---|
| Malformed but schema-valid input (bad cursor) | `BadRequestError(msg, 'INVALID_CURSOR')` |
| No/invalid credentials or token | `UnauthorizedError(msg, 'INVALID_TOKEN')` |
| Authenticated but lacks a role | `ForbiddenError()` (via `requireRole`) |
| Row missing **or** not visible to the caller | `NotFoundError(msg, '<ENTITY>_NOT_FOUND')` |
| Unique constraint, state conflict | `ConflictError(msg, '<WHAT>_TAKEN' / '<WHAT>_CONFLICT')` |
| Business rule on otherwise valid input | `ValidationError([{ path: 'body.startsAt', message, code: 'custom' }])` |
| Dependency down, breaker open, deadline hit | `ServiceUnavailableError(msg, code, retryAfterSeconds)` |
| Bug / impossible state | plain `Error` — becomes an opaque 500 and is logged |

## Procedure

1. Pick the subclass from the table. Add a new class to `src/lib/errors.ts` only for a status none of them has.
2. Name the code `UPPER_SNAKE_CASE`, specific to the cause (`PROJECT_NAME_TAKEN`, not `CONFLICT`). Never reuse or rename a published code.
3. Throw it from the service. Keep `{ cause }` when wrapping a lower-level error.
4. Map driver errors at the service boundary: wrap the write in `try/catch`, `isUniqueViolation(error)` → `ConflictError`, rethrow anything else.
5. Add the status to the route's OpenAPI `responses` with `problem('…')` (`openapi-docs` skill).
6. Test it: service unit test `rejects.toMatchObject({ code })` and an integration test asserting `status`, `content-type` `application/problem+json` and `body.code`.

## Checklist

- [ ] Every expected failure is an `AppError` subclass with a specific code
- [ ] No `res.status(4xx|5xx)` and no `try/catch` that sets a status in controllers
- [ ] No `next(err)` / `asyncHandler` boilerplate in async handlers (Express 5)
- [ ] Unique violations mapped with `isUniqueViolation`; other errors rethrown, not swallowed
- [ ] Invisible rows are 404, not 403; login failures share one code
- [ ] 5xx bodies contain no message, stack or SQL from the original error
- [ ] New statuses documented in OpenAPI and covered by a test asserting `code`
