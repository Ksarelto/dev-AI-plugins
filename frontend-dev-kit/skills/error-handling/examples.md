# Error Handling Examples

## Example 1 — Global QueryClient error setup

```typescript
// src/main.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from './api/client';
import { useAuthStore } from './stores/authStore';

const SERVER_ERROR_STATUS = 500;
const UNAUTHORIZED_STATUS = 401;
const UNPROCESSABLE_ENTITY_STATUS = 422;
const MAX_RETRY_COUNT = 2;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status < SERVER_ERROR_STATUS) return false;

        return failureCount < MAX_RETRY_COUNT;
      },
    },
    mutations: {
      onError: (err) => {
        if (!(err instanceof ApiError)) {
          toast.error('Unexpected error', { description: String(err) });
          return;
        }
        if (err.status === UNAUTHORIZED_STATUS) {
          useAuthStore.getState().logout();
          return;
        }
        if (err.status !== UNPROCESSABLE_ENTITY_STATUS) {
          toast.error('Request failed', { description: err.message });
        }
        // 422 is handled per-mutation via form.setError()
      },
    },
  },
});
```

---

## Example 2 — Per-mutation 422 handling with form field errors

```typescript
// features/users/ui/EditUserForm/index.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ApiError } from '@/api/client';

const UNPROCESSABLE_ENTITY_STATUS = 422;

const EditUserForm = ({ userId }: { userId: string }): JSX.Element => {
  const form = useForm<UpdateUserInput>({ resolver: zodResolver(updateUserSchema) });
  const { mutate, isPending } = useUpdateUser();

  const onSubmit = (values: UpdateUserInput) => {
    mutate(
      { id: userId, ...values },
      {
        onError: (err) => {
          if (err instanceof ApiError && err.status === UNPROCESSABLE_ENTITY_STATUS) {
            const data = err.data as Record<string, string[]>;
            Object.entries(data).forEach(([field, messages]) => {
              form.setError(field as keyof UpdateUserInput, {
                type: 'server',
                message: messages[0],
              });
            });
          }
          // global onError handles everything else
        },
      },
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        {/* fields — <FormMessage /> renders per-field errors automatically */}
      </form>
    </Form>
  );
};
```

---

## Example 3 — Error boundary per route segment

```typescript
// src/components/ErrorBoundary.tsx
import { ErrorBoundary as REB, type FallbackProps } from 'react-error-boundary';
import { Button } from '@/components/ui/button';

const Fallback = ({ error, resetErrorBoundary }: FallbackProps) => {
  return (
    <div className="flex flex-col items-center gap-4 p-8 text-center">
      <p className="text-lg font-semibold text-destructive">
        Something went wrong
      </p>
      <p className="text-sm text-muted-foreground">
        {error?.message ?? 'An unexpected error occurred.'}
      </p>
      <Button onClick={resetErrorBoundary}>
        Try again
      </Button>
    </div>
  );
};

export const ErrorBoundary = ({ children }: { children: ReactNode }): JSX.Element => (
  <REB FallbackComponent={Fallback}>
    {children}
  </REB>
);

// In routes.tsx — wrap each lazy page
{ path: 'users', element: <ErrorBoundary><Suspense fallback={<PageSpinner />}><UsersPage /></Suspense></ErrorBoundary> }
```
