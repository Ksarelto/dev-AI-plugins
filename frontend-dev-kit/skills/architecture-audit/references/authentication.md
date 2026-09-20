# Authentication

Session is a shared mechanism, not a feature. `useSession()` is the React contract. The raw token is a bridge for `httpClient` and SSE only.

## Evaluate

**Hard**

- No `features/auth/` directory. Org switcher / logout button may live in `features/user-profile/`, calling commands from `shared/lib/auth`.
- `shared/lib/auth/` contains `provider.tsx`, `useSession.ts`, `session.ts`, `token.ts`, `index.ts`. Tests live in `shared/lib/tests/`, not a per-unit `auth/tests/`.
- `Session` union: `loading | anonymous | authenticated` (authenticated has `userId`, `orgId`, `roles`, `expiresAt`). No raw token and no vendor type on `Session`. No `useSessionStore`.
- `sessionKey(session)` = `userId:orgId` when authenticated, and covers anonymous (`'anonymous'` / `'loading'`). Changes on logout and tenant switch. Does **not** change on silent token refresh alone.
- `getToken()` / `setToken()`: writes from the provider; reads from `shared/api/base.ts` and the SSE header builder. Features/pages/widgets/entities do not import `token.ts`. `token.ts` imports nothing. Never put the token in an EventSource URL (native `EventSource` cannot set headers — do not fall back to it).
- `oidc-client-ts`, `react-oidc-context`, `@azure/msal-*` imported only under `shared/lib/auth/`.
- Provider order: `AuthProvider` and `I18nProvider` **outside** the keyed subtree; `QueryClientProvider` and SSE **inside** `SessionScope` keyed by `sessionKey`.
- `RequireAuth`: handle `loading` without redirect; uses `useSession()`, not `getToken()`. Auth screens (`pages/auth/*`) under `AuthLayout` — no feature mounts; they sit **outside** `RequireAuth`.
- Do not guard in a React Router loader via `getToken()`. Post-login return target belongs in the URL.
- `AUTH_*` parsed in `shared/config/env.ts` with zod — not scattered `import.meta.env`. `NoAuthProvider` must refuse a production build.
- User profile data lives in `entities/user/`, fetched with `useSession().userId` — not stuffed onto the session object.
- 401 refresh-and-retry lives in the `shared/api` interceptor, single-flight. A feature never calls `signoutRedirect()` because a request failed. Org switch changes the identity source — no feature imports `app/` or a bus.

**Judgment**

- OIDC vs MSAL vs a no-auth stub — env-driven, spike-dependent.
- Org switch via silent re-auth vs an auth-internal tenant store.

## How

```bash
ls src/features/auth src/shared/lib/auth src/pages/auth
rg -n "getToken|setToken|from ['\"]@/shared/lib/auth/token" src/{features,widgets,entities,pages}
rg -n "oidc-client-ts|react-oidc-context|@azure/msal" src --glob "!**/shared/lib/auth/**"
rg -n "sessionKey|SessionScope|QueryClientProvider" src/app
rg -n "signoutRedirect" src/features src/pages
```

Read `Session` type and `sessionKey`. Read `app/providers` for keying and order. Read `RequireAuth` for the loading branch. Confirm interceptors, not features, own 401 retry.
