import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../../src/config/env.js';

const valid = {
  DATABASE_URL: 'postgres://app:app@localhost:5432/app',
  JWT_SECRET: 'a-secret-that-is-at-least-32-characters',
};

describe('parseEnv', () => {
  it('applies defaults to a minimal environment', () => {
    const env = parseEnv(valid);
    expect(env).toMatchObject({
      PORT: 3000,
      NODE_ENV: 'development',
      CORS_ORIGINS: ['http://localhost:5173'],
    });
  });

  it('fails fast on a short JWT secret', () => {
    expect(() => parseEnv({ ...valid, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('fails fast on a non-postgres database URL', () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: 'mysql://localhost/app' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('treats an empty optional URL as unset', () => {
    expect(parseEnv({ ...valid, UPSTREAM_HEALTH_URL: '' }).UPSTREAM_HEALTH_URL).toBeUndefined();
  });
});
