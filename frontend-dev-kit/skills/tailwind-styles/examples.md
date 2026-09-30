# Tailwind Styles — Few-shot Examples

Classes live in `styles.ts`. The folder and file are kebab-case. JSX does not contain Tailwind strings.

```ts
// features/users/ui/user-card/styles.ts
import { cn } from '@/shared/lib/utils';

export const root = (className?: string) =>
  cn('rounded-lg border border-border bg-card p-4', className);

export const title = 'text-base font-semibold text-foreground';
export const meta = 'mt-2 text-sm text-muted-foreground';
```

```tsx
// features/users/ui/user-card/user-card.tsx
import * as styles from './styles';
import type { UserCardProps } from './types';

export const UserCard = ({ user, className }: UserCardProps) => (
  <div className={styles.root(className)}>
    <p className={styles.title}>{user.name}</p>
    <p className={styles.meta}>{user.email}</p>
  </div>
);
```

Variants use `cva` in `styles.ts`. No `dark:` variants. No palette steps (`slate-800`). Tokens come from `shared/ui/theme/globals.css`.
