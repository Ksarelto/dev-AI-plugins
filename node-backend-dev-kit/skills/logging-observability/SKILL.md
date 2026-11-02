---
name: logging-observability
description: Structured logging in a Node API with pino 10 and pino-http 11 — req.log child loggers, X-Request-Id propagation, log levels by status, redaction of tokens and passwords, the err serializer, no console. Use when adding logs, tracing a request across services, tuning log levels or checking what the API writes to stdout.
---

# Logging and observability

## When to use

- Adding log lines to a service, job, script or middleware
- A request must be followed across services, or logs leak data / miss context
- Changing log levels, the pretty transport, or what pino-http records
- Not for health endpoints and readiness — `resilience` skill

Hard constraints: `rules/observability.mdc`, `rules/auth-security.mdc`. Code: [examples.md](examples.md).

## Pieces

| Piece | Where | Behaviour |
|---|---|---|
| Root logger | `createLogger({ level, pretty, name })` in `lib/logger.ts` | JSON to stdout; `pino-pretty` only when `LOG_PRETTY=true`; `REDACT_PATHS` censored as `[redacted]` |
| Request logger | `requestLogger(logger)` in `middleware/request-logger.ts` | `pino-http`; request id from a safe `X-Request-Id` or `randomUUID()`; `req.log`; one access line per request |
| Levels | `customLogLevel` | 5xx or thrown → `error`, 4xx → `warn`, else `info`; `/health*` not access-logged |
| Error logging | `errorHandler()` | 5xx → `req.log.error({ err })`; 4xx → `req.log.warn({ code, status }, detail)` |
| Config | `LOG_LEVEL`, `LOG_PRETTY` in `config/env.ts` | tests use `silent` |

## Procedure

1. Choose the logger: inside a request → `req.log`; elsewhere → a `logger.child({ component })` from injected deps. Never `console`, never a new `pino()`.
2. Write `log.<level>({ ...fields }, 'static message')`. Fields are ids and counts, not payloads. Errors always as `{ err: error }`.
3. Pick the level: `error` (needs action), `warn` (client error, degraded dependency, retry exhausted), `info` (lifecycle, business events), `debug` (diagnostics, off in production).
4. If a new field can hold a secret, add it to `REDACT_PATHS`; remember `*.x` matches one level only.
5. For cross-service tracing, forward `req.id` as `X-Request-Id` on outbound calls.
6. Scripts (`migrate.ts`, `seed.ts`) create their own logger with a `name` and set `process.exitCode = 1` on failure instead of throwing past the logger.
7. Verify by running `npm run dev` with `LOG_PRETTY=true`, calling the route, and reading the line; then confirm no secret appears with `LOG_PRETTY=false`.

## Checklist

- [ ] No `console.*`; ESLint `no-console` passes
- [ ] Request-scoped logs use `req.log`; others use an injected child logger
- [ ] Object first, static message second; errors under `err`
- [ ] No bodies, tokens, passwords, hashes, cookies or full headers in logs; new sensitive keys in `REDACT_PATHS`
- [ ] Levels match the outcome; no `error` for 4xx
- [ ] `X-Request-Id` validated before reuse; forwarded on outbound calls when tracing is needed
- [ ] Tests run with a `silent` logger
