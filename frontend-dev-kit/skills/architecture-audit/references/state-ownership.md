# State ownership

Each kind of state has one home. Server data stays in TanStack Query. Shareable/reload state lives in the URL. Forms are RHF + zod. Business invariants are pure functions in `models/`.

## Evaluate

**Hard**

- Lookup, not a gradient: server → Query; ephemeral one-subtree → `useState`; infrequent subtree-shared → Context; frequent/selective → Zustand; shareable/reload → URL; form in-progress → RHF + zod; derived → compute, never store.
- Server state: Query only — not mirrored into Zustand or `useState`.
- URL owns filters, pagination, sort, selected id, tab, wizard step (`searchParams`).
- Forms: React Hook Form in `ui/`. The button owns `useForm`; the form lists `FormItem` fields with `rules` from `@/shared/ui/form`. Server-entity zod lives in `api/schema.ts`. A cross-field resolver calls `models/` functions and does not re-check the parsed entity. Invariants do not live in the component file — they live in `models/` or the component `lib/`.
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

Read form components: a fields array of `FormItem` in `ui/`, rules from `@/shared/ui/form`, business checks calling `models/` — not reinvented in the submit handler and not parked in `models/` as a form schema. Server entities are `api/schema.ts`. UI branches on `AppError` (`isError`) or `data === null` after a failed parse. It does not re-check entity fields.
