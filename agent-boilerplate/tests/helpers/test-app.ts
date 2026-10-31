import { SyntheticEmbeddings } from '@langchain/core/utils/testing';
import { sql } from 'drizzle-orm';
import type { Express } from 'express';
import { inject } from 'vitest';
import { createApp } from '../../src/app.js';
import { createContainer, type ContainerOptions } from '../../src/container.js';
import { createDatabase, type DatabaseHandle } from '../../src/db/client.js';
import { EMBEDDING_DIMENSIONS } from '../../src/db/schema/index.js';
import { createJwtService, type Role } from '../../src/lib/jwt.js';
import { createLogger } from '../../src/lib/logger.js';
import { TEST_JWT_SECRET, testEnv } from './env.js';

export interface TestApp {
  app: Express;
  database: DatabaseHandle;
  token: (userId: string, role?: Role) => Promise<string>;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

const jwt = createJwtService({
  secret: TEST_JWT_SECRET,
  issuer: 'backend-boilerplate',
  audience: 'backend-boilerplate-api',
  accessTokenTtlSeconds: 300,
});

/**
 * The real app on the integration database with the real Postgres checkpointer and hybrid
 * search. Only the network-bound parts are replaced: a scripted model and synthetic embeddings.
 */
export function createTestApp(options: ContainerOptions = {}): TestApp {
  const env = testEnv({ DATABASE_URL: inject('databaseUrl') });
  const database = createDatabase({ url: env.DATABASE_URL, maxConnections: 5 });
  const logger = createLogger({ level: 'silent', pretty: false });
  const container = createContainer(env, logger, database, {
    embeddings: new SyntheticEmbeddings({ vectorSize: EMBEDDING_DIMENSIONS }),
    chatModel: null,
    ...options,
  });

  return {
    app: createApp(env, logger, container),
    database,
    token: (userId, role = 'user') =>
      jwt.signAccessToken({ userId, email: `${userId}@example.com`, roles: [role] }),
    reset: async () => {
      await database.db.execute(sql`truncate table chunks, documents, threads cascade`);
    },
    close: database.close,
  };
}
