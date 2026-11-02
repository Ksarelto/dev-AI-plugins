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
