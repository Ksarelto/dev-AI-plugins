import type { RequestHandler, Response } from 'express';
import type { z } from 'zod';
import { ValidationError, type ValidationIssue } from '../lib/errors.js';

export interface ValidationSchemas {
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
}

export type Validated<S extends ValidationSchemas> = {
  [K in keyof S]: S[K] extends z.ZodType ? z.output<S[K]> : never;
};

const PARTS = ['params', 'query', 'body'] as const;

function toIssues(error: z.ZodError, part: string): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: [part, ...issue.path.map(String)].join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * Parses params, query and body at the edge and stores the typed result on `res.locals`.
 * Express 5 makes `req.query` read-only, so parsed values are read back with `validated()`.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, res, next) => {
    const issues: ValidationIssue[] = [];
    const parsed: Partial<Record<(typeof PARTS)[number], unknown>> = {};
    for (const part of PARTS) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (result.success) parsed[part] = result.data;
      else issues.push(...toIssues(result.error, part));
    }
    if (issues.length > 0) {
      next(new ValidationError(issues));
      return;
    }
    res.locals.validated = parsed;
    next();
  };
}

/** Typed access to what `validate(schemas)` parsed for this request. */
export function validated<S extends ValidationSchemas>(res: Response, _schemas: S): Validated<S> {
  return res.locals.validated as Validated<S>;
}
