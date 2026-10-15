# API layer and query keys

One HTTP client, one key registry. An entity `api/` owns `schema.ts`, hooks, the rename mapper, and `endpoints.ts`. A feature `api/` owns `schema.ts` and fetchers only; its query hooks live in `hooks/`. Neither owns the gateway URL or key definitions.

## Evaluate

**Hard**

- `shared/api/` layout: `config.ts`, `base.ts`, `query-client.ts`, `query-keys/*.ts`, `errors.ts` (`AppError` / `toAppError`), `parse.ts` (`parseEntity`), optional `realtime/`.
- Only `shared/api/config.ts` reads `import.meta.env` for `VITE_API_BASE_URL`. Features use `API_BASE` via `base.ts`. Other env is `shared/config/env`.
- Feature/entity `api/` imports `httpClient` from `@/shared/api/base`. No `fetch(`, no `ky`, no `axios` in those layers.
- Each server entity has one zod schema in `api/schema.ts`. Fetchers call `parseEntity`. A failed parse notifies and returns `null`. A `.json<Dto>()` cast, a `typeof` chain, or a `models/` shape check of the same entity is hard.
- Feature and entity `httpClient` calls do not pass `timeout`, `retry`, `prefixUrl`, or `Authorization`. A hook `staleTime` or `retry` that differs from `createQueryClient` is a named constant in `shared/api`, not a numeric literal.
- `ky` client: `retry: 0` (Query owns retry); pass `signal` from the query into the request; no `.json()` on 204.
- Versioned API: `httpClient.extend({ prefix: API_BASE.v2 })` — not a second `ky.create`.
- Query keys: factories from `@/shared/api/query-keys/{domain}`. No inline `queryKey: [...]` outside `query-keys/`. One file per **business domain**. The filename is the owner — do not add an owner comment.
- Every feature/entity `api/` has `endpoints.ts` with a `base` property (the path relative to `API_BASE.v1`). Other keys reuse `base`. A repeated path string or an absolute URL in that file is hard. Hooks do not hand-type path strings. A feature map lists only paths **that feature** calls — no copy of another slice's map.
- Cross-feature refresh: mutation imports the shared key factory only — not `@/features/other`.
- Invalidate only keys the mutation's business action legitimately affects. No blanket `invalidateQueries()` with no key.
- `createQueryClient()` factory — instance is **replaced** on logout/tenant switch, not merely `clear()`. Query retry is network-kind `AppError` only; mutations `retry: false`.
- SSE-owned keys may opt out of `refetchOnWindowFocus` (cost, not correctness) — see realtime.

**Judgment**

- Domain ownership is a CODEOWNERS issue, never a source comment.
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
