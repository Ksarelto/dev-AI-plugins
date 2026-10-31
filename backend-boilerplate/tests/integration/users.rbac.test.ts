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
