---
name: tailwind-styles
description: "Style React components using styles.ts (mandatory for every component folder), cva() for variants, and semantic CSS custom property tokens. ALL Tailwind classes go in styles.ts — never inline in JSX, no exceptions. One light palette only — no dark theme, no dark: variants, no ThemeProvider."
---

# Tailwind Styles

## When to use

- Creating or editing any React component (styles.ts is always required)
- Defining variant-based UI (sizes, intents, states)
- Adding or extending design tokens (CSS custom properties)
- User mentions styling, CSS, or visual design

## Core rules (non-negotiable)

1. **`styles.ts` is mandatory for every component folder** — including one-liners. There is no "simple enough to skip" case. "I'll just inline it" is not valid.
2. **No Tailwind class strings inline in JSX** — ever. Not for padding, not for flex, not for a single color. Everything goes in `styles.ts`.
3. **Semantic token names only** — use `text-foreground`, `bg-card`, `border-border`. Do not use `text-slate-900`, raw hex values, or hardcoded Tailwind palette classes.
4. **One light palette only** — no `.dark` class, no `dark:` variants, no `ThemeProvider`, no `useTheme`. This project has a single theme.
5. **No CSS Modules, no styled-components, no `style={{}}`** — Tailwind + `styles.ts` is the only system.
6. **No `!important`** — always a sign of broken specificity.

## Three patterns in `styles.ts`

### 1. Static classes

```ts
// features/orders/ui/OrderCard/styles.ts
export const root    = 'flex items-center gap-3 rounded-lg border border-border bg-card p-4';
export const title   = 'text-sm font-medium text-foreground';
export const subtitle = 'text-xs text-muted-foreground';
export const amount  = 'ml-auto text-sm font-semibold text-foreground';
```

```tsx
// features/orders/ui/OrderCard/OrderCard.tsx
import * as styles from './styles';

export const OrderCard = ({ order, className }: OrderCardProps) => (
  <div className={cn(styles.root, className)}>
    <p className={styles.title}>{order.id}</p>
    <span className={styles.amount}>{order.totalAmount}</span>
  </div>
);
```

### 2. Variants with `cva()`

```ts
// shared/ui/Badge/styles.ts
import { cva, type VariantProps } from 'class-variance-authority';

export const badge = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      intent: {
        default: 'bg-secondary text-secondary-foreground',
        success: 'bg-success/10 text-success',
        warning: 'bg-warning/10 text-warning',
        error:   'bg-destructive/10 text-destructive',
      },
    },
    defaultVariants: { intent: 'default' },
  },
);

export type BadgeVariants = VariantProps<typeof badge>;
```

```tsx
// shared/ui/Badge/Badge.tsx
import { badge, type BadgeVariants } from './styles';

interface BadgeProps extends BadgeVariants {
  children: ReactNode;
  className?: string;
}

export const Badge = ({ intent, children, className }: BadgeProps) => (
  <span className={cn(badge({ intent }), className)}>{children}</span>
);
```

### 3. Conditional classes (function export)

```ts
// features/orders/ui/OrderRow/styles.ts
export const row = (isSelected: boolean) =>
  cn(
    'flex items-center gap-3 border-b border-border px-4 py-3 transition-colors',
    isSelected && 'bg-accent',
  );
```

```tsx
// features/orders/ui/OrderRow/OrderRow.tsx
import { row } from './styles';

export const OrderRow = ({ order, isSelected }: OrderRowProps) => (
  <div className={row(isSelected)}>
    {/* ... */}
  </div>
);
```

## `cn()` helper

Always use `cn()` from `@/shared/lib/utils` when merging caller `className` overrides with internal classes:

```ts
import { cn } from '@/shared/lib/utils';

export const root = (className?: string) => cn('flex items-center gap-2', className);
```

## Semantic tokens (CSS custom properties)

Reference tokens defined in `shared/ui/theme/globals.css`. Common ones:

| Token | Use for |
|-------|---------|
| `text-foreground` | Primary text |
| `text-muted-foreground` | Secondary/helper text |
| `bg-background` | Page background |
| `bg-card` | Card surfaces |
| `border-border` | All borders |
| `bg-primary`, `text-primary-foreground` | Brand actions |
| `bg-destructive`, `text-destructive` | Error/danger states |
| `bg-muted` | Disabled/inactive surfaces |

Never hardcode: `text-gray-700`, `#1a1a1a`, `text-slate-900`.

## `shared/ui/theme/` layout

| File | Purpose |
|------|---------|
| `globals.css` | CSS custom properties, `@layer base` resets, `@layer components` escape hatch for third-party overrides only |
| `styles.ts` | Reusable class fragments promoted after the **third real duplicate** |

## Checklist

- [ ] `styles.ts` file exists in the component folder — even for a one-liner
- [ ] Zero Tailwind class strings inline in JSX
- [ ] Semantic token names only — no raw palette colors, no hex values
- [ ] `cva()` used for any variant/state table — not ad-hoc `isX ? 'class-a' : 'class-b'` inline in JSX
- [ ] `cn()` merges caller `className` last so the caller can override
- [ ] No `dark:` variants, no `.dark` class, no `ThemeProvider`
- [ ] No `style={{}}`, no CSS Modules, no `!important`

See [examples.md](examples.md) for few-shot templates.
