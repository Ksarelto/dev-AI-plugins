import { randomUUID } from 'node:crypto';
import type { ThreadRow } from '../../src/db/schema/index.js';
import type { ThreadsRepository } from '../../src/repositories/threads.repository.js';

export function createInMemoryThreads(): ThreadsRepository {
  const rows = new Map<string, ThreadRow>();
  return {
    create: ({ userId, title }) => {
      const now = new Date();
      const row: ThreadRow = {
        id: randomUUID(),
        userId,
        title: title ?? 'New conversation',
        createdAt: now,
        updatedAt: now,
      };
      rows.set(row.id, row);
      return Promise.resolve(row);
    },
    findOwned: (id, userId) => {
      const row = rows.get(id);
      return Promise.resolve(row?.userId === userId ? row : undefined);
    },
    listByUser: (userId) => Promise.resolve([...rows.values()].filter((r) => r.userId === userId)),
    touch: () => Promise.resolve(),
  };
}
