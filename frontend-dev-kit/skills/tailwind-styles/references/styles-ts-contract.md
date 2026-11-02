# `styles.ts` contract — worked pair

A component and its `styles.ts` that follow `rules/styling.mdc`: every class in `styles.ts`, the root export
takes the caller's `className` so layout can still be overridden, and JSX only references `styles.*`.

```ts
// features/orders/ui/order-card/styles.ts
import { cn } from '@/shared/lib/utils';

export const root = (className?: string): string => cn('flex items-center gap-3', className)
export const title = 'text-sm font-medium text-foreground';
export const amount = 'ms-auto text-sm font-semibold text-foreground';
```

```tsx
// features/orders/ui/order-card/order-card.tsx
import { Card } from '@/shared/ui/card';
import * as styles from './styles';

interface OrderCardProps {
  order: {
    reference: string;
    formattedTotal: string;
  };
  className?: string;
}

export const OrderCard = ({ order, className }: OrderCardProps): JSX.Element => (
  <Card className={styles.root(className)}>
    <p className={styles.title}>
      {order.reference}
    </p>
    <span className={styles.amount}>
      {order.formattedTotal}
    </span>
  </Card>
)
```

## Why motion stays in the bases

Motion utilities at a call site, or extra `@keyframes` / `--animate-*` in global CSS, fight the primitive's
own `data-state` animation. That is why a feature, widget, or page `styles.ts` carries none, and why
prototype effects are rebuilt as a `shared/ui` variant.
