---
name: react-component
description: Scaffold a standalone React component folder with the mandatory files — kebab-case name.tsx (button.tsx, custom-button.tsx), styles.ts (required, no exceptions), index.ts, types.ts — following FSD layer conventions. Use when adding a single component outside a full feature slice or wrapping a shadcn primitive.
---

# React Component

## When to use

- Adding a single component to `shared/ui/` (generic, business-agnostic) or a feature's `ui/` folder (business-specific)
- Wrapping a shadcn/ui primitive in a reusable wrapper
- User asks to "create a component" or "scaffold a component"

For a full feature (api hooks + components + types), use the `react-feature` skill instead.

## Where it lives

| Component is... | Goes in |
|-----------------|---------|
| Generic, reused across features, no business meaning (`Button`, `DataTable`, `EmptyState`) | `src/shared/ui/{name}/` |
| Specific to one feature (`UserAvatar`, `OrderStatusBadge`) | `src/features/{feature}/ui/{name}/` |
| A route-level composition of feature components | Not this skill — belongs in `pages/`, thin, no folder of its own |

`{name}` is kebab-case of the PascalCase export: `Button` → `button/`, `CustomButton` → `custom-button/`, `OrderStatusBadge` → `order-status-badge/`.

If a component built inside a feature turns out to be needed by a second feature, promote it to `shared/ui/` rather than importing across features.

## Component folder structure (mandatory)

Every component lives in its own kebab-case folder. This is the required layout — no exceptions, including one-liners:

```
{TargetPath}/{name}/
├── index.ts                  — re-exports component and its props type
├── {name}.tsx                — JSX implementation (button.tsx, custom-button.tsx)
├── styles.ts                 — ALL Tailwind classes; never inline in JSX
├── types.ts                  — {Name}Props interface (optional but common)
├── {name}.test.tsx           — colocated RTL test (recommended)
└── {name}.stories.tsx        — Storybook story (recommended)
```

## Instructions

1. Determine the PascalCase export and kebab-case file stem (`CustomButton` / `custom-button`) and target path from the table above
2. Read rules: `architecture`, `component-structure`, `react`, `shadcn-usage`, `accessibility`
3. Create the component folder with the four core files (`index.ts`, `{name}.tsx`, `styles.ts`, `types.ts`)

## File templates

**`types.ts`:**
```ts
export interface {Name}Props {
  className?: string;
  // define props here
}
```

**`styles.ts` (mandatory — all Tailwind classes go here, never inline in JSX):**
```ts
// Static class strings
export const root = 'flex items-center gap-2 rounded-md';
export const label = 'text-sm font-medium text-foreground';

// Or with cva for variants
import { cva } from 'class-variance-authority';
export const root = cva('inline-flex items-center rounded-md', {
  variants: {
    size: { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-base' },
  },
  defaultVariants: { size: 'md' },
});
```

**`{name}.tsx`:**
```tsx
import { cn } from '@/shared/lib/utils';
import * as styles from './styles';
import type { {Name}Props } from './types';

export const {Name} = ({ className, /* destructure props */ }: {Name}Props) => {
  return (
    <div className={cn(styles.root, className)}>
      {/* component content */}
    </div>
  );
};
```

**`index.ts`:**
```ts
export { {Name} } from './{name}';
export type { {Name}Props } from './types';
```

## shadcn/ui wrapper pattern

When wrapping a shadcn primitive, spread props and merge `className` last via `cn()`. No `forwardRef` — React 19 passes `ref` as a plain prop:

```tsx
import { Button as ShadcnButton, type ButtonProps } from '@/components/ui/button';
import * as styles from './styles';

interface PrimaryButtonProps extends ButtonProps {
  className?: string;
}

export const PrimaryButton = ({ className, ref, ...props }: PrimaryButtonProps) => (
  <ShadcnButton
    ref={ref}
    className={cn(styles.root, className)}
    {...props}
  />
);
```

That wrapper lives at `shared/ui/primary-button/primary-button.tsx`.

## Four required data states for list-driven components

Any component that displays list or fetched data must handle all four states explicitly:

| State | What to render |
|-------|----------------|
| **loading** | Skeleton with the same layout as the loaded state |
| **error** | Informative message + retry action |
| **empty** | Intentional empty state — not a loading skeleton |
| **partial/stale** | Stale indicator while a background refetch resolves |

## Checklist

- [ ] Folder and files are kebab-case (`custom-button/custom-button.tsx`); the export is PascalCase (`CustomButton`)
- [ ] `styles.ts` exists — zero Tailwind classes inline in JSX
- [ ] `index.ts` re-exports component and its props type (not `export *`)
- [ ] Lives under `shared/ui/` if generic, or the owning feature's `ui/` if business-specific
- [ ] Root element merges caller `className` last via `cn()` — caller can always override
- [ ] No `forwardRef` — `ref` destructured as a plain prop (React 19)
- [ ] No business logic, data fetching, or TanStack Query calls inside a `shared/ui/` component
- [ ] Interactive elements have accessible names, visible focus, and keyboard support
- [ ] Component and its props type are exported from the parent slice's `index.ts`
- [ ] No `React.memo`/`useMemo`/`useCallback` added preemptively — React Compiler handles it
- [ ] Semantic token names only — no `text-slate-900`, no hex values, no `dark:` variants

See [examples.md](examples.md) for full worked examples.
