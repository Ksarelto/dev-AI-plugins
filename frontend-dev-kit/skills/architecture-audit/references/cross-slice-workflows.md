# Cross-slice workflows

One feature owns a multi-step workflow. `models/` decides (pure in/out). `hooks/` sequences (`await`s). The transaction boundary is the backend — no client rollback sagas. Pages compose; they do not orchestrate.

## Evaluate

**Hard**

- No orchestration in `pages/` (no chained cross-feature `await`s). No `useEffect` chains that encode step order.
- `models/` files: no imports of any `api/` (own, other slice, or `shared/api`); no feature imports. Plain in/out only.
- No step injection: `placeOrder(draft, { submitOrder, trackEvent })` — sequencing belongs in `hooks/`.
- No client compensating write, cache rollback of committed server state, or verifying read after a successful write.
- Outcomes: enumerated result types in `models/`; `hooks/` `catch` classifies via a pure mapper, then does not issue a follow-up write.
- Retry: resend the same request. No client-minted idempotency key.
- `hooks/` may import `@/entities/{name}` only — not `@/entities/{name}/api/...`.
- `now()` / clock / ids: imported in `hooks/`, passed into `models/` as arguments.
- Session-scoped Zustand: factory (`createDraftStore(sessionKey)`), not a module-level singleton. Persist `name` includes the session/tenant key (`feature.draft.${sessionKey}`).
- Teardown is `app/`: new `sessionKey`, new `QueryClient`, SSE close/reopen, keyed remount; optional feature `reset()` from `index.ts`.
- Wizard: owning feature; step in the URL (`useSearchParams`); draft in a keyed persisted store.

**Judgment**

- N separate user commands vs a missing backend command.
- Persist `localStorage` vs `sessionStorage` (product: must the draft survive a week?).

## How

```bash
rg -n "from ['\"].*api" src/features/*/models src/entities/*/model src/widgets/*/model
rg -n "from ['\"]@/shared/api" src/{features,entities,widgets}/**/models/**
rg -n "Date\.now\(|crypto\.randomUUID\(|Math\.random\(" src/features/*/models src/entities/*/model
rg -n "create\(|persist\(" src/features/*/models
```

Read `models/` functions with callback/effect parameters. Read `pages/` for sequential `await`s. Grep persist `name:` for a session key. Grep `create(` at module scope in `models/` vs inside a factory/provider.
