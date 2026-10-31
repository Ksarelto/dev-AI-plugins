# Request validation — examples

`validate.ts`, `auth.schema.ts` and `user.schema.ts` are verbatim from `backend-boilerplate/`. `project.schema.ts` is the
verified `projects` slice from the `express-resource` skill.

## `src/middleware/validate.ts`

```ts
import type { RequestHandler, Response } from 'express';
import type { z } from 'zod';
import { ValidationError, type ValidationIssue } from '../lib/errors.js';

export interface ValidationSchemas {
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
}

export type Validated<S extends ValidationSchemas> = {
  [K in keyof S]: S[K] extends z.ZodType ? z.output<S[K]> : never;
};

const PARTS = ['params', 'query', 'body'] as const;

function toIssues(error: z.ZodError, part: string): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: [part, ...issue.path.map(String)].join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * Parses params, query and body at the edge and stores the typed result on `res.locals`.
 * Express 5 makes `req.query` read-only, so parsed values are read back with `validated()`.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, res, next) => {
    const issues: ValidationIssue[] = [];
    const parsed: Partial<Record<(typeof PARTS)[number], unknown>> = {};
    for (const part of PARTS) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (result.success) parsed[part] = result.data;
      else issues.push(...toIssues(result.error, part));
    }
    if (issues.length > 0) {
      next(new ValidationError(issues));
      return;
    }
    res.locals.validated = parsed;
    next();
  };
}

/** Typed access to what `validate(schemas)` parsed for this request. */
export function validated<S extends ValidationSchemas>(res: Response, _schemas: S): Validated<S> {
  return res.locals.validated as Validated<S>;
}
```

## Body schemas — `src/schemas/auth.schema.ts`

Shared field schemas as constants, `.strict()` objects, a request object per route, a response schema with `.meta({ id })` and a mapper.

```ts
import { z } from 'zod';
import type { ValidationSchemas } from '../middleware/validate.js';
import type { AuthResult } from '../services/auth.service.js';
import { toUserResponse, userResponseSchema } from './user.schema.js';

const email = z.email().max(320);
/** Length over composition rules (NIST 800-63B); the upper bound caps hashing cost. */
const password = z.string().min(12).max(128);

export const registerBodySchema = z
  .object({ email, password, displayName: z.string().trim().min(1).max(100) })
  .strict();
export const loginBodySchema = z.object({ email, password: z.string().min(1).max(128) }).strict();
export const refreshBodySchema = z.object({ refreshToken: z.string().min(1).max(512) }).strict();

export const registerRequest = { body: registerBodySchema } satisfies ValidationSchemas;
export const loginRequest = { body: loginBodySchema } satisfies ValidationSchemas;
export const refreshRequest = { body: refreshBodySchema } satisfies ValidationSchemas;

export const authResponseSchema = z
  .object({
    user: userResponseSchema,
    accessToken: z.string(),
    refreshToken: z.string(),
    tokenType: z.literal('Bearer'),
    expiresIn: z.number().int(),
  })
  .meta({ id: 'AuthResponse' });

export function toAuthResponse(result: AuthResult): z.infer<typeof authResponseSchema> {
  return { user: toUserResponse(result.user), ...result.tokens };
}
```

## Query schema and response DTO — `src/schemas/user.schema.ts`

```ts
import { z } from 'zod';
import type { ValidationSchemas } from '../middleware/validate.js';
import type { Page, User } from '../services/users.service.js';

/** Response DTO. Dates are ISO strings on the wire. */
export const userResponseSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    displayName: z.string(),
    role: z.enum(['user', 'admin']),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'User' });
export type UserResponse = z.infer<typeof userResponseSchema>;

export const userPageResponseSchema = z.object({
  items: z.array(userResponseSchema),
  nextCursor: z.string().nullable(),
});

export const listUsersRequest = {
  query: z
    .object({
      limit: z.coerce.number().int().min(1).max(100).default(20),
      cursor: z.string().min(1).max(512).optional(),
    })
    .strict(),
} satisfies ValidationSchemas;

export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toUserPageResponse(page: Page<User>): z.infer<typeof userPageResponseSchema> {
  return { items: page.items.map(toUserResponse), nextCursor: page.nextCursor };
}
```

## Params, PATCH and combined parts — `src/schemas/project.schema.ts`

