import type { Database, Transaction } from './client.js';

export type TransactionRunner = <T>(work: (tx: Transaction) => Promise<T>) => Promise<T>;

export function createTransactionRunner(db: Database): TransactionRunner {
  return (work) => db.transaction(work);
}
