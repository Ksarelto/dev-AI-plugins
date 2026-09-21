# File ownership

The `scaffold-service` skill writes this tree. Do not invent a parallel layout. Layers are folders.

```
package.json  tsconfig.json  drizzle.config.ts  docker-compose.yml  eslint.config.js  vitest.config.ts  .env.example
src/config/env.ts
src/db/client.ts
src/db/redis.ts
src/db/tables/index.ts              # sibling re-exports only
src/http/create-app.ts
src/http/server.ts
src/http/compose.ts                 # composition root
src/http/openapi.ts
src/http/middleware/{request-id,validate,auth,rate-limit,error-handler}.ts
src/http/routers/                   # empty until express-feature / auth-jwt
src/services/
src/repositories/
src/schemas/
src/queues/                         # BullMQ Queue; redis-backplane
src/workers/                        # BullMQ Worker
src/errors/app-error.ts
src/observability/{logger,tracing}.ts
src/index.ts
drizzle/
tests/{setup.ts,factories/,integration/,unit/}
```

| Path | Owns | Must not |
|------|------|----------|
| `src/config/env.ts` | Validated env | Be read as raw `process.env` at call sites |
| `src/db/client.ts` | The one Drizzle + postgres.js pool | A second pool “for this query” |
| `src/db/redis.ts` | The one official `redis` client | `ioredis` as the cache client |
| `src/db/tables/` | Table definitions | Import services or routers |
| `src/db/tables/index.ts` | drizzle-kit graph of sibling tables | Re-export from another folder |
| `src/repositories/` | SQL | `db.transaction`, Express |
| `src/services/` | Domain rules, transactions | `express`, `res.*` |
| `src/schemas/` | Zod contracts | Drizzle |
| `src/http/create-app.ts` | Middleware, health, `/api/v1`, `/docs` | Call `listen` |
| `src/http/openapi.ts` | Zod OpenAPI registry + every path | A hand-written `openapi.yaml`; registration inside routers |
| `src/http/server.ts` | Bind port and graceful shutdown | Contain route handlers |
| `src/http/compose.ts` | Construct services; mount routers | Business logic or Drizzle queries |
| `src/http/routers/` | HTTP in, JSON out | Repositories, tables, `UserService` |
| `src/http/middleware/` | Cross-cutting HTTP | Domain rules |
| `src/queues/` | Queue instances | HTTP handlers |
| `src/workers/` | BullMQ processors | Extra HTTP listeners; Drizzle rows as payloads |
| `src/errors/` | Shared `AppError` hierarchy | HTTP mapping (that is `error-handler.ts`) |
| `src/observability/` | Logger and tracer | Log secrets or tokens |

No `src/modules/`. No barrel `index.ts` except `src/db/tables/index.ts`.

Do not add Python packages, Prisma, NestJS, Fastify, or Hono.
