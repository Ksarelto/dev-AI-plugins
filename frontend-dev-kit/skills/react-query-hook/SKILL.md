---
name: react-query-hook
description: Create TanStack Query v5 hooks with the central query-key registry, typed fetchers via httpClient, and cache invalidation across features. Use when adding data fetching, mutations, or API integration. Cross-feature cache invalidation goes through shared/api/query-keys/, never through another feature's exports.
---

# React Query Hook

## When to use

- Adding a new API endpoint integration to a feature
- Creating `useQuery` or `useMutation` hooks inside `features/{name}/hooks/`
- User asks to "fetch data", "add a mutation", or "create an API hook"

## Architecture rules

- Query keys live in `shared/api/query-keys/{domain}.ts` — never in per-feature `api/queryKeys.ts`, never as inline array literals
- Fetchers live in `features/{name}/api/fetchers.ts` and call `httpClient` from `shared/api/base.ts`
- Hooks live in `features/{name}/hooks/` — they wrap `useQuery`/`useMutation` and may call `models/` functions
- Cross-feature cache invalidation: import the shared key from `shared/api/query-keys/` and call `invalidateQueries` — never import from another feature
- `ui/` components never call `useQuery`/`useMutation` directly — always through a `hooks/` wrapper

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

2. **Add fetcher** in `features/{name}/api/fetchers.ts` — pure async function, no React imports:
   ```ts
   // features/orders/api/fetchers.ts
   import { httpClient } from '@/shared/api/base';
   import { ORDERS_ENDPOINTS } from './endpoints';
   import { mapOrder, type Order, type OrderFilters } from './dto';

   export const fetchOrders = async (filters?: OrderFilters): Promise<Order[]> => {
     const dtos = await httpClient.get(ORDERS_ENDPOINTS.list, {
       searchParams: filters as Record<string, string | number>,
     }).json<OrderDto[]>();
     return dtos.map(mapOrder);
   };
   ```

3. **Create query hook** in `features/{name}/hooks/`:
   ```ts
   // features/orders/hooks/useOrderList.ts
   import { useQuery } from '@tanstack/react-query';
   import { orderKeys } from '@/shared/api/query-keys/orders';
   import { fetchOrders } from '../api/fetchers';
   import type { OrderFilters } from '../api/dto';

   export const useOrderList = (filters?: OrderFilters) => {
     return useQuery({
       queryKey: orderKeys.list(filters),
       queryFn:  () => fetchOrders(filters),
       staleTime: 30_000,
     });
   };
   ```

4. **Create mutation hook** in `features/{name}/hooks/`:
   ```ts
   // features/orders/hooks/usePlaceOrder.ts
   import { useMutation, useQueryClient } from '@tanstack/react-query';
   import { useNavigate } from 'react-router';
   import { orderKeys } from '@/shared/api/query-keys/orders';
   import { isAppError, AppErrorKind } from '@/shared/api/errors';
   import { placeOrder } from '../api/fetchers';
   import { validateOrderDraft } from '../models/validation';
   import type { PlaceOrderInput } from '../api/dto';

   export const usePlaceOrder = () => {
     const queryClient = useQueryClient();
     const navigate    = useNavigate();

     return useMutation({
       mutationKey: orderKeys.mutations.place(),
       mutationFn:  (input: PlaceOrderInput) => {
         // Ask models/ for the decision — hook only sequences
         const error = validateOrderDraft(input);
         if (error) throw error;
         return placeOrder(input);
       },
       onSuccess: (order) => {
         queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
         navigate(`/orders/${order.id}`);
       },
       onError: (err) => {
         if (!isAppError(err)) return;
         // Validation errors are mapped to form fields by the ui/ component
         // Generic errors are handled by the global QueryClient handler
       },
     });
   };
   ```

## Cross-feature cache invalidation

Feature A's mutation invalidates Feature B's cached data by importing from the **shared registry** — never from Feature B's exports:

```ts
// features/document/hooks/useSubmitDocument.ts
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
      // Default: invalidateQueries. Only use setQueryData when payload has ordering field.
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(orderId) });
    },
  });
};
```

## Query hook checklist

- [ ] Key uses factory from `shared/api/query-keys/` — no inline `['orders', 'list']` literals
- [ ] Fetcher is a separate pure function in `api/fetchers.ts`
- [ ] `staleTime` set explicitly
- [ ] `enabled` guard when params may be undefined
- [ ] Hook lives in `features/{name}/hooks/`, not directly in a component

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
