# API layer and query keys

One HTTP client, one key registry. Slice `api/` owns hooks, DTOs, mappers, and `endpoints.ts`. It does not own the gateway URL or key definitions.

## Evaluate

**Hard**

- `shared/api/` layout: `config.ts`, `base.ts`, `query-client.ts`, `query-keys/*.ts`, `errors.ts` (`AppError` / `toAppError`), optional `realtime/`.
- Only `shared/api/config.ts` reads `import.meta.env` for `VITE_API_BASE_URL`. Features use `API_BASE` via `base.ts`. Other env is `shared/config/env`.
- Feature/entity `api/` imports `httpClient` from `@/shared/api/base`. No `fetch(`, no `ky`, no `axios` in those layers.
- `ky` client: `retry: 0` (Query owns retry); pass `signal` from the query into the request; no `.json()` on 204.
- Versioned API: `httpClient.extend({ prefix: API_BASE.v2 })` — not a second `ky.create`.
- Query keys: factories from `@/shared/api/query-keys/{domain}`. No inline `queryKey: [...]` outside `query-keys/`. One file per **business domain**, with an owner named at the top of the file.
- Every feature/entity `api/` has `endpoints.ts`. Hooks do not hand-type path strings. A feature map lists only paths **that feature** calls — no copy of another slice's map.
- Cross-feature refresh: mutation imports the shared key factory only — not `@/features/other`.
- Invalidate only keys the mutation's business action legitimately affects. No blanket `invalidateQueries()` with no key.
- `createQueryClient()` factory — instance is **replaced** on logout/tenant switch, not merely `clear()`. Query retry is network-kind `AppError` only; mutations `retry: false`.
- SSE-owned keys may opt out of `refetchOnWindowFocus` (cost, not correctness) — see realtime.

**Judgment**

- Domain ownership is a comment/CODEOWNERS issue.
- Orphan `query-keys/` file with no importers after a feature delete.
- Two registry files whose factory root is the same array (e.g. both `['orders']`) — collision is reviewable, not compiler-caught. A uniqueness test is recommended.

## How

```bash
rg -n "from ['\"]ky['\"]|from ['\"]axios['\"]|\bfetch\(" src/{features,widgets,entities}
rg -n "queryKey:\s*\[" src --glob "!**/query-keys/**"
rg -n "import.meta.env" src --glob "!**/shared/config/**" --glob "!**/shared/api/config.ts"
rg -n "httpClient|from ['\"]@/shared/api/base['\"]" src/{features,entities}/*/api
```

Glob `src/shared/api/query-keys/`. Glob `**/api/endpoints.ts` next to every slice `api/`. Read `base.ts` for a single client. Read logout/tenant code for `createQueryClient()` vs `queryClient.clear()`. Confirm `AppError` is produced in `shared/api`, not in feature UI.
