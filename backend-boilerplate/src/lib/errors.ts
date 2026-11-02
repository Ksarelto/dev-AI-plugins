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
