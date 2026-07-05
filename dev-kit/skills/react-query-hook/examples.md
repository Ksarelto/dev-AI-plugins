# React Query Hook — Few-shot Examples

## Example 1: Paginated list query

**Request:** "Add a hook to fetch paginated orders"

**Files created:**

```ts
// src/api/queryKeys.ts (extend)
export const queryKeys = {
  orders: {
    all: ['orders'] as const,
    list: (params: OrderListParams) => [...queryKeys.orders.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.orders.all, 'detail', id] as const,
  },
};
```

```ts
// features/orders/types.ts
export interface OrderListParams {
  page: number;
  pageSize: number;
  status?: OrderStatus;
}

export interface OrdersResponse {
  data: Order[];
  total: number;
}
```

```ts
// features/orders/api/fetchOrders.ts
export async function fetchOrders(params: OrderListParams): Promise<OrdersResponse> {
  const { data } = await apiClient.get<OrdersResponse>('/orders', { params });
  return data;
}
```

```ts
// features/orders/api/useOrders.ts
export function useOrders(params: OrderListParams) {
  return useQuery({
    queryKey: queryKeys.orders.list(params),
    queryFn: () => fetchOrders(params),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}
```

---

## Example 2: Cancel order mutation

**Request:** "Add a mutation to cancel an order"

**Files created:**

```ts
// features/orders/api/cancelOrder.ts
export async function cancelOrder(id: string): Promise<Order> {
  const { data } = await apiClient.post<Order>(`/orders/${id}/cancel`);
  return data;
}
```

```ts
// features/orders/api/useCancelOrder.ts
export function useCancelOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelOrder,
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      queryClient.setQueryData(queryKeys.orders.detail(order.id), order);
      message.success('Order cancelled');
    },
    onError: (error: ApiError) => {
      message.error(error.message ?? 'Failed to cancel order');
    },
  });
}
```

**Invalidation map:** Cancelling an order invalidates the list (`orders.all`) and updates the detail cache directly.

---

## Example 3: Detail query with enabled guard

**Request:** "Add a hook to fetch a single user by id"

**Files created:**

```ts
// features/users/api/fetchUser.ts
export async function fetchUser(id: string): Promise<User> {
  const { data } = await apiClient.get<User>(`/users/${id}`);
  return data;
}
```

```ts
// features/users/api/useUser.ts
export function useUser(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.users.detail(id!),
    queryFn: () => fetchUser(id!),
    enabled: !!id,
    staleTime: 60_000,
  });
}
```

**Usage in route component:**

```tsx
// pages/UserDetailPage.tsx
export function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: user, isLoading, isError } = useUser(id);

  if (isLoading) return <Spin />;
  if (isError || !user) return <Result status="404" title="User not found" />;

  return <UserProfile user={user} />;
}
```
