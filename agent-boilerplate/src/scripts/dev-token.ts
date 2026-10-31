import { parseArgs } from 'node:util';
import { loadEnv } from '../config/env.js';
import { createJwtService, ROLES, type Role } from '../lib/jwt.js';

/**
 * Local development only: mints an access token with the same secret, issuer and audience
 * the backend uses, so the agent can be called without running the backend.
 *   npm run token:dev -- --role admin --user dev-admin
 */
const env = loadEnv();
if (env.NODE_ENV === 'production') throw new Error('dev-token is disabled in production');

const { values } = parseArgs({
  options: {
    user: { type: 'string', default: 'dev-user' },
    email: { type: 'string', default: 'dev@example.com' },
    role: { type: 'string', default: 'user' },
  },
});
const role = values.role as Role;
if (!ROLES.includes(role)) throw new Error(`role must be one of ${ROLES.join(', ')}`);

const jwt = createJwtService({
  secret: env.JWT_SECRET,
  issuer: env.JWT_ISSUER,
  audience: env.JWT_AUDIENCE,
  accessTokenTtlSeconds: 3_600,
});
process.stdout.write(
  `${await jwt.signAccessToken({ userId: values.user, email: values.email, roles: [role] })}\n`,
);
