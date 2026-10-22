---
name: react-query-hook
description: Create TanStack Query v5 hooks with the central query-key registry, typed fetchers via httpClient, and cache invalidation across features. Use when adding data fetching, mutations, or API integration. Trust a parsed response or null; do not restate timeout, retry, prefixUrl, or Authorization from shared/api. Cross-feature cache invalidation goes through shared/api/query-keys/, never through another feature's exports.
---

# React Query Hook

## When to use

- Adding a new API endpoint integration to a feature
- Creating `useQuery` or `useMutation` hooks inside an `api/` segment (`entities/{name}/api/`, or `features/{name}/api/` when no entity owns the resource, or `shared/api/` when more than one slice needs the same hook)
- User asks to "fetch data", "add a mutation", or "create an API hook"

## Architecture rules

- Query keys live in `shared/api/query-keys/{domain}.ts` — never in per-feature `api/queryKeys.ts`, never as inline array literals
- Fetchers live in the owning slice's `api/fetchers.ts` and call `httpClient` from `shared/api/base.ts`
- `useQuery` and `useMutation` are called only in that `api/` segment. Other features and entities import the hook from the owner's public `index.ts`. They do not declare a second one. `features/{name}/hooks/` does not call `useQuery` or `useMutation`. A feature hook may compose navigation and local UI state, and it calls the api hook
- Cross-feature cache invalidation: import the shared key from `shared/api/query-keys/` and call `invalidateQueries` — never import from another feature
- `ui/` imports the api hook. It never calls `useQuery` or `useMutation`, and it never imports a fetcher
- Read `shared/api/base.ts`, `config.ts`, and `query-client.ts` before adding a hook option. Do not pass `timeout`, `retry`, `prefixUrl`, or `Authorization` on `httpClient`. Do not copy `staleTime` or `retry` as a literal — a different policy is a named constant in `shared/api`.
- A fetcher returns the domain value or `null` (`parseEntity` failed and already notified). The hook does not parse again. UI branches on `isPending`, `isError`, and `data === null`. It does not check entity fields.

## Step-by-step

1. **Register query key** — extend `shared/api/query-keys/{domain}.ts` (one file per business domain):
   ```ts
   // shared/api/query-keys/orders.ts
   export const orderKeys = {
     all:    ['orders'] as const,
     lists:  () => [...orderKeys.all, 'list'] as const,
     list:   (filters?: OrderFilters) => [...orderKeys.lists(), filters] as const,
     detail: (id: string) => [...orderKeys.all, 'detail', id] as const,
     mutations: {
       place: () => [...orderKeys.all, 'mutation', 'place'] as const,
     },
   } as const;
   ```

2. **Add fetcher** in `features/{name}/api/fetchers.ts` — pure async function, no React imports. Schema and `parseEntity` are the `api-client` skill. Forward `signal`. Do not set client options the base client already owns.
   ```ts
   // features/orders/api/fetchers.ts
   import { httpClient } from '@/shared/api/base';
   import { parseEntity } from '@/shared/api/parse';
   import { ORDERS_ENDPOINTS } from './endpoints';
   import { mapOrder, type Order, type OrderFilters } from './dto';
   import { orderListSchema } from './schema';

   export const fetchOrders = async (
     filters?: OrderFilters,
     signal?: AbortSignal,
   ): Promise<Order[] | null> => {
     const json = await httpClient.get(ORDERS_ENDPOINTS.list, {
       searchParams: filters,
       signal,
     }).json();
     const dtos = parseEntity(orderListSchema, json);

     if (dtos === null) {
       return null;
     }

     return dtos.map(mapOrder);
   };
   ```

