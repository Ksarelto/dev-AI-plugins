# Core files

Verbatim from `backend-boilerplate/`. These are the bootstrap and tooling files that no other skill owns.
Rename `backend-boilerplate` per the table in `SKILL.md` after copying.

## `package.json`

```json
{
  "name": "backend-boilerplate",
  "version": "0.1.0",
  "private": true,
  "description": "Layered Node.js + Express 5 + TypeScript API starter: Postgres (Drizzle), JWT + RBAC, pino, RFC 7807 errors, graceful degradation, Docker, Vitest + Testcontainers.",
  "type": "module",
  "engines": {
    "node": ">=22.12"
  },
  "scripts": {
    "dev": "docker compose up -d db && tsx watch src/index.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . && depcruise src --config .dependency-cruiser.cjs",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:unit": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "test:coverage": "vitest run --coverage",
    "db:up": "docker compose up -d db",
    "db:down": "docker compose down",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:seed": "tsx src/db/seed.ts",
    "docker:up": "docker compose --profile app up --build -d",
    "docker:down": "docker compose --profile app down"
  },
  "dependencies": {
    "@asteasolutions/zod-to-openapi": "^9.1.0",
    "@node-rs/argon2": "^2.2.2",
    "cors": "^2.8.6",
    "drizzle-orm": "^0.45.4",
    "express": "^5.3.0",
    "express-rate-limit": "^8.7.2",
    "helmet": "^8.3.0",
    "jose": "^6.2.14",
    "pino": "^10.4.0",
    "pino-http": "^11.0.0",
    "postgres": "^3.4.9",
    "swagger-ui-express": "^5.0.1",
    "zod": "^4.6.7"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.5",
    "@testcontainers/postgresql": "^12.2.1",
    "@types/cors": "^2.8.19",
    "@types/express": "^5.0.6",
    "@types/node": "^22.20.5",
    "@types/supertest": "^7.2.1",
    "@types/swagger-ui-express": "^4.1.8",
    "@vitest/coverage-v8": "^5.0.5",
    "dependency-cruiser": "^17.4.3",
    "drizzle-kit": "^0.31.11",
    "eslint": "^9.39.5",
    "pino-pretty": "^13.2.0",
    "prettier": "^3.9.10",
    "supertest": "^7.3.1",
    "tsx": "^4.23.15",
    "typescript": "~5.9.3",
    "typescript-eslint": "^8.72.1",
    "vitest": "^5.0.5"
  }
}
```

## `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "outDir": "dist"
  },
  "include": ["src", "tests", "vitest.config.ts", "drizzle.config.ts"]
}
```

## `tsconfig.build.json`

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "noEmit": false
  },
  "include": ["src"]
}
```

## `eslint.config.js`

```js
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/', 'coverage/', 'drizzle/', 'node_modules/'] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-console': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { arguments: false } },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.js', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { module: 'readonly', require: 'readonly' } },
  },
  {
    // supertest types `res.body` as any; assertions on it are the point of the test.
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
);
```

## `.prettierrc.json`, `.nvmrc`, `.gitignore`, `.prettierignore`

`.prettierrc.json` is shown; `.nvmrc` contains `22`; `.gitignore` ignores `node_modules/`, `dist/`, `coverage/`, `.env`, `.env.*` (except `!.env.example`), `*.log`, `.DS_Store`; `.prettierignore` lists `dist`, `coverage`, `drizzle`, `package-lock.json`.

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

## `.env.example`

```bash
# Copy to .env for local development. Never commit real secrets.
NODE_ENV=development
HOST=0.0.0.0
PORT=3000
LOG_LEVEL=debug
LOG_PRETTY=true
TRUST_PROXY=loopback

# Matches the `db` service in docker-compose.yml (npm run db:up)
DATABASE_URL=postgres://app:app@localhost:5432/app
DATABASE_POOL_MAX=10

# At least 32 characters. Generate with: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
JWT_SECRET=dev-only-secret-change-me-0123456789abcdef
JWT_ISSUER=backend-boilerplate
JWT_AUDIENCE=backend-boilerplate-api
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_DAYS=30

CORS_ORIGINS=http://localhost:5173
REQUEST_TIMEOUT_MS=15000
SHUTDOWN_TIMEOUT_MS=10000
SHUTDOWN_DRAIN_DELAY_MS=0
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=300
AUTH_RATE_LIMIT_MAX=20
API_DOCS_ENABLED=true

# Optional dependency: when set, /health/ready probes it as a non-critical check (degraded, not down)
UPSTREAM_HEALTH_URL=

# Used only by `npm run db:seed`
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=ChangeMe-Admin-123
```

## `src/config/env.ts`

```ts
import { existsSync } from 'node:fs';
import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOG_PRETTY: booleanFromString.default(false),
  TRUST_PROXY: z.string().default('loopback'),

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ISSUER: z.string().min(1).default('backend-boilerplate'),
  JWT_AUDIENCE: z.string().min(1).default('backend-boilerplate-api'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  SHUTDOWN_DRAIN_DELAY_MS: z.coerce.number().int().min(0).default(0),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  API_DOCS_ENABLED: booleanFromString.default(true),

  UPSTREAM_HEALTH_URL: z
    .union([z.url(), z.literal('')])
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
});

export type Env = z.output<typeof envSchema>;

/** Loads `.env` for local runs only; containers and CI pass real environment variables. */
function loadDotEnv(): void {
  if (
    process.env.NODE_ENV !== 'test' &&
    process.env.NODE_ENV !== 'production' &&
    existsSync('.env')
  ) {
    process.loadEnvFile('.env');
  }
}

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const fields = z.flattenError(result.error).fieldErrors;
    throw new Error(`Invalid environment variables: ${JSON.stringify(fields)}`);
  }
  return result.data;
}

export function loadEnv(): Env {
  loadDotEnv();
  return parseEnv(process.env);
}
```

## `src/index.ts` — bootstrap

```ts
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createContainer } from './container.js';
import { createDatabase } from './db/client.js';
import { createLogger } from './lib/logger.js';
import { registerGracefulShutdown } from './lib/shutdown.js';
import { startServer } from './server.js';

const env = loadEnv();
const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.LOG_PRETTY });
const database = createDatabase({ url: env.DATABASE_URL, maxConnections: env.DATABASE_POOL_MAX });

// Start even if Postgres is still coming up: readiness stays 503 until it answers.
await database.ping().catch((error: unknown) => {
  logger.warn({ err: error }, 'database not reachable yet; readiness will report down');
});

const container = createContainer(env, database);
const app = createApp(env, logger, container);
const server = await startServer(app, { host: env.HOST, port: env.PORT });

registerGracefulShutdown({
  server,
  logger,
  lifecycle: container.lifecycle,
  timeoutMs: env.SHUTDOWN_TIMEOUT_MS,
  drainDelayMs: env.SHUTDOWN_DRAIN_DELAY_MS,
  resources: [{ name: 'postgres', close: database.close }],
});

logger.info({ host: env.HOST, port: env.PORT, env: env.NODE_ENV }, 'server listening');
```

## `src/server.ts` — the only listener

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

## `src/app.ts` — middleware order

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

## `src/container.ts` — composition root

```ts
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
```
