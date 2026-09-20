# Realtime SSE

One `EventSourceStream` in `shared/api/realtime/`. Features register consumers. Default reaction is invalidate, not merge. Event-shaped side effects belong to the subscription owner.

## Evaluate

**Hard**

- Single connection: `shared/api/realtime/EventSourceStream.ts` via `eventsource-client` (`createEventSource`). Features use `useSseConsumer(name, handlers)` in `hooks/` (entity `api/` only for a canonical entity stream). Dispatch table, not `switch (event)`.
- No per-feature `EventSource`. No native `EventSource` (cannot set `Authorization`). No extra client backoff/jitter on top of the library retry. Do not read `readyState` from outside the class to build a second liveness signal.
- Auth header via `getToken()`. `init` gated by `flags.sse` from `shared/config/flags`.
- Visibility: close on `document.hidden`, recreate on visible.
- `close()` clears consumers — remount on `sessionKey` must re-register hooks. `close()` also resets degraded-connection state.
- Connection-health toasts (`DISCONNECT_NOTIFY_THRESHOLD`) live on the **service**, not per-feature hooks or `app/`.
- Event name constants in `shared/api/realtime/events.ts` (`SseEvent.*`) — not duplicated string literals across features.
- Handlers write **only the owning slice's** query keys. Default `invalidateQueries`. `setQueryData` only if the payload has an orderable field **and** a version guard.
- Skip/defer invalidate when `queryClient.isMutating({ mutationKey })` on optimistic keys.
- Infinite/paginated queries: invalidate (detail key for an update, list key for create/delete) — do not flatten `{ pages, pageParams }` with a list updater.
- SSE-owned keys may disable `refetchOnWindowFocus` to avoid a redundant fetch, not because a race would corrupt the cache.
- `removeConsumer` in effect cleanup on unmount.
- No `publish`/`emit` on the stream. No shared hook that knows feature keys or copy.
- Same event type: multiple features may register different consumers; duplicate **same** toast for the same fact is forbidden — one owner.
- Reconnect: invalidate namespaces on re-register (missed events). Do not invent a replay URL unless the backend requires it.

**Judgment**

- Version guard only when the backend sends an ordering field; otherwise accept rare duplicate toasts on redelivery.
- High-frequency events should coalesce invalidations per key per frame.
- Threshold of 1 for disconnect toasts is noise — keep the service threshold.

## How

```bash
rg -n "new EventSource|EventSourceStream|useSseConsumer|createEventSource" src
ls src/shared/api/realtime
rg -n "SseEvent|from ['\"]@/shared/api/realtime/events" src/features
rg -n "notify\(|toast\(" src/features/**/hooks
```

Count `EventSource` / stream classes — must be one. Read each `useSseConsumer` handler: which query keys it writes, whether it toasts, whether cleanup unregisters. Grep raw event-name strings outside `events.ts`.
