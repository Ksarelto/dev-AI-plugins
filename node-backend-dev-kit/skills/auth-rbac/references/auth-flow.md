# Local auth flow — reference

Verbatim from `backend-boilerplate/`: HS256 access tokens, rotating refresh tokens with family revocation,
argon2id passwords, and the guards.

## `src/lib/jwt.ts`

```ts
import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { UnauthorizedError } from './errors.js';

export const ROLES = ['user', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** The authenticated caller, as carried in the access token. */
export interface Principal {
  userId: string;
  email: string;
  roles: Role[];
}

export interface JwtOptions {
  secret: string;
  issuer: string;
  audience: string;
  accessTokenTtlSeconds: number;
}

const claimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string(),
  roles: z.array(z.enum(ROLES)),
});

export function createJwtService(options: JwtOptions) {
  const key = new TextEncoder().encode(options.secret);

  return {
    accessTokenTtlSeconds: options.accessTokenTtlSeconds,

    async signAccessToken(principal: Principal): Promise<string> {
      return new SignJWT({ email: principal.email, roles: principal.roles })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(principal.userId)
        .setIssuer(options.issuer)
        .setAudience(options.audience)
        .setIssuedAt()
        .setJti(randomUUID())
        .setExpirationTime(`${options.accessTokenTtlSeconds}s`)
        .sign(key);
    },

    async verifyAccessToken(token: string): Promise<Principal> {
      try {
        const { payload } = await jwtVerify(token, key, {
          issuer: options.issuer,
          audience: options.audience,
          algorithms: ['HS256'],
        });
        const claims = claimsSchema.parse(payload);
        return { userId: claims.sub, email: claims.email, roles: claims.roles };
      } catch (error) {
        throw new UnauthorizedError('The access token is invalid or expired.', 'INVALID_TOKEN', {
          cause: error,
        });
      }
    },
  };
}

export type JwtService = ReturnType<typeof createJwtService>;
```

## `src/lib/password.ts`

```ts
import { hash, verify } from '@node-rs/argon2';

/** argon2id with the library's OWASP-aligned defaults. */
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/**
 * Verifying against a throwaway hash when the user does not exist keeps login timing
 * the same for unknown emails, so attackers cannot enumerate accounts.
 */
let dummyHash: Promise<string> | undefined;
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hash('dummy-password-for-timing-equalisation');
  await verifyPassword(await dummyHash, password);
  return false;
}
```

## `src/lib/tokens.ts`

```ts
import { createHash, randomBytes } from 'node:crypto';

/** Opaque refresh tokens: 256 random bits, stored only as a SHA-256 hash. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
```

## `src/middleware/authenticate.ts`

```ts
import type { RequestHandler, Response } from 'express';
import { UnauthorizedError } from '../lib/errors.js';
import type { JwtService, Principal } from '../lib/jwt.js';

const BEARER = /^Bearer (\S+)$/i;

/** Verifies the bearer access token and stores the caller on `res.locals.principal`. */
export function authenticate(jwt: JwtService): RequestHandler {
  return async (req, res, next) => {
    const match = BEARER.exec(req.get('authorization') ?? '');
    if (!match?.[1])
      throw new UnauthorizedError('A bearer access token is required.', 'MISSING_TOKEN');
    res.locals.principal = await jwt.verifyAccessToken(match[1]);
    next();
  };
}

/** The authenticated caller. Throws if a route forgot `authenticate`, instead of leaking data. */
export function requirePrincipal(res: Response): Principal {
  const principal = res.locals.principal as Principal | undefined;
  if (!principal) throw new UnauthorizedError();
  return principal;
}
```

## `src/middleware/authorize.ts`

```ts
import type { RequestHandler } from 'express';
import { ForbiddenError } from '../lib/errors.js';
import type { Role } from '../lib/jwt.js';
import { requirePrincipal } from './authenticate.js';

/** Role-based guard. Mount after `authenticate`. Passes when the caller has any of the roles. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (_req, res, next) => {
    const principal = requirePrincipal(res);
    if (!roles.some((role) => principal.roles.includes(role))) throw new ForbiddenError();
    next();
  };
}
```

## `src/db/schema/refresh-tokens.ts`

```ts
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** All tokens issued from one login share a family; reuse of a rotated token revokes the family. */
    familyId: uuid('family_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('refresh_tokens_user_id_idx').on(table.userId),
    index('refresh_tokens_family_id_idx').on(table.familyId),
  ],
);

export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
export type NewRefreshTokenRow = typeof refreshTokens.$inferInsert;
```

## `src/repositories/refresh-tokens.repository.ts`

