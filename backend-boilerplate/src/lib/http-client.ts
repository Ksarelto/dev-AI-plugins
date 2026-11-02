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
