import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

export interface DatabaseOptions {
  url: string;
  maxConnections?: number;
}

/**
 * One node-postgres pool per process, shared by Drizzle (threads, knowledge) and the
 * LangGraph PostgresSaver (checkpoints), so shutdown closes a single resource.
 */
export function createDatabase(options: DatabaseOptions) {
  const pool = new pg.Pool({
    connectionString: options.url,
    max: options.maxConnections ?? 10,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
  });
  const db = drizzle({ client: pool, schema });

  return {
    db,
    pool,
    ping: async (): Promise<void> => {
      await pool.query('select 1');
    },
    close: async (): Promise<void> => {
      await pool.end();
    },
  };
}

export type DatabaseHandle = ReturnType<typeof createDatabase>;
export type Database = DatabaseHandle['db'];
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DbExecutor = Database | Transaction;
