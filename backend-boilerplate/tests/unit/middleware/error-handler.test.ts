import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ConflictError, ServiceUnavailableError } from '../../../src/lib/errors.js';
import { createLogger } from '../../../src/lib/logger.js';
import { errorHandler, notFound } from '../../../src/middleware/error-handler.js';
import { requestLogger } from '../../../src/middleware/request-logger.js';

function appThatThrows(error: unknown) {
  const app = express();
  app.use(requestLogger(createLogger({ level: 'silent', pretty: false })));
  app.use(express.json());
  app.post('/boom', () => {
    throw error;
  });
  app.use(notFound());
  app.use(errorHandler());
  return app;
}

describe('errorHandler', () => {
  it('renders an AppError as problem+json with its status and code', async () => {
    const res = await request(appThatThrows(new ConflictError('Taken.', 'EMAIL_TAKEN'))).post(
      '/boom',
    );
    expect(res.status).toBe(409);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({
      status: 409,
      code: 'EMAIL_TAKEN',
      detail: 'Taken.',
      instance: '/boom',
    });
  });

  it('maps a ZodError to 422 with field issues', async () => {
    const zodError = z.object({ email: z.email() }).safeParse({ email: 'nope' }).error;
    const res = await request(appThatThrows(zodError)).post('/boom');
    expect(res.status).toBe(422);
    expect(res.body.errors[0]).toMatchObject({ path: 'email' });
  });

  it('answers malformed JSON with 400 MALFORMED_JSON', async () => {
    const res = await request(appThatThrows(new Error('unused')))
      .post('/boom')
      .set('content-type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MALFORMED_JSON');
  });

  it('hides internals of unexpected errors', async () => {
    const res = await request(appThatThrows(new Error('db password is hunter2'))).post('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      code: 'INTERNAL_ERROR',
      detail: 'An unexpected error occurred.',
    });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });

  it('sets Retry-After for a degraded dependency', async () => {
    const res = await request(
      appThatThrows(new ServiceUnavailableError('Busy.', 'DEPENDENCY_UNAVAILABLE', 7)),
    ).post('/boom');
    expect(res.status).toBe(503);
    expect(res.headers['retry-after']).toBe('7');
  });

  it('answers unknown routes with 404 ROUTE_NOT_FOUND', async () => {
    const res = await request(appThatThrows(null)).get('/missing');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ROUTE_NOT_FOUND');
  });
});
