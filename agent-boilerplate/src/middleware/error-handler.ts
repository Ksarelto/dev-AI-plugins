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
