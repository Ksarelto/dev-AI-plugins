# Realtime SSE

One `EventSourceStream` in `shared/api/realtime/`. Features register consumers. Default reaction is invalidate, not merge. Event-shaped side effects belong to the subscription owner.

## Evaluate

**Hard**

- Single connection: `shared/api/realtime/EventSourceStream.ts`. Features use `useSseConsumer(name, handlers)` in `hooks/` (entity `api/` only for a canonical entity stream).
- No per-feature `EventSource`. No extra client backoff/jitter on top of the library retry.
- Auth header via `getToken()`. `init` gated by `flags.sse` from `shared/config/flags`.
- Visibility: close on `document.hidden`, recreate on visible.
- `close()` clears consumers — remount on `sessionKey` must re-register hooks.
- Event name constants in `shared/api/realtime/events.ts` (`SseEvent.*`) — not duplicated string literals across features.
- Handlers write **only the owning slice's** query keys. Default `invalidateQueries`. `setQueryData` only if the payload has an orderable field **and** a version guard.
- Skip/defer invalidate when `queryClient.isMutating({ mutationKey })` on optimistic keys.
- `removeConsumer` in effect cleanup on unmount.
- No `publish`/`emit` on the stream. No shared hook that knows feature keys or copy.
- Same event type: multiple features may register different consumers; duplicate **same** toast for the same fact is forbidden — one owner.
- Reconnect: invalidate namespaces on re-register (missed events). Do not invent a replay URL unless the backend requires it.

**Judgment**

- Version guard only when the backend sends an ordering field; otherwise accept rare duplicate toasts on redelivery.
- High-frequency events should coalesce invalidations per key per frame.

## How

```bash
rg -n "new EventSource|EventSourceStream|useSseConsumer" src
ls src/shared/api/realtime
rg -n "SseEvent|from ['\"]@/shared/api/realtime/events" src/features
rg -n "notify\(|toast\(" src/features/**/hooks
```

Count `EventSource` / stream classes — must be one. Read each `useSseConsumer` handler: which query keys it writes, whether it toasts, whether cleanup unregisters. Grep raw event-name strings outside `events.ts`.
