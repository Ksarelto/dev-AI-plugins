---
name: database-patterns
description: Drizzle ORM patterns for common data access — keyset pagination, filtering, bulk operations, upsert, soft delete, and optimistic locking with a version column.
---

# Database patterns

## When to use

Implementing repository methods, optimizing queries, or adding pagination / upsert / soft delete / optimistic lock. Not for wiring a new HTTP resource — that is `express-feature`.

Defer client setup and transaction ownership to `rules/drizzle.mdc`.

## Procedure

| Need | Pattern |
|------|---------|
| Large lists | Keyset: `orderBy(desc(createdAt), desc(id))` plus `(createdAt, id) < cursor` |
| Small admin lists | Offset with `limit`/`offset`, still cap `pageSize` at 100 |
| Idempotent write | `insert().onConflictDoUpdate({ target, set })` |
| Recoverable delete | `deletedAt` timestamp; default selects add `isNull(deletedAt)` |
| Concurrent updates | `version` column; `update … where id and version`; 0 rows → `ConflictError` |
| Filters | `and(eq, isNull, …)` from an allow-list — never interpolate client SQL |

Always: bound parameters only; unique constraints in the table; map `23505` in the **service**; service owns `db.transaction`.

## Checklist

- [ ] Cursor is opaque (base64 of `{ createdAt, id }`), not a raw SQL fragment
- [ ] Soft-deleted rows excluded from default `find`/`list`
- [ ] Upsert target is a real unique constraint
- [ ] Optimistic lock bumps `version` on success
- [ ] Indexes exist for the `where`/`orderBy` pair (including keyset)

## References

- [examples.md](./examples.md) — pagination, upsert, soft delete, versioned update
