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

  /** Reported by GET /health/live when set (the image tag or release number). */
  SERVICE_VERSION: z.string().min(1).optional(),

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
