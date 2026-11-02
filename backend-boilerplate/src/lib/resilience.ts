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
