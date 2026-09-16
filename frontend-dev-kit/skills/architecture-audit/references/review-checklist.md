# Review checklist

Final sweep after the other topics. Do not restate import-direction, public-API, query-key, or segment-spelling hits already reported. Use this list for residual under- and over-engineering.

## Evaluate

**Hard (only if not already filed)**

- DTO shape (snake_case, nullable soup) leaking into `ui/`.
- `api/` or `models/` called directly from a component instead of `hooks/` (if `hooks/` exists in that slice).
- Long-lived timer, poller, or subscription with no explicit stop.
- User-facing text produced in `models/` (typed reason missing; copy belongs in `ui/`).
- Cross-model policy sitting in `entities/` instead of the owning feature.
- Analytics call that enriches its payload by reading another slice's cache or store.
- Non-idempotent event-shaped side effect (toast, per-change analytics) fired from a query transition (`usePrevious` + `notify`) instead of the SSE subscription owner.

**Judgment — under-engineering**

- Missing empty/error/stale on a data-driven surface (if routing already covered it, skip).
- Mutation with missing or wrong invalidation, already covered by api-layer — only file leftovers.

**Judgment — over-engineering**

- Zustand store for state only one component needs.
- Empty `models/` folder scaffolded "for later".
- Widget or `pages/{route}/ui/` wrapper where the page could mount both features directly.
- Speculative `reset()`, extra entry points, or ports/event buses this architecture does not use.

## How

Spot-read changed or sampled `ui/` files for DTO field names and direct `api/` imports. Grep `setInterval`, `EventSource`, `subscribe` without cleanup. Grep `usePrevious` next to `notify`/`toast`. List `src/features/*/models` directories that contain no `.ts` files.

File each leftover under this topic only when no earlier topic already captured it.
