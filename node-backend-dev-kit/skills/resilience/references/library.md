# Resilience library — reference

Verbatim from `backend-boilerplate/`.

## `src/lib/resilience.ts` — `withTimeout`, `retry`, `createCircuitBreaker`

```ts
import { setTimeout as sleep } from 'node:timers/promises';
import { ServiceUnavailableError } from './errors.js';

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms} ms`);
    this.name = 'TimeoutError';
  }
}

/** Rejects with TimeoutError if `promise` does not settle within `ms`. */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = 'operation',
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError(label, ms));
    }, ms);
    timer.unref();
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export interface RetryOptions {
  retries: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Return false for errors that will never succeed (4xx, validation, business rules). */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

/** Exponential backoff with full jitter. Only wrap idempotent operations. */
export async function retry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const {
    retries,
    baseDelayMs = 100,
    maxDelayMs = 2_000,
    shouldRetry = () => true,
    onRetry,
  } = options;
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt >= retries || !shouldRetry(error, attempt)) throw error;
      const delayMs = Math.round(Math.random() * Math.min(maxDelayMs, baseDelayMs * 2 ** attempt));
      onRetry?.(error, attempt + 1, delayMs);
      await sleep(delayMs);
    }
  }
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  name: string;
  /** Consecutive failures that open the circuit. */
  failureThreshold?: number;
  /** How long the circuit stays open before one trial call is allowed. */
  resetTimeoutMs?: number;
  now?: () => number;
}

export class CircuitOpenError extends ServiceUnavailableError {
  constructor(name: string, retryAfterSeconds: number) {
    super(`${name} is temporarily unavailable.`, 'DEPENDENCY_UNAVAILABLE', retryAfterSeconds);
  }
}

export interface CircuitBreaker {
  readonly name: string;
  state(): CircuitState;
  execute<T>(operation: () => Promise<T>): Promise<T>;
}

/**
 * Fails fast while a dependency is down so requests degrade quickly instead of piling up
 * behind timeouts. closed → (N failures) → open → (reset timeout) → half-open → closed | open.
 */
export function createCircuitBreaker(options: CircuitBreakerOptions): CircuitBreaker {
  const { name, failureThreshold = 5, resetTimeoutMs = 30_000, now = Date.now } = options;
  let state: CircuitState = 'closed';
  let failures = 0;
  let openedAt = 0;
  let trialInFlight = false;

  const currentState = (): CircuitState => {
    if (state === 'open' && now() - openedAt >= resetTimeoutMs) state = 'half-open';
    return state;
  };

  return {
    name,
    state: currentState,
    async execute<T>(operation: () => Promise<T>): Promise<T> {
      const s = currentState();
      if (s === 'open' || (s === 'half-open' && trialInFlight)) {
        const remainingMs = Math.max(0, resetTimeoutMs - (now() - openedAt));
        throw new CircuitOpenError(name, Math.max(1, Math.ceil(remainingMs / 1000)));
      }
      trialInFlight = s === 'half-open';
      try {
        const result = await operation();
        state = 'closed';
        failures = 0;
        return result;
      } catch (error) {
        failures += 1;
        if (s === 'half-open' || failures >= failureThreshold) {
          state = 'open';
          openedAt = now();
        }
        throw error;
      } finally {
        trialInFlight = false;
      }
    },
  };
}
```

## `src/lib/http-client.ts` — `createResilientHttpClient`

```ts
import { createCircuitBreaker, retry, type CircuitBreaker } from './resilience.js';

export interface ResilientHttpClientOptions {
  name: string;
  baseUrl: string;
  timeoutMs?: number;
  retries?: number;
  breaker?: CircuitBreaker;
  fetchImpl?: typeof fetch;
}

export class UpstreamHttpError extends Error {
  readonly status: number;

  constructor(name: string, status: number) {
    super(`${name} responded with HTTP ${status}`);
    this.name = 'UpstreamHttpError';
    this.status = status;
  }
}

