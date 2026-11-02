# API testing — examples

Verbatim from `backend-boilerplate/`. A full new-resource test pair is in the `express-resource` skill
(`references/tests.md`); guard and error-handler tests are in the `auth-rbac` and `error-handling` skills.

## Service unit test with in-memory repositories — `tests/unit/services/auth.service.test.ts`

```ts
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
```

## Integration flow — `tests/integration/auth.flow.test.ts`

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/test-app.js';

const testApp = createTestApp();
const { app } = testApp;
const account = { email: 'ada@example.com', password: 'correct-horse-battery', displayName: 'Ada' };

beforeEach(testApp.reset);
afterAll(testApp.close);

describe('auth flow', () => {
  it('register → me → refresh (rotates) → reuse detected → logout', async () => {
    const registered = await request(app).post('/api/v1/auth/register').send(account).expect(201);
    expect(registered.body.user).toMatchObject({ email: account.email, role: 'user' });
    expect(registered.body.user).not.toHaveProperty('passwordHash');

    const me = await request(app)
      .get('/api/v1/users/me')
      .set('authorization', `Bearer ${registered.body.accessToken}`)
      .expect(200);
    expect(me.body.email).toBe(account.email);

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: registered.body.refreshToken })
      .expect(200);
    expect(refreshed.body.refreshToken).not.toBe(registered.body.refreshToken);

    const reused = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: registered.body.refreshToken })
      .expect(401);
    expect(reused.body.code).toBe('REFRESH_TOKEN_REUSED');

    await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(401);
  });

  it('logs in with a case-insensitive email', async () => {
    await request(app).post('/api/v1/auth/register').send(account).expect(201);
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ADA@example.com', password: account.password })
      .expect(200);
  });

  it('answers a duplicate registration with 409 EMAIL_TAKEN', async () => {
    await request(app).post('/api/v1/auth/register').send(account).expect(201);
    const res = await request(app).post('/api/v1/auth/register').send(account).expect(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  it('answers invalid input with 422 problem+json listing every field', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password: 'short', unexpected: true })
      .expect(422);
    expect(res.headers['content-type']).toContain('application/problem+json');
    const paths = (res.body.errors as { path: string }[]).map((e) => e.path);
    expect(paths).toEqual(
      expect.arrayContaining(['body.email', 'body.password', 'body.displayName']),
    );
  });
});
```

## RBAC and pagination — `tests/integration/users.rbac.test.ts`

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/test-app.js';

const testApp = createTestApp();
const { app } = testApp;
const password = 'correct-horse-battery';

async function login(email: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return res.body.accessToken as string;
}

beforeEach(async () => {
  await testApp.reset();
  await testApp.createAdmin('admin@example.com', password);
  for (const name of ['amy', 'bob', 'cid']) {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: `${name}@example.com`, password, displayName: name })
      .expect(201);
  }
});
afterAll(testApp.close);

describe('GET /api/v1/users (admin only)', () => {
  it('forbids a regular user', async () => {
    const token = await login('amy@example.com');
    const res = await request(app)
      .get('/api/v1/users')
      .set('authorization', `Bearer ${token}`)
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('pages through every user with a keyset cursor', async () => {
    const token = await login('admin@example.com');
    const first = await request(app)
      .get('/api/v1/users?limit=2')
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toEqual(expect.any(String));

    const second = await request(app)
      .get(`/api/v1/users?limit=2&cursor=${first.body.nextCursor as string}`)
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(second.body.items).toHaveLength(2);
    expect(second.body.nextCursor).toBeNull();

    const emails = [...first.body.items, ...second.body.items].map(
      (u: { email: string }) => u.email,
    );
    expect(new Set(emails).size).toBe(4);
  });

  it('rejects an out-of-range limit with 422', async () => {
    const token = await login('admin@example.com');
    await request(app)
      .get('/api/v1/users?limit=500')
      .set('authorization', `Bearer ${token}`)
      .expect(422);
  });
});
```

## Per-test app variants — `tests/integration/health.test.ts`

`createTestApp(options)` accepts `extraHealthChecks` and `env` overrides, so one file can build a degraded or misconfigured app next to the healthy one.

```ts
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/test-app.js';

describe('health endpoints', () => {
  const healthy = createTestApp();
  const degraded = createTestApp({
    extraHealthChecks: [
      { name: 'search', critical: false, check: () => Promise.reject(new Error('timeout')) },
    ],
  });
  afterAll(async () => {
    await healthy.close();
    await degraded.close();
  });

  it('liveness answers without touching dependencies', async () => {
    await request(healthy.app).get('/health/live').expect(200, { status: 'ok' });
  });

  it('readiness is ok when Postgres answers', async () => {
    const res = await request(healthy.app).get('/health/ready').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('readiness stays 200 but reports degraded when an optional dependency is down', async () => {
    const res = await request(degraded.app).get('/health/ready').expect(200);
    expect(res.body.status).toBe('degraded');
  });

  it('readiness is 503 when Postgres is unreachable', async () => {
    const broken = createTestApp({ env: { DATABASE_URL: 'postgres://app:app@127.0.0.1:1/app' } });
    const res = await request(broken.app).get('/health/ready').expect(503);
    expect(res.body.status).toBe('down');
    await broken.close();
  });

  it('serves the OpenAPI document when docs are enabled', async () => {
    const withDocs = createTestApp({ env: { API_DOCS_ENABLED: 'true' } });
    const res = await request(withDocs.app).get('/api-docs/openapi.json').expect(200);
    expect(res.body.info.title).toBe('backend-boilerplate API');
    await withDocs.close();
  });

  it('echoes a safe X-Request-Id and sets security headers', async () => {
    const res = await request(healthy.app).get('/health/live').set('x-request-id', 'trace-123');
    expect(res.headers['x-request-id']).toBe('trace-123');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers).not.toHaveProperty('x-powered-by');
  });
});
```

## Pure lib unit test — `tests/unit/lib/cursor.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from '../../../src/lib/cursor.js';
import { BadRequestError } from '../../../src/lib/errors.js';

describe('pagination cursor', () => {
  it('round-trips a keyset', () => {
    const keyset = {
      createdAt: new Date('2026-01-02T03:04:05.000Z'),
      id: '6f1c2c1e-6d1b-4c55-9a8b-0d3f7a9c1e22',
    };
    expect(decodeCursor(encodeCursor(keyset))).toEqual(keyset);
  });

  it('rejects a tampered cursor with a 400', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrow(BadRequestError);
  });
});
```

## Bad / good

```ts
// Bad: mocks the query builder; passes even if the SQL is wrong
vi.mock('../../../src/db/client.js');
db.select.mockReturnValue({ from: () => ({ where: () => ({ limit: () => [row] }) }) });

// Good (unit): the service against a fake that honours the repository contract
const repos = createInMemoryRepositories();
const auth = createAuthService({ ...repos, jwt, refreshTokenTtlDays: 30 });

// Good (integration): the real container and real Postgres
const testApp = createTestApp();
await request(testApp.app).post('/api/v1/auth/register').send(account).expect(201);
```

```ts
// Bad: asserts only that something came back
expect(res.body).toBeDefined();

// Good: status, contract and absence of secrets
expect(res.status).toBe(409);
expect(res.body.code).toBe('EMAIL_TAKEN');
expect(registered.body.user).not.toHaveProperty('passwordHash');
```
