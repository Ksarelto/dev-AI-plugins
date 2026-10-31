import { existsSync } from 'node:fs';
import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value === '' ? undefined : value));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3100),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOG_PRETTY: booleanFromString.default(false),
  TRUST_PROXY: z.string().default('loopback'),

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  /** Access tokens are issued by the backend service; this service only verifies them. */
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ISSUER: z.string().min(1).default('backend-boilerplate'),
  JWT_AUDIENCE: z.string().min(1).default('backend-boilerplate-api'),

  /** Without a key the service still starts: chat answers 503 and readiness reports degraded. */
  OPENROUTER_API_KEY: optionalString,
  OPENROUTER_BASE_URL: z.url().default('https://openrouter.ai/api/v1'),
  APP_URL: z.url().default('http://localhost:3100'),
  APP_NAME: z.string().default('agent-boilerplate'),
  MODEL_CHAT: z.string().min(1).default('openai/gpt-4.1-mini'),
  MODEL_CHAT_FALLBACK: optionalString,
  MODEL_EMBED: z.string().min(1).default('openai/text-embedding-3-small'),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1536),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).default(2),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),

  AGENT_MAX_ITERATIONS: z.coerce.number().int().min(1).max(20).default(6),
  RETRIEVAL_TOP_K: z.coerce.number().int().min(1).max(20).default(5),
  GUARDRAIL_MODE: z.enum(['block', 'log']).default('block'),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  SHUTDOWN_DRAIN_DELAY_MS: z.coerce.number().int().min(0).default(0),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
});

export type Env = z.output<typeof envSchema>;

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
