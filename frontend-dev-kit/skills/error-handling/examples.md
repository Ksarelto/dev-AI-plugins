# Error Handling Examples

Import `isAppError` from `@/shared/api/errors`. Do not declare `ApiError` or call `useAuthStore`.

```ts
import { isAppError } from '@/shared/api/errors';

onError: (err) => {
  if (!isAppError(err) || err.kind !== 'validation') return;
  const data = err.data as Record<string, string[]>;
  for (const [field, messages] of Object.entries(data)) {
    form.setError(field as never, { message: messages[0] });
  }
},
```

A declined payment is a return value from `features/orders/models/validation.ts`. The form in `features/orders/ui/order-form/order-form.tsx` renders it. It is not thrown and not an error boundary.

Route boundaries and `FeatureLoadError` are in the skill. The client comes from `createQueryClient()`.
