import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createContainer } from './container.js';
import { createDatabase } from './db/client.js';
import { createLogger } from './lib/logger.js';
import { registerGracefulShutdown } from './lib/shutdown.js';
import { startServer } from './server.js';

const env = loadEnv();
const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.LOG_PRETTY });
const database = createDatabase({ url: env.DATABASE_URL, maxConnections: env.DATABASE_POOL_MAX });

// Start even if Postgres is still coming up: readiness stays 503 until it answers.
await database.ping().catch((error: unknown) => {
  logger.warn({ err: error }, 'database not reachable yet; readiness will report down');
});

const container = createContainer(env, database);
const app = createApp(env, logger, container);
const server = await startServer(app, { host: env.HOST, port: env.PORT });

registerGracefulShutdown({
  server,
  logger,
  lifecycle: container.lifecycle,
  timeoutMs: env.SHUTDOWN_TIMEOUT_MS,
  drainDelayMs: env.SHUTDOWN_DRAIN_DELAY_MS,
  resources: [{ name: 'postgres', close: database.close }],
});

logger.info({ host: env.HOST, port: env.PORT, env: env.NODE_ENV }, 'server listening');
