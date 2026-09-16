# State ownership

Each kind of state has one home. Server data stays in TanStack Query. Shareable/reload state lives in the URL. Forms are RHF + zod. Business invariants are pure functions in `models/`.

## Evaluate

**Hard**

- Server state: Query only — not mirrored into Zustand or `useState`.
- URL owns filters, pagination, sort, selected id, tab, wizard step (`searchParams`).
- Forms: React Hook Form + zod in `ui/`. Wire-shape zod lives in `api/` (DTO). Form resolver calls `models/` functions — does not duplicate rules.
- Transport errors: `AppError` from `shared/api` — not raw HTTP in `ui/`.
- Domain violations: typed errors or result variants — not HTTP status codes inside `models/`.
- Expected outcomes (declined payment): return values from `hooks/`/`models/`, not throws for UI branching.
- Derived state is computed, not stored.
- Context `value` is memoized; split contexts by change frequency when one value churns.

**Judgment**

- Context vs Zustand for a piece of client state (session is Context — see authentication).
- A Zustand store created for state only one component needs (over-engineering).

## How

```bash
rg -n "useState\(|useReducer\(" src/features src/pages --glob "*.tsx"
rg -n "create\(|persist\(" src/features/*/models src/widgets
rg -n "useSearchParams|searchParams" src
rg -n "status === 4|res\.status|error\.status" src/features/*/models src/features/*/ui
```

For list/filter UIs: if page/query state is `useState` and not written to the URL, hard. For Query results copied into a store (`setOrders(data)`), hard.

Read form components: schema in `ui/` or `models/`, not reinvented in the submit handler. Confirm `AppError` is what `ui/` branches on.
