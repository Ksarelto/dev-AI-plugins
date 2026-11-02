import { and, desc, eq } from 'drizzle-orm';
import type { Database, DbExecutor } from '../db/client.js';
import { threads, type ThreadRow } from '../db/schema/index.js';

export function createThreadsRepository(db: Database) {
  return {
    async create(
      values: { userId: string; title?: string },
      executor: DbExecutor = db,
    ): Promise<ThreadRow> {
      const [row] = await executor.insert(threads).values(values).returning();
      if (!row) throw new Error('insert into threads returned no row');
      return row;
    },

    /** Ownership is part of the lookup: another user's thread is indistinguishable from a missing one. */
    async findOwned(
      id: string,
      userId: string,
      executor: DbExecutor = db,
    ): Promise<ThreadRow | undefined> {
      const [row] = await executor
        .select()
        .from(threads)
        .where(and(eq(threads.id, id), eq(threads.userId, userId)))
        .limit(1);
      return row;
    },

    async listByUser(
      userId: string,
      limit: number,
      executor: DbExecutor = db,
    ): Promise<ThreadRow[]> {
      return executor
        .select()
        .from(threads)
        .where(eq(threads.userId, userId))
        .orderBy(desc(threads.createdAt))
        .limit(limit);
    },

    async touch(id: string, executor: DbExecutor = db): Promise<void> {
      await executor.update(threads).set({ updatedAt: new Date() }).where(eq(threads.id, id));
    },
  };
}

export type ThreadsRepository = ReturnType<typeof createThreadsRepository>;
