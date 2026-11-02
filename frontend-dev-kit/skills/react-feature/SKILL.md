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
- `ui/` imports `hooks/`, never `api/` and never a fetcher. That hook calls the query or mutation in `api/hooks.ts`. A form's field rules call `models/` pure functions. `useQuery` and `useMutation` live in `api/hooks.ts`
- Start with `api/ + ui/ + index.ts`. When the UI reads server state, add `hooks/` — `ui/` cannot import `api/`. Add `models/` when there is real client state or business logic.

## Folder structure

```
features/{feature}/
├── api/
│   ├── endpoints.ts      — backend path map for this feature
│   ├── schema.ts         — one zod schema per server entity; wire type is z.infer
│   ├── fetchers.ts       — httpClient calls, then parseEntity, then the mapper
│   ├── hooks.ts          — every useQuery and useMutation for this model
│   └── dto.ts            — domain type and the rename mapper only
├── ui/
│   └── {name}/                   — kebab-case of the export (custom-button/)
│       ├── index.ts              — re-exports component (sole public surface of folder)
│       ├── {name}.tsx            — one component; props interface lives in this file
│       ├── {name}.stories.tsx    — Storybook states
│       ├── styles.ts             — ALL Tailwind classes, never inline in JSX
│       ├── types.ts              — non-prop types only, when the component has them
│       ├── lib/                  — pure helpers used only by this component
│       ├── tests/                — every test for this folder: the component and its lib/ helpers
│       └── ui/{child}/           — nested components, same shape
├── models/               — add only when real client state or business logic exists
│   ├── types.ts          — domain types, when the slice has them
│   ├── store.ts          — Zustand v5 store (session-scoped, cleared on logout)
│   ├── validation.ts     — business invariants as pure functions
│   └── tests/            — unit tests for pure model logic
├── hooks/                — required when ui/ reads server state; ui/ imports this, never api/
│   ├── use{Feature}.ts   — what ui/ imports; calls the api hook, never useQuery or useMutation
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
3. **Create `api/`** — `endpoints.ts` (path map), `schema.ts` (zod; wire type is `z.infer`), `dto.ts` (domain type and rename mapper), `fetchers.ts` (`httpClient`, then `parseEntity`), `hooks.ts` (every query and mutation hook for this model)
4. **Create `models/`** (only when needed) — Zustand stores, validation rules, state machines as pure functions
5. **Add the query or mutation hook to `api/hooks.ts`** — that one file holds every `useQuery` and `useMutation` for this model. `hooks/use{Feature}.ts` calls it and is what `ui/` imports. It does not call `useQuery` or `useMutation`. Other slices import the hook from this slice's `index.ts`
6. **Build `ui/` components** — one folder per component; every folder has `styles.ts`
7. **Wire the page** in `pages/{route}/` — thin composition, no business logic
8. **Write `index.ts`** — export components, orchestration hooks, public types only

## Component folder (mandatory pattern)

Every component inside `ui/` follows this structure — no exceptions, even for one-liners:

```
ui/{name}/
├── index.ts               — export { ComponentName } from './{name}'
├── {name}.tsx             — one component; the props interface is declared here
├── {name}.stories.tsx     — Storybook states
├── styles.ts              — ALL classes defined here
├── types.ts               — non-prop types only, when the component has them
├── lib/                   — pure helpers used only by this component
├── tests/                 — {name}.test.tsx and a test for each lib/ helper
└── ui/{child}/            — nested components, same shape
```

DTO mappers stay in `api/dto.ts`, tested in `api/tests/`. Component-local helpers stay in that component's `lib/`. Slice-wide helpers stay in the slice `lib/`.

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

interface OrderCardProps {
  order: {
    id: string;
  };
  className?: string;
}

export const OrderCard = ({ order, className }: OrderCardProps): JSX.Element => (
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
export { usePlaceOrder }   from './api/hooks';
export type { Order }      from './models/types';
// NOT exported: api/dto, api/ fetchers, config/
```

## Checklist

- [ ] Feature folder follows `features/{name}/api/ + ui/ + index.ts` minimum
- [ ] Query keys in `shared/api/query-keys/{domain}.ts` — no per-feature `queryKeys.ts`
- [ ] `api/endpoints.ts` holds backend paths — no hand-typed URLs in hooks or components
- [ ] `api/fetchers.ts` uses `httpClient` only — no `fetch()`, `ky`, or `axios`
- [ ] Every `useQuery` and `useMutation` for this model is in `api/hooks.ts` — no `api/useThing.ts`
- [ ] Every component folder is kebab-case (`custom-button/custom-button.tsx`) with `styles.ts`, `{name}.stories.tsx`, and `tests/` holding every test for that folder — one component per file, nested components in `ui/`, helpers in `lib/`, props interface in the component file, no Tailwind classes inline in JSX
- [ ] Second pass: no unexplained string or number literals, and no literal that copies a constant already in `shared/api`, slice `config/`, or `constants.ts`
- [ ] A component created from an external library still uses that library's animation, and does not add its own
- [ ] `models/` and `hooks/` segments are earned, not scaffolded empty
- [ ] `useQuery` and `useMutation` are only called in `api/hooks.ts`. `ui/` imports `hooks/`, never `api/` and never a fetcher. A form's field rules may call `models/` pure functions
- [ ] Forms use React Hook Form and `FormItem` (`rhf-form`). Server shape is `api/schema.ts` only. Input constraints are field `rules`. Business invariants are pure functions in `models/`
- [ ] Loading, error, empty, and partial/stale states all handled
- [ ] `index.ts` exports only what consumers need — no stores, DTOs, or fetchers. A public type comes from `models/types`
- [ ] Feature never imports another feature

## Scope shortcuts

| Scope | Segments to create |
|-------|--------------------|
| List page | `api/hooks.ts` (`useOrderList`) + `hooks/useOrderList.ts` + `ui/order-list/` + `index.ts` |
| CRUD | Add `useCreateOrder`, `useUpdateOrder`, `useDeleteOrder` to the same `api/hooks.ts` + form component |
| Widget | Not this skill. A widget composes feature public APIs. It has no `api/` and no `models/` |

Do not create route files unless explicitly requested. For a single standalone component, use the `react-component` skill.

See [examples.md](examples.md) for few-shot templates. When the feature adds local state, an Effect, a context, a long list, or a Suspense or error boundary, read [references/react-state-and-effects.md](references/react-state-and-effects.md) for the corner cases and re-render bottlenecks behind the `react` rule.
