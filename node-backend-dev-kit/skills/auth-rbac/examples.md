# Auth and RBAC — examples

Guards, ownership and the IdP verifier were verified on a copy of `backend-boilerplate/` (typecheck + ESLint).
The full local auth implementation is in [references/auth-flow.md](references/auth-flow.md).

## Protecting a router

```ts
// src/routes/users.routes.ts — every route authenticated, one admin-only
export function createUsersRouter(
  controller: UsersController,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  router.use(authenticate);
  router.get('/me', controller.me);
  router.get('/', requireRole('admin'), validate(listUsersRequest), controller.list);
  return router;
}
```

`authenticate` is built once in the container (`middleware: { authenticate: authenticate(jwt) }`) and passed
to `createApiRouter`, which hands it to each protected router. Order: `authenticate` → `requireRole` → `validate` → handler.

## Reading the caller in a controller

```ts
const me: RequestHandler = async (_req, res) => {
  const principal = requirePrincipal(res);
  res.json(toUserResponse(await users.getById(principal.userId)));
};
```

`requirePrincipal` throws `UnauthorizedError` if a route forgot `authenticate`, instead of serving data to an anonymous caller.

## Ownership in the service (from the `projects` slice)

```ts
/** Owners see their projects, admins see all; anyone else gets 404 so ids do not leak. */
async function getVisible(actor: Principal, id: string): Promise<ProjectRow> {
  const row = await projects.findById(id);
  if (!row) throw notFound();
  if (row.ownerId !== actor.userId && !actor.roles.includes('admin')) throw notFound();
  return row;
}

async create(actor: Principal, input: ProjectInput): Promise<Project> {
  // the owner comes from the token, never from the body
  const row = await projects.create({
    ownerId: actor.userId,
    name: input.name,
    description: input.description ?? null,
  });
  return toProject(row);
}
```

Lists filter by the principal in the query (`eq(projects.ownerId, ownerId)`), not after fetching.

## Adding a role

1. `src/lib/jwt.ts`: `export const ROLES = ['user', 'admin', 'auditor'] as const;` — `Role`, the claims schema and `requireRole` follow.
2. `src/db/schema/users.ts` uses `pgEnum('role', ROLES)`, so `npm run db:generate -- --name add_auditor_role` emits `ALTER TYPE "public"."role" ADD VALUE 'auditor';`. Ship it in its own migration (`drizzle-database` skill).
3. `src/schemas/user.schema.ts`: `role: z.enum(['user', 'admin'])` is a literal list — switch it to `z.enum(ROLES)` or add the value.
4. Guard routes with `requireRole('admin', 'auditor')` (any of the roles passes).
5. Unit-test the guard and an integration test per protected route (403 `FORBIDDEN` for the wrong role).

## External identity provider (Keycloak, Entra ID, Auth0)

Drop `/auth/*`, `auth.service.ts`, the refresh-token table and `lib/password.ts`/`lib/tokens.ts`. Keep `authenticate`, `requireRole` and `requirePrincipal`. Verify tokens against the IdP's JWKS:

```ts
// src/lib/remote-jwt.ts
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import { UnauthorizedError } from './errors.js';
import { ROLES, type Principal } from './jwt.js';

export interface RemoteJwtOptions {
  jwksUrl: string;
  issuer: string;
  audience: string;
}

/** Keycloak puts roles under realm_access.roles; adapt the claims schema to your IdP. */
const claimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().default(''),
  realm_access: z.object({ roles: z.array(z.string()) }).default({ roles: [] }),
});

const isRole = (value: string): value is Principal['roles'][number] =>
  (ROLES as readonly string[]).includes(value);

export function createRemoteJwtVerifier(options: RemoteJwtOptions) {
  const jwks = createRemoteJWKSet(new URL(options.jwksUrl));

  return {
    async verifyAccessToken(token: string): Promise<Principal> {
      try {
        const { payload } = await jwtVerify(token, jwks, {
          issuer: options.issuer,
          audience: options.audience,
          algorithms: ['RS256'],
        });
        const claims = claimsSchema.parse(payload);
        return {
          userId: claims.sub,
          email: claims.email,
          roles: claims.realm_access.roles.filter(isRole),
        };
      } catch (error) {
        throw new UnauthorizedError('The access token is invalid or expired.', 'INVALID_TOKEN', {
          cause: error,
        });
      }
    },
  };
}
```

Then widen the guard's parameter so either verifier fits — `src/middleware/authenticate.ts`:

```ts
export function authenticate(jwt: Pick<JwtService, 'verifyAccessToken'>): RequestHandler {
```

and in `container.ts` build `createRemoteJwtVerifier({ jwksUrl: env.JWKS_URL, issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE })`
(add `JWKS_URL: z.url()` to `envSchema`; drop `JWT_SECRET`). `createRemoteJWKSet` caches keys and refetches on an unknown `kid`.
Unit tests sign tokens with a local key pair (`generateKeyPair('RS256')` + `createLocalJWKSet`) instead of calling the IdP.

## Testing the guards — `tests/unit/middleware/auth-guards.test.ts`

```ts
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createJwtService, type Principal } from '../../../src/lib/jwt.js';
import { createLogger } from '../../../src/lib/logger.js';
import { authenticate, requirePrincipal } from '../../../src/middleware/authenticate.js';
import { requireRole } from '../../../src/middleware/authorize.js';
import { errorHandler } from '../../../src/middleware/error-handler.js';
import { requestLogger } from '../../../src/middleware/request-logger.js';
import { TEST_JWT_SECRET } from '../../helpers/env.js';

const jwt = createJwtService({
  secret: TEST_JWT_SECRET,
  issuer: 'test',
  audience: 'test-api',
  accessTokenTtlSeconds: 60,
});
const user: Principal = { userId: 'u-1', email: 'user@example.com', roles: ['user'] };
const admin: Principal = { userId: 'u-2', email: 'admin@example.com', roles: ['admin'] };

const app = express();
app.use(requestLogger(createLogger({ level: 'silent', pretty: false })));
app.get('/me', authenticate(jwt), (_req, res) => {
  res.json(requirePrincipal(res));
});
app.get('/admin', authenticate(jwt), requireRole('admin'), (_req, res) => {
  res.json({ ok: true });
});
app.use(errorHandler());

describe('authenticate + requireRole', () => {
  it('rejects a request without a bearer token', async () => {
    const res = await request(app).get('/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('MISSING_TOKEN');
  });

  it('rejects a token signed with another secret', async () => {
    const forged = await createJwtService({
      secret: 'another-secret-that-is-at-least-32-chars',
      issuer: 'test',
      audience: 'test-api',
      accessTokenTtlSeconds: 60,
    }).signAccessToken(user);
    const res = await request(app).get('/me').set('authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('exposes the verified principal to the handler', async () => {
    const token = await jwt.signAccessToken(user);
    const res = await request(app).get('/me').set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(user);
  });

  it('forbids a user without the required role', async () => {
    const token = await jwt.signAccessToken(user);
    const res = await request(app).get('/admin').set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('allows a caller with the required role', async () => {
    const token = await jwt.signAccessToken(admin);
    const res = await request(app).get('/admin').set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
```
