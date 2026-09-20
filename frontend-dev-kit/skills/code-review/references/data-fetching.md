# react-query — review checklist

Distilled from the `react-query-hook` skill. Applies to any changed `api/`, `**/hooks/use*.ts`, or
mutation touching cached server data.

## Queries

- A query key built as an inline string/array instead of extending the owning feature's `queryKeys.ts` factory.
- The fetcher isn't a separate pure async function (no React imports) — it's inlined in the hook.
- A query with possibly-undefined params has no `enabled` guard.
- No explicit `staleTime` set (relying on the global default when this query needs its own policy).
- `retry` left on for a 4xx response (not a transport failure) instead of skipped, or the query function doesn't forward `signal` through to the request so an abandoned query can't actually cancel.

## Mutations

- Invalidation only in `onSuccess`, missing `onSettled` — so a failed mutation leaves stale cache.
- Cross-feature invalidation reaches into another feature's `queryKeys.ts` directly instead of calling its exported invalidator hook (e.g. `useInvalidateOrders()`).
- No user-facing error handling (message or form error) on mutation failure.
- An optimistic update with no feasible rollback path.

## Non-negotiable (also in `architecture-audit` / state-ownership)

- Server data copied into `useState` or a store instead of read from the react-query cache.

## Severity

Missing `onSettled` invalidation, direct cross-feature `queryKeys.ts` access, and server-state
copied out of the cache are **Must fix** — they cause stale/incorrect UI. `staleTime`/`enabled`/
retry-policy gaps are **Should fix**.
