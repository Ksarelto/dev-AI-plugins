# The `users` slice

Verbatim from `backend-boilerplate/`. The reference slice every new resource copies (`express-resource` skill).
The auth half (register, login, refresh, logout) is in the `auth-rbac` skill.

## `src/db/schema/users.ts`

```ts
import { index, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { ROLES } from '../../lib/jwt.js';

export const roleEnum = pgEnum('role', ROLES);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Stored lower-cased by the service, so the unique constraint is case-insensitive in practice. */
    email: varchar('email', { length: 320 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    displayName: varchar('display_name', { length: 100 }).notNull(),
    role: roleEnum('role').notNull().default('user'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  /** Supports keyset pagination (newest first). */
  (table) => [index('users_created_at_id_idx').on(table.createdAt, table.id)],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
```

## `src/db/schema/index.ts`

```ts
export * from './users.js';
export * from './refresh-tokens.js';
```

## `src/repositories/users.repository.ts`

```ts
import { and, desc, eq, lt, or } from 'drizzle-orm';
import type { Database, DbExecutor } from '../db/client.js';
import { users, type NewUserRow, type UserRow } from '../db/schema/index.js';

export interface UserPageQuery {
  limit: number;
  after?: { createdAt: Date; id: string } | undefined;
}

/** Data access only: no business rules, no HTTP, no error mapping. */
export function createUsersRepository(db: Database) {
  return {
    async findById(id: string, executor: DbExecutor = db): Promise<UserRow | undefined> {
      const [row] = await executor.select().from(users).where(eq(users.id, id)).limit(1);
      return row;
    },

    async findByEmail(email: string, executor: DbExecutor = db): Promise<UserRow | undefined> {
      const [row] = await executor.select().from(users).where(eq(users.email, email)).limit(1);
      return row;
    },

    async create(values: NewUserRow, executor: DbExecutor = db): Promise<UserRow> {
      const [row] = await executor.insert(users).values(values).returning();
      if (!row) throw new Error('insert into users returned no row');
      return row;
    },

    /** Keyset pagination, newest first. Fetches one extra row to know whether a next page exists. */
    async listPage(query: UserPageQuery, executor: DbExecutor = db): Promise<UserRow[]> {
      const after = query.after;
      return executor
        .select()
        .from(users)
        .where(
          after
            ? or(
                lt(users.createdAt, after.createdAt),
                and(eq(users.createdAt, after.createdAt), lt(users.id, after.id)),
              )
            : undefined,
        )
        .orderBy(desc(users.createdAt), desc(users.id))
        .limit(query.limit + 1);
    },
  };
}

export type UsersRepository = ReturnType<typeof createUsersRepository>;
```

## `src/services/users.service.ts`

```ts
import type { UserRow } from '../db/schema/index.js';
import { decodeCursor, encodeCursor } from '../lib/cursor.js';
import { NotFoundError } from '../lib/errors.js';
import type { Role } from '../lib/jwt.js';
import type { UsersRepository } from '../repositories/users.repository.js';

/** The domain view of a user. The password hash never leaves the service layer. */
export interface User {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  createdAt: Date;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    createdAt: row.createdAt,
  };
}

export interface UsersServiceDeps {
  users: UsersRepository;
}

export function createUsersService({ users }: UsersServiceDeps) {
  return {
    async getById(id: string): Promise<User> {
      const row = await users.findById(id);
      if (!row) throw new NotFoundError('User not found.', 'USER_NOT_FOUND');
      return toUser(row);
    },

    async list(query: { limit: number; cursor?: string | undefined }): Promise<Page<User>> {
      const after = query.cursor ? decodeCursor(query.cursor) : undefined;
      const rows = await users.listPage({ limit: query.limit, after });
      const hasMore = rows.length > query.limit;
      const items = rows.slice(0, query.limit).map(toUser);
      const last = items.at(-1);
      return {
        items,
        nextCursor:
          hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
      };
    },
  };
}

export type UsersService = ReturnType<typeof createUsersService>;
```

## `src/schemas/user.schema.ts`

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

## `src/schemas/common.schema.ts`

```ts
import { z } from 'zod';

export const problemSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    detail: z.string(),
    code: z.string(),
    instance: z.string().optional(),
    errors: z
      .array(z.object({ path: z.string(), message: z.string(), code: z.string() }))
      .optional(),
  })
  .meta({ id: 'Problem' });

export const uuidParamsSchema = z.object({ id: z.uuid() }).strict();
```

## `src/controllers/users.controller.ts`

```ts
import type { RequestHandler } from 'express';
import { requirePrincipal } from '../middleware/authenticate.js';
import { validated } from '../middleware/validate.js';
import { listUsersRequest, toUserPageResponse, toUserResponse } from '../schemas/user.schema.js';
import type { UsersService } from '../services/users.service.js';

export function createUsersController(users: UsersService) {
  const me: RequestHandler = async (_req, res) => {
    const principal = requirePrincipal(res);
    res.json(toUserResponse(await users.getById(principal.userId)));
  };

  const list: RequestHandler = async (_req, res) => {
    const { query } = validated(res, listUsersRequest);
    res.json(toUserPageResponse(await users.list(query)));
  };

  return { me, list };
}

export type UsersController = ReturnType<typeof createUsersController>;
```

## `src/routes/users.routes.ts`

```ts
import { Router, type RequestHandler } from 'express';
import type { UsersController } from '../controllers/users.controller.js';
import { requireRole } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { listUsersRequest } from '../schemas/user.schema.js';

export function createUsersRouter(
  controller: UsersController,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  router.use(authenticate);
  router.get('/me', controller.me);
  router.get('/', requireRole('admin'), validate(listUsersRequest), controller.list);
  return router;
}
```

## `src/routes/index.ts`

```ts
import { Router, type RequestHandler } from 'express';
import type { AuthController } from '../controllers/auth.controller.js';
import type { UsersController } from '../controllers/users.controller.js';
import { createAuthRouter } from './auth.routes.js';
import { createUsersRouter } from './users.routes.js';

export interface ApiRouterDeps {
  controllers: { auth: AuthController; users: UsersController };
  authenticate: RequestHandler;
  authLimiter: RequestHandler;
}

/** Every versioned resource is mounted here, and only here. */
export function createApiRouter({ controllers, authenticate, authLimiter }: ApiRouterDeps): Router {
  const router = Router();
  router.use('/auth', createAuthRouter(controllers.auth, authLimiter));
  router.use('/users', createUsersRouter(controllers.users, authenticate));
  return router;
}
```

## `drizzle/0000_init.sql`

Generated by `npm run db:generate`; never hand-written. Commit it with `drizzle/meta/_journal.json` and `drizzle/meta/0000_snapshot.json` (regenerate the snapshot by running `npm run db:generate` on an empty `drizzle/` folder rather than copying it).

```sql
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"role" "role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_created_at_id_idx" ON "users" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens" USING btree ("family_id");
```
