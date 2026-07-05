# vanilla-extract — Few-shot Examples

## Example 1: Design tokens

### Bad

```ts
// UserCard.css.ts
import { style } from '@vanilla-extract/css';

export const card = style({
  padding: '16px',
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
});
```

Hardcoded values; inconsistent with the rest of the app.

### Good

```ts
// src/styles/tokens.css.ts
import { createGlobalTheme } from '@vanilla-extract/css';

export const vars = createGlobalTheme(':root', {
  color: {
    surface: '#ffffff',
    border: '#d9d9d9',
  },
  space: {
    md: '16px',
  },
  radii: {
    md: '8px',
  },
});

// UserCard.css.ts
import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/tokens.css';

export const card = style({
  padding: vars.space.md,
  backgroundColor: vars.color.surface,
  borderRadius: vars.radii.md,
  border: `1px solid ${vars.color.border}`,
});
```

Shared tokens; no magic values in component styles.

---

## Example 2: Recipe for variants

### Bad

```tsx
function Badge({ variant }: { variant: 'success' | 'error' }) {
  const color = variant === 'success' ? 'green' : 'red';
  return <span style={{ color, padding: 4 }}>{children}</span>;
}
```

Inline styles; variant logic in JSX.

### Good

```ts
// Badge.css.ts
import { recipe } from '@vanilla-extract/recipes';
import { vars } from '@/styles/tokens.css';

export const badge = recipe({
  base: {
    padding: `${vars.space.xs} ${vars.space.sm}`,
    borderRadius: vars.radii.sm,
    fontSize: vars.fontSize.sm,
  },
  variants: {
    intent: {
      success: { backgroundColor: vars.color.successBg, color: vars.color.successText },
      error: { backgroundColor: vars.color.errorBg, color: vars.color.errorText },
      neutral: { backgroundColor: vars.color.neutralBg, color: vars.color.neutralText },
    },
  },
  defaultVariants: { intent: 'neutral' },
});

// Badge/index.tsx
import * as styles from './Badge.css';

interface BadgeProps {
  intent?: 'success' | 'error' | 'neutral';
  children: ReactNode;
}

export function Badge({ intent, children }: BadgeProps) {
  return <span className={styles.badge({ intent })}>{children}</span>;
}
```

Recipe handles variants; component stays declarative.

---

## Example 3: Composing with antd className

### Bad

```tsx
<Button className="my-custom-button">Save</Button>

// global.css
.my-custom-button { background: red !important; }
```

Global CSS overriding antd internals with `!important`.

### Good

```ts
// SaveButton.css.ts
import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/tokens.css';

export const button = style({
  minWidth: '120px',
  fontWeight: vars.fontWeight.semibold,
});

// SaveButton/index.tsx
import { Button } from 'antd';
import * as styles from './SaveButton.css';

export function SaveButton(props: ComponentProps<typeof Button>) {
  return <Button type="primary" className={styles.button} {...props} />;
}
```

Wrapper component; vanilla-extract augments antd without fighting its styles.
