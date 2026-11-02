---
name: openapi-docs
description: "Generate OpenAPI 3.1 docs from Zod 4 schemas with @asteasolutions/zod-to-openapi — .meta({ id }) components, registry.registerPath per route, bearer security scheme, problem+json responses, Swagger UI at /api-docs. Use when documenting an endpoint, publishing or exporting the API spec, or fixing swagger output."
---

# OpenAPI docs

## When to use

- A route was added or changed and its documentation must follow
- Swagger UI is missing a path, a schema is inlined instead of referenced, or a client needs `openapi.json`
- Not for request validation itself — `request-validation` skill

Hard constraints: `rules/api-design.mdc`, `rules/validation.mdc`. Code: [examples.md](examples.md).

## Model

- One function, `buildOpenApiDocument()` in `src/openapi/document.ts`, builds an `OpenAPIRegistry`, registers every path and renders with `OpenApiGeneratorV31` (`openapi: '3.1.0'`).
- The schemas are the **same** Zod objects that validate requests and describe responses. No hand-written JSON schema, no second DTO definition.
- A schema with `.meta({ id: 'Name' })` becomes `components.schemas.Name` and is referenced; without an id it is inlined.
- `bearerAuth` is registered once as an HTTP bearer JWT security scheme; protected paths set `security: [{ [bearer.name]: [] }]`.
- Errors are documented with the shared `problemSchema` (`id: 'Problem'`) under `application/problem+json` via the local `problem(description)` helper.
- Served at `/api-docs` (UI) and `/api-docs/openapi.json` when `API_DOCS_ENABLED=true`.

## Procedure

1. Give every request body and response schema that clients will name an id: `.meta({ id: 'CreateProjectBody' })`, `.meta({ id: 'Project' })`. Ids are PascalCase and unique.
2. Do **not** call `extendZodWithOpenApi(z)` or `.openapi()` for ids — Zod 4 requires the extension before any schema is created; `.meta()` needs nothing.
3. In `buildOpenApiDocument()`, add one `registry.registerPath({ method, path, tags, security, request, responses })` per route:
   - `path` uses `{id}`, matches the mounted path including `/api/v1`
   - `request.params` / `request.query`: the Zod objects from the route's `validate()` request object
   - `request.body`: `json(bodySchema)`
   - `responses`: the success status with `json(responseSchema)` (or `{ description }` for 204), and `problem('…')` for every `AppError` status the route can return (401, 403, 404, 409, 422 …)
   - `tags`: the resource name; `security` for authenticated routes
4. Extend `tests/unit/openapi/document.test.ts` with the new paths and component names; `npm run test:unit`.
5. Check the rendered result: `npm run dev`, open `/api-docs`, or `curl localhost:3000/api-docs/openapi.json`.

## Checklist

- [ ] Every route in `routes/` has a `registerPath` with the full `/api/v1/...` path
- [ ] Request parts reuse the exact schemas passed to `validate()`
- [ ] Named schemas use `.meta({ id })`; no `extendZodWithOpenApi` added for ids
- [ ] Success and every possible problem status documented; 204 has no content
- [ ] Protected routes declare `security`
- [ ] Document test lists the new paths and components and passes
