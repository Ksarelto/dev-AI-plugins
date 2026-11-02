import { parseEnv, type Env } from '../../src/config/env.js';

export const TEST_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';

export function testEnv(overrides: Record<string, string> = {}): Env {
  return parseEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgres://app:app@localhost:5433/agent',
    JWT_SECRET: TEST_JWT_SECRET,
    ...overrides,
  });
}
