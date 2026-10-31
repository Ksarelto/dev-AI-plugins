# Express resource — worked example: `projects`

A `projects` resource owned by a user: `GET/POST /api/v1/projects`, `GET/PATCH/DELETE /api/v1/projects/:id`.
Owners see their own projects, admins see all, anyone else gets 404. A name is unique per owner.

This slice was applied to a copy of `backend-boilerplate` and verified: `tsc --noEmit`, ESLint
strictTypeChecked, dependency-cruiser, 41 unit and 18 integration tests. Copy the shapes, rename the nouns.

## 1. Table — `src/db/schema/projects.ts`

Then append `export * from './projects.js';` to `src/db/schema/index.ts`.

```ts
import { index, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    /** One name per owner; the service maps the violation to 409 PROJECT_NAME_TAKEN. */
    uniqueIndex('projects_owner_id_name_idx').on(table.ownerId, table.name),
    /** Keyset pagination of one owner's projects, newest first. */
    index('projects_owner_id_created_at_id_idx').on(table.ownerId, table.createdAt, table.id),
  ],
);

export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;
```

## 2. Migration — `npm run db:generate -- --name projects`

drizzle-kit writes `drizzle/0001_projects.sql` and updates `drizzle/meta/`. Read it, run `npm run db:migrate`, commit both. Expected output:

```sql
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_owner_id_name_idx" ON "projects" USING btree ("owner_id","name");--> statement-breakpoint
CREATE INDEX "projects_owner_id_created_at_id_idx" ON "projects" USING btree ("owner_id","created_at","id");
```

## 3. Repository — `src/repositories/projects.repository.ts`

```ts
import { and, desc, eq, lt, or } from 'drizzle-orm';
import type { Database, DbExecutor } from '../db/client.js';
import { projects, type NewProjectRow, type ProjectRow } from '../db/schema/index.js';

export interface ProjectPageQuery {
  ownerId: string;
  limit: number;
  after?: { createdAt: Date; id: string } | undefined;
}

export type ProjectChanges = Partial<Pick<NewProjectRow, 'name' | 'description'>>;

export function createProjectsRepository(db: Database) {
  return {
    async findById(id: string, executor: DbExecutor = db): Promise<ProjectRow | undefined> {
      const [row] = await executor.select().from(projects).where(eq(projects.id, id)).limit(1);
      return row;
    },

    async create(values: NewProjectRow, executor: DbExecutor = db): Promise<ProjectRow> {
      const [row] = await executor.insert(projects).values(values).returning();
      if (!row) throw new Error('insert into projects returned no row');
      return row;
    },

    async update(
      id: string,
      changes: ProjectChanges,
      executor: DbExecutor = db,
    ): Promise<ProjectRow | undefined> {
      const [row] = await executor
        .update(projects)
        .set(changes)
        .where(eq(projects.id, id))
        .returning();
      return row;
    },

    async delete(id: string, executor: DbExecutor = db): Promise<boolean> {
      const rows = await executor
        .delete(projects)
        .where(eq(projects.id, id))
        .returning({ id: projects.id });
      return rows.length === 1;
    },

    /** Keyset pagination within one owner, newest first; fetches one extra row. */
    async listPageByOwner(
      query: ProjectPageQuery,
      executor: DbExecutor = db,
    ): Promise<ProjectRow[]> {
      const { ownerId, after } = query;
      return executor
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.ownerId, ownerId),
            after
              ? or(
                  lt(projects.createdAt, after.createdAt),
                  and(eq(projects.createdAt, after.createdAt), lt(projects.id, after.id)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(projects.createdAt), desc(projects.id))
        .limit(query.limit + 1);
    },
  };
}

export type ProjectsRepository = ReturnType<typeof createProjectsRepository>;
```

## 4. Service — `src/services/projects.service.ts`

`Page<T>` is exported by `users.service.ts` in the boilerplate. When a third resource paginates, move it to `src/lib/` (e.g. `lib/pagination.ts`) instead of importing it from a sibling service.

