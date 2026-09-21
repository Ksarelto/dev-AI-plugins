# redis-backplane examples

## Client (`src/db/redis.ts`)

```ts
import { createClient } from "redis";
import { env } from "../config/env.js";

export const redis = createClient({ url: env.REDIS_URL });
export const redisReady = redis.connect();
```

## Cache-aside (service)

```ts
const key = `book:v1:${id}`;
const hit = await redis.get(key);
if (hit) return BookRead.parse(JSON.parse(hit));
const row = await repo.findById(db, id);
if (!row) throw new BookNotFoundError(id);
const read = BookRead.parse(row);
await redis.set(key, JSON.stringify(read), { expiration: { type: "EX", value: 300 } });
return read;

// on write, same service method:
await redis.del(`book:v1:${id}`);
```

(`SET` with `{ EX: 300 }` is also valid on older `redis` clients.)

## Rate limit

```ts
import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../../db/redis.js";

export const authTokenLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.sendCommand(args),
  }),
});
```

Mount: `router.post("/token", authTokenLimiter, validate({ body: TokenBody }), handler)`.

## BullMQ

Queue in `src/queues/due-soon.ts`; worker in `src/workers/due-soon.ts`.

```ts
import { Queue, Worker } from "bullmq";

const connection = { url: env.REDIS_URL };
export const dueSoonQueue = new Queue("loan.due-soon", { connection });

export function startDueSoonWorker() {
  return new Worker(
    "loan.due-soon",
    async (job) => {
      const loan = await loans.get(job.data.loanId);
      logger.info({ loanId: loan.id }, "due-soon.email");
    },
    { connection, attempts: 5, backoff: { type: "exponential", delay: 1000 } },
  );
}
```

Enqueue from the **service** after commit: `await dueSoonQueue.add("notify", { loanId: row.id })`.

## Compose

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: library
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
```

## `/readyz`

```ts
app.get("/readyz", async (_req, res) => {
  await db.execute(sql`select 1`);
  await redis.ping();
  res.json({ status: "ready" });
});
```

## Tests

Use `@testcontainers/redis` `RedisContainer` next to Postgres in `tests/setup.ts`. Set `REDIS_URL` from `container.getConnectionUrl()`. Unit tests may inject a fake `{ get, set, del }`.
