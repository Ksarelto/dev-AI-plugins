---
name: auth-jwt
description: Implement JWT authentication with jose and argon2 — register, login token, refresh rotation, GET /me, requireAuth and requireRole middleware. Use when adding login, access/refresh tokens, or route guards, not for generic CRUD resources.
---

# Auth JWT

## When to use

Wiring login, registration, refresh rotation, or `requireAuth` / `requireRole` on routes. If `src/http/create-app.ts` is missing, load `scaffold-service` first. Rate-limit `POST /api/v1/auth/token` via `redis-backplane`. CRUD for a non-auth resource is `express-feature`.

Defer libraries to `rules/stack.mdc`. JWT is `jose`, passwords are `argon2`. Never `jsonwebtoken`.

## Procedure

1. Users table + `refresh_tokens` table (hash the refresh token; store `expiresAt` / `revokedAt`). Re-export from `src/db/tables/index.ts`.
2. User Read schema has **no** password hash. Register/token bodies are `{ email, password }` — **no `role` field**.
3. Auth service: hash on register; `argon2.verify` on login; sign access (~15m, `sub` + `role`); insert hashed refresh (~7d); rotate on refresh.
4. Middleware in `src/http/middleware/auth.ts`: `requireAuth(getUser)`, `requireRole(...roles)`. Bind `getUser` in `compose.ts`. Inactive user → 401, not 404.
5. Router: `POST /register`, `POST /token`, `POST /refresh`, `GET /me` in `src/http/routers/auth.ts`. Mount at `/api/v1/auth` from `compose.ts`.
6. Seed librarians in `src/db/seed.ts`. Never a public promote endpoint.
7. Rate-limit `/token` (and usually `/register`) — load `redis-backplane`.
8. Tests: 201 register, 401 bad password, 422 unknown field, 401 missing bearer, 403 wrong role — load `http-testing`.

## Checklist

- [ ] Role never accepted from the request body
- [ ] Refresh rotated (old row `revokedAt` set)
- [ ] Guards are middleware, not `if (req.user.role === …)` in handlers
- [ ] Tokens and hashes never logged

## References

- [examples.md](./examples.md) — tables, service, middleware, router
