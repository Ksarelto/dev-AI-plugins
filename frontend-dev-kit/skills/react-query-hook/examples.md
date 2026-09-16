# React Query Hook — Few-shot Examples

## Example 1: Paginated list query

**Request:** "Add a hook to fetch paginated orders"

**Files created:**

```ts
// src/features/users/api/queryKeys.ts
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
export const fetchOrders = async (params: OrderListParams): Promise<OrdersResponse> => {
  const query = new URLSearchParams(params as Record<string, string>).toString();

  return api.get<OrdersResponse>(`/orders?${query}`);
};
```

```ts
// features/orders/api/useOrders.ts
const STALE_TIME_MS = 30_000;

export const useOrders = (params: OrderListParams): UseQueryResult<OrdersResponse> => {
  return useQuery({
    queryKey: queryKeys.orders.list(params),
    queryFn: () => fetchOrders(params),
    staleTime: STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });
};
```

---

## Example 2: Cancel order mutation

**Request:** "Add a mutation to cancel an order"

**Files created:**

```ts
// features/orders/api/cancelOrder.ts
export const cancelOrder = async (id: string): Promise<Order> => {
  return api.post<Order>(`/orders/${id}/cancel`, {});
};
```

```ts
// features/orders/api/useCancelOrder.ts
export const useCancelOrder = (): UseMutationResult<Order, ApiError, string> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelOrder,
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      queryClient.setQueryData(queryKeys.orders.detail(order.id), order);
      toast.success('Order cancelled');
    },
    onError: (error: ApiError) => {
      toast.error(error.message ?? 'Failed to cancel order');
    },
  });
};
```

**Invalidation map:** Cancelling an order invalidates the list (`orders.all`) and updates the detail cache directly.

---

## Example 3: Detail query with enabled guard

**Request:** "Add a hook to fetch a single user by id"

**Files created:**

```ts
// features/users/api/fetchUser.ts
export const fetchUser = async (id: string): Promise<User> => {
  return api.get<User>(`/users/${id}`);
};
```

```ts
// features/users/api/useUser.ts
const DETAIL_STALE_TIME_MS = 60_000;

export const useUser = (id: string | undefined): UseQueryResult<User> => {
  return useQuery({
    queryKey: queryKeys.users.detail(id ?? ''),
    queryFn: () => {
      if (!id) throw new Error('useUser called without an id');

      return fetchUser(id);
    },
    enabled: !!id,
    staleTime: DETAIL_STALE_TIME_MS,
  });
};
```

**Usage in route component:**

```tsx
// pages/UserDetailPage.tsx
export const UserDetailPage = (): JSX.Element => {
  const { id } = useParams<{ id: string }>();
  const { data: user, isLoading, isError } = useUser(id);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError || !user) return <p className="text-destructive">User not found</p>;

  return <UserProfile user={user} />;
};
```

---

## Example 4: Infinite scroll list

**Request:** "Add infinite scroll to the posts list"

```ts
// features/posts/api/fetchPosts.ts
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

export const fetchPosts = async ({
  page = DEFAULT_PAGE,
  pageSize = DEFAULT_PAGE_SIZE,
}: PostsPageParam): Promise<PostsPage> => {
  return api.get<PostsPage>(`/posts?page=${page}&pageSize=${pageSize}`);
};
```

```ts
// features/posts/api/useInfinitePosts.ts
const DEFAULT_PAGE_SIZE = 20;
const INITIAL_PAGE_PARAM = 1;
const STALE_TIME_MS = 30_000;

export const useInfinitePosts = (pageSize = DEFAULT_PAGE_SIZE): UseInfiniteQueryResult<InfiniteData<PostsPage>> => {
  return useInfiniteQuery({
    queryKey: queryKeys.posts.list({ pageSize }),
    queryFn: ({ pageParam }) => fetchPosts({ page: pageParam, pageSize }),
    initialPageParam: INITIAL_PAGE_PARAM,
    getNextPageParam: (lastPage, _, lastPageParam) =>
      lastPage.hasMore ? lastPageParam + 1 : undefined,
    staleTime: STALE_TIME_MS,
  });
};
```

```tsx
// Usage in component
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfinitePosts();
const posts = data?.pages.flatMap((p) => p.data) ?? [];

return (
  <VirtualList
    items={posts}
    onEndReached={() => hasNextPage && fetchNextPage()}
    renderItem={(post) => <PostCard key={post.id} post={post} />}
    footer={isFetchingNextPage ? <Skeleton className="h-8 w-full" /> : null}
  />
);
```

---

## Example 5: Optimistic update with rollback

**Request:** "Optimistically update the like count when a user likes a post"

```ts
// features/posts/api/useLikePost.ts
export const useLikePost = (): UseMutationResult<Post, unknown, string, { previous: Post | undefined }> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.post<Post>(`/posts/${id}/like`, {}),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.posts.detail(id) });

      const previous = queryClient.getQueryData<Post>(queryKeys.posts.detail(id));

      queryClient.setQueryData<Post>(queryKeys.posts.detail(id), (old) =>
        old ? { ...old, likes: old.likes + 1 } : old,
      );

      return { previous };
    },
    onError: (_err, id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.posts.detail(id), context.previous);
      }
    },
    onSettled: (_data, _err, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.detail(id) });
    },
  });
};
```

**Pattern:** `onMutate` cancels in-flight queries, snapshots previous data, and applies the optimistic update. `onError` rolls back to the snapshot; `onSettled` always re-syncs with the server.

---

## Example 6: Dependent queries

**Request:** "Fetch user settings only after the current user is loaded"

```ts
// features/settings/api/useUserSettings.ts
const SETTINGS_STALE_TIME_MS = 5 * 60_000;

export const useUserSettings = (): UseQueryResult<UserSettings> => {
  const { data: user } = useCurrentUser();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.settings.byUser(userId ?? ''),
    queryFn: () => {
      if (!userId) throw new Error('useUserSettings called before the current user loaded');

      return fetchUserSettings(userId);
    },
    enabled: !!userId,
    staleTime: SETTINGS_STALE_TIME_MS,
  });
};
```

```ts
// features/settings/api/useUserWithSettings.ts
// Combine both queries into one hook to avoid prop drilling
export const useUserWithSettings = (): {
  user: User | undefined;
  settings: UserSettings | undefined;
  isLoading: boolean;
  isError: boolean;
} => {
  const userQuery = useCurrentUser();
  const settingsQuery = useUserSettings();

  return {
    user: userQuery.data,
    settings: settingsQuery.data,
    isLoading: userQuery.isLoading || settingsQuery.isLoading,
    isError: userQuery.isError || settingsQuery.isError,
  };
};
```