const isRetryable = (error: unknown): boolean =>
  !(error instanceof UpstreamHttpError) || error.status >= 500 || error.status === 429;

/**
 * Outbound HTTP for idempotent calls: per-attempt timeout, retry with jitter on network
 * errors / 5xx / 429, and a circuit breaker around the whole thing.
 */
export function createResilientHttpClient(options: ResilientHttpClientOptions) {
  const {
    name,
    baseUrl,
    timeoutMs = 3_000,
    retries = 2,
    breaker = createCircuitBreaker({ name }),
    fetchImpl = fetch,
  } = options;

  async function get(path: string): Promise<Response> {
    return breaker.execute(() =>
      retry(
        async () => {
          const response = await fetchImpl(new URL(path, baseUrl), {
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (!response.ok) throw new UpstreamHttpError(name, response.status);
          return response;
        },
        { retries, shouldRetry: isRetryable },
      ),
    );
  }

  return { name, breaker, get };
}

export type ResilientHttpClient = ReturnType<typeof createResilientHttpClient>;
```

## `src/lib/health.ts` — `createHealthRegistry`

```ts
import { withTimeout } from './resilience.js';

export interface HealthCheck {
  name: string;
  /** A critical dependency down → not ready (503). A non-critical one down → degraded (200). */
  critical: boolean;
  timeoutMs?: number;
  check: () => Promise<void>;
}

export type HealthStatus = 'ok' | 'degraded' | 'down';

export interface HealthCheckResult {
  name: string;
  critical: boolean;
  status: 'up' | 'down';
  latencyMs: number;
  error?: string;
}

export interface HealthReport {
  status: HealthStatus;
  checks: HealthCheckResult[];
}

async function runCheck(check: HealthCheck): Promise<HealthCheckResult> {
  const started = performance.now();
  const base = { name: check.name, critical: check.critical };
  try {
    await withTimeout(check.check(), check.timeoutMs ?? 2_000, `${check.name} health check`);
    return { ...base, status: 'up', latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    return {
      ...base,
      status: 'down',
      latencyMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function createHealthRegistry(checks: HealthCheck[]) {
  return {
    async run(): Promise<HealthReport> {
      const results = await Promise.all(checks.map(runCheck));
      const criticalDown = results.some((r) => r.critical && r.status === 'down');
      const anyDown = results.some((r) => r.status === 'down');
      return { status: criticalDown ? 'down' : anyDown ? 'degraded' : 'ok', checks: results };
    },
  };
}

export type HealthRegistry = ReturnType<typeof createHealthRegistry>;
```

## `src/controllers/health.controller.ts`

```ts
import type { RequestHandler } from 'express';
import type { HealthRegistry } from '../lib/health.js';
import type { Lifecycle } from '../lib/lifecycle.js';

export function createHealthController(health: HealthRegistry, lifecycle: Lifecycle) {
  /** Liveness: the process can serve HTTP. Never checks dependencies (that would restart healthy pods). */
  const live: RequestHandler = (_req, res) => {
    res.json({ status: 'ok' });
  };

  /** Readiness: 503 while shutting down or when a critical dependency is down; 200 `degraded` otherwise. */
  const ready: RequestHandler = async (_req, res) => {
    if (lifecycle.isShuttingDown()) {
      res.status(503).json({ status: 'shutting_down', checks: [] });
      return;
    }
    const report = await health.run();
    res.status(report.status === 'down' ? 503 : 200).json(report);
  };

  return { live, ready };
}

export type HealthController = ReturnType<typeof createHealthController>;
```

## `src/routes/health.routes.ts`

```ts
import { Router } from 'express';
import type { HealthController } from '../controllers/health.controller.js';

export function createHealthRouter(controller: HealthController): Router {
  const router = Router();
  router.get('/health/live', controller.live);
  router.get('/health/ready', controller.ready);
  return router;
}
```

## `src/lib/lifecycle.ts`

```ts
/** Shared shutdown flag: readiness turns 503 as soon as shutdown starts, before connections close. */
export function createLifecycle() {
  let shuttingDown = false;
  return {
    isShuttingDown: (): boolean => shuttingDown,
    markShuttingDown: (): void => {
      shuttingDown = true;
    },
  };
}

export type Lifecycle = ReturnType<typeof createLifecycle>;
```

## `src/lib/shutdown.ts` — `registerGracefulShutdown`

```ts
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
```

## `src/middleware/timeout.ts` — `requestTimeout`

```ts
import type { RequestHandler } from 'express';
import { ServiceUnavailableError } from '../lib/errors.js';

/**
 * Answers 503 when a handler runs longer than `ms`, so clients and proxies are not left
 * hanging. Handlers that call slow dependencies can pass `res.locals.signal` downstream
 * to stop work that nobody is waiting for anymore.
 */
export function requestTimeout(ms: number): RequestHandler {
  return (_req, res, next) => {
    const controller = new AbortController();
    res.locals.signal = controller.signal;
    const timer = setTimeout(() => {
      controller.abort();
      if (!res.headersSent) {
        next(new ServiceUnavailableError('The request timed out.', 'REQUEST_TIMEOUT', 1));
      }
    }, ms);
    timer.unref();
    const clear = () => {
      clearTimeout(timer);
    };
    res.once('finish', clear);
    res.once('close', () => {
      clear();
      if (!res.writableFinished) controller.abort();
    });
    next();
  };
}
```

## Tests — `tests/unit/lib/resilience.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  CircuitOpenError,
  TimeoutError,
  createCircuitBreaker,
  retry,
  withTimeout,
} from '../../../src/lib/resilience.js';

describe('withTimeout', () => {
  it('resolves when the operation finishes in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50)).resolves.toBe('ok');
  });

  it('rejects with TimeoutError when the operation is too slow', async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 200));
    await expect(withTimeout(slow, 10, 'slow call')).rejects.toBeInstanceOf(TimeoutError);
  });
});

describe('retry', () => {
  it('retries until the operation succeeds', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('flaky'))
      .mockResolvedValue('done');
    await expect(retry(operation, { retries: 2, baseDelayMs: 1 })).resolves.toBe('done');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry errors that shouldRetry rejects', async () => {
    const operation = vi.fn<() => Promise<never>>().mockRejectedValue(new Error('permanent'));
    await expect(
      retry(operation, { retries: 3, baseDelayMs: 1, shouldRetry: () => false }),
    ).rejects.toThrow('permanent');
    expect(operation).toHaveBeenCalledTimes(1);
  });
});

