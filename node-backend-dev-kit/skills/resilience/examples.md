# Resilience — examples

The outbound client and its test were verified on a copy of `backend-boilerplate/` (typecheck, ESLint,
dependency-cruiser, Vitest). The library itself is verbatim in [references/library.md](references/library.md).

## An outbound dependency — `src/lib/geo-client.ts`

```ts
import { z } from 'zod';
import { ServiceUnavailableError } from './errors.js';
import { createResilientHttpClient } from './http-client.js';

const geoResponseSchema = z.object({ country: z.string().length(2), city: z.string() });
export type GeoLocation = z.infer<typeof geoResponseSchema>;

export interface GeoClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** Outbound dependency: resilient transport + response validation, nothing else. */
export function createGeoClient(options: GeoClientOptions) {
  const http = createResilientHttpClient({
    name: 'geo',
    baseUrl: options.baseUrl,
    timeoutMs: options.timeoutMs ?? 2_000,
    retries: 2,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });

  return {
    breaker: http.breaker,
    async locate(ip: string): Promise<GeoLocation> {
      const response = await http.get(`/v1/ip/${encodeURIComponent(ip)}`);
      const parsed = geoResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new ServiceUnavailableError(
          'geo returned an unexpected payload.',
          'DEPENDENCY_INVALID_RESPONSE',
        );
      }
      return parsed.data;
    },
  };
}

export type GeoClient = ReturnType<typeof createGeoClient>;
```

The client lives in `lib/` (a leaf: it imports only `lib/`), validates the upstream payload with Zod, and
exposes its breaker for health and tests.

## Wiring it — `src/container.ts`

```ts
const geo = createGeoClient({ baseUrl: env.GEO_API_URL });

healthChecks.push({
  name: 'geo',
  critical: false, // the API still works without it: readiness answers 200 'degraded'
  check: async () => {
    if (geo.breaker.state() === 'open') throw new Error('circuit open');
  },
});

const signupService = createSignupService({ users: usersRepository, geo });
```

Add `GEO_API_URL: z.url()` to `envSchema` and `.env.example`. A dependency the API cannot work without is
`critical: true`, and its check calls that dependency's own ping (as `database.ping` does for Postgres).

## Degrading in the service

```ts
import { ServiceUnavailableError } from '../lib/errors.js';
import type { GeoClient, GeoLocation } from '../lib/geo-client.js';

/** Country is nice to have: an unavailable geo service must not block sign-up. */
async function locateOrNull(geo: GeoClient, ip: string): Promise<GeoLocation | null> {
  try {
    return await geo.locate(ip);
  } catch (error) {
    if (error instanceof ServiceUnavailableError) return null; // includes CircuitOpenError
    throw error;
  }
}
```

Only catch when the feature has a defined degraded result. Otherwise let `CircuitOpenError` propagate: the
client gets 503 `DEPENDENCY_UNAVAILABLE` with `Retry-After`. Exhausted retries surface the last
`UpstreamHttpError` or network error, which the error handler renders as a 500 — map it to a
`ServiceUnavailableError` inside the client if callers must see 503 for every upstream failure.

## Testing it — `tests/unit/lib/geo-client.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';
import { createGeoClient } from '../../../src/lib/geo-client.js';
import { CircuitOpenError } from '../../../src/lib/resilience.js';

const ok = () => Response.json({ country: 'PL', city: 'Gdansk' });

describe('GeoClient', () => {
  it('retries a 503 and returns the parsed location', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValue(ok());
    const geo = createGeoClient({ baseUrl: 'http://geo.test', fetchImpl });
    await expect(geo.locate('1.2.3.4')).resolves.toEqual({ country: 'PL', city: 'Gdansk' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 404', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }));
    const geo = createGeoClient({ baseUrl: 'http://geo.test', fetchImpl });
    await expect(geo.locate('1.2.3.4')).rejects.toThrow('HTTP 404');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fails fast once the breaker is open', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));
    const geo = createGeoClient({ baseUrl: 'http://geo.test', fetchImpl });
    for (let i = 0; i < 5; i++) await expect(geo.locate('1.2.3.4')).rejects.toThrow();
    expect(geo.breaker.state()).toBe('open');
    await expect(geo.locate('1.2.3.4')).rejects.toBeInstanceOf(CircuitOpenError);
  });
});
```

Inject `fetchImpl` (and a breaker `now`) instead of starting a fake server or sleeping.

## Passing the request deadline downstream

```ts
// controller: requestTimeout() stored an AbortSignal on res.locals
const signal = res.locals.signal as AbortSignal;
const report = await reports.build(principal, query, signal);

// service / lib: combine it with a per-call timeout
const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(3_000)]) });
```

`createResilientHttpClient(...).get(path)` takes no signal today; add an optional `signal` parameter
combined with `AbortSignal.any` when a call must stop as soon as the client gives up.

## Registering a resource for shutdown — `src/index.ts`

```ts
registerGracefulShutdown({
  server,
  logger,
  lifecycle: container.lifecycle,
  timeoutMs: env.SHUTDOWN_TIMEOUT_MS,
  drainDelayMs: env.SHUTDOWN_DRAIN_DELAY_MS,
  resources: [
    { name: 'queue-consumer', close: () => consumer.stop() }, // stop taking work first
    { name: 'postgres', close: database.close }, // pools last
  ],
});
```

## Health tests — `tests/unit/lib/health.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { createHealthRegistry } from '../../../src/lib/health.js';

const up = () => Promise.resolve();
const down = () => Promise.reject(new Error('connection refused'));

describe('createHealthRegistry', () => {
  it('reports ok when every dependency is up', async () => {
    const report = await createHealthRegistry([
      { name: 'postgres', critical: true, check: up },
    ]).run();
    expect(report.status).toBe('ok');
  });

  it('reports degraded when only an optional dependency is down', async () => {
    const report = await createHealthRegistry([
      { name: 'postgres', critical: true, check: up },
      { name: 'upstream', critical: false, check: down },
    ]).run();
    expect(report.status).toBe('degraded');
    expect(report.checks.find((c) => c.name === 'upstream')).toMatchObject({
      status: 'down',
      error: 'connection refused',
    });
  });

  it('reports down when a critical dependency is down', async () => {
    const report = await createHealthRegistry([
      { name: 'postgres', critical: true, check: down },
    ]).run();
    expect(report.status).toBe('down');
  });

  it('treats a hanging check as down after its timeout', async () => {
    const hang = () => new Promise<void>(() => undefined);
    const report = await createHealthRegistry([
      { name: 'postgres', critical: true, timeoutMs: 20, check: hang },
    ]).run();
    expect(report.status).toBe('down');
  });
});
```
