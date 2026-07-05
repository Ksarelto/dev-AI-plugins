# vanilla-extract Styles — Few-shot Examples

## Example 1: Simple card component

**Request:** "Style the UserCard component"

**Files:**

```ts
// src/styles/tokens.css.ts
export const vars = createGlobalTheme(':root', {
  color: {
    surface: '#ffffff',
    textPrimary: '#141414',
    textSecondary: '#8c8c8c',
    border: '#f0f0f0',
  },
  space: { sm: '8px', md: '16px', lg: '24px' },
  radii: { md: '8px' },
  shadow: { sm: '0 1px 2px rgba(0,0,0,0.06)' },
});
```

```ts
// features/users/components/UserCard/UserCard.css.ts
import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/tokens.css';

export const card = style({
  padding: vars.space.md,
  backgroundColor: vars.color.surface,
  borderRadius: vars.radii.md,
  border: `1px solid ${vars.color.border}`,
  boxShadow: vars.shadow.sm,
});

export const name = style({
  fontSize: '16px',
  fontWeight: 600,
  color: vars.color.textPrimary,
});

export const email = style({
  fontSize: '14px',
  color: vars.color.textSecondary,
  marginTop: vars.space.sm,
});
```

```tsx
// features/users/components/UserCard/index.tsx
import * as styles from './UserCard.css';

export function UserCard({ user }: UserCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.name}>{user.name}</div>
      <div className={styles.email}>{user.email}</div>
    </div>
  );
}
```

---

## Example 2: Button with recipe variants

**Request:** "Create a StatusBadge with success, warning, and error variants"

**Files:**

```ts
// components/StatusBadge/StatusBadge.css.ts
import { recipe } from '@vanilla-extract/recipes';
import { vars } from '@/styles/tokens.css';

export const badge = recipe({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: `2px ${vars.space.sm}`,
    borderRadius: vars.radii.sm,
    fontSize: '12px',
    fontWeight: 500,
    lineHeight: '20px',
  },
  variants: {
    status: {
      success: { backgroundColor: '#f6ffed', color: '#389e0d' },
      warning: { backgroundColor: '#fffbe6', color: '#d48806' },
      error: { backgroundColor: '#fff2f0', color: '#cf1322' },
    },
  },
  defaultVariants: { status: 'success' },
});
```

```tsx
// components/StatusBadge/index.tsx
import * as styles from './StatusBadge.css';

interface StatusBadgeProps {
  status: 'success' | 'warning' | 'error';
  children: ReactNode;
}

export function StatusBadge({ status, children }: StatusBadgeProps) {
  return <span className={styles.badge({ status })}>{children}</span>;
}
```

---

## Example 3: antd wrapper with custom styles

**Request:** "Style the primary action button with a minimum width"

**Files:**

```ts
// components/PrimaryButton/PrimaryButton.css.ts
import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/tokens.css';

export const button = style({
  minWidth: '120px',
  fontWeight: 600,
});
```

```tsx
// components/PrimaryButton/index.tsx
import { Button } from 'antd';
import type { ComponentProps } from 'react';
import * as styles from './PrimaryButton.css';

type PrimaryButtonProps = ComponentProps<typeof Button>;

export function PrimaryButton({ className, ...props }: PrimaryButtonProps) {
  return (
    <Button
      type="primary"
      className={[styles.button, className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}
```

**Usage:** Drop-in replacement for `<Button type="primary">` with consistent sizing across the app.
