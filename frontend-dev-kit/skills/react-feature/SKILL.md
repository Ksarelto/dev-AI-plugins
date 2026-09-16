---
name: react-feature
description: Scaffold and implement a React feature slice following FSD with api/, ui/, models/, hooks/, config/, and index.ts. Use when building a new page, CRUD feature, or business capability. Query keys live in shared/api/query-keys/, not per-feature. Every component folder gets a mandatory styles.ts.
---

# React Feature

## When to use

- Building a new page or business feature (orders, users, settings, checkout)
- Adding a CRUD slice to an existing app
- User asks to "create a feature" or "add a new section"

## Architecture rules (must follow)

- Feature slices live in `src/features/{feature}/` — one self-contained vertical
- **No feature imports another feature** — compose at the page or widget layer above
- Query keys live in `shared/api/query-keys/{domain}.ts` — never in a per-feature `api/queryKeys.ts`
- HTTP calls use `httpClient` from `shared/api/base.ts` — never raw `fetch` or `ky`/`axios` directly
- Every component folder requires a `styles.ts` — no Tailwind classes inline in JSX, ever
- `models/` = pure business logic + Zustand stores; `hooks/` = orchestration (sequences, await chains); `ui/` = React + JSX
- `ui/` never calls `api/` or `models/` directly — everything goes through `hooks/`
- Start with `api/ + ui/ + index.ts`. Add `models/` when there is real client state or business logic. Add `hooks/` when there is real orchestration.

## Folder structure

```
features/{feature}/
├── api/
│   ├── endpoints.ts      — backend path map for this feature
│   ├── fetchers.ts       — httpClient calls, DTO → domain mappers invoked here
│   └── dto.ts            — wire types (DTOs) + domain types + mapper functions
├── ui/
│   └── {name}/                   — kebab-case of the export (custom-button/)
│       ├── index.ts              — re-exports component (sole public surface of folder)
│       ├── {name}.tsx            — JSX implementation (custom-button.tsx)
│       ├── styles.ts             — ALL Tailwind classes, never inline in JSX
│       ├── types.ts              — local prop types (optional)
│       └── {name}.test.tsx       — colocated RTL test (recommended)
├── models/               — add only when real client state or business logic exists
│   ├── store.ts          — Zustand v5 store (session-scoped, cleared on logout)
│   ├── validation.ts     — business invariants as pure functions
│   └── tests/            — unit tests for pure model logic
├── hooks/                — add only when real orchestration (sequences, awaits) exists
│   ├── use{Feature}.ts   — wraps useQuery/useMutation, chains models + api + navigation
│   └── tests/            — integration tests for the hook sequence
├── config/
│   └── permissions.ts    — permission id constants, analytics event names, feature constants
└── index.ts              — sole public API: components + hooks + public types only
```

## Instructions

1. **Plan scope** — identify entities, API endpoints, UI components, and routes needed
2. **Register query keys** — add (or extend) `shared/api/query-keys/{domain}.ts`:
   ```ts
   export const orderKeys = {
     all:    ['orders'] as const,
     lists:  () => [...orderKeys.all, 'list'] as const,
     list:   (filters?: OrderFilters) => [...orderKeys.lists(), filters] as const,
     detail: (id: string) => [...orderKeys.all, 'detail', id] as const,
   } as const;
   ```
3. **Create `api/`** — `endpoints.ts` (path map), `dto.ts` (wire types + mapper), `fetchers.ts` (calls `httpClient`)
4. **Create `models/`** (only when needed) — Zustand stores, validation rules, state machines as pure functions
5. **Create `hooks/`** (only when needed) — `use{Feature}.ts` wraps `useQuery`/`useMutation`, sequences calls, calls `useNavigate`
6. **Build `ui/` components** — one folder per component; every folder has `styles.ts`
7. **Wire the page** in `pages/{route}/` — thin composition, no business logic
8. **Write `index.ts`** — export components, orchestration hooks, public types only

## Component folder (mandatory pattern)

Every component inside `ui/` follows this structure — no exceptions, even for one-liners:

```
ui/{name}/
├── index.ts               — export { ComponentName } from './{name}'
├── {name}.tsx             — JSX only, all classes via styles.ts (button.tsx, custom-button.tsx)
├── styles.ts              — ALL classes defined here
└── types.ts               — {ComponentName}Props interface (optional)
```

**`styles.ts` patterns:**

```ts
// Static classes
export const root = 'flex items-center gap-2 rounded-md bg-card p-4';
export const title = 'text-sm font-medium text-foreground';

// Variants with cva
import { cva } from 'class-variance-authority';
export const button = cva('inline-flex items-center rounded-md', {
  variants: {
    intent: { primary: 'bg-primary text-primary-foreground', ghost: 'bg-transparent' },
    size:   { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4' },
  },
  defaultVariants: { intent: 'primary', size: 'md' },
});
```

**`{name}.tsx` — classes always come from `styles.ts`:**

```tsx
import * as styles from './styles';
import type { OrderCardProps } from './types';

export const OrderCard = ({ order, className }: OrderCardProps) => (
  <div className={cn(styles.root, className)}>
    <p className={styles.title}>{order.id}</p>
  </div>
);
```

## `index.ts` — public API

```ts
// features/orders/index.ts
export { OrderList }       from './ui/order-list';
export { OrderForm }       from './ui/order-form';
export { usePlaceOrder }   from './hooks/usePlaceOrder';
export type { PlaceOrderPayload } from './api/dto';
// NOT exported: models/ internals, api/ fetchers, config/
```

## Checklist

- [ ] Feature folder follows `features/{name}/api/ + ui/ + index.ts` minimum
- [ ] Query keys in `shared/api/query-keys/{domain}.ts` — no per-feature `queryKeys.ts`
- [ ] `api/endpoints.ts` holds backend paths — no hand-typed URLs in hooks or components
- [ ] `api/fetchers.ts` uses `httpClient` only — no `fetch()`, `ky`, or `axios`
- [ ] Every component folder is kebab-case (`custom-button/custom-button.tsx`) with `styles.ts` — no Tailwind classes inline in JSX
- [ ] `models/` and `hooks/` segments are earned, not scaffolded empty
- [ ] `ui/` never calls `api/` directly — always via `hooks/`
- [ ] Forms use React Hook Form + zod; validation in three levels (wire shape / input constraints / business invariants)
- [ ] Loading, error, empty, and partial/stale states all handled
- [ ] `index.ts` exports only what consumers need — no stores, DTOs, fetchers
- [ ] Feature never imports another feature

## Scope shortcuts

| Scope | Segments to create |
|-------|--------------------|
| List page | `api/` + `hooks/useOrderList` + `ui/order-list/` + `index.ts` |
| CRUD | Add `useCreateOrder`, `useUpdateOrder`, `useDeleteOrder` hooks + form component |
| Widget | Same as list with limited query params; no `models/` unless real client state |

Do not create route files unless explicitly requested. For a single standalone component, use the `react-component` skill.

See [examples.md](examples.md) for few-shot templates.
