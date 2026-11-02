import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { TooManyRequestsError } from '../lib/errors.js';

export interface RateLimitOptions {
  windowMs: number;
  limit: number;
}

/**
 * In-memory limiter: correct for one instance. With several replicas, plug a shared store
 * (e.g. rate-limit-redis) into the same options.
 */
export function createRateLimiter(options: RateLimitOptions): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new TooManyRequestsError());
    },
  });
}
