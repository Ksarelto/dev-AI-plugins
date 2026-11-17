---
name: drizzle-database
description: Model PostgreSQL tables with Drizzle ORM and postgres.js — pgTable schema, indexes, drizzle-kit generate and migrate, repositories that read the unit of work, transactions, keyset cursor pagination, unique-violation handling, seeds. Use when adding a table, column, migration, query, transaction or paginated list.
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
| Pool | `createDatabase({ url, maxConnections })` in `infra/db/client.ts` | returns `{ db, ping, close }`; one per process |
| Unit of work | `infra/db/unit-of-work.ts` | `current()` is the ambient client or the pool; `transaction()` joins or opens |
| Unique violation | `isUniqueViolation(error)` in `infra/db/errors.ts` | SQLSTATE 23505, walks the `cause` chain |
| Cursor | `encodeCursor` / `decodeCursor` in `shared/pagination/cursor.ts` | base64url `{ createdAt, id }`; bad cursor → 400 `INVALID_CURSOR` |

## Procedure — table

1. `src/infra/db/schema/<table>.ts`: `pgTable('<snake_plural>', { … }, (table) => [indexes])`.
   - `id: uuid('id').primaryKey().defaultRandom()`
   - FKs: `uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' | 'restrict' | 'set null' })`
   - Timestamps: `timestamp('created_at', { withTimezone: true }).notNull().defaultNow()`; `updatedAt` adds `.$onUpdate(() => new Date())`
   - Bounded text: `varchar('name', { length: 100 })`; free text: `text()`
   - Closed sets: `pgEnum('role', ROLES)` from an `as const` tuple
   - Indexes: every FK, every keyset (`(owner_id, created_at, id)`), `uniqueIndex` for business uniqueness
2. Export `<Entity>Row = typeof t.$inferSelect` and `New<Entity>Row = typeof t.$inferInsert`; re-export from `schema/index.ts`.
3. Generate, read, apply and commit the migration ([references/migrations.md](references/migrations.md)). If the integration helper truncates tables, add the new one to `reset()`.

## Procedure — repository

1. `create<Resource>Repository(unitOfWork)` returning an object of arrow methods. It is not exported from the domain `index.ts`.
2. Every query uses `unitOfWork.current()`. No `tx` parameter.
3. Single row: `const [row] = await unitOfWork.current().select()...limit(1); return row;` (`| undefined`).
4. Insert/update: `.returning()`; an insert that returns nothing throws a plain `Error` (a bug, not a client error).
5. Conditional writes return `boolean` from `.returning({ id })` so the scenario can detect a lost race.
6. Lists live in `queries/`: keyset `where`, `orderBy(desc(createdAt), desc(id))`, `.limit(limit + 1)`.
7. No business rules and no `db.transaction` here. A unique violation becomes the domain error.

## Procedure — service side

- The owning scenario calls `deps.tx.transaction(async () => …)`. Nested scenarios join it. Do slow work (hashing, HTTP) before opening it.
- The repository maps `isUniqueViolation(error)` to the domain error and rethrows anything else.
- Map rows to domain objects so a password hash never leaves the domain.
- Paginate in the query: `decodeCursor` → select → `hasMore = rows.length > limit` → `encodeCursor` of the last item.

## Checklist

- [ ] uuid PK, `withTimezone` timestamps, FKs with `onDelete`, indexes for FKs and keyset order
- [ ] Row types exported; table re-exported from `schema/index.ts`
- [ ] Migration generated with `--name`, read, applied, committed with `drizzle/meta/`; no `push`, no edited old migration
- [ ] Repository methods take no `tx` and read the unit of work; no business logic, no transactions
- [ ] Multi-write scenarios open `deps.tx.transaction()` once; nested work joins it
- [ ] Uniqueness enforced by the database and mapped to a coded 409
- [ ] Lists are keyset-paginated and bounded; the order matches an index
- [ ] Integration tests run against the migrated Testcontainers database; `reset()` truncates the new table
