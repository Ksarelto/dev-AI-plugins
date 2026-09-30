---
name: error-handling
description: Implement AppError taxonomy, error boundaries (three kinds — FeatureLoadError, render crash, and expected business outcomes), and global/per-mutation error feedback using shared/lib/notify. Use when adding error handling to a new feature, setting up global error notification, or wrapping every route/page and every feature with an error boundary so one crash never takes down the app.
---

# Error Handling

## When to use

- Setting up the error layer from scratch
- Adding error feedback to a mutation (form validation errors vs. toast notifications)
- Wrapping a new route/page or a new feature's entry component with the shared error boundary
- Handling 401 / 403 / 422 from the API

## Error taxonomy

Three kinds of failure — each has a different handling path:

| Kind | What it is | Handler |
|------|-----------|---------|
| Expected business outcome | Declined payment, stock gone, insufficient permission | A **return value** from a `models/` function. `ui/` renders it deliberately. Never let this reach a boundary. |
| Module-load failure | Stale chunk after deploy, broken module init | `FeatureLoadError` — classified at import site via `lazyFeature()`. Route boundary branches on the error type. |
| Render-time crash | Component threw while rendering | Normal crash screen. `react-error-boundary` catches it. Reported to logger. |

## `AppError` — the normalized HTTP error type

All HTTP errors are normalized to `AppError` in `shared/api/base.ts` via `toAppError`. Import `isAppError` from `@/shared/api/errors`. Do not declare a second class or an `AppErrorKind` enum.

`kind` is the string union from `api-client`: `'network' | 'validation' | 'unauthorized' | 'forbidden' | 'not-found' | 'server' | 'unknown'`. Field errors for `'validation'` are `err.data`.

## Error narrowing in mutation `onError`

```typescript
import { isAppError } from '@/shared/api/errors';
import { mapServerErrorsToForm } from '@/shared/lib/form';

onError: (err) => {
  if (!isAppError(err) || err.kind !== 'validation') {
    return;
  }

  mapServerErrorsToForm(err.data, form.setError, form.getValues);
},
```

`'unauthorized'` is owned by `shared/lib/auth`; every other kind goes to the global handler. Add a per-mutation `notify` only when the message must be specific, and pass it a key (`notify.error(t(ordersKeys.errors.stockGone))`).

## Global QueryClient error handler

`createQueryClient()` in `shared/api/query-client.ts` (see `api-client`) already toasts non-validation mutation errors and retries only network-kind `AppError`. The provider calls that factory and **replaces** the client when `sessionKey` changes. Do not construct a module-level `QueryClient` or call `clear()` on logout.

## Error boundary placement

A render crash must never take down more than the surface that crashed. Four levels, all required:

```
app/boundaries/app-error-boundary     — root, catches everything, always present
app/router  <RouteBoundary>           — EVERY route element: one broken page never blanks the app
features/<f> public entry component   — EVERY feature: one broken interaction never blanks the page
entity/feature UI shell               — its own loading / error / empty states (not a boundary)
```

A widget that composes several features relies on each feature's own boundary. A page does not add a second boundary inside itself — the route boundary already wraps it.

### One shared boundary: `shared/ui/error-boundary/`

Build it once. Every route and feature uses it; nobody imports `react-error-boundary` directly.

```
shared/ui/error-boundary/
  error-boundary.tsx      — ErrorBoundary (library boundary + shared fallback + logging)
  error-fallback.tsx      — ErrorFallback (shadcn Alert + retry Button, translated)
  styles.ts
  types.ts
  error-boundary.test.tsx
  index.ts                — exports ErrorBoundary, and ErrorFallback for the route fallback
```

```tsx
// shared/ui/error-boundary/error-fallback.tsx
import { useTranslation } from 'react-i18next';
import type { FallbackProps } from 'react-error-boundary';
import { commonKeys } from '@/shared/lib/i18n/locales/common/keys';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  AlertVariant,
} from '@/shared/ui/alert';
import { Button, ButtonVariant } from '@/shared/ui/button';
import * as styles from './styles';

export const ErrorFallback = ({ resetErrorBoundary }: FallbackProps): JSX.Element => {
  const { t } = useTranslation();

  const handleRetry = (): void => {
    resetErrorBoundary();
  };

  return (
    <Alert
      variant={AlertVariant.Destructive}
      className={styles.root}
    >
      <AlertTitle>
        {t(commonKeys.errorBoundary.title)}
      </AlertTitle>
      <AlertDescription>
        {t(commonKeys.errorBoundary.description)}
      </AlertDescription>
      <Button
        variant={ButtonVariant.Outline}
        className={styles.retry}
        onClick={handleRetry}
      >
        {t(commonKeys.actions.retry)}
      </Button>
    </Alert>
  );
};
```

```tsx
// shared/ui/error-boundary/error-boundary.tsx
import type { ErrorInfo } from 'react';
import { ErrorBoundary as LibraryErrorBoundary } from 'react-error-boundary';
import { ErrorFallback } from './error-fallback';
import type { ErrorBoundaryProps } from './types';

const logRenderError = (error: unknown, info: ErrorInfo): void => {
  console.error(error, info.componentStack);
};

export const ErrorBoundary = ({ children, resetKeys }: ErrorBoundaryProps): JSX.Element => (
  <LibraryErrorBoundary
    FallbackComponent={ErrorFallback}
    resetKeys={resetKeys}
    onError={logRenderError}
  >
    {children}
  </LibraryErrorBoundary>
);
```

