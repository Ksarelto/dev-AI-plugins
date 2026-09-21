# scaffold-service examples

Copy as ESM TypeScript. Pin versions at scaffold time from current npm, not from this file.

## package.json (minimum)

```json
{
  "name": "api-service",
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "lint": "eslint src tests",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  },
  "dependencies": {
    "@asteasolutions/zod-to-openapi": "^7",
    "argon2": "^0.41",
    "drizzle-orm": "^0.44",
    "express": "^5",
    "jose": "^6",
    "pino": "^9",
    "postgres": "^3",
    "zod": "^3"
  },
  "devDependencies": {
    "@testcontainers/postgresql": "^11",
    "@types/express": "^5",
    "@types/node": "^22",
    "@types/supertest": "^6",
    "drizzle-kit": "^0.31",
    "supertest": "^7",
    "tsx": "^4",
    "typescript": "^5",
    "typescript-eslint": "^8",
    "vitest": "^3"
  }
}
```

Add `bullmq`, `redis`, `express-rate-limit`, `@opentelemetry/sdk-node`, `swagger-ui-express` when those concerns are in the architecture.

## .env.example

```
APP_ENV=dev
APP_PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/app
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-me
```

## src/config/env.ts

```ts
import { z } from "zod";

const Env = z
  .object({
    APP_ENV: z.enum(["dev", "staging", "prod"]).default("dev"),
    APP_PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().optional(),
    JWT_SECRET: z.string().min(16),
  })
  .strict();

export const env = Env.parse(process.env);
```

## src/db/client.ts

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../config/env.js";
import * as schema from "./tables/index.js";

export const sql = postgres(env.DATABASE_URL, { max: 10 });
export const db = drizzle(sql, { schema });
export type Database = typeof db;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
```

## src/http/create-app.ts

```ts
import express from "express";
import { requestId } from "./middleware/request-id.js";
import { errorHandler } from "./middleware/error-handler.js";
import { composeV1 } from "./compose.js";
import { db } from "../db/client.js";
import { sql } from "drizzle-orm";

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(requestId);

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/readyz", async (_req, res) => {
    await db.execute(sql`select 1`);
    res.json({ status: "ready" });
  });

  app.use("/api/v1", composeV1());
  app.get("/openapi.json", (_req, res) => {
    res.json(buildDocument());
  });
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(undefined, { swaggerOptions: { url: "/openapi.json" } }));
  app.use(errorHandler);
  return app;
}
```

## src/http/compose.ts

```ts
import { Router } from "express";

export function composeV1() {
  return Router();
}
```

## src/http/server.ts

```ts
import { createApp } from "./create-app.js";
import { env } from "../config/env.js";
import { sql } from "../db/client.js";
import { redis } from "../db/redis.js";
import { logger } from "../observability/logger.js";

export function start() {
  const app = createApp();
  const server = app.listen(env.APP_PORT, () => {
    logger.info({ port: env.APP_PORT }, "listening");
  });

  const shutdown = () => {
    server.close(async () => {
      await sql.end({ timeout: 5 });
      await redis.quit();
      process.exit(0);
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
```

## src/index.ts

```ts
import "./observability/tracing.js";
import { start } from "./http/server.js";

start();
```

## src/db/migrate.ts

Applying committed SQL (as in a first `drizzle/0000_init.sql`) is valid: read the file and
`postgres().unsafe(sql)`. Prefer `drizzle-kit migrate` once the journal exists. Never run
`drizzle-kit push` in production.

## drizzle.config.ts

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/tables/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

## src/observability/logger.ts

```ts
import pino from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.APP_ENV === "prod" ? "info" : "debug",
  ...(env.APP_ENV === "dev" ? { transport: { target: "pino-pretty" } } : {}),
});
```

## src/observability/tracing.ts

```ts
import { env } from "../config/env.js";

if (env.APP_ENV !== "dev") {
  // Load @opentelemetry/sdk-node + OTLP exporter in staging/prod only.
  // Dev: no-op so local runs do not require a collector.
}
```

## src/db/redis.ts

See the `redis-backplane` skill. Scaffold a client stub from `env.REDIS_URL`.

## docker-compose.yml

See the `redis-backplane` skill (`postgres:16-alpine` + `redis:7-alpine`).
