# Tailwind Styles — Few-shot Examples

## Example 1: Simple card component

**Request:** "Style the UserCard component"

```tsx
// features/users/components/UserCard/index.tsx
import { cn } from '@/lib/utils';

interface UserCardProps {
  user: User;
  className?: string;
}

export const UserCard = ({ user, className }: UserCardProps): JSX.Element => {
  return (
    <div className={cn('rounded-lg border bg-card p-4 shadow-sm', className)}>
      <p className="text-base font-semibold text-foreground">{user.name}</p>
      <p className="mt-2 text-sm text-muted-foreground">{user.email}</p>
    </div>
  );
};
```

---

## Example 2: StatusBadge with cva variants

**Request:** "Create a StatusBadge with success, warning, and error variants"

```tsx
// shared/ui/StatusBadge/index.tsx
import { type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      status: {
        success: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400',
        warning: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400',
        error: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
      },
    },
    defaultVariants: { status: 'success' },
  },
);

interface StatusBadgeProps extends VariantProps<typeof badgeVariants> {
  children: ReactNode;
  className?: string;
}

export const StatusBadge = ({ status, children, className }: StatusBadgeProps): JSX.Element => {
  return <span className={cn(badgeVariants({ status }), className)}>{children}</span>;
};
```

---

## Example 3: shadcn Button wrapper with custom styles

**Request:** "Style the primary action button with a minimum width"

```tsx
// shared/ui/PrimaryButton/index.tsx
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const PrimaryButton = ({ className, ...props }: ButtonProps): JSX.Element => {
  return (
    <Button
      className={cn('min-w-[120px] font-semibold', className)}
      {...props}
    />
  );
};
```

**Usage:** Drop-in replacement for `<Button>` with consistent sizing across the app.
