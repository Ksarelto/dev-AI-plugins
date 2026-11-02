import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadEnv } from '../config/env.js';
import { createLogger } from '../lib/logger.js';
import { setupCheckpointer } from '../memory/checkpointer.js';
import { createDatabase } from './client.js';

/** Applies Drizzle SQL migrations (pgvector extension, threads, knowledge), then the checkpointer tables. */
const env = loadEnv();
const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.LOG_PRETTY, name: 'migrate' });
const database = createDatabase({ url: env.DATABASE_URL, maxConnections: 1 });

try {
  await migrate(database.db, { migrationsFolder: 'drizzle' });
  await setupCheckpointer(database.pool);
  logger.info('migrations applied');
} catch (error) {
  logger.error({ err: error }, 'migration failed');
  process.exitCode = 1;
} finally {
  await database.close();
}
