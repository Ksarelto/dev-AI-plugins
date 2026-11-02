import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/test-app.js';

describe('graceful degradation without model credentials', () => {
  const testApp = createTestApp({ chatModel: null, embeddings: null });
  afterAll(testApp.close);

  it('stays ready but reports degraded', async () => {
    const res = await request(testApp.app).get('/health/ready').expect(200);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'postgres', status: 'up' }),
        expect.objectContaining({ name: 'llm', status: 'down' }),
      ]),
    );
  });

  it('answers chat with 503 LLM_NOT_CONFIGURED instead of crashing', async () => {
    const token = await testApp.token('ada');
    const thread = await request(testApp.app)
      .post('/api/v1/threads')
      .set('authorization', `Bearer ${token}`)
      .send({})
      .expect(201);
    const res = await request(testApp.app)
      .post(`/api/v1/threads/${thread.body.id as string}/messages`)
      .set('authorization', `Bearer ${token}`)
      .send({ content: 'Hello?' })
      .expect(503);
    expect(res.body.code).toBe('LLM_NOT_CONFIGURED');
  });

  it('answers ingest with 503 EMBEDDINGS_NOT_CONFIGURED', async () => {
    const admin = await testApp.token('admin-1', 'admin');
    const res = await request(testApp.app)
      .post('/api/v1/knowledge/documents')
      .set('authorization', `Bearer ${admin}`)
      .send({ title: 'T', source: 's', content: 'c' })
      .expect(503);
    expect(res.body.code).toBe('EMBEDDINGS_NOT_CONFIGURED');
  });
});
