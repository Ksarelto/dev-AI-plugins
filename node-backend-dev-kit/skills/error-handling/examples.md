# Error handling — examples

`AppError` carries a code and a message, not an HTTP status. `api/http/error-mapper.ts` maps the code to a status and writes `{ error: { code, message, details, requestId } }` as `application/json`.

## Throwing from a scenario

```ts
import { isUniqueViolation } from '../../infra/db/errors.js';
import { AppError } from '../../core/errors/app-error.js';

const notFound = () => new AppError('PROJECT_NOT_FOUND', 'Project not found.');
const nameTaken = () => new AppError('PROJECT_NAME_TAKEN', 'You already have a project with this name.');

function mapWriteError(error: unknown): never {
  if (isUniqueViolation(error)) throw nameTaken();
  throw error;
}

async function getVisible(actor: Principal, id: string): Promise<Project> {
  const row = await projects.findById(id);
  if (!row || (row.ownerId !== actor.userId && !actor.roles.includes('admin'))) throw notFound();
  return row;
}
```

## Bad / good in a controller

```ts
// Bad: the controller chooses the status
const get: RequestHandler = async (req, res) => {
  const project = await projects.get(principal, req.params.id);
  if (!project) return res.status(404).json({ message: 'not found' });
  res.json(project);
};

// Good: the scenario throws; Express 5 forwards the rejection to the error mapper
const get: RequestHandler = async (_req, res) => {
  const { params } = validated(res, projectIdRequest);
  res.json(toProjectResponse(await projects.get(requirePrincipal(res), params.id)));
};
```

## A new code

Add a class only when the failure needs extra fields. Otherwise `new AppError(code, message)`. Register the code in the mapper.

```ts
export class UnavailableError extends AppError {
  readonly retryAfterSeconds?: number;

  constructor(code: string, message: string, retryAfterSeconds?: number, options?: ErrorOptions) {
    super(code, message, options);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
```

## `src/core/errors/app-error.ts`

```ts
export class AppError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, options?: ErrorOptions & { details?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
    this.details = options?.details;
  }
}
```

## `src/api/http/error-mapper.ts`

```ts
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, UnavailableError } from '../../core/errors/app-error.js';

const STATUS: Record<string, number> = {
  MALFORMED_JSON: 400,
  ROUTE_NOT_FOUND: 404,
  EMAIL_TAKEN: 409,
  VALIDATION_FAILED: 422,
  DEPENDENCY_UNAVAILABLE: 503,
};

function envelope(code: string, message: string, details: unknown, requestId: string) {
  return { error: { code, message, details: details ?? null, requestId } };
}

export function errorMapper(): ErrorRequestHandler {
  return (error: unknown, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const requestId = req.id;
    const mapped =
      error instanceof AppError
        ? { status: STATUS[error.code] ?? 400, code: error.code, message: error.message, details: error.details }
        : { status: 500, code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.', details: null };

    if (mapped.status >= 500) req.log.error({ err: error }, 'request failed');
    else req.log.warn({ code: mapped.code, status: mapped.status }, mapped.message);

    if (error instanceof UnavailableError && error.retryAfterSeconds !== undefined) {
      res.setHeader('Retry-After', String(error.retryAfterSeconds));
    }
    res.status(mapped.status).type('application/json').json(envelope(mapped.code, mapped.message, mapped.details, requestId));
  };
}

export function notFound(): RequestHandler {
  return (req, _res, next) => {
    next(new AppError('ROUTE_NOT_FOUND', `No route for ${req.method} ${req.path}.`));
  };
}
```

## `src/infra/db/errors.ts`

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
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request failed validation.",
    "details": [{ "path": "body.email", "message": "Invalid email address", "code": "invalid_format" }],
    "requestId": "7c1b..."
  }
}
```

## Tests

```ts
import request from 'supertest';
import { AppError, UnavailableError } from '../../../src/core/errors/app-error.js';

it('renders an AppError as JSON with its code', async () => {
  const res = await request(appThatThrows(new AppError('EMAIL_TAKEN', 'Taken.'))).post('/boom');
  expect(res.status).toBe(409);
  expect(res.headers['content-type']).toContain('application/json');
  expect(res.body.error).toMatchObject({ code: 'EMAIL_TAKEN', message: 'Taken.' });
});

it('hides internals of unexpected errors', async () => {
  const res = await request(appThatThrows(new Error('db password is hunter2'))).post('/boom');
  expect(res.status).toBe(500);
  expect(res.body.error).toMatchObject({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });
  expect(JSON.stringify(res.body)).not.toContain('hunter2');
});

it('sets Retry-After for a degraded dependency', async () => {
  const res = await request(appThatThrows(new UnavailableError('DEPENDENCY_UNAVAILABLE', 'Busy.', 7))).post('/boom');
  expect(res.status).toBe(503);
  expect(res.headers['retry-after']).toBe('7');
});
```
