# Cross-feature communication

Features never import features. Widgets never import widgets. Features never import widgets. Interaction is composition above, a shared entity, or a shared query-key factory.

## Evaluate

**Hard**

- Forbidden: `features/a` → `features/b` (any path, including `index.ts`); `widgets/a` → `widgets/b`; `features/*` → `widgets/*`.
- Allowed: page or `pages/{route}/ui/` wires two features via both `index.ts` (and may import widgets); widget after a second route needs the same composition; shared entity; shared query-key factory; direct `shared/lib/{analytics,logger,notify}`; `app/` teardown + optional feature `reset()`.
- UI coupling: page passes a slot/`ReactNode` into A — A does not import B.
- Multi-step across features: one owner feature (`models/` decides, `hooks/` sequences).
- SSE: owner writes/invalidates own keys; others hold queries on the same registry key. Toast/analytics for an event fire from the **subscription owner** only.
- Analytics payloads are self-sufficient at the call site — no reading another slice's cache. Event **names** live in the emitting feature's `config/analytics.ts`, emitted through `shared/lib/analytics`.
- No `events/`, `publish()`/`emit()` on the realtime stream, callback registry in `shared/lib`, ports, or `defineEvent` between features. The sanctioned table is the whole list.

**Judgment**

- Whether the right fix for a forbidden import is page composition vs entity vs query-key vs a new owner feature.
- Page-local `pages/{route}/ui/` vs promoting to a widget (second route).

## How

```bash
rg -n "from ['\"]@/features/" src/features
rg -n "from ['\"]@/widgets/" src/widgets
rg -n "from ['\"]@/widgets/" src/features
rg -n "from ['\"]@/features/[^'\"]+/locales" src/features
```

Any hit whose target slice ≠ source slice is a hard violation (relative imports inside the same slice are fine).

```bash
rg -n "publish\(|\.emit\(|createEvent|EventBus|defineEvent|callback registry" src/shared
rg -n "events/" src/{features,shared,widgets} -g '!**/realtime/events.ts'
```

Read pages that mount two features: they should import both public APIs, not nest one feature inside the other.
