import { sql } from 'drizzle-orm';
import type { Express } from 'express';
import { inject } from 'vitest';
import { createApp } from '../../src/app.js';
import { createContainer, type ContainerOptions } from '../../src/container.js';
import { createDatabase, type DatabaseHandle } from '../../src/db/client.js';
import { users } from '../../src/db/schema/index.js';
import { createLogger } from '../../src/lib/logger.js';
import { hashPassword } from '../../src/lib/password.js';
import { testEnv } from './env.js';

export interface TestApp {
  app: Express;
  database: DatabaseHandle;
  reset: () => Promise<void>;
  createAdmin: (email: string, password: string) => Promise<void>;
  close: () => Promise<void>;
}

/** The real app wired to the integration database, exactly as `src/index.ts` wires it. */
export function createTestApp(
  options: ContainerOptions & { env?: Record<string, string> } = {},
): TestApp {
  const env = testEnv({ DATABASE_URL: inject('databaseUrl'), ...options.env });
  const database = createDatabase({ url: env.DATABASE_URL, maxConnections: 5 });
  const container = createContainer(env, database, options);
  const app = createApp(env, createLogger({ level: 'silent', pretty: false }), container);

  return {
    app,
    database,
    reset: async () => {
      await database.db.execute(sql`truncate table refresh_tokens, users restart identity cascade`);
    },
    createAdmin: async (email, password) => {
      await database.db.insert(users).values({
        email,
        passwordHash: await hashPassword(password),
        displayName: 'Admin',
        role: 'admin',
      });
    },
    close: database.close,
  };
}
