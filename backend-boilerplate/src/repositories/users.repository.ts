import { and, desc, eq, lt, or } from 'drizzle-orm';
import type { Database, DbExecutor } from '../db/client.js';
import { users, type NewUserRow, type UserRow } from '../db/schema/index.js';

export interface UserPageQuery {
  limit: number;
  after?: { createdAt: Date; id: string } | undefined;
}

/** Data access only: no business rules, no HTTP, no error mapping. */
export function createUsersRepository(db: Database) {
  return {
    async findById(id: string, executor: DbExecutor = db): Promise<UserRow | undefined> {
      const [row] = await executor.select().from(users).where(eq(users.id, id)).limit(1);
      return row;
    },

    async findByEmail(email: string, executor: DbExecutor = db): Promise<UserRow | undefined> {
      const [row] = await executor.select().from(users).where(eq(users.email, email)).limit(1);
      return row;
    },

    async create(values: NewUserRow, executor: DbExecutor = db): Promise<UserRow> {
      const [row] = await executor.insert(users).values(values).returning();
      if (!row) throw new Error('insert into users returned no row');
      return row;
    },

    /** Keyset pagination, newest first. Fetches one extra row to know whether a next page exists. */
    async listPage(query: UserPageQuery, executor: DbExecutor = db): Promise<UserRow[]> {
      const after = query.after;
      return executor
        .select()
        .from(users)
        .where(
          after
            ? or(
                lt(users.createdAt, after.createdAt),
                and(eq(users.createdAt, after.createdAt), lt(users.id, after.id)),
              )
            : undefined,
        )
        .orderBy(desc(users.createdAt), desc(users.id))
        .limit(query.limit + 1);
    },
  };
}

export type UsersRepository = ReturnType<typeof createUsersRepository>;
