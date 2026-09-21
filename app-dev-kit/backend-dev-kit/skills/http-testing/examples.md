# http-testing examples

## `tests/setup.ts` (globalSetup)

```ts
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export async function setup() {
  const container = await new PostgreSqlContainer("postgres:16-alpine").start();
  process.env.DATABASE_URL = container.getConnectionUri();
  process.env.JWT_SECRET = "test-secret-test-secret";
  process.env.APP_ENV = "dev";

  const client = postgres(process.env.DATABASE_URL, { max: 1 });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  await client.end();

  return async () => {
    await container.stop();
  };
}
```

## Factory

```ts
import { products } from "../../src/db/tables/products.js";
import type { Database } from "../../src/db/client.js";

export async function createProduct(db: Database, overrides: Record<string, unknown> = {}) {
  const [row] = await db
    .insert(products)
    .values({
      sku: `SKU-${crypto.randomUUID()}`,
      name: "Widget",
      price: "9.99",
      category: "tools",
      ...overrides,
    })
    .returning();
  return row;
}
```

## Router integration

```ts
import request from "supertest";
import { createApp } from "../../../src/http/create-app.js";

const app = createApp();

it("creates a product", async () => {
  const res = await request(app)
    .post("/api/v1/products")
    .set("Authorization", `Bearer ${token}`)
    .send({ sku: "SKU-1", name: "Widget", price: "9.99", category: "tools" });

  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ sku: "SKU-1", name: "Widget" });
});

it("rejects unknown fields", async () => {
  const res = await request(app)
    .post("/api/v1/products")
    .send({ sku: "SKU-1", name: "Widget", price: "9.99", category: "tools", extra: true });
  expect(res.status).toBe(422);
});
```

## Service unit

```ts
import { describe, expect, it, vi } from "vitest";
import { ProductNotFoundError } from "../../../src/services/products.errors.js";

it("raises ProductNotFoundError", async () => {
  const repo = { findById: vi.fn().mockResolvedValue(null) };
  const service = createProductServiceWithRepo(repo);
  await expect(service.get("00000000-0000-0000-0000-000000000001")).rejects.toBeInstanceOf(
    ProductNotFoundError,
  );
});
```

`createProductServiceWithRepo` is a test-only factory if the production factory always builds the real repo — prefer injecting the repo in `createProductService(db, repo = createProductRepository())`.
