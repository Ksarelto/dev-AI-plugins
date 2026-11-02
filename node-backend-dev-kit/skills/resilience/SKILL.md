---
name: resilience
description: Make outbound calls and dependencies fail gracefully in a Node API — a timeout on every call (withTimeout), retry with exponential backoff and jitter, a circuit breaker (createCircuitBreaker), createResilientHttpClient, critical vs optional readiness checks with createHealthRegistry, request deadlines with AbortSignal, graceful shutdown on SIGTERM. Use when calling an external HTTP API, adding a health check, or handling timeouts, retries, degraded mode or shutdown.
---

# Resilience and graceful degradation

## When to use

- The service calls another HTTP API, a queue, a cache, or any dependency that can be slow or down
- Adding or changing `/health/ready` checks, liveness, or startup behaviour
- Adding a pool, consumer or interval that must stop cleanly on shutdown
- Not for rate limiting incoming traffic — `security-middleware` skill

Hard constraints: `rules/resilience.mdc`, `rules/error-handling.mdc`. Code: [examples.md](examples.md). Library source (`resilience.ts`, `http-client.ts`, `health.ts`, `shutdown.ts`, `timeout.ts`): [references/library.md](references/library.md).

## Toolbox

| Need | Use | Defaults |
|---|---|---|
| Bound any promise | `withTimeout(promise, ms, label)` → `TimeoutError` | — |
| Retry idempotent work | `retry(op, { retries, baseDelayMs, maxDelayMs, shouldRetry, onRetry })` | 100 ms base, 2 s cap, full jitter |
| Fail fast while down | `createCircuitBreaker({ name, failureThreshold, resetTimeoutMs, now })` | 5 failures, 30 s open; open → `CircuitOpenError` (503 + `Retry-After`) |
| Outbound HTTP GET | `createResilientHttpClient({ name, baseUrl, timeoutMs, retries, breaker, fetchImpl })` | 3 s per attempt, 2 retries on network / 5xx / 429 |
| Readiness | `createHealthRegistry([{ name, critical, timeoutMs, check }])` | 2 s per check; critical down → `down` (503), optional down → `degraded` (200) |
| Request deadline | `requestTimeout(REQUEST_TIMEOUT_MS)` + `res.locals.signal` | 15 s → 503 `REQUEST_TIMEOUT` |
| Shutdown | `registerGracefulShutdown({ server, logger, lifecycle, timeoutMs, drainDelayMs, resources })` | readiness 503 → drain → close server → close resources → exit |

## Procedure — a new outbound dependency

1. Add its URL (and key, if any) to `envSchema`; never hard-code hosts.
2. Write `src/lib/<name>-client.ts`: build `createResilientHttpClient` inside, expose domain methods (`locate(ip)`), parse every response with a Zod schema, expose `breaker`.
3. Decide per method: idempotent → retries allowed; non-idempotent `POST` → `retries: 0` unless the upstream accepts an idempotency key you send.
4. Pick the timeout from the upstream's p99 plus margin, well under `REQUEST_TIMEOUT_MS`.
5. Wire it in `container.ts`, pass it to the service through its deps interface, and register a health check with an explicit `critical` flag.
6. Decide the degraded behaviour in the service: either let `CircuitOpenError` surface as 503, or catch `ServiceUnavailableError` and return a documented fallback (`null`, cached value). Never return fake data silently.
7. Unit-test with an injected `fetchImpl`: retry on 503, no retry on 4xx, breaker opens and fails fast.

## Procedure — health and shutdown

- Liveness `/health/live` checks nothing but the process. Never add a dependency to it.
- Readiness checks run in parallel with timeouts; a new critical dependency (another database) is `critical: true`.
- Anything that holds connections or timers goes into `resources` of `registerGracefulShutdown`, in close order: stop intake (consumers, schedulers) first, pools last.
- Containers: `tini` as PID 1, `HEALTHCHECK` on `/health/live`, compose/Kubernetes grace period above `SHUTDOWN_TIMEOUT_MS`; set `SHUTDOWN_DRAIN_DELAY_MS` to the load balancer's probe interval behind a balancer (`docker-deploy` skill).

## Checklist

- [ ] No bare `fetch` to another service; every outbound call has a timeout
- [ ] Retries only on idempotent calls and retryable failures; jitter on
- [ ] One breaker per dependency, created once in the container (not per request)
- [ ] Upstream responses parsed with Zod; unexpected payload → `ServiceUnavailableError`
- [ ] Health check registered with the right `critical` flag; liveness untouched
- [ ] Degraded behaviour is explicit and tested
- [ ] New pools/consumers/intervals closed in `resources`; timers `.unref()`
- [ ] Unit tests use injected `fetchImpl` / `now`, no real network, no long sleeps
