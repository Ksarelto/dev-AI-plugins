# Test harness — reference

Verbatim from `backend-boilerplate/`.

## `vitest.config.ts`

Two projects. Integration runs files serially (`fileParallelism: false`) against one database, with long hook timeouts for the container start.

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: { NODE_ENV: 'test' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/db/migrate.ts', 'src/db/seed.ts'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          globalSetup: ['tests/setup/global-setup.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
```

## `tests/setup/global-setup.ts`

```ts
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
```

## `tests/helpers/env.ts`

```ts
import { parseEnv, type Env } from '../../src/config/env.js';

export const TEST_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';

/** A complete, valid environment for tests; override only what a test is about. */
export function testEnv(overrides: Record<string, string> = {}): Env {
  return parseEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgres://app:app@localhost:5432/app',
    JWT_SECRET: TEST_JWT_SECRET,
    API_DOCS_ENABLED: 'false',
    ...overrides,
  });
}
```

## `tests/helpers/test-app.ts`

When you add a table, add it to the `truncate` list (FK cascades would catch children of `users`, but listing every table keeps `reset()` explicit).

```ts
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
```

## `tests/helpers/in-memory-repositories.ts`

```ts
import { randomUUID } from 'node:crypto';
import type { RefreshTokenRow, UserRow } from '../../src/db/schema/index.js';
import type { TransactionRunner } from '../../src/db/transaction.js';
import type { Transaction } from '../../src/db/client.js';
import type { RefreshTokensRepository } from '../../src/repositories/refresh-tokens.repository.js';
import type { UsersRepository } from '../../src/repositories/users.repository.js';

/** Fakes that honour the repository contracts, for service unit tests without a database. */
export function createInMemoryRepositories() {
  const userRows = new Map<string, UserRow>();
  const tokenRows = new Map<string, RefreshTokenRow>();

  const users: UsersRepository = {
    findById: (id) => Promise.resolve(userRows.get(id)),
    findByEmail: (email) => Promise.resolve([...userRows.values()].find((u) => u.email === email)),
    create: (values) => {
      if ([...userRows.values()].some((u) => u.email === values.email)) {
        return Promise.reject(Object.assign(new Error('duplicate key'), { code: '23505' }));
      }
      const now = new Date();
      const row: UserRow = {
        id: randomUUID(),
        role: 'user',
        createdAt: now,
        updatedAt: now,
        ...values,
      };
      userRows.set(row.id, row);
      return Promise.resolve(row);
    },
    listPage: ({ limit }) =>
      Promise.resolve(
        [...userRows.values()]
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, limit + 1),
      ),
  };

  const refreshTokens: RefreshTokensRepository = {
    findByHash: (hash) =>
      Promise.resolve([...tokenRows.values()].find((t) => t.tokenHash === hash)),
    create: (values) => {
      const row = { id: randomUUID(), revokedAt: null, createdAt: new Date(), ...values };
      tokenRows.set(row.id, row);
      return Promise.resolve();
    },
    revoke: (id) => {
      const row = tokenRows.get(id);
      if (!row || row.revokedAt) return Promise.resolve(false);
      row.revokedAt = new Date();
      return Promise.resolve(true);
    },
    revokeFamily: (familyId) => {
      for (const row of tokenRows.values()) {
        if (row.familyId === familyId) row.revokedAt ??= new Date();
      }
      return Promise.resolve();
    },
  };

  const transaction: TransactionRunner = (work) => work({} as Transaction);

  return { users, refreshTokens, transaction, userRows, tokenRows };
}
```

## Docker runtimes and CI

Testcontainers finds Docker Desktop on its own. Rancher Desktop or Colima need the socket:

```bash
export DOCKER_HOST=unix://$HOME/.rd/docker.sock            # Colima: unix://$HOME/.colima/default/docker.sock
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock
```

To use an existing database instead (CI service container, no Docker-in-Docker), set
`TEST_DATABASE_URL=postgres://...`; global setup then skips the container and only migrates. The GitHub
Actions workflow runs `npm run test:coverage` on `ubuntu-latest`, whose Docker daemon Testcontainers uses
directly.

Use Node 22 (`nvm use`): the integration project fails to load `undici` on Node 20.
