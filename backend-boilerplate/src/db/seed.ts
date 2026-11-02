import { z } from 'zod';
import { loadEnv } from '../config/env.js';
import { createLogger } from '../lib/logger.js';
import { hashPassword } from '../lib/password.js';
import { createDatabase } from './client.js';
import { users } from './schema/index.js';

/** Development seed: one admin user, idempotent. */
const env = loadEnv();
const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.LOG_PRETTY, name: 'seed' });
const seed = z
  .object({ SEED_ADMIN_EMAIL: z.email(), SEED_ADMIN_PASSWORD: z.string().min(12) })
  .parse(process.env);
const database = createDatabase({ url: env.DATABASE_URL, maxConnections: 1 });

try {
  await database.db
    .insert(users)
    .values({
      email: seed.SEED_ADMIN_EMAIL.toLowerCase(),
      passwordHash: await hashPassword(seed.SEED_ADMIN_PASSWORD),
      displayName: 'Administrator',
      role: 'admin',
    })
    .onConflictDoNothing({ target: users.email });
  logger.info({ email: seed.SEED_ADMIN_EMAIL }, 'admin user ensured');
} catch (error) {
  logger.error({ err: error }, 'seed failed');
  process.exitCode = 1;
} finally {
  await database.close();
}
