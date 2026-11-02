import { z } from 'zod';
import type { ValidationSchemas } from '../middleware/validate.js';
import type { Page, User } from '../services/users.service.js';

/** Response DTO. Dates are ISO strings on the wire. */
export const userResponseSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    displayName: z.string(),
    role: z.enum(['user', 'admin']),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'User' });
export type UserResponse = z.infer<typeof userResponseSchema>;

export const userPageResponseSchema = z.object({
  items: z.array(userResponseSchema),
  nextCursor: z.string().nullable(),
});

export const listUsersRequest = {
  query: z
    .object({
      limit: z.coerce.number().int().min(1).max(100).default(20),
      cursor: z.string().min(1).max(512).optional(),
    })
    .strict(),
} satisfies ValidationSchemas;

export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toUserPageResponse(page: Page<User>): z.infer<typeof userPageResponseSchema> {
  return { items: page.items.map(toUserResponse), nextCursor: page.nextCursor };
}
