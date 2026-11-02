# OpenAPI docs — examples

`document.ts` and its test are verbatim from `backend-boilerplate/`; the `projects` paths come from the
verified `express-resource` example.

## `src/openapi/document.ts`

```ts
import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import type { z } from 'zod';
import {
  authResponseSchema,
  loginBodySchema,
  refreshBodySchema,
  registerBodySchema,
} from '../schemas/auth.schema.js';
import { problemSchema } from '../schemas/common.schema.js';
import {
  listUsersRequest,
  userPageResponseSchema,
  userResponseSchema,
} from '../schemas/user.schema.js';

/**
 * The OpenAPI document is generated from the same Zod schemas that validate requests.
 * Schemas named with `.meta({ id })` become reusable `components.schemas` entries.
 */
export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  const bearer = registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });

  const json = <T extends z.ZodType>(schema: T) => ({
    content: { 'application/json': { schema } },
  });
  const problem = (description: string) => ({
    description,
    content: { 'application/problem+json': { schema: problemSchema } },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/register',
    tags: ['auth'],
    request: { body: json(registerBodySchema) },
    responses: {
      201: { description: 'Account created', ...json(authResponseSchema) },
      409: problem('Email already registered'),
      422: problem('Validation failed'),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/login',
    tags: ['auth'],
    request: { body: json(loginBodySchema) },
    responses: {
      200: { description: 'Signed in', ...json(authResponseSchema) },
      401: problem('Invalid credentials'),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/refresh',
    tags: ['auth'],
    request: { body: json(refreshBodySchema) },
    responses: {
      200: { description: 'Rotated tokens', ...json(authResponseSchema) },
      401: problem('Invalid or reused token'),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/logout',
    tags: ['auth'],
    request: { body: json(refreshBodySchema) },
    responses: { 204: { description: 'Session revoked' } },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/users/me',
    tags: ['users'],
    security: [{ [bearer.name]: [] }],
    responses: {
      200: { description: 'Current user', ...json(userResponseSchema) },
      401: problem('Not authenticated'),
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/users',
    tags: ['users'],
    security: [{ [bearer.name]: [] }],
    request: { query: listUsersRequest.query },
    responses: {
      200: { description: 'Users, newest first', ...json(userPageResponseSchema) },
      403: problem('Admin role required'),
    },
  });

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: 'backend-boilerplate API', version: '0.1.0' },
  });
}
```

## Naming a schema as a component

```ts
// src/schemas/project.schema.ts — .meta({ id }) turns the schema into components.schemas.Project
export const projectResponseSchema = z
  .object({
    id: z.uuid(),
    ownerId: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Project' });

// field-level docs also go through .meta (verified with zod-to-openapi 9.1)
const name = z.string().trim().min(1).max(100).meta({ description: 'Project name', example: 'Apollo' });
```

Why not `extendZodWithOpenApi(z)` and `.openapi('Project')`: with Zod 4 it must run before any schema is
constructed, i.e. imported first by every entry point and test, or `.openapi` is undefined at runtime.
`.meta({ id })` is plain Zod 4 and needs no patching. Use `.openapi()` only for the two cases the library
still requires (an extended schema rendered as `anyOf` of its parent; parameter-level `param` metadata),
and then call `extendZodWithOpenApi(z)` in a module every entry point imports before any schema file.

## Registering a resource — `projects`

```ts
  const security = [{ [bearer.name]: [] }];
  registry.registerPath({
    method: 'get',
    path: '/api/v1/projects',
    tags: ['projects'],
    security,
    request: { query: listProjectsQuerySchema },
    responses: {
      200: {
        description: "The caller's projects, newest first",
        ...json(projectPageResponseSchema),
      },
      401: problem('Not authenticated'),
      422: problem('Validation failed'),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/projects',
    tags: ['projects'],
    security,
    request: { body: json(createProjectBodySchema) },
    responses: {
      201: { description: 'Project created', ...json(projectResponseSchema) },
      401: problem('Not authenticated'),
      409: problem('Name already used by this owner'),
      422: problem('Validation failed'),
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/projects/{id}',
    tags: ['projects'],
    security,
    request: { params: uuidParamsSchema },
    responses: {
      200: { description: 'Project', ...json(projectResponseSchema) },
      404: problem('Not found or not visible to the caller'),
    },
  });
  registry.registerPath({
    method: 'patch',
    path: '/api/v1/projects/{id}',
    tags: ['projects'],
    security,
    request: { params: uuidParamsSchema, body: json(updateProjectBodySchema) },
    responses: {
      200: { description: 'Project updated', ...json(projectResponseSchema) },
      404: problem('Not found or not visible to the caller'),
      409: problem('Name already used by this owner'),
      422: problem('Validation failed'),
    },
  });
  registry.registerPath({
    method: 'delete',
    path: '/api/v1/projects/{id}',
    tags: ['projects'],
    security,
    request: { params: uuidParamsSchema },
    responses: {
      204: { description: 'Project deleted' },
      404: problem('Not found or not visible to the caller'),
    },
  });
```

Paths use OpenAPI `{id}` syntax. `request.params` / `request.query` take the same Zod objects `validate()` uses;
`request.body` and responses take `json(schema)`. A coerced query number is rendered as
`type: ["integer", "null"]` with its `default` — expected with `z.coerce` in this version.

## Test — `tests/unit/openapi/document.test.ts`

Extend `arrayContaining` with every new path and component name.

```ts
import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../../../src/openapi/document.js';

describe('buildOpenApiDocument', () => {
  it('documents every route with shared components', () => {
    const document = buildOpenApiDocument();
    expect(document.openapi).toBe('3.1.0');
    expect(Object.keys(document.paths ?? {})).toEqual(
      expect.arrayContaining([
        '/api/v1/auth/register',
        '/api/v1/auth/login',
        '/api/v1/auth/refresh',
        '/api/v1/auth/logout',
        '/api/v1/users/me',
        '/api/v1/users',
      ]),
    );
    expect(Object.keys(document.components?.schemas ?? {})).toEqual(
      expect.arrayContaining(['Problem', 'User', 'AuthResponse']),
    );
  });
});
```

## Serving

```ts
// src/app.ts — behind API_DOCS_ENABLED
if (env.API_DOCS_ENABLED) {
  const document = buildOpenApiDocument();
  app.get('/api-docs/openapi.json', (_req, res) => {
    res.json(document);
  });
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(document));
}
```

The document is built once at startup. Export it for clients with
`curl localhost:3000/api-docs/openapi.json > openapi.json` (or a small `tsx` script calling `buildOpenApiDocument()`).
