---
name: error-handling
description: Implement AppError taxonomy, error boundaries (three kinds — FeatureLoadError, render crash, and expected business outcomes), and global/per-mutation error feedback using shared/lib/notify. Use when adding error handling to a new feature, setting up global error notification, or wrapping route sections with error boundaries.
---

# Error Handling

## When to use

- Setting up the error layer from scratch
- Adding error feedback to a mutation (form validation errors vs. toast notifications)
- Wrapping a route with an error boundary
- Handling 401 / 403 / 422 from the API

## Error taxonomy

Three kinds of failure — each has a different handling path:

| Kind | What it is | Handler |
|------|-----------|---------|
| Expected business outcome | Declined payment, stock gone, insufficient permission | A **return value** from a `models/` function. `ui/` renders it deliberately. Never let this reach a boundary. |
| Module-load failure | Stale chunk after deploy, broken module init | `FeatureLoadError` — classified at import site via `lazyFeature()`. Route boundary branches on the error type. |
| Render-time crash | Component threw while rendering | Normal crash screen. `react-error-boundary` catches it. Reported to logger. |

## `AppError` — the normalized HTTP error type

All HTTP errors are normalized to `AppError` in `shared/api/base.ts`. Feature code never sees raw `HTTPError` or native `Error` from ky.

```typescript
// shared/api/errors.ts
export enum AppErrorKind {
  Unauthorized = 'unauthorized',
  Forbidden    = 'forbidden',
  NotFound     = 'not_found',
  Validation   = 'validation',
  Server       = 'server',
  Network      = 'network',
  Unknown      = 'unknown',
}

export class AppError extends Error {
  constructor(
    public readonly kind: AppErrorKind,
    public readonly status: number,
    public readonly data: unknown,
  ) {
    super(`API error ${status} (${kind})`);
    this.name = 'AppError';
  }
}

export const isAppError = (err: unknown): err is AppError => err instanceof AppError;
```

## Error narrowing in mutation `onError`

```typescript
import { isAppError, AppErrorKind } from '@/shared/api/errors';
import { notify } from '@/shared/lib/notify';

onError: (err) => {
  if (!isAppError(err)) return;

  if (err.kind === AppErrorKind.Unauthorized) {
    // Session handling is owned by shared/lib/auth — the hook just signals
    // The auth provider's onExpired callback handles redirect
    return;
  }

  if (err.kind === AppErrorKind.Validation) {
    // Map server field errors to form — see rhf-form skill
    mapServerErrorsToForm(err.data, form.setError);
    return;
  }

  // Generic errors: all other kinds bubble to the global handler
  // Only add per-mutation notify here if the message must be specific
},
```

## Global QueryClient error handler

Set once in `app/providers/`. Generic errors fire a toast; validation (422) errors are intentionally excluded because per-mutation `onError` handles them at the form level.

```typescript
// app/providers/QueryProvider.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isAppError, AppErrorKind } from '@/shared/api/errors';
import { notify } from '@/shared/lib/notify';

const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      onError: (err) => {
        if (!isAppError(err)) return;
        if (err.kind === AppErrorKind.Validation) return; // handled per-mutation
        notify.error('Something went wrong. Please try again.');
      },
    },
  },
});

export const QueryProvider = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);
```

## Error boundary placement

Three levels — each catches a different scope:

```
app/boundaries/AppErrorBoundary     — root, catches everything, always present
route/page level                    — one broken page doesn't blank the app
feature root (ui/{Feature}Shell)    — feature's own loading/error/empty/stale states
```

### Route-level boundary with `FeatureLoadError` handling

