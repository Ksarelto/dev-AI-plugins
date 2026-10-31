# Drizzle database — examples

Verbatim from `backend-boilerplate/` unless marked. A complete new table → repository → service slice
is the `projects` example in the `express-resource` skill.

## Pool and types — `src/db/client.ts`

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export interface DatabaseOptions {
  url: string;
  maxConnections?: number;
}

/** One pool per process. Every repository receives `db` (or a transaction) from the composition root. */
export function createDatabase(options: DatabaseOptions) {
  const sql = postgres(options.url, {
    max: options.maxConnections ?? 10,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => undefined,
  });
  const db = drizzle({ client: sql, schema });

  return {
    db,
    ping: async (): Promise<void> => {
      await sql`select 1`;
    },
    close: async (): Promise<void> => {
      await sql.end({ timeout: 5 });
    },
  };
}

export type DatabaseHandle = ReturnType<typeof createDatabase>;
export type Database = DatabaseHandle['db'];
/** A transaction handle has the same query API as `db`. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Repositories accept either, so services decide the transaction boundary. */
export type DbExecutor = Database | Transaction;
```

## Transactions — `src/db/transaction.ts`

```ts
import type { Database, Transaction } from './client.js';

/** Services own transaction boundaries through this runner; tests swap in a pass-through. */
export type TransactionRunner = <T>(work: (tx: Transaction) => Promise<T>) => Promise<T>;

export function createTransactionRunner(db: Database): TransactionRunner {
  return (work) => db.transaction(work);
}
```

## Using a transaction in a service (from `src/services/auth.service.ts`)

```ts
export interface AuthServiceDeps {
  users: UsersRepository;
  refreshTokens: RefreshTokensRepository;
  transaction: TransactionRunner;
  // ...
}

async register(input: { email: string; password: string; displayName: string }): Promise<AuthResult> {
  const passwordHash = await hashPassword(input.password); // slow work outside the transaction
  try {
    return await transaction(async (tx) => {
      const row = await users.create(
        { email: input.email.toLowerCase(), passwordHash, displayName: input.displayName },
        tx,
      );
      const user = toUser(row);
      return { user, tokens: await issueTokens(user, randomUUID(), tx) };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError('An account with this email already exists.', 'EMAIL_TAKEN');
    }
    throw error;
  }
},
```

Wire it in `container.ts`: `transaction: createTransactionRunner(database.db)`. Unit tests pass a
pass-through runner: `const transaction: TransactionRunner = (work) => work({} as Transaction);`.

## Race-safe conditional write (from `refresh-tokens.repository.ts`)

```ts
/** Marks the token revoked only if it still is active; returns false if another request won the race. */
async revoke(id: string, executor: DbExecutor = db): Promise<boolean> {
  const rows = await executor
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });
  return rows.length === 1;
},
```

## Keyset pagination — repository (`users.repository.ts`)

```ts
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
```

Backed by `index('users_created_at_id_idx').on(table.createdAt, table.id)`. A per-owner list puts the
owner column first: `index('projects_owner_id_created_at_id_idx').on(table.ownerId, table.createdAt, table.id)`.

## Keyset pagination — service (`users.service.ts`)

```ts
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
```

## Cursor — `src/lib/cursor.ts`

```ts
import { z } from 'zod';
import { BadRequestError } from './errors.js';

const keysetSchema = z.object({ createdAt: z.iso.datetime(), id: z.uuid() });

export interface Keyset {
  createdAt: Date;
  id: string;
}

/** Opaque, URL-safe pagination cursor. Clients must not parse it. */
export function encodeCursor(keyset: Keyset): string {
  const payload = { createdAt: keyset.createdAt.toISOString(), id: keyset.id };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeCursor(cursor: string): Keyset {
  try {
    const parsed = keysetSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
    );
    return { createdAt: new Date(parsed.createdAt), id: parsed.id };
  } catch {
    throw new BadRequestError('The pagination cursor is invalid.', 'INVALID_CURSOR');
  }
}
```

## Table with FK, unique and index — `src/db/schema/refresh-tokens.ts`

```ts
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** All tokens issued from one login share a family; reuse of a rotated token revokes the family. */
    familyId: uuid('family_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('refresh_tokens_user_id_idx').on(table.userId),
    index('refresh_tokens_family_id_idx').on(table.familyId),
  ],
);

export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
export type NewRefreshTokenRow = typeof refreshTokens.$inferInsert;
```

## `drizzle.config.ts`

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://app:app@localhost:5432/app',
  },
  strict: true,
  verbose: true,
});
```

## Migration runner — `src/db/migrate.ts`

```ts
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { loadEnv } from '../config/env.js';
import { createLogger } from '../lib/logger.js';
import { createDatabase } from './client.js';

/** Applies committed SQL migrations from ./drizzle. Run before the API starts (compose `migrate` service). */
const env = loadEnv();
const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.LOG_PRETTY, name: 'migrate' });
const database = createDatabase({ url: env.DATABASE_URL, maxConnections: 1 });

try {
  await migrate(database.db, { migrationsFolder: 'drizzle' });
  logger.info('migrations applied');
} catch (error) {
  logger.error({ err: error }, 'migration failed');
  process.exitCode = 1;
} finally {
  await database.close();
}
```

## Idempotent seed — `src/db/seed.ts`

```ts
import { z } from 'zod';
import { loadEnv } from '../config/env.js';
import { createLogger } from '../lib/logger.js';
import { hashPassword } from '../lib/password.js';
import { createDatabase } from './client.js';
import { users } from './schema/index.js';

/** Development seed: one admin user, idempotent. */
const env = loadEnv();
const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.LOG_PRETTY, name: 'seed' });
const seed = z
  .object({ SEED_ADMIN_EMAIL: z.email(), SEED_ADMIN_PASSWORD: z.string().min(12) })
  .parse(process.env);
const database = createDatabase({ url: env.DATABASE_URL, maxConnections: 1 });

try {
  await database.db
    .insert(users)
    .values({
      email: seed.SEED_ADMIN_EMAIL.toLowerCase(),
      passwordHash: await hashPassword(seed.SEED_ADMIN_PASSWORD),
      displayName: 'Administrator',
      role: 'admin',
    })
    .onConflictDoNothing({ target: users.email });
  logger.info({ email: seed.SEED_ADMIN_EMAIL }, 'admin user ensured');
} catch (error) {
  logger.error({ err: error }, 'seed failed');
  process.exitCode = 1;
} finally {
  await database.close();
}
```
