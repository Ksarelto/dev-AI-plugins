# Error Handling Examples

Import `isAppError` from `@/shared/api/errors`. Do not declare `ApiError` or call `useAuthStore`.

```ts
import { isAppError } from '@/shared/api/errors';

onError: (err) => {
  if (!isAppError(err) || err.kind !== 'validation') {
    return;
  }

  mapServerErrorsToForm(err.data, form.setError, form.getValues);
},
```

A declined payment is a return value from `features/orders/models/validation.ts`. The form in `features/orders/ui/order-form/order-form.tsx` renders it with a translated key. It is not thrown and not an error boundary.

## Feature without a boundary

```tsx
// Bad — a crash in the dialog blanks the whole page; the hook runs above any boundary
export const DeclineProfile = ({ profileId }: DeclineProfileProps): JSX.Element => {
  const { mutate } = useDeclineProfile();

  return <DeclineProfileDialog profileId={profileId} onDecline={mutate} />;
};

// Good — the public entry is the boundary; hooks live in the child
export const DeclineProfile = (props: DeclineProfileProps): JSX.Element => (
  <ErrorBoundary resetKeys={[props.profileId]}>
    <DeclineProfileDialog {...props} />
  </ErrorBoundary>
);
```

## Fallback copy

```tsx
// Bad — English literals, raw button, inline handler, developer text shown to the user
<div>
  <p>Something went wrong: {error.message}</p>
  <button onClick={() => resetErrorBoundary()}>Try again</button>
</div>

// Good — see ErrorFallback in the skill: Alert + Button, keys, named handler
<Button
  variant={ButtonVariant.Outline}
  onClick={handleRetry}
>
  {t(commonKeys.actions.retry)}
</Button>
```

Route boundaries and `FeatureLoadError` are in the skill. The client comes from `createQueryClient()`.
