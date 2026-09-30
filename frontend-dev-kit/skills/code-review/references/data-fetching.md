# react-query — review checklist

Distilled from the `react-query-hook` skill. Applies to any changed `api/`, `**/hooks/use*.ts`, or
mutation touching cached server data.

## Queries

- A query key built as an inline array, or a per-feature `api/queryKeys.ts`, instead of a factory in `shared/api/query-keys/{domain}.ts`.
- The fetcher isn't a separate pure async function in `api/fetchers.ts` (no React imports) — it's inlined in the hook or the component calls `useQuery` directly.
- A query with possibly-undefined params has no `enabled` guard.
- No explicit `staleTime` set (relying on the global default when this query needs its own policy).
- `retry` left on for a non-network `AppError`, or the query function doesn't forward `signal` through to the request.

## Mutations

- Invalidation missing. Default is `onSuccess`. Use `onSettled` only when a failed mutation also needs a resync.
- Cross-feature invalidation imports another feature (`useInvalidateOrders`) instead of the shared key factory in `shared/api/query-keys/`.
- A domain failure thrown from `mutationFn` instead of a return value from `models/`, checked in `ui/` before `mutate`.
- No user-facing error handling on mutation failure (`AppError` kind `'validation'` → form; other kinds → `createQueryClient` toast).
- An optimistic update with no feasible rollback path.

## Non-negotiable (also in `architecture-audit` / state-ownership)

- Server data copied into `useState` or a store instead of read from the react-query cache.
- `queryClient.clear()` on logout instead of replacing the client from `createQueryClient()`.

## Severity

A per-feature `queryKeys.ts`, a cross-feature import, a thrown domain error, and server-state
copied out of the cache are **Must fix**. `staleTime`/`enabled`/retry-policy gaps are **Should fix**.
