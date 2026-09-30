# React Component — Few-shot Examples

```
shared/ui/confirm-button/
├── confirm-button.tsx
├── styles.ts
├── types.ts
├── index.ts
└── confirm-button.test.tsx
```

```ts
// styles.ts
import { cn } from '@/shared/lib/utils';

export const root = (className?: string) => cn('gap-2', className);
export const spinner = 'size-4 animate-spin';
```

```tsx
// confirm-button.tsx
import { Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import * as styles from './styles';
import type { ConfirmButtonProps } from './types';

export const ConfirmButton = ({
  className,
  pending = false,
  disabled,
  children,
  ...props
}: ConfirmButtonProps) => (
  <Button className={styles.root(className)} disabled={disabled || pending} {...props}>
    {pending && <Loader2 className={styles.spinner} aria-hidden="true" />}
    {children}
  </Button>
);
```

`index.ts` re-exports `ConfirmButton` and `ConfirmButtonProps`. No `export *`. No inline Tailwind strings. A feature component uses the same folder under `features/{name}/ui/{name}/`.
