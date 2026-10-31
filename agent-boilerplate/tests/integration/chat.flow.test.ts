import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  answer,
  answerCitingFirstResult,
  callTool,
  scriptedModel,
  type Turn,
} from '../helpers/scripted-model.js';
import { createTestApp } from '../helpers/test-app.js';

const REFUND_DOC = {
  title: 'Refund policy',
  source: 'kb/refunds.md',
  content:
    'Annual plans can be refunded within 30 days of purchase.\n\nMonthly plans are not refundable, but can be cancelled at any time.',
};

describe('chat flow (real Postgres checkpointer + hybrid search)', () => {
  /** The scripted model reads from this queue; each test pushes the turns it expects. */
  const turns: Turn[] = [];
  const testApp = createTestApp({ chatModel: scriptedModel(turns) });
  const { app } = testApp;

  beforeEach(async () => {
    turns.length = 0;
    await testApp.reset();
  });
  afterAll(testApp.close);

  async function newThread(token: string): Promise<string> {
    const res = await request(app)
      .post('/api/v1/threads')
      .set('authorization', `Bearer ${token}`)
      .send({})
      .expect(201);
    return res.body.id as string;
  }

  it('ingest → ask → cited answer → history persisted → other users locked out', async () => {
    const admin = await testApp.token('admin-1', 'admin');
    const ada = await testApp.token('ada');
    const intruder = await testApp.token('mallory');

    const ingested = await request(app)
      .post('/api/v1/knowledge/documents')
      .set('authorization', `Bearer ${admin}`)
      .send(REFUND_DOC)
      .expect(201);
    expect(ingested.body.chunks).toBeGreaterThan(0);

    const threadId = await newThread(ada);
    turns.push(
      callTool('search_knowledge', { query: 'annual plan refund' }),
      answerCitingFirstResult('Annual plans are refundable within 30 days.'),
    );
    const reply = await request(app)
      .post(`/api/v1/threads/${threadId}/messages`)
      .set('authorization', `Bearer ${ada}`)
      .send({ content: 'Can I get a refund on my annual plan?' })
      .expect(200);
    expect(reply.body.citations).toEqual([
      expect.objectContaining({ title: 'Refund policy', source: 'kb/refunds.md' }),
    ]);
    expect(reply.body.degraded).toBe(false);

    const history = await request(app)
      .get(`/api/v1/threads/${threadId}/messages`)
      .set('authorization', `Bearer ${ada}`)
      .expect(200);
    expect((history.body.items as { role: string }[]).map((m) => m.role)).toEqual([
      'user',
      'assistant',
    ]);

    await request(app)
      .get(`/api/v1/threads/${threadId}/messages`)
      .set('authorization', `Bearer ${intruder}`)
      .expect(404);
  });

  it('streams the answer as server-sent events', async () => {
    const ada = await testApp.token('ada');
    const threadId = await newThread(ada);
    turns.push(answer('Hello from the stream.'));

    const res = await request(app)
      .post(`/api/v1/threads/${threadId}/messages/stream`)
      .set('authorization', `Bearer ${ada}`)
      .send({ content: 'Say hello' })
      .expect(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('event: done');
    expect(res.text).toContain('Hello from the stream.');
  });

  it('only admins may ingest documents', async () => {
    const ada = await testApp.token('ada');
    await request(app)
      .post('/api/v1/knowledge/documents')
      .set('authorization', `Bearer ${ada}`)
      .send(REFUND_DOC)
      .expect(403);
  });

  it('rejects oversized messages and missing tokens', async () => {
    const ada = await testApp.token('ada');
    const threadId = await newThread(ada);
    await request(app)
      .post(`/api/v1/threads/${threadId}/messages`)
      .set('authorization', `Bearer ${ada}`)
      .send({ content: 'x'.repeat(5_000) })
      .expect(422);
    await request(app).post('/api/v1/threads').send({}).expect(401);
  });
});