describe('createCircuitBreaker', () => {
  it('opens after the failure threshold, fails fast, then recovers through half-open', async () => {
    let clock = 0;
    const breaker = createCircuitBreaker({
      name: 'upstream',
      failureThreshold: 2,
      resetTimeoutMs: 1_000,
      now: () => clock,
    });
    const failing = () => Promise.reject(new Error('down'));

    await expect(breaker.execute(failing)).rejects.toThrow('down');
    await expect(breaker.execute(failing)).rejects.toThrow('down');
    expect(breaker.state()).toBe('open');

    const operation = vi.fn(() => Promise.resolve('ok'));
    await expect(breaker.execute(operation)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(operation).not.toHaveBeenCalled();

    clock = 1_000;
    expect(breaker.state()).toBe('half-open');
    await expect(breaker.execute(operation)).resolves.toBe('ok');
    expect(breaker.state()).toBe('closed');
  });

  it('re-opens when the half-open trial fails', async () => {
    let clock = 0;
    const breaker = createCircuitBreaker({
      name: 'upstream',
      failureThreshold: 1,
      resetTimeoutMs: 100,
      now: () => clock,
    });
    await expect(breaker.execute(() => Promise.reject(new Error('down')))).rejects.toThrow();
    clock = 100;
    await expect(breaker.execute(() => Promise.reject(new Error('still down')))).rejects.toThrow(
      'still down',
    );
    expect(breaker.state()).toBe('open');
  });
});
```
