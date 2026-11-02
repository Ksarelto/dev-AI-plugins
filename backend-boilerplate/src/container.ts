import type { Env } from './config/env.js';
import { createAuthController } from './controllers/auth.controller.js';
import { createHealthController } from './controllers/health.controller.js';
import { createUsersController } from './controllers/users.controller.js';
import type { DatabaseHandle } from './db/client.js';
import { createTransactionRunner } from './db/transaction.js';
import { createHealthRegistry, type HealthCheck } from './lib/health.js';
import { createResilientHttpClient } from './lib/http-client.js';
import { createJwtService } from './lib/jwt.js';
import { createLifecycle, type Lifecycle } from './lib/lifecycle.js';
import { authenticate } from './middleware/authenticate.js';
import { createRefreshTokensRepository } from './repositories/refresh-tokens.repository.js';
import { createUsersRepository } from './repositories/users.repository.js';
import { createAuthService } from './services/auth.service.js';
import { createUsersService } from './services/users.service.js';

export interface ContainerOptions {
  /** Extra readiness checks (tests use this to simulate a failing optional dependency). */
  extraHealthChecks?: HealthCheck[];
  lifecycle?: Lifecycle;
}

/**
 * Composition root: the only place that knows concrete implementations.
 * Plain factory functions, no DI container. Every layer receives what it needs as arguments.
 */
export function createContainer(
  env: Env,
  database: DatabaseHandle,
  options: ContainerOptions = {},
) {
  const lifecycle = options.lifecycle ?? createLifecycle();
  const jwt = createJwtService({
    secret: env.JWT_SECRET,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
  });

  const usersRepository = createUsersRepository(database.db);
  const refreshTokensRepository = createRefreshTokensRepository(database.db);

  const authService = createAuthService({
    users: usersRepository,
    refreshTokens: refreshTokensRepository,
    transaction: createTransactionRunner(database.db),
    jwt,
    refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
  });
  const usersService = createUsersService({ users: usersRepository });

  const healthChecks: HealthCheck[] = [{ name: 'postgres', critical: true, check: database.ping }];
  if (env.UPSTREAM_HEALTH_URL) {
    const upstream = createResilientHttpClient({
      name: 'upstream',
      baseUrl: env.UPSTREAM_HEALTH_URL,
      retries: 0,
    });
    healthChecks.push({
      name: 'upstream',
      critical: false,
      check: async () => {
        await upstream.get('');
      },
    });
  }
  healthChecks.push(...(options.extraHealthChecks ?? []));
  const health = createHealthRegistry(healthChecks);

  return {
    lifecycle,
    health,
    controllers: {
      auth: createAuthController(authService),
      users: createUsersController(usersService),
      health: createHealthController(health, lifecycle),
    },
    middleware: { authenticate: authenticate(jwt) },
  };
}

export type Container = ReturnType<typeof createContainer>;
