---
name: drizzle-database
description: Model PostgreSQL tables with Drizzle ORM and postgres.js — pgTable schema, indexes, drizzle-kit generate and migrate, repositories taking a DbExecutor, TransactionRunner transactions, keyset cursor pagination, unique-violation handling, seeds. Use when adding a table, column, migration, query, transaction or paginated list.
---

# Drizzle database

## When to use

- New table or column, index, enum value, or data migration
- New repository method, a multi-statement write that needs a transaction, a paginated list
- Not for wiring a whole resource through every layer — `express-resource` skill

Hard constraints: `rules/database.mdc`, `rules/layered-architecture.mdc`. Code: [examples.md](examples.md). Migration workflow and multi-step changes: [references/migrations.md](references/migrations.md).

## Building blocks

| Piece | Where | Shape |
|---|---|---|
| Pool | `createDatabase({ url, maxConnections })` in `db/client.ts` | returns `{ db, ping, close }`; one per process |
| Types | `db/client.ts` | `Database`, `Transaction`, `DbExecutor = Database \| Transaction` |
| Transactions | `createTransactionRunner(db)` → `TransactionRunner` | `transaction(async (tx) => …)`; injected into services |
| Unique violation | `isUniqueViolation(error)` in `db/errors.ts` | SQLSTATE 23505, walks the `cause` chain |
| Cursor | `encodeCursor` / `decodeCursor` in `lib/cursor.ts` | base64url `{ createdAt, id }`; bad cursor → 400 `INVALID_CURSOR` |

## Procedure — table

1. `src/db/schema/<table>.ts`: `pgTable('<snake_plural>', { … }, (table) => [indexes])`.
   - `id: uuid('id').primaryKey().defaultRandom()`
   - FKs: `uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' | 'restrict' | 'set null' })`
   - Timestamps: `timestamp('created_at', { withTimezone: true }).notNull().defaultNow()`; `updatedAt` adds `.$onUpdate(() => new Date())`
   - Bounded text: `varchar('name', { length: 100 })`; free text: `text()`
   - Closed sets: `pgEnum('role', ROLES)` from an `as const` tuple
   - Indexes: every FK, every keyset (`(owner_id, created_at, id)`), `uniqueIndex` for business uniqueness
2. Export `<Entity>Row = typeof t.$inferSelect` and `New<Entity>Row = typeof t.$inferInsert`; re-export from `schema/index.ts`.
3. Generate, read, apply and commit the migration ([references/migrations.md](references/migrations.md)). If the integration helper truncates tables, add the new one to `reset()`.

## Procedure — repository

1. `create<Resource>Repository(db: Database)` returning an object of `async` methods; `export type <Resource>Repository = ReturnType<…>`.
2. Every method's last parameter is `executor: DbExecutor = db`, and every query starts from `executor`.
3. Single row: `const [row] = await executor.select().from(t).where(eq(t.id, id)).limit(1); return row;` (`| undefined`).
4. Insert/update: `.returning()`; an insert that returns nothing throws a plain `Error` (a bug, not a client error).
5. Conditional writes return `boolean` from `.returning({ id })` so the service can detect a lost race.
6. Lists: keyset `where`, `orderBy(desc(createdAt), desc(id))`, `.limit(limit + 1)`.
7. No business rules, no `AppError`, no `db.transaction` here.

## Procedure — service side

- Wrap multi-write operations in `transaction(async (tx) => …)` and pass `tx` to **every** repository call inside; do slow work (hashing, HTTP) before opening it.
- Map `isUniqueViolation(error)` → `ConflictError('…', '<WHAT>_TAKEN')`; rethrow anything else.
- Map rows to domain objects (`toUser(row)`) so secrets never leave the service.
- Paginate: `decodeCursor` → repository → `hasMore = rows.length > limit` → `encodeCursor` of the last item.

## Checklist

- [ ] uuid PK, `withTimezone` timestamps, FKs with `onDelete`, indexes for FKs and keyset order
- [ ] Row types exported; table re-exported from `schema/index.ts`
- [ ] Migration generated with `--name`, read, applied, committed with `drizzle/meta/`; no `push`, no edited old migration
- [ ] Repository methods take `executor: DbExecutor = db`; no business logic, no transactions
- [ ] Multi-write service methods use the injected `TransactionRunner` and pass `tx` everywhere
- [ ] Uniqueness enforced by the database and mapped to a coded 409
- [ ] Lists are keyset-paginated and bounded; the order matches an index
- [ ] Integration tests run against the migrated Testcontainers database; `reset()` truncates the new table
