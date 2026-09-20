# React Component — Few-shot Examples

## Example 1: Generic shared wrapper over a shadcn primitive

**Request:** "Add a reusable confirm button that shows a spinner while pending"

Generic, no business meaning → `src/shared/ui/confirm-button/`.

```
src/shared/ui/confirm-button/
├── confirm-button.tsx
├── index.ts
└── types.ts
```

```ts
// types.ts
import type { ComponentProps } from 'react';
import type { Button } from '@/components/ui/button';

export interface ConfirmButtonProps extends ComponentProps<typeof Button> {
  className?: string;
  pending?: boolean;
}
```

```tsx
// confirm-button.tsx
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ConfirmButtonProps } from './types';

export const ConfirmButton = ({
  className,
  pending = false,
  disabled,
  children,
  ...props
}: ConfirmButtonProps): JSX.Element => {
  return (
    <Button
      className={cn('gap-2', className)}
      disabled={disabled || pending}
      {...props}
    >
      {pending && (
        <Loader2
          className="size-4 animate-spin"
          aria-hidden="true"
        />
      )}
      {children}
    </Button>
  );
};
```

Wraps a shadcn primitive because the spinner-on-pending arrangement repeats — a single preset prop
would not have earned a wrapper (`shadcn-usage` rule).

---

## Example 2: Feature-specific presentational component

**Request:** "Add a badge that shows an order's status with the right color"

Business-specific (order status is domain vocabulary) → `src/features/orders/ui/order-status-badge/`.

```
src/features/orders/ui/order-status-badge/
├── order-status-badge.tsx
├── index.ts
└── types.ts
```

```ts
// types.ts
import type { OrderStatus } from '../../types';

export interface OrderStatusBadgeProps {
  className?: string;
  status: OrderStatus;
}
```

```tsx
// order-status-badge.tsx
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { OrderStatusBadgeProps } from './types';

const STATUS_LABEL: Record<OrderStatusBadgeProps['status'], string> = {
  pending: 'Pending',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const STATUS_VARIANT: Record<OrderStatusBadgeProps['status'], 'default' | 'secondary' | 'destructive'> = {
  pending: 'secondary',
  shipped: 'default',
  delivered: 'default',
  cancelled: 'destructive',
};

export const OrderStatusBadge = ({ className, status }: OrderStatusBadgeProps): JSX.Element => {
  return (
    <Badge
      className={cn(className)}
      variant={STATUS_VARIANT[status]}
    >
      {STATUS_LABEL[status]}
    </Badge>
  );
};
```

Takes a domain type (`OrderStatus`) as a prop — this is why it lives inside the feature, not in
`shared/ui/`, even though it renders a generic `Badge` underneath.

---

## Example 3: Component with variants (cva) and forwarded ref-as-prop

**Request:** "Add a shared `SectionHeading` component with `sm` / `md` / `lg` sizes"

Generic layout primitive → `src/shared/ui/SectionHeading/`.

```
src/shared/ui/SectionHeading/
├── index.tsx
└── types.ts
```

```ts
// types.ts
import type { ComponentProps } from 'react';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

export const sectionHeadingVariants = cva('font-semibold tracking-tight', {
  variants: {
    size: {
      sm: 'text-lg',
      md: 'text-xl',
      lg: 'text-2xl',
    },
  },
  defaultVariants: { size: 'md' },
});

export interface SectionHeadingProps
  extends ComponentProps<'h2'>,
    VariantProps<typeof sectionHeadingVariants> {}
```

```tsx
// index.tsx
import { cn } from '@/lib/utils';
import { sectionHeadingVariants, type SectionHeadingProps } from './types';

export const SectionHeading = ({ className, size, ref, ...props }: SectionHeadingProps): JSX.Element => {
  return (
    <h2
      ref={ref}
      className={cn(sectionHeadingVariants({ size }), className)}
      {...props}
    />
  );
};
```

`ref` is destructured like any other prop — React 19 forwards it without `forwardRef`.

---

## Example 4: Compound-ish component using `children` for composition

**Request:** "Add a shared `EmptyState` component with an icon, title, and optional action slot"

```
src/shared/ui/EmptyState/
├── index.tsx
└── types.ts
```

```ts
// types.ts
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  className?: string;
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}
```

```tsx
// index.tsx
import { cn } from '@/lib/utils';
import type { EmptyStateProps } from './types';

export const EmptyState = ({ className, icon, title, description, action }: EmptyStateProps): JSX.Element => {
  return (
    <div className={cn('flex flex-col items-center gap-2 py-12 text-center', className)}>
      <div
        className="text-muted-foreground"
        aria-hidden="true"
      >
        {icon}
      </div>
      <p className="font-medium">
        {title}
      </p>
      {description && (
        <p className="text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action}
    </div>
  );
};
```

Takes `action` as a `ReactNode` slot rather than an `onAction` callback plus label props — composition
over a growing prop API, per the `react` rule's state-ownership guidance.
