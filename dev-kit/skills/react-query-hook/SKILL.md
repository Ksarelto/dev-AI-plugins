---
name: react-query-hook
description: Create react-query hooks with query key factories, typed fetchers, and cache invalidation. Use when adding data fetching, mutations, or API integration with @tanstack/react-query.
---

# React Query Hook

## When to use

- Adding a new API endpoint integration
- Creating `useQuery` or `useMutation` hooks
- User asks to "fetch data", "add a mutation", or "create an API hook"

## Instructions

1. **Define types** — request params, response shape, entity interface in `types.ts`
2. **Add query key** — extend `src/api/queryKeys.ts` factory:
   ```ts
   entities: {
     all: ['entities'] as const,
     list: (params) => [...queryKeys.entities.all, 'list', params] as const,
     detail: (id) => [...queryKeys.entities.all, 'detail', id] as const,
   }
   ```
3. **Create fetcher** — pure async function in `fetch{Entity}.ts` (no React imports)
4. **Create hook** — `use{Entity}` or `use{Action}{Entity}` wrapping `useQuery`/`useMutation`
5. **Configure options** — set `staleTime`, `enabled`, `retry` as appropriate
6. **Mutations** — define `onSuccess` invalidation map; handle errors with typed `ApiError`
7. **Export** — hook + types from feature barrel

## Query hook checklist

- [ ] Key uses factory, not inline string
- [ ] Fetcher is a separate pure function
- [ ] `enabled` guard when params may be undefined
- [ ] `staleTime` set explicitly
- [ ] Return type is inferred or exported

## Mutation hook checklist

- [ ] Invalidates all affected query keys in `onSuccess`
- [ ] Error handling with user feedback (message or form error)
- [ ] Input type matches API contract
- [ ] Optimistic update only when rollback is feasible

See [examples.md](examples.md) for few-shot templates.
