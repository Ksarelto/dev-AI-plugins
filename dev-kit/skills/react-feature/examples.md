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
├── components/
│   ├── UserList/
│   │   ├── index.tsx
│   │   ├── UserList.css.ts
│   │   └── types.ts
│   ├── UserFilters/
│   │   ├── index.tsx
│   │   └── types.ts
│   └── DeleteUserModal/
│       ├── index.tsx
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
export function useUsers(params: UserListParams) {
  return useQuery({
    queryKey: queryKeys.users.list(params),
    queryFn: () => fetchUsers(params),
    staleTime: 30_000,
  });
}
```

```tsx
// components/UserList/index.tsx
export function UserList() {
  const filters = useUserFilters();
  const { data, isLoading } = useUsers(filters.params);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  return (
    <>
      <UserFilters {...filters} />
      <Table<User>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.data}
        columns={columns(setDeleteId)}
        pagination={{ total: data?.total, ...filters.pagination }}
      />
      <DeleteUserModal userId={deleteId} open={!!deleteId} onClose={() => setDeleteId(null)} />
    </>
  );
}
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
├── components/
│   └── ProfileForm/
│       ├── index.tsx
│       ├── ProfileForm.css.ts
│       └── types.ts
├── types.ts
└── index.ts
```

**Key pattern:** Single detail query + update mutation; form pre-populated via `useEffect` + `form.setFieldsValue`.

```tsx
// components/ProfileForm/index.tsx
export function ProfileForm() {
  const [form] = Form.useForm<UpdateProfileInput>();
  const { data: profile, isLoading } = useProfile();
  const { mutate, isPending } = useUpdateProfile();

  useEffect(() => {
    if (profile) form.setFieldsValue(profile);
  }, [profile, form]);

  if (isLoading) return <Spin />;

  return (
    <Form form={form} layout="vertical" onFinish={(values) => mutate(values)}>
      <Form.Item name="name" label="Name" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
        <Input />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={isPending}>Save</Button>
    </Form>
  );
}
```

---

## Example 3: Dashboard widget feature

**Request:** "Add a recent orders widget to the dashboard"

**Output structure:**

```
src/features/orders/
├── api/
│   └── useRecentOrders.ts
├── components/
│   └── RecentOrdersWidget/
│       ├── index.tsx
│       ├── RecentOrdersWidget.css.ts
│       └── types.ts
├── types.ts
└── index.ts
```

**Key pattern:** Small read-only feature; single list hook; widget imported into dashboard page.

```tsx
// pages/DashboardPage.tsx
import { RecentOrdersWidget } from '@/features/orders';

export function DashboardPage() {
  return (
    <Layout.Content>
      <Row gutter={16}>
        <Col span={12}><RecentOrdersWidget limit={5} /></Col>
      </Row>
    </Layout.Content>
  );
}
```