```ts
import type { ProjectRow } from '../db/schema/index.js';
import { isUniqueViolation } from '../db/errors.js';
import { decodeCursor, encodeCursor } from '../lib/cursor.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import type { Principal } from '../lib/jwt.js';
import type { ProjectsRepository } from '../repositories/projects.repository.js';
import type { Page } from './users.service.js';

export interface Project {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectInput {
  name: string;
  description?: string | null | undefined;
}

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface ProjectsServiceDeps {
  projects: ProjectsRepository;
}

const notFound = () => new NotFoundError('Project not found.', 'PROJECT_NOT_FOUND');
const nameTaken = () =>
  new ConflictError('You already have a project with this name.', 'PROJECT_NAME_TAKEN');

/** Rethrows a unique violation as 409, everything else unchanged. */
function mapWriteError(error: unknown): never {
  if (isUniqueViolation(error)) throw nameTaken();
  throw error;
}

export function createProjectsService({ projects }: ProjectsServiceDeps) {
  /** Owners see their projects, admins see all; anyone else gets 404 so ids do not leak. */
  async function getVisible(actor: Principal, id: string): Promise<ProjectRow> {
    const row = await projects.findById(id);
    if (!row) throw notFound();
    if (row.ownerId !== actor.userId && !actor.roles.includes('admin')) throw notFound();
    return row;
  }

  return {
    async create(actor: Principal, input: ProjectInput): Promise<Project> {
      try {
        const row = await projects.create({
          ownerId: actor.userId,
          name: input.name,
          description: input.description ?? null,
        });
        return toProject(row);
      } catch (error) {
        return mapWriteError(error);
      }
    },

    async get(actor: Principal, id: string): Promise<Project> {
      return toProject(await getVisible(actor, id));
    },

    async listMine(
      actor: Principal,
      query: { limit: number; cursor?: string | undefined },
    ): Promise<Page<Project>> {
      const after = query.cursor ? decodeCursor(query.cursor) : undefined;
      const rows = await projects.listPageByOwner({
        ownerId: actor.userId,
        limit: query.limit,
        after,
      });
      const items = rows.slice(0, query.limit).map(toProject);
      const last = items.at(-1);
      return {
        items,
        nextCursor:
          rows.length > query.limit && last
            ? encodeCursor({ createdAt: last.createdAt, id: last.id })
            : null,
      };
    },

    async update(actor: Principal, id: string, changes: Partial<ProjectInput>): Promise<Project> {
      await getVisible(actor, id);
      try {
        const row = await projects.update(id, changes);
        if (!row) throw notFound();
        return toProject(row);
      } catch (error) {
        return mapWriteError(error);
      }
    },

    async remove(actor: Principal, id: string): Promise<void> {
      await getVisible(actor, id);
      await projects.delete(id);
    },
  };
}

export type ProjectsService = ReturnType<typeof createProjectsService>;
```

## 5. Schemas and DTO — `src/schemas/project.schema.ts`

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

## 6. Controller — `src/controllers/projects.controller.ts`

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

## 7. Router — `src/routes/projects.routes.ts`

```ts
import { Router, type RequestHandler } from 'express';
import type { ProjectsController } from '../controllers/projects.controller.js';
import { validate } from '../middleware/validate.js';
import {
  createProjectRequest,
  listProjectsRequest,
  projectIdRequest,
  updateProjectRequest,
} from '../schemas/project.schema.js';

export function createProjectsRouter(
  controller: ProjectsController,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  router.use(authenticate);
  router.get('/', validate(listProjectsRequest), controller.list);
  router.post('/', validate(createProjectRequest), controller.create);
  router.get('/:id', validate(projectIdRequest), controller.get);
  router.patch('/:id', validate(updateProjectRequest), controller.update);
  router.delete('/:id', validate(projectIdRequest), controller.remove);
  return router;
}
```

## 8. Mount — `src/routes/index.ts`

```ts
import { Router, type RequestHandler } from 'express';
import type { AuthController } from '../controllers/auth.controller.js';
import type { ProjectsController } from '../controllers/projects.controller.js';
import type { UsersController } from '../controllers/users.controller.js';
import { createAuthRouter } from './auth.routes.js';
import { createProjectsRouter } from './projects.routes.js';
import { createUsersRouter } from './users.routes.js';

export interface ApiRouterDeps {
  controllers: { auth: AuthController; users: UsersController; projects: ProjectsController };
  authenticate: RequestHandler;
  authLimiter: RequestHandler;
}

/** Every versioned resource is mounted here, and only here. */
export function createApiRouter({ controllers, authenticate, authLimiter }: ApiRouterDeps): Router {
  const router = Router();
  router.use('/auth', createAuthRouter(controllers.auth, authLimiter));
  router.use('/users', createUsersRouter(controllers.users, authenticate));
  router.use('/projects', createProjectsRouter(controllers.projects, authenticate));
  return router;
}
```

## 9. Wire — `src/container.ts`

Only these lines are new; the rest is the boilerplate container.

```ts
import { createProjectsController } from './controllers/projects.controller.js';
import { createProjectsRepository } from './repositories/projects.repository.js';
import { createProjectsService } from './services/projects.service.js';

// inside createContainer(env, database, options), after usersService:
const projectsService = createProjectsService({
  projects: createProjectsRepository(database.db),
});

// in the returned object:
controllers: {
  auth: createAuthController(authService),
  users: createUsersController(usersService),
  projects: createProjectsController(projectsService),
  health: createHealthController(health, lifecycle),
},
```

When a service needs transactions, also pass `transaction: createTransactionRunner(database.db)`, as
`createAuthService` does.

## 10. OpenAPI — inside `buildOpenApiDocument()` in `src/openapi/document.ts`

Import `uuidParamsSchema` from `../schemas/common.schema.js` and the project schemas from `../schemas/project.schema.js`. Paths use `{id}`, not `:id`.

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

## 11. Tests

The in-memory repository, the service unit test and the supertest integration test for this slice
are in [references/tests.md](references/tests.md).

## Verify

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run test:integration
```
