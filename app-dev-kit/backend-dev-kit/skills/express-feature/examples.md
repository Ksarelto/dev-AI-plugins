# express-feature examples

Products CRUD. Defer libraries to `rules/stack.mdc`. Layers are folders.

## Table (`src/db/tables/products.ts`)

```ts
import { pgTable, uuid, varchar, boolean, timestamp, numeric } from "drizzle-orm/pg-core";

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  sku: varchar("sku", { length: 64 }).notNull().unique(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

`src/db/tables/index.ts`: `export { products } from "./products.js";`

## Schemas (`src/schemas/products.ts`)

```ts
import { z } from "zod";

export const ProductCreate = z
  .object({
    name: z.string().min(1).max(255),
    sku: z.string().min(1).max(64),
    price: z.string().refine((v) => Number(v) > 0, "Price must be positive"),
    category: z.string().min(1).max(64),
  })
  .strict();

export const ProductUpdate = ProductCreate.partial().strict();

export const ProductRead = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    sku: z.string(),
    price: z.string(),
    category: z.string(),
    isActive: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();

export type ProductCreate = z.infer<typeof ProductCreate>;
export type ProductUpdate = z.infer<typeof ProductUpdate>;
export type ProductRead = z.infer<typeof ProductRead>;
```

## Errors (`src/services/products.errors.ts`)

```ts
import { NotFoundError, ConflictError } from "../errors/app-error.js";

export class ProductNotFoundError extends NotFoundError {
  constructor(id: string) {
    super(`Product ${id} not found`);
  }
}

export class ProductSkuTakenError extends ConflictError {
  constructor(sku: string) {
    super(`SKU ${sku} already exists`);
  }
}
```

## Repository (`src/repositories/products.ts`)

```ts
import { desc, eq } from "drizzle-orm";
import type { Database, Tx } from "../db/client.js";
import { products } from "../db/tables/products.js";

type Db = Database | Tx;

export type ProductInsert = {
  name: string;
  sku: string;
  price: string;
  category: string;
};

export function createProductRepository() {
  return {
    async findById(db: Db, id: string) {
      const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1);
      return row ?? null;
    },
    async list(db: Db) {
      return db.select().from(products).orderBy(desc(products.createdAt));
    },
    async insert(db: Db, data: ProductInsert) {
      const [row] = await db.insert(products).values(data).returning();
      return row;
    },
    async update(db: Db, id: string, data: Partial<ProductInsert>) {
      const [row] = await db.update(products).set(data).where(eq(products.id, id)).returning();
      return row ?? null;
    },
    async remove(db: Db, id: string) {
      const [row] = await db.delete(products).where(eq(products.id, id)).returning();
      return row ?? null;
    },
  };
}
```

## Service (`src/services/products.ts`)

```ts
import type { Database } from "../db/client.js";
import { ProductCreate, ProductRead, ProductUpdate } from "../schemas/products.js";
import { createProductRepository } from "../repositories/products.js";
import { ProductNotFoundError, ProductSkuTakenError } from "./products.errors.js";

export function createProductService(db: Database) {
  const repo = createProductRepository();
  return {
    async create(data: ProductCreate) {
      try {
        const row = await db.transaction((tx) => repo.insert(tx, data));
        return ProductRead.parse(row);
      } catch (err) {
        if (isUniqueViolation(err)) throw new ProductSkuTakenError(data.sku);
        throw err;
      }
    },
    async get(id: string) {
      const row = await repo.findById(db, id);
      if (!row) throw new ProductNotFoundError(id);
      return ProductRead.parse(row);
    },
    async update(id: string, data: ProductUpdate) {
      const row = await db.transaction((tx) => repo.update(tx, id, data));
      if (!row) throw new ProductNotFoundError(id);
      return ProductRead.parse(row);
    },
    async delete(id: string) {
      const row = await db.transaction((tx) => repo.remove(tx, id));
      if (!row) throw new ProductNotFoundError(id);
    },
  };
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("code" in err)) return false;
  return err.code === "23505";
}
```

## Router (`src/http/routers/products.ts`)

```ts
import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { ProductCreate, ProductUpdate } from "../../schemas/products.js";
import type { createProductService } from "../../services/products.js";

export function createProductRouter(service: ReturnType<typeof createProductService>) {
  const router = Router();

  router.post("/", validate({ body: ProductCreate }), async (req, res) => {
    const product = await service.create(req.body);
    res.status(201).json(product);
  });

  router.get("/:id", async (req, res) => {
    res.json(await service.get(String(req.params.id)));
  });

  router.patch("/:id", validate({ body: ProductUpdate }), async (req, res) => {
    res.json(await service.update(String(req.params.id), req.body));
  });

  router.delete("/:id", async (req, res) => {
    await service.delete(String(req.params.id));
    res.status(204).end();
  });

  return router;
}
```

Register in `src/http/compose.ts`: `router.use("/products", createProductRouter(createProductService(db)));`

Register schemas and paths in `src/http/openapi.ts`, not in the router.