```tsx
// pages/orders/OrdersPage.tsx  (the route component wraps the shell)
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { FeatureLoadError } from '@/shared/lib/lazyFeature';

const RouteFallback = ({ error, resetErrorBoundary }: FallbackProps) => {
  // Stale chunk after deploy — offer reload
  if (error instanceof FeatureLoadError && isChunkLoadError(error.cause)) {
    return (
      <div className={styles.container}>
        <p className={styles.message}>The page was updated. Please reload.</p>
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }

  // Broken module init or render crash
  return (
    <div className={styles.container}>
      <p className={styles.message}>Something went wrong.</p>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  );
};

export const OrdersPageBoundary = () => (
  <ErrorBoundary FallbackComponent={RouteFallback}>
    <Suspense fallback={<OrdersPageSkeleton />}>
      <OrdersPage />
    </Suspense>
  </ErrorBoundary>
);
```

### Root boundary in `app/`

```tsx
// app/boundaries/AppErrorBoundary.tsx
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import * as styles from './styles';

const RootFallback = ({ error, resetErrorBoundary }: FallbackProps) => (
  <div className={styles.root}>
    <h1 className={styles.title}>Unexpected error</h1>
    <p className={styles.detail}>{error.message}</p>
    <button onClick={resetErrorBoundary}>Try again</button>
  </div>
);

export const AppErrorBoundary = ({ children }: { children: ReactNode }) => (
  <ErrorBoundary FallbackComponent={RootFallback}>{children}</ErrorBoundary>
);
```

## `notify` — toast notifications

```typescript
// shared/lib/notify/index.ts
// Thin wrapper over sonner (or whichever toast library is in use)
export const notify = {
  success: (message: string) => toast.success(message),
  error:   (message: string) => toast.error(message),
  info:    (message: string) => toast(message),
};
```

## Form field errors (422 Validation)

```typescript
// features/orders/api/mapServerErrors.ts
import type { UseFormSetError } from 'react-hook-form';

export const mapServerErrorsToForm = (
  data: unknown,
  setError: UseFormSetError<Record<string, unknown>>,
): void => {
  if (!data || typeof data !== 'object') return;
  const errors = data as Record<string, string[]>;
  for (const [field, messages] of Object.entries(errors)) {
    setError(field as never, { type: 'server', message: messages[0] });
  }
};
```

## Expected business outcomes (NOT exceptions)

Decisions that are foreseeable (user does not have permission, stock is gone, quota exceeded) are return values from `models/` functions — never thrown. The `ui/` layer renders them deliberately:

```typescript
// features/orders/models/validation.ts
export type OrderError =
  | { type: 'insufficient_stock'; available: number }
  | { type: 'below_minimum'; minimum: number };

export const validateOrderDraft = (draft: OrderDraft): OrderError | null => {
  if (draft.quantity > draft.available) return { type: 'insufficient_stock', available: draft.available };
  if (draft.quantity < MINIMUM_ORDER_QTY)  return { type: 'below_minimum', minimum: MINIMUM_ORDER_QTY };
  return null;
};
```

```tsx
// features/orders/ui/OrderForm/OrderForm.tsx
const validationError = validateOrderDraft(draft);
if (validationError?.type === 'insufficient_stock') {
  return <p className={styles.errorText}>Only {validationError.available} units available.</p>;
}
```

## Checklist

- [ ] `AppError` (from `shared/api/errors.ts`) used for all HTTP error narrowing — not `ApiError`
- [ ] `isAppError(err)` guards all `onError` callbacks before type-narrowing `err.kind`
- [ ] Root error boundary in `app/boundaries/`
- [ ] Route-level error boundary handles `FeatureLoadError` (reload vs. crash screen)
- [ ] Global `QueryClient` `onError` handles generic errors; per-mutation `onError` handles Validation
- [ ] Validation errors (422) mapped to form fields via `setError`, not toasted
- [ ] Auth expiry (401) signalled to auth provider — not a manual redirect in mutation `onError`
- [ ] Expected business outcomes are return values from `models/` — never thrown, never caught by a boundary
- [ ] Toast messages use `notify` from `shared/lib/notify` — not direct `toast()` calls in feature code
- [ ] No `notification.error` (Ant Design), no `message.error` — they are not in this stack

See [examples.md](examples.md)
