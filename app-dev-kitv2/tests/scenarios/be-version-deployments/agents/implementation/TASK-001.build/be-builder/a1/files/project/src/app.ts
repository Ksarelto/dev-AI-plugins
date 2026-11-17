import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { errorHandler, notFound } from './api/http/error-mapper.js';
import { authenticate } from './api/http/middlewares/authenticate.js';
import { createRateLimiter } from './api/http/middlewares/rate-limit.js';
import { requestLogger } from './api/http/middlewares/request-logger.js';
import { requestTimeout } from './api/http/middlewares/timeout.js';
import { buildOpenApiDocument } from './api/http/openapi/document.js';
import { createApiRouter } from './api/http/router.js';
import { createAuthController } from './api/http/v1/auth/auth.controller.js';
import { createHealthController } from './api/http/v1/health/health.controller.js';
import { createHealthRouter } from './api/http/v1/health/health.routes.js';
import { createUsersController } from './api/http/v1/users/users.controller.js';
import type { Env } from './config/env.js';
import type { Composition } from './composition/index.js';
import type { Logger } from './core/logger.js';

const parseTrustProxy = (value: string): boolean | number | string => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const hops = Number(value);
  return Number.isInteger(hops) ? hops : value;
};

/**
 * Builds the Express app without listening, so tests drive it with supertest.
 * Order matters: logging → security headers → CORS → body → health → timeout →
 * rate limit → API → docs → 404 → error handler (last).
 */
export const createApp = (env: Env, logger: Logger, composition: Composition): Express => {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', parseTrustProxy(env.TRUST_PROXY));

  app.use(requestLogger(logger));
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  app.use(createHealthRouter(createHealthController(composition.health, composition.lifecycle, env.SERVICE_VERSION)));

  app.use(requestTimeout(env.REQUEST_TIMEOUT_MS));
  app.use(
    '/api',
    createRateLimiter({ windowMs: env.RATE_LIMIT_WINDOW_MS, limit: env.RATE_LIMIT_MAX }),
  );
  app.use(
    '/api/v1',
    createApiRouter({
      auth: createAuthController(composition),
      users: createUsersController(composition),
      authenticate: authenticate(composition.jwt),
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
};
