# Error handling — examples

The building blocks are verbatim from `backend-boilerplate/`; the "add a domain error" patterns are
taken from the verified `projects` slice (`express-resource` skill).

## Throwing from a service

```ts
import { isUniqueViolation } from '../db/errors.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';

// Name the error once per service, with a stable code.
const notFound = () => new NotFoundError('Project not found.', 'PROJECT_NOT_FOUND');
const nameTaken = () =>
  new ConflictError('You already have a project with this name.', 'PROJECT_NAME_TAKEN');

/** Rethrows a unique violation as 409, everything else unchanged. */
function mapWriteError(error: unknown): never {
  if (isUniqueViolation(error)) throw nameTaken();
  throw error;
}

// inside the service factory
async function getVisible(actor: Principal, id: string): Promise<ProjectRow> {
  const row = await projects.findById(id);
  if (!row) throw notFound();
  if (row.ownerId !== actor.userId && !actor.roles.includes('admin')) throw notFound();
  return row;
}
```

## Bad / good in a controller

```ts
// Bad: status mapping in the controller, and an Express 4 style wrapper
const get: RequestHandler = async (req, res, next) => {
  try {
    const project = await projects.get(principal, req.params.id);
    if (!project) return res.status(404).json({ message: 'not found' });
    res.json(project);
  } catch (error) {
    next(error);
  }
};

// Good: the service throws NotFoundError; Express 5 forwards the rejection to errorHandler
const get: RequestHandler = async (_req, res) => {
  const { params } = validated(res, projectIdRequest);
  res.json(toProjectResponse(await projects.get(requirePrincipal(res), params.id)));
};
```

## A new error class (only for a new status)

Prefer an existing subclass with a new code. Add a class only when no subclass has the status you need — e.g. 412 for optimistic concurrency. Put it in `src/lib/errors.ts` next to the others:

```ts
export class PreconditionFailedError extends AppError {
  constructor(message = 'The resource was modified by someone else.', code = 'PRECONDITION_FAILED') {
    super(412, code, message);
  }
}
```

Then add the status to the route's OpenAPI responses (`problem('Version mismatch')`) and an integration test asserting `status` and `code`.

## `src/lib/errors.ts`

```ts
import { STATUS_CODES } from 'node:http';

export interface ValidationIssue {
  /** Where the issue was found, e.g. `body.email` or `query.limit`. */
  path: string;
  message: string;
  code: string;
}

/** RFC 9457 (ex-7807) problem details, plus a stable machine-readable `code`. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  instance?: string;
  errors?: ValidationIssue[];
}

/**
 * Base class for every expected failure. Services throw these; the error handler turns
 * them into problem+json. Anything that is not an AppError becomes an opaque 500.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
  }

  toProblem(instance?: string): ProblemDetails {
    return {
      type: 'about:blank',
      title: STATUS_CODES[this.status] ?? 'Error',
      status: this.status,
      detail: this.message,
      code: this.code,
      ...(instance ? { instance } : {}),
    };
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'The request is malformed.', code = 'BAD_REQUEST') {
    super(400, code, message);
  }
}

export class ValidationError extends AppError {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[], message = 'The request failed validation.') {
    super(422, 'VALIDATION_FAILED', message);
    this.issues = issues;
  }

  override toProblem(instance?: string): ProblemDetails {
    return { ...super.toProblem(instance), errors: this.issues };
  }
}

export class UnauthorizedError extends AppError {
  constructor(
    message = 'Authentication is required.',
    code = 'UNAUTHORIZED',
    options?: ErrorOptions,
  ) {
    super(401, code, message, options);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action.', code = 'FORBIDDEN') {
    super(403, code, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'The resource was not found.', code = 'NOT_FOUND') {
    super(404, code, message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'The resource already exists.', code = 'CONFLICT') {
    super(409, code, message);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests. Try again later.', code = 'RATE_LIMITED') {
    super(429, code, message);
  }
}

export class ServiceUnavailableError extends AppError {
  /** Sent as `Retry-After` so clients back off instead of hammering a degraded dependency. */
  readonly retryAfterSeconds: number | undefined;

  constructor(
    message = 'The service is temporarily unavailable.',
    code = 'SERVICE_UNAVAILABLE',
    retryAfterSeconds?: number,
    options?: ErrorOptions,
  ) {
    super(503, code, message, options);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
```

