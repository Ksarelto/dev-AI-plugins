import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { loadEnv } from '../config/env.js';
import { createLogger } from '../lib/logger.js';
import { createDatabase } from './client.js';

/** Applies committed SQL migrations from ./drizzle. Run before the API starts (compose `migrate` service). */
const env = loadEnv();
const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.LOG_PRETTY, name: 'migrate' });
const database = createDatabase({ url: env.DATABASE_URL, maxConnections: 1 });

try {
  await migrate(database.db, { migrationsFolder: 'drizzle' });
  logger.info('migrations applied');
} catch (error) {
  logger.error({ err: error }, 'migration failed');
  process.exitCode = 1;
} finally {
  await database.close();
}
