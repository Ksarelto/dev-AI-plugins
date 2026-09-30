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
// features/orders/ui/order-summary/styles.ts
export const root = 'flex items-center gap-3';
export const title = 'text-sm font-medium text-foreground';
export const subtitle = 'text-xs text-muted-foreground';
export const amount = 'ms-auto text-sm font-semibold text-foreground';
```

```tsx
// features/orders/ui/order-summary/order-summary.tsx
import { cn } from '@/shared/lib/utils';
import * as styles from './styles';

export const OrderSummary = ({ order, className }: OrderSummaryProps): JSX.Element => (
  <div className={cn(styles.root, className)}>
    <p className={styles.title}>
      {order.reference}
    </p>
    <span className={styles.amount}>
      {order.formattedTotal}
    </span>
  </div>
);
```

### 2. Variants with `cva()`

Variants on a registry primitive (`Badge`, `Button`) extend the base's own `cva` table in `shared/ui/<name>/styles.ts` and get a matching entry in its `constants.ts`. A feature component with its own states gets its own `cva`:

```ts
// shared/ui/badge/styles.ts — adding success/warning to the registry table
import { cva, type VariantProps } from 'class-variance-authority';

export const badgeVariants = cva(
  '…the registry base string, unchanged…',
  {
    variants: {
      variant: {
        default: '…registry…',
        secondary: '…registry…',
        destructive: '…registry…',
        outline: '…registry…',
        success: 'border-transparent bg-success/10 text-success',
        warning: 'border-transparent bg-warning/10 text-warning',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export type BadgeVariants = VariantProps<typeof badgeVariants>;
```

```ts
// shared/ui/badge/constants.ts
export const BadgeVariant = {
  Default: 'default',
  Secondary: 'secondary',
  Destructive: 'destructive',
  Outline: 'outline',
  Success: 'success',
  Warning: 'warning',
} as const satisfies Record<string, NonNullable<BadgeVariants['variant']>>;
```

The registry's own variant keys and classes stay as generated; only new keys are appended. Callers pass `variant={BadgeVariant.Success}` from `constants.ts`, never `variant="success"`.

### 3. Conditional classes (function export)

```ts
// features/orders/ui/order-row/styles.ts
import { cn } from '@/shared/lib/utils';

export const row = (isSelected: boolean) =>
  cn(
    'flex items-center gap-3 border-b border-border px-4 py-3',
    isSelected && 'bg-accent',
  );
```

```tsx
// features/orders/ui/order-row/order-row.tsx
import * as styles from './styles';

export const OrderRow = ({ order, isSelected }: OrderRowProps): JSX.Element => (
  <div className={styles.row(isSelected)}>
    <OrderSummary order={order} />
  </div>
);
```

The condition lives in `styles.ts`, so JSX never holds `isSelected ? 'bg-accent' : ''`.

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

## Motion

Motion has exactly one source: the shadcn bases.

- Dialog, drawer, sheet, popover, dropdown, tooltip, accordion, and the rest keep the registry’s open/close classes (`animate-in`, `animate-out`, `fade-*`, `zoom-*`, `slide-*`, `duration-*`, `data-[state=open|closed]:…`) verbatim in `shared/ui/<name>/styles.ts`. Stripping them leaves the element static.
- Those classes come from the animation stylesheet the CLI configured — `@import "tw-animate-css"` in global CSS on Tailwind v4. Read `package.json`, `components.json`, and the global CSS; do not add a second animation library or custom `@keyframes`. A missing package is a dependency to approve, not a class to delete.
- A `styles.ts` outside `shared/ui/` contains **no** motion utility: no `animate-*`, `transition-*`, `duration-*`, `delay-*`, `ease-*`, `fade-*`, `slide-*`, `zoom-*`. Added at a call site, these utilities override the primitive's `data-state` animation — the "strange" enter/exit and hover effects that differ from the shadcn docs.
- Prototype effects (`reveal`, `reveal-2`, `hover-lift`, staggered entrances) are not recreated.

## Call-site `className` on a primitive

A `className` passed to `@/shared/ui/<name>` is layout only — margin, width/height, grid or flex placement, gap. Color, radius, border, shadow, padding, typography, and motion belong to the base. When a screen needs a different look, add a variant to the base (`shared/ui/<name>/styles.ts` + `constants.ts`) through the shared-UI step.

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
- [ ] Overlay primitives keep their `data-[state=*]` / `animate-*` classes, and global CSS loads the matching animation stylesheet
- [ ] No motion utility in any `styles.ts` outside `shared/ui/`
- [ ] `className` on a `shared/ui` primitive is layout only — no color, radius, shadow, padding, or typography override
- [ ] No ternary in a `className` prop — conditional classes are `styles.ts` functions or `cva` variants

See [examples.md](examples.md) for few-shot templates.
