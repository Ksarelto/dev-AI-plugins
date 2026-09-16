# React Query — Advanced Patterns

## Select transform

Transform / reshape API data inside the hook — components receive the projected shape and only re-render when the transformed value changes.

```ts
const DISPLAY_NAME_STALE_TIME_MS = 60_000;

export const useUserDisplayName = (id: string): UseQueryResult<string> => {
  return useQuery({
    queryKey: queryKeys.users.detail(id),
    queryFn: () => fetchUser(id),
    select: (user) => `${user.firstName} ${user.lastName}`,
    staleTime: DISPLAY_NAME_STALE_TIME_MS,
  });
};

// Component sees string, not User — re-renders only when the name changes
const { data: displayName } = useUserDisplayName(id);
```

## Prefetch on hover

Populate the cache before navigation so the detail page loads instantly.

```tsx
const PREFETCH_STALE_TIME_MS = 30_000;

const UserRow = ({ user }: { user: User }): JSX.Element => {
  const queryClient = useQueryClient();

  const handleMouseEnter = () => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.users.detail(user.id),
      queryFn: () => fetchUser(user.id),
      staleTime: PREFETCH_STALE_TIME_MS,
    });
  };

  return (
    <tr onMouseEnter={handleMouseEnter}>
      <Link to={`/users/${user.id}`}>
        {user.name}
      </Link>
    </tr>
  );
};
```

## Query options factory

Share query config between `useQuery`, `queryClient.prefetchQuery`, and route loaders — no duplication.

```ts
// features/users/api/userQueryOptions.ts
const DETAIL_STALE_TIME_MS = 60_000;

export const userQueryOptions = (id: string) =>
  queryOptions({
    queryKey: queryKeys.users.detail(id),
    queryFn: () => fetchUser(id),
    staleTime: DETAIL_STALE_TIME_MS,
  });

// Hook
export const useUser = (id: string | undefined): UseQueryResult<User> => {
  return useQuery({
    ...userQueryOptions(id ?? ''),
    queryFn: () => {
      if (!id) throw new Error('useUser called without an id');

      return fetchUser(id);
    },
    enabled: !!id,
  });
};

// React Router loader
export const userLoader = async ({ params }: LoaderFunctionArgs): Promise<User> => {
  if (!params.id) throw new Error('userLoader requires a route id param');

  return queryClient.ensureQueryData(userQueryOptions(params.id));
};
```

## Parallel queries — useQueries

Fetch a variable-length list of resources in parallel with a single hook call.

```ts
const BATCH_STALE_TIME_MS = 60_000;

export const useUserBatch = (ids: string[]) => {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: queryKeys.users.detail(id),
      queryFn: () => fetchUser(id),
      staleTime: BATCH_STALE_TIME_MS,
    })),
    combine: (results) => ({
      users: results.map((r) => r.data).filter(Boolean),
      isLoading: results.some((r) => r.isLoading),
      isError: results.some((r) => r.isError),
    }),
  });
};
```

## Mutation error typing

Type the error generically so per-field validation errors from the server can be wired directly to the form.

```ts
import type { ApiError } from '@/api/types';

export const useCreateUser = (): UseMutationResult<User, ApiError, CreateUserInput> => {
  return useMutation<User, ApiError, CreateUserInput>({
    mutationFn: createUser,
    onError: (error) => {
      if (error.fields) {
        Object.entries(error.fields).forEach(([field, messages]) => {
          form.setError(field, { message: messages[0] });
        });
      } else {
        message.error(error.message ?? 'Failed to create user');
      }
    },
  });
};
```