## `src/middleware/error-handler.ts`

Registered last in `createApp`: `app.use(notFound()); app.use(errorHandler());`.

```ts
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { STATUS_CODES } from 'node:http';
import { ZodError } from 'zod';
import {
  AppError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
  type ProblemDetails,
} from '../lib/errors.js';

interface HttpLikeError {
  status: number;
  type?: string;
  expose?: boolean;
}

/** body-parser and friends throw errors carrying a 4xx `status` and a `type`. */
function isClientHttpError(error: unknown): error is HttpLikeError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number' &&
    error.status >= 400 &&
    error.status < 500
  );
}

const CLIENT_ERROR_CODES: Record<string, string> = {
  'entity.parse.failed': 'MALFORMED_JSON',
  'entity.too.large': 'PAYLOAD_TOO_LARGE',
  'encoding.unsupported': 'UNSUPPORTED_ENCODING',
};

function toProblem(error: unknown, instance: string): ProblemDetails {
  if (error instanceof AppError) return error.toProblem(instance);
  if (error instanceof ZodError) {
    const issues = error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
      code: issue.code,
    }));
    return new ValidationError(issues).toProblem(instance);
  }
  if (isClientHttpError(error)) {
    return {
      type: 'about:blank',
      title: STATUS_CODES[error.status] ?? 'Bad Request',
      status: error.status,
      detail: 'The request could not be processed.',
      code: (error.type && CLIENT_ERROR_CODES[error.type]) ?? 'BAD_REQUEST',
      instance,
    };
  }
  return {
    type: 'about:blank',
    title: 'Internal Server Error',
    status: 500,
    detail: 'An unexpected error occurred.',
    code: 'INTERNAL_ERROR',
    instance,
  };
}

/**
 * The only place that turns errors into responses: RFC 9457 problem+json, a stable `code`,
 * no stack traces or internals for 5xx. Registered last.
 */
export function errorHandler(): ErrorRequestHandler {
  return (error: unknown, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const problem = toProblem(error, req.originalUrl);
    if (problem.status >= 500) req.log.error({ err: error }, 'request failed');
    else req.log.warn({ code: problem.code, status: problem.status }, problem.detail);

    if (error instanceof ServiceUnavailableError && error.retryAfterSeconds !== undefined) {
      res.setHeader('Retry-After', String(error.retryAfterSeconds));
    }
    res.status(problem.status).type('application/problem+json').json(problem);
  };
}

export function notFound(): RequestHandler {
  return (req, _res, next) => {
    next(new NotFoundError(`No route for ${req.method} ${req.path}.`, 'ROUTE_NOT_FOUND'));
  };
}
```

## `src/db/errors.ts`

```ts
/** Postgres SQLSTATE 23505. Drizzle wraps driver errors, so check the cause chain too. */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current; depth++) {
    if (typeof current === 'object' && 'code' in current && current.code === '23505') return true;
    current = typeof current === 'object' && 'cause' in current ? current.cause : undefined;
  }
  return false;
}
```

## Response shape

```json
{
  "type": "about:blank",
  "title": "Unprocessable Entity",
  "status": 422,
  "detail": "The request failed validation.",
  "code": "VALIDATION_FAILED",
  "instance": "/api/v1/auth/register",
  "errors": [{ "path": "body.email", "message": "Invalid email address", "code": "invalid_format" }]
}
```

## Tests

Unit-test the handler with a throwaway app (from `tests/unit/middleware/error-handler.test.ts`), and assert `code` in service and integration tests:

```ts
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
```
