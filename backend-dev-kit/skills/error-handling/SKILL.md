---
name: error-handling
description: Implement structured error handling in Express — AppError hierarchy, Zod 422 mapping, RFC 7807-shaped JSON, pino, and request-id middleware.
---

# Error handling

## When to use

Setting up errors for a new service, adding consistent error responses, or fixing mixed 500/string bodies. Not for designing REST URLs (`api-design` rule) or scaffolding a resource (`express-feature`).

## Taxonomy

| Type | Where raised | How handled |
|------|--------------|-------------|
| Domain (`ProductNotFoundError`) | Service | `AppError` subclass; error middleware maps status + code |
| Zod | `validate` middleware | 422 + `details[]` |
| Auth 401/403 | Auth middleware | `UnauthorizedError` / `ForbiddenError` |
| Unique / FK | Driver error in service | Map to `ConflictError` / `NotFoundError` |
| Unexpected | Anywhere | 500, log stack, generic client message |

## Procedure

1. Define `AppError` + `NotFoundError` / `ConflictError` / `UnauthorizedError` / `ForbiddenError` in `src/errors/app-error.ts`.
2. Per-resource errors extend those in `{resource}.errors.ts`.
3. `validate` middleware `parse`s and `next(err)` on failure.
4. Four-arg `errorHandler` registered **last** in `createApp()`: `ZodError` → 422, `AppError` → its status, else 500.
5. `requestId` middleware binds `X-Request-ID` and a pino child logger.
6. Services throw `AppError` — they never import `express`. Routers do not `try/catch` to set status.

## Checklist

- [ ] Single error envelope `{ error: { code, message, details? } }`
- [ ] 422 includes per-field `details`
- [ ] 500 never includes stack traces in JSON
- [ ] `request_id` on logs and `X-Request-ID` response header
- [ ] 4xx domain errors logged at warn/info; 5xx at error

## References

- [examples.md](./examples.md) — `AppError`, validate, error handler, request-id