The fallback never renders `error.message` — it is developer text, untranslated, and may leak internals. In `react-error-boundary` v6 `FallbackProps.error` is `unknown`; do not cast it to read `.message`.

### Every feature: the public entry is the boundary

The component `features/<f>/index.ts` exports wraps the feature's content. Hooks and state live in the content component, below the boundary — a hook that throws above the boundary is not caught.

```tsx
// features/decline-profile/ui/decline-profile/decline-profile.tsx
import { ErrorBoundary } from '@/shared/ui/error-boundary';
import { DeclineProfileDialog } from '../decline-profile-dialog';
import type { DeclineProfileProps } from './types';

export const DeclineProfile = (props: DeclineProfileProps): JSX.Element => (
  <ErrorBoundary resetKeys={[props.profileId]}>
    <DeclineProfileDialog {...props} />
  </ErrorBoundary>
);
```

### Every route: `RouteBoundary` with `FeatureLoadError` handling

`add-route` wraps each lazy page element. The route fallback distinguishes a stale chunk (offer reload) from a crash (shared fallback), and resets when the path changes.

```tsx
// app/router/route-boundary/route-boundary.tsx
import { Suspense } from 'react';
import { useLocation } from 'react-router';
import { ErrorBoundary } from '@/shared/ui/error-boundary';
import type { RouteBoundaryProps } from './types';

export const RouteBoundary = ({ children, fallback }: RouteBoundaryProps): JSX.Element => {
  const location = useLocation();

  return (
    <ErrorBoundary resetKeys={[location.pathname]}>
      <Suspense fallback={fallback}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
};
```

```tsx
// app/router/root/routes.tsx
{
  path: routes.orders,
  element: (
    <RouteBoundary fallback={<PageSkeleton />}>
      <OrdersPage />
    </RouteBoundary>
  ),
}
```

A stale-chunk `FeatureLoadError` (after a deploy) renders a reload prompt instead of the generic fallback: give `ErrorBoundary` an optional `fallbackComponent` prop, and have `RouteBoundary` pass a `RouteFallback` that checks `error instanceof FeatureLoadError && isChunkLoadError(error.cause)` and offers `t(commonKeys.errorBoundary.reload)`. Its reload handler is a named function (`handleReload`), and every string is a key.

### Root boundary in `app/`

`app/boundaries/app-error-boundary/` renders the same `ErrorBoundary` around the provider tree's children, so a crash in layout or providers still shows the translated fallback.

## `notify` — toast notifications

A thin wrapper over sonner (or whichever toast library is in use). Callers always pass translated text: `notify.success(t(ordersKeys.create.success))`, never a literal.

```typescript
// shared/lib/notify/index.ts
export const notify = {
  success: (message: string) => toast.success(message),
  error:   (message: string) => toast.error(message),
  info:    (message: string) => toast(message),
};
```

## Form field errors (422 Validation)

`mapServerErrorsToForm` lives once in `shared/lib/form/map-server-errors.ts`. It narrows the server's field names to the form's `Path` with type guards, with no `as` cast. The implementation is in `rhf-form` examples § Example 4. Server field messages are human text and render unchanged. Not toasted.

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
// features/orders/ui/order-form/order-form.tsx
const validationError = validateOrderDraft(draft);

if (validationError?.type === 'insufficient_stock') {
  return (
    <p className={styles.errorText}>
      {t(ordersKeys.errors.insufficientStock, { count: validationError.available })}
    </p>
  );
}
```

## Checklist

- [ ] `AppError` (from `shared/api/errors.ts`) used for all HTTP error narrowing — not `ApiError`
- [ ] `isAppError(err)` guards all `onError` callbacks before comparing `err.kind` to a string (`'validation'`, `'unauthorized'`) — not an enum
- [ ] One shared `ErrorBoundary` in `shared/ui/error-boundary/`; no direct `react-error-boundary` import elsewhere
- [ ] Root error boundary in `app/boundaries/`
- [ ] Every route element wrapped in `RouteBoundary` (ErrorBoundary + Suspense, `resetKeys` on the path); stale-chunk `FeatureLoadError` offers reload
- [ ] Every feature's public entry component renders `<ErrorBoundary>` around its content; hooks live below the boundary
- [ ] Fallbacks use shadcn `Alert` + `Button`, translated keys, a named retry handler — never `error.message`, never a raw `<button>`
- [ ] Global `QueryClient` `onError` handles generic errors; per-mutation `onError` handles Validation
- [ ] Validation errors (422) mapped to form fields via `setError`, not toasted
- [ ] Auth expiry (401) signalled to auth provider — not a manual redirect in mutation `onError`
- [ ] Expected business outcomes are return values from `models/` — never thrown, never caught by a boundary
- [ ] Toast messages use `notify` from `shared/lib/notify` — not direct `toast()` calls in feature code
- [ ] No `notification.error` (Ant Design), no `message.error` — they are not in this stack

See [examples.md](examples.md)
