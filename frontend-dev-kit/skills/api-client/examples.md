# API Client Examples

The HTTP client, `AppError`, `toAppError`, `createQueryClient()`, and the query-key registry are in the skill (`shared/api/`). Do not add `src/api/client.ts`, `ApiError`, `fetch`, `axios`, or a per-feature `queryKeys.ts`.

Feature calls:

```ts
// features/orders/api/fetchers.ts
import { httpClient } from '@/shared/api/base';
import { parseEntity } from '@/shared/api/parse';
import { ORDERS_ENDPOINTS } from './endpoints';
import { mapOrder } from './dto';
import { orderSchema } from './schema';

export const fetchOrder = async (id: string, signal?: AbortSignal) => {
  const json = await httpClient.get(ORDERS_ENDPOINTS.detail(id), { signal }).json();
  const dto = parseEntity(orderSchema, json);

  if (dto === null) {
    return null;
  }

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
  });
```

`data === null` means the body failed `orderSchema` and `parseEntity` already notified. `isError` means `AppError`. Do not check `data.id` or `data.status` before using the value.
