import type { UserRow } from '../db/schema/index.js';
import { decodeCursor, encodeCursor } from '../lib/cursor.js';
import { NotFoundError } from '../lib/errors.js';
import type { Role } from '../lib/jwt.js';
import type { UsersRepository } from '../repositories/users.repository.js';

/** The domain view of a user. The password hash never leaves the service layer. */
export interface User {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  createdAt: Date;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    createdAt: row.createdAt,
  };
}

export interface UsersServiceDeps {
  users: UsersRepository;
}

export function createUsersService({ users }: UsersServiceDeps) {
  return {
    async getById(id: string): Promise<User> {
      const row = await users.findById(id);
      if (!row) throw new NotFoundError('User not found.', 'USER_NOT_FOUND');
      return toUser(row);
    },

    async list(query: { limit: number; cursor?: string | undefined }): Promise<Page<User>> {
      const after = query.cursor ? decodeCursor(query.cursor) : undefined;
      const rows = await users.listPage({ limit: query.limit, after });
      const hasMore = rows.length > query.limit;
      const items = rows.slice(0, query.limit).map(toUser);
      const last = items.at(-1);
      return {
        items,
        nextCursor:
          hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
      };
    },
  };
}

export type UsersService = ReturnType<typeof createUsersService>;
