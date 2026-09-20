# State ownership

Each kind of state has one home. Server data stays in TanStack Query. Shareable/reload state lives in the URL. Forms are RHF + zod. Business invariants are pure functions in `models/`.

## Evaluate

**Hard**

- Lookup, not a gradient: server → Query; ephemeral one-subtree → `useState`; infrequent subtree-shared → Context; frequent/selective → Zustand; shareable/reload → URL; form in-progress → RHF + zod; derived → compute, never store.
- Server state: Query only — not mirrored into Zustand or `useState`.
- URL owns filters, pagination, sort, selected id, tab, wizard step (`searchParams`).
- Forms: React Hook Form + zod **in `ui/`** (component folder schema is fine). Wire-shape zod lives in `api/` (DTO). Form resolver **calls** `models/` functions — does not duplicate rules as a second zod refinement. Invariants do not live in the component folder.
- Transport errors: `AppError` from `shared/api` — not raw HTTP in `ui/`.
- Domain violations: typed errors or result variants — not HTTP status codes inside `models/`.
- Expected outcomes (declined payment): return values from `hooks/`/`models/`, not throws for UI branching.
- Context `value` is memoized; split contexts by change frequency when one value churns.
- Zustand selectors are pure and reference-stable (`useShallow` for derived collections). No `'use no memo'` to hide a store miss. Nested updates return new objects along the changed path.
- Session identity is Context (`useSession()`), not a Zustand mirror — see authentication.

**Judgment**

- Context vs Zustand for a piece of client state (session is the named Context exception).
- A Zustand store created for state only one component needs (over-engineering).
- Locale as Zustand vs i18n provider — mechanism outlives the session (see authentication provider order).

## How

```bash
rg -n "useState\(|useReducer\(" src/features src/pages --glob "*.tsx"
rg -n "create\(|persist\(" src/features/*/models src/widgets
rg -n "useSearchParams|searchParams" src
rg -n "status === 4|res\.status|error\.status" src/features/*/models src/features/*/ui
rg -n "use no memo" src
```

For list/filter UIs: if page/query state is `useState` and not written to the URL, hard. For Query results copied into a store (`setOrders(data)`), hard.

Read form components: schema next to the form in `ui/`, calling `models/` — not reinvented in the submit handler and not parked in `models/` as the form schema itself. Confirm `AppError` is what `ui/` branches on.
