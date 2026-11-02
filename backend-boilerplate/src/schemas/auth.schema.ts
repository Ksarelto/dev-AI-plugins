import { z } from 'zod';
import type { ValidationSchemas } from '../middleware/validate.js';
import type { AuthResult } from '../services/auth.service.js';
import { toUserResponse, userResponseSchema } from './user.schema.js';

const email = z.email().max(320);
/** Length over composition rules (NIST 800-63B); the upper bound caps hashing cost. */
const password = z.string().min(12).max(128);

export const registerBodySchema = z
  .object({ email, password, displayName: z.string().trim().min(1).max(100) })
  .strict();
export const loginBodySchema = z.object({ email, password: z.string().min(1).max(128) }).strict();
export const refreshBodySchema = z.object({ refreshToken: z.string().min(1).max(512) }).strict();

export const registerRequest = { body: registerBodySchema } satisfies ValidationSchemas;
export const loginRequest = { body: loginBodySchema } satisfies ValidationSchemas;
export const refreshRequest = { body: refreshBodySchema } satisfies ValidationSchemas;

export const authResponseSchema = z
  .object({
    user: userResponseSchema,
    accessToken: z.string(),
    refreshToken: z.string(),
    tokenType: z.literal('Bearer'),
    expiresIn: z.number().int(),
  })
  .meta({ id: 'AuthResponse' });

export function toAuthResponse(result: AuthResult): z.infer<typeof authResponseSchema> {
  return { user: toUserResponse(result.user), ...result.tokens };
}
