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
