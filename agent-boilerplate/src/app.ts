import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Env } from './config/env.js';
import type { Container } from './container.js';
import type { Logger } from './lib/logger.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { createRateLimiter } from './middleware/rate-limit.js';
import { requestLogger } from './middleware/request-logger.js';
import { requestTimeout } from './middleware/timeout.js';
import { createApiRouter } from './routes/index.js';
import { createHealthRouter } from './routes/health.routes.js';

function parseTrustProxy(value: string): boolean | number | string {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const hops = Number(value);
  return Number.isInteger(hops) ? hops : value;
}

/** Same middleware order as backend-boilerplate. Model calls are expensive, so the rate limit is tighter. */
export function createApp(env: Env, logger: Logger, container: Container): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', parseTrustProxy(env.TRUST_PROXY));

  app.use(requestLogger(logger));
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

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
    }),
  );

  app.use(notFound());
  app.use(errorHandler());
  return app;
}