```ts
import { z } from 'zod';
import type { ValidationSchemas } from '../middleware/validate.js';
import type { Project } from '../services/projects.service.js';
import type { Page } from '../services/users.service.js';
import { uuidParamsSchema } from './common.schema.js';

const name = z.string().trim().min(1).max(100);
const description = z.string().trim().max(2_000).nullable();

export const createProjectBodySchema = z
  .object({ name, description: description.optional() })
  .strict()
  .meta({ id: 'CreateProjectBody' });

export const updateProjectBodySchema = z
  .object({ name: name.optional(), description: description.optional() })
  .strict()
  .refine((body) => Object.keys(body).length > 0, { error: 'Provide at least one field.' })
  .meta({ id: 'UpdateProjectBody' });

export const listProjectsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().min(1).max(512).optional(),
  })
  .strict();

export const createProjectRequest = { body: createProjectBodySchema } satisfies ValidationSchemas;
export const listProjectsRequest = { query: listProjectsQuerySchema } satisfies ValidationSchemas;
export const projectIdRequest = { params: uuidParamsSchema } satisfies ValidationSchemas;
export const updateProjectRequest = {
  params: uuidParamsSchema,
  body: updateProjectBodySchema,
} satisfies ValidationSchemas;

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
export type ProjectResponse = z.infer<typeof projectResponseSchema>;

export const projectPageResponseSchema = z
  .object({ items: z.array(projectResponseSchema), nextCursor: z.string().nullable() })
  .meta({ id: 'ProjectPage' });

export function toProjectResponse(project: Project): ProjectResponse {
  return {
    id: project.id,
    ownerId: project.ownerId,
    name: project.name,
    description: project.description,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export function toProjectPageResponse(
  page: Page<Project>,
): z.infer<typeof projectPageResponseSchema> {
  return { items: page.items.map(toProjectResponse), nextCursor: page.nextCursor };
}
```

## Reading validated input in a controller

```ts
import type { RequestHandler } from 'express';
import { requirePrincipal } from '../middleware/authenticate.js';
import { validated } from '../middleware/validate.js';
import {
  createProjectRequest,
  listProjectsRequest,
  projectIdRequest,
  toProjectPageResponse,
  toProjectResponse,
  updateProjectRequest,
} from '../schemas/project.schema.js';
import type { ProjectsService } from '../services/projects.service.js';

export function createProjectsController(projects: ProjectsService) {
  const list: RequestHandler = async (_req, res) => {
    const { query } = validated(res, listProjectsRequest);
    res.json(toProjectPageResponse(await projects.listMine(requirePrincipal(res), query)));
  };

  const create: RequestHandler = async (_req, res) => {
    const { body } = validated(res, createProjectRequest);
    const project = await projects.create(requirePrincipal(res), body);
    res.status(201).json(toProjectResponse(project));
  };

  const get: RequestHandler = async (_req, res) => {
    const { params } = validated(res, projectIdRequest);
    res.json(toProjectResponse(await projects.get(requirePrincipal(res), params.id)));
  };

  const update: RequestHandler = async (_req, res) => {
    const { params, body } = validated(res, updateProjectRequest);
    res.json(toProjectResponse(await projects.update(requirePrincipal(res), params.id, body)));
  };

  const remove: RequestHandler = async (_req, res) => {
    const { params } = validated(res, projectIdRequest);
    await projects.remove(requirePrincipal(res), params.id);
    res.status(204).end();
  };

  return { list, create, get, update, remove };
}

export type ProjectsController = ReturnType<typeof createProjectsController>;
```

Router side: `router.patch('/:id', validate(updateProjectRequest), controller.update);`

## Bad / good

```ts
// Bad: Express 4 habit of replacing req.query with parsed values.
// In Express 5 req.query is a getter without a setter, so this assignment throws in ESM (strict mode).
const list: RequestHandler = async (req, res) => {
  req.query = listUsersRequest.query.parse(req.query) as never;
  res.json(await users.list(req.query as never));
};

// Good: validate() parsed and coerced it; validated() returns the typed output
const list: RequestHandler = async (_req, res) => {
  const { query } = validated(res, listUsersRequest);
  res.json(toUserPageResponse(await users.list(query)));
};
```

```ts
// Bad: Zod 3 string chains, no bounds, unknown keys silently accepted
z.object({ email: z.string().email(), name: z.string() });

// Good: Zod 4 top-level formats, bounds, strict
z.object({ email: z.email().max(320), name: z.string().trim().min(1).max(100) }).strict();
```

## Zod 4 cheat sheet for this stack

| Need | Zod 4 |
|---|---|
| uuid / email / url | `z.uuid()`, `z.email()`, `z.url({ protocol: /^postgres(ql)?$/ })` |
| ISO timestamp string | `z.iso.datetime()` (`{ offset: true }` to accept offsets other than `Z`) |
| Number from a query string | `z.coerce.number().int().min(1).max(100).default(20)` |
| Boolean from a string | `z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' \|\| v === '1')` — never `z.coerce.boolean()` (`'false'` → `true`) |
| Closed set | `z.enum(ROLES)` with `ROLES` an `as const` tuple |
| Custom message | `{ error: '...' }` (the v3 `message` key is deprecated) |
| Cross-field rule | `.refine(fn, { error, path: ['endsAt'] })` |
| Field errors for logs | `z.flattenError(error).fieldErrors` |
| Output type | `z.output<typeof schema>` / `z.infer<typeof schema>` |
| OpenAPI component name | `.meta({ id: 'Project' })` (`openapi-docs` skill) |

## Environment — `src/config/env.ts` (excerpt)

```ts
export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const fields = z.flattenError(result.error).fieldErrors;
    throw new Error(`Invalid environment variables: ${JSON.stringify(fields)}`);
  }
  return result.data;
}
```

A new variable is added to `envSchema` with a type, bound and default (or none, if it is required), to `.env.example`, and to `tests/helpers/env.ts` only if it is required.
