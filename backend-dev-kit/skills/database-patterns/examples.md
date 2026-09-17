# database-patterns examples

All snippets assume `db: Database | Tx` and tables from `express-feature`. Defer libraries to `rules/stack.mdc`.

## Keyset pagination

```ts
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { products } from "./product.table.js";

type Cursor = { createdAt: Date; id: string };

export async function listPaginated(
  db: Db,
  opts: { cursor?: Cursor; limit: number; isActive?: boolean },
) {
  const limit = Math.min(opts.limit, 100);
  const filters = [isNull(products.deletedAt)];
  if (opts.isActive !== undefined) filters.push(eq(products.isActive, opts.isActive));
  if (opts.cursor) {
    filters.push(
      or(
        lt(products.createdAt, opts.cursor.createdAt),
        and(eq(products.createdAt, opts.cursor.createdAt), lt(products.id, opts.cursor.id)),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(products)
    .where(and(...filters))
    .orderBy(desc(products.createdAt), desc(products.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? { createdAt: last.createdAt, id: last.id } : null,
  };
}
```

Encode `nextCursor` as base64 JSON in the router, not as concatenated SQL.

## Upsert

```ts
await db
  .insert(products)
  .values(data)
  .onConflictDoUpdate({
    target: products.sku,
    set: { name: data.name, price: data.price, updatedAt: new Date() },
  })
  .returning();
```

`target` must match a unique constraint / primary key.

## Soft delete

```ts
await db
  .update(products)
  .set({ deletedAt: new Date() })
  .where(and(eq(products.id, id), isNull(products.deletedAt)))
  .returning();
```

Every default `select` includes `isNull(products.deletedAt)`. Hard delete is a separate, explicit method.

## Optimistic locking

```ts
const [row] = await db
  .update(products)
  .set({ name: data.name, version: product.version + 1, updatedAt: new Date() })
  .where(and(eq(products.id, id), eq(products.version, product.version)))
  .returning();

if (!row) throw new ConflictError("stale product version");
```

Read `version` in the service, pass it into the update. Zero rows means a concurrent writer won.

## Bulk insert

```ts
await db.insert(products).values(rows).returning();
```

Chunk large batches (e.g. 500) rather than one multi-megabyte statement. Still run inside the service’s `db.transaction`.
