import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/**
 * One real Postgres for the integration project: Testcontainers by default, or an existing
 * database via TEST_DATABASE_URL (CI service containers). Migrations run once, as in production.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  let container: StartedPostgreSqlContainer | undefined;
  let databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    databaseUrl = container.getConnectionUri();
  }

  const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
  await migrate(drizzle({ client: sql }), { migrationsFolder: 'drizzle' });
  await sql.end();

  project.provide('databaseUrl', databaseUrl);
  return async () => {
    await container?.stop();
  };
}
