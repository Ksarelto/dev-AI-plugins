import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export interface DatabaseOptions {
  url: string;
  maxConnections?: number;
}

/** One pool per process. Every repository receives `db` (or a transaction) from the composition root. */
export function createDatabase(options: DatabaseOptions) {
  const sql = postgres(options.url, {
    max: options.maxConnections ?? 10,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => undefined,
  });
  const db = drizzle({ client: sql, schema });

  return {
    db,
    ping: async (): Promise<void> => {
      await sql`select 1`;
    },
    close: async (): Promise<void> => {
      await sql.end({ timeout: 5 });
    },
  };
}

export type DatabaseHandle = ReturnType<typeof createDatabase>;
export type Database = DatabaseHandle['db'];
/** A transaction handle has the same query API as `db`. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Repositories accept either, so services decide the transaction boundary. */
export type DbExecutor = Database | Transaction;
