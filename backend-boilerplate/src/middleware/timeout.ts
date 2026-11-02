import type { RequestHandler } from 'express';
import { ServiceUnavailableError } from '../lib/errors.js';

/**
 * Answers 503 when a handler runs longer than `ms`, so clients and proxies are not left
 * hanging. Handlers that call slow dependencies can pass `res.locals.signal` downstream
 * to stop work that nobody is waiting for anymore.
 */
export function requestTimeout(ms: number): RequestHandler {
  return (_req, res, next) => {
    const controller = new AbortController();
    res.locals.signal = controller.signal;
    const timer = setTimeout(() => {
      controller.abort();
      if (!res.headersSent) {
        next(new ServiceUnavailableError('The request timed out.', 'REQUEST_TIMEOUT', 1));
      }
    }, ms);
    timer.unref();
    const clear = () => {
      clearTimeout(timer);
    };
    res.once('finish', clear);
    res.once('close', () => {
      clear();
      if (!res.writableFinished) controller.abort();
    });
    next();
  };
}
