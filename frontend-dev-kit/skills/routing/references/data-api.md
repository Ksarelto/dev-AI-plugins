# React Router — Data API

React Router v7's data API lets you co-locate data loading and form submission with the route definition. Use the data API for data that a page cannot render without; keep `useQuery` for secondary or conditional fetches.

## Loaders

A loader runs before the route renders. Use `queryClient.ensureQueryData` so the React Query cache is populated and the component's `useQuery` resolves synchronously.

```typescript
// features/users/api/userQueryOptions.ts
const DETAIL_STALE_TIME_MS = 60_000;

export const userQueryOptions = (id: string) =>
  queryOptions({
    queryKey: queryKeys.users.detail(id),
    queryFn: () => fetchUser(id),
    staleTime: DETAIL_STALE_TIME_MS,
  });

// src/routes.tsx
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

// features/users/pages/UserDetail.tsx — no isLoading branch needed
import { useLoaderData } from 'react-router';

const UserDetail = (): JSX.Element => {
  const user = useLoaderData() as User;

  return <UserProfile user={user} />;
};

export default UserDetail;
```

## Actions

Route actions handle form `POST` submissions. Return a redirect on success or a plain object on error.

```typescript
// features/users/pages/CreateUserPage.action.ts
import { redirect } from 'react-router';

export const createUserAction = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const payload = Object.fromEntries(formData) as CreateUserInput;

  try {
    const user = await createUser(payload);
    queryClient.invalidateQueries({ queryKey: queryKeys.users.all });

    return redirect(`/users/${user.id}`);
  } catch (error) {
    return { error: (error as ApiError).message };
  }
};

// Route definition
{ path: 'users/create', action: createUserAction, element: wrap(<CreateUserPage />) }

// CreateUserPage.tsx
import { Form, useActionData, useNavigation } from 'react-router';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const CreateUserPage = (): JSX.Element => {
  const actionData = useActionData() as { error?: string };
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';

  return (
    <Form method="post">
      <Input name="name" />
      {actionData?.error && (
        <p className="text-sm text-destructive">
          {actionData.error}
        </p>
      )}
      <Button
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Creating…' : 'Create'}
      </Button>
    </Form>
  );
};

export default CreateUserPage;
```

## Route error boundary

Catches loader errors, action errors, and thrown responses.

```typescript
// src/components/RouteErrorBoundary.tsx
import { useRouteError, isRouteErrorResponse, Link } from 'react-router';
import { Button } from '@/components/ui/button';

const INTERNAL_SERVER_ERROR_STATUS = 500;
const NOT_FOUND_STATUS = 404;

export const RouteErrorBoundary = (): JSX.Element => {
  const error = useRouteError();
  const status = isRouteErrorResponse(error) ? error.status : INTERNAL_SERVER_ERROR_STATUS;

  return (
    <div className="flex flex-col items-center gap-4 p-8 text-center">
      <p className="text-2xl font-bold">
        {status}
      </p>
      <p className="text-muted-foreground">
        {status === NOT_FOUND_STATUS ? 'Page not found' : 'Something went wrong'}
      </p>
      <Button asChild>
        <Link to="/">
          Go home
        </Link>
      </Button>
    </div>
  );
};

// Attach to routes in routes.tsx
{
  path: 'users/:id',
  loader: userLoader,
  element: wrap(<UserDetail />),
  errorElement: <RouteErrorBoundary />,
}
```

## When to use loader vs useQuery

| Scenario | Use |
|----------|-----|
| Data required to render the page | `loader` + `ensureQueryData` |
| Secondary or optional data | `useQuery` in component |
| Data dependent on user interaction | `useQuery` with `enabled` |
| Prefetch on hover/focus | `queryClient.prefetchQuery` |
