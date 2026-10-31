import { randomUUID } from 'node:crypto';
import { isUniqueViolation } from '../db/errors.js';
import type { DbExecutor } from '../db/client.js';
import type { TransactionRunner } from '../db/transaction.js';
import { ConflictError, UnauthorizedError } from '../lib/errors.js';
import type { JwtService } from '../lib/jwt.js';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../lib/password.js';
import { generateOpaqueToken, hashToken } from '../lib/tokens.js';
import type { RefreshTokensRepository } from '../repositories/refresh-tokens.repository.js';
import type { UsersRepository } from '../repositories/users.repository.js';
import { toUser, type User } from './users.service.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface AuthResult {
  user: User;
  tokens: AuthTokens;
}

export interface AuthServiceDeps {
  users: UsersRepository;
  refreshTokens: RefreshTokensRepository;
  transaction: TransactionRunner;
  jwt: JwtService;
  refreshTokenTtlDays: number;
  now?: () => Date;
}

const DAY_MS = 86_400_000;
const invalidCredentials = () =>
  new UnauthorizedError('The email or password is incorrect.', 'INVALID_CREDENTIALS');
const invalidRefreshToken = () =>
  new UnauthorizedError('The refresh token is invalid or expired.', 'INVALID_REFRESH_TOKEN');

export function createAuthService(deps: AuthServiceDeps) {
  const {
    users,
    refreshTokens,
    transaction,
    jwt,
    refreshTokenTtlDays,
    now = () => new Date(),
  } = deps;

  async function issueTokens(
    user: User,
    familyId: string,
    executor?: DbExecutor,
  ): Promise<AuthTokens> {
    const refreshToken = generateOpaqueToken();
    await refreshTokens.create(
      {
        userId: user.id,
        familyId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(now().getTime() + refreshTokenTtlDays * DAY_MS),
      },
      executor,
    );
    const accessToken = await jwt.signAccessToken({
      userId: user.id,
      email: user.email,
      roles: [user.role],
    });
    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: jwt.accessTokenTtlSeconds };
  }

  return {
    async register(input: {
      email: string;
      password: string;
      displayName: string;
    }): Promise<AuthResult> {
      const passwordHash = await hashPassword(input.password);
      try {
        return await transaction(async (tx) => {
          const row = await users.create(
            { email: input.email.toLowerCase(), passwordHash, displayName: input.displayName },
            tx,
          );
          const user = toUser(row);
          return { user, tokens: await issueTokens(user, randomUUID(), tx) };
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError('An account with this email already exists.', 'EMAIL_TAKEN');
        }
        throw error;
      }
    },

    async login(input: { email: string; password: string }): Promise<AuthResult> {
      const row = await users.findByEmail(input.email.toLowerCase());
      const valid = row
        ? await verifyPassword(row.passwordHash, input.password)
        : await verifyAgainstDummy(input.password);
      if (!row || !valid) throw invalidCredentials();
      const user = toUser(row);
      return { user, tokens: await issueTokens(user, randomUUID()) };
    },

    /**
     * Rotation with reuse detection: each refresh token works once. Presenting an already
     * rotated token means it leaked, so the whole family (every session from that login) is revoked.
     */
    async refresh(refreshToken: string): Promise<AuthResult> {
      const stored = await refreshTokens.findByHash(hashToken(refreshToken));
      if (!stored) throw invalidRefreshToken();
      if (stored.revokedAt) {
        await refreshTokens.revokeFamily(stored.familyId);
        throw new UnauthorizedError('The refresh token was already used.', 'REFRESH_TOKEN_REUSED');
      }
      if (stored.expiresAt.getTime() <= now().getTime()) throw invalidRefreshToken();

      const rotated = await transaction(async (tx) => {
        const won = await refreshTokens.revoke(stored.id, tx);
        if (!won) return null;
        const row = await users.findById(stored.userId, tx);
        if (!row) return null;
        const user = toUser(row);
        return { user, tokens: await issueTokens(user, stored.familyId, tx) };
      });
      if (!rotated) {
        await refreshTokens.revokeFamily(stored.familyId);
        throw invalidRefreshToken();
      }
      return rotated;
    },

    /** Idempotent: unknown or already revoked tokens are not an error. */
    async logout(refreshToken: string): Promise<void> {
      const stored = await refreshTokens.findByHash(hashToken(refreshToken));
      if (stored) await refreshTokens.revokeFamily(stored.familyId);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
