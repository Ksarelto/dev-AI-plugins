# Authentication

Session is a shared mechanism, not a feature. `useSession()` is the React contract. The raw token is a bridge for `httpClient` and SSE only.

## Evaluate

**Hard**

- No `features/auth/` directory.
- `shared/lib/auth/` contains `provider.tsx`, `useSession.ts`, `session.ts`, `token.ts`, `index.ts`.
- `Session` union: `loading | anonymous | authenticated` (authenticated has `userId`, `orgId`, `roles`, `expiresAt`). No raw token on `Session`.
- `sessionKey(session)` = `userId:orgId` when authenticated. Changes on logout (`anonymous`) and tenant switch. Does **not** change on silent token refresh alone.
- `getToken()` / `setToken()`: writes from the provider; reads from `shared/api/base.ts` and the SSE URL builder. Features/pages/widgets/entities do not import `token.ts`.
- `oidc-client-ts`, `react-oidc-context`, `@azure/msal-*` imported only under `shared/lib/auth/`.
- Provider order: `AuthProvider` and `I18nProvider` **outside** the keyed subtree; `QueryClientProvider` and SSE **inside** `SessionScope` keyed by `sessionKey`.
- `RequireAuth`: handle `loading` without redirect; uses `useSession()`, not `getToken()`.
- Auth pages: `pages/auth/*` under `AuthLayout` — no feature mounts.
- `AUTH_*` parsed in `shared/config/env.ts` with zod — not scattered `import.meta.env`.
- User profile data lives in `entities/user/`, fetched with `useSession().userId` — not stuffed onto the session object.

**Judgment**

- OIDC vs MSAL vs a no-auth stub — env-driven, spike-dependent.
- Org switch via silent re-auth vs an auth-internal tenant store.

## How

```bash
ls src/features/auth src/shared/lib/auth src/pages/auth
rg -n "getToken|setToken|from ['\"]@/shared/lib/auth/token" src/{features,widgets,entities,pages}
rg -n "oidc-client-ts|react-oidc-context|@azure/msal" src --glob "!**/shared/lib/auth/**"
rg -n "sessionKey|SessionScope|QueryClientProvider" src/app
```

Read `Session` type and `sessionKey`. Read `app/providers` for keying and order. Read `RequireAuth` for the loading branch.
