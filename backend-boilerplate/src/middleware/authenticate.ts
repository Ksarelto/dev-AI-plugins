import type { RequestHandler, Response } from 'express';
import { UnauthorizedError } from '../lib/errors.js';
import type { JwtService, Principal } from '../lib/jwt.js';

const BEARER = /^Bearer (\S+)$/i;

/** Verifies the bearer access token and stores the caller on `res.locals.principal`. */
export function authenticate(jwt: JwtService): RequestHandler {
  return async (req, res, next) => {
    const match = BEARER.exec(req.get('authorization') ?? '');
    if (!match?.[1])
      throw new UnauthorizedError('A bearer access token is required.', 'MISSING_TOKEN');
    res.locals.principal = await jwt.verifyAccessToken(match[1]);
    next();
  };
}

/** The authenticated caller. Throws if a route forgot `authenticate`, instead of leaking data. */
export function requirePrincipal(res: Response): Principal {
  const principal = res.locals.principal as Principal | undefined;
  if (!principal) throw new UnauthorizedError();
  return principal;
}
