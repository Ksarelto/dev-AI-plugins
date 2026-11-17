# React Query Hook — Few-shot Examples

Query keys live in `shared/api/query-keys/{domain}.ts`. Every `useQuery` and `useMutation` for one model lives in the owning hooks role (`api/hooks.ts`, or `api/hooks/` once that file outgrows one file). Fetchers live in `api/fetchers.ts` and call `httpClient`. The samples below are the single-file form. Do not add `api/queryKeys.ts`, `api/useThing.ts`, or `ApiError`. `features/{name}/hooks/` does not call `useQuery` or `useMutation`.

```ts
// shared/api/query-keys/orders.ts
export const orderKeys = {
  all: ['orders'] as const,
  lists: () => [...orderKeys.all, 'list'] as const,
  list: (filters?: OrderFilters) => [...orderKeys.lists(), filters] as const,
  detail: (id: string) => [...orderKeys.all, 'detail', id] as const,
} as const;
```

```ts
// entities/order/api/hooks.ts
import { useQuery } from '@tanstack/react-query';
import { orderKeys } from '@/shared/api/query-keys/orders';
import { fetchOrders } from './fetchers';

export const useOrderList = (filters?: OrderFilters) =>
  useQuery({
    queryKey: orderKeys.list(filters),
    queryFn: ({ signal }) => fetchOrders(filters, signal),
  });
```

Cross-feature refresh imports `orderKeys` from the registry. It does not import `@/features/orders`.
