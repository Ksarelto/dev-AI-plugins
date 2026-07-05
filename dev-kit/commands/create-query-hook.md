---
name: create-query-hook
description: Create a react-query hook with query key factory entry, typed fetcher, and cache invalidation
---

# Create Query Hook

Create a new react-query hook following dev-kit conventions.

## Steps

1. Ask the user for (or infer from context):
   - Entity name (e.g. `User`, `Order`)
   - Hook type: query (fetch) or mutation (create/update/delete)
   - API endpoint shape if known
2. Load the `react-query-hook` skill and read `skills/react-query-hook/examples.md`
3. Read rules: `react-query`, `typescript-react`
4. Read few-shot templates: `examples/rules/react-query.md`

### For a query hook

1. Add types to feature `types.ts` (entity, params, response)
2. Extend `src/api/queryKeys.ts` with factory entries
3. Create `fetch{Entity}.ts` — pure async fetcher
4. Create `use{Entity}.ts` — `useQuery` wrapper with `staleTime`, `enabled` guard
5. Export from feature barrel

### For a mutation hook

1. Add input type to feature `types.ts`
2. Create `{action}{Entity}.ts` — pure async mutation function
3. Create `use{Action}{Entity}.ts` — `useMutation` with:
   - `onSuccess`: invalidate affected query keys
   - `onError`: typed error handling with user feedback
4. Export from feature barrel

## Output checklist

- [ ] Query key uses factory, not inline string
- [ ] Fetcher/mutation function has no React imports
- [ ] Hook sets `staleTime` and `enabled` (for queries)
- [ ] Mutation invalidates related keys in `onSuccess`
- [ ] Types exported alongside hook
