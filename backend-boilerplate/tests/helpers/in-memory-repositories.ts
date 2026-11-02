import { randomUUID } from 'node:crypto';
import type { RefreshTokenRow, UserRow } from '../../src/db/schema/index.js';
import type { TransactionRunner } from '../../src/db/transaction.js';
import type { Transaction } from '../../src/db/client.js';
import type { RefreshTokensRepository } from '../../src/repositories/refresh-tokens.repository.js';
import type { UsersRepository } from '../../src/repositories/users.repository.js';

/** Fakes that honour the repository contracts, for service unit tests without a database. */
export function createInMemoryRepositories() {
  const userRows = new Map<string, UserRow>();
  const tokenRows = new Map<string, RefreshTokenRow>();

  const users: UsersRepository = {
    findById: (id) => Promise.resolve(userRows.get(id)),
    findByEmail: (email) => Promise.resolve([...userRows.values()].find((u) => u.email === email)),
    create: (values) => {
      if ([...userRows.values()].some((u) => u.email === values.email)) {
        return Promise.reject(Object.assign(new Error('duplicate key'), { code: '23505' }));
      }
      const now = new Date();
      const row: UserRow = {
        id: randomUUID(),
        role: 'user',
        createdAt: now,
        updatedAt: now,
        ...values,
      };
      userRows.set(row.id, row);
      return Promise.resolve(row);
    },
    listPage: ({ limit }) =>
      Promise.resolve(
        [...userRows.values()]
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, limit + 1),
      ),
  };

  const refreshTokens: RefreshTokensRepository = {
    findByHash: (hash) =>
      Promise.resolve([...tokenRows.values()].find((t) => t.tokenHash === hash)),
    create: (values) => {
      const row = { id: randomUUID(), revokedAt: null, createdAt: new Date(), ...values };
      tokenRows.set(row.id, row);
      return Promise.resolve();
    },
    revoke: (id) => {
      const row = tokenRows.get(id);
      if (!row || row.revokedAt) return Promise.resolve(false);
      row.revokedAt = new Date();
      return Promise.resolve(true);
    },
    revokeFamily: (familyId) => {
      for (const row of tokenRows.values()) {
        if (row.familyId === familyId) row.revokedAt ??= new Date();
      }
      return Promise.resolve();
    },
  };

  const transaction: TransactionRunner = (work) => work({} as Transaction);

  return { users, refreshTokens, transaction, userRows, tokenRows };
}
