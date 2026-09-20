# Routing Examples

## Example 1 — Full router setup

```typescript
// src/routes.tsx
import { createBrowserRouter } from 'react-router';
import { lazy, Suspense } from 'react';
import { RootLayout } from './layouts/RootLayout';
import { AuthLayout } from './layouts/AuthLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PageSpinner } from './components/PageSpinner';
import { ErrorBoundary } from './components/ErrorBoundary';

const DashboardPage = lazy(() => import('./features/dashboard/pages/DashboardPage'));
const UsersPage     = lazy(() => import('./features/users/pages/UsersPage'));
const UserDetail    = lazy(() => import('./features/users/pages/UserDetail'));
const LoginPage     = lazy(() => import('./features/auth/pages/LoginPage'));

const wrap = (el: ReactElement) => (
  <ErrorBoundary>
    <Suspense fallback={<PageSpinner />}>
      {el}
    </Suspense>
  </ErrorBoundary>
);

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        element: <ProtectedRoute />,
        children: [
          { index: true,        element: wrap(<DashboardPage />) },
          { path: 'users',      element: wrap(<UsersPage />) },
          { path: 'users/:id',  element: wrap(<UserDetail />) },
        ],
      },
    ],
  },
  {
    path: '/',
    element: <AuthLayout />,
    children: [
      { path: 'login', element: wrap(<LoginPage />) },
    ],
  },
]);

// src/main.tsx
import { RouterProvider } from 'react-router';
root.render(<RouterProvider router={router} />);
```

---

## Example 2 — Typed params and navigation in a detail page

```typescript
// features/users/pages/UserDetail.tsx
import { useParams, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { useUser } from '../api/useUser';
import { useDeleteUser } from '../api/useDeleteUser';

const UserDetail = (): JSX.Element | null => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: user, isLoading } = useUser(id ?? '');
  const { mutate: deleteUser, isPending } = useDeleteUser();

  const handleDelete = (): void => {
    if (!id) return;

    deleteUser(id, {
      onSuccess: () => navigate('/users', { replace: true }),
    });
  };

  if (isLoading) return <PageSpinner />;
  if (!user) return null;

  return (
    <>
      <h1>
        {user.name}
      </h1>
      <Button
        variant="destructive"
        disabled={isPending}
        onClick={handleDelete}
      >
        Delete
      </Button>
    </>
  );
};

export default UserDetail;
```

---

## Example 3 — Protected route with role check

```typescript
// src/components/ProtectedRoute.tsx
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuthStore } from '../stores/authStore';

interface Props {
  requiredRole?: 'admin' | 'member';
}

export const ProtectedRoute = ({ requiredRole }: Props): JSX.Element => {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        state={{ from: location }}
        replace
      />
    );
  }

  if (requiredRole && user?.role !== requiredRole) {
    return (
      <Navigate
        to="/"
        replace
      />
    );
  }

  return <Outlet />;
};

// Usage in routes
{ element: <ProtectedRoute requiredRole="admin" />, children: [...adminRoutes] }
```

---

## Example 4 — Search params for filters

```typescript
// features/users/pages/UsersPage.tsx
import { useSearchParams } from 'react-router';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const UsersPage = (): JSX.Element => {
  const [searchParams, setSearchParams] = useSearchParams();
  const role   = searchParams.get('role') ?? '';
  const search = searchParams.get('q') ?? '';

  const { data } = useUsers({ role: role || undefined, search: search || undefined });

  const handleRoleChange = (value: string): void => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) {
        next.set('role', value);
      } else {
        next.delete('role');
      }

      return next;
    });
  };

  return (
    <>
      <Select
        value={role}
        onValueChange={handleRoleChange}
      >
        <SelectTrigger>
          <SelectValue placeholder="All roles" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="admin">
            Admin
          </SelectItem>
          <SelectItem value="member">
            Member
          </SelectItem>
        </SelectContent>
      </Select>
      <Input
        value={search}
        onChange={(e) => setSearchParams({ q: e.target.value })}
      />
      <UserTable data={data} />
    </>
  );
};

export default UsersPage;
```

**Rule:** Derive filter state from `searchParams`, not `useState`. The URL is the source of truth — filters become shareable and survive refresh.

---

## Example 5 — React Router data loader

```typescript
// Attach loader to the route in routes.tsx
import { userQueryOptions } from './features/users/api/userQueryOptions';

{
  path: 'users/:id',
  loader: ({ params }) => {
    if (!params.id) throw new Error('users/:id route requires an id param');

    return queryClient.ensureQueryData(userQueryOptions(params.id));
  },
  element: wrap(<UserDetail />),
  errorElement: <RouteErrorBoundary />,
}

// features/users/pages/UserDetail.tsx
// Data is already in cache — no isLoading branch needed
import { useLoaderData } from 'react-router';

const UserDetail = (): JSX.Element => {
  const user = useLoaderData() as User;

  return <UserProfile user={user} />;
};

export default UserDetail;
```

**When to use:** For data the page cannot render without. For secondary or conditional data, keep `useQuery` in the component — see [references/data-api.md](references/data-api.md) for full loader + action patterns.

---

## Example 6 — Modal as a parallel child route

```typescript
// routes.tsx — modal is a child of the list route
{
  path: 'users',
  element: wrap(<UsersPage />),
  children: [
    { path: 'create', element: <CreateUserModal /> },
  ],
}

// UsersPage.tsx
import { Outlet, Link } from 'react-router';
import { Button } from '@/components/ui/button';

const UsersPage = (): JSX.Element => {
  return (
    <>
      <Button asChild>
        <Link to="create">
          New User
        </Link>
      </Button>
      <UserTable />
      <Outlet />  {/* renders CreateUserModal at /users/create */}
    </>
  );
};

export default UsersPage;

// CreateUserModal.tsx — navigate(-1) closes without a hardcoded back-path
export const CreateUserModal = (): JSX.Element => {
  const navigate = useNavigate();

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && navigate(-1)}
    >
      <DialogContent>{/* form */}</DialogContent>
    </Dialog>
  );
};
```
