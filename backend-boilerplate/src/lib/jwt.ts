import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { UnauthorizedError } from './errors.js';

export const ROLES = ['user', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** The authenticated caller, as carried in the access token. */
export interface Principal {
  userId: string;
  email: string;
  roles: Role[];
}

export interface JwtOptions {
  secret: string;
  issuer: string;
  audience: string;
  accessTokenTtlSeconds: number;
}

const claimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string(),
  roles: z.array(z.enum(ROLES)),
});

export function createJwtService(options: JwtOptions) {
  const key = new TextEncoder().encode(options.secret);

  return {
    accessTokenTtlSeconds: options.accessTokenTtlSeconds,

    async signAccessToken(principal: Principal): Promise<string> {
      return new SignJWT({ email: principal.email, roles: principal.roles })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(principal.userId)
        .setIssuer(options.issuer)
        .setAudience(options.audience)
        .setIssuedAt()
        .setJti(randomUUID())
        .setExpirationTime(`${options.accessTokenTtlSeconds}s`)
        .sign(key);
    },

    async verifyAccessToken(token: string): Promise<Principal> {
      try {
        const { payload } = await jwtVerify(token, key, {
          issuer: options.issuer,
          audience: options.audience,
          algorithms: ['HS256'],
        });
        const claims = claimsSchema.parse(payload);
        return { userId: claims.sub, email: claims.email, roles: claims.roles };
      } catch (error) {
        throw new UnauthorizedError('The access token is invalid or expired.', 'INVALID_TOKEN', {
          cause: error,
        });
      }
    },
  };
}

export type JwtService = ReturnType<typeof createJwtService>;
