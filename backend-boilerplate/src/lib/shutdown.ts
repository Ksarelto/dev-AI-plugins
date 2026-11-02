import type { Server } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Lifecycle } from './lifecycle.js';
import type { Logger } from './logger.js';

export interface ShutdownOptions {
  server: Server;
  logger: Logger;
  lifecycle: Lifecycle;
  timeoutMs: number;
  /** Time for load balancers to see the failing readiness probe before the listener closes. */
  drainDelayMs: number;
  /** Closed in order after the HTTP server stops (db pool, queues, telemetry). */
  resources: { name: string; close: () => Promise<void> }[];
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
    server.closeIdleConnections();
  });
}

/**
 * SIGTERM/SIGINT → mark not-ready → drain delay → stop accepting and finish in-flight
 * requests → close resources → exit. A timer forces exit if anything hangs.
 * Fatal process errors take the same path with exit code 1.
 */
export function registerGracefulShutdown(
  options: ShutdownOptions,
): (reason: string) => Promise<void> {
  const { server, logger, lifecycle, timeoutMs, drainDelayMs, resources } = options;
  let exitCode = 0;
  let running: Promise<void> | undefined;

  const shutdown = (reason: string): Promise<void> => {
    running ??= (async () => {
      lifecycle.markShuttingDown();
      logger.info({ reason }, 'shutdown started');
      const forceExit = setTimeout(() => {
        logger.error({ timeoutMs }, 'shutdown timed out, forcing exit');
        server.closeAllConnections();
        process.exit(1);
      }, timeoutMs);
      forceExit.unref();

      try {
        if (drainDelayMs > 0) await sleep(drainDelayMs);
        await closeServer(server);
        for (const resource of resources) {
          await resource.close();
          logger.info({ resource: resource.name }, 'resource closed');
        }
        logger.info('shutdown complete');
      } catch (error) {
        exitCode = 1;
        logger.error({ err: error }, 'shutdown failed');
      } finally {
        clearTimeout(forceExit);
        process.exit(exitCode);
      }
    })();
    return running;
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    exitCode = 1;
    logger.fatal({ err: reason }, 'unhandled promise rejection');
    void shutdown('unhandledRejection');
  });
  process.on('uncaughtException', (error) => {
    exitCode = 1;
    logger.fatal({ err: error }, 'uncaught exception');
    void shutdown('uncaughtException');
  });

  return shutdown;
}
