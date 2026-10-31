# Security middleware — examples

Verbatim from `backend-boilerplate/` unless marked.

## Middleware order — `src/app.ts`

Order is part of the contract: request id and logging first, so every later failure is logged with its id; security headers and CORS before any body parsing; health before timeout and rate limits; error handler last.

```ts
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import type { Env } from './config/env.js';
import type { Container } from './container.js';
import type { Logger } from './lib/logger.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { createRateLimiter } from './middleware/rate-limit.js';
import { requestLogger } from './middleware/request-logger.js';
import { requestTimeout } from './middleware/timeout.js';
import { buildOpenApiDocument } from './openapi/document.js';
import { createApiRouter } from './routes/index.js';
import { createHealthRouter } from './routes/health.routes.js';

function parseTrustProxy(value: string): boolean | number | string {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const hops = Number(value);
  return Number.isInteger(hops) ? hops : value;
}

/**
 * Builds the Express app without listening, so tests drive it with supertest.
 * Order matters: logging → security headers → CORS → body → health → timeout →
 * rate limit → API → docs → 404 → error handler (last).
 */
export function createApp(env: Env, logger: Logger, container: Container): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', parseTrustProxy(env.TRUST_PROXY));

  app.use(requestLogger(logger));
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  app.use(createHealthRouter(container.controllers.health));

  app.use(requestTimeout(env.REQUEST_TIMEOUT_MS));
  app.use(
    '/api',
    createRateLimiter({ windowMs: env.RATE_LIMIT_WINDOW_MS, limit: env.RATE_LIMIT_MAX }),
  );
  app.use(
    '/api/v1',
    createApiRouter({
      controllers: container.controllers,
      authenticate: container.middleware.authenticate,
      authLimiter: createRateLimiter({
        windowMs: env.RATE_LIMIT_WINDOW_MS,
        limit: env.AUTH_RATE_LIMIT_MAX,
      }),
    }),
  );

  if (env.API_DOCS_ENABLED) {
    const document = buildOpenApiDocument();
    app.get('/api-docs/openapi.json', (_req, res) => {
      res.json(document);
    });
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(document));
  }

  app.use(notFound());
  app.use(errorHandler());
  return app;
}
```

## Rate limiter — `src/middleware/rate-limit.ts`

```ts
import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { TooManyRequestsError } from '../lib/errors.js';

export interface RateLimitOptions {
  windowMs: number;
  limit: number;
}

/**
 * In-memory limiter: correct for one instance. With several replicas, plug a shared store
 * (e.g. rate-limit-redis) into the same options.
 */
export function createRateLimiter(options: RateLimitOptions): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new TooManyRequestsError());
    },
  });
}
```

## Shared store for several replicas (adaptation)

`express-rate-limit` counts in memory per process. With more than one replica, give it a shared store. Example with `rate-limit-redis` (add the dependency and a Redis client first; not part of the boilerplate):

```ts
import { rateLimit, type Store } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

export function createRateLimiter(options: RateLimitOptions & { store?: Store }): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(options.store ? { store: options.store } : {}),
    handler: (_req, _res, next) => {
      next(new TooManyRequestsError());
    },
  });
}

// container / app: one store per limiter, each with its own prefix
new RedisStore({ sendCommand: (...args: string[]) => redis.sendCommand(args), prefix: 'rl:auth:' });
```

Check the current `rate-limit-redis` API with the `context7` MCP server before writing this; register the Redis client as a readiness check and a shutdown resource (`resilience` skill).

## Server timeouts — `src/server.ts`

```ts
import { createServer, type Server } from 'node:http';
import type { Express } from 'express';

export interface ServerOptions {
  host: string;
  port: number;
}

/** The only place that listens. Keep-alive is longer than typical LB idle timeouts to avoid 502s. */
export function startServer(app: Express, options: ServerOptions): Promise<Server> {
  const server = createServer(app);
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 120_000;
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}
```

## Request deadline — `src/middleware/timeout.ts`

```ts
import type { RequestHandler } from 'express';
import { ServiceUnavailableError } from '../lib/errors.js';

/**
 * Answers 503 when a handler runs longer than `ms`, so clients and proxies are not left
 * hanging. Handlers that call slow dependencies can pass `res.locals.signal` downstream
 * to stop work that nobody is waiting for anymore.
 */
export function requestTimeout(ms: number): RequestHandler {
  return (_req, res, next) => {
    const controller = new AbortController();
    res.locals.signal = controller.signal;
    const timer = setTimeout(() => {
      controller.abort();
      if (!res.headersSent) {
        next(new ServiceUnavailableError('The request timed out.', 'REQUEST_TIMEOUT', 1));
      }
    }, ms);
    timer.unref();
    const clear = () => {
      clearTimeout(timer);
    };
    res.once('finish', clear);
    res.once('close', () => {
      clear();
      if (!res.writableFinished) controller.abort();
    });
    next();
  };
}
```

## Asserting the edge in tests (from `tests/integration/health.test.ts`)

```ts
it('echoes a safe X-Request-Id and sets security headers', async () => {
  const res = await request(healthy.app).get('/health/live').set('x-request-id', 'trace-123');
  expect(res.headers['x-request-id']).toBe('trace-123');
  expect(res.headers['x-content-type-options']).toBe('nosniff');
  expect(res.headers).not.toHaveProperty('x-powered-by');
});
```

Add similar cases when you change the edge: a disallowed `Origin` gets no `access-control-allow-origin`; a 101 kB JSON body gets 413 `PAYLOAD_TOO_LARGE`; the `AUTH_RATE_LIMIT_MAX + 1`-th login gets 429 `RATE_LIMITED` (use `createTestApp({ env: { AUTH_RATE_LIMIT_MAX: '2' } })`).
