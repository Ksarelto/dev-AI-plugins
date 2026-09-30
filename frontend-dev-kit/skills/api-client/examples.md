# API Client Examples

The HTTP client, `AppError`, `toAppError`, `createQueryClient()`, and the query-key registry are in the skill (`shared/api/`). Do not add `src/api/client.ts`, `ApiError`, `fetch`, `axios`, or a per-feature `queryKeys.ts`.

Feature calls:

```ts
// features/orders/api/fetchers.ts
import { httpClient } from '@/shared/api/base';
import { ORDERS_ENDPOINTS } from './endpoints';
import { mapOrder, type OrderDto } from './dto';

export const fetchOrder = async (id: string, signal?: AbortSignal) => {
  const dto = await httpClient.get(ORDERS_ENDPOINTS.detail(id), { signal }).json<OrderDto>();
  return mapOrder(dto);
};
```

```ts
// features/orders/hooks/useOrder.ts
import { useQuery } from '@tanstack/react-query';
import { orderKeys } from '@/shared/api/query-keys/orders';
import { fetchOrder } from '../api/fetchers';

export const useOrder = (id: string) =>
  useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: ({ signal }) => fetchOrder(id, signal),
    enabled: id.length > 0,
    staleTime: 30_000,
  });
```
