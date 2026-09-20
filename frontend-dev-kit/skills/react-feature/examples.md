# React Feature — Few-shot Examples

## Example 1: Users list feature

**Request:** "Add a users list page with search and pagination"

**Output structure:**

```
src/features/users/
├── api/
│   ├── fetchUsers.ts
│   ├── useUsers.ts
│   └── useDeleteUser.ts
├── ui/
│   ├── user-list/
│   │   ├── user-list.tsx
│   │   ├── index.ts
│   │   └── types.ts
│   ├── user-filters/
│   │   ├── user-filters.tsx
│   │   ├── index.ts
│   │   └── types.ts
│   └── delete-user-dialog/
│       ├── delete-user-dialog.tsx
│       ├── index.ts
│       └── types.ts
├── hooks/
│   └── useUserFilters.ts
├── types.ts
└── index.ts
```

**Key files:**

```ts
// types.ts
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
}

export interface UserListParams {
  page: number;
  pageSize: number;
  search?: string;
}

export interface UsersResponse {
  data: User[];
  total: number;
}
```

```ts
// api/useUsers.ts
export const useUsers = (params: UserListParams): UseQueryResult<UsersResponse> => {
  return useQuery({
    queryKey: queryKeys.users.list(params),
    queryFn: () => fetchUsers(params),
    staleTime: 30_000,
  });
};
```

```tsx
// ui/user-list/user-list.tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export const UserList = (): JSX.Element => {
  const filters = useUserFilters();
  const { data, isLoading } = useUsers(filters.params);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <>
      <UserFilters {...filters} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              Name
            </TableHead>
            <TableHead>
              Email
            </TableHead>
            <TableHead>
              Role
            </TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.data.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                {user.name}
              </TableCell>
              <TableCell>
                {user.email}
              </TableCell>
              <TableCell>
                {user.role}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteId(user.id)}
                >
                  Delete
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <DeleteUserDialog
        userId={deleteId}
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
      />
    </>
  );
};
```

---

## Example 2: Settings feature (form-heavy)

**Request:** "Add a profile settings page where users can update their name and email"

**Output structure:**

```
src/features/settings/
├── api/
│   ├── useProfile.ts
│   └── useUpdateProfile.ts
├── ui/
│   └── ProfileForm/
│       ├── index.tsx
│       └── types.ts
├── types.ts
└── index.ts
```

**Key pattern:** Single detail query + update mutation; form pre-populated via `reset()` on data load.

```ts
// ui/ProfileForm/types.ts
import { z } from 'zod';

export const profileSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Enter a valid email'),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;
```

```tsx
// ui/ProfileForm/index.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { profileSchema, type ProfileFormValues } from './types';

export const ProfileForm = (): JSX.Element => {
  const { data: profile, isLoading } = useProfile();
  const { mutate, isPending } = useUpdateProfile();

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: '', email: '' },
  });

  useEffect(() => {
    if (profile) {
      form.reset(profile);
    }
  }, [profile, form]);

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => mutate(values))}
        className="space-y-4"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Name
              </FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Email
              </FormLabel>
              <FormControl>
                <Input
                  type="email"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          disabled={isPending}
        >
          {isPending ? 'Saving…' : 'Save'}
        </Button>
      </form>
    </Form>
  );
};
```

---

## Example 3: Dashboard widget feature

**Request:** "Add a recent orders widget to the dashboard"

**Output structure:**

```
src/features/orders/
├── api/
│   └── useRecentOrders.ts
├── ui/
│   └── RecentOrdersWidget/
│       ├── index.tsx
│       └── types.ts
├── types.ts
└── index.ts
```

**Key pattern:** Small read-only feature; single list hook; widget imported into dashboard page.

```tsx
// pages/DashboardPage.tsx
import { RecentOrdersWidget } from '@/features/orders';

export const DashboardPage = (): JSX.Element => {
  return (
    <div className="p-6">
      <div className="grid grid-cols-2 gap-4">
        <RecentOrdersWidget limit={5} />
      </div>
    </div>
  );
};
```
