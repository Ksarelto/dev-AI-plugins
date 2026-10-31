import type { RequestHandler } from 'express';
import { ForbiddenError } from '../lib/errors.js';
import type { Role } from '../lib/jwt.js';
import { requirePrincipal } from './authenticate.js';

/** Role-based guard. Mount after `authenticate`. Passes when the caller has any of the roles. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (_req, res, next) => {
    const principal = requirePrincipal(res);
    if (!roles.some((role) => principal.roles.includes(role))) throw new ForbiddenError();
    next();
  };
}
