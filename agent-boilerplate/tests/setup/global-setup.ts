import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { setupCheckpointer } from '../../src/memory/checkpointer.js';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/** Postgres with pgvector (Testcontainers, or TEST_DATABASE_URL), migrated exactly like production. */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  let container: StartedPostgreSqlContainer | undefined;
  let databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg17').start();
    databaseUrl = container.getConnectionUri();
  }

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  await migrate(drizzle({ client: pool }), { migrationsFolder: 'drizzle' });
  await setupCheckpointer(pool);
  await pool.end();

  project.provide('databaseUrl', databaseUrl);
  return async () => {
    await container?.stop();
  };
}
