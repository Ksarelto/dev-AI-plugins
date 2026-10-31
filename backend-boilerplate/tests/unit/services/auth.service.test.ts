import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, UnauthorizedError } from '../../../src/lib/errors.js';
import { createJwtService } from '../../../src/lib/jwt.js';
import { createAuthService, type AuthService } from '../../../src/services/auth.service.js';
import { TEST_JWT_SECRET } from '../../helpers/env.js';
import { createInMemoryRepositories } from '../../helpers/in-memory-repositories.js';

const jwt = createJwtService({
  secret: TEST_JWT_SECRET,
  issuer: 'test',
  audience: 'test-api',
  accessTokenTtlSeconds: 60,
});
const credentials = {
  email: 'Ada@Example.com',
  password: 'correct-horse-battery',
  displayName: 'Ada',
};

describe('AuthService', () => {
  let auth: AuthService;
  let repos: ReturnType<typeof createInMemoryRepositories>;

  beforeEach(() => {
    repos = createInMemoryRepositories();
    auth = createAuthService({ ...repos, jwt, refreshTokenTtlDays: 30 });
  });

  it('registers a user with a normalised email and a hashed password', async () => {
    const { user, tokens } = await auth.register(credentials);
    expect(user.email).toBe('ada@example.com');
    expect(repos.userRows.get(user.id)?.passwordHash).not.toBe(credentials.password);
    await expect(jwt.verifyAccessToken(tokens.accessToken)).resolves.toMatchObject({
      userId: user.id,
      roles: ['user'],
    });
  });

  it('refuses a duplicate email with EMAIL_TAKEN', async () => {
    await auth.register(credentials);
    await expect(auth.register(credentials)).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
    await expect(auth.register(credentials)).rejects.toBeInstanceOf(ConflictError);
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    await auth.register(credentials);
    const wrongPassword = auth.login({ email: credentials.email, password: 'wrong-password-123' });
    const unknownEmail = auth.login({ email: 'nobody@example.com', password: 'whatever-123456' });
    await expect(wrongPassword).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(unknownEmail).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('rotates the refresh token on every use', async () => {
    const { tokens } = await auth.register(credentials);
    const rotated = await auth.refresh(tokens.refreshToken);
    expect(rotated.tokens.refreshToken).not.toBe(tokens.refreshToken);
  });

  it('revokes the whole family when a rotated token is reused', async () => {
    const { tokens } = await auth.register(credentials);
    const rotated = await auth.refresh(tokens.refreshToken);

    await expect(auth.refresh(tokens.refreshToken)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_REUSED',
    });
    // The legitimate newest token is now dead too: the attacker and the victim must log in again.
    await expect(auth.refresh(rotated.tokens.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('rejects an expired refresh token', async () => {
    let now = new Date('2026-01-01T00:00:00Z');
    auth = createAuthService({ ...repos, jwt, refreshTokenTtlDays: 1, now: () => now });
    const { tokens } = await auth.register(credentials);
    now = new Date('2026-01-03T00:00:00Z');
    await expect(auth.refresh(tokens.refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('logs out idempotently', async () => {
    const { tokens } = await auth.register(credentials);
    await auth.logout(tokens.refreshToken);
    await auth.logout(tokens.refreshToken);
    await expect(auth.refresh(tokens.refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
