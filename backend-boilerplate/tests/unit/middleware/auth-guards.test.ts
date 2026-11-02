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
