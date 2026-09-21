# error-handling examples

## `src/errors/app-error.ts`

```ts
export class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
    readonly details?: { field: string; message: string }[],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(message, 409, "CONFLICT");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
  }
}
```

## `src/http/middleware/validate.ts`

```ts
import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";

export function validate(part: { body?: z.ZodType; query?: z.ZodType; params?: z.ZodType }) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (part.body) req.body = part.body.parse(req.body);
      if (part.query) req.query = part.query.parse(req.query) as Request["query"];
      if (part.params) req.params = part.params.parse(req.params);
      next();
    } catch (err) {
      next(err);
    }
  };
}
```

## `src/http/middleware/error-handler.ts`

```ts
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../../errors/app-error.js";
import { logger } from "../../observability/logger.js";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: err.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
    });
    return;
  }

  if (err instanceof AppError) {
    logger.warn({ err, requestId: req.requestId }, err.message);
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  logger.error({ err, requestId: req.requestId }, "unhandled");
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
  });
}
```

## `src/http/middleware/request-id.ts`

```ts
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header("x-request-id");
  const id = incoming && uuidLike(incoming) ? incoming : randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-ID", id);
  next();
}

function uuidLike(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value);
}
```

Augment Express: `declare global { namespace Express { interface Request { requestId?: string; user?: { id: string; role: string; isActive: boolean } } } }`.