```ts
import { and, eq, isNull } from 'drizzle-orm';
import type { Database, DbExecutor } from '../db/client.js';
import {
  refreshTokens,
  type NewRefreshTokenRow,
  type RefreshTokenRow,
} from '../db/schema/index.js';

export function createRefreshTokensRepository(db: Database) {
  return {
    async findByHash(
      tokenHash: string,
      executor: DbExecutor = db,
    ): Promise<RefreshTokenRow | undefined> {
      const [row] = await executor
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash))
        .limit(1);
      return row;
    },

    async create(values: NewRefreshTokenRow, executor: DbExecutor = db): Promise<void> {
      await executor.insert(refreshTokens).values(values);
    },

    /** Marks the token revoked only if it still is active; returns false if another request won the race. */
    async revoke(id: string, executor: DbExecutor = db): Promise<boolean> {
      const rows = await executor
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.revokedAt)))
        .returning({ id: refreshTokens.id });
      return rows.length === 1;
    },

    async revokeFamily(familyId: string, executor: DbExecutor = db): Promise<void> {
      await executor
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
    },
  };
}

export type RefreshTokensRepository = ReturnType<typeof createRefreshTokensRepository>;
```

## `src/services/auth.service.ts`

```ts
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
```

## `src/schemas/auth.schema.ts`

```ts
import { z } from 'zod';
import type { ValidationSchemas } from '../middleware/validate.js';
import type { AuthResult } from '../services/auth.service.js';
import { toUserResponse, userResponseSchema } from './user.schema.js';

const email = z.email().max(320);
/** Length over composition rules (NIST 800-63B); the upper bound caps hashing cost. */
const password = z.string().min(12).max(128);

export const registerBodySchema = z
  .object({ email, password, displayName: z.string().trim().min(1).max(100) })
  .strict();
export const loginBodySchema = z.object({ email, password: z.string().min(1).max(128) }).strict();
export const refreshBodySchema = z.object({ refreshToken: z.string().min(1).max(512) }).strict();

export const registerRequest = { body: registerBodySchema } satisfies ValidationSchemas;
export const loginRequest = { body: loginBodySchema } satisfies ValidationSchemas;
export const refreshRequest = { body: refreshBodySchema } satisfies ValidationSchemas;

export const authResponseSchema = z
  .object({
    user: userResponseSchema,
    accessToken: z.string(),
    refreshToken: z.string(),
    tokenType: z.literal('Bearer'),
    expiresIn: z.number().int(),
  })
  .meta({ id: 'AuthResponse' });

export function toAuthResponse(result: AuthResult): z.infer<typeof authResponseSchema> {
  return { user: toUserResponse(result.user), ...result.tokens };
}
```

## `src/controllers/auth.controller.ts`

```ts
import type { RequestHandler } from 'express';
import { validated } from '../middleware/validate.js';
import {
  loginRequest,
  refreshRequest,
  registerRequest,
  toAuthResponse,
} from '../schemas/auth.schema.js';
import type { AuthService } from '../services/auth.service.js';

/** HTTP ↔ service mapping only: read validated input, call one service method, shape the response. */
export function createAuthController(auth: AuthService) {
  const register: RequestHandler = async (_req, res) => {
    const { body } = validated(res, registerRequest);
    const result = await auth.register(body);
    res.status(201).json(toAuthResponse(result));
  };

  const login: RequestHandler = async (_req, res) => {
    const { body } = validated(res, loginRequest);
    res.json(toAuthResponse(await auth.login(body)));
  };

  const refresh: RequestHandler = async (_req, res) => {
    const { body } = validated(res, refreshRequest);
    res.json(toAuthResponse(await auth.refresh(body.refreshToken)));
  };

  const logout: RequestHandler = async (_req, res) => {
    const { body } = validated(res, refreshRequest);
    await auth.logout(body.refreshToken);
    res.status(204).end();
  };

  return { register, login, refresh, logout };
}

export type AuthController = ReturnType<typeof createAuthController>;
```

## `src/routes/auth.routes.ts`

```ts
import { Router, type RequestHandler } from 'express';
import type { AuthController } from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { loginRequest, refreshRequest, registerRequest } from '../schemas/auth.schema.js';

/** Wiring only: path → middleware → controller. */
export function createAuthRouter(controller: AuthController, authLimiter: RequestHandler): Router {
  const router = Router();
  router.use(authLimiter);
  router.post('/register', validate(registerRequest), controller.register);
  router.post('/login', validate(loginRequest), controller.login);
  router.post('/refresh', validate(refreshRequest), controller.refresh);
  router.post('/logout', validate(refreshRequest), controller.logout);
  return router;
}
```
