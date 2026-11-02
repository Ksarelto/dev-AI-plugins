---
name: security-middleware
description: Harden the HTTP edge of an Express 5 app — helmet headers, CORS allowlist, JSON body size limit, express-rate-limit 8 global and auth limiters, trust proxy, request timeout, server keep-alive timeouts, x-powered-by off. Use when configuring security headers, CORS, rate limiting, proxies or middleware order in app.ts.
---

# Security middleware

## When to use

- Changing `createApp()` middleware, its order, or adding a new global middleware
- CORS errors, a new allowed origin, cookies/credentials, a reverse proxy or load balancer in front
- Rate limiting a route group, 429 tuning, multiple replicas
- Not for who may call a route — `auth-rbac` skill

Hard constraints: `rules/auth-security.mdc`, `rules/stack.mdc`, `rules/resilience.mdc`. Code: [examples.md](examples.md).

## Middleware order in `createApp(env, logger, container)`

| # | Middleware | Why here |
|---|---|---|
| 1 | `app.disable('x-powered-by')`, `app.set('trust proxy', parseTrustProxy(env.TRUST_PROXY))` | before anything reads `req.ip` |
| 2 | `requestLogger(logger)` | request id + `req.log` for everything after |
| 3 | `helmet()` | headers on every response, including errors |
| 4 | `cors({ origin: env.CORS_ORIGINS, credentials: true })` | answers preflights before body parsing |
| 5 | `express.json({ limit: '100kb' })` | bounded bodies; overflow → 413 `PAYLOAD_TOO_LARGE`, bad JSON → 400 `MALFORMED_JSON` |
| 6 | `createHealthRouter(...)` | probes bypass timeout and rate limits |
| 7 | `requestTimeout(env.REQUEST_TIMEOUT_MS)` | 503 `REQUEST_TIMEOUT`, `res.locals.signal` |
| 8 | `'/api'` → `createRateLimiter({ windowMs, limit: RATE_LIMIT_MAX })` | global limit |
| 9 | `'/api/v1'` → `createApiRouter({ controllers, authenticate, authLimiter })` | `/auth` gets the stricter `AUTH_RATE_LIMIT_MAX` limiter |
| 10 | `/api-docs` when `API_DOCS_ENABLED` | Swagger UI + `openapi.json` |
| 11 | `notFound()`, then `errorHandler()` | always last |

## Procedure

1. **New global middleware**: decide its slot from the table; anything that can fail must come after `requestLogger` and before `errorHandler`. Configure it from `Env`, never from literals spread across files.
2. **CORS**: add origins to `CORS_ORIGINS` (comma-separated, parsed in `config/env.ts`). Never `origin: '*'` or `origin: true` with `credentials: true`.
3. **Proxy**: set `TRUST_PROXY` to the hop count or subnet of your load balancer (`1`, `loopback`, `10.0.0.0/8`). `true` trusts any `X-Forwarded-For` and lets clients spoof their IP past the rate limiter.
4. **Rate limits**: reuse `createRateLimiter({ windowMs, limit })`; mount a stricter one on sensitive routers (login, password reset, expensive search). Rejections go through `next(new TooManyRequestsError())` so the body is problem+json. More than one replica → a shared store ([examples.md](examples.md#shared-store-for-several-replicas-adaptation)).
5. **Bodies**: keep `100kb` globally; a route that needs more mounts its own `express.json({ limit })` before `validate()`. Uploads use streaming, not a bigger JSON limit.
6. **Helmet**: keep defaults. Loosen only the directive you need (`helmet({ contentSecurityPolicy: { directives: { … } } })`), never `helmet({ contentSecurityPolicy: false })` globally.
7. **Server**: `startServer` keeps `keepAliveTimeout` (65 s) above the load balancer's idle timeout and `headersTimeout` above `keepAliveTimeout`.
8. **Secrets**: only via `Env`; `JWT_SECRET` ≥ 32 chars, from a secret manager in production; never the compose default.
9. **Test** the edge in an integration test: security headers present, `x-powered-by` absent, disallowed origin, 413, 429.

## Checklist

- [ ] `x-powered-by` disabled; `trust proxy` from `TRUST_PROXY`, not `true` in production
- [ ] `helmet()` before routes; no global CSP disable
- [ ] CORS allowlist from env; no wildcard with credentials
- [ ] JSON limit set; health routes before timeout and limiters
- [ ] Global `/api` limiter and stricter `/auth` limiter; 429 is problem+json; shared store when scaled out
- [ ] `notFound()` then `errorHandler()` last
- [ ] Integration test covers the changed edge behaviour
