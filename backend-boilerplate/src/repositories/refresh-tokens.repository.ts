import { and, eq, isNull } from 'drizzle-orm';
import type { Database, DbExecutor } from '../db/client.js';
import {
  refreshTokens,
  type NewRefreshTokenRow,
  type RefreshTokenRow,
} from '../db/schema/index.js';

export function createRefreshTokensRepository(db: Database) {
  return {
    async findByHash(
      tokenHash: string,
      executor: DbExecutor = db,
    ): Promise<RefreshTokenRow | undefined> {
      const [row] = await executor
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash))
        .limit(1);
      return row;
    },

    async create(values: NewRefreshTokenRow, executor: DbExecutor = db): Promise<void> {
      await executor.insert(refreshTokens).values(values);
    },

    /** Marks the token revoked only if it still is active; returns false if another request won the race. */
    async revoke(id: string, executor: DbExecutor = db): Promise<boolean> {
      const rows = await executor
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.revokedAt)))
        .returning({ id: refreshTokens.id });
      return rows.length === 1;
    },

    async revokeFamily(familyId: string, executor: DbExecutor = db): Promise<void> {
      await executor
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
    },
  };
}

export type RefreshTokensRepository = ReturnType<typeof createRefreshTokensRepository>;
