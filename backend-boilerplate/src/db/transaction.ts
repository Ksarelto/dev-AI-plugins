import type { Database, Transaction } from './client.js';

/** Services own transaction boundaries through this runner; tests swap in a pass-through. */
export type TransactionRunner = <T>(work: (tx: Transaction) => Promise<T>) => Promise<T>;

export function createTransactionRunner(db: Database): TransactionRunner {
  return (work) => db.transaction(work);
}