3. **Create query hook** in the owning `api/` segment. Omit `staleTime` and `retry` when `createQueryClient` already has the policy.
   ```ts
   // entities/order/api/useOrderList.ts
   import { useQuery } from '@tanstack/react-query';
   import { orderKeys } from '@/shared/api/query-keys/orders';
   import { fetchOrders } from './fetchers';
   import type { OrderFilters } from './dto';

   export const useOrderList = (filters?: OrderFilters) => (
     useQuery({
       queryKey: orderKeys.list(filters),
       queryFn: ({ signal }) => fetchOrders(filters, signal),
     })
   );
   ```

   `data === null` is an invalid payload (already notified). `isError` is an `AppError`. Do not add an `onError` that toasts the generic message again.

4. **Create mutation hook** in the same `api/` segment. Navigation stays in a feature hook that calls this one and does not call `useMutation`:
   ```ts
   // entities/order/api/usePlaceOrder.ts
   import { useMutation, useQueryClient } from '@tanstack/react-query';
   import { orderKeys } from '@/shared/api/query-keys/orders';
   import { placeOrder } from './fetchers';
   import type { PlaceOrderInput } from './dto';

   export const usePlaceOrder = () => {
     const queryClient = useQueryClient();

     return useMutation({
       mutationKey: orderKeys.mutations.place(),
       mutationFn: (input: PlaceOrderInput) => placeOrder(input),
       onSuccess: () => {
         queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
       },
     });
   };
   ```
   Domain failures are return values from `models/`, checked in `ui/` before `mutate` — not thrown here. The hook has no `onError`: the `ui/` component maps validation errors to fields, and the global `QueryClient` handler toasts the rest.

## Cross-feature cache invalidation

Feature A's mutation invalidates Feature B's cached data by importing from the **shared registry** — never from Feature B's exports:

```ts
// features/document/api/useSubmitDocument.ts
import { orderKeys }  from '@/shared/api/query-keys/orders';   // ✓ shared registry
// NOT: import { useInvalidateOrders } from '@/features/orders' // ✗ cross-feature import
```

## SSE-driven invalidation (in hooks/)

```ts
// features/orders/hooks/useOrderEvents.ts
import { useSseConsumer } from '@/shared/api/realtime/useSseConsumer';
import { SseEvent }       from '@/shared/api/realtime/events';
import { orderKeys }      from '@/shared/api/query-keys/orders';

export const useOrderEvents = () => {
  const queryClient = useQueryClient();

  useSseConsumer('orders', {
    [SseEvent.OrderStatusChanged]: (data) => {
      const { orderId } = JSON.parse(data);
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(orderId) });
    },
  });
};
```

Default to `invalidateQueries`. Use `setQueryData` only when the payload has an ordering field.

## Query hook checklist

- [ ] Key uses factory from `shared/api/query-keys/` — no inline `['orders', 'list']` literals
- [ ] Fetcher is a separate pure function in `api/fetchers.ts` and returns `T | null` after `parseEntity`
- [ ] No `timeout`, `retry`, `prefixUrl`, or `Authorization` on the request — already set in `shared/api`
- [ ] A different `staleTime` or `retry` is a named constant imported from `shared/api`, not a literal in the hook
- [ ] UI checks `isError` and `data === null`; it does not re-check entity fields
- [ ] `enabled` guard when params may be undefined
- [ ] Second pass: no unexplained string or number literals, and no literal that copies a `shared/api` constant
- [ ] `useQuery` and `useMutation` live in an `api/` segment, not in a component and not in `features/{name}/hooks/`

## Mutation hook checklist

- [ ] Invalidates affected query keys in `onSuccess` (or `onSettled` when failure also needs resync)
- [ ] Cross-feature invalidation goes through `shared/api/query-keys/` — never imports another feature
- [ ] Business decisions delegated to `models/` pure functions — hook only sequences
- [ ] `AppError` narrowing in `onError` for Validation errors (422) → form mapping
- [ ] Navigation (`useNavigate`) called in `onSuccess`, not inside the fetcher

## References

| Topic | File |
|-------|------|
| Few-shot implementation examples | [examples.md](examples.md) |
| Infinite queries, prefetch, select, parallel queries | [references/advanced-patterns.md](references/advanced-patterns.md) |
| Mocking hooks in Vitest tests | [references/testing.md](references/testing.md) |
