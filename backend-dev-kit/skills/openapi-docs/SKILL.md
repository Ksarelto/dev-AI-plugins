---
name: openapi-docs
description: Generate OpenAPI from Zod schemas with @asteasolutions/zod-to-openapi and serve Swagger UI at /docs and /openapi.json. Use when adding API docs, operationId, or OpenAPIRegistry wiring, not when scaffolding a CRUD resource.
---

# OpenAPI from Zod

## When to use

Serving `/docs` / `/openapi.json`, registering resource schemas on the OpenAPI registry, or setting `operationId`. Creating the resource itself is `express-feature`. Health routes stay out of the spec.

Defer libraries to `rules/stack.mdc`.

## Procedure

1. `extendZodWithOpenApi(z)` once in `src/http/openapi.ts`.
2. `OpenAPIRegistry` — `register(name, schema)` for each Create/Update/Read; `registerPath` per operation with tag + `operationId`. Do this in `src/http/openapi.ts`, not in routers.
3. `OpenApiGeneratorV31(registry.definitions).generateDocument({ openapi: "3.1.0", info, servers })`.
4. `createApp()`: `GET /openapi.json` returns the document; `app.use("/docs", swaggerUi.serve, swaggerUi.setup(undefined, { swaggerUrl: "/openapi.json" }))`.
5. Mount `/docs` after `/api/v1`, **before** the error handler. Do not include `/healthz` or `/readyz`.
6. Error responses in `registerPath` use the RFC 7807 envelope schema.

## Checklist

- [ ] No hand-written `openapi.yaml`
- [ ] Explicit `operationId` on every path
- [ ] Resource schemas `.strict()` on inputs, registered once, reused on paths

## References

- [examples.md](./examples.md) — registry, document, createApp mounts
