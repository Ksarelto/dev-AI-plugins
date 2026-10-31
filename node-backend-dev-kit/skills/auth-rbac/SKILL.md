---
name: auth-rbac
description: Authentication and role-based authorization for an Express 5 API — jose HS256 access tokens, rotating refresh tokens with reuse detection, argon2id passwords, authenticate middleware, requireRole guards, requirePrincipal in controllers, ownership checks in services. Use when protecting routes, adding roles or permissions, changing login, logout, register or JWT handling, or switching to an external IdP with createRemoteJWKSet.
---

# Auth and RBAC

## When to use

- A route must be authenticated, admin-only, or owner-only
- Adding a role, changing token lifetimes or claims, touching login/register/refresh/logout
- Replacing local auth with Keycloak, Entra ID, Auth0 or another OIDC provider
- Not for headers, CORS or rate limits — `security-middleware` skill

Hard constraints: `rules/auth-security.mdc`, `rules/error-handling.mdc`. Code: [examples.md](examples.md). The full local implementation (jwt, password, tokens, guards, refresh-token table, `auth.service.ts`): [references/auth-flow.md](references/auth-flow.md).

## Model

| Piece | Where | Contract |
|---|---|---|
| Access token | `createJwtService(...)` in `lib/jwt.ts` | HS256 via `jose`; claims `sub`, `email`, `roles`, `iss`, `aud`, `jti`, `exp` (default 900 s) |
| `Principal` | `lib/jwt.ts` | `{ userId, email, roles: Role[] }`; `ROLES = ['user', 'admin'] as const` |
| `authenticate(jwt)` | `middleware/authenticate.ts` | `Bearer` header → `verifyAccessToken` → `res.locals.principal`; 401 `MISSING_TOKEN` / `INVALID_TOKEN` |
| `requireRole(...roles)` | `middleware/authorize.ts` | any listed role passes; else 403 `FORBIDDEN` |
| `requirePrincipal(res)` | `middleware/authenticate.ts` | typed caller in controllers; throws 401 if `authenticate` was not mounted |
| Refresh token | `auth.service.ts` + `refresh_tokens` table | opaque 256-bit, stored as SHA-256, rotated per use, family revoked on reuse (401 `REFRESH_TOKEN_REUSED`) |
| Password | `lib/password.ts` | argon2id `hashPassword` / `verifyPassword`; `verifyAgainstDummy` for unknown emails |

## Procedure — protect a resource

1. In the router: `router.use(authenticate)` for all routes, or per route; add `requireRole('admin')` for role-restricted routes. Then `validate(...)`, then the handler.
2. In the controller: `const principal = requirePrincipal(res);` and pass it (or `principal.userId`) to the service.
3. In the service: derive the owner from the principal on create; on read/update/delete load the row and throw `NotFoundError('<Entity> not found.', '<ENTITY>_NOT_FOUND')` unless `row.ownerId === actor.userId` or the actor is an admin. Filter lists by owner in the repository query.
4. Document `security: [{ [bearer.name]: [] }]` and the 401/403/404 problems in OpenAPI (`openapi-docs` skill).
5. Integration tests: no token → 401 `MISSING_TOKEN`; wrong role → 403 `FORBIDDEN`; another user's row → 404; owner → 2xx.

## Procedure — change auth itself

| Change | Steps |
|---|---|
| New role | [examples.md](examples.md#adding-a-role): `ROLES` + pg enum migration + response schema + guards + tests |
| Token lifetime | `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_DAYS` in env; keep access tokens short (≤ 15 min) |
| New claim | Add to `SignJWT({...})` **and** to `claimsSchema`; extend `Principal`; never put secrets or PII beyond email in claims |
| External IdP | [examples.md](examples.md#external-identity-provider-keycloak-entra-id-auth0): `createRemoteJWKSet` verifier, widen `authenticate`'s parameter, delete local auth routes and tables with their tests |
| Logout everywhere | revoke by `userId` in the refresh-token repository; access tokens expire on their own (no denylist unless required) |

## Checklist

- [ ] Every non-public router mounts `authenticate`; admin routes add `requireRole`
- [ ] Controllers use `requirePrincipal(res)`; nothing else reads the `Authorization` header
- [ ] Ownership enforced in the service; strangers get 404; owner ids never come from the body
- [ ] `jwtVerify` pins `algorithms`, `issuer`, `audience`; claims re-parsed with Zod
- [ ] Refresh tokens stored hashed, rotated, family-revoked on reuse
- [ ] Passwords argon2id, 12–128 chars; unknown email and wrong password share `INVALID_CREDENTIALS`
- [ ] `/auth` has the stricter `authLimiter`
- [ ] Tests cover 401, 403, 404-for-stranger and the happy path
