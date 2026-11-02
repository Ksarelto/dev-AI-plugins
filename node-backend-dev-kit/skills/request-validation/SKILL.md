---
name: request-validation
description: Validate request params, query and body with Zod 4 through the validate() middleware and read typed input with validated(res, schemas) — strict objects, coercion, pagination query, PATCH bodies, env parsing, 422 problem details with per-field errors. Use when adding or changing input validation, request schemas or DTO parsing in an Express 5 API.
---

# Request validation (Zod 4)

## When to use

- A route gains or changes params, query or body fields
- Input is read from `req.body` / `req.query` / `req.params` without a schema
- A new environment variable is introduced
- Not for response error shapes beyond 422 — `error-handling` skill; not for the whole slice — `express-resource`

Hard constraints: `rules/validation.mdc`, `rules/api-design.mdc`. Code and a Zod 4 cheat sheet: [examples.md](examples.md).

## How it works

- `validate(schemas)` runs `safeParse` on `params`, `query`, `body` (each optional), collects every issue as `{ path: '<part>.<field>', message, code }`, and calls `next(new ValidationError(issues))` → 422 `VALIDATION_FAILED`.
- On success it stores the parsed **output** (coerced, defaulted, trimmed) on `res.locals.validated`.
- `validated(res, schemas)` returns that output typed as `{ [part]: z.output<schema> }`. Pass the same request object the router used.
- Express 5 `req.query` is a read-only getter, which is why the parsed values live on `res.locals`.

## Procedure

1. In `src/schemas/<entity>.schema.ts` define field schemas once (`const name = z.string().trim().min(1).max(100)`) and reuse them.
2. Build the part schemas:

| Part | Shape |
|---|---|
| `params` | `uuidParamsSchema` from `common.schema.ts` (`{ id: z.uuid() }`, strict) |
| `query` | `.strict()` object; numbers via `z.coerce.number().int().min().max().default()`; `cursor: z.string().min(1).max(512).optional()` |
| `body` (create) | `.strict()` object; required fields plus `.optional()` ones; nullable where the column is nullable |
| `body` (PATCH) | every field `.optional()`, `.strict()`, `.refine((b) => Object.keys(b).length > 0, { error: 'Provide at least one field.' })` |

3. Export one request object per route: `export const updateProjectRequest = { params: uuidParamsSchema, body: updateProjectBodySchema } satisfies ValidationSchemas;`
4. In the router: `router.patch('/:id', validate(updateProjectRequest), controller.update)` — after `authenticate`/`requireRole` when the route is protected, so anonymous callers get 401 before 422.
5. In the controller: `const { params, body } = validated(res, updateProjectRequest);` and pass plain values to the service.
6. Never put ids, owner ids, roles or timestamps in a body schema; the service derives them from the principal and the database.
7. Response side: a Zod response schema with `.meta({ id })` and a `to<Entity>Response()` mapper that converts `Date` to ISO strings.
8. Cross-field and business checks that need the database belong in the service (throw `ValidationError` or `ConflictError`), not in a schema `refine`.
9. Environment: add the variable to `envSchema` in `config/env.ts` with type, bounds and default; to `.env.example`; read it from `Env` in `container.ts`, never from `process.env`.
10. Test: an integration case that sends invalid input and asserts 422 and the `errors[].path` values (`body.name`, `query.limit`, `params.id`).

## Checklist

- [ ] Every route with input has `validate(<request>)`; the request object uses `satisfies ValidationSchemas`
- [ ] Controllers read only `validated(res, <request>)`; no `req.body`/`req.query`/`req.params`
- [ ] Bodies and queries are `.strict()`; every string has `.max()`; numbers from the query are coerced and bounded
- [ ] Zod 4 formats (`z.uuid()`, `z.email()`, `z.url()`, `z.iso.datetime()`); messages via `{ error }`
- [ ] PATCH requires at least one field; no server-owned fields accepted
- [ ] New env vars parsed in `config/env.ts` and listed in `.env.example`
- [ ] An integration test asserts 422 and the failing paths
