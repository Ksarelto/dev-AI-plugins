# react-query — Few-shot Examples

## Example 1: Query key factory

### Bad

```tsx
function UserList() {
  const { data } = useQuery({
    queryKey: ['users', page, search],
    queryFn: () => fetch(`/api/users?page=${page}&q=${search}`).then((r) => r.json()),
  });
}
```

Inline key strings in component; fetch logic not reusable; no invalidation contract.

### Good

```ts
// src/api/queryKeys.ts
export const queryKeys = {
  users: {
    all: ['users'] as const,
    list: (params: UserListParams) => [...queryKeys.users.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.users.all, 'detail', id] as const,
  },
};

// features/users/api/useUsers.ts
export function useUsers(params: UserListParams) {
  return useQuery({
    queryKey: queryKeys.users.list(params),
    queryFn: () => fetchUsers(params),
    staleTime: 30_000,
  });
}

// features/users/components/UserList/index.tsx
export function UserList() {
  const { page, search } = useUserFilters();
  const { data, isLoading } = useUsers({ page, search });
  // ...
}
```

Centralized keys; dedicated hook; component stays clean.

---

## Example 2: Mutation with invalidation

### Bad

```tsx
function CreateUserForm() {
  const handleSubmit = async (values: CreateUserInput) => {
    await fetch('/api/users', { method: 'POST', body: JSON.stringify(values) });
    window.location.reload();
  };
}
```

Full page reload to refresh data; no cache management.

### Good

```ts
// features/users/api/useCreateUser.ts
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateUserInput) => createUser(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      message.success('User created');
    },
    onError: (error: ApiError) => {
      message.error(error.message ?? 'Failed to create user');
    },
  });
}
```

Invalidates all user queries; proper error handling; no page reload.

---

## Example 3: Enabled guard and detail query

### Bad

```tsx
function UserDetail({ userId }: { userId?: string }) {
  const { data } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId!), // non-null assertion
  });
}
```

Query fires with undefined id; unsafe assertion.

### Good

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

// features/users/components/UserDetail/index.tsx
export function UserDetail({ userId }: { userId?: string }) {
  const { data: user, isLoading, isError } = useUser(userId);

  if (!userId) return null;
  if (isLoading) return <Spin />;
  if (isError || !user) return <Empty description="User not found" />;

  return <UserCard user={user} />;
}
```

`enabled` guard prevents fetch until id is available; proper loading/error states.
